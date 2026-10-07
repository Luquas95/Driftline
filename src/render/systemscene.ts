import { Container, Graphics, Text } from 'pixi.js';
import {
  createNebula,
  createPlanet,
  createStar,
  createStarfield,
  planetParams,
  STAR_COLORS,
  type PlanetMesh,
  type StarMesh,
} from './materials';
import type { Scene } from './stage';
import type { BodyStatic, Ship, StationStatic, SystemStatic } from '../core/types';
import { HULLS } from '../content/hulls';
import { buildStarterShip } from '../core/ship';
import { hashToUnit } from '../core/rng';
import type { AnimLevel } from '../ui/settings';
import { drawShip, drawSilhouette, Exhaust, nozzlesOf } from './shipgen';
import { createStationView, type StationView } from './stationgen';
import {
  ZOOM_MAX,
  ZOOM_MIN,
  bezier,
  centreOn,
  clamp,
  clampCam,
  easeInOut,
  flightControls,
  flightDuration,
  hash01,
  headingOf,
  isDoubleTap,
  isTap,
  lerp,
  moonSpeed,
  planetSpeed,
  toScreen,
  toWorld,
  zoomAt,
  zoomToFit,
  type Cam,
  type PointerSample,
  type V2,
} from './sysmath';

/** Radius (world units) of the outermost orbit: the world is laid out in a 300-unit disc. */
const WORLD_R = 300;
const TILT = 0.62;

export type SystemSound = 'thrust' | 'dock' | 'scan' | 'mine' | 'probe' | 'arrive';

export interface SystemSceneOptions {
  system: SystemStatic;
  stations: StationStatic[];
  /** Body ids the player has detected. */
  detected: string[];
  onSelectBody: (index: number | null) => void;
  /** Index of body where the ship is (or -1). */
  shipBody: number;
  /** Station the ship is docked at, if any. */
  shipStation: string | null;
  getShip: () => Ship;
  level: () => AnimLevel;
  /** Camera remembered for this system during the session. */
  saved?: Cam;
  onCamera?: (cam: Cam) => void;
  /** The ship has just left a station: show it flying out. */
  launch?: boolean;
  /** The ship has just jumped in: play the hyperspace arrival (flash and star streaks). */
  arrive?: boolean;
  onSound?: (s: SystemSound) => void;
}

export interface SystemScene extends Scene {
  setSelected(idx: number | null): void;
  setDetected(ids: string[]): void;
  /** Where the ship is now. A change makes it fly there (unless animations are off). */
  setShipLocation(bodyIndex: number, stationId: string | null): void;
  attach(canvas: HTMLCanvasElement): void;
  zoomBy(factor: number): void;
  /** Pixels covered by UI panels on each side (the view centres on the free area). */
  setInsets(l: number, r: number, t: number, b: number): void;
  resetView(): void;
  focusBody(index: number): void;
  /** Fly into a station and call `done` when docked. */
  dockInto(stationId: string, done: () => void): void;
  skipFlight(): void;
  isFlying(): boolean;
  /** Visual effects (never change game state). */
  scanPulse(): void;
  mineBeam(bodyIndex: number, intensity: number): void;
  launchProbe(bodyIndex: number): void;
  getZoom(): number;
  getCam(): Cam;
  bodyScreenPos(index: number): { x: number; y: number; r: number } | null;
  shipScreenPos(): { x: number; y: number };
  stationScreenPos(stationId: string): { x: number; y: number } | null;
}

interface BodyView {
  body: BodyStatic;
  mesh?: PlanetMesh;
  label: Text;
  angle: number;
  speed: number;
  x: number;
  y: number;
  r: number;
  /** 0..1 reveal progress after a scan (the body fades in from "unknown"). */
  reveal: number;
  /** Seconds before the reveal starts (the scan wave takes time to arrive). */
  revealDelay: number;
  wasKnown: boolean;
}

interface StationV {
  st: StationStatic;
  view: StationView;
  label: Text;
  angle: number;
  x: number;
  y: number;
  r: number;
}

interface Flight {
  t: number;
  dur: number;
  p0: V2;
  h0: number;
  target: () => V2;
  kind: 'fly' | 'dock' | 'launch';
  done?: () => void;
}

interface Npc {
  hullId: string;
  gfx: Graphics;
  trail: Graphics;
  cycle: number;
  phase: number;
  seed: string;
}

interface Fx {
  /** Returns false when finished. */
  tick(dt: number): boolean;
}

/** Remembered camera per system for the session. */
const memory = new Map<number, Cam>();
export function rememberedCam(systemId: number): Cam | undefined {
  return memory.get(systemId);
}

