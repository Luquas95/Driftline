import { Rng, hashString } from './rng';
import { systemName, stationSuffix, STATION_PREFIX } from './names';
import { STATION_TYPES, STATION_TYPES_BY_ID } from '../content/stations';
import { GOODS, MARKET_GOODS } from '../content/goods';
import { ANOMALY_EVENT_IDS } from '../content/events';
import type {
  BodyKind,
  BodyStatic,
  Deposit,
  Galaxy,
  Region,
  SpectralClass,
  StationSize,
  StationStatic,
  StationTypeId,
  SystemStatic,
} from './types';
import { T } from './tuning';

const SPECTRAL_WEIGHTS: Record<Region, Record<SpectralClass, number>> = {
  core: { O: 6, B: 10, A: 14, F: 14, G: 10, K: 8, M: 4 },
  inner: { O: 1, B: 4, A: 8, F: 14, G: 16, K: 14, M: 10 },
  outer: { O: 0.2, B: 1, A: 3, F: 8, G: 14, K: 18, M: 22 },
  rim: { O: 0, B: 0.3, A: 1, F: 4, G: 10, K: 18, M: 32 },
};

/** Habitable-zone centre in AU per spectral class. */
const HZ: Record<SpectralClass, number> = { O: 30, B: 18, A: 5, F: 2, G: 1, K: 0.6, M: 0.25 };

const DEPOSIT_POOL: Record<BodyKind, string[]> = {
  belt: ['iron_ore', 'silicates', 'rare_ore', 'water_ice', 'crystals'],
  gas: ['hydrocarbons', 'hydrocarbons', 'water_ice', 'radioactives'],
  rocky: ['iron_ore', 'silicates', 'rare_ore', 'crystals'],
  desert: ['silicates', 'crystals', 'rare_ore', 'iron_ore'],
  ocean: ['water_ice', 'hydrocarbons', 'crystals'],
  ice: ['water_ice', 'hydrocarbons', 'crystals', 'rare_ore'],
  volcanic: ['radioactives', 'rare_ore', 'crystals', 'iron_ore'],
  dead: ['iron_ore', 'rare_ore', 'crystals', 'radioactives', 'silicates'],
  moon: ['water_ice', 'silicates', 'iron_ore', 'rare_ore'],
};

const REGION_OF = (r: number): Region => (r < 0.22 ? 'core' : r < 0.5 ? 'inner' : r < 0.8 ? 'outer' : 'rim');
const REGION_RICH: Record<Region, number> = { core: 0.8, inner: 0.6, outer: 0.42, rim: 0.27 };
const REGION_DANGER: Record<Region, number> = { core: 0.7, inner: 0.45, outer: 0.3, rim: 0.3 };
const STATION_COUNT: Record<Region, number[]> = {
  core: [0.2, 0.3, 0.3, 0.2],
  inner: [0.34, 0.36, 0.22, 0.08],
  outer: [0.45, 0.34, 0.16, 0.05],
  rim: [0.58, 0.28, 0.11, 0.03],
};
const SIZE_WEIGHTS: Record<Region, Record<StationSize, number>> = {
  core: { small: 1, medium: 3, large: 4 },
  inner: { small: 2, medium: 4, large: 2 },
  outer: { small: 4, medium: 4, large: 1 },
  rim: { small: 6, medium: 3, large: 0.4 },
};

const cache = new Map<string, Galaxy>();

export function getGalaxy(seed: string, n = T.galaxySystems): Galaxy {
  const key = `${seed}|${n}`;
  let g = cache.get(key);
  if (!g) {
    g = generateGalaxy(seed, n);
    cache.set(key, g);
    if (cache.size > 3) cache.delete(cache.keys().next().value as string);
  }
  return g;
}

