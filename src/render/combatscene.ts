import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import type { CCrew, CShip, CombatEvent, CombatState, Projectile } from '../core/combat/types';
import { hullSlots } from '../core/ship';
import { createNebula, createStarfield } from './materials';
import type { Scene } from './stage';

export const CELL = 58;

/** One-letter room markers (Czech initials) so rooms are not told apart by colour alone. */
const KIND_LETTER: Record<string, string> = {
  reactor: 'R',
  engine: 'M',
  jump: 'S',
  life: 'P',
  sensors: 'Z',
  shield: 'Š',
  cooler: 'C',
  radiator: 'D',
  repair: 'O',
  cargo: 'N',
  quarters: 'U',
};
const MOVE_TIME = 1.1;

const KIND_COLOR: Record<string, number> = {
  energy: 0xff5d73,
  kinetic: 0xffb454,
  missile: 0xff8a3d,
  ion: 0x5ec8ff,
  drones: 0xb58cff,
  teleporter: 0x6dffd6,
  shield: 0x5a8bff,
  reactor: 0xffe066,
  engine: 0x59e1c5,
  jump: 0xc08cff,
  life: 0x7bf08c,
  sensors: 0x9aa8c7,
  cooler: 0x7fd6ff,
  radiator: 0xffa07a,
  repair: 0xf2c94c,
  cargo: 0x8a93a8,
};
const ROLE_COLOR: Record<string, number> = {
  pilot: 0x59e1c5,
  engineer: 0xffe066,
  gunner: 0xff8a8a,
  medic: 0x7bf08c,
  trader: 0xe0b0ff,
  scientist: 0x8ab4ff,
};
const PROJ_COLOR: Record<string, number> = {
  energy: 0xff4d6d,
  kinetic: 0xffd36b,
  missile: 0xff9a4d,
  ion: 0x6fd3ff,
  drone: 0xc9a6ff,
};

export interface CombatHandlers {
  /** A room was clicked (no drag): ship side and indices. */
  room(side: 'player' | 'enemy', ship: number, room: number): void;
  /** A player crew member was picked. */
  crew(id: string): void;
  /** A crew member was dragged onto one of the player's rooms. */
  move(id: string, room: number): void;
}

export interface CombatScene extends Scene {
  setSelection(sel: { crewId: string | null; weaponId: string | null }): void;
  /** Visual effects for the events produced by the simulation. */
  onEvents(events: CombatEvent[]): void;
  setInsets(top: number, bottom: number): void;
  setEffects(opts: { shake: boolean; reduced: boolean }): void;
  readonly handlers: CombatHandlers;
  /** Screen position of a room (for tests and tutorials). */
  roomScreenPos(side: 'player' | 'enemy', ship: number, room: number): { x: number; y: number } | null;
}

interface Particle {
  s: Sprite;
  vx: number;
  vy: number;
  life: number;
  max: number;
  grow: number;
  alpha: number;
}

interface ShipView {
  ship: CShip;
  root: Container;
  hull: Graphics;
  dyn: Graphics;
  labels: Map<number, Text>;
  letters: Text[];
  o2: Text[];
  cols: number;
  rows: number;
  flip: boolean;
  scale: number;
  cx: number;
  cy: number;
  fade: number;
  ripples: { x: number; y: number; t: number }[];
  pos: { x: number; y: number }[];
}

let glowTex: Texture | null = null;
function glow(): Texture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  glowTex = Texture.from(c);
  return glowTex;
}

