import { Container, Graphics } from 'pixi.js';
import { hullSlots } from '../core/ship';
import { MODULES_BY_ID } from '../content/modules';
import { hashToUnit } from '../core/rng';
import type { ModuleInstance } from '../core/types';
import { hsl } from './materials';

/**
 * Procedural vector ship silhouettes. Drawn nose-right in a ~360x180 box centred on the origin.
 * Installed modules are visible on the hull at the position of their slot in the hull grid.
 */

type P = [number, number];

interface Shape {
  body: P[];
  fins: P[][];
  nozzles: P[];
  /** Rectangle where slot cells are laid out. */
  area: { x0: number; y0: number; x1: number; y1: number };
  cockpit: P;
}

const SHAPES: Record<string, Shape> = {
  wayfarer: {
    body: [
      [-150, -26],
      [-90, -42],
      [60, -34],
      [140, -8],
      [160, 0],
      [140, 8],
      [60, 34],
      [-90, 42],
      [-150, 26],
    ],
    fins: [
      [
        [-70, -40],
        [-30, -80],
        [10, -80],
        [-5, -36],
      ],
      [
        [-70, 40],
        [-30, 80],
        [10, 80],
        [-5, 36],
      ],
    ],
    nozzles: [
      [-152, -12],
      [-152, 12],
    ],
    area: { x0: -125, y0: -30, x1: 95, y1: 30 },
    cockpit: [118, 0],
  },
  kestrel: {
    body: [
      [-160, -14],
      [-100, -24],
      [80, -16],
      [170, -3],
      [180, 0],
      [170, 3],
      [80, 16],
      [-100, 24],
      [-160, 14],
    ],
    fins: [
      [
        [-90, -22],
        [-50, -62],
        [-20, -62],
        [-40, -20],
      ],
      [
        [-90, 22],
        [-50, 62],
        [-20, 62],
        [-40, 20],
      ],
    ],
    nozzles: [[-162, 0]],
    area: { x0: -130, y0: -18, x1: 100, y1: 18 },
    cockpit: [130, 0],
  },
  mule: {
    body: [
      [-150, -44],
      [-110, -56],
      [90, -56],
      [130, -30],
      [140, 0],
      [130, 30],
      [90, 56],
      [-110, 56],
      [-150, 44],
    ],
    fins: [
      [
        [-30, -56],
        [-10, -74],
        [40, -74],
        [30, -56],
      ],
      [
        [-30, 56],
        [-10, 74],
        [40, 74],
        [30, 56],
      ],
    ],
    nozzles: [
      [-152, -22],
      [-152, 22],
    ],
    area: { x0: -120, y0: -46, x1: 100, y1: 46 },
    cockpit: [112, 0],
  },
  swift: {
    body: [
      [-120, -12],
      [-60, -20],
      [90, -10],
      [175, 0],
      [90, 10],
      [-60, 20],
      [-120, 12],
    ],
    fins: [
      [
        [-80, -18],
        [-30, -58],
        [10, -58],
        [0, -16],
      ],
      [
        [-80, 18],
        [-30, 58],
        [10, 58],
        [0, 16],
      ],
    ],
    nozzles: [[-122, 0]],
    area: { x0: -95, y0: -14, x1: 85, y1: 14 },
    cockpit: [120, 0],
  },
  borer: {
    body: [
      [-150, -50],
      [-100, -62],
      [70, -62],
      [110, -44],
      [118, -20],
      [160, -10],
      [160, 10],
      [118, 20],
      [110, 44],
      [70, 62],
      [-100, 62],
      [-150, 50],
    ],
    fins: [
      [
        [-40, -62],
        [-20, -84],
        [30, -84],
        [40, -62],
      ],
      [
        [-40, 62],
        [-20, 84],
        [30, 84],
        [40, 62],
      ],
    ],
    nozzles: [
      [-152, -26],
      [-152, 0],
      [-152, 26],
    ],
    area: { x0: -125, y0: -50, x1: 100, y1: 50 },
    cockpit: [92, 0],
  },
  behemoth: {
    body: [
      [-175, -48],
      [-130, -66],
      [100, -66],
      [150, -40],
      [175, -10],
      [175, 10],
      [150, 40],
      [100, 66],
      [-130, 66],
      [-175, 48],
    ],
    fins: [
      [
        [-60, -66],
        [-30, -88],
        [40, -88],
        [50, -66],
      ],
      [
        [-60, 66],
        [-30, 88],
        [40, 88],
        [50, 66],
      ],
    ],
    nozzles: [
      [-177, -30],
      [-177, 0],
      [-177, 30],
    ],
    area: { x0: -150, y0: -52, x1: 130, y1: 52 },
    cockpit: [140, 0],
  },
};

