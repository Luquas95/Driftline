import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { drawSilhouette } from './shipgen';
import { createNebula, createStarfield, STAR_COLORS, type V3 } from './materials';
import type { Scene } from './stage';
import { dist } from '../core/galaxy';
import type { Galaxy, GameState, SystemStatic } from '../core/types';
import { GOODS_BY_ID } from '../content/goods';
import { prefersReducedMotion } from '../ui/settings';

export type MapFilter = 'normal' | 'prices' | 'contracts' | 'unexplored';

export interface MapOptions {
  galaxy: Galaxy;
  onSelect: (id: number | null) => void;
  onHover?: (id: number | null, x: number, y: number) => void;
}

export interface MapScene extends Scene {
  refresh(state: GameState): void;
  setSelected(id: number | null): void;
  setRoute(path: number[] | null): void;
  setFilter(mode: MapFilter, goodId?: string): void;
  zoomBy(f: number): void;
  centerOn(id: number, zoom?: number): void;
  setMarker(from: number | null, to: number | null, progress: number): void;
  /** Fly the ship silhouette from one system to the next: charge, streak, arrival. `done` runs at the end. */
  playJump(
    from: number,
    to: number,
    hullId: string,
    level: 'full' | 'reduced' | 'off',
    done: () => void,
  ): void;
  isJumping(): boolean;
  skipJump(): void;
  /** Test hook: put the running jump animation at progress u (0..1) without finishing it. */
  seekJump(u: number): void;
  getZoom(): number;
  getCam(): { x: number; y: number; zoom: number };
  /** Screen position of a system (tests and tutorials). */
  systemScreenPos(id: number): { x: number; y: number };
}

const rgbHex = (c: V3): number =>
  (Math.round(c[0] * 255) << 16) | (Math.round(c[1] * 255) << 8) | Math.round(c[2] * 255);

let glowTex: Texture | null = null;
function glowTexture(): Texture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.22)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowTex = Texture.from(c);
  return glowTex;
}

/** Region tint for the galaxy-wide nebula (core warm, rim cold). */
const REGION_NEBULA: Record<string, V3[]> = {
  core: [
    [0.35, 0.16, 0.12],
    [0.5, 0.25, 0.1],
    [0.3, 0.12, 0.3],
  ],
  inner: [
    [0.12, 0.18, 0.4],
    [0.3, 0.14, 0.4],
    [0.1, 0.3, 0.45],
  ],
};