export function createSystemScene(opts: SystemSceneOptions): SystemScene {
  const sys = opts.system;
  const container = new Container();
  const nebula = createNebula([0.1, 0.16, 0.36], [0.3, 0.12, 0.34], [0.08, 0.28, 0.4], 0.75);
  const starfield = createStarfield(0.5);
  container.addChild(nebula.mesh, starfield.mesh);
  const world = new Container();
  const rings = new Graphics();
  const belts = new Graphics();
  const trailG = new Graphics();
  const star: StarMesh = createStar(sys.spectral, sys.starSeed);
  const starSize = STAR_COLORS[sys.spectral].size;
  const planetLayer = new Container();
  const stationLayer = new Container();
  const npcLayer = new Container();
  const overlay = new Graphics();
  const fxG = new Graphics();
  const shipRoot = new Container();
  const shipFull = new Graphics();
  const shipIcon = new Graphics();
  const exhaust = new Exhaust(40);
  shipRoot.addChild(exhaust.container, shipFull, shipIcon);
  world.addChild(
    rings,
    belts,
    star.mesh,
    trailG,
    planetLayer,
    stationLayer,
    npcLayer,
    overlay,
    shipRoot,
    fxG,
  );
  const labelLayer = new Container();
  const arrivalG = new Graphics();
  container.addChild(world, labelLayer, arrivalG);
  let arrivalT = opts.arrive && opts.level() !== 'off' ? 0 : 99;
  const ARRIVAL_DUR = 1.3;

  let W = 800;
  let H = 600;
  let k0 = 1;
  /** Space covered by UI panels: the view is centred on what remains. */
  let ins = { l: 0, r: 0, t: 0, b: 0 };
  const Wv = () => W + ins.l - ins.r;
  const Hv = () => H + ins.t - ins.b;
  let cam: Cam = opts.saved ? { ...opts.saved } : { zoom: 1, x: 0, y: 0 };
  let selected: number | null = null;
  let shipBody = opts.shipBody;
  let shipStation = opts.shipStation;
  let detected = new Set(opts.detected);
  let now = 0;
  const views: BodyView[] = [];
  const stationVs: StationV[] = [];
  const fx: Fx[] = [];

  const planets = sys.bodies.filter((b) => b.parent < 0);
  const orbMin = Math.min(...planets.map((b) => b.orbit));
  const orbMax = Math.max(...planets.map((b) => b.orbit));
  const logSpan = Math.log(orbMax / orbMin + 1) || 1;

  /** Orbit radius in world units: logarithmic so a 30 AU system still fits one screen. */
  function orbitRadius(b: BodyStatic): number {
    if (planets.length === 1) return 0.5 * WORLD_R;
    return (0.16 + 0.84 * (Math.log(b.orbit / orbMin + 1) / logSpan)) * WORLD_R;
  }

  const label = (size = 12): Text => {
    const t = new Text({
      text: '',
      style: {
        fontFamily: 'Inter, sans-serif',
        fontSize: size,
        fill: 0xdbe5f5,
        stroke: { color: 0x070b14, width: 3 },
      },
    });
    t.anchor.set(0.5, 0);
    labelLayer.addChild(t);
    return t;
  };

  for (const b of sys.bodies) {
    const v: BodyView = {
      body: b,
      label: label(),
      angle: hashToUnit(`${sys.id}:${b.index}:ang`) * Math.PI * 2,
      // Kepler: period ∝ a^1.5 for planets; moons turn faster around their host
      speed: b.parent >= 0 ? moonSpeed((b.index % 3) + 1) : planetSpeed(b.orbit),
      x: 0,
      y: 0,
      r: 10,
      reveal: detected.has(b.id) ? 1 : 0,
      revealDelay: 0,
      wasKnown: detected.has(b.id),
    };
    if (b.kind !== 'belt') {
      v.mesh = createPlanet(planetParams({ kind: b.kind, seed: b.seed, atmosphere: b.atmosphere, id: b.id }));
      planetLayer.addChild(v.mesh.mesh);
    }
    views.push(v);
  }
  opts.stations.forEach((st, i) => {
    const view = createStationView(st);
    stationLayer.addChild(view.container);
    stationVs.push({
      st,
      view,
      label: label(11),
      angle: hashToUnit(`${st.id}:orb`) * Math.PI * 2 + i * 1.7,
      x: 0,
      y: 0,
      r: 6,
    });
  });

  /* ------------------------------ layout and placing ------------------------------ */

  const level = () => opts.level();
  const clock = (t: number) => (level() === 'full' ? t : 0);

  function bodyRadiusW(b: BodyStatic): number {
    const base = b.kind === 'gas' ? 22 : b.kind === 'moon' ? 6 : 12;
    return Math.max(3.6, base * b.size * 1.4 * (b.kind === 'gas' ? 0.75 : 1));
  }

  function bodyPos(v: BodyView, t: number): V2 {
    const b = v.body;
    if (b.parent < 0) {
      const rad = orbitRadius(b);
      const a = v.angle + t * v.speed;
      return { x: Math.cos(a) * rad, y: Math.sin(a) * rad * TILT };
    }
    const host = views[b.parent];
    const hp = bodyPos(host, t);
    const a = v.angle + t * v.speed;
    const orbitR = bodyRadiusW(host.body) * (1.6 + (b.index % 3) * 0.5);
    return { x: hp.x + Math.cos(a) * orbitR, y: hp.y + Math.sin(a) * orbitR * 0.7 };
  }

  function stationPos(sv: StationV, t: number): V2 {
    const host = views[sv.st.bodyIndex];
    if (!host || host.body.kind === 'belt') {
      const rad = host ? orbitRadius(host.body) : WORLD_R * 0.5;
      const a = sv.angle * 0.2 + t * 0.03;
      return { x: Math.cos(a) * rad, y: Math.sin(a) * rad * TILT };
    }
    const hp = bodyPos(host, t);
    const hr = bodyRadiusW(host.body);
    const d = hr + 7 + stationVs.filter((o) => o.st.bodyIndex === sv.st.bodyIndex).indexOf(sv) * 6;
    const a = sv.angle + t * 0.5;
    return { x: hp.x + Math.cos(a) * d, y: hp.y + Math.sin(a) * d * 0.7 };
  }

  function place(time: number): void {
    const t = clock(time);
    for (const v of views) {
      const p = bodyPos(v, t);
      v.x = p.x;
      v.y = p.y;
      v.r = v.body.kind === 'belt' ? 0 : bodyRadiusW(v.body);
    }
    for (const sv of stationVs) {
      const p = stationPos(sv, t);
      sv.x = p.x;
      sv.y = p.y;
    }
  }

  function layout(): void {
    const half = Math.min(W - ins.l - ins.r, H - ins.t - ins.b) / 2;
    k0 = Math.max(0.3, (half * 0.92) / WORLD_R);
    nebula.mesh.position.set(W / 2, H / 2);
    nebula.mesh.scale.set(W / 2, H / 2);
    starfield.mesh.position.set(W / 2, H / 2);
    starfield.mesh.scale.set(W / 2, H / 2);
  }

  const kNow = () => k0 * cam.zoom;
  const scr = (x: number, y: number): V2 => toScreen(cam, Wv(), Hv(), k0, x, y);

  /* ------------------------------ the player's ship ------------------------------ */

  const JUMP_POINT: V2 = { x: WORLD_R * 0.98, y: 0 };
  let shipPos: V2 = { x: 0, y: 0 };
  let heading = 0;
  let prevPos: V2 | null = null;
  let flight: Flight | null = null;
  let speedNow = 0;
  const trail: V2[] = [];
  let shipDrawnFor = '';
  let shipAlpha = 1;
  let shipScaleMul = 1;

  function restPos(t: number): V2 {
    if (shipStation) {
      const sv = stationVs.find((x) => x.st.id === shipStation);
      if (sv) return { x: sv.x, y: sv.y };
    }
    if (shipBody < 0) return JUMP_POINT;
    const v = views[shipBody];
    if (!v) return JUMP_POINT;
    if (v.body.kind === 'belt')
      return { x: Math.cos(0.4) * orbitRadius(v.body), y: Math.sin(0.4) * orbitRadius(v.body) * TILT };
    void t;
    const a = -0.9;
    return { x: v.x + Math.cos(a) * (v.r + 11), y: v.y + Math.sin(a) * (v.r + 11) * 0.8 };
  }

  function drawShipGraphics(): void {
    const ship = opts.getShip();
    const key = `${ship.hullId}:${ship.name}:${ship.slots.map((m) => m?.defId ?? '-').join(',')}`;
    if (key === shipDrawnFor) return;
    shipDrawnFor = key;
    drawShip(shipFull, ship.hullId, ship.slots, ship.name, null);
    drawSilhouette(shipIcon, ship.hullId, 0x3a7fb0, 0x9fe8ff);
  }

  function startFlight(
    target: () => V2,
    kind: Flight['kind'],
    done?: () => void,
    from: V2 = shipPos,
    durOverride?: number,
  ): void {
    const end = target();
    const dist = Math.hypot(end.x - from.x, end.y - from.y);
    const dur = durOverride ?? flightDuration(dist, WORLD_R * 1.6, level());
    if (dur <= 0) {
      shipPos = end;
      flight = null;
      done?.();
      return;
    }
    flight = { t: 0, dur, p0: { ...from }, h0: heading, target, kind, done };
    trail.length = 0;
    opts.onSound?.(kind === 'dock' ? 'dock' : 'thrust');
  }

  function updateShip(dt: number, time: number): void {
    drawShipGraphics();
    const prev = { ...shipPos };
    if (flight) {
      flight.t += dt / flight.dur;
      const end = flight.target();
      const { c1, c2 } = flightControls(flight.p0, flight.h0, end);
      const u = easeInOut(Math.min(1, flight.t));
      shipPos = bezier(flight.p0, c1, c2, end, u);
      if (flight.kind === 'dock') {
        const k = clamp((flight.t - 0.7) / 0.3, 0, 1);
        shipScaleMul = 1 - 0.7 * k;
        shipAlpha = 1 - 0.85 * k;
      } else if (flight.kind === 'launch') {
        const k = clamp(flight.t / 0.35, 0, 1);
        shipScaleMul = 0.3 + 0.7 * k;
        shipAlpha = 0.15 + 0.85 * k;
      }
      if (flight.t >= 1) {
        const f = flight;
        flight = null;
        shipPos = end;
        shipScaleMul = f.kind === 'dock' ? 0.3 : 1;
        shipAlpha = f.kind === 'dock' ? 0.15 : 1;
        if (f.kind === 'fly') opts.onSound?.('arrive');
        f.done?.();
      }
    } else {
      shipPos = restPos(time);
      shipScaleMul = shipStation ? 0.3 : 1;
      shipAlpha = shipStation ? 0.15 : 1;
    }
    const moved = Math.hypot(shipPos.x - prev.x, shipPos.y - prev.y);
    speedNow = dt > 0 ? moved / dt : 0;
    if (moved > 0.02) {
      const targetH = headingOf(prev, shipPos, heading);
      // turn smoothly (shortest way round)
      let d = targetH - heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      heading += d * (flight ? 0.35 : 0.08);
    }
    prevPos = prev;
    if (flight && moved > 0.5) {
      trail.push({ ...shipPos });
      if (trail.length > 36) trail.shift();
    } else if (!flight && trail.length) trail.shift();
    // size on screen: grows slowly with zoom, never smaller than a recognisable ship
    const k = kNow();
    const len = clamp(54 * Math.pow(cam.zoom, 0.55), 38, 150);
    const full = len >= 62;
    const s = (len / 360 / k) * shipScaleMul;
    shipRoot.position.set(shipPos.x, shipPos.y);
    shipRoot.rotation = heading;
    shipRoot.scale.set(s);
    shipRoot.alpha = shipAlpha;
    shipFull.visible = full;
    shipIcon.visible = !full;
    const reduced = level() !== 'full';
    const power = flight ? clamp(0.4 + speedNow / 120, 0.3, 1.6) : 0.12;
    exhaust.update(dt, nozzlesOf(opts.getShip().hullId), power, reduced || shipAlpha < 0.4, rnd);
    void prevPos;
  }

  let rs = 12345;
  const rnd = (): number => {
    rs = (rs * 16807) % 2147483647;
    return rs / 2147483647;
  };

  /* ------------------------------ NPC traffic (cosmetic, deterministic) ------------------------------ */

  const npcs: Npc[] = [];
  const nNpc = 2 + Math.floor(hash01(`${sys.id}:npcs`) * 5);
  for (let i = 0; i < nNpc; i++) {
    const hull = HULLS[Math.floor(hash01(`${sys.id}:npc:${i}:hull`) * HULLS.length)];
    const ship = buildStarterShip(hull.id, 'n', () => `n${i}`);
    const gfx = new Graphics();
    drawShip(gfx, hull.id, ship.slots, `${sys.id}:${i}`, null);
    npcLayer.addChild(gfx);
    const trailN = new Graphics();
    npcLayer.addChild(trailN);
    npcs.push({
      hullId: hull.id,
      gfx,
      trail: trailN,
      cycle: 36 + hash01(`${sys.id}:npc:${i}:cyc`) * 34,
      phase: hash01(`${sys.id}:npc:${i}:ph`),
      seed: `${sys.id}:npc:${i}`,
    });
  }

  /** Traffic nodes: every station, every other body, and the jump point. */
  type Node = { kind: 'station' | 'body' | 'jump'; pos: (t: number) => V2 };
  const nodes: Node[] = [
    ...stationVs.map((sv): Node => ({ kind: 'station', pos: (t) => stationPos(sv, t) })),
    ...views
      .filter((v) => v.body.kind !== 'belt')
      .map((v): Node => ({
        kind: 'body',
        pos: (t) => {
          const p = bodyPos(v, t);
          const a = hash01(`${v.body.id}:npc`) * 6.28;
          const r = bodyRadiusW(v.body) + 9;
          return { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r * 0.8 };
        },
      })),
    { kind: 'jump', pos: () => JUMP_POINT },
  ];

  function updateNpcs(time: number): void {
    const show = level() === 'full' && nodes.length >= 2;
    const t = clock(time);
    const k = kNow();
    for (const n of npcs) {
      n.gfx.visible = show;
      n.trail.visible = show;
      if (!show) continue;
      const cyc = time / n.cycle + n.phase;
      const c = Math.floor(cyc);
      const u = cyc - c;
      const a = Math.floor(hash01(`${n.seed}:a:${c}`) * nodes.length);
      let b = Math.floor(hash01(`${n.seed}:b:${c}`) * (nodes.length - 1));
      if (b >= a) b += 1;
      const A = nodes[a];
      const B = nodes[b];
      const tFlightStart = (c - n.phase) * n.cycle + 0.12 * n.cycle;
      const tFlightEnd = (c - n.phase) * n.cycle + 0.88 * n.cycle;
      const pa = A.pos(clock(tFlightStart));
      const pb = B.pos(clock(tFlightEnd));
      const ph = (u - 0.12) / 0.76;
      n.trail.clear();
      let vis = ph > 0 && ph < 1;
      let warp = 0;
      if (A.kind === 'jump' && u < 0.12) {
        vis = true;
        warp = 1 - u / 0.12;
      }
      if (B.kind === 'jump' && u > 0.88) {
        vis = true;
        warp = (u - 0.88) / 0.12;
      }
      if (!vis) {
        n.gfx.visible = false;
        continue;
      }
      const e =
        A.kind === 'jump' && u < 0.12 ? 0 : B.kind === 'jump' && u > 0.88 ? 1 : easeInOut(clamp(ph, 0, 1));
      const bend = (hash01(`${n.seed}:bend:${c}`) - 0.5) * 0.5;
      const ctrl1 = {
        x: lerp(pa.x, pb.x, 0.3) - (pb.y - pa.y) * bend,
        y: lerp(pa.y, pb.y, 0.3) + (pb.x - pa.x) * bend,
      };
      const ctrl2 = {
        x: lerp(pa.x, pb.x, 0.7) - (pb.y - pa.y) * bend,
        y: lerp(pa.y, pb.y, 0.7) + (pb.x - pa.x) * bend,
      };
      void t;
      const pos = bezier(pa, ctrl1, ctrl2, pb, e);
      const ahead = bezier(pa, ctrl1, ctrl2, pb, Math.min(1, e + 0.02));
      n.gfx.position.set(pos.x, pos.y);
      n.gfx.rotation = headingOf(pos, ahead, 0);
      const len = clamp(15 * Math.pow(cam.zoom, 0.4), 10, 54);
      const s = len / 360 / k;
      n.gfx.scale.set(s * (1 - 0.7 * warp));
      n.gfx.alpha = 1 - 0.8 * warp;
      // a short engine glow behind the ship and a flash at the jump point
      const dx = Math.cos(n.gfx.rotation);
      const dy = Math.sin(n.gfx.rotation);
      const glow = 4 / k;
      n.trail
        .circle(pos.x - dx * glow * 2.4, pos.y - dy * glow * 2.4, glow)
        .fill({ color: 0x4cc9f0, alpha: 0.5 });
      n.trail
        .moveTo(pos.x - dx * glow * 2, pos.y - dy * glow * 2)
        .lineTo(pos.x - dx * glow * 9, pos.y - dy * glow * 9);
      n.trail.stroke({ width: 1.2 / k, color: 0x4cc9f0, alpha: 0.35 });
      if (warp > 0.02)
        n.trail.circle(pos.x, pos.y, (10 + 26 * warp) / k).fill({ color: 0xbfe6ff, alpha: 0.5 * warp });
    }
  }

  /* ------------------------------ drawing ------------------------------ */

  function belt(b: BodyStatic, time: number): void {
    const rad = orbitRadius(b);
    const known = detected.has(b.id);
    const n = 90;
    const k = kNow();
    const spin = level() === 'full' ? time * 0.01 : 0;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + hashToUnit(`${b.id}:${i}`) * 0.3 + spin;
      const jr = rad * (0.97 + hashToUnit(`${b.id}:r${i}`) * 0.06);
      const rw = ((0.8 + hashToUnit(`${b.id}:s${i}`) * 1.6) * Math.sqrt(cam.zoom)) / k;
      belts
        .circle(Math.cos(a) * jr, Math.sin(a) * jr * TILT, rw)
        .fill({ color: known ? 0xb9b2a6 : 0x55607a, alpha: known ? 0.75 : 0.45 });
    }
  }

  function draw(time: number, dt: number): void {
    rings.clear();
    belts.clear();
    overlay.clear();
    trailG.clear();
    const k = kNow();
    const px = 1 / k;
    for (const b of planets) {
      const rad = orbitRadius(b);
      const known = detected.has(b.id);
      rings
        .ellipse(0, 0, rad, rad * TILT)
        .stroke({ width: px, color: known ? 0x4a78b8 : 0x2a3858, alpha: known ? 0.4 : 0.18 });
      if (b.kind === 'belt') belt(b, time);
    }
    const half = Math.min(W, H) / 2;
    for (const v of views) {
      const b = v.body;
      const known = detected.has(b.id);
      if (known && !v.wasKnown) {
        v.wasKnown = true;
        v.reveal = 0;
      }
      if (!known) v.wasKnown = false;
      if (v.reveal < 1 && known) {
        if (v.revealDelay > 0) v.revealDelay -= dt;
        else v.reveal = Math.min(1, v.reveal + (level() === 'off' ? 1 : dt / 0.9));
      }
      if (level() === 'off' && known) v.reveal = 1;
      const isBelt = b.kind === 'belt';
      if (v.mesh) {
        v.mesh.mesh.visible = true;
        v.mesh.mesh.position.set(v.x, v.y);
        v.mesh.mesh.scale.set(v.r);
        v.mesh.mesh.alpha = known ? lerp(0.28, 1, easeInOut(v.reveal)) : 0.28;
        v.mesh.setTime(time);
        const len = Math.hypot(v.x, v.y) || 1;
        v.mesh.setLight(-v.x / len, v.y / len, 0.55);
        const screenR = v.r * k;
        v.mesh.setDetail(clamp((screenR - 70) / 260, 0, 1));
        if (b.rings && known) {
          overlay
            .ellipse(v.x, v.y, v.r * 1.9, v.r * 0.55)
            .stroke({ width: Math.max(2 * px, v.r * 0.16), color: 0xcdbb9b, alpha: 0.6 });
          overlay
            .ellipse(v.x, v.y, v.r * 2.25, v.r * 0.66)
            .stroke({ width: Math.max(px, v.r * 0.07), color: 0xb2a283, alpha: 0.4 });
        }
      }
      // labels live in screen space so they stay crisp at every zoom
      const lp = isBelt ? scr(orbitRadius(b), 0) : scr(v.x, v.y + v.r + 3 * px);
      if (!isBelt) lp.y = scr(v.x, v.y).y + v.r * k + 3;
      v.label.visible = known && v.reveal > 0.05;
      v.label.text = b.name;
      v.label.position.set(lp.x, lp.y);
      v.label.alpha = (selected === b.index ? 1 : 0.75) * v.reveal;
      if (selected === b.index) {
        const rr = isBelt ? 14 * px : v.r + 7 * px;
        const pos = isBelt ? { x: orbitRadius(b), y: 0 } : { x: v.x, y: v.y };
        overlay.circle(pos.x, pos.y, rr).stroke({ width: 1.6 * px, color: 0xffffff, alpha: 0.9 });
      }
    }
    // stations on their orbits
    for (const sv of stationVs) {
      const nat = 5 / sv.view.radius;
      const sc = Math.max(nat, 12 / (k * sv.view.radius));
      sv.view.container.position.set(sv.x, sv.y);
      sv.view.container.scale.set(sc);
      sv.r = sv.view.radius * sc;
      sv.view.update(time, level() !== 'full');
      const lp = scr(sv.x, sv.y);
      sv.label.visible = cam.zoom > 2.2 || selected === sv.st.bodyIndex;
      sv.label.text = sv.st.name;
      sv.label.position.set(lp.x, lp.y + sv.r * k + 2);
      sv.label.alpha = 0.85;
    }
    // where the ship is: a soft ring around the destination body
    void half;
    // a soft ring marks where the player's ship is, even when it is tiny
    {
      const pulse = level() === 'full' ? 0.5 + 0.5 * Math.sin(time * 2.4) : 0.5;
      overlay
        .circle(shipPos.x, shipPos.y, (26 + 3 * pulse) * px)
        .stroke({ width: 1.4 * px, color: 0x4cc9f0, alpha: (0.25 + 0.3 * pulse) * shipAlpha });
    }
    // trail behind the ship while flying
    if (trail.length > 2) {
      for (let i = 1; i < trail.length; i++) {
        const a = i / trail.length;
        trailG
          .moveTo(trail[i - 1].x, trail[i - 1].y)
          .lineTo(trail[i].x, trail[i].y)
          .stroke({ width: (1 + 2 * a) * px, color: 0x7fd6ff, alpha: 0.5 * a });
      }
    }
    // effects
    fxG.clear();
    for (let i = fx.length - 1; i >= 0; i--) if (!fx[i].tick(dt)) fx.splice(i, 1);
  }

  /* ------------------------------ camera ------------------------------ */

  let follow: number | null = null;
  let zoomTarget: number | null = null;
  let panTarget: V2 | null = null;
  let vel: V2 = { x: 0, y: 0 };

  function applyCam(next: Cam): void {
    cam = clampCam(next, k0);
  }

  function setZoomAround(sx: number, sy: number, zoom: number): void {
    applyCam(zoomAt(cam, Wv(), Hv(), k0, sx, sy, zoom / cam.zoom));
  }

  function updateCamera(dt: number): void {
    if (zoomTarget !== null) {
      const f = 1 - Math.exp(-dt * 6);
      const z = lerp(cam.zoom, zoomTarget, level() === 'off' ? 1 : f);
      setZoomAround(Wv() / 2, Hv() / 2, z);
      if (Math.abs(z - zoomTarget) < 0.002 * zoomTarget) zoomTarget = null;
    }
    if (follow !== null) {
      const v = views[follow];
      if (v) {
        const want = centreOn(cam, k0, v.x, v.y);
        const f = level() === 'off' ? 1 : 1 - Math.exp(-dt * 7);
        applyCam({ zoom: cam.zoom, x: lerp(cam.x, want.x, f), y: lerp(cam.y, want.y, f) });
      }
    } else if (panTarget) {
      const f = level() === 'off' ? 1 : 1 - Math.exp(-dt * 6);
      applyCam({ zoom: cam.zoom, x: lerp(cam.x, panTarget.x, f), y: lerp(cam.y, panTarget.y, f) });
      if (Math.hypot(cam.x - panTarget.x, cam.y - panTarget.y) < 0.5) panTarget = null;
    }
    if (!dragging && (Math.abs(vel.x) > 1 || Math.abs(vel.y) > 1)) {
      applyCam({ zoom: cam.zoom, x: cam.x + vel.x * dt, y: cam.y + vel.y * dt });
      const d = Math.exp(-dt * 5);
      vel = { x: vel.x * d, y: vel.y * d };
    }
  }

  function applyView(time: number): void {
    const k = kNow();
    world.position.set(Wv() / 2 + cam.x, Hv() / 2 + cam.y);
    world.scale.set(k);
    // star size: a screen-sized glow that grows with the view
    star.mesh.position.set(0, 0);
    star.mesh.scale.set(Math.max(34 / k0, ((Math.min(W, H) / 2) * 0.2 * starSize) / k0));
    const aspect = W / H;
    const par = level() === 'off' ? 0 : 1;
    nebula.set({
      time,
      offX: 0.3 - (cam.x / W) * 0.12 * par,
      offY: 0.1 - (cam.y / H) * 0.12 * par,
      scale: 1.5,
      aspectX: aspect,
      aspectY: 1,
    });
    starfield.set({
      time,
      offX: -(cam.x / W) * 0.3 * par,
      offY: -(cam.y / H) * 0.3 * par,
      aspectX: aspect,
      aspectY: 1,
      twinkle: level() === 'full' ? 1 : 0,
    });
  }

  /* ------------------------------ input ------------------------------ */

  let canvas: HTMLCanvasElement | null = null;
  const pointers = new Map<number, V2>();
  let downSample: (PointerSample & { id: number }) | null = null;
  let lastTap: PointerSample | null = null;
  let dragging = false;
  let pinchDist = 0;
  let lastMove: { x: number; y: number; t: number } | null = null;

  function pick(px: number, py: number, touch: boolean): { body: number; station?: string } | null {
    let best: { body: number; station?: string } | null = null;
    let bd = touch ? 40 : 24;
    for (const sv of stationVs) {
      const p = scr(sv.x, sv.y);
      const d = Math.hypot(px - p.x, py - p.y) - sv.r * kNow();
      if (d < bd * 0.8) {
        bd = d;
        best = { body: sv.st.bodyIndex, station: sv.st.id };
      }
    }
    for (const v of views) {
      if (v.body.kind === 'belt') {
        const rad = orbitRadius(v.body);
        const w = toWorld(cam, Wv(), Hv(), k0, px, py);
        const d = Math.abs(Math.hypot(w.x, w.y / TILT) - rad) * kNow();
        if (d < bd * 0.8) {
          bd = d;
          best = { body: v.body.index };
        }
        continue;
      }
      const p = scr(v.x, v.y);
      const d = Math.hypot(px - p.x, py - p.y) - v.r * kNow();
      if (d < bd) {
        bd = d;
        best = { body: v.body.index };
      }
    }
    return best;
  }

  const local = (e: PointerEvent | WheelEvent): V2 => {
    const r = canvas!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: PointerEvent) => {
    const p = local(e);
    pointers.set(e.pointerId, p);
    try {
      canvas!.setPointerCapture(e.pointerId);
    } catch {
      /* not capturable (synthetic events) */
    }
    if (pointers.size === 1) {
      downSample = { id: e.pointerId, x: p.x, y: p.y, t: performance.now() };
      dragging = false;
      vel = { x: 0, y: 0 };
      lastMove = { x: p.x, y: p.y, t: performance.now() };
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      downSample = null;
      dragging = true;
    }
  };

  const onMove = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    const p = local(e);
    const prev = pointers.get(e.pointerId)!;
    pointers.set(e.pointerId, p);
    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist > 0 && d > 0) {
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        follow = null;
        zoomTarget = null;
        panTarget = null;
        applyCam(zoomAt(cam, Wv(), Hv(), k0, mx, my, d / pinchDist));
        applyCam({ zoom: cam.zoom, x: cam.x + (p.x - prev.x) / 2, y: cam.y + (p.y - prev.y) / 2 });
      }
      pinchDist = d;
      return;
    }
    if (!downSample) return;
    const t = performance.now();
    if (!dragging && !isTap(downSample, { x: p.x, y: p.y, t: downSample.t }, e.pointerType === 'touch')) {
      dragging = true;
      follow = null;
      panTarget = null;
    }
    if (dragging) {
      applyCam({ zoom: cam.zoom, x: cam.x + (p.x - prev.x), y: cam.y + (p.y - prev.y) });
      if (lastMove) {
        const dtm = Math.max(1, t - lastMove.t) / 1000;
        vel = {
          x: lerp(vel.x, (p.x - lastMove.x) / dtm, 0.5),
          y: lerp(vel.y, (p.y - lastMove.y) / dtm, 0.5),
        };
      }
      lastMove = { x: p.x, y: p.y, t };
    }
  };

  const onUp = (e: PointerEvent) => {
    const p = local(e);
    pointers.delete(e.pointerId);
    try {
      canvas!.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (pointers.size > 0) {
      pinchDist = 0;
      return;
    }
    const up: PointerSample = { x: p.x, y: p.y, t: performance.now() };
    const touch = e.pointerType === 'touch';
    if (downSample && isTap(downSample, up, touch)) {
      vel = { x: 0, y: 0 };
      if (flight && flight.kind !== 'dock') {
        skipFlight();
      } else {
        const hit = pick(p.x, p.y, touch);
        if (isDoubleTap(lastTap, up, touch) && hit) {
          selected = hit.body;
          opts.onSelectBody(hit.body);
          focusBody(hit.body);
          lastTap = null;
        } else {
          selected = hit ? hit.body : null;
          opts.onSelectBody(selected);
          lastTap = up;
        }
      }
    } else if (dragging) {
      // let go: keep a fraction of the speed as inertia, but not a stale one
      if (lastMove && performance.now() - lastMove.t > 90) vel = { x: 0, y: 0 };
    }
    downSample = null;
    dragging = false;
    opts.onCamera?.(cam);
  };

  const onCancel = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    downSample = null;
    dragging = false;
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const p = local(e);
    const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    follow = null;
    zoomTarget = null;
    panTarget = null;
    applyCam(zoomAt(cam, Wv(), Hv(), k0, p.x, p.y, Math.exp(-delta * 0.0016)));
    opts.onCamera?.(cam);
  };

  function skipFlight(): void {
    if (!flight) return;
    flight.t = 1;
  }

  function focusBody(index: number): void {
    const v = views[index];
    if (!v) return;
    follow = index;
    panTarget = null;
    const r = v.body.kind === 'belt' ? 40 : v.r;
    zoomTarget = zoomToFit(
      r,
      k0,
      Math.min(W - ins.l - ins.r, H - ins.t - ins.b),
      v.body.kind === 'belt' ? 0.5 : 0.62,
    );
  }

  function resetView(): void {
    follow = null;
    zoomTarget = 1;
    panTarget = { x: 0, y: 0 };
    vel = { x: 0, y: 0 };
  }

  /* ------------------------------ effects ------------------------------ */

  function scanPulse(): void {
    const lvl = level();
    if (lvl === 'off') return;
    const origin = { ...shipPos };
    const speed = 260;
    let t = 0;
    const maxR = WORLD_R * 2.2;
    // bodies are revealed as the wave reaches them
    for (const v of views) {
      const d = Math.hypot(v.x - origin.x, v.y - origin.y);
      v.revealDelay = lvl === 'full' ? d / speed : 0;
    }
    opts.onSound?.('scan');
    fx.push({
      tick(dt) {
        t += dt;
        const r = t * speed;
        const px = 1 / kNow();
        const a = clamp(1 - r / maxR, 0, 1);
        fxG.circle(origin.x, origin.y, r).stroke({ width: 3 * px, color: 0x8fe3ff, alpha: 0.7 * a });
        fxG
          .circle(origin.x, origin.y, r * 0.93)
          .stroke({ width: 1.5 * px, color: 0xbfe6ff, alpha: 0.35 * a });
        return r < maxR;
      },
    });
  }

  function mineBeam(bodyIndex: number, intensity: number): void {
    const lvl = level();
    if (lvl === 'off') return;
    const v = views[bodyIndex];
    if (!v) return;
    const gas = v.body.kind === 'gas';
    const dur = lvl === 'full' ? 1.4 + intensity * 0.5 : 0.5;
    let t = 0;
    const sparks: { x: number; y: number; vx: number; vy: number; life: number }[] = [];
    opts.onSound?.('mine');
    fx.push({
      tick(dt) {
        t += dt;
        const px = 1 / kNow();
        const from = shipPos;
        const to =
          v.body.kind === 'belt'
            ? { x: from.x + Math.cos(0.3) * 26, y: from.y + 14 }
            : { x: v.x - (v.x - from.x) * 0.12, y: v.y - (v.y - from.y) * 0.12 };
        const on = t < dur;
        if (on) {
          const pulse = 0.65 + 0.35 * Math.sin(t * 30);
          const col = gas ? 0x9fd0ff : 0xff6a4a;
          if (gas) {
            // gas is sucked in: particles flow from the planet to the ship
            for (let i = 0; i < 2 + intensity; i++) {
              const a = rnd() * Math.PI * 2;
              sparks.push({
                x: to.x + Math.cos(a) * 8,
                y: to.y + Math.sin(a) * 8,
                vx: (from.x - to.x) * 1.4,
                vy: (from.y - to.y) * 1.4,
                life: 0.9,
              });
            }
          } else {
            fxG
              .moveTo(from.x, from.y)
              .lineTo(to.x, to.y)
              .stroke({ width: (3 + intensity) * px, color: col, alpha: 0.35 * pulse });
            fxG
              .moveTo(from.x, from.y)
              .lineTo(to.x, to.y)
              .stroke({ width: 1.4 * px, color: 0xffffff, alpha: 0.9 * pulse });
            for (let i = 0; i < 3 + intensity * 2; i++) {
              const a = rnd() * Math.PI * 2;
              const sp = 20 + rnd() * 40;
              sparks.push({
                x: to.x,
                y: to.y,
                vx: Math.cos(a) * sp + (from.x - to.x) * 0.5,
                vy: Math.sin(a) * sp + (from.y - to.y) * 0.5,
                life: 0.7,
              });
            }
          }
        }
        for (let i = sparks.length - 1; i >= 0; i--) {
          const s = sparks[i];
          s.life -= dt;
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          if (s.life <= 0) {
            sparks.splice(i, 1);
            continue;
          }
          fxG
            .circle(s.x, s.y, 1.5 * px)
            .fill({ color: gas ? 0xbfe0ff : 0xffc27a, alpha: clamp(s.life, 0, 1) });
        }
        return on || sparks.length > 0;
      },
    });
  }

  function launchProbe(bodyIndex: number): void {
    const lvl = level();
    if (lvl === 'off') return;
    const v = views[bodyIndex];
    if (!v) return;
    const dur = lvl === 'full' ? 1.6 : 0.5;
    let t = 0;
    const start = { ...shipPos };
    opts.onSound?.('probe');
    fx.push({
      tick(dt) {
        t += dt;
        const u = clamp(t / dur, 0, 1);
        const px = 1 / kNow();
        const end = { x: v.x, y: v.y };
        const mid = { x: lerp(start.x, end.x, 0.5) + 14, y: lerp(start.y, end.y, 0.5) - 18 };
        const e = easeInOut(u);
        const p = bezier(start, mid, mid, end, e);
        const sz = (1 - 0.6 * u) * 3.2 * px * 2;
        fxG.circle(p.x, p.y, sz).fill({ color: 0xffe08a });
        fxG.circle(p.x, p.y, sz * 3).fill({ color: 0xffe08a, alpha: 0.2 });
        if (u >= 1) {
          const burst = clamp((t - dur) / 0.5, 0, 1);
          fxG
            .circle(end.x, end.y, (v.r + 4) * (1 + burst * 0.4))
            .stroke({ width: 2 * px, color: 0xffe08a, alpha: 0.7 * (1 - burst) });
        }
        return t < dur + 0.5;
      },
    });
  }

  /** Hyperspace exit: a white flash and star streaks flying outwards that settle into the system view. */
  function drawArrival(dt: number): void {
    arrivalG.clear();
    if (arrivalT >= ARRIVAL_DUR) return;
    arrivalT += dt;
    const u = Math.min(1, arrivalT / ARRIVAL_DUR);
    const reduced = level() !== 'full';
    const cx = Wv() / 2;
    const cy = Hv() / 2;
    const maxR = Math.hypot(W, H) / 2;
    const fade = 1 - u;
    if (!reduced) {
      for (let i = 0; i < 70; i++) {
        const a = hash01(`arr:${i}`) * Math.PI * 2;
        const r0 = (0.05 + hash01(`arr:r${i}`) * 0.95) * maxR;
        const out = easeInOut(u);
        const r1 = r0 * (0.35 + 1.6 * out);
        const len = (0.1 + 0.5 * hash01(`arr:l${i}`)) * maxR * fade * 0.5;
        arrivalG
          .moveTo(cx + Math.cos(a) * (r1 - len), cy + Math.sin(a) * (r1 - len))
          .lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1)
          .stroke({ width: 1.4, color: 0xcfe9ff, alpha: 0.8 * fade });
      }
    }
    arrivalG.rect(0, 0, W, H).fill({ color: 0xffffff, alpha: Math.max(0, 0.75 * (1 - u * 2.2)) });
  }

  /* ------------------------------ scene ------------------------------ */

  // initial ship position: instantly at its rest place (or flying out of the station it has just left)
  let initialised = false;
  function initShip(time: number): void {
    initialised = true;
    place(time);
    shipPos = restPos(time);
    prevPos = shipPos;
    heading = 0.4;
    if (opts.launch && level() !== 'off') {
      const from = shipStation ? shipPos : stationVs[0] ? { x: stationVs[0].x, y: stationVs[0].y } : shipPos;
      shipStation = null;
      startFlight(() => restPos(now), 'launch', undefined, from, level() === 'full' ? 1.3 : 0.3);
    }
  }

  return {
    container,
    attach(c) {
      canvas = c;
      c.style.touchAction = 'none';
      c.addEventListener('pointerdown', onDown);
      c.addEventListener('pointermove', onMove);
      c.addEventListener('pointerup', onUp);
      c.addEventListener('pointercancel', onCancel);
      c.addEventListener('wheel', onWheel, { passive: false });
    },
    resize(w, h) {
      W = w;
      H = h;
      layout();
      applyCam(cam);
    },
    update(dt, time) {
      now = time;
      if (!initialised) initShip(time);
      place(time);
      updateCamera(dt);
      applyView(time);
      updateShip(dt, time);
      updateNpcs(time);
      draw(time, dt);
      drawArrival(dt);
      star.setTime(time);
    },
    destroy() {
      memory.set(sys.id, { ...cam });
      if (canvas) {
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('pointercancel', onCancel);
        canvas.removeEventListener('wheel', onWheel);
        canvas.style.touchAction = '';
      }
      container.destroy({ children: true });
    },
    setSelected(i) {
      selected = i;
    },
    setDetected(ids) {
      detected = new Set(ids);
    },
    setShipLocation(bodyIndex, stationId) {
      if (bodyIndex === shipBody && stationId === shipStation) return;
      const wasStation = shipStation;
      shipBody = bodyIndex;
      shipStation = stationId;
      if (!initialised) return;
      if (flight && flight.kind === 'dock') return;
      if (stationId) {
        // arriving at a station by other means: place the ship there
        return;
      }
      void wasStation;
      startFlight(() => restPos(now), 'fly');
    },
    zoomBy(factor) {
      follow = null;
      zoomTarget = clamp((zoomTarget ?? cam.zoom) * factor, ZOOM_MIN, ZOOM_MAX);
    },
    setInsets(l, r, t, b) {
      ins = { l, r, t, b };
      layout();
    },
    resetView,
    focusBody,
    dockInto(stationId, done) {
      const sv = stationVs.find((x) => x.st.id === stationId);
      if (!sv || level() === 'off') {
        shipStation = stationId;
        shipBody = sv ? sv.st.bodyIndex : shipBody;
        done();
        return;
      }
      shipBody = sv.st.bodyIndex;
      startFlight(
        () => ({ x: sv.x, y: sv.y }),
        'dock',
        () => {
          shipStation = stationId;
          done();
        },
        shipPos,
        level() === 'full' ? undefined : 0.3,
      );
    },
    skipFlight,
    isFlying: () => !!flight,
    scanPulse,
    mineBeam,
    launchProbe,
    getZoom: () => cam.zoom,
    getCam: () => ({ ...cam }),
    bodyScreenPos(index) {
      const v = views[index];
      if (!v) return null;
      const p = scr(v.x, v.y);
      return { x: p.x, y: p.y, r: v.r * kNow() };
    },
    shipScreenPos() {
      return scr(shipPos.x, shipPos.y);
    },
    stationScreenPos(id) {
      const sv = stationVs.find((x) => x.st.id === id);
      return sv ? scr(sv.x, sv.y) : null;
    },
  };
}
