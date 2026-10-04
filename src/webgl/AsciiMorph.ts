import * as THREE from "three";

/**
 * Two-pass ASCII hero object.
 * Pass 1 raymarches a morphing SDF (controller, </>, d20, WASD keycaps, CPU) into a render target the size of
 * the character grid (one texel per glyph). Pass 2 draws one of ten 5x6 glyphs, bit-packed into a uint each.
 *
 * Interaction: the object leans toward the pointer, a drag spins it with momentum, holding the button down
 * charges up the spin, and a click without dragging morphs to the next shape.
 */

// 5x6 glyphs, ramp from empty to dense.
const GLYPH_ROWS: string[][] = [
  ["00000", "00000", "00000", "00000", "00000", "00000"], // ' '
  ["00000", "00000", "00000", "00000", "00100", "00000"], // .
  ["00000", "00100", "00000", "00000", "00100", "00000"], // :
  ["00000", "00000", "01110", "00000", "00000", "00000"], // -
  ["00000", "01110", "00000", "01110", "00000", "00000"], // =
  ["00000", "00100", "01110", "00100", "00000", "00000"], // +
  ["00000", "01110", "10001", "10001", "01110", "00000"], // o
  ["10101", "01110", "11111", "01110", "10101", "00000"], // *
  ["01010", "11111", "01010", "11111", "01010", "00000"], // #
  ["01110", "10001", "10111", "10110", "10000", "01111"], // @
];

const packed = GLYPH_ROWS.map((rows) => {
  let bits = 0;
  rows.forEach((r, row) => {
    for (let col = 0; col < 5; col++) if (r[col] === "1") bits |= 1 << (row * 5 + col);
  });
  return bits >>> 0;
});

export const SHAPES = ["controller", "code", "d20", "wasd", "cpu"] as const;

const quadVert = /* glsl */ `
in vec3 position;
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const sceneFrag = /* glsl */ `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uLight;
uniform float uPulse;
uniform float uCharge;
uniform vec2 uOffset;
uniform float uZoom;
uniform float uRatio;
uniform mat3 uRot;     // world -> object
uniform float uMorph;  // integer part = shape, fraction = blend to the next
out vec4 fragColor;

const float PHI = 1.618034;

