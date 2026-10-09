import {
  clock,
  compute,
  draw,
  effect,
  frameLoop,
  init,
  sampler,
  storage,
  surface,
  target,
  texture,
  frame,
} from "vgpu";
import type { Compute, Draw, Effect, Frame, FrameLoopHandle, Gpu, StorageBuffer, Surface, Target, Texture } from "vgpu";
import { buildTargets } from "./targets";
import { BLUR_WGSL, BRIGHT_WGSL, COMPOSITE_WGSL, INIT_WGSL, PARTICLE_WGSL, SIM_WGSL } from "./shaders";

export type Tier = "high" | "low";
const SIDE: Record<Tier, number> = { high: 512, low: 256 };
// page ink #0c0c0d, written straight into the sRGB output
const INK = [12 / 255, 12 / 255, 13 / 255];

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Story beats from scroll progress p in [0, 3]:
 * 0..1 noise condenses into "30+", 1..2 bursts and re-forms as "100+", 2..3 collapses into "0".
 */
export function beats(p: number) {
  const w = [0, 0, 0];
  let order: number;
  if (p < 1) {
    w[0] = 1;
    order = smooth(0.12, 0.8, p);
  } else {
    // s = 1: between 30+ and 100+; s = 2: between 100+ and 0
    const s = Math.min(2, Math.floor(p));
    const f = Math.min(1, p - s);
    const k = smooth(0.38, 0.62, f);
    w[s - 1] = 1 - k;
    w[s] = k;
    // order dips mid-transition: the figure bursts, then re-forms
    order = 1 - 0.78 * Math.sin(Math.PI * smooth(0.1, 0.9, f));
  }
  return { w, order, stage3: smooth(2.55, 2.95, p) };
}

export class ZeroRollbacks {
  private gpu!: Gpu;
  private out!: Surface;
  private hdr!: Target;
  private halfA!: Target;
  private halfB!: Target;
  private pos!: [Texture, Texture];
  private vel!: [Texture, Texture];
  private targetsA!: StorageBuffer;
  private targetsB!: StorageBuffer;
  private seed!: Compute;
  private sim!: Compute;
  private particles!: Draw;
  private bright!: Effect;
  private blurH!: Effect;
  private blurV!: Effect;
  private composite!: Effect;
  private loop: FrameLoopHandle | null = null;
  private ping = 0;
  private side: number;
  private aspect = 1;
  private unsubResize: (() => void) | null = null;
  private retarget = 0;
  private time = 0;
  private fills = [0.08, 0.08, 0.05];

  private progress = 0;
  private fade = 1;
  private pointer = { x: 0, y: 0, vx: 0, vy: 0, active: 0, target: 0 };
  private tilt = { x: 0, y: 0, tx: 0, ty: 0 };
  private frames: number[] = [];
  private judged = false;
  private disposed = false;

  onSlow?: () => void;
  onFail?: (err: unknown) => void;

  private constructor(private canvas: HTMLCanvasElement, private tier: Tier) {
    this.side = SIDE[tier];
  }

  /** Throws (VGPU-RING1-UNSUPPORTED) when WebGPU is unavailable, so callers can fall back. */
  static async create(canvas: HTMLCanvasElement, tier: Tier) {
    const z = new ZeroRollbacks(canvas, tier);
    await z.setup();
    return z;
  }

