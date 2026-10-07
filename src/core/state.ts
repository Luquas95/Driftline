import { HULLS_BY_ID } from '../content/hulls';
import { MODULES_BY_ID } from '../content/modules';
import { cargoMass, gridDims, overloadCells, syncCargoUid, type GridDims } from './cargo';
import { snapshotPrice } from './economy';
import { crewHasOfficer, crewSupplyPerDay } from './crewBase';
import { defaultCrew } from './crew';
import { getGalaxy } from './galaxy';
import { Rng } from './rng';
import { buildStarterShip, computeShipStats, insuredValue, type ShipStats } from './ship';
import { T } from './tuning';
import type { Difficulty, Galaxy, GameState, Message, StationStatic } from './types';
import { GOODS } from '../content/goods';

export type Result<T = object> =
  ({ ok: true } & T) | { ok: false; error: string; params?: Record<string, string | number> };

export const ok = <T extends object>(extra?: T): Result<T> => ({ ok: true, ...(extra ?? ({} as T)) });
export const fail = (
  error: string,
  params?: Record<string, string | number>,
): { ok: false; error: string; params?: Record<string, string | number> } => ({ ok: false, error, params });

export const DEFAULT_DIFFICULTY: Difficulty = {
  prices: 'normal',
  risk: 'normal',
  insurance: true,
  permadeath: false,
};

export interface NewGameOptions {
  seed?: string;
  difficulty?: Partial<Difficulty>;
  shipName?: string;
  galaxySize?: number;
  /** Entropy used to create a seed when none is given (the caller supplies it: core never reads the clock). */
  entropy?: number;
}

export function galaxyOf(state: GameState): Galaxy {
  return getGalaxy(state.seed, state.galaxySize);
}

export function stationOf(state: GameState, id: string): StationStatic {
  return galaxyOf(state).stationsById[id];
}

export function newUid(state: GameState, prefix = 'u'): string {
  return `${prefix}${++state.uidCounter}`;
}

export function msg(
  state: GameState,
  key: string,
  params?: Message['params'],
  tone: Message['tone'] = 'info',
): void {
  state.messages.push({ day: state.day, key, params, tone });
  if (state.messages.length > 120) state.messages.splice(0, state.messages.length - 120);
}

export interface Analysis {
  stats: ShipStats;
  dims: GridDims;
  overload: number;
}

export function analyze(state: GameState): Analysis {
  const mass = cargoMass(state.cargo);
  const s0 = computeShipStats(state.ship, mass);
  const dims = gridDims(s0);
  const overload = overloadCells(dims, state.cargo);
  const stats = overload > 0 ? computeShipStats(state.ship, mass, overload) : s0;
  // v2: supplies follow the real crew, and a navigator trims fuel use
  if (state.crew?.length) stats.suppliesPerDay = crewSupplyPerDay(state) * (1 + 0.12 * overload);
  if (state.crew && crewHasOfficer(state, 'navigator') && isFinite(stats.fuelPerLy)) {
    stats.fuelPerLy *= 0.9;
    stats.rangeFull = stats.fuelCap / stats.fuelPerLy;
    stats.range = state.ship.fuel / stats.fuelPerLy;
  }
  return { stats, dims, overload };
}

export function syncCounters(state: GameState): void {
  syncCargoUid(state.cargo);
}

/** Systems the player knows about: visited systems, their neighbours and everything within sensor range. */
export function updateSeen(state: GameState, stats?: ShipStats): void {
  const g = galaxyOf(state);
  const st = stats ?? analyze(state).stats;
  const seen = new Set(state.seen);
  for (const id of state.visited) {
    seen.add(id);
    for (const n of g.systems[id].neighbors) seen.add(n);
    if (st.sensorRange > 0) {
      const a = g.systems[id];
      for (const o of g.systems) if (Math.hypot(o.x - a.x, o.y - a.y) <= st.sensorRange) seen.add(o.id);
    }
  }
  state.seen = [...seen].sort((a, b) => a - b);
}

/** Called when the ship arrives in a system. */
export function arrive(state: GameState, systemId: number): void {
  const g = galaxyOf(state);
  if (!state.visited.includes(systemId)) state.visited.push(systemId);
  const sys = g.systems[systemId];
  const det = new Set(state.detected[systemId] ?? []);
  for (const b of sys.bodies)
    if (b.scanDifficulty === 0 || (b.parent < 0 && b.kind !== 'belt' && b.scanDifficulty <= 0)) det.add(b.id);
  // stations are always known on arrival (docking beacons) together with their host bodies
  for (const st of sys.stations) det.add(sys.bodies[st.bodyIndex].id);
  state.detected[systemId] = [...det];
  state.location = { systemId, stationId: null, body: -1 };
  updateSeen(state);
}

