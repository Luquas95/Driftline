import { Container, Graphics, Text } from 'pixi.js';
import { createNebula, createPlanet, createStar, createStarfield, planetParams, STAR_COLORS, type PlanetMesh, type StarMesh } from './materials';
import type { Scene } from './stage';
import type { BodyStatic, SystemStatic } from '../core/types';
import { hashToUnit } from '../core/rng';
import { prefersReducedMotion } from '../ui/settings';

export interface SystemSceneOptions {
  system: SystemStatic;
  /** Body ids the player has detected. */
  detected: string[];
  stationBodies: Set<number>;
  onSelectBody: (index: number | null) => void;
  /** Index of body where the ship is (or -1). */
  shipBody: number;
}

export interface SystemScene extends Scene {
  setSelected(idx: number | null): void;
  setDetected(ids: string[]): void;
  setShipBody(i: number): void;
  attach(canvas: HTMLCanvasElement): void;
}

interface BodyView {
  body: BodyStatic;
  mesh?: PlanetMesh;
  gfx?: Graphics;
  label: Text;
  angle: number;
  speed: number;
  x: number;
  y: number;
  r: number;
}

export function createSystemScene(opts: SystemSceneOptions): SystemScene {
  const sys = opts.system;
  const container = new Container();
  const nebula = createNebula([0.1, 0.16, 0.36], [0.3, 0.12, 0.34], [0.08, 0.28, 0.4], 0.75);
  const starfield = createStarfield(0.5);
  container.addChild(nebula.mesh, starfield.mesh);
  const rings = new Graphics();
  const belts = new Graphics();
  const overlay = new Graphics();
  const planetLayer = new Container();
  const labelLayer = new Container();
  const star: StarMesh = createStar(sys.spectral, sys.starSeed);
  const starSize = STAR_COLORS[sys.spectral].size;
  container.addChild(rings, belts, star.mesh, planetLayer, overlay, labelLayer);

  let W = 800;
  let H = 600;
  let selected: number | null = null;
  let shipBody = opts.shipBody;
  let detected = new Set(opts.detected);
  const views: BodyView[] = [];
  let scale = 1;
  let cx = 0;
  let cy = 0;
  let maxOrbitPx = 100;

  const planets = sys.bodies.filter((b) => b.parent < 0);
  const orbMin = Math.min(...planets.map((b) => b.orbit));
  const orbMax = Math.max(...planets.map((b) => b.orbit));
  const logSpan = Math.log(orbMax / orbMin + 1) || 1;

  function orbitRadius(b: BodyStatic): number {
    if (planets.length === 1) return 0.5 * maxOrbitPx;
    return (0.16 + 0.84 * (Math.log(b.orbit / orbMin + 1) / logSpan)) * maxOrbitPx;
  }

  for (const b of sys.bodies) {
    const isBelt = b.kind === 'belt';
    const label = new Text({ text: '', style: { fontFamily: 'Inter, sans-serif', fontSize: 12, fill: 0xdbe5f5, stroke: { color: 0x070b14, width: 3 } } });
    label.anchor.set(0.5, 0);
    labelLayer.addChild(label);
    const v: BodyView = {
      body: b,
      label,
      angle: hashToUnit(`${sys.id}:${b.index}:ang`) * Math.PI * 2,
      speed: (0.14 / Math.pow(Math.max(0.2, b.orbit), 0.75)) * (b.parent >= 0 ? 6 : 1),
      x: 0,
      y: 0,
      r: 10,
    };
    if (!isBelt) {
      const pm = createPlanet(planetParams({ kind: b.kind, seed: b.seed, atmosphere: b.atmosphere, id: b.id }));
      v.mesh = pm;
      planetLayer.addChild(pm.mesh);
    } else v.gfx = belts;
    views.push(v);
  }

  function layout(): void {
    cx = W / 2;
    cy = H / 2;
    const half = Math.min(W, H) / 2;
    maxOrbitPx = half * 0.92;
    scale = half / 300;
    nebula.mesh.position.set(W / 2, H / 2);
    nebula.mesh.scale.set(W / 2, H / 2);
    starfield.mesh.position.set(W / 2, H / 2);
    starfield.mesh.scale.set(W / 2, H / 2);
    star.mesh.position.set(cx, cy);
    star.mesh.scale.set(Math.max(34, half * 0.2 * starSize));
  }

  function bodyRadiusPx(b: BodyStatic): number {
    const base = b.kind === 'gas' ? 22 : b.kind === 'moon' ? 6 : 12;
    return Math.max(5, base * b.size * scale * 1.4 * (b.kind === 'gas' ? 0.75 : 1));
  }

  function place(time: number): void {
    for (const v of views) {
      const b = v.body;
      const t = prefersReducedMotion() ? 0 : time;
      if (b.parent >= 0) continue;
      const rad = orbitRadius(b);
      const a = v.angle + t * v.speed;
      v.x = cx + Math.cos(a) * rad;
      v.y = cy + Math.sin(a) * rad * 0.62;
      v.r = b.kind === 'belt' ? 0 : bodyRadiusPx(b);
    }
    for (const v of views) {
      const b = v.body;
      if (b.parent < 0) continue;
      const host = views[b.parent];
      const t = prefersReducedMotion() ? 0 : time;
      const a = v.angle + t * v.speed * 2.2;
      const orbitR = host.r * (1.6 + (b.index % 3) * 0.5);
      v.x = host.x + Math.cos(a) * orbitR;
      v.y = host.y + Math.sin(a) * orbitR * 0.7;
      v.r = bodyRadiusPx(b);
    }
  }

  function draw(time: number): void {
    rings.clear();
    belts.clear();
    overlay.clear();
    for (const b of planets) {
      const rad = orbitRadius(b);
      const known = detected.has(b.id);
      rings.ellipse(cx, cy, rad, rad * 0.62).stroke({ width: 1, color: known ? 0x4a78b8 : 0x2a3858, alpha: known ? 0.4 : 0.18 });
      if (b.kind === 'belt') {
        const n = 90;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + hashToUnit(`${b.id}:${i}`) * 0.3 + (prefersReducedMotion() ? 0 : time * 0.01);
          const jr = rad * (0.97 + hashToUnit(`${b.id}:r${i}`) * 0.06);
          belts.circle(cx + Math.cos(a) * jr, cy + Math.sin(a) * jr * 0.62, 0.8 + hashToUnit(`${b.id}:s${i}`) * 1.6).fill({ color: known ? 0xb9b2a6 : 0x55607a, alpha: known ? 0.75 : 0.45 });
        }
      }
    }
    for (const v of views) {
      const b = v.body;
      const known = detected.has(b.id);
      const isBelt = b.kind === 'belt';
      if (v.mesh) {
        v.mesh.mesh.visible = true;
        v.mesh.mesh.position.set(v.x, v.y);
        v.mesh.mesh.scale.set(v.r);
        v.mesh.mesh.alpha = known ? 1 : 0.28;
        v.mesh.setTime(time);
        const dx = cx - v.x;
        const dy = cy - v.y;
        const len = Math.hypot(dx, dy) || 1;
        v.mesh.setLight(dx / len, -dy / len, 0.55);
        if (b.rings && known) {
          overlay.ellipse(v.x, v.y, v.r * 1.9, v.r * 0.55).stroke({ width: Math.max(2, v.r * 0.16), color: 0xcdbb9b, alpha: 0.6 });
          overlay.ellipse(v.x, v.y, v.r * 2.25, v.r * 0.66).stroke({ width: Math.max(1, v.r * 0.07), color: 0xb2a283, alpha: 0.4 });
        }
      }
      const labelPos = isBelt ? { x: cx + orbitRadius(b), y: cy } : { x: v.x, y: v.y + v.r + 3 };
      v.label.visible = known;
      v.label.text = b.name;
      v.label.position.set(labelPos.x, labelPos.y);
      v.label.alpha = selected === b.index ? 1 : 0.75;
      if (opts.stationBodies.has(b.index) && !isBelt) {
        const a = time * 0.6;
        const sx = v.x + Math.cos(a) * (v.r + 9);
        const sy = v.y + Math.sin(a) * (v.r + 9) * 0.7;
        overlay.rect(sx - 3, sy - 3, 6, 6).fill({ color: 0x8fe3ff });
        overlay.rect(sx - 7, sy - 1, 14, 2).fill({ color: 0x8fe3ff, alpha: 0.7 });
      }
      if (selected === b.index) {
        const rr = isBelt ? 14 : v.r + 7;
        const pos = isBelt ? { x: cx + orbitRadius(b), y: cy } : { x: v.x, y: v.y };
        overlay.circle(pos.x, pos.y, rr).stroke({ width: 1.6, color: 0xffffff, alpha: 0.9 });
      }
      if (shipBody === b.index) {
        const pos = isBelt ? { x: cx + orbitRadius(b), y: cy } : { x: v.x, y: v.y };
        const rr = (isBelt ? 8 : v.r) + 12;
        overlay.poly([pos.x + rr, pos.y - 5, pos.x + rr + 10, pos.y, pos.x + rr, pos.y + 5]).fill({ color: 0x4cc9f0 });
      }
    }
    if (shipBody < 0) {
      overlay.poly([cx + maxOrbitPx * 0.98, cy - 6, cx + maxOrbitPx * 0.98 + 12, cy, cx + maxOrbitPx * 0.98, cy + 6]).fill({ color: 0x4cc9f0 });
    }
  }

  let canvas: HTMLCanvasElement | null = null;
  const onClick = (e: PointerEvent) => {
    const r = canvas!.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    let best: number | null = null;
    let bd = e.pointerType === 'touch' ? 36 : 22;
    for (const v of views) {
      if (v.body.kind === 'belt') {
        const rad = orbitRadius(v.body);
        const d = Math.abs(Math.hypot(px - cx, (py - cy) / 0.62) - rad);
        if (d < bd * 0.8) {
          bd = d;
          best = v.body.index;
        }
        continue;
      }
      const d = Math.hypot(px - v.x, py - v.y) - v.r;
      if (d < bd) {
        bd = d;
        best = v.body.index;
      }
    }
    selected = best;
    opts.onSelectBody(best);
  };

  return {
    container,
    attach(c) {
      canvas = c;
      c.addEventListener('pointerup', onClick);
    },
    resize(w, h) {
      W = w;
      H = h;
      layout();
    },
    update(_dt, time) {
      place(time);
      draw(time);
      star.setTime(time);
      const aspect = W / H;
      nebula.set({ time, offX: 0.3, offY: 0.1, scale: 1.5, aspectX: aspect, aspectY: 1 });
      starfield.set({ time, offX: 0, offY: 0, aspectX: aspect, aspectY: 1, twinkle: prefersReducedMotion() ? 0 : 1 });
    },
    destroy() {
      canvas?.removeEventListener('pointerup', onClick);
      container.destroy({ children: true });
    },
    setSelected(i) {
      selected = i;
    },
    setDetected(ids) {
      detected = new Set(ids);
    },
    setShipBody(i) {
      shipBody = i;
    },
  };
}
