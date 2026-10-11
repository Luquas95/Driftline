import { Container, Graphics } from 'pixi.js';
import { hashToUnit } from '../core/rng';
import type { StationStatic } from '../core/types';

/**
 * Vector stations drawn from the station seed and type. Units: ~40 across at scale 1, centred on the origin.
 * Each station has a slowly rotating part and blinking lights; `update` is purely cosmetic.
 */
export interface StationView {
  container: Container;
  update(time: number, reduced: boolean): void;
  /** Local radius in drawing units (used to size and place the station). */
  radius: number;
}

const COLORS = {
  hull: 0x2a3c5c,
  hullLight: 0x4d6a9a,
  edge: 0x8fb3e8,
  light: 0x8fe3ff,
  warn: 0xff7a5a,
  green: 0x6fe39a,
};

export function createStationView(st: Pick<StationStatic, 'id' | 'type' | 'size' | 'name'>): StationView {
  const r = (k: string) => hashToUnit(`${st.id}:${k}`);
  const container = new Container();
  const spin = new Container();
  const body = new Graphics();
  const lights = new Graphics();
  container.addChild(body, spin, lights);
  const big = st.size === 'large' ? 1.25 : st.size === 'small' ? 0.8 : 1;
  const lightPts: { x: number; y: number; c: number; ph: number }[] = [];
  const ring = new Graphics();
  spin.addChild(ring);

  const strokeHull = (g: Graphics, w = 1.2) => g.stroke({ width: w, color: COLORS.edge, alpha: 0.9 });
  switch (st.type) {
    case 'trade_hub': {
      // a wheel: double rim, spokes, a bright hub and docking pylons
      const R = 20 * big;
      ring.circle(0, 0, R).stroke({ width: 4, color: COLORS.hullLight });
      ring.circle(0, 0, R).stroke({ width: 1, color: COLORS.edge, alpha: 0.9 });
      ring.circle(0, 0, R * 0.7).stroke({ width: 1.2, color: COLORS.hull });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ring.moveTo(Math.cos(a) * R * 0.2, Math.sin(a) * R * 0.2).lineTo(Math.cos(a) * R, Math.sin(a) * R);
      }
      ring.stroke({ width: 1.4, color: COLORS.hullLight });
      body.circle(0, 0, 5.5 * big).fill({ color: COLORS.hull });
      strokeHull(body.circle(0, 0, 5.5 * big));
      body.rect(-3, -R - 5, 6, 8).fill({ color: COLORS.hullLight });
      body.rect(-3, R - 3, 6, 8).fill({ color: COLORS.hullLight });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        lightPts.push({ x: Math.cos(a) * R, y: Math.sin(a) * R, c: COLORS.light, ph: i * 0.7 });
      }
      return finish(R + 6);
    }
    case 'industrial': {
      const w = 34 * big;
      for (let i = 0; i < 3; i++) {
        const x = -w / 2 + i * (w / 3);
        const h = 9 + r(`h${i}`) * 9;
        body.rect(x, -h / 2, w / 3 - 2, h).fill({ color: COLORS.hull });
        strokeHull(body.rect(x, -h / 2, w / 3 - 2, h));
        lightPts.push({ x: x + 3, y: -h / 2 + 2, c: COLORS.warn, ph: i });
      }
      body.rect(-w / 2 - 6, -2, w + 12, 4).fill({ color: COLORS.hullLight });
      body
        .moveTo(w / 2 - 6, -9)
        .lineTo(w / 2 + 2, -17)
        .lineTo(w / 2 + 12, -17);
      strokeHull(body, 1.4);
      body.rect(-8, 8, 4, 10).fill({ color: COLORS.hullLight });
      body.rect(4, 8, 4, 10).fill({ color: COLORS.hullLight });
      ring.moveTo(0, -14).lineTo(0, -22);
      ring.stroke({ width: 2, color: COLORS.hullLight });
      return finish(w / 2 + 14);
    }
    case 'agricultural': {
      const R = 7 * big;
      body.circle(0, 0, R).fill({ color: COLORS.hull });
      strokeHull(body.circle(0, 0, R));
      for (const sx of [-1, 1]) {
        for (let i = 0; i < 2; i++) {
          const x0 = sx * (R + 3 + i * 14);
          ring.rect(x0 - (sx < 0 ? 12 : 0), -8, 12, 16).fill({ color: 0x1b3f6b });
          ring.rect(x0 - (sx < 0 ? 12 : 0), -8, 12, 16).stroke({ width: 1, color: COLORS.edge, alpha: 0.8 });
          ring.moveTo(x0 - (sx < 0 ? 6 : -6), -8).lineTo(x0 - (sx < 0 ? 6 : -6), 8);
        }
      }
      ring.stroke({ width: 0.8, color: COLORS.edge, alpha: 0.6 });
      body.circle(0, -R - 2, 3.4).fill({ color: COLORS.green, alpha: 0.85 });
      lightPts.push({ x: 0, y: R + 2, c: COLORS.green, ph: 0 });
      return finish(R + 32);
    }
    case 'scientific':
    case 'research': {
      const R = 8 * big;
      body.circle(0, 0, R).fill({ color: COLORS.hull });
      strokeHull(body.circle(0, 0, R));
      // dish and antenna mast
      ring.moveTo(-14, -12).quadraticCurveTo(0, -22, 14, -12);
      ring.stroke({ width: 2.4, color: COLORS.hullLight });
      ring.moveTo(0, -17).lineTo(0, -R);
      ring.stroke({ width: 1, color: COLORS.edge });
      body.rect(-24, -2, 10, 4).fill({ color: 0x1b3f6b });
      body.rect(14, -2, 10, 4).fill({ color: 0x1b3f6b });
      body.moveTo(0, R).lineTo(0, R + 12);
      strokeHull(body, 1);
      lightPts.push({ x: 0, y: -22, c: COLORS.light, ph: 0.3 }, { x: 0, y: R + 12, c: COLORS.warn, ph: 1.1 });
      return finish(26);
    }
    case 'mining': {
      // lumpy rock with a drilling arm and cargo pods
      const n = 9;
      const pts: number[] = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const rr = (11 + r(`r${i}`) * 6) * big;
        pts.push(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      body.poly(pts).fill({ color: 0x4a4540 });
      body.poly(pts).stroke({ width: 1, color: 0x9d9486, alpha: 0.9 });
      ring.moveTo(8, -6).lineTo(22, -14).lineTo(30, -10);
      ring.stroke({ width: 2.4, color: COLORS.hullLight });
      ring.rect(28, -14, 6, 8).fill({ color: COLORS.hull });
      body.rect(-6, -3, 8, 6).fill({ color: COLORS.hull });
      lightPts.push({ x: 33, y: -10, c: COLORS.warn, ph: 0.4 }, { x: -2, y: 0, c: COLORS.light, ph: 1.4 });
      return finish(36);
    }
    default: {
      // pirate base: lopsided hull, spikes, red lights
      const n = 7;
      const pts: number[] = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const rr = (i % 2 ? 8 : 17 + r(`s${i}`) * 5) * big;
        pts.push(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      body.poly(pts).fill({ color: 0x3a2024 });
      body.poly(pts).stroke({ width: 1.2, color: 0xd0607a, alpha: 0.9 });
      lightPts.push({ x: 0, y: 0, c: 0xff4040, ph: 0 });
      for (let i = 0; i < n; i += 2)
        lightPts.push({ x: pts[i * 2] * 0.8, y: pts[i * 2 + 1] * 0.8, c: 0xff6a4a, ph: i * 0.5 });
      return finish(24);
    }
  }

  function finish(radius: number): StationView {
    return {
      container,
      radius,
      update(time, reduced) {
        spin.rotation = reduced ? 0 : time * 0.25;
        lights.clear();
        const t = reduced ? 0 : time;
        for (const p of lightPts) {
          const on = 0.45 + 0.55 * Math.max(0, Math.sin(t * 3 + p.ph));
          // spinning parts carry their lights with them
          lights.circle(p.x, p.y, 1.6).fill({ color: p.c, alpha: reduced ? 0.9 : on });
          lights.circle(p.x, p.y, 3.4).fill({ color: p.c, alpha: (reduced ? 0.25 : on) * 0.25 });
        }
      },
    };
  }
}
