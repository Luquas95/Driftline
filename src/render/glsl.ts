/** GLSL snippets shared by the procedural shaders (planets, stars, nebulae). All art is generated here, no image assets. */

export const COMMON = /* glsl */ `
float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float noise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash31(i + vec3(0,0,0)), hash31(i + vec3(1,0,0)), f.x),
        mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
        mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise3(p);
    p = p * 2.02 + vec3(11.7, 3.1, 7.3);
    a *= 0.5;
  }
  return v;
}
float fbm3(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * noise3(p);
    p = p * 2.1 + vec3(5.3, 1.7, 9.1);
    a *= 0.5;
  }
  return v;
}
mat3 rotY(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c);
}
`;

export const MESH_VERTEX = /* glsl */ `#version 300 es
precision highp float;
in vec2 aPosition;
in vec2 aUV;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
out vec2 vUV;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
}
`;

export type PlanetKind = 'rocky' | 'desert' | 'ocean' | 'ice' | 'volcanic' | 'gas' | 'dead' | 'moon';

/** Per-type surface function: returns albedo, writes specular/emissive info. `p` is a point on the unit sphere. */
const SURFACES: Record<PlanetKind, string> = {
  rocky: /* glsl */ `
vec3 surface(vec3 p, out float spec, out float emit, out float cloudAmt) {
  float h = fbm(p * 2.6 + uSeed);
  float land = smoothstep(0.46, 0.52, h);
  vec3 sea = uColA * (0.45 + 0.6 * h);
  vec3 grass = mix(uColB, uColC, smoothstep(0.5, 0.75, fbm(p * 5.0 + uSeed * 1.7)));
  vec3 rock = mix(grass, vec3(0.62, 0.58, 0.54), smoothstep(0.66, 0.8, h));
  float pole = smoothstep(0.78, 0.92, abs(p.y) + (h - 0.5) * 0.35);
  vec3 col = mix(sea, rock, land);
  col = mix(col, vec3(0.93, 0.96, 1.0), pole);
  spec = (1.0 - land) * 0.6;
  emit = 0.0;
  cloudAmt = 0.9;
  return col;
}`,
  desert: /* glsl */ `
vec3 surface(vec3 p, out float spec, out float emit, out float cloudAmt) {
  float dunes = fbm(vec3(p.x * 1.5, p.y * 7.0, p.z * 1.5) + uSeed);
  float h = fbm(p * 3.0 + uSeed * 2.3);
  vec3 col = mix(uColA, uColB, dunes);
  col = mix(col, uColC, smoothstep(0.55, 0.78, h) * 0.7);
  float crater = smoothstep(0.7, 0.74, fbm3(p * 9.0 + uSeed));
  col *= 1.0 - crater * 0.25;
  spec = 0.02;
  emit = 0.0;
  cloudAmt = 0.15;
  return col;
}`,
  ocean: /* glsl */ `
vec3 surface(vec3 p, out float spec, out float emit, out float cloudAmt) {
  float h = fbm(p * 2.2 + uSeed);
  float isle = smoothstep(0.6, 0.64, h);
  float depth = smoothstep(0.25, 0.6, h);
  vec3 sea = mix(uColA * 0.5, uColA * 1.15, depth);
  vec3 land = mix(uColB, uColC, fbm3(p * 6.0 + uSeed));
  vec3 col = mix(sea, land, isle);
  col = mix(col, vec3(0.95, 0.97, 1.0), smoothstep(0.85, 0.96, abs(p.y)));
  spec = (1.0 - isle) * 0.9;
  emit = 0.0;
  cloudAmt = 1.0;
  return col;
}`,
  ice: /* glsl */ `
vec3 surface(vec3 p, out float spec, out float emit, out float cloudAmt) {
  float h = fbm(p * 3.2 + uSeed);
  float cracks = smoothstep(0.02, 0.0, abs(fbm3(p * 7.0 + uSeed * 3.0) - 0.5) - 0.012);
  vec3 col = mix(uColA, uColB, h);
  col = mix(col, uColC, cracks * 0.8);
  spec = 0.55;
  emit = 0.0;
  cloudAmt = 0.25;
  return col;
}`,
  volcanic: /* glsl */ `
vec3 surface(vec3 p, out float spec, out float emit, out float cloudAmt) {
  float h = fbm(p * 3.0 + uSeed);
  float lava = smoothstep(0.03, 0.0, abs(fbm(p * 5.0 + uSeed * 2.0) - 0.5) - 0.02);
  vec3 col = mix(uColA, uColB, h);
  float pulse = 0.75 + 0.25 * sin(uTime * 1.3 + h * 12.0);
  emit = lava * pulse;
  col = mix(col, uColC, emit);
  spec = 0.05;
  cloudAmt = 0.35;
  return col;
}`,
  gas: /* glsl */ `
vec3 surface(vec3 p, out float spec, out float emit, out float cloudAmt) {
  float lat = p.y;
  float warp = fbm(vec3(p.x * 2.0, lat * 3.0, p.z * 2.0) + uSeed + uTime * 0.02);
  float bands = sin(lat * 14.0 + warp * 4.0 + uSeed) * 0.5 + 0.5;
  float fine = fbm3(vec3(p.x * 3.0, lat * 22.0, p.z * 3.0) + uSeed);
  vec3 col = mix(uColA, uColB, bands);
  col = mix(col, uColC, fine * 0.55);
  float storm = smoothstep(0.1, 0.0, length(vec2(p.x - 0.35, lat + 0.25) * vec2(1.0, 2.2)) - 0.1);
  col = mix(col, uColC * 1.25, storm * 0.6);
  spec = 0.0;
  emit = 0.0;
  cloudAmt = 0.0;
  return col;
}`,
  dead: /* glsl */ `
vec3 surface(vec3 p, out float spec, out float emit, out float cloudAmt) {
  float h = fbm(p * 3.5 + uSeed);
  vec3 col = mix(uColA, uColB, h);
  float c1 = smoothstep(0.62, 0.66, fbm3(p * 5.5 + uSeed));
  float c2 = smoothstep(0.66, 0.7, fbm3(p * 11.0 + uSeed * 1.9));
  col *= 1.0 - 0.28 * c1 - 0.2 * c2;
  col = mix(col, uColC, smoothstep(0.7, 0.85, h) * 0.5);
  spec = 0.0;
  emit = 0.0;
  cloudAmt = 0.0;
  return col;
}`,
  moon: /* glsl */ `
vec3 surface(vec3 p, out float spec, out float emit, out float cloudAmt) {
  float h = fbm(p * 4.0 + uSeed);
  vec3 col = mix(uColA, uColB, h);
  float c1 = smoothstep(0.6, 0.65, fbm3(p * 7.0 + uSeed));
  col *= 1.0 - 0.3 * c1;
  spec = 0.0;
  emit = 0.0;
  cloudAmt = 0.0;
  return col;
}`,
};