export function dist(a: SystemStatic, b: SystemStatic): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function generateGalaxy(seed: string, n = T.galaxySystems): Galaxy {
  const rng = Rng.fromSeed(`${seed}:galaxy`);
  const R = T.galaxyRadius * Math.sqrt(n / T.galaxySystems);
  const pts: { x: number; y: number }[] = [];
  const minD = 2.2;
  let guard = 0;
  while (pts.length < n && guard++ < n * 60) {
    const roll = rng.next();
    let x: number, y: number;
    if (roll < 0.16) {
      // dense core blob
      const a = rng.range(0, Math.PI * 2);
      const r = Math.abs(rng.gauss(0, R * 0.14));
      x = Math.cos(a) * r;
      y = Math.sin(a) * r;
    } else if (roll < 0.84) {
      // spiral arms
      const arm = rng.int(0, 3);
      const r = R * Math.pow(rng.next(), 0.7);
      const a = (arm * Math.PI) / 2 + (r / R) * 3.4 + rng.gauss(0, 0.2 + 0.25 * (1 - r / R));
      x = Math.cos(a) * r;
      y = Math.sin(a) * r;
    } else {
      // scattered halo and clusters
      const a = rng.range(0, Math.PI * 2);
      const r = R * Math.sqrt(rng.next());
      x = Math.cos(a) * r;
      y = Math.sin(a) * r;
    }
    if (Math.hypot(x, y) > R) continue;
    if (pts.some((p) => Math.hypot(p.x - x, p.y - y) < minD)) continue;
    pts.push({ x, y });
  }

  // sector centres: farthest point sampling for even coverage
  const sectorCount = 10;
  const centres: number[] = [rng.int(0, pts.length - 1)];
  while (centres.length < sectorCount) {
    let best = -1,
      bestD = -1;
    pts.forEach((p, i) => {
      const d = Math.min(...centres.map((c) => Math.hypot(pts[c].x - p.x, pts[c].y - p.y)));
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    });
    centres.push(best);
  }
  const sectors = centres.map((c, i) => ({ id: i, name: systemName(rng), x: pts[c].x, y: pts[c].y }));

  const usedNames = new Set<string>();
  const systems: SystemStatic[] = pts.map((p, id) => {
    const r = Math.hypot(p.x, p.y) / R;
    const region = REGION_OF(r);
    let name = systemName(rng);
    while (usedNames.has(name)) name = systemName(rng);
    usedNames.add(name);
    const sector = nearestSector(sectors, p.x, p.y);
    const spectral = rng.weighted(
      Object.keys(SPECTRAL_WEIGHTS[region]) as SpectralClass[],
      (c) => SPECTRAL_WEIGHTS[region][c],
    );
    const richness = clamp01(REGION_RICH[region] + rng.gauss(0, 0.14));
    const danger = clamp01(REGION_DANGER[region] + rng.gauss(0, 0.12));
    return {
      id,
      name,
      x: p.x,
      y: p.y,
      region,
      sector,
      spectral,
      starSeed: rng.nextU32(),
      richness,
      danger,
      bodies: [],
      stations: [],
      neighbors: [],
    };
  });

  buildRoutes(systems, rng);

  const stationsById: Record<string, StationStatic> = {};
  for (const s of systems) {
    const brng = Rng.fromSeed(`${seed}:sys:${s.id}`);
    s.bodies = generateBodies(s, brng);
    s.stations = generateStations(s, brng);
    for (const st of s.stations) stationsById[st.id] = st;
  }
  guaranteeStartingStation(systems, stationsById, rng);
  return { seed, systems, stationsById, sectors, radius: R };
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function nearestSector(sectors: { x: number; y: number }[], x: number, y: number): number {
  let best = 0,
    bd = Infinity;
  sectors.forEach((c, i) => {
    const d = Math.hypot(c.x - x, c.y - y);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

function buildRoutes(systems: SystemStatic[], rng: Rng): void {
  const n = systems.length;
  const edges = new Set<string>();
  const add = (a: number, b: number) => {
    if (a === b) return;
    const k = a < b ? `${a}-${b}` : `${b}-${a}`;
    edges.add(k);
  };
  const maxLen = 13;
  for (const s of systems) {
    const k = s.region === 'core' ? 4 : s.region === 'inner' ? 3 : s.region === 'outer' ? 3 : 2;
    const near = systems
      .filter((o) => o.id !== s.id)
      .map((o) => ({ id: o.id, d: dist(s, o) }))
      .sort((a, b) => a.d - b.d);
    let added = 0;
    for (const o of near) {
      if (added >= k) break;
      if (o.d > maxLen && added >= 1) break;
      add(s.id, o.id);
      added++;
    }
    // occasional long lane to a random distant-ish neighbour for variety
    if (rng.chance(0.06)) add(s.id, near[Math.min(near.length - 1, rng.int(4, 8))].id);
  }
  // guarantee connectivity with MST over components
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (const e of edges) {
    const [a, b] = e.split('-').map(Number);
    parent[find(a)] = find(b);
  }
  const cand: { a: number; b: number; d: number }[] = [];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) cand.push({ a: i, b: j, d: dist(systems[i], systems[j]) });
  cand.sort((x, y) => x.d - y.d);
  for (const c of cand) {
    if (find(c.a) !== find(c.b)) {
      parent[find(c.a)] = find(c.b);
      add(c.a, c.b);
    }
  }
  for (const e of edges) {
    const [a, b] = e.split('-').map(Number);
    systems[a].neighbors.push(b);
    systems[b].neighbors.push(a);
  }
  for (const s of systems) s.neighbors.sort((a, b) => a - b);
}

function generateBodies(s: SystemStatic, rng: Rng): BodyStatic[] {
  const count = Math.max(
    1,
    Math.min(8, Math.round(2 + rng.next() * 3 + s.richness * 2.5 + rng.gauss(0, 0.8))),
  );
  const hz = HZ[s.spectral];
  const bodies: BodyStatic[] = [];
  let orbit = 0.25 * Math.max(0.5, hz ** 0.6) * rng.range(0.8, 1.3);
  let beltCount = 0;
  const planetCount = Math.max(1, Math.ceil(count * 0.7));
  for (let i = 0; i < planetCount; i++) {
    const rel = orbit / hz;
    let kind: BodyKind;
    if (rel < 0.55)
      kind = rng.weighted<BodyKind>(['rocky', 'volcanic', 'desert', 'dead'], (k) =>
        k === 'volcanic' ? 3 : k === 'dead' ? 2 : 2,
      );
    else if (rel < 1.7)
      kind = rng.weighted<BodyKind>(['rocky', 'ocean', 'desert', 'volcanic', 'belt'], (k) =>
        k === 'ocean' ? 3 : k === 'rocky' ? 4 : k === 'belt' ? 1 : 2,
      );
    else if (rel < 6)
      kind = rng.weighted<BodyKind>(['gas', 'ice', 'belt', 'rocky', 'dead'], (k) =>
        k === 'gas' ? 4 : k === 'belt' ? 2 : k === 'ice' ? 3 : 1,
      );
    else
      kind = rng.weighted<BodyKind>(['ice', 'gas', 'dead', 'belt'], (k) =>
        k === 'ice' ? 4 : k === 'gas' ? 3 : k === 'dead' ? 2 : 1,
      );
    if (kind === 'belt') {
      if (beltCount >= 2) kind = 'dead';
      else beltCount++;
    }
    bodies.push(makeBody(s, bodies.length, kind, orbit, -1, rng));
    orbit *= rng.range(1.5, 2.1);
  }
  // moons
  const moonTarget = count - bodies.length;
  for (let m = 0; m < moonTarget; m++) {
    const hosts = bodies.filter((b) => b.parent < 0 && b.kind !== 'belt');
    const host = rng.pick(hosts);
    bodies.push(makeBody(s, bodies.length, 'moon', host.orbit, host.index, rng));
  }
  return bodies;
}

function makeBody(
  s: SystemStatic,
  index: number,
  kind: BodyKind,
  orbit: number,
  parent: number,
  rng: Rng,
): BodyStatic {
  const id = `${s.id}.${index}`;
  const size =
    kind === 'gas'
      ? rng.range(1.6, 2.6)
      : kind === 'moon'
        ? rng.range(0.25, 0.6)
        : kind === 'belt'
          ? 1
          : rng.range(0.6, 1.25);
  const dep: Deposit[] = [];
  const pool = DEPOSIT_POOL[kind];
  const nDep = kind === 'belt' ? rng.int(2, 3) : rng.int(1, 3);
  const taken = new Set<string>();
  for (let i = 0; i < nDep; i++) {
    const good = rng.pick(pool);
    if (taken.has(good)) continue;
    taken.add(good);
    const rich = clamp01(rng.range(0.15, 0.7) * (0.55 + s.richness) + rng.range(0, 0.15));
    const rareBias = good === 'rare_ore' || good === 'crystals' || good === 'radioactives' ? 1 : 0;
    dep.push({
      id: `${id}#${i}`,
      goodId: good,
      richness: rich,
      hidden: Math.min(3, rng.int(0, 2) + rareBias),
    });
  }
  const anomalies: BodyStatic['anomalies'] = [];
  const anomalyChance = 0.07 + (s.region === 'rim' ? 0.1 : s.region === 'outer' ? 0.05 : 0) + s.danger * 0.05;
  if (kind !== 'belt' || rng.chance(0.4)) {
    if (rng.chance(anomalyChance) && ANOMALY_EVENT_IDS.length) {
      anomalies.push({ id: `${id}!0`, eventId: rng.pick(ANOMALY_EVENT_IDS), hidden: rng.int(1, 3) });
    }
  }
  const hazard =
    kind === 'volcanic' ? 1.6 : kind === 'gas' ? 1.3 : kind === 'belt' ? 1.2 : kind === 'dead' ? 1.1 : 1;
  const names = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  return {
    id,
    systemId: s.id,
    index,
    kind,
    name:
      parent >= 0
        ? `${s.name} ${names[Math.min(parent, 9)]}-${String.fromCharCode(97 + (index % 26))}`
        : `${s.name} ${names[Math.min(index, 9)]}`,
    orbit: parent >= 0 ? orbit : orbit,
    parent,
    seed: rng.nextU32(),
    size,
    rings: kind === 'gas' ? rng.chance(0.4) : false,
    scanDifficulty:
      kind === 'belt'
        ? rng.int(0, 1)
        : kind === 'moon'
          ? rng.int(1, 2)
          : rng.int(0, 1) + (kind === 'dead' ? 1 : 0),
    deposits: dep,
    anomalies,
    hazard,
    atmosphere: ['rocky', 'ocean', 'desert', 'gas', 'volcanic'].includes(kind) && rng.chance(0.85),
  };
}

function generateStations(s: SystemStatic, rng: Rng): StationStatic[] {
  const probs = STATION_COUNT[s.region];
  let count = rng.weighted([0, 1, 2, 3], (k) => probs[k] * (k === 0 ? 1 : 0.6 + s.richness * 0.8));
  count = Math.min(count, Math.max(1, s.bodies.length));
  const out: StationStatic[] = [];
  const usedNames = new Set<string>();
  for (let i = 0; i < count; i++) {
    const type = rng.weighted(STATION_TYPES, (t) => t.weight[s.region]).id as StationTypeId;
    const sizeW = SIZE_WEIGHTS[s.region];
    const size = rng.weighted<StationSize>(['small', 'medium', 'large'], (k) => sizeW[k]);
    const habitable = s.bodies.filter(
      (b) => ['rocky', 'ocean', 'desert', 'ice', 'moon'].includes(b.kind) && b.kind !== 'belt',
    );
    const colony =
      habitable.length > 0 && rng.chance(type === 'agricultural' ? 0.8 : type === 'pirate' ? 0.15 : 0.35);
    const host = colony ? rng.pick(habitable) : rng.pick(s.bodies);
    let name: string;
    do name = `${rng.pick(STATION_PREFIX)} ${stationSuffix(rng)}`;
    while (usedNames.has(name));
    usedNames.add(name);
    const def = STATION_TYPES_BY_ID[type];
    const blackMarket =
      def.blackMarket ||
      (!def.lawful ? true : (s.region === 'outer' || s.region === 'rim') && rng.chance(0.1));
    const st: StationStatic = {
      id: `${s.id}:${i}`,
      systemId: s.id,
      name,
      type,
      size,
      colony,
      bodyIndex: host.index,
      role: {},
      goods: [],
      blackMarket,
    };
    assignRoles(st, rng);
    out.push(st);
  }
  return out;
}

function assignRoles(st: StationStatic, rng: Rng): void {
  const def = STATION_TYPES_BY_ID[st.type];
  const role: Record<string, number> = {};
  const goods = new Set<string>();
  for (const [g, v] of Object.entries(def.produces)) {
    if (rng.chance(0.88)) {
      role[g] = Math.min(1, v * rng.range(0.8, 1.2));
      goods.add(g);
    }
  }
  for (const [g, v] of Object.entries(def.consumes)) {
    if (rng.chance(0.88) && !(g in role)) {
      role[g] = -Math.min(1, v * rng.range(0.8, 1.2));
      goods.add(g);
    }
  }
  const extra = st.size === 'small' ? 3 : st.size === 'medium' ? 6 : 10;
  const legal = MARKET_GOODS.filter((x) => !x.tags.includes('illegal')).map((x) => x.id);
  for (let i = 0; i < extra; i++) goods.add(rng.pick(legal));
  if (st.blackMarket) {
    const illegal = GOODS.filter((x) => x.tags.includes('illegal'));
    for (const g of illegal) {
      if (st.type === 'pirate' || rng.chance(0.7)) {
        goods.add(g.id);
        if (!(g.id in role)) role[g.id] = st.type === 'pirate' ? 0.5 : -0.55;
      }
    }
  }
  // legal stations never list illegal goods unless they own a black market
  st.goods = [...goods]
    .filter((g) => st.blackMarket || !GOODS.find((x) => x.id === g)!.tags.includes('illegal'))
    .sort();
  st.role = Object.fromEntries(Object.entries(role).filter(([g]) => st.goods.includes(g)));
}

/** The galaxy must offer a safe, full-service starting point in a non-hostile region. */
function guaranteeStartingStation(
  systems: SystemStatic[],
  byId: Record<string, StationStatic>,
  rng: Rng,
): void {
  if (findStartSystem(systems)) return;
  const cand = systems.filter((s) => s.region === 'outer' || s.region === 'inner')[0] ?? systems[0];
  const st: StationStatic = {
    id: `${cand.id}:${cand.stations.length}`,
    systemId: cand.id,
    name: 'Přístav Nadějná',
    type: 'trade_hub',
    size: 'medium',
    colony: false,
    bodyIndex: 0,
    role: {},
    goods: [],
    blackMarket: false,
  };
  assignRoles(st, rng);
  cand.stations.push(st);
  byId[st.id] = st;
}

export function findStartSystem(systems: SystemStatic[]): SystemStatic | undefined {
  const ok = (s: SystemStatic) =>
    (s.region === 'outer' || s.region === 'inner') &&
    s.stations.some(
      (st) => st.type !== 'pirate' && st.size !== 'small' && STATION_TYPES_BY_ID[st.type].shipyard >= 1,
    ) &&
    s.neighbors.length >= 2 &&
    s.neighbors.some((n) => systems[n].stations.length > 0);
  const hubs = systems.filter(
    (s) => ok(s) && s.stations.some((st) => STATION_TYPES_BY_ID[st.type].shipyard >= 2),
  );
  const pool = hubs.length ? hubs : systems.filter(ok);
  if (!pool.length) return undefined;
  // prefer a start close to the middle of the map ring (outer/inner border)
  return [...pool].sort(
    (a, b) => Math.abs(Math.hypot(a.x, a.y) - 34) - Math.abs(Math.hypot(b.x, b.y) - 34),
  )[0];
}

export function hashSeedNumber(seed: string): number {
  return hashString(seed)[0];
}

/** Dijkstra over the route graph by distance. */
export function shortestPath(
  g: Galaxy,
  from: number,
  to: number,
  allowed?: (id: number) => boolean,
): number[] | null {
  if (from === to) return [from];
  const n = g.systems.length;
  const d = new Array<number>(n).fill(Infinity);
  const prev = new Array<number>(n).fill(-1);
  const done = new Array<boolean>(n).fill(false);
  d[from] = 0;
  for (;;) {
    let u = -1,
      best = Infinity;
    for (let i = 0; i < n; i++) {
      if (!done[i] && d[i] < best) {
        best = d[i];
        u = i;
      }
    }
    if (u < 0 || u === to) break;
    done[u] = true;
    for (const v of g.systems[u].neighbors) {
      if (allowed && !allowed(v) && v !== to) continue;
      const nd = d[u] + dist(g.systems[u], g.systems[v]);
      if (nd < d[v]) {
        d[v] = nd;
        prev[v] = u;
      }
    }
  }
  if (!isFinite(d[to])) return null;
  const path: number[] = [];
  for (let c = to; c >= 0; c = prev[c]) path.push(c);
  return path.reverse();
}
