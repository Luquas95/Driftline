import { Geometry, GlProgram, Mesh, Shader } from 'pixi.js';
import {
  MESH_VERTEX,
  NEBULA_FRAGMENT,
  STARFIELD_FRAGMENT,
  STAR_FRAGMENT,
  planetFragment,
  type PlanetKind,
} from './glsl';
import type { BodyStatic, SpectralClass } from '../core/types';
import { hashToUnit } from '../core/rng';

/** A fresh quad per mesh: scenes destroy their meshes (and geometry) when they are swapped out. */
function quad(): Geometry {
  return new Geometry({
    attributes: { aPosition: [-1, -1, 1, -1, 1, 1, -1, 1], aUV: [0, 0, 1, 0, 1, 1, 0, 1] },
    indexBuffer: [0, 1, 2, 0, 2, 3],
  });
}

type V3 = [number, number, number];

function hsl(h: number, s: number, l: number): V3 {
  h = ((h % 1) + 1) % 1;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

const programs = new Map<string, GlProgram>();
function program(key: string, fragment: string): GlProgram {
  let p = programs.get(key);
  if (!p) {
    p = GlProgram.from({ vertex: MESH_VERTEX, fragment, name: key });
    programs.set(key, p);
  }
  return p;
}

const v3 = (c: V3) => ({ value: new Float32Array(c), type: 'vec3<f32>' as const });
const f1 = (v: number) => ({ value: v, type: 'f32' as const });
const v2 = (a: number, b: number) => ({ value: new Float32Array([a, b]), type: 'vec2<f32>' as const });

export interface PlanetParams {
  kind: PlanetKind;
  seed: number;
  a: V3;
  b: V3;
  c: V3;
  atmo: V3;
  atmoAmt: number;
  cloud: number;
  spin: number;
}

/** Deterministic look of a planet from its seed: same planet, same look on every load. */
export function planetParams(body: Pick<BodyStatic, 'kind' | 'seed' | 'atmosphere' | 'id'>): PlanetParams {
  const r = (k: string) => hashToUnit(`${body.seed}:${k}`);
  const kind = (body.kind === 'belt' ? 'dead' : body.kind) as PlanetKind;
  const hue = r('hue');
  let a: V3,
    b: V3,
    c: V3,
    atmo: V3 = [0.4, 0.65, 1];
  let atmoAmt = body.atmosphere ? 0.8 : 0.1;
  let cloud = body.atmosphere ? 0.7 : 0;
  switch (kind) {
    case 'rocky': {
      const alien = r('alien') > 0.7;
      a = alien ? hsl(0.55 + r('s') * 0.3, 0.6, 0.28) : hsl(0.58 + r('s') * 0.05, 0.62, 0.3);
      b = alien ? hsl(0.08 + r('t') * 0.12, 0.5, 0.35) : hsl(0.26 + r('t') * 0.08, 0.45, 0.3);
      c = hsl(0.1 + r('u') * 0.06, 0.4, 0.4);
      atmo = alien ? hsl(0.8 + r('v') * 0.1, 0.6, 0.65) : [0.45, 0.7, 1];
      break;
    }
    case 'desert':
      a = hsl(0.07 + hue * 0.05, 0.55, 0.45);
      b = hsl(0.09 + hue * 0.05, 0.6, 0.62);
      c = hsl(0.03 + hue * 0.04, 0.55, 0.32);
      atmo = hsl(0.07, 0.6, 0.7);
      cloud *= 0.3;
      break;
    case 'ocean':
      a = hsl(0.56 + hue * 0.08, 0.7, 0.34);
      b = hsl(0.3 + hue * 0.1, 0.4, 0.3);
      c = hsl(0.1, 0.35, 0.45);
      atmo = [0.45, 0.75, 1];
      cloud = 0.9;
      break;
    case 'ice':
      a = hsl(0.55 + hue * 0.06, 0.45, 0.78);
      b = hsl(0.58 + hue * 0.05, 0.4, 0.9);
      c = hsl(0.6, 0.6, 0.55);
      atmo = [0.7, 0.88, 1];
      cloud *= 0.3;
      break;
    case 'volcanic':
      a = hsl(0.02 + hue * 0.03, 0.2, 0.1);
      b = hsl(0.05, 0.25, 0.2);
      c = hsl(0.06 + hue * 0.03, 0.95, 0.55);
      atmo = hsl(0.04, 0.8, 0.5);
      cloud *= 0.4;
      break;
    case 'gas': {
      const palette = Math.floor(r('p') * 4);
      const bases = [0.08, 0.55, 0.78, 0.15];
      const h0 = bases[palette] + (r('q') - 0.5) * 0.04;
      a = hsl(h0, 0.5, 0.35 + r('l') * 0.15);
      b = hsl(h0 + 0.03, 0.45, 0.62);
      c = hsl(h0 - 0.03, 0.55, 0.5);
      atmo = hsl(h0, 0.5, 0.7);
      atmoAmt = 0.55;
      cloud = 0;
      break;
    }
    case 'moon':
      a = hsl(0.08 + hue * 0.05, 0.08, 0.35);
      b = hsl(0.1, 0.08, 0.55);
      c = [0.7, 0.7, 0.7];
      atmoAmt = 0;
      cloud = 0;
      break;
    default:
      a = hsl(0.07 + hue * 0.05, 0.12, 0.3);
      b = hsl(0.08, 0.1, 0.5);
      c = hsl(0.1, 0.12, 0.62);
      atmoAmt = 0;
      cloud = 0;
  }
  return { kind, seed: r('seed') * 60, a, b, c, atmo, atmoAmt, cloud, spin: 0.04 + r('spin') * 0.06 };
}

export interface PlanetMesh {
  mesh: Mesh<Geometry, Shader>;
  setTime(t: number): void;
  setLight(x: number, y: number, z: number): void;
  /** 0..1: how much close-up surface detail to add (grows with the on-screen size). */
  setDetail(d: number): void;
}

export function createPlanet(params: PlanetParams): PlanetMesh {
  const shader = new Shader({
    glProgram: program(`planet:${params.kind}`, planetFragment(params.kind)),
    resources: {
      u: {
        uTime: f1(0),
        uSeed: f1(params.seed),
        uColA: v3(params.a),
        uColB: v3(params.b),
        uColC: v3(params.c),
        uAtmo: v3(params.atmo),
        uAtmoAmt: f1(params.atmoAmt),
        uLight: v3([-0.7, 0.35, 0.6]),
        uCloud: f1(params.cloud),
        uSpin: f1(params.spin),
        uDetail: f1(0),
      },
    },
  });
  const mesh = new Mesh({ geometry: quad(), shader });
  return {
    mesh,
    setTime: (t) => {
      shader.resources.u.uniforms.uTime = t;
    },
    setDetail: (d) => {
      shader.resources.u.uniforms.uDetail = d;
    },
    setLight: (x, y, z) => {
      const l = shader.resources.u.uniforms.uLight as Float32Array;
      l[0] = x;
      l[1] = y;
      l[2] = z;
    },
  };
}

export const STAR_COLORS: Record<SpectralClass, { core: V3; hot: V3; size: number }> = {
  O: { core: [0.55, 0.65, 1], hot: [0.85, 0.9, 1], size: 1.5 },
  B: { core: [0.62, 0.74, 1], hot: [0.9, 0.94, 1], size: 1.3 },
  A: { core: [0.78, 0.85, 1], hot: [1, 1, 1], size: 1.1 },
  F: { core: [1, 0.96, 0.82], hot: [1, 1, 0.95], size: 1 },
  G: { core: [1, 0.82, 0.4], hot: [1, 0.95, 0.7], size: 0.95 },
  K: { core: [1, 0.62, 0.28], hot: [1, 0.82, 0.5], size: 0.85 },
  M: { core: [1, 0.36, 0.2], hot: [1, 0.6, 0.35], size: 0.72 },
};

export interface StarMesh {
  mesh: Mesh<Geometry, Shader>;
  setTime(t: number): void;
}

export function createStar(spectral: SpectralClass, seed: number): StarMesh {
  const c = STAR_COLORS[spectral];
  const shader = new Shader({
    glProgram: program('star', STAR_FRAGMENT),
    resources: {
      u: { uTime: f1(0), uSeed: f1((seed % 1000) / 17), uStarColor: v3(c.core), uHot: v3(c.hot) },
    },
  });
  const mesh = new Mesh({ geometry: quad(), shader });
  mesh.blendMode = 'add';
  return {
    mesh,
    setTime: (t) => {
      shader.resources.u.uniforms.uTime = t;
    },
  };
}

export interface NebulaMesh {
  mesh: Mesh<Geometry, Shader>;
  set(o: {
    time: number;
    offX: number;
    offY: number;
    scale?: number;
    aspectX: number;
    aspectY: number;
  }): void;
  setColors(a: V3, b: V3, c: V3, intensity: number): void;
}

export function createNebula(a: V3, b: V3, c: V3, intensity = 0.9): NebulaMesh {
  const shader = new Shader({
    glProgram: program('nebula', NEBULA_FRAGMENT),
    resources: {
      u: {
        uTime: f1(0),
        uOffset: v2(0, 0),
        uScale: f1(2),
        uColA: v3(a),
        uColB: v3(b),
        uColC: v3(c),
        uIntensity: f1(intensity),
        uAspect: v2(1, 1),
      },
    },
  });
  const mesh = new Mesh({ geometry: quad(), shader });
  const u = shader.resources.u.uniforms;
  return {
    mesh,
    set: (o) => {
      u.uTime = o.time;
      (u.uOffset as Float32Array)[0] = o.offX;
      (u.uOffset as Float32Array)[1] = o.offY;
      u.uScale = o.scale ?? 2;
      (u.uAspect as Float32Array)[0] = o.aspectX;
      (u.uAspect as Float32Array)[1] = o.aspectY;
    },
    setColors: (a2, b2, c2, i) => {
      (u.uColA as Float32Array).set(a2);
      (u.uColB as Float32Array).set(b2);
      (u.uColC as Float32Array).set(c2);
      u.uIntensity = i;
    },
  };
}

export interface StarfieldMesh {
  mesh: Mesh<Geometry, Shader>;
  set(o: {
    time: number;
    offX: number;
    offY: number;
    aspectX: number;
    aspectY: number;
    twinkle: number;
  }): void;
}

export function createStarfield(density = 0.55): StarfieldMesh {
  const shader = new Shader({
    glProgram: program('starfield', STARFIELD_FRAGMENT),
    resources: {
      u: { uTime: f1(0), uOffset: v2(0, 0), uAspect: v2(1, 1), uDensity: f1(density), uTwinkle: f1(1) },
    },
  });
  const mesh = new Mesh({ geometry: quad(), shader });
  const u = shader.resources.u.uniforms;
  return {
    mesh,
    set: (o) => {
      u.uTime = o.time;
      (u.uOffset as Float32Array)[0] = o.offX;
      (u.uOffset as Float32Array)[1] = o.offY;
      (u.uAspect as Float32Array)[0] = o.aspectX;
      (u.uAspect as Float32Array)[1] = o.aspectY;
      u.uTwinkle = o.twinkle;
    },
  };
}

export type { V3 };
export { hsl };
