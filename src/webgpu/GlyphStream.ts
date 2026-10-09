import { clock, draw, frameLoop, init, sampler, surface, texture } from "vgpu";
import type { Draw, FrameLoopHandle, Gpu, Surface, Texture } from "vgpu";

/** Same ramp as the portrait; the dense tail (indices 11..15) is what the hero sheds. */
export const STREAM_RAMP = " .,:;-=+*cox%#&@";
const COLS = 128; // instances per row of the instance texture
const TEXELS = 3; // texels per instance

const WGSL = /* wgsl */ `
struct U {
  progress: f32,
  scrollY: f32,
  time: f32,
  fade: f32,
  viewport: vec2f,   // CSS px
  cell: vec2f,       // one portrait cell, CSS px
  glyphs: f32,
  cols: f32,
}
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var inst: texture_2d<f32>;
@group(0) @binding(2) var atlas: texture_2d<f32>;
@group(0) @binding(3) var samp: sampler;

struct Out {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) color: vec3f,
  @location(2) alpha: f32,
}

fn ease(t: f32) -> f32 {
  if (t < 0.5) { return 4.0 * t * t * t; }
  let k = -2.0 * t + 2.0;
  return 1.0 - k * k * k * 0.5;
}
fn bez(a: vec2f, b: vec2f, c: vec2f, d: vec2f, t: f32) -> vec2f {
  let s = 1.0 - t;
  return a * s * s * s + b * 3.0 * s * s * t + c * 3.0 * s * t * t + d * t * t * t;
}

@vertex fn vs_main(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> Out {
  let cols = u32(u.cols);
  let base = vec2u((ii % cols) * ${TEXELS}u, ii / cols);
  let t0 = textureLoad(inst, base, 0);
  let t1 = textureLoad(inst, base + vec2u(1u, 0u), 0);
  let t2 = textureLoad(inst, base + vec2u(2u, 0u), 0);
  let src = t0.xy;
  let dst = t0.zw;
  let seed = t2.x;
  let start = t2.y;

  // each glyph's flight is a pure function of scroll progress: fully reversible
  let lt = clamp((u.progress - start) / (0.42 + seed * 0.1), 0.0, 1.0);
  let e = ease(lt);
  let sway = (seed - 0.5) * u.viewport.x * 0.42;
  let drop = dst.y - src.y;
  let p1 = src + vec2f(sway * 0.7, drop * 0.18 + 40.0);
  let p2 = dst + vec2f(-sway * 0.35, -drop * 0.32);
  var p = bez(src, p1, p2, dst, e);
  let flight = sin(lt * 3.14159265);
  p.x += flight * sin(u.time * 2.2 + seed * 40.0) * 12.0;

  var corners = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
    vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0));
  let c = corners[vi];
  let scale = 1.0 + flight * 0.35;
  let ang = flight * (seed - 0.5) * 2.6;
  let local = (c - 0.5) * u.cell * scale;
  let rot = vec2f(local.x * cos(ang) - local.y * sin(ang), local.x * sin(ang) + local.y * cos(ang));
  let screen = p - vec2f(0.0, u.scrollY) + u.cell * 0.5 + rot;
  let ndc = vec2f(screen.x / u.viewport.x * 2.0 - 1.0, 1.0 - screen.y / u.viewport.y * 2.0);

  // a dense hero glyph on departure, its own portrait glyph from mid-flight on
  let heroGlyph = 11.0 + floor(seed * 4.99);
  let g = select(t1.a, heroGlyph, lt < 0.5);

  let bone = vec3f(0.86, 0.85, 0.82);
  let hot = vec3f(1.0, 0.42, 0.18);
  var col = mix(bone, t1.rgb, smoothstep(0.35, 0.9, lt));
  col = mix(col, hot, flight * 0.35);

  var out: Out;
  out.position = vec4f(ndc, 0.0, 1.0);
  out.uv = vec2f((g + c.x) / u.glyphs, c.y);
  out.color = col;
  out.alpha = smoothstep(start - 0.06, start, u.progress) * u.fade;
  return out;
}

@fragment fn fs_main(in: Out) -> @location(0) vec4f {
  let a = textureSampleLevel(atlas, samp, in.uv, 0.0).a * in.alpha;
  return vec4f(in.color * a, a);
}
`;