export function createMapScene(opts: MapOptions): MapScene {
  const { galaxy } = opts;
  const container = new Container();
  const nebula = createNebula(REGION_NEBULA.inner[0], REGION_NEBULA.inner[1], REGION_NEBULA.inner[2], 0.8);
  const stars = createStarfield(0.5);
  stars.mesh.alpha = 0.22;
  container.addChild(nebula.mesh, stars.mesh);

  const world = new Container();
  container.addChild(world);
  const routes = new Graphics();
  const routeHi = new Graphics();
  const markers = new Graphics();
  const starLayer = new Container();
  const labelLayer = new Container();
  const shipGfx = new Graphics();
  const jumpIcon = new Graphics();
  const jumpShip = new Graphics();
  let jumpAnim: {
    from: number;
    to: number;
    t: number;
    dur: number;
    hullId: string;
    done: () => void;
  } | null = null;
  const dyn = new Graphics();
  world.addChild(routes, routeHi, starLayer, markers, labelLayer, shipGfx, dyn, jumpIcon, jumpShip);

  let W = 800;
  let H = 600;
  const cam = { x: 0, y: 0, zoom: 7 };
  const target = { x: 0, y: 0, zoom: 7 };
  let state: GameState | null = null;
  let selected: number | null = null;
  let routePath: number[] | null = null;
  let filter: MapFilter = 'normal';
  let filterGood = 'iron_ore';
  let hover: number | null = null;
  let lastDrawZoom = -1;
  let dirty = true;
  let shipMarker: { from: number; to: number; p: number } | null = null;

  const sprites = new Map<number, Sprite>();
  const labels = new Map<number, Text>();
  const minZoom = (Math.min(W, H) * 0.45) / galaxy.radius;

  function visible(id: number): 'visited' | 'seen' | null {
    if (!state) return null;
    if (state.visited.includes(id)) return 'visited';
    if (state.seen.includes(id)) return 'seen';
    return null;
  }

  function sysAt(sx: number, sy: number, maxPx = 18): number | null {
    let best: number | null = null;
    let bd = maxPx;
    for (const s of galaxy.systems) {
      if (!visible(s.id)) continue;
      const px = (s.x - cam.x) * cam.zoom + W / 2;
      const py = (s.y - cam.y) * cam.zoom + H / 2;
      const d = Math.hypot(px - sx, py - sy);
      if (d < bd) {
        bd = d;
        best = s.id;
      }
    }
    return best;
  }

  function spriteFor(s: SystemStatic): Sprite {
    let sp = sprites.get(s.id);
    if (!sp) {
      sp = new Sprite(glowTexture());
      sp.anchor.set(0.5);
      const c = STAR_COLORS[s.spectral];
      sp.tint = rgbHex(c.core);
      sp.position.set(s.x, s.y);
      sprites.set(s.id, sp);
      starLayer.addChild(sp);
    }
    return sp;
  }

  function labelFor(s: SystemStatic): Text {
    let tx = labels.get(s.id);
    if (!tx) {
      tx = new Text({
        text: s.name,
        style: {
          fontFamily: 'Inter, sans-serif',
          fontSize: 12,
          fill: 0xdbe5f5,
          stroke: { color: 0x070b14, width: 3 },
        },
      });
      tx.anchor.set(0.5, 0);
      tx.position.set(s.x, s.y);
      labels.set(s.id, tx);
      labelLayer.addChild(tx);
    }
    return tx;
  }

  function priceInfo(sysId: number): { buy: number; sell: number } | null {
    if (!state) return null;
    let buy = Infinity;
    let sell = -Infinity;
    const base = GOODS_BY_ID[filterGood]?.basePrice ?? 1;
    for (const st of galaxy.systems[sysId].stations) {
      const p = state.prices[st.id]?.[filterGood];
      if (!p) continue;
      buy = Math.min(buy, p.buy / base);
      sell = Math.max(sell, p.sell / base);
    }
    return isFinite(buy) ? { buy, sell } : null;
  }

  function drawStatic(): void {
    if (!state) return;
    const z = cam.zoom;
    const px = 1 / z;
    routes.clear();
    const here = state.location.systemId;
    const fuelRange = state.ship.fuel;
    for (const s of galaxy.systems) {
      const vs = visible(s.id);
      if (!vs) continue;
      for (const n of s.neighbors) {
        if (n < s.id) continue;
        const vn = visible(n);
        if (!vn) continue;
        const both = vs === 'visited' && vn === 'visited';
        const o = galaxy.systems[n];
        let color = both ? 0x4a78b8 : 0x2b4166;
        let alpha = both ? 0.75 : 0.5;
        if (s.id === here || n === here) {
          color = 0x4cc9f0;
          alpha = 0.9;
        }
        routes
          .moveTo(s.x, s.y)
          .lineTo(o.x, o.y)
          .stroke({ width: (both ? 1.6 : 1.1) * px, color, alpha });
      }
    }
    void fuelRange;
    // markers
    markers.clear();
    for (const s of galaxy.systems) {
      const vs = visible(s.id);
      if (!vs) continue;
      if (vs === 'visited') {
        markers.circle(s.x, s.y, 5.5 * px).stroke({ width: 1 * px, color: 0x8fe3ff, alpha: 0.55 });
        let i = 0;
        for (const st of s.stations) {
          const col = st.type === 'pirate' ? 0xff7b7b : 0x8fe3ff;
          markers
            .rect(s.x + (4 + i * 4.5) * px, s.y + 4 * px, 3 * px, 3 * px)
            .fill({ color: col, alpha: 0.95 });
          i++;
        }
      }
      if (filter === 'unexplored' && vs === 'seen') {
        markers.circle(s.x, s.y, 9 * px).stroke({ width: 1.5 * px, color: 0xf5c26b, alpha: 0.85 });
      }
      if (filter === 'prices') {
        const info = priceInfo(s.id);
        if (info) {
          const cheap = info.buy < 0.92;
          const dear = info.sell > 1.12;
          if (cheap)
            markers.circle(s.x, s.y, 10 * px).stroke({ width: 2.2 * px, color: 0x6ee7a0, alpha: 0.95 });
          if (dear)
            markers.circle(s.x, s.y, 14 * px).stroke({ width: 2.2 * px, color: 0xf5a05b, alpha: 0.95 });
          if (!cheap && !dear)
            markers.circle(s.x, s.y, 8 * px).stroke({ width: 1 * px, color: 0x8fa2c0, alpha: 0.5 });
        }
      }
    }
    // contracts: destinations of active contracts and survey targets
    const mark = (id: number, color: number, shape: 'diamond' | 'cross') => {
      if (!visible(id)) return;
      const s = galaxy.systems[id];
      const r = 7 * px;
      if (shape === 'diamond')
        markers
          .poly([s.x, s.y - r, s.x + r, s.y, s.x, s.y + r, s.x - r, s.y])
          .stroke({ width: 1.8 * px, color });
      else
        markers
          .moveTo(s.x - r, s.y - r)
          .lineTo(s.x + r, s.y + r)
          .moveTo(s.x + r, s.y - r)
          .lineTo(s.x - r, s.y + r)
          .stroke({ width: 1.8 * px, color });
    };
    for (const c of state.contracts) {
      if (c.state !== 'active') continue;
      mark(c.destSystem, 0xf5c26b, 'diamond');
      if (c.targetSystem !== undefined) mark(c.targetSystem, 0xb49bff, 'cross');
    }
    if (filter === 'contracts') {
      for (const s of galaxy.systems) {
        if (visible(s.id) !== 'visited') continue;
        const n = s.stations.reduce((a, st) => a + (state!.stations[st.id]?.board.length ?? 0), 0);
        if (n > 0) markers.circle(s.x, s.y, 11 * px).stroke({ width: 2 * px, color: 0xf5c26b, alpha: 0.9 });
      }
    }
    // selection and location
    if (selected !== null && visible(selected)) {
      const s = galaxy.systems[selected];
      markers.circle(s.x, s.y, 13 * px).stroke({ width: 1.6 * px, color: 0xffffff, alpha: 0.9 });
    }
    // route highlight
    routeHi.clear();
    if (routePath && routePath.length > 1) {
      for (let i = 1; i < routePath.length; i++) {
        const a = galaxy.systems[routePath[i - 1]];
        const b = galaxy.systems[routePath[i]];
        routeHi.moveTo(a.x, a.y).lineTo(b.x, b.y);
      }
      routeHi.stroke({ width: 3.2 * px, color: 0xffd36b, alpha: 0.95 });
      for (const id of routePath.slice(1))
        routeHi.circle(galaxy.systems[id].x, galaxy.systems[id].y, 4.5 * px).fill({ color: 0xffd36b });
    }
  }

  /** Timeline of one jump (fractions of the whole): charge 0..0.28, travel 0.28..0.84, arrival 0.84..1. */
  function drawJump(px: number, time: number): void {
    jumpIcon.clear();
    jumpIcon.visible = !!jumpAnim;
    if (!jumpAnim) return;
    const a = galaxy.systems[jumpAnim.from];
    const b = galaxy.systems[jumpAnim.to];
    const u = Math.min(1, jumpAnim.t / jumpAnim.dur);
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const charge = Math.min(1, u / 0.28);
    const travel = Math.max(0, Math.min(1, (u - 0.28) / 0.56));
    const arrive = Math.max(0, (u - 0.84) / 0.16);
    const e = travel * travel * (3 - 2 * travel);
    const x = a.x + (b.x - a.x) * e;
    const y = a.y + (b.y - a.y) * e;
    // the ship: its real hull silhouette, scaled to a readable size on screen
    const len = 30 * px;
    // streak behind the ship while travelling (motion blur)
    if (travel > 0 && travel < 1) {
      const tail = Math.min(e, 0.35) * Math.hypot(b.x - a.x, b.y - a.y);
      const tx = x - Math.cos(ang) * tail;
      const ty = y - Math.sin(ang) * tail;
      jumpIcon
        .moveTo(tx, ty)
        .lineTo(x, y)
        .stroke({ width: 7 * px, color: 0x4cc9f0, alpha: 0.18 });
      jumpIcon
        .moveTo(tx, ty)
        .lineTo(x, y)
        .stroke({ width: 3 * px, color: 0x9fe8ff, alpha: 0.5 });
      jumpIcon
        .moveTo(tx, ty)
        .lineTo(x, y)
        .stroke({ width: 1.1 * px, color: 0xffffff, alpha: 0.9 });
    }
    // charging: rings collapsing onto the ship at the origin
    if (charge < 1) {
      const rr = (26 - 20 * charge) * px;
      jumpIcon.circle(a.x, a.y, rr).stroke({ width: 2 * px, color: 0x8fe3ff, alpha: 0.9 * charge });
      jumpIcon.circle(a.x, a.y, rr * 1.7).stroke({ width: 1 * px, color: 0x8fe3ff, alpha: 0.5 * charge });
      jumpIcon.circle(a.x, a.y, 7 * px * charge).fill({ color: 0xffffff, alpha: 0.4 * charge });
    }
    // arrival flash at the destination
    if (arrive > 0) {
      jumpIcon
        .circle(b.x, b.y, (8 + 26 * arrive) * px)
        .stroke({ width: 2.4 * px * (1 - arrive), color: 0xbfe6ff, alpha: 1 - arrive });
      jumpIcon.circle(b.x, b.y, 12 * px * (1 - arrive)).fill({ color: 0xffffff, alpha: 0.6 * (1 - arrive) });
    }
    // the ship itself: visible once the drive is nearly charged, gone when the arrival flash fades
    const shown = (charge >= 0.55 || travel > 0) && arrive < 0.85;
    jumpShip.visible = shown;
    if (shown) {
      jumpShip.position.set(travel > 0 ? x : a.x, travel > 0 ? y : a.y);
      jumpShip.rotation = ang;
      jumpShip.scale.set((len / 360) * (travel > 0 ? 1 : 0.6 + 0.4 * ((charge - 0.55) / 0.45)));
      jumpShip.alpha = 1 - arrive * 0.6;
    }
    void time;
  }

  function drawDynamic(time: number): void {
    if (!state) return;
    const px = 1 / cam.zoom;
    dyn.clear();
    const cur = galaxy.systems[jumpAnim ? jumpAnim.from : state.location.systemId];
    const pulse = prefersReducedMotion() ? 1 : 1 + 0.14 * Math.sin(time * 3);
    dyn.circle(cur.x, cur.y, 9 * px * pulse).stroke({ width: 2 * px, color: 0x4cc9f0 });
    shipGfx.clear();
    drawJump(px, time);
    if (shipMarker) {
      const a = galaxy.systems[shipMarker.from];
      const b = galaxy.systems[shipMarker.to];
      const x = a.x + (b.x - a.x) * shipMarker.p;
      const y = a.y + (b.y - a.y) * shipMarker.p;
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const r = 7 * px;
      shipGfx
        .poly([
          x + Math.cos(ang) * r,
          y + Math.sin(ang) * r,
          x + Math.cos(ang + 2.5) * r,
          y + Math.sin(ang + 2.5) * r,
          x + Math.cos(ang - 2.5) * r,
          y + Math.sin(ang - 2.5) * r,
        ])
        .fill({ color: 0xffffff });
    }
  }

  function applyView(): void {
    world.scale.set(cam.zoom);
    world.position.set(W / 2 - cam.x * cam.zoom, H / 2 - cam.y * cam.zoom);
    nebula.mesh.position.set(W / 2, H / 2);
    nebula.mesh.scale.set(W / 2, H / 2);
    stars.mesh.position.set(W / 2, H / 2);
    stars.mesh.scale.set(W / 2, H / 2);
  }

  function updateSprites(): void {
    if (!state) return;
    const z = cam.zoom;
    const labelZoom = z > 8.5;
    for (const s of galaxy.systems) {
      const vs = visible(s.id);
      const sp = spriteFor(s);
      sp.visible = !!vs;
      if (!vs) {
        const lb = labels.get(s.id);
        if (lb) lb.visible = false;
        continue;
      }
      const c = STAR_COLORS[s.spectral];
      const base = (vs === 'visited' ? 58 : 38) * (0.7 + c.size * 0.4);
      const scale = (base * (0.55 + 0.45 * Math.sqrt(z / 7))) / z / 64;
      sp.scale.set(scale);
      sp.alpha = vs === 'visited' ? 1 : 0.62;
      const showLabel =
        vs === 'visited'
          ? labelZoom || s.id === selected || s.id === hover
          : s.id === selected || s.id === hover;
      const route = routePath?.includes(s.id);
      if (showLabel || s.id === state.location.systemId || route) {
        if (vs === 'visited' || s.id === selected || s.id === hover) {
          const lb = labelFor(s);
          lb.visible = true;
          lb.scale.set(1 / z);
          lb.position.set(s.x, s.y + 10 / z);
          lb.text = vs === 'visited' ? s.name : `${s.name}?`;
          lb.alpha = vs === 'visited' ? 1 : 0.7;
        }
      } else {
        const lb = labels.get(s.id);
        if (lb) lb.visible = false;
      }
    }
  }

  function clampTarget(): void {
    const lim = galaxy.radius * 1.15;
    target.x = Math.max(-lim, Math.min(lim, target.x));
    target.y = Math.max(-lim, Math.min(lim, target.y));
    target.zoom = Math.max(minZoom, Math.min(60, target.zoom));
  }

  /* ----------------------------- input ----------------------------- */
  const pointers = new Map<number, { x: number; y: number }>();
  let dragStart: { x: number; y: number; cx: number; cy: number; moved: boolean } | null = null;
  let pinchStart: { d: number; zoom: number; wx: number; wy: number } | null = null;
  let canvas: HTMLCanvasElement | null = null;

  const local = (e: PointerEvent | WheelEvent) => {
    const r = canvas!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onDown = (e: PointerEvent) => {
    const p = local(e);
    pointers.set(e.pointerId, p);
    canvas!.setPointerCapture(e.pointerId);
    if (pointers.size === 1) dragStart = { x: p.x, y: p.y, cx: target.x, cy: target.y, moved: false };
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      pinchStart = {
        d: Math.hypot(a.x - b.x, a.y - b.y),
        zoom: target.zoom,
        wx: (mx - W / 2) / cam.zoom + cam.x,
        wy: (my - H / 2) / cam.zoom + cam.y,
      };
      if (dragStart) dragStart.moved = true;
    }
  };
  const onMove = (e: PointerEvent) => {
    const p = local(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
    if (pointers.size === 2 && pinchStart) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      // pinch zooms around the fingers and follows them, so two fingers also pan
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      target.zoom = pinchStart.zoom * (d / pinchStart.d);
      clampTarget();
      target.x = pinchStart.wx - (mx - W / 2) / target.zoom;
      target.y = pinchStart.wy - (my - H / 2) / target.zoom;
      clampTarget();
      cam.zoom = target.zoom;
      cam.x = target.x;
      cam.y = target.y;
      dirty = true;
      return;
    }
    if (dragStart && pointers.size === 1) {
      const dx = p.x - dragStart.x;
      const dy = p.y - dragStart.y;
      if (Math.hypot(dx, dy) > 6) dragStart.moved = true;
      if (dragStart.moved) {
        target.x = dragStart.cx - dx / cam.zoom;
        target.y = dragStart.cy - dy / cam.zoom;
        clampTarget();
        cam.x = target.x;
        cam.y = target.y;
      }
    } else if (e.pointerType === 'mouse') {
      const id = sysAt(p.x, p.y, 14);
      if (id !== hover) {
        hover = id;
        opts.onHover?.(id, p.x, p.y);
        canvas!.style.cursor = id !== null ? 'pointer' : 'default';
        dirty = true;
      }
    }
  };
  const onUp = (e: PointerEvent) => {
    const p = local(e);
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = null;
    if (dragStart && !dragStart.moved && pointers.size === 0) {
      const id = sysAt(p.x, p.y, e.pointerType === 'touch' ? 28 : 16);
      selected = id;
      opts.onSelect(id);
      dirty = true;
    }
    if (pointers.size === 0) dragStart = null;
    else if (pointers.size === 1) {
      // one finger stays after a pinch: continue panning from where it is now, not from the stale start
      const rest = [...pointers.values()][0];
      dragStart = { x: rest.x, y: rest.y, cx: target.x, cy: target.y, moved: true };
    }
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const p = local(e);
    const f = Math.exp(-e.deltaY * 0.0015);
    const wx = (p.x - W / 2) / cam.zoom + cam.x;
    const wy = (p.y - H / 2) / cam.zoom + cam.y;
    target.zoom = cam.zoom * f;
    clampTarget();
    target.x = wx - (p.x - W / 2) / target.zoom;
    target.y = wy - (p.y - H / 2) / target.zoom;
    clampTarget();
    cam.zoom = target.zoom;
    cam.x = target.x;
    cam.y = target.y;
  };
  function attach(c: HTMLCanvasElement): void {
    canvas = c;
    c.addEventListener('pointerdown', onDown);
    c.addEventListener('pointermove', onMove);
    c.addEventListener('pointerup', onUp);
    c.addEventListener('pointercancel', onUp);
    c.addEventListener('wheel', onWheel, { passive: false });
  }
  function detach(): void {
    if (!canvas) return;
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onUp);
    canvas.removeEventListener('wheel', onWheel);
    canvas.style.cursor = 'default';
  }

  const scene: MapScene & { attach: (c: HTMLCanvasElement) => void } = {
    container,
    attach,
    resize(w, h) {
      W = w;
      H = h;
      dirty = true;
      applyView();
    },
    update(dt, time) {
      const k = prefersReducedMotion() ? 1 : 1 - Math.exp(-dt * 9);
      if (
        Math.abs(target.x - cam.x) > 1e-4 ||
        Math.abs(target.y - cam.y) > 1e-4 ||
        Math.abs(target.zoom - cam.zoom) > 1e-3
      ) {
        cam.x += (target.x - cam.x) * k;
        cam.y += (target.y - cam.y) * k;
        cam.zoom += (target.zoom - cam.zoom) * k;
      }
      applyView();
      const zoomChanged = Math.abs(cam.zoom - lastDrawZoom) / Math.max(1e-6, lastDrawZoom) > 0.01;
      if (dirty || zoomChanged) {
        drawStatic();
        updateSprites();
        lastDrawZoom = cam.zoom;
        dirty = false;
      }
      if (jumpAnim) {
        jumpAnim.t += dt;
        if (jumpAnim.t >= jumpAnim.dur) {
          const f = jumpAnim;
          jumpAnim = null;
          jumpShip.visible = false;
          dirty = true;
          f.done();
        }
      }
      drawDynamic(time);
      const aspect = W / H;
      nebula.set({
        time,
        offX: cam.x * 0.012,
        offY: cam.y * 0.012,
        scale: 1.4 + Math.min(1.5, cam.zoom * 0.04),
        aspectX: aspect,
        aspectY: 1,
      });
      stars.set({
        time,
        offX: cam.x * 0.02,
        offY: cam.y * 0.02,
        aspectX: aspect,
        aspectY: 1,
        twinkle: prefersReducedMotion() ? 0 : 1,
      });
    },
    destroy() {
      detach();
      container.destroy({ children: true });
    },
    refresh(s) {
      state = s;
      dirty = true;
      const here = galaxy.systems[s.location.systemId];
      const region = here.region === 'core' ? 'core' : 'inner';
      const cols = REGION_NEBULA[region];
      nebula.setColors(cols[0], cols[1], cols[2], 0.8);
    },
    setSelected(id) {
      selected = id;
      dirty = true;
    },
    setRoute(p) {
      routePath = p;
      dirty = true;
    },
    setFilter(mode, goodId) {
      filter = mode;
      if (goodId) filterGood = goodId;
      dirty = true;
    },
    zoomBy(f) {
      target.zoom *= f;
      clampTarget();
    },
    getCam: () => ({ x: cam.x, y: cam.y, zoom: cam.zoom }),
    systemScreenPos(id) {
      const s = galaxy.systems[id];
      return { x: (s.x - cam.x) * cam.zoom + W / 2, y: (s.y - cam.y) * cam.zoom + H / 2 };
    },
    centerOn(id, zoom) {
      const s = galaxy.systems[id];
      target.x = s.x;
      target.y = s.y;
      if (zoom) target.zoom = zoom;
      clampTarget();
    },
    playJump(from, to, hullId, level, done) {
      if (level === 'off') {
        done();
        return;
      }
      const dist = Math.hypot(
        galaxy.systems[to].x - galaxy.systems[from].x,
        galaxy.systems[to].y - galaxy.systems[from].y,
      );
      const dur = level === 'reduced' ? 0.4 : Math.min(3, 1.6 + dist * 0.05);
      drawSilhouette(jumpShip, hullId, 0x3a7fb0, 0x9fe8ff);
      jumpAnim = { from, to, t: 0, dur, hullId, done };
      dirty = true;
    },
    isJumping: () => !!jumpAnim,
    skipJump() {
      if (jumpAnim) jumpAnim.t = jumpAnim.dur;
    },
    seekJump(u) {
      if (jumpAnim) {
        jumpAnim.t = Math.min(0.98, Math.max(0, u)) * jumpAnim.dur;
        dirty = true;
      }
    },
    setMarker(from, to, p) {
      shipMarker = from !== null && to !== null ? { from, to, p } : null;
      dirty = true;
    },
    getZoom: () => cam.zoom,
  };
  // initial camera: fit the whole galaxy
  cam.zoom = target.zoom = Math.max(minZoom, (Math.min(W, H) * 0.45) / galaxy.radius);
  void dist;
  return scene;
}
