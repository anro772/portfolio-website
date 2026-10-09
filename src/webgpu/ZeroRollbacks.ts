import { clock, compute, draw, effect, frame, frameLoop, init, sampler, storage, surface, target, texture } from "vgpu";
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

/** Everything one quality tier owns. Built off-screen, swapped in whole, destroyed after. */
type Swarm = {
  tier: Tier;
  side: number;
  pos: [Texture, Texture];
  vel: [Texture, Texture];
  targetsA: StorageBuffer;
  targetsB: StorageBuffer;
  sim: Compute;
  particles: Draw;
  fills: number[];
  ping: number;
};

/**
 * Frame-health policy after vgpu's adaptive-quality example: only visible, running frames count,
 * any gap over 250 ms (tab switch, loop restart) resets the window, and a verdict needs 2 s of
 * active time. Presented FPS below 80% of 60 asks for the low tier, once.
 */
class FrameHealth {
  private duration = 0;
  private frames = 0;
  private warmup = 30;
  private decided = false;
  record(deltaMs: number): boolean {
    if (this.decided) return false;
    if (document.visibilityState !== "visible" || !(deltaMs > 0) || deltaMs > 250) {
      this.reset();
      return false;
    }
    // shader compilation and the first uploads land in the first frames; do not judge them
    if (this.warmup > 0) {
      this.warmup--;
      return false;
    }
    this.duration += deltaMs;
    this.frames++;
    if (this.duration < 2000) return false;
    const fps = (this.frames * 1000) / this.duration;
    this.duration = 0;
    this.frames = 0;
    if (fps < 48) {
      this.decided = true;
      return true;
    }
    return false;
  }
  reset() {
    this.duration = 0;
    this.frames = 0;
    this.warmup = Math.max(this.warmup, 10);
  }
}

export class ZeroRollbacks {
  private gpu!: Gpu;
  private out!: Surface;
  private hdr!: Target;
  private halfA!: Target;
  private halfB!: Target;
  private bright!: Effect;
  private blurH!: Effect;
  private blurV!: Effect;
  private composite!: Effect;
  private swarm!: Swarm;
  private swapping = false;
  private loop: FrameLoopHandle | null = null;
  private aspect = 1;
  private unsubResize: (() => void) | null = null;
  private retarget = 0;
  private time = 0;
  private health = new FrameHealth();

  private progress = 0;
  private fade = 1;
  private pointer = { x: 0, y: 0, vx: 0, vy: 0, active: 0, target: 0 };
  private tilt = { x: 0, y: 0, tx: 0, ty: 0 };
  private disposed = false;

  /** Called once on any GPU or encoding failure; the caller swaps in the static fallback. */
  onFail?: (err: unknown) => void;

  private constructor(private canvas: HTMLCanvasElement, private startTier: Tier) {}

  /** Throws (VGPU-RING1-UNSUPPORTED) when WebGPU is unavailable, so callers can fall back. */
  static async create(canvas: HTMLCanvasElement, tier: Tier) {
    const z = new ZeroRollbacks(canvas, tier);
    await z.setup();
    return z;
  }

  get tier() {
    return this.swarm.tier;
  }

  get running() {
    return this.loop !== null;
  }

  private fail(err: unknown) {
    if (this.disposed) return;
    console.error("[zero-rollbacks]", err);
    this.stop();
    this.onFail?.(err);
  }

  private async setup() {
    const gpu = (this.gpu = await init({ powerPreference: "high-performance" }));
    gpu.onError((err) => this.fail(err));
    this.out = surface(gpu, this.canvas, { dpr: this.startTier === "high" ? [1, 1.75] : 1 });
    const [w, h] = this.out.size;
    this.aspect = w / h;
    this.hdr = target(gpu, { size: [w, h], format: "rgba16float", label: "zr-hdr" });
    const half: [number, number] = [Math.max(1, w >> 1), Math.max(1, h >> 1)];
    this.halfA = target(gpu, { size: half, format: "rgba16float", label: "zr-half-a" });
    this.halfB = target(gpu, { size: half, format: "rgba16float", label: "zr-half-b" });

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

    await document.fonts.ready;
    this.swarm = await this.buildSwarm(this.startTier);
    this.unsubResize = this.out.onResize(({ width, height }) => this.resize(width, height));
    await gpu.settled();
  }

  private async buildSwarm(tier: Tier): Promise<Swarm> {
    const gpu = this.gpu;
    const n = SIDE[tier];
    const stateTex = (label: string) =>
      texture(gpu, {
        kind: "2d",
        size: [n, n],
        format: "rgba32float",
        usage: ["storage_binding", "texture_binding"],
        label,
      });
    const pos: [Texture, Texture] = [stateTex(`zr-${tier}-pos-0`), stateTex(`zr-${tier}-pos-1`)];
    const vel: [Texture, Texture] = [stateTex(`zr-${tier}-vel-0`), stateTex(`zr-${tier}-vel-1`)];
    const targetsA = storage(gpu, n * n * 16, "read");
    const targetsB = storage(gpu, n * n * 16, "read");
    const { a, b, fills } = buildTargets(n * n, this.aspect);
    targetsA.write(a);
    targetsB.write(b);

    const center = this.figureCenter();
    const seed = compute(gpu, INIT_WGSL, {
      label: `zr-${tier}-seed`,
      set: {
        // seed onto whatever the story currently shows, so a mid-story tier swap is seamless
        seed: { size: n, order: beats(this.progress).order, center, weights: [...beats(this.progress).w, 0] },
        posOut: pos[0],
        velOut: vel[0],
        targetsA,
        targetsB,
      },
    });
    seed.dispatch(Math.ceil(n / 8), Math.ceil(n / 8));

    const sim = compute(gpu, SIM_WGSL, {
      label: `zr-${tier}-sim`,
      set: {
        sim: {
          time: this.time,
          dt: 1 / 60,
          order: 0,
          turbulence: 1.4,
          weights: [1, 0, 0, 0],
          center,
          pointer: [0, 0],
          pointerVel: [0, 0],
          pointerActive: 0,
          size: n,
        },
        targetsA,
        targetsB,
      },
    });
    const particles = draw(gpu, {
      shader: PARTICLE_WGSL,
      label: `zr-${tier}-particles`,
      vertices: 6,
      instances: n * n,
      blend: "additive",
    });
    // pre-warm the pipeline against the HDR target so the swap never hitches
    await particles.compile(this.hdr);
    return { tier, side: n, pos, vel, targetsA, targetsB, sim, particles, fills, ping: 0 };
  }