  private async setup() {
    const gpu = (this.gpu = await init({ powerPreference: "high-performance" }));
    gpu.onError((err) => {
      this.stop();
      this.onFail?.(err);
    });
    const n = this.side;
    this.out = surface(gpu, this.canvas, { dpr: this.tier === "high" ? [1, 1.75] : 1 });
    const [w, h] = this.out.size;
    this.hdr = target(gpu, { size: [w, h], format: "rgba16float", label: "zr-hdr" });
    const half: [number, number] = [Math.max(1, w >> 1), Math.max(1, h >> 1)];
    this.halfA = target(gpu, { size: half, format: "rgba16float", label: "zr-half-a" });
    this.halfB = target(gpu, { size: half, format: "rgba16float", label: "zr-half-b" });

    const stateTex = (label: string) =>
      texture(gpu, {
        kind: "2d",
        size: [n, n],
        format: "rgba32float",
        usage: ["storage_binding", "texture_binding"],
        label,
      });
    this.pos = [stateTex("zr-pos-0"), stateTex("zr-pos-1")];
    this.vel = [stateTex("zr-vel-0"), stateTex("zr-vel-1")];
    const bytes = n * n * 16;
    this.targetsA = storage(gpu, bytes, "read");
    this.targetsB = storage(gpu, bytes, "read");

    this.aspect = w / h;
    await document.fonts.ready;
    this.writeTargets();

    const center = this.figureCenter();
    this.seed = compute(gpu, INIT_WGSL, {
      label: "zr-seed",
      set: { seed: { size: n, aspect: this.aspect, center }, posOut: this.pos[0], velOut: this.vel[0] },
    });
    this.seed.dispatch(Math.ceil(n / 8), Math.ceil(n / 8));

    this.sim = compute(gpu, SIM_WGSL, {
      label: "zr-sim",
      set: {
        sim: {
          time: 0,
          dt: 0.016,
          order: 0,
          turbulence: 1.4,
          weights: [1, 0, 0, 0],
          center,
          pointer: [0, 0],
          pointerVel: [0, 0],
          pointerActive: 0,
          size: n,
        },
        targetsA: this.targetsA,
        targetsB: this.targetsB,
      },
    });

    this.particles = draw(gpu, {
      shader: PARTICLE_WGSL,
      label: "zr-particles",
      vertices: 6,
      instances: n * n,
      blend: "additive",
      set: { view: this.viewUniform() },
    });

    const linear = sampler(gpu, { minFilter: "linear", magFilter: "linear" });
    this.bright = effect(gpu, BRIGHT_WGSL, { label: "zr-bright", set: { src: this.hdr, samp: linear } });
    this.blurH = effect(gpu, BLUR_WGSL, {
      label: "zr-blur-h",
      set: { blur: { step: [1 / half[0], 0] }, src: this.halfA, samp: linear },
    });
    this.blurV = effect(gpu, BLUR_WGSL, {
      label: "zr-blur-v",
      set: { blur: { step: [0, 1 / half[1]] }, src: this.halfB, samp: linear },
    });
    this.composite = effect(gpu, COMPOSITE_WGSL, {
      label: "zr-composite",
      set: { comp: { bloom: 1.25, fade: 1, ink: INK }, scene: this.hdr, glow: this.halfA, samp: linear },
    });

    this.unsubResize = this.out.onResize(({ width, height }) => this.resize(width, height));
    await gpu.settled();
  }

  private figureCenter(): [number, number] {
    // mirrors targets.ts layout: right of centre on wide screens, upper centre on portrait
    return this.aspect >= 1.15 ? [(0.6 * 2 - 1) * this.aspect, 1 - 0.47 * 2] : [0, 1 - 0.5 * 2];
  }

  private writeTargets() {
    const { a, b, fills } = buildTargets(this.side * this.side, this.aspect);
    this.fills = fills;
    this.targetsA.write(a);
    this.targetsB.write(b);
  }

  private viewUniform() {
    const [w, h] = this.out.size;
    const count = this.side * this.side;
    return {
      aspect: this.aspect,
      size: this.side,
      intensity: this.intensity(count, w * h),
      stage3: beats(this.progress).stage3,
      tilt: [this.tilt.x, this.tilt.y],
      pxToClip: [2 / w, 2 / h],
      dpr: this.out.dpr,
      fade: 1,
    };
  }

  /**
   * Even light density: the particle budget is spread over whatever area the current shape covers
   * (the loose nebula, or a figure), so a small glyph like "0" does not blow out to white.
   */
  private intensity(count: number, screenPx: number) {
    const { w, order } = beats(this.progress);
    const figure = w[0] * this.fills[0] + w[1] * this.fills[1] + w[2] * this.fills[2];
    const area = (0.24 + (figure - 0.24) * order) * screenPx;
    const dotPx = Math.pow(1.5 * this.out.dpr, 2) * 0.6;
    return Math.min(1.2, (1.15 * area) / (count * dotPx));
  }

  private resize(width: number, height: number) {
    if (!this.hdr) return;
    this.hdr.resize([width, height]);
    const half: [number, number] = [Math.max(1, width >> 1), Math.max(1, height >> 1)];
    this.halfA.resize(half);
    this.halfB.resize(half);
    this.blurH.set({ blur: { step: [1 / half[0], 0] } });
    this.blurV.set({ blur: { step: [0, 1 / half[1]] } });
    const aspect = width / height;
    if (Math.abs(aspect - this.aspect) > 0.02) {
      this.aspect = aspect;
      // re-sampling the figures is a CPU scan; wait for the resize to settle
      window.clearTimeout(this.retarget);
      this.retarget = window.setTimeout(() => {
        if (this.disposed) return;
        this.writeTargets();
        this.sim.set({ sim: { center: this.figureCenter() } });
      }, 220);
    }
  }

