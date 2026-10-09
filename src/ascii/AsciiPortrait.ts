/**
 * Redraws a photo entirely as text. Each cell picks a glyph by the brightness underneath.
 * It types itself in once the image has loaded, settles into a two-colour duotone with the colour arriving
 * a beat behind, and a click sweeps the characters out to the photo's own colours and back.
 */

const RAMP = " .,:;-=+*cox%#&@";
const NOISE = "01<>/\\[]{}#*+=";

/** z: depth in -0.5..1, the wall sits behind, bright features sit nearest */
type Cell = { ch: string; v: number; z: number; r: number; g: number; b: number };

const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const DUO_LO = hex("#ff5a1f");
const DUO_HI = hex("#eceae4");
const MONO = hex("#8a8984");

// room around the grid so parallaxed glyphs never clip
const PAD = 24;

const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export class AsciiPortrait {
  private canvas = document.createElement("canvas");
  private ctx = this.canvas.getContext("2d")!;
  private img = new Image();
  private cells: Cell[] = [];
  private cols = 0;
  private rows = 0;
  private cw = 7;
  private ch = 11;
  private dpr = Math.min(window.devicePixelRatio, 2);
  private raf = 0;
  private startedAt = 0;
  // explicit flag: "already finished" start times are negative early in a page load
  private started = false;
  private sweepFrom = 1;
  private sweepTo = 1;
  private sweepAt = -1e9;
  private trueColor = true;
  private pointer = { x: -1e4, y: -1e4, inside: false };
  // parallax tilt, -1..1 on each axis, eased toward the target inside draw()
  private tilt = { tx: 0, ty: 0, x: 0, y: 0 };
  private ready = false;
  private visible = false;
  private io: IntersectionObserver;
  private ro: ResizeObserver;
  onToggle?: (trueColor: boolean) => void;
  /** Fires after every re-layout (resize), so the glyph stream can re-aim at the new cells. */
  onLayout?: () => void;
  private streamMode = false;

  static TYPE_MS = 1500;
  static COLOR_DELAY = 550;
  static SWEEP_MS = 1100;

  constructor(private host: HTMLElement, src: string, private instant = false) {
    this.canvas.style.cssText = `display:block;margin:-${PAD}px`;
    this.canvas.setAttribute("role", "img");
    this.canvas.setAttribute("aria-label", "Portrait of Andrei Stefan drawn in text characters");
    host.appendChild(this.canvas);

    this.img.decoding = "async";
    this.img.onload = () => {
      this.ready = true;
      this.layout();
      if (this.streamMode) this.setStreamMode(true);
      this.maybeStart();
      this.onLayout?.();
    };
    this.img.src = src;

    this.ro = new ResizeObserver(() => {
      if (!this.ready) return;
      this.layout();
      this.draw(performance.now());
      this.onLayout?.();
    });
    this.ro.observe(host);

    this.io = new IntersectionObserver(
      ([e]) => {
        this.visible = e.isIntersecting;
        this.maybeStart();
      },
      { threshold: 0.25 },
    );
    this.io.observe(host);

    host.addEventListener("pointermove", this.onMove);
    host.addEventListener("pointerleave", this.onLeave);
  }

  private maybeStart() {
    if (!this.ready || !this.visible || this.started) return;
    this.started = true;
    this.startedAt = this.instant || this.streamMode ? performance.now() - 1e5 : performance.now();
    this.kick();
  }

  get isReady() {
    return this.ready && this.cols > 0;
  }

  /**
   * Stream mode: the glyph stream assembles the portrait, so skip the type-in and start invisible;
   * visibility then follows the stream. Turning it off restores the normal intro.
   */
  setStreamMode(on: boolean) {
    this.streamMode = on;
    if (on) {
      if (!this.started && this.ready) {
        this.started = true;
        this.startedAt = performance.now() - 1e5;
        this.kick();
      }
      this.canvas.style.opacity = "0";
    } else {
      this.canvas.style.opacity = "";
      this.maybeStart();
    }
  }

  /** 0..1 opacity of the real canvas while the stream lands. */
  setVisibility(t: number) {
    if (!this.streamMode) return;
    this.canvas.style.opacity = String(Math.min(1, Math.max(0, t)));
  }

  /**
   * Every visible glyph at rest, in page CSS px (top-left of its cell), with the colour it is drawn in
   * right now (duotone or true colour).
   */
  getCells() {
    const rect = this.canvas.getBoundingClientRect();
    const ox = rect.left + window.scrollX + PAD;
    const oy = rect.top + window.scrollY + PAD;
    const out: { ch: string; x: number; y: number; r: number; g: number; b: number }[] = [];
    const truth = this.trueColor ? 1 : 0;
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      if (c.ch === " ") continue;
      const x = i % this.cols;
      const y = (i / this.cols) | 0;
      const fog = c.z < 0 ? 0.55 : 0.8 + c.z * 0.2;
      const duo = (k: number) => DUO_LO[k] + (DUO_HI[k] - DUO_LO[k]) * c.v;
      const tc = [c.r, c.g, c.b].map((v) => Math.min(255, v * 1.12));
      out.push({
        ch: c.ch,
        x: ox + x * this.cw,
        y: oy + y * this.ch,
        r: ((duo(0) + (tc[0] - duo(0)) * truth) * fog) / 255,
        g: ((duo(1) + (tc[1] - duo(1)) * truth) * fog) / 255,
        b: ((duo(2) + (tc[2] - duo(2)) * truth) * fog) / 255,
      });
    }
    return { cells: out, cellW: this.cw, cellH: this.ch };
  }

  private layout() {
    const w = this.host.clientWidth;
    if (!w) return;
    this.cw = w < 420 ? 5 : w < 640 ? 6 : 7;
    this.ch = Math.round(this.cw * 1.62);
    this.cols = Math.floor(w / this.cw);
    // crop to a slightly tighter portrait framing
    const sx = this.img.width * 0.06;
    const sy = this.img.height * 0.12;
    const sw = this.img.width * 0.88;
    const sh = this.img.height * 0.6;
    this.rows = Math.round(this.cols * (sh / sw) * (this.cw / this.ch));
    const h = this.rows * this.ch;
    this.host.style.height = `${h}px`;
    this.canvas.width = Math.round((this.cols * this.cw + PAD * 2) * this.dpr);
    this.canvas.height = Math.round((h + PAD * 2) * this.dpr);
    this.canvas.style.width = `${this.cols * this.cw + PAD * 2}px`;
    this.canvas.style.height = `${h + PAD * 2}px`;

    const off = document.createElement("canvas");
    off.width = this.cols;
    off.height = this.rows;
    const octx = off.getContext("2d", { willReadFrequently: true })!;
    octx.drawImage(this.img, sx, sy, sw, sh, 0, 0, this.cols, this.rows);
    const data = octx.getImageData(0, 0, this.cols, this.rows).data;

    const n = this.cols * this.rows;
    const lum = new Float32Array(n);
    // wall key: the backdrop is bright and nearly unsaturated, skin and hair are not
    const wall = new Float32Array(n);
    const satArr = new Float32Array(n);
    const ramp = (a: number, b: number, x: number) => smooth((x - a) / (b - a));
    for (let i = 0; i < n; i++) {
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      lum[i] = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const sat = max ? (max - min) / max : 0;
      wall[i] = ramp(0.52, 0.7, lum[i]) * (1 - ramp(0.13, 0.24, sat));
      satArr[i] = sat;
    }
    // levels stretch over the subject only
    let lo = 1,
      hi = 0;
    for (let i = 0; i < n; i++) {
      if (wall[i] > 0.5) continue;
      lo = Math.min(lo, lum[i]);
      hi = Math.max(hi, lum[i]);
    }
    this.cells = [];
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const i = y * this.cols + x;
        const at = (xx: number, yy: number) =>
          lum[Math.min(this.rows - 1, Math.max(0, yy)) * this.cols + Math.min(this.cols - 1, Math.max(0, xx))];
        const gx = at(x + 1, y) - at(x - 1, y);
        const gy = at(x, y + 1) - at(x, y - 1);
        const edge = Math.min(1, Math.sqrt(gx * gx + gy * gy) * 2.2);
        let v = (lum[i] - lo) / Math.max(0.001, hi - lo);
        v = Math.pow(Math.min(1, Math.max(0, v)), 1.2) * 0.8 + edge * 0.35;
        // saturated darks (brown hair) still read as subject, not as void
        v += satArr[i] * 0.55 * smooth(lum[i] * 6);
        // the wall falls back to sparse dust so the subject floats on the dark ground
        v = v * (1 - wall[i] * 0.92);
        // no hard frame: the wall dust thins out radially, the shoulders fade at the bottom
        const ex = (x / this.cols) * 2 - 1;
        const ey = (y / this.rows) * 2 - 1;
        const radial = 1 - smooth((Math.hypot(ex * 0.95, ey * 0.85) - 0.45) / 0.55);
        const hash = Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
        if (wall[i] > 0.5 && hash > radial * 0.85) v = 0;
        v *= smooth((this.rows - y) / (this.rows * 0.18));
        v = Math.min(1, Math.max(0, v));
        this.cells.push({
          ch: RAMP[Math.min(RAMP.length - 1, Math.floor(v * RAMP.length))],
          v,
          z: v * (1 - wall[i]) - wall[i] * 0.5,
          r: data[i * 4],
          g: data[i * 4 + 1],
          b: data[i * 4 + 2],
        });
      }
    }
  }

  private onMove = (e: PointerEvent) => {
    const r = this.canvas.getBoundingClientRect();
    this.pointer = { x: e.clientX - r.left - PAD, y: e.clientY - r.top - PAD, inside: true };
    this.kick();
  };

  private onLeave = () => {
    this.pointer.inside = false;
    this.kick();
  };

  toggle = () => this.setTrueColor(!this.trueColor);

  setTrueColor(on: boolean) {
    if (!this.started || on === this.trueColor) return;
    const now = performance.now();
    const current = this.sweepProgress(now);
    this.sweepFrom = current;
    this.trueColor = on;
    this.sweepTo = on ? 1 : 0;
    this.sweepAt = now;
    this.onToggle?.(this.trueColor);
    this.kick();
  }

  /** Pointer-driven parallax: nearer glyphs slide toward the pointer, the wall slides away. */
  setTilt(x: number, y: number) {
    this.tilt.tx = x;
    this.tilt.ty = y;
    this.kick();
  }

  private sweepProgress(now: number) {
    const t = Math.min(1, (now - this.sweepAt) / AsciiPortrait.SWEEP_MS);
    return this.sweepFrom + (this.sweepTo - this.sweepFrom) * t;
  }

  private kick() {
    if (!this.raf) this.raf = requestAnimationFrame(this.tick);
  }

  private tick = (now: number) => {
    this.raf = 0;
    const busy = this.draw(now);
    if (busy) this.kick();
  };

  /** Returns true while anything is still animating. */
  private draw(now: number) {
    const { ctx, cols, rows, cw, ch, dpr } = this;
    if (!cols || !this.started) return false;
    const elapsed = now - this.startedAt;
    const total = cols * rows;
    const typed = Math.min(total, Math.floor((elapsed / AsciiPortrait.TYPE_MS) * total));
    const colorT = (elapsed - AsciiPortrait.COLOR_DELAY) / AsciiPortrait.TYPE_MS;
    const sweepT = Math.min(1, (now - this.sweepAt) / AsciiPortrait.SWEEP_MS);

    ctx.setTransform(dpr, 0, 0, dpr, PAD * dpr, PAD * dpr);
    ctx.clearRect(-PAD, -PAD, cols * cw + PAD * 2, rows * ch + PAD * 2);
    ctx.font = `500 ${Math.round(ch * 0.92)}px "Geist Mono Variable", ui-monospace, monospace`;
    ctx.textBaseline = "top";

    const px = this.pointer.x / cw;
    const py = this.pointer.y / ch;
    const radius = 7;

    const tl = this.tilt;
    tl.x += (tl.tx - tl.x) * 0.1;
    tl.y += (tl.ty - tl.y) * 0.1;
    const tilting = Math.abs(tl.tx - tl.x) + Math.abs(tl.ty - tl.y) > 0.002;
    const PAR_X = 14;
    const PAR_Y = 10;

    // extrusion pass: a dim echo of the subject, pushed back and away from the pointer
    ctx.fillStyle = "rgba(255,90,31,0.16)";
    for (let i = 0; i < typed; i++) {
      const c = this.cells[i];
      if (c.ch === " " || c.z < 0.3) continue;
      const x = i % cols;
      const y = (i / cols) | 0;
      ctx.fillText(c.ch, x * cw - tl.x * PAR_X * 0.5 + 4, y * ch - tl.y * PAR_Y * 0.5 + 6);
    }

    for (let i = 0; i < typed; i++) {
      const c = this.cells[i];
      if (c.ch === " ") continue;
      const x = i % cols;
      const y = (i / cols) | 0;
      let glyph = c.ch;
      const ox = tl.x * c.z * PAR_X;
      const oy = tl.y * c.z * PAR_Y;

      // duotone arrives a beat behind the type, top to bottom
      const duo = smooth(colorT * 1.6 - (y / rows) * 0.6);
      // the click sweep travels left to right
      const local = smooth(sweepT * 1.5 - (x / cols) * 0.5);
      // colour still arrives a beat behind the type-in, riding the same top-to-bottom wave
      const truth = (this.sweepFrom + (this.sweepTo - this.sweepFrom) * local) * duo;

      let r = MONO[0] + (DUO_LO[0] + (DUO_HI[0] - DUO_LO[0]) * c.v - MONO[0]) * duo;
      let g = MONO[1] + (DUO_LO[1] + (DUO_HI[1] - DUO_LO[1]) * c.v - MONO[1]) * duo;
      let b = MONO[2] + (DUO_LO[2] + (DUO_HI[2] - DUO_LO[2]) * c.v - MONO[2]) * duo;
      // true colour, brightened slightly to read on the dark ground
      r += (Math.min(255, c.r * 1.12) - r) * truth;
      g += (Math.min(255, c.g * 1.12) - g) * truth;
      b += (Math.min(255, c.b * 1.12) - b) * truth;

      // the leading edge of the type-in flickers
      if (i > typed - cols * 2 && typed < total) glyph = NOISE[(Math.random() * NOISE.length) | 0];

      if (this.pointer.inside) {
        const dx = x - px;
        const dy = (y - py) * (ch / cw);
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < radius) {
          const k = 1 - d / radius;
          if (Math.random() < k * 0.5) glyph = NOISE[(Math.random() * NOISE.length) | 0];
          r += (255 - r) * k * 0.6;
          g += (90 - g) * k * 0.6;
          b += (31 - b) * k * 0.6;
        }
      }

      // atmospheric depth: the far wall dims, near features stay full strength
      const fog = c.z < 0 ? 0.55 : 0.8 + c.z * 0.2;
      ctx.fillStyle = `rgb(${(r * fog) | 0},${(g * fog) | 0},${(b * fog) | 0})`;
      ctx.fillText(glyph, x * cw + ox, y * ch + oy);
    }

    if (typed < total) {
      // block cursor at the typing head
      const x = typed % cols;
      const y = (typed / cols) | 0;
      ctx.fillStyle = "#ff5a1f";
      ctx.fillRect(x * cw, y * ch, cw, ch);
    }

    return typed < total || colorT < 1.2 || sweepT < 1 || this.pointer.inside || tilting;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.io.disconnect();
    this.ro.disconnect();
    this.host.removeEventListener("pointermove", this.onMove);
    this.host.removeEventListener("pointerleave", this.onLeave);
    this.canvas.remove();
  }
}
