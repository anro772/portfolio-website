/**
 * Turns the stage figures ("30+", "100+", "0") into particle destinations.
 * Each figure is drawn once on a 2D canvas; every filled pixel becomes a candidate point, edge pixels count
 * double so outlines read crisply. Points are returned in the simulation's world space:
 * x in [-aspect, aspect], y in [-1, 1] (y up).
 */

export const STAGE_FIGURES = ["30+", "100+", "0"] as const;

type Layout = { cx: number; cy: number; maxW: number; maxH: number };

function layoutFor(aspect: number): Layout {
  // desktop: the figure sits right of centre, leaving the left column for the copy
  if (aspect >= 1.15) return { cx: 0.6, cy: 0.47, maxW: 0.5, maxH: 0.56 };
  // mobile/portrait: centred, upper half
  return { cx: 0.5, cy: 0.5, maxW: 0.86, maxH: 0.3 };
}

function samplePool(text: string, w: number, h: number, aspect: number): { pts: Float32Array; fill: number } {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const { cx, cy, maxW, maxH } = layoutFor(aspect);

  let size = h * maxH;
  ctx.font = `600 ${size}px "Geist Variable", ui-sans-serif, sans-serif`;
  const measured = ctx.measureText(text).width;
  if (measured > w * maxW) size *= (w * maxW) / measured;
  ctx.font = `600 ${size}px "Geist Variable", ui-sans-serif, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff";
  // tighten tracking like the site's display type
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${-0.05 * size}px`;
  ctx.fillText(text, w * cx, h * cy);

  const data = ctx.getImageData(0, 0, w, h).data;
  const filled = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3] > 128;
  const pts: number[] = [];
  let filledCount = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!filled(x, y)) continue;
      filledCount++;
      // a two-pixel band along the outline; these particles render brighter
      const edge =
        !filled(x - 2, y) || !filled(x + 2, y) || !filled(x, y - 2) || !filled(x, y + 2) ? 1 : 0;
      const wx = (x / w) * 2 * aspect - aspect;
      const wy = 1 - (y / h) * 2;
      pts.push(wx, wy, edge);
      if (edge) pts.push(wx, wy, edge);
    }
  }
  return { pts: new Float32Array(pts), fill: filledCount / (w * h) };
}

/**
 * Returns two packed arrays for the compute shader:
 * a: vec4 per particle (stage1.xy, stage2.xy), b: vec4 per particle (stage3.xy, seed, packed per-stage edge flags).
 */
export function buildTargets(
  count: number,
  aspect: number,
): { a: Float32Array<ArrayBuffer>; b: Float32Array<ArrayBuffer>; fills: number[] } {
  // sampling resolution: enough pixels for crisp figures without a slow scan
  const h = 360;
  const w = Math.round(h * aspect);
  const pixel = 2 / h; // one canvas pixel in world units
  const sampled = STAGE_FIGURES.map((t) => samplePool(t, w, h, aspect));
  const pools = sampled.map((s) => s.pts);
  const a = new Float32Array(count * 4);
  const b = new Float32Array(count * 4);
  // returns the edge flag of the picked point
  const pick = (pool: Float32Array, out: Float32Array, o: number) => {
    const n = pool.length / 3;
    const k = (Math.random() * n) | 0;
    out[o] = pool[k * 3] + (Math.random() - 0.5) * pixel;
    out[o + 1] = pool[k * 3 + 1] + (Math.random() - 0.5) * pixel;
    return pool[k * 3 + 2];
  };
  for (let i = 0; i < count; i++) {
    const e1 = pick(pools[0], a, i * 4);
    const e2 = pick(pools[1], a, i * 4 + 2);
    const e3 = pick(pools[2], b, i * 4);
    b[i * 4 + 2] = Math.random();
    // per-stage edge flags packed as bits: 1 = 30+, 2 = 100+, 4 = 0
    b[i * 4 + 3] = e1 + e2 * 2 + e3 * 4;
  }
  // fraction of the frame each figure covers, so brightness can stay even across stages
  return { a, b, fills: sampled.map((s) => s.fill) };
}