export function createCombatScene(
  state: CombatState,
  driver: (dt: number) => CombatEvent[],
  seed: number,
): CombatScene {
  const container = new Container();
  const nebula = createNebula([0.05, 0.08, 0.2], [0.24, 0.08, 0.2], [0.05, 0.16, 0.26], 0.55);
  const stars = createStarfield(0.6);
  container.addChild(nebula.mesh, stars.mesh);
  const world = new Container();
  container.addChild(world);
  const fx = new Container();
  const projLayer = new Graphics();
  let W = 800;
  let H = 600;
  let insetTop = 0;
  let insetBottom = 0;
  let shakeOn = true;
  let reduced = false;
  let shake = 0;
  let sel: { crewId: string | null; weaponId: string | null } = { crewId: null, weaponId: null };
  let rnd = seed || 1;
  const rand = () => {
    rnd = (rnd * 16807) % 2147483647;
    return rnd / 2147483647;
  };

  const views: ShipView[] = [];
  const all: CShip[] = [state.player, ...state.enemies];
  for (const s of all) {
    const slots = hullSlots(s.hullId);
    const cols = Math.max(...slots.map((q) => q.x)) + 1;
    const rows = Math.max(...slots.map((q) => q.y)) + 1;
    const root = new Container();
    const hull = new Graphics();
    const dyn = new Graphics();
    root.addChild(hull, dyn);
    world.addChild(root);
    views.push({
      ship: s,
      root,
      hull,
      dyn,
      labels: new Map(),
      letters: [],
      o2: [],
      cols,
      rows,
      flip: s.side === 'player',
      scale: 1,
      cx: 0,
      cy: 0,
      fade: 1,
      ripples: [],
      pos: [],
    });
  }
  world.addChild(projLayer, fx);
  const particles: Particle[] = [];
  const pool: Sprite[] = [];

  function spawn(
    x: number,
    y: number,
    color: number,
    o: { vx?: number; vy?: number; life?: number; size?: number; grow?: number; alpha?: number } = {},
  ): void {
    if (particles.length > (reduced ? 120 : 360)) return;
    const s = pool.pop() ?? new Sprite(glow());
    s.anchor.set(0.5);
    s.blendMode = 'add';
    s.tint = color;
    s.x = x;
    s.y = y;
    const size = o.size ?? 0.4;
    s.scale.set(size);
    s.alpha = o.alpha ?? 1;
    fx.addChild(s);
    particles.push({
      s,
      vx: o.vx ?? 0,
      vy: o.vy ?? 0,
      life: o.life ?? 0.6,
      max: o.life ?? 0.6,
      grow: o.grow ?? 0,
      alpha: o.alpha ?? 1,
    });
  }

  function viewOf(side: 'player' | 'enemy', index: number): ShipView | undefined {
    return side === 'player' ? views[0] : views[1 + index];
  }

  function roomXY(v: ShipView, room: number): { x: number; y: number } {
    return v.pos[room] ?? { x: v.cx, y: v.cy };
  }

  function layout(): void {
    const portrait = H - insetBottom - insetTop > W * 0.9 && W < 700;
    const top = insetTop + 8;
    const bottom = H - insetBottom - 8;
    const n = state.enemies.length;
    const place = (v: ShipView, x0: number, y0: number, x1: number, y1: number) => {
      const w = v.cols * CELL + 140;
      const h = v.rows * CELL + 110;
      v.scale = Math.min((x1 - x0) / w, (y1 - y0) / h, 1.5);
      v.cx = (x0 + x1) / 2;
      v.cy = (y0 + y1) / 2;
      v.root.position.set(v.cx, v.cy);
      v.root.scale.set(v.scale);
      v.pos = hullSlots(v.ship.hullId).map((sl) => {
        const gx = v.flip ? v.cols - 1 - sl.x : sl.x;
        const lx = (gx - (v.cols - 1) / 2) * CELL;
        const ly = (sl.y - (v.rows - 1) / 2) * CELL;
        return { x: v.cx + lx * v.scale, y: v.cy + ly * v.scale };
      });
      drawHull(v);
    };
    if (portrait) {
      const mid = (top + bottom) / 2;
      place(views[0], 8, top, W - 8, mid - 4);
      const bandH = (bottom - mid) / Math.max(1, n);
      for (let i = 0; i < n; i++)
        place(views[1 + i], 8, mid + 4 + i * bandH, W - 8, mid + 4 + (i + 1) * bandH - 4);
    } else {
      place(views[0], W * 0.04, top, W * 0.47, bottom);
      const bandH = (bottom - top) / Math.max(1, n);
      for (let i = 0; i < n; i++)
        place(views[1 + i], W * 0.53, top + i * bandH, W * 0.96, top + (i + 1) * bandH);
    }
  }

  function localPos(v: ShipView, room: number): { x: number; y: number } {
    const sl = hullSlots(v.ship.hullId)[room];
    const gx = v.flip ? v.cols - 1 - sl.x : sl.x;
    return { x: (gx - (v.cols - 1) / 2) * CELL, y: (sl.y - (v.rows - 1) / 2) * CELL };
  }

  function drawHull(v: ShipView): void {
    const g = v.hull;
    g.clear();
    const enemy = v.ship.side === 'enemy';
    const body = enemy ? 0x3a2430 : 0x1f3350;
    const edge = enemy ? 0xd0607a : 0x7ba2de;
    // nose and tail
    let minX = Infinity;
    let maxX = -Infinity;
    let sumY = 0;
    for (let i = 0; i < v.ship.rooms.length; i++) {
      const p = localPos(v, i);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      sumY += p.y;
    }
    const midY = sumY / v.ship.rooms.length;
    const noseDir = v.flip ? 1 : -1;
    const noseX = (noseDir === 1 ? maxX : minX) + noseDir * (CELL / 2 + 4);
    const tailX = (noseDir === 1 ? minX : maxX) - noseDir * (CELL / 2 + 4);
    g.poly([noseX, midY, noseX - noseDir * 34, midY - 30, noseX - noseDir * 34, midY + 30]).fill({
      color: body,
      alpha: 0.95,
    });
    g.poly([noseX, midY, noseX - noseDir * 34, midY - 30, noseX - noseDir * 34, midY + 30]).stroke({
      width: 2,
      color: edge,
      alpha: 0.8,
    });
    g.circle(tailX, midY, 14).fill({ color: 0x59e1c5, alpha: 0.18 });
    for (let i = 0; i < v.ship.rooms.length; i++) {
      const p = localPos(v, i);
      g.roundRect(p.x - CELL / 2 - 3, p.y - CELL / 2 - 3, CELL + 6, CELL + 6, 9).fill({
        color: body,
        alpha: 0.96,
      });
      g.roundRect(p.x - CELL / 2 - 3, p.y - CELL / 2 - 3, CELL + 6, CELL + 6, 9).stroke({
        width: 2,
        color: edge,
        alpha: 0.75,
      });
    }
    // labels for weapon rooms
    for (const [room, t] of v.labels) {
      void room;
      t.destroy();
    }
    v.labels.clear();
    for (const t of [...v.letters, ...v.o2]) t.destroy();
    v.letters = [];
    v.o2 = [];
    v.ship.rooms.forEach((r, i) => {
      const p = localPos(v, i);
      const letter = r.kind ? KIND_LETTER[r.kind] : undefined;
      if (letter) {
        const t = new Text({
          text: letter,
          style: { fontFamily: 'system-ui, sans-serif', fontSize: 14, fontWeight: '700', fill: 0xffffff },
        });
        t.alpha = 0.8;
        t.anchor.set(0.5);
        t.position.set(p.x + CELL / 2 - 11, p.y - CELL / 2 + 11);
        v.root.addChild(t);
        v.letters.push(t);
      }
      const o = new Text({
        text: '',
        style: { fontFamily: 'system-ui, sans-serif', fontSize: 11, fontWeight: '700', fill: 0x9fe8ff },
      });
      o.anchor.set(0.5);
      o.position.set(p.x, p.y - 2);
      o.visible = false;
      v.root.addChild(o);
      v.o2[i] = o;
    });
    if (v.ship.side === 'player') {
      v.ship.weapons.forEach((w, i) => {
        const t = new Text({
          text: String(i + 1),
          style: { fontFamily: 'system-ui, sans-serif', fontSize: 15, fontWeight: '700', fill: 0xffffff },
        });
        const p = localPos(v, w.room);
        t.anchor.set(0.5);
        t.position.set(p.x - CELL / 2 + 10, p.y - CELL / 2 + 10);
        v.root.addChild(t);
        v.labels.set(w.room, t);
      });
    }
  }

  function drawShip(v: ShipView, time: number): void {
    const s = v.ship;
    const g = v.dyn;
    g.clear();
    const dead = !s.alive;
    const gone = s.out === 'fled';
    v.fade += (((dead || gone ? 0.0 : 1) - v.fade) * 0.04) as number;
    v.root.alpha = dead ? Math.max(0.18, v.fade) : gone ? Math.max(0, v.fade) : 1;
    s.rooms.forEach((r, i) => {
      const p = localPos(v, i);
      const x = p.x - CELL / 2;
      const y = p.y - CELL / 2;
      const col = KIND_COLOR[r.kind ?? ''] ?? 0x4a5670;
      const hp = r.kind ? r.sys / 100 : 1;
      g.roundRect(x + 2, y + 2, CELL - 4, CELL - 4, 7).fill({
        color: r.kind ? col : 0x20283a,
        alpha: r.kind ? 0.18 + 0.4 * hp : 0.5,
      });
      if (r.o2 < 85)
        g.roundRect(x + 2, y + 2, CELL - 4, CELL - 4, 7).fill({
          color: 0x0a0c20,
          alpha: (1 - r.o2 / 100) * 0.62,
        });
      if (r.fire > 0) {
        const fl = reduced ? 1 : 0.6 + 0.4 * Math.sin(time * 11 + i * 2.1);
        g.roundRect(x + 2, y + 2, CELL - 4, CELL - 4, 7).fill({
          color: 0xff7a1a,
          alpha: Math.min(0.8, 0.25 + r.fire / 120) * fl,
        });
      }
      if (r.sys <= 0 && r.kind)
        g.moveTo(x + 8, y + 8)
          .lineTo(x + CELL - 8, y + CELL - 8)
          .moveTo(x + CELL - 8, y + 8)
          .lineTo(x + 8, y + CELL - 8)
          .stroke({ width: 3, color: 0xff4d4d, alpha: 0.8 });
      // state glyphs (shape + colour, never colour alone)
      if (r.fire > 0) {
        const fx0 = x + CELL - 16;
        const fy0 = y + 26;
        g.poly([fx0, fy0 - 9, fx0 + 6, fy0 + 1, fx0 + 3, fy0 + 8, fx0 - 3, fy0 + 8, fx0 - 6, fy0 + 1]).fill({
          color: 0xff7a1a,
        });
        g.poly([fx0, fy0 - 2, fx0 + 3, fy0 + 3, fx0, fy0 + 7, fx0 - 3, fy0 + 3]).fill({ color: 0xffe08a });
      }
      if (r.breach > 0) {
        g.moveTo(x + 6, y + CELL * 0.45)
          .lineTo(x + 18, y + CELL * 0.6)
          .lineTo(x + 28, y + CELL * 0.42)
          .lineTo(x + 40, y + CELL * 0.62)
          .lineTo(x + CELL - 6, y + CELL * 0.48)
          .stroke({ width: 3, color: 0xffffff, alpha: 0.95 });
      }
      if (r.ion > 0) {
        const bx = x + 14;
        const by = y + 28;
        g.poly([
          bx + 3,
          by - 9,
          bx - 5,
          by + 2,
          bx,
          by + 2,
          bx - 3,
          by + 10,
          bx + 6,
          by - 2,
          bx + 1,
          by - 2,
        ]).fill({ color: 0xffe14d });
      }
      const lab = v.o2[i];
      if (lab) {
        const low = r.o2 < 50 && s.alive;
        lab.visible = low;
        if (low) lab.text = `O₂ ${Math.round(r.o2)}%`;
      }
      let outline = col;
      let ow = 1.5;
      if (r.ion > 0) {
        outline = 0x6fd3ff;
        ow = 3;
      }
      if (r.breach > 0) {
        outline = 0xffffff;
        ow = 2.5;
      }
      g.roundRect(x + 2, y + 2, CELL - 4, CELL - 4, 7).stroke({
        width: ow,
        color: outline,
        alpha: r.kind ? 0.9 : 0.25,
      });
      // system health bar
      if (r.kind) {
        g.rect(x + 7, y + CELL - 11, CELL - 14, 4).fill({ color: 0x000000, alpha: 0.55 });
        g.rect(x + 7, y + CELL - 11, (CELL - 14) * hp, 4).fill({
          color: hp > 0.6 ? 0x59e1a0 : hp > 0.3 ? 0xffc857 : 0xff5d5d,
          alpha: 0.95,
        });
      }
    });
    // weapon charge pips
    s.weapons.forEach((w, wi) => {
      const p = localPos(v, w.room);
      const x = p.x - CELL / 2 + 7;
      const y = p.y - CELL / 2 + 24;
      const col = KIND_COLOR[w.kind] ?? 0xffffff;
      g.rect(x, y, CELL - 14, 5).fill({ color: 0x000000, alpha: 0.5 });
      g.rect(x, y, (CELL - 14) * Math.min(1, w.charge), 5).fill({
        color: col,
        alpha: w.charge >= 1 ? 1 : 0.7,
      });
      if (s.side === 'player' && sel.weaponId === w.id)
        g.roundRect(p.x - CELL / 2 - 1, p.y - CELL / 2 - 1, CELL + 2, CELL + 2, 9).stroke({
          width: 3,
          color: 0xffffff,
          alpha: 0.95,
        });
      void wi;
    });
    // crew
    const slotCount = new Map<number, number>();
    const draw = (m: CCrew) => {
      let from = localPos(v, m.room);
      if (m.path.length) {
        const to = localPos(v, m.path[0]);
        const k = Math.max(0, Math.min(1, 1 - m.stepT / MOVE_TIME));
        from = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
      }
      const n = slotCount.get(m.room) ?? 0;
      slotCount.set(m.room, n + 1);
      const ox = ((n % 3) - 1) * 13;
      const oy = Math.floor(n / 3) * 13 + 8;
      const px = from.x + ox;
      const py = from.y + oy;
      const ally = (s.side === 'player' && m.boardedOn < 0) || (s.side === 'enemy' && m.boardedOn >= 0);
      const col = ally ? (ROLE_COLOR[m.role] ?? 0xffffff) : 0xff6a6a;
      if (m.hp <= 0) return;
      g.circle(px, py, 6.2).fill({ color: col, alpha: 0.95 });
      g.circle(px, py, 6.2).stroke({
        width: sel.crewId === m.id ? 3 : 1.2,
        color: sel.crewId === m.id ? 0xffffff : 0x0b0f18,
      });
      g.rect(px - 7, py + 8, 14, 2.5).fill({ color: 0x000000, alpha: 0.6 });
      g.rect(px - 7, py + 8, 14 * Math.max(0, m.hp / m.maxHp), 2.5).fill({
        color: m.hp / m.maxHp > 0.5 ? 0x59e1a0 : 0xff6a6a,
      });
      if (m.task === 'repair' || m.task === 'fire' || m.task === 'breach')
        g.circle(px, py, 9).stroke({ width: 1, color: 0xffe066, alpha: 0.6 + 0.4 * Math.sin(time * 8) });
    };
    for (const m of s.crew) draw(m);
    // enemy boarders standing on this ship are in `crew` of the invaded ship already
    // targeting reticles from the player's weapons
    if (s.side === 'enemy') {
      state.player.weapons.forEach((w, wi) => {
        if (!w.target || w.target.ship !== s.index) return;
        const p = localPos(v, w.target.room);
        const col = KIND_COLOR[w.kind] ?? 0xffffff;
        const rr = CELL / 2 - 5 - (sel.weaponId === w.id ? 0 : 2);
        g.circle(p.x, p.y, rr).stroke({ width: sel.weaponId === w.id ? 3 : 1.6, color: col, alpha: 0.95 });
        g.moveTo(p.x - rr - 5, p.y)
          .lineTo(p.x - rr + 5, p.y)
          .moveTo(p.x + rr - 5, p.y)
          .lineTo(p.x + rr + 5, p.y)
          .moveTo(p.x, p.y - rr - 5)
          .lineTo(p.x, p.y - rr + 5)
          .moveTo(p.x, p.y + rr - 5)
          .lineTo(p.x, p.y + rr + 5)
          .stroke({ width: 1.6, color: col, alpha: 0.95 });
        void wi;
      });
    }
    // shield bubble: one ring per shield layer
    if (s.shieldMax > 0 && s.alive) {
      const layers = Math.max(1, Math.ceil(s.shieldMax / 15));
      const filled = s.shield / 15;
      const rx = (v.cols * CELL) / 2 + 52;
      const ry = (v.rows * CELL) / 2 + 40;
      for (let L = 0; L < layers; L++) {
        const k = Math.max(0, Math.min(1, filled - L));
        if (k <= 0.02) continue;
        const grow = L * 7;
        g.ellipse(0, 0, rx + grow, ry + grow).fill({ color: 0x4aa8ff, alpha: 0.05 * k });
        g.ellipse(0, 0, rx + grow, ry + grow).stroke({ width: 2, color: 0x7fd0ff, alpha: 0.28 + 0.5 * k });
      }
    }
    // ripples on the shield
    for (let i = v.ripples.length - 1; i >= 0; i--) {
      const r = v.ripples[i];
      r.t += 0.03;
      if (r.t >= 1) {
        v.ripples.splice(i, 1);
        continue;
      }
      g.circle(r.x, r.y, 10 + r.t * 46).stroke({
        width: 3 * (1 - r.t),
        color: 0xbfe6ff,
        alpha: 0.9 * (1 - r.t),
      });
    }
    // drones
    s.drones.forEach((d, i) => {
      const a = time * 1.6 + i * 2.1;
      const dx = Math.cos(a) * (v.cols * CELL * 0.5 + 62);
      const dy = Math.sin(a * 1.3) * (v.rows * CELL * 0.5 + 44);
      g.poly([dx, dy - 6, dx + 6, dy + 5, dx - 6, dy + 5]).fill({
        color: d.kind === 'attack' ? 0xff8ac1 : 0x8affc1,
        alpha: 0.9,
      });
    });
    if (s.overheated)
      g.roundRect(
        (-v.cols * CELL) / 2 - 8,
        (-v.rows * CELL) / 2 - 8,
        v.cols * CELL + 16,
        v.rows * CELL + 16,
        12,
      ).stroke({
        width: 3,
        color: 0xff5d3a,
        alpha: 0.5 + 0.4 * Math.sin(time * 10),
      });
  }

  function emitRoomEffects(v: ShipView, dt: number): void {
    if (!v.ship.alive || reduced) return;
    v.ship.rooms.forEach((r, i) => {
      const p = roomXY(v, i);
      if (r.fire > 0 && rand() < dt * 9)
        spawn(
          p.x + (rand() - 0.5) * 24 * v.scale,
          p.y + (rand() - 0.2) * 20 * v.scale,
          rand() < 0.5 ? 0xff9a3a : 0xffd36b,
          {
            vy: -30 - rand() * 30,
            life: 0.5,
            size: 0.28 * v.scale + 0.1,
            grow: -0.2,
          },
        );
      if ((r.fire > 0 || r.sys < 40) && r.kind && rand() < dt * 3)
        spawn(p.x + (rand() - 0.5) * 20 * v.scale, p.y - 6 * v.scale, 0x6b7280, {
          vy: -22,
          vx: (rand() - 0.5) * 14,
          life: 1.4,
          size: 0.35 * v.scale + 0.15,
          grow: 0.4,
          alpha: 0.5,
        });
      if (r.sys < 30 && r.kind && rand() < dt * 2)
        spawn(p.x + (rand() - 0.5) * 30 * v.scale, p.y + (rand() - 0.5) * 30 * v.scale, 0xfff2a8, {
          vx: (rand() - 0.5) * 140,
          vy: (rand() - 0.5) * 140,
          life: 0.25,
          size: 0.12,
        });
      if (r.breach > 0 && rand() < dt * 6)
        spawn(p.x, p.y, 0xbfe9ff, {
          vx: (v.flip ? -1 : 1) * (40 + rand() * 40),
          vy: (rand() - 0.5) * 30,
          life: 0.6,
          size: 0.16,
        });
    });
  }

  function projectilePos(p: Projectile): { x: number; y: number; ang: number } | null {
    const to = viewOf(p.from === 'player' ? 'enemy' : 'player', p.toShip);
    const from = viewOf(p.from, p.fromShip);
    if (!to || !from) return null;
    const a = p.fromRoom >= 0 ? roomXY(from, p.fromRoom) : { x: from.cx, y: from.cy };
    const b = roomXY(to, p.toRoom);
    const k = 1 - Math.max(0, Math.min(1, p.t / Math.max(0.01, p.total)));
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, ang: Math.atan2(b.y - a.y, b.x - a.x) };
  }

  function drawProjectiles(): void {
    const g = projLayer;
    g.clear();
    for (const p of state.projectiles) {
      const pos = projectilePos(p);
      if (!pos) continue;
      const col = PROJ_COLOR[p.kind] ?? 0xffffff;
      const dx = Math.cos(pos.ang);
      const dy = Math.sin(pos.ang);
      if (p.kind === 'energy' || p.kind === 'ion') {
        const len = 30;
        g.moveTo(pos.x - dx * len, pos.y - dy * len)
          .lineTo(pos.x, pos.y)
          .stroke({ width: 7, color: col, alpha: 0.25 });
        g.moveTo(pos.x - dx * len, pos.y - dy * len)
          .lineTo(pos.x, pos.y)
          .stroke({ width: 2.5, color: 0xffffff, alpha: 0.95 });
      } else if (p.kind === 'missile') {
        g.circle(pos.x, pos.y, 4.5).fill({ color: 0xffffff });
        g.moveTo(pos.x - dx * 26, pos.y - dy * 26)
          .lineTo(pos.x, pos.y)
          .stroke({ width: 5, color: col, alpha: 0.5 });
        if (!reduced && rand() < 0.7)
          spawn(pos.x - dx * 6, pos.y - dy * 6, 0xffb36b, { life: 0.4, size: 0.2, grow: -0.3 });
      } else {
        g.circle(pos.x, pos.y, 4).fill({ color: col });
        g.circle(pos.x, pos.y, 9).fill({ color: col, alpha: 0.25 });
      }
    }
  }

  function explode(x: number, y: number, size: number): void {
    const n = reduced ? 14 : 46;
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const sp = 40 + rand() * 220 * size;
      spawn(x, y, [0xffe08a, 0xff8a3d, 0xff4d3a, 0xffffff][i % 4], {
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.5 + rand() * 0.7,
        size: (0.3 + rand() * 0.5) * size,
        grow: -0.2,
      });
    }
    if (!reduced)
      for (let i = 0; i < 10; i++)
        spawn(x, y, 0x555b66, {
          vx: (rand() - 0.5) * 80,
          vy: (rand() - 0.5) * 80,
          life: 1.6,
          size: 0.8 * size,
          grow: 0.7,
          alpha: 0.5,
        });
  }

  function pick(x: number, y: number): { v: ShipView; room: number } | null {
    for (const v of views) {
      if (v.ship.out === 'fled') continue;
      for (let i = 0; i < v.pos.length; i++) {
        const p = v.pos[i];
        const h = (CELL / 2) * v.scale;
        if (Math.abs(x - p.x) <= h && Math.abs(y - p.y) <= h) return { v, room: i };
      }
    }
    return null;
  }

  function pickCrew(x: number, y: number): CCrew | null {
    const v = views[0];
    let best: CCrew | null = null;
    let bd = (22 * Math.max(0.8, v.scale)) ** 2;
    const count = new Map<number, number>();
    for (const m of v.ship.crew) {
      let from = roomXY(v, m.room);
      if (m.path.length) {
        const to = roomXY(v, m.path[0]);
        const k = Math.max(0, Math.min(1, 1 - m.stepT / MOVE_TIME));
        from = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
      }
      const n = count.get(m.room) ?? 0;
      count.set(m.room, n + 1);
      const px = from.x + ((n % 3) - 1) * 13 * v.scale;
      const py = from.y + (Math.floor(n / 3) * 13 + 8) * v.scale;
      const d = (px - x) ** 2 + (py - y) ** 2;
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    return best;
  }

  const handlers: CombatHandlers = { room: () => {}, crew: () => {}, move: () => {} };
  let drag: { id: string; sx: number; sy: number } | null = null;
  container.eventMode = 'static';
  container.on('pointerdown', (e) => {
    const m = pickCrew(e.global.x, e.global.y);
    if (m && (!sel.crewId || m.id === sel.crewId)) {
      drag = { id: m.id, sx: e.global.x, sy: e.global.y };
      handlers.crew(m.id);
    }
  });
  container.on('pointerup', (e) => {
    const hit = pick(e.global.x, e.global.y);
    if (drag) {
      const d = drag;
      drag = null;
      const moved = Math.hypot(e.global.x - d.sx, e.global.y - d.sy) > 12;
      if (hit && hit.v.ship.side === 'player') {
        handlers.move(d.id, hit.room);
        return;
      }
      if (!moved) return;
    }
    if (hit) handlers.room(hit.v.ship.side, hit.v.ship.index, hit.room);
  });
  container.on('pointerupoutside', () => (drag = null));

  return {
    container,
    handlers,
    setSelection(s) {
      sel = s;
    },
    setInsets(top, bottom) {
      insetTop = top;
      insetBottom = bottom;
      layout();
    },
    setEffects(o) {
      shakeOn = o.shake;
      reduced = o.reduced;
    },
    roomScreenPos(side, ship, room) {
      const v = viewOf(side, ship);
      return v && v.pos[room] ? { ...v.pos[room] } : null;
    },
    resize(w, h) {
      W = w;
      H = h;
      container.hitArea = { contains: () => true } as never;
      for (const m of [nebula.mesh, stars.mesh]) {
        m.position.set(W / 2, H / 2);
        m.scale.set(W / 2, H / 2);
      }
      layout();
    },
    onEvents(events) {
      for (const e of events) {
        switch (e.t) {
          case 'hit': {
            const v = viewOf(e.side, e.ship);
            if (!v) break;
            const p = roomXY(v, e.room);
            if (e.shield) {
              const lp = localPos(v, e.room);
              v.ripples.push({ x: lp.x, y: lp.y, t: 0 });
              for (let i = 0; i < (reduced ? 2 : 6); i++)
                spawn(p.x, p.y, 0x9fdcff, {
                  vx: (rand() - 0.5) * 120,
                  vy: (rand() - 0.5) * 120,
                  life: 0.35,
                  size: 0.18,
                });
            } else {
              for (let i = 0; i < (reduced ? 4 : 14); i++)
                spawn(p.x, p.y, i % 2 ? 0xffb36b : 0xffffff, {
                  vx: (rand() - 0.5) * 260,
                  vy: (rand() - 0.5) * 260,
                  life: 0.35 + rand() * 0.3,
                  size: 0.2 + rand() * 0.2,
                });
              if (e.side === 'player') shake = Math.min(14, shake + 3 + Math.min(6, e.dmg * 0.12));
            }
            break;
          }
          case 'explode': {
            const v = viewOf(e.side, e.ship);
            if (!v) break;
            explode(v.cx, v.cy, 1.6);
            shake = Math.min(20, shake + 12);
            break;
          }
          case 'fire': {
            const v = viewOf(e.side, e.ship);
            if (v && e.room >= 0 && !reduced) {
              const p = roomXY(v, e.room);
              spawn(p.x, p.y, PROJ_COLOR[e.kind] ?? 0xffffff, { life: 0.2, size: 0.5, grow: 1 });
            }
            break;
          }
          case 'breach': {
            const v = viewOf(e.side, e.ship);
            if (v) {
              const p = roomXY(v, e.room);
              for (let i = 0; i < 8 && !reduced; i++)
                spawn(p.x, p.y, 0xbfe9ff, {
                  vx: (rand() - 0.5) * 160,
                  vy: (rand() - 0.5) * 160,
                  life: 0.5,
                  size: 0.2,
                });
            }
            break;
          }
          default:
            break;
        }
      }
    },
    update(dt, time) {
      const evs = driver(dt);
      if (evs.length) this.onEvents(evs);
      for (const v of views) {
        drawShip(v, time);
        emitRoomEffects(v, dt);
      }
      drawProjectiles();
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) {
          fx.removeChild(p.s);
          pool.push(p.s);
          particles.splice(i, 1);
          continue;
        }
        p.s.x += p.vx * dt;
        p.s.y += p.vy * dt;
        p.s.scale.set(Math.max(0.02, p.s.scale.x + p.grow * dt));
        p.s.alpha = p.alpha * (p.life / p.max);
      }
      const aspect = W / H;
      nebula.set({ time, offX: 0.3, offY: 0.1, scale: 1.8, aspectX: aspect, aspectY: 1 });
      stars.set({
        time,
        offX: reduced ? 0 : time * 0.05,
        offY: 0,
        aspectX: aspect,
        aspectY: 1,
        twinkle: reduced ? 0 : 1,
      });
      if (shake > 0.2 && shakeOn && !reduced) {
        world.position.set((rand() - 0.5) * shake, (rand() - 0.5) * shake);
        shake *= Math.pow(0.001, dt);
      } else {
        world.position.set(0, 0);
        shake = 0;
      }
    },
    destroy() {
      container.destroy({ children: true });
    },
  };
}
