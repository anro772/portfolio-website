import type { Project } from "../data/cv";

const RAMP = " .:-=+*#%@";

type Pattern = Project["pattern"];

/** Intensity 0..1 for a cell, per project pattern. u,v in -1..1, t in seconds. */
function field(pattern: Pattern, u: number, v: number, t: number, seed: number): number {
  const r = Math.hypot(u, v);
  const a = Math.atan2(v, u);
  switch (pattern) {
    case "rings": // shielded core: concentric layers
      return 0.5 + 0.5 * Math.sin(r * 16 - t * 2.2) * Math.exp(-r * 1.2) + (r < 0.22 ? 0.4 : 0);
    case "wave": // signal between peers
      return Math.exp(-Math.pow(v - 0.45 * Math.sin(u * 4 + t * 2) * Math.cos(u * 1.3 - t), 2) * 18) +
        0.6 * Math.exp(-Math.pow(v + 0.45 * Math.sin(u * 4 - t * 2 + 1.4), 2) * 22);
    case "bars": { // encoder meters
      const col = Math.floor((u + 1) * 12);
      const h = 0.5 + 0.45 * Math.sin(col * 1.7 + t * 3 + seed) * Math.cos(col * 0.4 - t * 1.3);
      return (1 - (v + 1) / 2) < h ? 0.4 + 0.6 * (1 - (v + 1) / 2) : 0.04;
    }
    case "scan": { // computer-vision sweep
      const line = Math.exp(-Math.pow(u - Math.sin(t * 0.9) * 0.95, 2) * 60);
      const frames = (Math.floor((u + 1) * 5) + Math.floor((v + 1) * 3)) % 2 ? 0.18 : 0.32;
      return frames + line * 0.8;
    }
    case "grid": { // quiz tiles
      const cx = Math.floor((u + 1) * 4), cy = Math.floor((v + 1) * 3);
      const on = Math.sin(cx * 3.1 + cy * 7.7 + Math.floor(t * 1.5) * 1.3 + seed) > 0.2;
      const fu = ((u + 1) * 4) % 1, fv = ((v + 1) * 3) % 1;
      const border = fu < 0.12 || fv < 0.15;
      return border ? 0.05 : on ? 0.85 : 0.22;
    }
    case "noise": { // memory dump / signatures
      const n = Math.sin(Math.floor(u * 14) * 12.9898 + Math.floor(v * 9) * 78.233 + Math.floor(t * 4) * 0.37 + seed) * 43758.5453;
      return (n - Math.floor(n)) * 0.9;
    }
    case "orbit": // gamma ramp, per-monitor
      return 0.5 + 0.5 * Math.sin(a * 3 + r * 6 - t * 1.5) * Math.exp(-Math.abs(r - 0.6) * 3);
  }
}

export class GlyphField {
  private ctx: CanvasRenderingContext2D;
  private cols = 0;
  private rows = 0;
  private cw = 9;
  private ch = 14;
  private dpr = Math.min(window.devicePixelRatio, 2);

  constructor(private canvas: HTMLCanvasElement, private pattern: Pattern, private seed: number) {
    this.ctx = canvas.getContext("2d")!;
    this.resize();
  }

  setPattern(pattern: Pattern, seed: number) {
    this.pattern = pattern;
    this.seed = seed;
  }

  resize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.canvas.width = w * this.dpr;
    this.canvas.height = h * this.dpr;
    this.cols = Math.ceil(w / this.cw);
    this.rows = Math.ceil(h / this.ch);
  }

  draw(t: number, hot: number) {
    const { ctx, cols, rows, cw, ch, dpr } = this;
    if (!cols) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cols * cw, rows * ch);
    ctx.font = `500 ${ch * 0.85}px "Geist Mono Variable", ui-monospace, monospace`;
    ctx.textBaseline = "top";
    const aspect = (cols * cw) / (rows * ch);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const u = ((x / cols) * 2 - 1) * aspect;
        const v = (y / rows) * 2 - 1;
        const f = Math.max(0, Math.min(0.999, field(this.pattern, u / aspect, v, t, this.seed)));
        const ci = Math.floor(f * RAMP.length);
        if (ci === 0) continue;
        const accent = f > 0.72 - hot * 0.25;
        ctx.fillStyle = accent ? "#ff5a1f" : `rgba(236,234,228,${0.18 + f * 0.6})`;
        ctx.fillText(RAMP[ci], x * cw, y * ch);
      }
    }
  }
}