export function planetFragment(kind: PlanetKind): string {
  return /* glsl */ `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform float uTime;
uniform float uSeed;
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uColC;
uniform vec3 uAtmo;
uniform float uAtmoAmt;
uniform vec3 uLight;
uniform float uCloud;
uniform float uSpin;
uniform float uDetail;
${COMMON}
${SURFACES[kind]}
void main() {
  vec2 q = vUV * 2.0 - 1.0;
  q.y = -q.y;
  float r2 = dot(q, q);
  if (r2 > 1.0) { fragColor = vec4(0.0); return; }
  float z = sqrt(1.0 - r2);
  vec3 n = vec3(q, z);
  vec3 p = rotY(uTime * uSpin) * n;
  float spec; float emit; float cloudAmt;
  vec3 albedo = surface(p, spec, emit, cloudAmt);
  // close-up detail: extra octaves fade in when the planet is large on screen
  if (uDetail > 0.0) {
    float d1 = fbm3(p * 22.0 + uSeed) - 0.5;
    float d2 = fbm3(p * 58.0 + uSeed * 1.3) - 0.5;
    albedo *= 1.0 + (d1 * 0.5 + d2 * 0.38) * uDetail;
  }
  // clouds
  float c = 0.0;
  if (uCloud > 0.0) {
    vec3 pc = rotY(uTime * uSpin * 1.35) * n;
    c = smoothstep(0.52, 0.8, fbm(pc * 3.2 + uSeed * 4.1)) * uCloud * cloudAmt;
    albedo = mix(albedo, vec3(1.0), c * 0.85);
  }
  vec3 L = normalize(uLight);
  float ndl = dot(n, L);
  float diff = smoothstep(-0.12, 0.55, ndl);
  vec3 col = albedo * (0.04 + 0.96 * diff);
  col += emit * vec3(1.0, 0.45, 0.12) * 1.4;
  // specular glint on water / ice
  vec3 h = normalize(L + vec3(0.0, 0.0, 1.0));
  col += spec * pow(max(dot(n, h), 0.0), 40.0) * diff * vec3(0.9, 0.95, 1.0) * (1.0 - c);
  // atmosphere rim lit by the star
  float rim = pow(1.0 - z, 2.6);
  float lit = smoothstep(-0.35, 0.5, ndl);
  col += uAtmo * rim * uAtmoAmt * (0.25 + 1.4 * lit);
  float edge = smoothstep(1.0, 0.985, sqrt(r2));
  fragColor = vec4(col * edge, edge);
}
`;
}