export interface ShipDrawing {
  nozzles: P[];
  slotRects: { index: number; x: number; y: number; w: number; h: number }[];
}

function poly(g: Graphics, pts: P[], fill: number, alpha = 1): void {
  g.poly(pts.flat()).fill({ color: fill, alpha });
}

export function drawShip(
  g: Graphics,
  hullId: string,
  slots: (ModuleInstance | null)[],
  seedStr: string,
  highlight: number | null = null,
): ShipDrawing {
  g.clear();
  const sh = SHAPES[hullId] ?? SHAPES.wayfarer;
  const hue = hashToUnit(`${seedStr}:hue`);
  const accent = hsl(0.5 + hue * 0.3, 0.7, 0.6);
  const accentHex =
    (Math.round(accent[0] * 255) << 16) | (Math.round(accent[1] * 255) << 8) | Math.round(accent[2] * 255);
  // fins first (behind)
  for (const f of sh.fins) {
    poly(g, f, 0x1c2a44);
    g.poly(f.flat()).stroke({ width: 1.5, color: 0x5b7fb5, alpha: 0.8 });
  }
  // body
  poly(g, sh.body, 0x24344f);
  g.poly(sh.body.flat()).stroke({ width: 2, color: 0x7ba2de, alpha: 0.9 });
  // hull plating lines and accent stripe
  const [ax0, ay0, ax1] = [sh.area.x0 - 4, sh.area.y0, sh.area.x1 + 4];
  g.moveTo(ax0, ay0 - 8)
    .lineTo(ax1, ay0 - 8)
    .stroke({ width: 3, color: accentHex, alpha: 0.85 });
  g.moveTo(ax0, sh.area.y1 + 8)
    .lineTo(ax1, sh.area.y1 + 8)
    .stroke({ width: 1.5, color: accentHex, alpha: 0.5 });
  for (let x = ax0 + 20; x < ax1; x += 38)
    g.moveTo(x, ay0 - 14)
      .lineTo(x, sh.area.y1 + 14)
      .stroke({ width: 1, color: 0x3b5a8a, alpha: 0.35 });
  // cockpit
  g.ellipse(sh.cockpit[0], sh.cockpit[1], 14, 8).fill({ color: 0x8fe3ff, alpha: 0.85 });
  g.ellipse(sh.cockpit[0] + 3, sh.cockpit[1] - 2, 6, 3).fill({ color: 0xffffff, alpha: 0.6 });
  // nozzles
  for (const n of sh.nozzles) {
    g.rect(n[0] - 10, n[1] - 7, 12, 14)
      .fill({ color: 0x172238 })
      .stroke({ width: 1.5, color: 0x7ba2de });
  }
  // slot modules
  const slotDefs = hullSlots(hullId);
  const cols = Math.max(...slotDefs.map((s) => s.x)) + 1;
  const rows = Math.max(...slotDefs.map((s) => s.y)) + 1;
  const aw = sh.area.x1 - sh.area.x0;
  const ah = sh.area.y1 - sh.area.y0;
  const cw = aw / cols;
  const ch = ah / rows;
  const rects: ShipDrawing['slotRects'] = [];
  for (const sd of slotDefs) {
    const cell = { x: sh.area.x0 + sd.x * cw, y: sh.area.y0 + sd.y * ch };
    const pad = 3;
    const w = cw - pad * 2;
    const h = ch - pad * 2;
    const x = cell.x + pad;
    const y = cell.y + pad;
    rects.push({ index: sd.index, x, y, w, h });
    const m = slots[sd.index];
    g.roundRect(x, y, w, h, 4).stroke({
      width: 1,
      color: sd.core ? 0x4cc9f0 : 0x5b7fb5,
      alpha: m ? 0.5 : 0.28,
    });
    if (highlight === sd.index)
      g.roundRect(x - 2, y - 2, w + 4, h + 4, 5).stroke({ width: 2, color: 0xffffff, alpha: 0.95 });
    if (!m) continue;
    const def = MODULES_BY_ID[m.defId];
    drawModule(g, def.kind, x, y, w, h, m.enabled && m.condition > 0, accentHex);
  }
  return { nozzles: sh.nozzles, slotRects: rects };
}