  /** Prepare the low tier off-screen while high keeps rendering, then swap atomically. */
  private async downgrade() {
    if (this.swapping || this.swarm.tier === "low" || this.disposed) return;
    this.swapping = true;
    try {
      const next = await this.buildSwarm("low");
      if (this.disposed) return;
      const previous = this.swarm;
      this.swarm = next;
      for (const t of [...previous.pos, ...previous.vel]) t.destroy();
    } catch (err) {
      this.fail(err);
    } finally {
      this.swapping = false;
    }
  }

  private figureCenter(): [number, number] {
    // mirrors targets.ts layout: right of centre on wide screens, centred on portrait
    return this.aspect >= 1.15 ? [(0.6 * 2 - 1) * this.aspect, 1 - 0.47 * 2] : [0, 1 - 0.5 * 2];
  }

  /**
   * Even light density: the particle budget is spread over whatever area the current shape covers
   * (the loose nebula, or a figure), so a small glyph like "0" does not blow out to white.
   */
  private intensity(count: number, screenPx: number) {
    const { w, order } = beats(this.progress);
    const f = this.swarm.fills;
    const figure = w[0] * f[0] + w[1] * f[1] + w[2] * f[2];
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
    this.health.reset();
    const aspect = width / height;
    if (Math.abs(aspect - this.aspect) > 0.02) {
      this.aspect = aspect;
      // re-sampling the figures is a CPU scan; wait for the resize to settle
      window.clearTimeout(this.retarget);
      this.retarget = window.setTimeout(() => {
        if (this.disposed) return;
        const s = this.swarm;
        const { a, b, fills } = buildTargets(s.side * s.side, this.aspect);
        s.targetsA.write(a);
        s.targetsB.write(b);
        s.fills = fills;
        s.sim.set({ sim: { center: this.figureCenter() } });
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

  /** Run or pause the loop. Idempotent: safe to call on every visibility change. */
  setActive(active: boolean) {
    if (active) this.start();
    else this.stop();
  }

  start() {
    if (this.loop || this.disposed) return;
    const time = clock(this.gpu);
    this.health.reset();
    this.loop = frameLoop(this.gpu, (f) => {
      // a tick that throws would silently end the loop; surface it and fall back instead
      try {
        const raw = time.deltaTime * 1000;
        if (this.health.record(raw)) void this.downgrade();
        this.tick(f, Math.min(1 / 30, Math.max(1 / 240, time.deltaTime || 1 / 60)));
      } catch (err) {
        this.fail(err);
      }
    });
  }

  /** Dev inspection: run n fixed 60 Hz ticks synchronously (automation tabs throttle rAF). */
  advance(n: number) {
    for (let i = 0; i < n; i++) frame(this.gpu, (f) => this.tick(f, 1 / 60));
  }

  private tick(f: Frame, dt: number) {
    this.time += dt;
    const s = this.swarm;
    this.step(s, dt);
    const write = 1 - s.ping;
    s.particles.set({ posTex: s.pos[write], velTex: s.vel[write] });
    f.pass({ target: this.hdr, clear: [0, 0, 0, 1] }, s.particles);
    f.pass(this.halfA, this.bright);
    f.pass(this.halfB, this.blurH);
    f.pass(this.halfA, this.blurV);
    f.pass(this.out, this.composite);
    s.ping = write;
  }

  private step(s: Swarm, dt: number) {
    const { w, order, stage3 } = beats(this.progress);
    const p = this.pointer;
    p.active += (p.target - p.active) * 0.12;
    const clampV = (v: number) => Math.max(-4, Math.min(4, v / dt));
    const vel = [clampV(p.vx) * 0.15, clampV(p.vy) * 0.15];
    p.vx = 0;
    p.vy = 0;
    this.tilt.x += (this.tilt.tx - this.tilt.x) * 0.06;
    this.tilt.y += (this.tilt.ty - this.tilt.y) * 0.06;

    const read = s.ping;
    const write = 1 - read;
    s.sim.set({
      sim: {
        time: this.time,
        dt,
        order,
        weights: [w[0], w[1], w[2], 0],
        pointer: [p.x, p.y],
        pointerVel: vel,
        pointerActive: p.active,
      },
      posIn: s.pos[read],
      velIn: s.vel[read],
      posOut: s.pos[write],
      velOut: s.vel[write],
    });
    s.sim.dispatch(Math.ceil(s.side / 8), Math.ceil(s.side / 8));

    const [width, height] = this.out.size;
    s.particles.set({
      view: {
        aspect: this.aspect,
        size: s.side,
        intensity: this.intensity(s.side * s.side, width * height),
        stage3,
        tilt: [this.tilt.x, this.tilt.y],
        pxToClip: [2 / width, 2 / height],
        dpr: this.out.dpr,
        fade: 1,
      },
    });
    this.composite.set({ comp: { fade: this.fade } });
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
