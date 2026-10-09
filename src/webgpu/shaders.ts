/** WGSL for the "Zero rollbacks" particle centerpiece. */

const NOISE = /* wgsl */ `
fn hash3(p: vec3f) -> f32 {
  var q = fract(p * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
fn vnoise(p: vec3f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash3(i), hash3(i + vec3f(1.0, 0.0, 0.0)), u.x),
        mix(hash3(i + vec3f(0.0, 1.0, 0.0)), hash3(i + vec3f(1.0, 1.0, 0.0)), u.x), u.y),
    mix(mix(hash3(i + vec3f(0.0, 0.0, 1.0)), hash3(i + vec3f(1.0, 0.0, 1.0)), u.x),
        mix(hash3(i + vec3f(0.0, 1.0, 1.0)), hash3(i + vec3f(1.0, 1.0, 1.0)), u.x), u.y),
    u.z);
}
fn fbm(p: vec3f) -> f32 {
  return vnoise(p) * 0.6 + vnoise(p * 2.03 + 17.0) * 0.3 + vnoise(p * 4.1 + 31.0) * 0.1;
}
// divergence-free 2D flow: the curl of an fBm potential
fn curl(p: vec3f) -> vec2f {
  let e = 0.07;
  let dx = fbm(p + vec3f(e, 0.0, 0.0)) - fbm(p - vec3f(e, 0.0, 0.0));
  let dy = fbm(p + vec3f(0.0, e, 0.0)) - fbm(p - vec3f(0.0, e, 0.0));
  return vec2f(dy, -dx) / (2.0 * e);
}
`;

/** Seeds every particle as a loose nebula around the figure centre. */
export const INIT_WGSL = /* wgsl */ `
// order > 0 seeds straight onto the figure on screen (used when a tier is swapped in mid-story)
struct Seed { size: f32, order: f32, center: vec2f, weights: vec4f }
@group(0) @binding(0) var<uniform> seed: Seed;
@group(0) @binding(1) var posOut: texture_storage_2d<rgba32float, write>;
@group(0) @binding(2) var velOut: texture_storage_2d<rgba32float, write>;
@group(0) @binding(3) var<storage, read> targetsA: array<vec4f>;
@group(0) @binding(4) var<storage, read> targetsB: array<vec4f>;

// PCG integer hash: no visible structure across neighbouring indices
fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
fn rnd(v: u32) -> f32 { return f32(pcg(v)) / 4294967295.0; }

@compute @workgroup_size(8, 8)
fn cs_init(@builtin(global_invocation_id) gid: vec3u) {
  let w = u32(seed.size);
  if (gid.x >= w || gid.y >= w) { return; }
  let i = gid.y * w + gid.x;
  let a = rnd(i * 3u) * 6.2831853;
  let r = pow(rnd(i * 3u + 1u), 0.6);
  let cloud = seed.center + vec2f(cos(a) * r * 0.75, sin(a) * r * 0.62);
  let ta = targetsA[i];
  let tb = targetsB[i];
  let figure = ta.xy * seed.weights.x + ta.zw * seed.weights.y + tb.xy * seed.weights.z;
  let p = mix(cloud, figure, seed.order);
  let z = (rnd(i * 3u + 2u) - 0.5) * mix(0.5, 0.18, seed.order);
  textureStore(posOut, gid.xy, vec4f(p, z, 1.0));
  textureStore(velOut, gid.xy, vec4f(0.0));
}
`;

