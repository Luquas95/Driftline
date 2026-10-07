import { Container, Graphics } from 'pixi.js';
import { createNebula, createPlanet, createStar, createStarfield, planetParams, STAR_COLORS } from './materials';
import type { Scene } from './stage';
import type { BodyStatic, SpectralClass, StationStatic } from '../core/types';
import { prefersReducedMotion } from '../ui/settings';

/** Calm background scene (nebula, stars, optionally a planet with a station) used behind DOM-heavy screens. */
export function createBackdropScene(opts: { body?: BodyStatic; station?: StationStatic; spectral?: SpectralClass; starSeed?: number; tint?: number }): Scene {
  const container = new Container();
  const hueShift = ((opts.tint ?? 0) % 7) / 7;
  const nebula = createNebula([0.08 + hueShift * 0.15, 0.14, 0.34 - hueShift * 0.1], [0.28, 0.1 + hueShift * 0.2, 0.3], [0.08, 0.26, 0.36], 0.7);
  const stars = createStarfield(0.5);
  container.addChild(nebula.mesh, stars.mesh);
  let planet: ReturnType<typeof createPlanet> | null = null;
  const stationGfx = new Graphics();
  let sun: ReturnType<typeof createStar> | null = null;
  if (opts.spectral) {
    sun = createStar(opts.spectral, opts.starSeed ?? 1);
    container.addChild(sun.mesh);
  }
  if (opts.body) {
    planet = createPlanet(planetParams({ kind: opts.body.kind, seed: opts.body.seed, atmosphere: opts.body.atmosphere, id: opts.body.id }));
    container.addChild(planet.mesh);
  }
  container.addChild(stationGfx);
  let W = 800;
  let H = 600;
  void STAR_COLORS;

  function drawStation(t: number, cx: number, cy: number, r: number): void {
    stationGfx.clear();
    if (!opts.station) return;
    const type = opts.station.type;
    const rot = prefersReducedMotion() ? 0 : t * 0.15;
    const col = type === 'pirate' ? 0xff9a6a : 0x8fe3ff;
    stationGfx.circle(cx, cy, r).stroke({ width: 3, color: col, alpha: 0.85 });
    stationGfx.circle(cx, cy, r * 0.62).stroke({ width: 1.5, color: col, alpha: 0.5 });
    for (let i = 0; i < 4; i++) {
      const a = rot + (i * Math.PI) / 2;
      stationGfx.moveTo(cx + Math.cos(a) * r * 0.2, cy + Math.sin(a) * r * 0.2).lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r).stroke({ width: 2, color: col, alpha: 0.7 });
      stationGfx.circle(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 4).fill({ color: 0xfff1b0 });
    }
    stationGfx.circle(cx, cy, r * 0.2).fill({ color: col, alpha: 0.9 });
  }

  return {
    container,
    resize(w, h) {
      W = w;
      H = h;
      for (const m of [nebula.mesh, stars.mesh]) {
        m.position.set(W / 2, H / 2);
        m.scale.set(W / 2, H / 2);
      }
      if (planet) {
        const r = Math.min(W, H) * 0.55;
        planet.mesh.position.set(W * 0.78, H * 1.02);
        planet.mesh.scale.set(r);
      }
      if (sun) {
        sun.mesh.position.set(W * 0.12, H * 0.18);
        sun.mesh.scale.set(Math.min(W, H) * 0.3);
      }
    },
    update(_dt, time) {
      const aspect = W / H;
      nebula.set({ time, offX: 0.2, offY: 0, scale: 1.6, aspectX: aspect, aspectY: 1 });
      stars.set({ time, offX: 0, offY: 0, aspectX: aspect, aspectY: 1, twinkle: prefersReducedMotion() ? 0 : 1 });
      if (planet) {
        planet.setTime(time);
        planet.setLight(-0.8, 0.5, 0.5);
      }
      sun?.setTime(time);
      drawStation(time, W * 0.72, H * 0.3, Math.min(W, H) * 0.075);
    },
    destroy() {
      container.destroy({ children: true });
    },
  };
}