  /** Scroll progress in [0, 3]. */
  setProgress(p: number) {
    this.progress = Math.min(3, Math.max(0, p));
  }

  /** 1 while pinned, easing to 0 as the section leaves. */
  setFade(f: number) {
    this.fade = f;
  }

  /** Pointer in client pixels relative to the canvas; null when it leaves. */
  setPointer(x: number | null, y: number | null) {
    const r = this.canvas.getBoundingClientRect();
    if (x === null || y === null || !r.width) {
      this.pointer.target = 0;
      this.tilt.tx = this.tilt.ty = 0;
      return;
    }
    const wx = ((x / r.width) * 2 - 1) * this.aspect;
    const wy = 1 - (y / r.height) * 2;
    if (this.pointer.target === 0) {
      this.pointer.x = wx;
      this.pointer.y = wy;
    }
    this.pointer.target = 1;
    // accumulate travel since the last sim step; step() turns it into a velocity
    this.pointer.vx += wx - this.pointer.x;
    this.pointer.vy += wy - this.pointer.y;
    this.pointer.x = wx;
    this.pointer.y = wy;
    this.tilt.tx = ((x / r.width) * 2 - 1) * 0.16;
    this.tilt.ty = ((y / r.height) * 2 - 1) * 0.1;
  }

  start() {
    if (this.loop || this.disposed) return;
    const time = clock(this.gpu);
    this.loop = frameLoop(this.gpu, (f) => {
      const dt = Math.min(1 / 30, Math.max(1 / 240, time.deltaTime || 1 / 60));
      this.judge(dt);
      this.tick(f, dt);
    });
  }

  /** Dev inspection: run n fixed 60 Hz ticks synchronously (automation tabs throttle rAF). */
  advance(n: number) {
    for (let i = 0; i < n; i++) frame(this.gpu, (f) => this.tick(f, 1 / 60));
  }

  private tick(f: Frame, dt: number) {
    this.time += dt;
    this.step(dt);
    const write = 1 - this.ping;
    this.particles.set({ posTex: this.pos[write], velTex: this.vel[write] });
    f.pass({ target: this.hdr, clear: [0, 0, 0, 1] }, this.particles);
    f.pass(this.halfA, this.bright);
    f.pass(this.halfB, this.blurH);
    f.pass(this.halfA, this.blurV);
    f.pass(this.out, this.composite);
    this.ping = write;
  }

  private step(dt: number) {
    const { w, order, stage3 } = beats(this.progress);
    const p = this.pointer;
    p.active += (p.target - p.active) * 0.12;
    const clampV = (v: number) => Math.max(-4, Math.min(4, v / dt));
    const vel = [clampV(p.vx) * 0.15, clampV(p.vy) * 0.15];
    p.vx = 0;
    p.vy = 0;
    this.tilt.x += (this.tilt.tx - this.tilt.x) * 0.06;
    this.tilt.y += (this.tilt.ty - this.tilt.y) * 0.06;

    const read = this.ping;
    const write = 1 - read;
    this.sim.set({
      sim: {
        time: this.time,
        dt,
        order,
        weights: [w[0], w[1], w[2], 0],
        pointer: [p.x, p.y],
        pointerVel: vel,
        pointerActive: p.active,
      },
      posIn: this.pos[read],
      velIn: this.vel[read],
      posOut: this.pos[write],
      velOut: this.vel[write],
    });
    this.sim.dispatch(Math.ceil(this.side / 8), Math.ceil(this.side / 8));

    const view = this.viewUniform();
    this.particles.set({ view: { ...view, stage3, fade: 1 } });
    this.composite.set({ comp: { fade: this.fade } });
  }

  /** Downgrade once: if the first ~90 frames average over 22 ms, ask for the low tier. */
  private judge(dt: number) {
    if (this.judged || this.tier === "low") return;
    this.frames.push(dt);
    if (this.frames.length < 90) return;
    this.judged = true;
    const avg = this.frames.slice(20).reduce((a, b) => a + b, 0) / (this.frames.length - 20);
    if (avg > 0.022) this.onSlow?.();
  }

  stop() {
    this.loop?.stop();
    this.loop = null;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    window.clearTimeout(this.retarget);
    this.unsubResize?.();
    this.out?.dispose();
    this.gpu?.dispose();
  }
}
