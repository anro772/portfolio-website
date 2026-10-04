import * as THREE from "three";

/**
 * Full-screen fluid gradient.
 * A velocity field ping-pongs between two half-float render targets (self-advection + cursor splats + dissipation),
 * then a display shader warps a flowing multi-stop gradient through that field.
 */

const vert = /* glsl */ `
in vec3 position;
out vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const simFrag = /* glsl */ `
precision highp float;
in vec2 vUv;
uniform sampler2D uVel;
uniform vec2 uTexel;
uniform float uDt;
uniform vec2 uPointer;
uniform vec2 uPointerVel;
uniform float uAspect;
uniform float uForce;
out vec4 fragColor;

void main() {
  vec2 v = texture(uVel, vUv).xy;
  // semi-Lagrangian self-advection
  vec2 back = vUv - v * uDt * uTexel * 60.0;
  vec2 adv = texture(uVel, back).xy;
  // light diffusion from neighbours
  vec2 l = texture(uVel, vUv - vec2(uTexel.x, 0.0)).xy;
  vec2 r = texture(uVel, vUv + vec2(uTexel.x, 0.0)).xy;
  vec2 b = texture(uVel, vUv - vec2(0.0, uTexel.y)).xy;
  vec2 t = texture(uVel, vUv + vec2(0.0, uTexel.y)).xy;
  adv = mix(adv, (l + r + b + t) * 0.25, 0.12);

  vec2 d = vUv - uPointer;
  d.x *= uAspect;
  float splat = exp(-dot(d, d) / 0.0028) * uForce;
  adv += uPointerVel * splat;
  adv *= 0.975;
  float m = length(adv);
  if (m > 3.0) adv *= 3.0 / m;
  fragColor = vec4(adv, 0.0, 1.0);
}
`;

const displayFrag = /* glsl */ `
precision highp float;
in vec2 vUv;
uniform sampler2D uVel;
uniform float uTime;
uniform float uAspect;
uniform vec3 uInk;
uniform vec3 uDeep;
uniform vec3 uSignal;
uniform vec3 uBone;
out vec4 fragColor;

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(dot(hash2(i), f), dot(hash2(i + vec2(1, 0)), f - vec2(1, 0)), u.x),
             mix(dot(hash2(i + vec2(0, 1)), f - vec2(0, 1)), dot(hash2(i + vec2(1, 1)), f - vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return s;
}

void main() {
  vec2 vel = texture(uVel, vUv).xy;
  vec2 p = vUv;
  p.x *= uAspect;
  p -= vel * 0.06;
  float t = uTime * 0.06;
  vec2 q = vec2(fbm(p * 1.4 + t), fbm(p * 1.4 - t + 4.2));
  float f = fbm(p * 1.8 + q * 1.6 + vec2(t * 1.6, -t));
  f = f * 0.5 + 0.5 + length(vel) * 0.12;

  vec3 col = uInk;
  col = mix(col, uDeep, smoothstep(0.3, 0.55, f));
  col = mix(col, uSignal, smoothstep(0.5, 0.74, f));
  col = mix(col, uBone, smoothstep(0.78, 0.98, f) * 0.5);
  // keep the lower-left calm for type
  float vign = smoothstep(1.25, 0.25, length((vUv - vec2(0.75, 0.6)) * vec2(uAspect * 0.8, 1.0)));
  col = mix(uInk, col, 0.35 + 0.65 * vign);
  fragColor = vec4(col, 1.0);
}
`;

export class FluidGradient {
  private renderer: THREE.WebGLRenderer;
  private rtA: THREE.WebGLRenderTarget;
  private rtB: THREE.WebGLRenderTarget;
  private simMat: THREE.RawShaderMaterial;
  private dispMat: THREE.RawShaderMaterial;
  private simScene = new THREE.Scene();
  private dispScene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private geo = new THREE.PlaneGeometry(2, 2);
  private raf = 0;
  private running = false;
  private visible = false;
  private last = performance.now();
  private time = 0;
  private pointer = new THREE.Vector2(0.5, 0.5);
  private prevPointer = new THREE.Vector2(0.5, 0.5);
  private force = 0;
  private io: IntersectionObserver;
  private ro: ResizeObserver;

  constructor(private host: HTMLElement, private staticFrame = false) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
    host.appendChild(this.renderer.domElement);

    const opts = {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
    };
    this.rtA = new THREE.WebGLRenderTarget(128, 128, opts);
    this.rtB = new THREE.WebGLRenderTarget(128, 128, opts);

    const srgb = (hex: string) => {
      const c = new THREE.Color(hex).convertLinearToSRGB();
      return new THREE.Vector3(c.r, c.g, c.b);
    };

    this.simMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: vert,
      fragmentShader: simFrag,
      uniforms: {
        uVel: { value: null },
        uTexel: { value: new THREE.Vector2(1 / 128, 1 / 128) },
        uDt: { value: 0.016 },
        uPointer: { value: this.pointer },
        uPointerVel: { value: new THREE.Vector2() },
        uAspect: { value: 1 },
        uForce: { value: 0 },
      },
    });
    this.dispMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: vert,
      fragmentShader: displayFrag,
      uniforms: {
        uVel: { value: null },
        uTime: { value: 0 },
        uAspect: { value: 1 },
        uInk: { value: srgb("#0c0c0d") },
        uDeep: { value: srgb("#3a1408") },
        uSignal: { value: srgb("#ff5a1f") },
        uBone: { value: srgb("#eceae4") },
      },
    });
    this.simScene.add(new THREE.Mesh(this.geo, this.simMat));
    this.dispScene.add(new THREE.Mesh(this.geo, this.dispMat));

    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.io = new IntersectionObserver(([e]) => {
      this.visible = e.isIntersecting;
      if (this.visible) this.start();
      else this.stop();
    });
    this.io.observe(host);
    host.addEventListener("pointermove", this.onMove, { passive: true });

    if (staticFrame) {
      this.time = 12;
      this.frame(0.016);
    }
  }

  private onMove = (e: PointerEvent) => {
    const r = this.host.getBoundingClientRect();
    this.pointer.set((e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height);
  };

  private resize() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    const simW = 160;
    const simH = Math.max(32, Math.round((160 * h) / w));
    this.rtA.setSize(simW, simH);
    this.rtB.setSize(simW, simH);
    this.simMat.uniforms.uTexel.value.set(1 / simW, 1 / simH);
    this.simMat.uniforms.uAspect.value = w / h;
    this.dispMat.uniforms.uAspect.value = w / h;
    if (this.staticFrame) this.frame(0.016);
  }

  private frame(dt: number) {
    const pv = this.pointer.clone().sub(this.prevPointer).multiplyScalar(1 / Math.max(dt, 0.001));
    this.prevPointer.copy(this.pointer);
    const speed = pv.length();
    this.force += (Math.min(1, speed * 0.6) - this.force) * 0.25;
    pv.clampLength(0, 6);

    const s = this.simMat.uniforms;
    s.uVel.value = this.rtA.texture;
    s.uDt.value = dt;
    s.uPointerVel.value.copy(pv).multiplyScalar(0.9);
    s.uForce.value = this.force;
    this.renderer.setRenderTarget(this.rtB);
    this.renderer.render(this.simScene, this.camera);
    [this.rtA, this.rtB] = [this.rtB, this.rtA];

    this.dispMat.uniforms.uVel.value = this.rtA.texture;
    this.dispMat.uniforms.uTime.value = this.time;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.dispScene, this.camera);
  }

  private loop = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    this.frame(dt);
    this.raf = requestAnimationFrame(this.loop);
  };

  start() {
    if (this.running || this.staticFrame || !this.visible) return;
    this.running = true;
    this.last = performance.now();
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
    this.host.removeEventListener("pointermove", this.onMove);
    this.rtA.dispose();
    this.rtB.dispose();
    this.simMat.dispose();
    this.dispMat.dispose();
    this.geo.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