export type StreamCell = { ch: string; x: number; y: number; r: number; g: number; b: number };

/**
 * Hero glyphs pouring into the portrait. One Gpu, one surface, one frame loop that only runs
 * mid-transition (0 < progress < 1); everything else is static data uploaded on aim().
 */
export class GlyphStream {
  private gpu!: Gpu;
  private out!: Surface;
  private atlas: Texture | null = null;
  private inst: Texture | null = null;
  private drawing: Draw | null = null;
  private linear!: GPUSampler;
  private count = 0;
  private cell: [number, number] = [7, 11];
  private loop: FrameLoopHandle | null = null;
  // playback chases the scroll target at a capped, eased rate, so even a fast flick plays out
  private target = 0;
  private progress = 0;
  private fade = 1;
  private static MAX_RATE = 0.42; // progress per second: a full pour takes at least ~2.4 s
  /** Called with the played-back progress each frame (drives the hero dissolve and portrait reveal). */
  onShown?: (p: number) => void;
  private disposed = false;
  onFail?: (err: unknown) => void;

  private constructor() {}

  static async create(canvas: HTMLCanvasElement) {
    const s = new GlyphStream();
    s.gpu = await init();
    s.gpu.onError((err) => s.fail(err));
    s.out = surface(s.gpu, canvas, { dpr: [1, 2] });
    s.linear = sampler(s.gpu, { minFilter: "linear", magFilter: "linear" });
    return s;
  }

  private fail(err: unknown) {
    if (this.disposed) return;
    console.error("[glyph-stream]", err);
    this.stop();
    this.onFail?.(err);
  }

  /** Glyph atlas in the portrait's own font and cell proportions, uploaded once per cell size. */
  private buildAtlas(cellW: number, cellH: number) {
    const scale = 4;
    const w = Math.ceil(cellW * scale);
    const h = Math.ceil(cellH * scale);
    const c = document.createElement("canvas");
    c.width = w * STREAM_RAMP.length;
    c.height = h;
    const ctx = c.getContext("2d")!;
    ctx.font = `500 ${Math.round(cellH * 0.92) * scale}px "Geist Mono Variable", ui-monospace, monospace`;
    ctx.textBaseline = "top";
    ctx.fillStyle = "#fff";
    [...STREAM_RAMP].forEach((ch, i) => ctx.fillText(ch, i * w, 0));
    this.atlas?.destroy();
    const tex = texture(this.gpu, {
      kind: "2d",
      size: [c.width, c.height],
      format: "rgba8unorm",
      usage: ["texture_binding", "copy_dst", "render_attachment"],
      label: "stream-atlas",
    });
    // vgpu has no image-upload helper; its Texture exposes the raw GPUTexture for this
    this.gpu.gpu.queue.copyExternalImageToTexture({ source: c }, { texture: tex.gpu }, [c.width, c.height]);
    this.atlas = tex;
  }