function drawModule(
  g: Graphics,
  kind: string,
  x: number,
  y: number,
  w: number,
  h: number,
  on: boolean,
  accent: number,
): void {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const a = on ? 1 : 0.35;
  const stroke = { width: 1.2, color: 0xb9d4ff, alpha: 0.9 * a };
  switch (kind) {
    case 'reactor':
      g.circle(cx, cy, Math.min(w, h) * 0.38).fill({ color: 0xffb04a, alpha: 0.85 * a });
      g.circle(cx, cy, Math.min(w, h) * 0.2).fill({ color: 0xfff1c9, alpha: a });
      break;
    case 'engine':
      g.rect(x + 2, y + h * 0.2, w - 4, h * 0.6)
        .fill({ color: 0x2f4b7a, alpha: a })
        .stroke(stroke);
      break;
    case 'jump':
      g.ellipse(cx, cy, w * 0.38, h * 0.4).stroke({ width: 2.5, color: 0x9b8cff, alpha: a });
      g.ellipse(cx, cy, w * 0.2, h * 0.22).fill({ color: 0x9b8cff, alpha: 0.5 * a });
      break;
    case 'life':
      g.ellipse(cx, cy, w * 0.4, h * 0.36)
        .fill({ color: 0x4fd18b, alpha: 0.35 * a })
        .stroke({ width: 1.4, color: 0x6ee7a0, alpha: a });
      break;
    case 'sensors':
      g.moveTo(cx - w * 0.3, cy + h * 0.3)
        .lineTo(cx + w * 0.3, cy - h * 0.3)
        .stroke({ width: 2, color: 0xb9d4ff, alpha: a });
      g.circle(cx + w * 0.3, cy - h * 0.3, 3).fill({ color: 0x4cc9f0, alpha: a });
      g.arc(cx, cy + h * 0.2, w * 0.35, Math.PI * 1.1, Math.PI * 1.9).stroke({
        width: 1.5,
        color: 0x4cc9f0,
        alpha: 0.8 * a,
      });
      break;
    case 'cargo':
      g.roundRect(x + 2, y + 2, w - 4, h - 4, 3)
        .fill({ color: 0x6b7f9e, alpha: 0.9 * a })
        .stroke(stroke);
      for (let i = 1; i < 4; i++)
        g.moveTo(x + 2 + ((w - 4) * i) / 4, y + 2)
          .lineTo(x + 2 + ((w - 4) * i) / 4, y + h - 2)
          .stroke({ width: 1, color: 0x2a3a58, alpha: a });
      break;
    case 'fuel':
      g.roundRect(x + 3, y + h * 0.18, w - 6, h * 0.64, h * 0.3)
        .fill({ color: 0xd9a74a, alpha: 0.85 * a })
        .stroke(stroke);
      break;
    case 'cooler':
      for (let i = 0; i < 5; i++)
        g.rect(x + 3 + (i * (w - 6)) / 5, y + 4, (w - 6) / 8, h - 8).fill({
          color: 0x8fe3ff,
          alpha: 0.85 * a,
        });
      break;
    case 'vault':
      g.roundRect(x + 2, y + 2, w - 4, h - 4, 3)
        .fill({ color: 0x3a3f55, alpha: a })
        .stroke({ width: 2, color: 0xf5c26b, alpha: a });
      g.circle(cx, cy, Math.min(w, h) * 0.18).stroke({ width: 1.5, color: 0xf5c26b, alpha: a });
      break;
    case 'laser':
      g.rect(cx - w * 0.2, cy - 3, w * 0.7, 6)
        .fill({ color: 0xff7b7b, alpha: a })
        .stroke(stroke);
      g.circle(cx + w * 0.5, cy, 3.5).fill({ color: 0xffc9c9, alpha: a });
      break;
    case 'refinery':
      g.rect(x + 4, y + h * 0.35, w - 8, h * 0.55)
        .fill({ color: 0x7a6a55, alpha: a })
        .stroke(stroke);
      g.rect(x + w * 0.25, y + 2, 5, h * 0.3).fill({ color: 0x9a8a75, alpha: a });
      g.rect(x + w * 0.6, y + 2, 5, h * 0.3).fill({ color: 0x9a8a75, alpha: a });
      break;
    case 'surface':
      g.arc(cx, cy + 3, w * 0.35, Math.PI, 0).stroke({ width: 2, color: 0x6ee7a0, alpha: a });
      g.moveTo(cx, cy + 3)
        .lineTo(cx, cy - h * 0.25)
        .stroke({ width: 1.5, color: 0x6ee7a0, alpha: a });
      break;
    case 'probe':
      g.rect(x + 4, cy - 4, w - 8, 8)
        .fill({ color: 0x4a5c80, alpha: a })
        .stroke(stroke);
      g.circle(x + w - 6, cy, 3).fill({ color: 0xf5c26b, alpha: a });
      break;
    case 'repair':
      g.moveTo(x + 5, y + h - 5)
        .lineTo(cx, cy)
        .lineTo(x + w - 5, y + 5)
        .stroke({ width: 3, color: 0xf5c26b, alpha: a });
      g.circle(x + w - 5, y + 5, 3).fill({ color: 0xffffff, alpha: a });
      break;
    case 'shield':
      g.arc(cx, cy, Math.min(w, h) * 0.45, -Math.PI * 0.6, Math.PI * 0.6).stroke({
        width: 2.5,
        color: 0x4cc9f0,
        alpha: a,
      });
      g.arc(cx, cy, Math.min(w, h) * 0.3, -Math.PI * 0.6, Math.PI * 0.6).stroke({
        width: 1.5,
        color: 0x4cc9f0,
        alpha: 0.6 * a,
      });
      break;
    case 'amplifier':
      for (let i = 0; i < 4; i++)
        g.ellipse(cx, y + 4 + (i * (h - 8)) / 3, w * 0.35, 2.5).stroke({
          width: 1.5,
          color: accent,
          alpha: a,
        });
      break;
    case 'radiator':
      g.rect(x + 3, y + 3, w - 6, h - 6).fill({ color: 0x2c3c5c, alpha: a });
      for (let i = 0; i < 4; i++)
        g.moveTo(x + 3, y + 6 + i * ((h - 12) / 3))
          .lineTo(x + w - 3, y + 6 + i * ((h - 12) / 3))
          .stroke({ width: 1, color: 0x8fe3ff, alpha: a });
      break;
    case 'quarters':
      g.roundRect(x + 3, y + 4, w - 6, h - 8, 4).fill({ color: 0x35476b, alpha: a });
      for (let i = 0; i < 3; i++)
        g.circle(x + w * (0.25 + i * 0.25), cy, 2.2).fill({ color: 0xfff1b0, alpha: a });
      break;
    case 'scoop':
      g.poly([x + 3, y + 3, x + w - 3, cy - 3, x + w - 3, cy + 3, x + 3, y + h - 3])
        .fill({ color: 0x7ac6d9, alpha: 0.75 * a })
        .stroke(stroke);
      break;
    default:
      g.rect(x + 4, y + 4, w - 8, h - 8).fill({ color: 0x4a5c80, alpha: a });
  }
}