export const STAR_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform float uTime;
uniform float uSeed;
uniform vec3 uStarColor;
uniform vec3 uHot;
${COMMON}
void main() {
  vec2 q = vUV * 2.0 - 1.0;
  float r = length(q);
  // disc occupies radius 0.34, corona and glow fill the rest of the quad
  float disc = r / 0.34;
  vec3 col = vec3(0.0);
  float alpha = 0.0;
  if (disc < 1.0) {
    float z = sqrt(max(0.0, 1.0 - disc * disc));
    vec3 n = vec3(q / 0.34, z);
    vec3 p = rotY(uTime * 0.04) * n;
    float g = fbm(p * 4.0 + vec3(uSeed, uTime * 0.05, 0.0));
    float spots = smoothstep(0.62, 0.7, fbm3(p * 3.0 + uSeed * 2.0));
    float limb = pow(z, 0.55);
    col = mix(uStarColor, uHot, g * 0.9) * (0.55 + 0.75 * limb) * (1.0 - 0.35 * spots);
    alpha = 1.0;
  }
  float glow = exp(-pow(max(r - 0.3, 0.0) * 5.0, 1.15)) * 0.9;
  float corona = exp(-max(r - 0.3, 0.0) * 9.0) * (0.55 + 0.45 * fbm3(vec3(q * 3.0, uTime * 0.15 + uSeed)));
  float ang = atan(q.y, q.x);
  float spikes = pow(max(0.0, cos(ang * 4.0 + 0.4)), 28.0) * exp(-r * 4.5) * 0.9;
  vec3 halo = uStarColor * (glow + corona * 0.7) + uHot * spikes * 0.7;
  col += halo * (1.0 - alpha);
  float a = clamp(alpha + (glow + corona * 0.7 + spikes) * 0.85, 0.0, 1.0);
  a *= smoothstep(1.0, 0.82, r);
  fragColor = vec4(col * a, a);
}
`;

export const NEBULA_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform float uTime;
uniform vec2 uOffset;
uniform float uScale;
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uColC;
uniform float uIntensity;
uniform vec2 uAspect;
${COMMON}
void main() {
  vec2 uv = (vUV - 0.5) * uAspect * uScale + uOffset;
  vec3 p = vec3(uv, uTime * 0.004);
  float a = fbm(p * 1.0);
  float b = fbm(p * 2.2 + 7.0 + a * 1.5);
  float c = fbm(p * 0.6 + 21.0);
  vec3 col = mix(uColA, uColB, smoothstep(0.3, 0.75, a));
  col = mix(col, uColC, smoothstep(0.45, 0.8, b) * 0.6);
  float dens = smoothstep(0.38, 0.8, a * 0.7 + c * 0.5) * uIntensity;
  float dust = smoothstep(0.55, 0.9, b);
  col *= (0.5 + dens) * (1.0 - 0.35 * dust);
  fragColor = vec4(col * dens, dens);
}
`;

export const STARFIELD_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform float uTime;
uniform vec2 uOffset;
uniform vec2 uAspect;
uniform float uDensity;
uniform float uTwinkle;
${COMMON}
float h21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
vec3 layer(vec2 uv, float scale, float seed, float par) {
  vec2 g = uv * scale + uOffset * par;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  vec3 acc = vec3(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 cell = id + o;
      float r = h21(cell + seed);
      if (r > uDensity) continue;
      vec2 pos = o + (vec2(h21(cell + seed + 3.1), h21(cell + seed + 7.7)) - 0.5) * 0.8;
      float d = length(f - pos);
      float size = 0.012 + 0.03 * h21(cell + seed + 1.3);
      float tw = 1.0 - uTwinkle * (0.5 + 0.5 * sin(uTime * (0.6 + 2.0 * h21(cell + seed + 9.1)) + r * 40.0)) * 0.7;
      float s = smoothstep(size, 0.0, d) * tw;
      float halo = smoothstep(size * 5.0, 0.0, d) * 0.12 * tw;
      float t = h21(cell + seed + 5.5);
      vec3 tint = mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.88, 0.75), t);
      acc += tint * (s + halo);
    }
  }
  return acc;
}
void main() {
  vec2 uv = (vUV - 0.5) * uAspect;
  vec3 col = layer(uv, 14.0, 1.0, 0.25) * 0.55 + layer(uv, 8.0, 21.0, 0.5) * 0.8 + layer(uv, 4.5, 51.0, 1.0) * 1.2;
  float a = clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0);
  fragColor = vec4(col, a);
}
`;