  /**
   * Upload where every glyph starts (inside the hero object) and lands (its portrait cell),
   * both in page CSS px.
   */
  aim(cells: StreamCell[], cellW: number, cellH: number, region: { x: number; y: number; radius: number }) {
    if (this.disposed || !cells.length) return;
    if (!this.atlas || cellW !== this.cell[0] || cellH !== this.cell[1]) this.buildAtlas(cellW, cellH);
    this.cell = [cellW, cellH];

    const n = cells.length;
    const rows = Math.ceil(n / COLS);
    const width = COLS * TEXELS;
    const data = new Float32Array(width * rows * 4);
    let minY = Infinity,
      maxY = -Infinity;
    for (const c of cells) {
      minY = Math.min(minY, c.y);
      maxY = Math.max(maxY, c.y);
    }
    for (let i = 0; i < n; i++) {
      const c = cells[i];
      const o = ((Math.floor(i / COLS) * width) + (i % COLS) * TEXELS) * 4;
      // start somewhere inside the object's silhouette
      const a = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random());
      data[o] = region.x + Math.cos(a) * rr * region.radius * 1.15;
      data[o + 1] = region.y + Math.sin(a) * rr * region.radius * 0.8;
      data[o + 2] = c.x;
      data[o + 3] = c.y;
      data[o + 4] = c.r;
      data[o + 5] = c.g;
      data[o + 6] = c.b;
      data[o + 7] = Math.max(0, STREAM_RAMP.indexOf(c.ch));
      const seed = Math.random();
      data[o + 8] = seed;
      // top rows of the portrait leave first, with scatter so it pours rather than marches
      const row = (c.y - minY) / Math.max(1, maxY - minY);
      data[o + 9] = 0.03 + (row * 0.7 + Math.random() * 0.3) * 0.44;
    }

    if (!this.inst || this.count !== n) {
      this.inst?.destroy();
      this.inst = texture(this.gpu, {
        kind: "2d",
        size: [width, rows],
        format: "rgba32float",
        usage: ["texture_binding", "copy_dst"],
        label: "stream-instances",
      });
      this.drawing = draw(this.gpu, {
        shader: WGSL,
        label: "stream-glyphs",
        vertices: 6,
        instances: n,
        blend: "premultiplied",
      });
      this.count = n;
    }
    this.gpu.gpu.queue.writeTexture({ texture: this.inst.gpu }, data, { bytesPerRow: width * 16 }, [width, rows]);
    this.drawing!.set({
      inst: this.inst,
      atlas: this.atlas!,
      samp: this.linear,
      u: {
        progress: this.progress,
        scrollY: window.scrollY,
        time: 0,
        fade: this.fade,
        viewport: [window.innerWidth, window.innerHeight],
        cell: [cellW, cellH],
        glyphs: STREAM_RAMP.length,
        cols: COLS,
      },
    });
  }

  /** Scroll target in [0, 1]; the loop runs until playback has caught up and the stream is at rest. */
  setTarget(p: number) {
    this.target = Math.min(1, Math.max(0, p));
    if (this.target !== this.progress) this.start();
  }

  private advance(dt: number) {
    const diff = this.target - this.progress;
    let step = diff * (1 - Math.exp(-dt * 3.2));
    const cap = GlyphStream.MAX_RATE * dt;
    step = Math.max(-cap, Math.min(cap, step));
    this.progress = Math.abs(diff) < 1e-4 ? this.target : this.progress + step;
    const t = Math.min(1, Math.max(0, (this.progress - 0.88) / 0.12));
    this.fade = 1 - t * t * (3 - 2 * t);
    this.onShown?.(this.progress);
    if (this.progress === this.target && (this.progress <= 0 || this.progress >= 1)) this.stop();
  }

  private start() {
    if (this.loop || this.disposed || !this.drawing) return;
    const time = clock(this.gpu);
    this.loop = frameLoop(this.gpu, (f) => {
      try {
        this.advance(Math.min(0.05, time.deltaTime || 1 / 60));
        this.drawing!.set({
          u: {
            progress: this.progress,
            scrollY: window.scrollY,
            time: time.time,
            fade: this.fade,
            viewport: [window.innerWidth, window.innerHeight],
          },
        });
        f.pass({ target: this.out, clear: [0, 0, 0, 0] }, this.drawing!);
      } catch (err) {
        this.fail(err);
      }
    });
  }

  private stop() {
    this.loop?.stop();
    this.loop = null;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.atlas?.destroy();
    this.inst?.destroy();
    this.out?.dispose();
    this.gpu?.dispose();
  }
}