interface Puff {
  g: Graphics;
  x: number;
  y: number;
  life: number;
  max: number;
  v: number;
}

/** Engine exhaust made of fading particles. */
export class Exhaust {
  container = new Container();
  private puffs: Puff[] = [];
  private acc = 0;

  constructor(count = 60) {
    for (let i = 0; i < count; i++) {
      const g = new Graphics();
      g.circle(0, 0, 4).fill({ color: 0xffffff });
      g.visible = false;
      g.blendMode = 'add';
      this.container.addChild(g);
      this.puffs.push({ g, x: 0, y: 0, life: 0, max: 1, v: 0 });
    }
  }

  update(dt: number, nozzles: P[], power: number, reduced: boolean, rand: () => number): void {
    this.acc += dt * 60 * power;
    while (this.acc > 1 && !reduced) {
      this.acc -= 1;
      const n = nozzles[Math.floor(rand() * nozzles.length)];
      const p = this.puffs.find((q) => q.life <= 0);
      if (!p) break;
      p.x = n[0] - 6;
      p.y = n[1] + (rand() - 0.5) * 6;
      p.max = p.life = 0.5 + rand() * 0.5;
      p.v = 70 + rand() * 90;
    }
    for (const p of this.puffs) {
      if (p.life <= 0) {
        p.g.visible = false;
        continue;
      }
      p.life -= dt;
      p.x -= p.v * dt;
      const k = Math.max(0, p.life / p.max);
      p.g.visible = true;
      p.g.position.set(p.x, p.y);
      p.g.scale.set(0.4 + (1 - k) * 1.3);
      p.g.alpha = k * 0.7;
      p.g.tint = k > 0.55 ? 0xcfefff : k > 0.25 ? 0x4cc9f0 : 0x2a5ad6;
    }
    if (reduced) {
      // static glow instead of particles
      this.puffs.forEach((p, i) => {
        const n = nozzles[i % nozzles.length];
        if (i < nozzles.length * 3) {
          p.g.visible = true;
          p.g.position.set(n[0] - 6 - (i % 3) * 8, n[1]);
          p.g.scale.set(1.2 - (i % 3) * 0.3);
          p.g.alpha = 0.5 - (i % 3) * 0.15;
          p.g.tint = 0x4cc9f0;
        } else p.g.visible = false;
      });
    }
  }
}