export function learnStation(state: GameState, st: StationStatic): void {
  const dyn = state.stations[st.id];
  const prices = (state.prices[st.id] ??= {});
  for (const gid of st.goods) {
    prices[gid] = snapshotPrice(
      st,
      dyn.stock[GOODS.findIndex((x) => x.id === gid)],
      gid,
      state.difficulty,
      state.day,
    );
  }
}

export function premiumPerDay(state: GameState): number {
  return Math.round(insuredValue(state.ship, state.insurance.full) * T.insuranceRate);
}

export function shieldMax(state: GameState): number {
  return analyze(state).stats.shieldCap;
}

/** Apply hull damage. Shields absorb first. Returns true when the ship was destroyed. */
export function damageHull(state: GameState, amount: number, bypassShield = false): boolean {
  if (amount <= 0) return false;
  let dmg = amount;
  if (!bypassShield && state.ship.shield > 0) {
    const absorbed = Math.min(state.ship.shield, dmg);
    state.ship.shield -= absorbed;
    dmg -= absorbed;
  }
  state.ship.hp = Math.max(0, state.ship.hp - dmg);
  if (state.ship.hp <= 0) {
    destroyShip(state);
    return true;
  }
  return false;
}

export function destroyShip(state: GameState): void {
  const g = galaxyOf(state);
  state.stats.deaths++;
  state.pendingEvent = null;
  state.combat = null;
  state.encounter = null;
  // contracts depending on cargo are void (no penalty: the ship was lost)
  for (const c of state.contracts) {
    if (c.state !== 'active') continue;
    c.state = 'failed';
    state.stats.contractsFailed++;
    state.credits = Math.max(0, state.credits - c.deposit - c.penalty);
    if (c.chainId) delete state.flags[`chain:${c.chainId}`];
  }
  state.contracts = [];
  state.cargo = [];
  // the crew goes through it too: shaken and bruised (the insured keep their people, otherwise a new crew signs on)
  for (const m of state.crew) {
    m.morale = Math.max(0, m.morale - 15);
    m.hp = Math.max(1, Math.round(m.hp * 0.6));
  }
  if (!state.crew.length)
    state.crew = defaultCrew(state.seed, state.ship.hullId, state.day, () => newUid(state, 'w'));
  if (state.difficulty.permadeath) {
    state.dead = true;
    msg(state, 'msg.permadeath', undefined, 'bad');
    return;
  }
  const hullDef = HULLS_BY_ID[state.ship.hullId];
  if (state.insurance.active) {
    const deductible = Math.round(hullDef.price * 0.25);
    state.credits = Math.max(0, state.credits - deductible);
    const full = state.insurance.full;
    state.ship.slots = state.ship.slots.map((m) => {
      if (!m) return null;
      return full || MODULES_BY_ID[m.defId].core
        ? { ...m, condition: Math.max(25, m.condition * 0.8) }
        : null;
    });
    state.ship.hp = hullDef.hp;
    const st = computeShipStats(state.ship);
    state.ship.fuel = st.fuelCap * 0.4;
    state.ship.supplies = st.suppliesCap * 0.5;
    state.ship.shield = 0;
    const home = g.stationsById[state.home] ?? firstStation(g);
    state.location = { systemId: home.systemId, stationId: home.id, body: home.bodyIndex };
    state.day += 3;
    if (!state.visited.includes(home.systemId)) state.visited.push(home.systemId);
    msg(state, 'msg.insuredRespawn', { station: home.name, fee: deductible }, 'warn');
  } else {
    state.credits = Math.floor(state.credits * 0.5);
    state.ship = buildStarterShip(T.startHull, state.ship.name, () => newUid(state, 'm'));
    state.crew = defaultCrew(state.seed, T.startHull, state.day, () => newUid(state, 'w'));
    state.wagesDue = 0;
    state.inventory = [];
    const home = nearestStation(state, g) ?? firstStation(g);
    state.location = { systemId: home.systemId, stationId: home.id, body: home.bodyIndex };
    state.day += 5;
    msg(state, 'msg.uninsuredRespawn', { station: home.name }, 'bad');
  }
  updateSeen(state);
}

function firstStation(g: Galaxy): StationStatic {
  return g.systems.find((s) => s.stations.length)!.stations[0];
}

function nearestStation(state: GameState, g: Galaxy): StationStatic | null {
  const a = g.systems[state.location.systemId];
  let best: StationStatic | null = null;
  let bd = Infinity;
  for (const s of g.systems)
    for (const st of s.stations) {
      const d = Math.hypot(s.x - a.x, s.y - a.y);
      if (d < bd && st.type !== 'pirate') {
        bd = d;
        best = st;
      }
    }
  return best;
}

/** Run `fn` with the persistent simulation RNG and write its state back. */
export function withRng<T>(state: GameState, fn: (r: Rng) => T): T {
  const r = Rng.restore(state.rng);
  const out = fn(r);
  state.rng = r.getState();
  return out;
}