export const SIM_WGSL = /* wgsl */ `
struct Sim {
  time: f32,
  dt: f32,
  order: f32,
  turbulence: f32,
  weights: vec4f,      // stage blend weights (x: 30+, y: 100+, z: 0)
  center: vec2f,       // figure centre, where the nebula gathers
  pointer: vec2f,
  pointerVel: vec2f,
  pointerActive: f32,
  size: f32,
}
@group(0) @binding(0) var<uniform> sim: Sim;
@group(0) @binding(1) var posIn: texture_2d<f32>;
@group(0) @binding(2) var velIn: texture_2d<f32>;
@group(0) @binding(3) var posOut: texture_storage_2d<rgba32float, write>;
@group(0) @binding(4) var velOut: texture_storage_2d<rgba32float, write>;
@group(0) @binding(5) var<storage, read> targetsA: array<vec4f>;
@group(0) @binding(6) var<storage, read> targetsB: array<vec4f>;

${NOISE}

@compute @workgroup_size(8, 8)
fn cs_main(@builtin(global_invocation_id) gid: vec3u) {
  let w = u32(sim.size);
  if (gid.x >= w || gid.y >= w) { return; }
  let idx = gid.y * w + gid.x;
  let p4 = textureLoad(posIn, gid.xy, 0);
  let v4 = textureLoad(velIn, gid.xy, 0);
  let ta = targetsA[idx];
  let tb = targetsB[idx];
  let seed = tb.z;
  var pos = p4.xyz;
  var vel = v4.xyz;

  // staggered arrival: each particle locks in on its own schedule
  let ord = smoothstep(seed * 0.35, seed * 0.35 + 0.65, sim.order);
  // figures have thickness, so the pointer tilt reveals depth
  let goal = vec3f(ta.xy * sim.weights.x + ta.zw * sim.weights.y + tb.xy * sim.weights.z, (seed - 0.5) * 0.18);
  let bits = u32(tb.w);
  let edge = f32(bits & 1u) * sim.weights.x + f32((bits >> 1u) & 1u) * sim.weights.y + f32((bits >> 2u) & 1u) * sim.weights.z;

  var acc = (goal - pos) * (22.0 + 26.0 * seed) * ord;

  // turbulence: incidents as noise, fading as order returns
  let flow = curl(vec3f(pos.xy * 1.25, sim.time * 0.11 + seed * 0.4));
  let lift = (fbm(vec3f(pos.xy * 1.7, sim.time * 0.17)) - 0.5) * 2.0;
  acc += vec3f(flow, lift) * sim.turbulence * (1.0 - ord * 0.94);
  // keep the chaos gathered around the figure instead of leaving the frame
  let rel = pos - vec3f(sim.center, 0.0);
  acc -= vec3f(rel.x * 0.55, rel.y * 1.5, rel.z * 1.6) * (1.0 - ord);

  // the cursor stirs: push outward and drag along its direction of travel
  let d = pos.xy - sim.pointer;
  let r = length(d);
  let reach = 0.3;
  if (sim.pointerActive > 0.0 && r < reach) {
    let f = 1.0 - r / reach;
    let push = d / max(r, 1e-4) * f * f * 16.0 + sim.pointerVel * f * 7.0;
    acc += vec3f(push, (seed - 0.5) * f * 6.0) * sim.pointerActive;
  }

  let damp = exp(-sim.dt * (2.0 + 6.5 * ord));
  vel = vel * damp + acc * sim.dt;
  pos += vel * sim.dt;
  // w carries how much this particle sits on the outline, once it has arrived
  textureStore(posOut, gid.xy, vec4f(pos, edge * ord));
  textureStore(velOut, gid.xy, vec4f(vel, length(vel)));
}
`;