float sdBox(vec3 p, vec3 b) { vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }
float sdRBox(vec3 p, vec3 b, float r) { return sdBox(p, b - r) - r; }
float sdCap(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}
float sdSeg2(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}
float sdCylZ(vec3 p, float r, float h) {
  vec2 d = abs(vec2(length(p.xy), p.z)) - vec2(r, h);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
float extrude(float d2, float z, float h) {
  vec2 w = vec2(d2, abs(z) - h);
  return min(max(w.x, w.y), 0.0) + length(max(w, 0.0));
}
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

// each shape returns vec2(distance, accent) where accent marks the orange parts

vec2 controller(vec3 p) {
  float body = sdRBox(p - vec3(0.0, 0.08, 0.0), vec3(0.72, 0.34, 0.2), 0.18);
  vec3 g = vec3(abs(p.x), p.y, p.z * 1.35);
  float grips = sdCap(g, vec3(0.5, 0.0, 0.0), vec3(0.8, -0.55, 0.0), 0.27) / 1.35;
  float d = smin(body, grips, 0.18);
  float sticks = min(sdCylZ(p - vec3(-0.46, 0.14, 0.27), 0.11, 0.07), sdCylZ(p - vec3(0.24, -0.2, 0.27), 0.11, 0.07)) - 0.015;
  d = min(d, sticks);
  vec3 dp = p - vec3(-0.22, -0.2, 0.21);
  d = min(d, min(sdRBox(dp, vec3(0.15, 0.05, 0.04), 0.015), sdRBox(dp, vec3(0.05, 0.15, 0.04), 0.015)));
  vec3 bp = p - vec3(0.5, 0.14, 0.2);
  bp.xy = abs(rot(0.785398) * bp.xy);
  float btn = length(bp - vec3(0.078, 0.078, 0.0)) - 0.062;
  return vec2(min(d, btn), btn < d ? 1.0 : 0.0);
}

vec2 code(vec3 p) {
  vec2 q = p.xy;
  float lt = min(sdSeg2(q, vec2(-0.62, 0.42), vec2(-1.02, 0.0)), sdSeg2(q, vec2(-1.02, 0.0), vec2(-0.62, -0.42)));
  float gt = min(sdSeg2(q, vec2(0.62, 0.42), vec2(1.02, 0.0)), sdSeg2(q, vec2(1.02, 0.0), vec2(0.62, -0.42)));
  float sl = sdSeg2(q, vec2(-0.2, -0.58), vec2(0.2, 0.58));
  float br = extrude(min(lt, gt) - 0.1, p.z, 0.12) - 0.03;
  float sd = extrude(sl - 0.1, p.z, 0.12) - 0.03;
  return vec2(min(br, sd), sd < br ? 1.0 : 0.0);
}

vec2 d20(vec3 p) {
  // icosahedron as the intersection of 10 slabs (20 faces)
  float d = 0.0;
  d = max(d, abs(dot(p, normalize(vec3(1.0, 1.0, 1.0)))));
  d = max(d, abs(dot(p, normalize(vec3(-1.0, 1.0, 1.0)))));
  d = max(d, abs(dot(p, normalize(vec3(1.0, -1.0, 1.0)))));
  d = max(d, abs(dot(p, normalize(vec3(1.0, 1.0, -1.0)))));
  d = max(d, abs(dot(p, normalize(vec3(0.0, 1.0, PHI + 1.0)))));
  d = max(d, abs(dot(p, normalize(vec3(0.0, -1.0, PHI + 1.0)))));
  d = max(d, abs(dot(p, normalize(vec3(PHI + 1.0, 0.0, 1.0)))));
  d = max(d, abs(dot(p, normalize(vec3(-PHI - 1.0, 0.0, 1.0)))));
  d = max(d, abs(dot(p, normalize(vec3(1.0, PHI + 1.0, 0.0)))));
  d = max(d, abs(dot(p, normalize(vec3(-1.0, PHI + 1.0, 0.0)))));
  return vec2(d - 0.82, 0.0);
}

float keycap(vec3 p) {
  float t = clamp((p.z + 0.14) / 0.28, 0.0, 1.0);
  float taper = 1.0 - t * 0.22;
  vec3 q = vec3(p.xy / taper, p.z);
  float d = sdRBox(q, vec3(0.25, 0.25, 0.14), 0.07) * taper;
  return max(d, -(length(p - vec3(0.0, 0.0, 1.3)) - 1.2)); // dished top
}

vec2 wasd(vec3 p) {
  float w = keycap(p - vec3(0.0, 0.31, -0.06)); // W is pressed
  float rest = min(keycap(p - vec3(-0.6, -0.31, 0.0)), keycap(p - vec3(0.0, -0.31, 0.0)));
  rest = min(rest, keycap(p - vec3(0.6, -0.31, 0.0)));
  rest = min(rest, sdRBox(p - vec3(0.0, 0.0, -0.2), vec3(0.98, 0.68, 0.06), 0.04));
  return vec2(min(w, rest), w < rest ? 1.0 : 0.0);
}

vec2 cpu(vec3 p) {
  float sub = sdRBox(p - vec3(0.0, 0.0, -0.08), vec3(0.78, 0.78, 0.05), 0.02);
  float ihs = sdRBox(p - vec3(0.0, 0.0, 0.03), vec3(0.52, 0.52, 0.07), 0.05);
  // fold the four sides onto one so the legs are a single repeated box
  vec3 q = p;
  q.xy = abs(q.xy);
  if (q.x > q.y) q.xy = q.yx;
  float id = clamp(floor(q.x / 0.16 + 0.5), 0.0, 4.0);
  float legs = sdBox(vec3(q.x - id * 0.16, q.y - 0.86, p.z + 0.08), vec3(0.035, 0.1, 0.02));
  float body = min(min(sub, ihs), legs);
  float die = sdRBox(p - vec3(0.0, 0.0, 0.11), vec3(0.2, 0.2, 0.03), 0.02);
  return vec2(min(body, die), die < body ? 1.0 : 0.0);
}

vec2 shape(int i, vec3 p) {
  vec2 r = vec2(1e5, 0.0);
  if (i == 0) r = controller(p);
  else if (i == 1) r = code(p);
  else if (i == 2) r = d20(p);
  else if (i == 3) r = wasd(p);
  else r = cpu(p);
  return r;
}

vec2 map(vec3 pw) {
  vec3 p = uRot * pw;
  float f = floor(uMorph);
  int a = int(mod(f, 5.0));
  int b = int(mod(f + 1.0, 5.0));
  float t = smoothstep(0.0, 1.0, uMorph - f);
  vec2 A = shape(a, p);
  if (t < 0.002) return A;
  vec2 B = shape(b, p);
  float d = mix(A.x, B.x, t);
  // liquid ripple while between shapes
  float w = sin(3.14159 * t);
  d += w * 0.06 * sin(p.x * 7.0 + uTime * 3.0) * sin(p.y * 6.0 - uTime * 2.0) * sin(p.z * 5.0 + uTime);
  return vec2(d, mix(A.y, B.y, t));
}

vec3 normalAt(vec3 p) {
  const vec2 k = vec2(1.0, -1.0);
  const float h = 0.0015;
  return normalize(
    k.xyy * map(p + k.xyy * h).x +
    k.yyx * map(p + k.yyx * h).x +
    k.yxy * map(p + k.yxy * h).x +
    k.xxx * map(p + k.xxx * h).x);
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }

void main() {
  // grid cells are taller than wide: stretch y so the object keeps its proportions
  vec2 fc = gl_FragCoord.xy * vec2(1.0, uRatio);
  vec2 uv = (fc - 0.5 * uRes) / uRes.y;
  uv -= uOffset;
  vec3 ro = vec3(0.0, 0.0, 4.1 - uZoom);
  vec3 rd = normalize(vec3(uv, -1.45));

  float t = 0.0;
  bool hit = false;
  float acc = 0.0;
  for (int i = 0; i < 110; i++) {
    vec3 p = ro + rd * t;
    vec2 m = map(p);
    if (m.x < 0.001) { hit = true; acc = m.y; break; }
    t += m.x * 0.65;
    if (t > 11.0) break;
  }

  float lum = 0.0;
  float glow = 0.0;
  if (hit) {
    vec3 p = ro + rd * t;
    vec3 n = normalAt(p);
    vec3 l = normalize(uLight - p);
    float diff = max(dot(n, l), 0.0);
    float spec = pow(max(dot(reflect(-l, n), -rd), 0.0), 24.0);
    float fres = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
    float rim = fres * (0.55 + uPulse * 1.6 + uCharge * 1.4);
    lum = 0.1 + diff * 0.7 + spec * 0.5 + rim * 0.5;
    glow = max(rim, acc * (0.55 + diff * 0.45));
  } else {
    // sparse drifting dust in the background
    vec2 cell = floor(gl_FragCoord.xy);
    float n = hash(cell + floor(uTime * 0.6));
    lum = n > 0.985 ? 0.12 : 0.0;
  }
  fragColor = vec4(clamp(lum, 0.0, 1.0), clamp(glow, 0.0, 1.0), hit ? 1.0 : 0.0, 1.0);
}
`;

const asciiFrag = /* glsl */ `
precision highp float;
uniform sampler2D uScene;
uniform vec2 uGrid;
uniform vec2 uCell;
uniform vec3 uInk;
uniform vec3 uBone;
uniform vec3 uSignal;
uniform float uReveal;
out vec4 fragColor;

const uint GLYPHS[10] = uint[10](${packed.map((n) => `${n}u`).join(", ")});

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 cellIdx = floor(frag / uCell);
  vec2 local = fract(frag / uCell);
  vec4 s = texture(uScene, (cellIdx + 0.5) / uGrid);

  // reveal sweeps diagonally on first load
  float sweep = (cellIdx.x / uGrid.x) * 0.6 + (1.0 - cellIdx.y / uGrid.y) * 0.4;
  float vis = step(sweep, uReveal * 1.2 - 0.1);

  int level = int(clamp(s.r, 0.0, 0.999) * 10.0);
  int col = int(local.x * 6.0);
  int row = int((1.0 - local.y) * 7.0);
  bool on = false;
  if (col < 5 && row < 6) {
    uint g = GLYPHS[level];
    on = ((g >> uint(row * 5 + col)) & 1u) == 1u;
  }
  vec3 base = mix(uBone * 0.35, uBone, smoothstep(0.15, 0.9, s.r));
  vec3 color = mix(base, uSignal, smoothstep(0.25, 0.75, s.g));
  fragColor = vec4(on && vis > 0.5 ? color : uInk, 1.0);
}
`;

const HOLD_MS = 5200;

export class AsciiMorph {
  private renderer: THREE.WebGLRenderer;
  private target: THREE.WebGLRenderTarget;
  private sceneMat: THREE.RawShaderMaterial;
  private asciiMat: THREE.RawShaderMaterial;
  private sceneScene = new THREE.Scene();
  private asciiScene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private geo = new THREE.PlaneGeometry(2, 2);
  private raf = 0;
  private running = false;
  private visible = true;
  private last = performance.now();
  private time = 0;
  private io: IntersectionObserver;
  private ro: ResizeObserver;
  private cellCss = { x: 9, y: 11 };
  private reveal = 0;
  private baseZoom = 0;

  // pointer
  private lightTarget = new THREE.Vector3(2, 2, 3);
  private leanTarget = new THREE.Vector2();
  private lean = new THREE.Vector2();

  // orientation: user (drag, with inertia) * lean (pointer) * spin (idle yaw) * base tilt
  private qUser = new THREE.Quaternion();
  private qLean = new THREE.Quaternion();
  private qSpin = new THREE.Quaternion();
  private qBase = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.22, 0, 0));
  private qTmp = new THREE.Quaternion();
  private spin = 0;
  private spinSpeed = 0.35;
  private angVel = new THREE.Vector2(); // rad/s around world y (x drag) and x (y drag)
  private mat3 = new THREE.Matrix3();
  private mat4 = new THREE.Matrix4();

  // drag / hold
  private dragging = false;
  private downAt = 0;
  private downX = 0;
  private downY = 0;
  private lastX = 0;
  private lastY = 0;
  private lastMoveT = 0;
  private moved = 0;
  private charge = 0;

  // morph
  private morph = 0;
  private morphTarget = 0;
  private lastMorphAt = performance.now();
  onShape?: (index: number) => void;
  zoom = 0;

  static supported() {
    try {
      const c = document.createElement("canvas");
      return !!c.getContext("webgl2");
    } catch {
      return false;
    }
  }

  constructor(private host: HTMLElement, private staticFrame = false) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.domElement.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y";
    host.appendChild(this.renderer.domElement);

    this.target = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      type: THREE.HalfFloatType,
    });

    const ink = new THREE.Color("#0c0c0d");
    const bone = new THREE.Color("#eceae4");
    const signal = new THREE.Color("#ff5a1f");
    for (const c of [ink, bone, signal]) c.convertLinearToSRGB();

    this.sceneMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: quadVert,
      fragmentShader: sceneFrag,
      uniforms: {
        uRes: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uLight: { value: new THREE.Vector3(2, 2, 3) },
        uPulse: { value: 0 },
        uCharge: { value: 0 },
        uOffset: { value: new THREE.Vector2(0, 0) },
        uZoom: { value: 0 },
        uRatio: { value: 1 },
        uRot: { value: new THREE.Matrix3() },
        uMorph: { value: 0 },
      },
    });
    this.asciiMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: quadVert,
      fragmentShader: asciiFrag,
      uniforms: {
        uScene: { value: this.target.texture },
        uGrid: { value: new THREE.Vector2(1, 1) },
        uCell: { value: new THREE.Vector2(1, 1) },
        uInk: { value: new THREE.Vector3(ink.r, ink.g, ink.b) },
        uBone: { value: new THREE.Vector3(bone.r, bone.g, bone.b) },
        uSignal: { value: new THREE.Vector3(signal.r, signal.g, signal.b) },
        uReveal: { value: staticFrame ? 1 : 0 },
      },
    });
    this.sceneScene.add(new THREE.Mesh(this.geo, this.sceneMat));
    this.asciiScene.add(new THREE.Mesh(this.geo, this.asciiMat));

    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);

    this.io = new IntersectionObserver(([e]) => {
      this.visible = e.isIntersecting;
      if (this.visible) this.start();
      else this.stop();
    });
    this.io.observe(host);

    window.addEventListener("pointermove", this.onMove, { passive: true });
    window.addEventListener("pointerup", this.onUp);
    window.addEventListener("pointercancel", this.onUp);
    host.addEventListener("pointerdown", this.onDown);

    if (staticFrame) {
      this.reveal = 1;
      this.render(0);
    }
  }

  /** Morph forward to a given shape index. */
  goTo(index: number) {
    const n = SHAPES.length;
    const base = Math.round(this.morphTarget);
    const cur = ((base % n) + n) % n;
    if (cur === index) return;
    this.morphTarget = base - 1 + ((index - cur + n) % n);
    this.next();
  }

  /** Jump to the next shape. */
  next() {
    this.morphTarget = Math.round(this.morphTarget) + 1;
    this.lastMorphAt = performance.now();
    this.onShape?.(((this.morphTarget % SHAPES.length) + SHAPES.length) % SHAPES.length);
    if (this.staticFrame) {
      this.morph = this.morphTarget;
      this.render(0);
    }
  }

  private onMove = (e: PointerEvent) => {
    const nx = (e.clientX / window.innerWidth) * 2 - 1;
    const ny = -((e.clientY / window.innerHeight) * 2 - 1);
    this.lightTarget.set(nx * 3.2, ny * 2.4, 2.6);
    // lean toward the pointer, measured from the object's own position on screen
    const r = this.host.getBoundingClientRect();
    const off = this.sceneMat.uniforms.uOffset.value as THREE.Vector2;
    const cx = r.left + r.width / 2 + off.x * r.height;
    const cy = r.top + r.height / 2 - off.y * r.height;
    const lx = Math.max(-1, Math.min(1, (e.clientX - cx) / (r.width * 0.4)));
    const ly = Math.max(-1, Math.min(1, (e.clientY - cy) / (r.height * 0.5)));
    this.leanTarget.set(lx, ly);

    if (!this.dragging) return;
    const now = performance.now();
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.moved = Math.max(this.moved, Math.hypot(e.clientX - this.downX, e.clientY - this.downY));
    const dtm = Math.max(1, now - this.lastMoveT) / 1000;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.lastMoveT = now;
    // rotate directly in world space so the object follows the hand
    const k = 0.011;
    this.rotateUser(dx * k, dy * k);
    // velocity for the throw, smoothed
    this.angVel.x += ((dx * k) / dtm - this.angVel.x) * 0.5;
    this.angVel.y += ((dy * k) / dtm - this.angVel.y) * 0.5;
  };

  private rotateUser(yaw: number, pitch: number) {
    this.qTmp.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.qUser.premultiply(this.qTmp);
    this.qTmp.setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch);
    this.qUser.premultiply(this.qTmp);
  }

  private onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    this.dragging = true;
    this.downAt = performance.now();
    this.downX = this.lastX = e.clientX;
    this.downY = this.lastY = e.clientY;
    this.lastMoveT = this.downAt;
    this.moved = 0;
    this.angVel.set(0, 0);
    this.host.dataset.grabbing = "true";
  };

  private onUp = () => {
    if (!this.dragging) return;
    this.dragging = false;
    delete this.host.dataset.grabbing;
    const held = performance.now() - this.downAt;
    // a still tap morphs; a charged hold releases with a pulse
    if (this.moved < 6 && held < 350) {
      this.next();
      this.sceneMat.uniforms.uPulse.value = 1;
    } else if (this.charge > 0.2) {
      this.sceneMat.uniforms.uPulse.value = Math.min(1.4, this.charge * 1.4);
    }
    // a throw keeps no momentum if the pointer stopped before release
    if (performance.now() - this.lastMoveT > 90) this.angVel.set(0, 0);
    this.angVel.clampLength(0, 14);
  };

  private resize() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    const dpr = this.renderer.getPixelRatio();
    const small = w < 768;
    this.cellCss = small ? { x: 7, y: 9 } : { x: 9, y: 11 };
    this.renderer.setSize(w, h, false);
    const cols = Math.ceil(w / this.cellCss.x);
    const rows = Math.ceil(h / this.cellCss.y);
    this.target.setSize(cols, rows);
    const ratio = this.cellCss.y / this.cellCss.x;
    this.sceneMat.uniforms.uRes.value.set(cols, rows * ratio);
    this.sceneMat.uniforms.uRatio.value = ratio;
    this.asciiMat.uniforms.uGrid.value.set(cols, rows);
    this.asciiMat.uniforms.uCell.value.set(this.cellCss.x * dpr, this.cellCss.y * dpr);
    const aspect = w / h;
    this.baseZoom = small ? -2.2 : 0;
    this.sceneMat.uniforms.uOffset.value.set(small ? 0 : Math.min(0.42, aspect * 0.22), small ? 0.2 : 0.04);
    if (this.staticFrame) this.render(0);
  }

  private update(dt: number) {
    const now = performance.now();
    const u = this.sceneMat.uniforms;

    // holding the button charges the spin; letting go bleeds it off
    const holding = this.dragging && this.moved < 6 && now - this.downAt > 250;
    this.charge += ((holding ? 1 : 0) - this.charge) * (1 - Math.exp(-dt * (holding ? 1.2 : 2.5)));
    // charging winds up full turns; once released the spin settles back to the nearest front-facing turn
    if (this.charge > 0.05) {
      this.spin += dt * this.spinSpeed * this.charge * 10;
    } else {
      const rest = Math.round(this.spin / (Math.PI * 2)) * Math.PI * 2;
      this.spin += (rest - this.spin) * (1 - Math.exp(-dt * 1.2));
    }
    // idle: a slow sway that keeps the front of each shape readable
    const sway = Math.sin(this.time * 0.45) * 0.55;
    const nod = Math.sin(this.time * 0.31 + 1.3) * 0.12;
    this.qSpin.setFromEuler(new THREE.Euler(nod, this.spin + sway, 0));

    // throw inertia, then drift the user rotation back to rest
    if (!this.dragging) {
      if (this.angVel.lengthSq() > 1e-4) {
        this.rotateUser(this.angVel.x * dt, this.angVel.y * dt);
        this.angVel.multiplyScalar(Math.exp(-dt * 1.4));
      } else {
        this.qUser.slerp(this.qTmp.identity(), 1 - Math.exp(-dt * 0.6));
      }
    }

    // stronger lean than before: up to ~35 degrees of yaw and ~25 of pitch
    this.lean.lerp(this.leanTarget, 1 - Math.exp(-dt * 4));
    this.qLean.setFromEuler(new THREE.Euler(this.lean.y * 0.45, this.lean.x * 0.6, 0));

    const q = this.qTmp.copy(this.qUser).multiply(this.qLean).multiply(this.qSpin).multiply(this.qBase);
    // the shader needs world -> object, the inverse rotation
    this.mat4.makeRotationFromQuaternion(q.invert());
    (u.uRot.value as THREE.Matrix3).copy(this.mat3.setFromMatrix4(this.mat4));

    // auto-advance the morph unless someone is playing with it
    if (!this.dragging && now - this.lastMorphAt > HOLD_MS) this.next();
    this.morph += (this.morphTarget - this.morph) * (1 - Math.exp(-dt * 1.8));
    if (Math.abs(this.morphTarget - this.morph) < 1e-3) this.morph = this.morphTarget;
    u.uMorph.value = this.morph;

    (u.uLight.value as THREE.Vector3).lerp(this.lightTarget, 1 - Math.exp(-dt * 3.5));
    u.uPulse.value *= Math.exp(-dt * 2.4);
    u.uCharge.value = this.charge;
    u.uTime.value = this.time;
    u.uZoom.value = this.zoom + this.baseZoom;
    this.reveal = Math.min(1, this.reveal + dt * 0.7);
    this.asciiMat.uniforms.uReveal.value = 1 - Math.pow(1 - this.reveal, 3);
  }

  private render(dt: number) {
    this.update(dt);
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(this.sceneScene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.asciiScene, this.camera);
  }

  private loop = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    this.render(dt);
    this.raf = requestAnimationFrame(this.loop);
  };

  start() {
    if (this.running || this.staticFrame || !this.visible) return;
    this.running = true;
    this.last = performance.now();
    this.lastMorphAt = this.last;
    this.raf = requestAnimationFrame(this.loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  dispose() {
    this.stop();
    this.io.disconnect();
    this.ro.disconnect();
    window.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("pointerup", this.onUp);
    window.removeEventListener("pointercancel", this.onUp);
    this.host.removeEventListener("pointerdown", this.onDown);
    this.target.dispose();
    this.sceneMat.dispose();
    this.asciiMat.dispose();
    this.geo.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