export const PARTICLE_WGSL = /* wgsl */ `
struct View {
  aspect: f32,
  size: f32,
  intensity: f32,
  stage3: f32,
  tilt: vec2f,
  pxToClip: vec2f,     // 2 / canvas size in physical pixels
  dpr: f32,
  fade: f32,
}
@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var posTex: texture_2d<f32>;
@group(0) @binding(2) var velTex: texture_2d<f32>;

struct Out {
  @builtin(position) position: vec4f,
  @location(0) corner: vec2f,
  @location(1) color: vec3f,
}

fn h(n: f32) -> f32 {
  var s = u32(n * 1000.0) * 747796405u + 2891336453u;
  s = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return f32((s >> 22u) ^ s) / 4294967295.0;
}

@vertex fn vs_main(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> Out {
  let w = u32(view.size);
  let coord = vec2u(ii % w, ii / w);
  let p4 = textureLoad(posTex, coord, 0);
  var p = p4.xyz;
  let edge = p4.w;
  let speed = textureLoad(velTex, coord, 0).w;

  // pointer-driven camera tilt (yaw then pitch)
  let cy = cos(view.tilt.x); let sy = sin(view.tilt.x);
  p = vec3f(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy);
  let cp = cos(view.tilt.y); let sp = sin(view.tilt.y);
  p = vec3f(p.x, p.y * cp - p.z * sp, p.y * sp + p.z * cp);

  let persp = 2.6 / (2.6 - p.z);
  let ndc = vec2f(p.x / view.aspect, p.y) * persp;

  var corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0));
  let c = corners[vi];
  let fi = f32(ii);
  let px = (0.9 + 1.2 * h(fi * 0.73)) * view.dpr * persp;

  // colour: bone at rest, signal when hot; the final 0 runs hot through its ring
  let bone = vec3f(0.84, 0.82, 0.78);
  let signal = vec3f(1.0, 0.11, 0.014);
  let ember = vec3f(1.0, 0.42, 0.16);
  let hot = smoothstep(0.55, 2.2, speed);
  let depth = clamp(0.8 + p.z * 2.0, 0.4, 1.25);
  var col = mix(bone, signal, clamp(max(hot, view.stage3), 0.0, 1.0));
  // outlines burn brighter; on the final 0 they run ember-hot
  col = mix(col, ember, edge * view.stage3 * 0.6);
  col *= depth * mix(0.55, 1.9, edge);

  var out: Out;
  out.position = vec4f(ndc + c * px * view.pxToClip * 0.5, 0.0, 1.0);
  out.corner = c;
  out.color = col * view.intensity * view.fade;
  return out;
}

@fragment fn fs_main(in: Out) -> @location(0) vec4f {
  let d = length(in.corner);
  let a = smoothstep(1.0, 0.15, d);
  return vec4f(in.color * a, a);
}
`;

export const BRIGHT_WGSL = /* wgsl */ `
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(src, samp, uv, 0.0).rgb;
  let l = dot(c, vec3f(0.2126, 0.7152, 0.0722));
  return vec4f(c * smoothstep(0.22, 1.0, l), 1.0);
}
`;

export const BLUR_WGSL = /* wgsl */ `
struct Blur { step: vec2f }
@group(0) @binding(0) var<uniform> blur: Blur;
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;
@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let wts = array<f32, 5>(0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
  var acc = textureSampleLevel(src, samp, uv, 0.0).rgb * wts[0];
  for (var i = 1; i < 5; i++) {
    let o = blur.step * f32(i) * 1.6;
    acc += textureSampleLevel(src, samp, uv + o, 0.0).rgb * wts[i];
    acc += textureSampleLevel(src, samp, uv - o, 0.0).rgb * wts[i];
  }
  return vec4f(acc, 1.0);
}
`;

export const COMPOSITE_WGSL = /* wgsl */ `
struct Comp { bloom: f32, fade: f32, ink: vec3f }
@group(0) @binding(0) var<uniform> comp: Comp;
@group(0) @binding(1) var scene: texture_2d<f32>;
@group(0) @binding(2) var glow: texture_2d<f32>;
@group(0) @binding(3) var samp: sampler;

fn aces(x: vec3f) -> vec3f {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), vec3f(0.0), vec3f(1.0));
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let s = textureSampleLevel(scene, samp, uv, 0.0).rgb;
  let g = textureSampleLevel(glow, samp, uv, 0.0).rgb;
  var c = aces((s + g * comp.bloom) * comp.fade);
  c = pow(c, vec3f(1.0 / 2.2));
  let v = 1.0 - 0.35 * pow(length((uv - 0.5) * vec2f(1.1, 1.3)), 2.2);
  c *= v;
  // additive light over the page's ink, so the section is seamless with its neighbours
  return vec4f(comp.ink + c * (1.0 - comp.ink), 1.0);
}
`;
