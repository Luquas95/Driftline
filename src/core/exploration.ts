import { GOODS_BY_ID } from '../content/goods';
import { addGoods } from './cargo';
import { rollEvent } from './events';
import { sublightDays, wearKind, canJump as _unused } from './ship';
import { analyze, damageHull, fail, galaxyOf, msg, newUid, ok, withRng, type Result } from './state';
import { passTime } from './time';
import { T, riskFactor } from './tuning';
import type { BodyDyn, BodyStatic, GameState, SystemStatic } from './types';
import { unitsOf } from './cargo';

void _unused;

export const CHARTED_FACTOR: Record<string, number> = { core: 0.3, inner: 0.5, outer: 1, rim: 1.8 };

export function bodyDyn(state: GameState, id: string): BodyDyn {
  return (state.bodies[id] ??= {
    surface: false,
    probed: false,
    mined: {},
    minedDay: {},
    revealed: [],
    anomaliesDone: [],
  });
}

export function bodyAu(sys: SystemStatic, idx: number): number {
  if (idx < 0) return 0.5;
  const b = sys.bodies[idx];
  return b.parent >= 0 ? sys.bodies[b.parent].orbit + 0.03 : b.orbit;
}

/** Fly to a body (sublight). Takes time based on engine thrust and ship mass. */
export function travelToBody(state: GameState, bodyIdx: number): Result<{ days: number }> {
  const g = galaxyOf(state);
  const sys = g.systems[state.location.systemId];
  const { stats } = analyze(state);
  if (state.location.body === bodyIdx) return ok({ days: 0 });
  if (stats.speedAuDay <= 0 || stats.powerFree < -0.001) return fail('err.noEngine');
  const au = Math.abs(bodyAu(sys, bodyIdx) - bodyAu(sys, state.location.body));
  const days = sublightDays(stats, au);
  state.location.stationId = null;
  state.location.body = bodyIdx;
  passTime(state, days);
  return ok({ days });
}

function thresholdFor(difficulty: number): number {
  return 1 + 0.5 * difficulty;
}

export function systemSurveyValue(sys: SystemStatic): number {
  return Math.round(
    (90 + sys.bodies.length * 55 + sys.richness * 200) *
      (CHARTED_FACTOR[sys.region] ?? 1) *
      T.firstDiscoveryBonus *
      0.85,
  );
}

/** System scan: reveals bodies by sensor power and satisfies survey / rescue contracts. */
export function scanSystem(state: GameState): Result<{ found: number; total: number }> {
  const g = galaxyOf(state);
  const sys = g.systems[state.location.systemId];
  const { stats } = analyze(state);
  if (stats.scanPower <= 0) return fail('err.noSensors');
  const det = new Set(state.detected[sys.id] ?? []);
  let found = 0;
  for (const b of sys.bodies) {
    if (!det.has(b.id) && stats.scanPower >= thresholdFor(b.scanDifficulty)) {
      det.add(b.id);
      found++;
    }
  }
  state.detected[sys.id] = [...det];
  passTime(state, 0.3);
  const key = `sys:${sys.id}`;
  if (!state.discoveries.some((d) => d.id === key)) {
    state.discoveries.push({
      id: key,
      name: sys.name,
      day: state.day,
      value: systemSurveyValue(sys),
      sold: false,
    });
    state.stats.discoveries++;
    msg(state, 'msg.discoveredSystem', { name: sys.name }, 'good');
  }
  for (const c of state.contracts) {
    if (c.state !== 'active' || c.targetSystem !== sys.id) continue;
    if (c.kind === 'survey' && !c.targetBody) c.progress = Math.max(c.progress ?? 0, 1);
    if (c.kind === 'rescue' && (c.progress ?? 0) < 1 && stats.scanPower >= 1.5) {
      c.progress = 1;
      msg(state, 'msg.wreckFound', undefined, 'good');
    }
  }
  return ok({ found, total: sys.bodies.length });
}

/** Surface scan of one body (flies there first). Optionally with a probe for full accuracy. */
export function scanSurface(
  state: GameState,
  bodyIdx: number,
  useProbe = false,
): Result<{ deposits: number; anomalies: number }> {
  const g = galaxyOf(state);
  const sys = g.systems[state.location.systemId];
  const body = sys.bodies[bodyIdx];
  if (!body) return fail('err.noBody');
  if (!(state.detected[sys.id] ?? []).includes(body.id)) return fail('err.bodyUnknown');
  const { stats } = analyze(state);
  if (useProbe) {
    if (!stats.hasProbe) return fail('err.noProbeLauncher');
    if (state.ship.probes < 1) return fail('err.noProbes');
    if (stats.powerScan < -0.001) return fail('err.power');
  } else {
    if (stats.surfacePower <= 0) return fail('err.noSurfaceScanner');
    if (stats.powerScan < -0.001) return fail('err.power');
  }
  const t = travelToBody(state, bodyIdx);
  if (!t.ok) return t;
  const power = useProbe ? Math.max(stats.surfacePower, 3) + 1 : stats.surfacePower;
  const dyn = bodyDyn(state, body.id);
  let dep = 0;
  let ano = 0;
  const reveal = (id: string, hidden: number, isAnomaly: boolean) => {
    if (dyn.revealed.includes(id)) return;
    if (power >= hidden + 1 || useProbe) {
      dyn.revealed.push(id);
      if (isAnomaly) ano++;
      else dep++;
    }
  };
  for (const d of body.deposits) reveal(d.id, d.hidden, false);
  for (const a of body.anomalies) reveal(a.id, a.hidden, true);
  if (useProbe) {
    state.ship.probes -= 1;
    dyn.probed = true;
  }
  dyn.surface = true;
  passTime(state, 0.25);
  wearKind(state.ship, useProbe ? 'probe' : 'surface', 1.2);
  const key = `body:${body.id}`;
  if (!state.discoveries.some((d) => d.id === key)) {
    const val = Math.round(
      (T.survey.body * 0.5 + dep * 45 + ano * 220) * (CHARTED_FACTOR[sys.region] ?? 1) * 1.3,
    );
    state.discoveries.push({ id: key, name: body.name, day: state.day, value: val, sold: false });
    state.stats.discoveries++;
  }
  for (const c of state.contracts) {
    if (c.state !== 'active' || c.targetBody !== body.id) continue;
    if (c.kind === 'survey') c.progress = Math.max(c.progress ?? 0, 1);
    if (c.kind === 'rescue') {
      c.progress = Math.max(c.progress ?? 0, 1);
      msg(state, 'msg.wreckFound', undefined, 'good');
    }
  }
  return ok({ deposits: dep, anomalies: ano });
}

/** Rescue: pick up survivors at the wreck. */
export function salvage(state: GameState): Result {
  const g = galaxyOf(state);
  const sys = g.systems[state.location.systemId];
  const c = state.contracts.find(
    (x) =>
      x.state === 'active' && x.kind === 'rescue' && x.targetSystem === sys.id && (x.progress ?? 0) === 1,
  );
  if (!c) return fail('err.noWreck');
  const body = sys.bodies.find((b) => b.id === c.targetBody);
  if (body) {
    const t = travelToBody(state, body.index);
    if (!t.ok) return t;
  }
  const { stats, dims } = analyze(state);
  const quotas = { chilledCells: stats.chilledCells, secureCells: stats.secureCells };
  const r = addGoods(state.cargo, dims, quotas, 'survivors', 1, 0, state.day, c.id);
  if (r.added < 1) return fail('err.noCargoSpace');
  c.progress = 2;
  passTime(state, 0.5);
  msg(state, 'msg.survivorsAboard', undefined, 'good');
  return ok();
}

export function exploreAnomaly(state: GameState, bodyIdx: number, anomalyId: string): Result {
  const g = galaxyOf(state);
  const sys = g.systems[state.location.systemId];
  const body = sys.bodies[bodyIdx];
  const a = body?.anomalies.find((x) => x.id === anomalyId);
  const dyn = body ? bodyDyn(state, body.id) : null;
  if (!a || !dyn || !dyn.revealed.includes(a.id)) return fail('err.noAnomaly');
  if (dyn.anomaliesDone.includes(a.id)) return fail('err.anomalyDone');
  if (state.pendingEvent) return fail('err.eventPending');
  const t = travelToBody(state, bodyIdx);
  if (!t.ok) return t;
  dyn.anomaliesDone.push(a.id);
  rollEvent(state, 'anomaly', 1, { systemId: sys.id, bodyId: body.id, anomalyId: a.id }, a.eventId);
  return ok();
}

export const INTENSITY = [
  { mult: 1, fuel: 0.6, risk: 0.5 },
  { mult: 1.6, fuel: 1.4, risk: 1.4 },
  { mult: 2.4, fuel: 2.8, risk: 3.2 },
];

/** Goods the refinery converts: input -> [output, ratio]. */
export const REFINE: Record<string, [string, number]> = {
  iron_ore: ['metals', 0.5],
  rare_ore: ['rare_metals', 0.5],
  hydrocarbons: ['polymers', 0.5],
};

export type MineMethod = 'laser' | 'scoop' | 'drill';

export function mineMethodFor(body: BodyStatic): MineMethod {
  if (body.kind === 'belt') return 'laser';
  if (body.kind === 'gas') return 'scoop';
  return 'drill';
}

export function depositDecay(dyn: BodyDyn, depId: string, day: number): number {
  const n = Math.max(0, (dyn.mined[depId] ?? 0) - (day - (dyn.minedDay[depId] ?? day)) / 25);
  return Math.pow(0.7, n);
}

export interface MineOutcome {
  units: number;
  goodId: string;
  refined: boolean;
  lost: number;
  hullDamage: number;
  toolWear: number;
}

/** Mine a revealed deposit for one day at intensity 0..2. */
export function mine(
  state: GameState,
  bodyIdx: number,
  depositId: string,
  intensity: 0 | 1 | 2,
): Result<{ out: MineOutcome }> {
  const g = galaxyOf(state);
  const sys = g.systems[state.location.systemId];
  const body = sys.bodies[bodyIdx];
  const dep = body?.deposits.find((d) => d.id === depositId);
  if (!body || !dep) return fail('err.noDeposit');
  const dyn = bodyDyn(state, body.id);
  if (!dyn.revealed.includes(dep.id)) return fail('err.depositUnknown');
  const { stats, dims } = analyze(state);
  const method = mineMethodFor(body);
  const base =
    method === 'laser' ? stats.laserYield : method === 'scoop' ? stats.scoopYield : stats.probeValue * 5.5;
  if (base <= 0)
    return fail(method === 'laser' ? 'err.noLaser' : method === 'scoop' ? 'err.noScoop' : 'err.noDrill');
  if (method === 'drill' && state.ship.probes < 1) return fail('err.noProbes');
  if (stats.powerMine < -0.001 && method !== 'drill') return fail('err.power');
  if (method === 'drill' && stats.powerScan < -0.001) return fail('err.power');
  const lvl = INTENSITY[intensity];
  const fuelCost = lvl.fuel;
  if (state.ship.fuel < fuelCost) return fail('err.noFuel');
  const t = travelToBody(state, bodyIdx);
  if (!t.ok) return t;
  state.ship.fuel -= fuelCost;
  if (method === 'drill') state.ship.probes -= 1;
  const decay = depositDecay(dyn, dep.id, state.day);
  const units = Math.max(1, Math.round(base * lvl.mult * (0.4 + dep.richness) * decay));
  // risk
  const wearAvg =
    state.ship.slots.reduce((s, m) => s + (m ? 100 - m.condition : 0), 0) /
    Math.max(1, state.ship.slots.filter(Boolean).length) /
    100;
  const pRisk = Math.min(
    0.85,
    0.035 * lvl.risk * body.hazard * riskFactor(state.difficulty.risk) * (1 + wearAvg * 1.5),
  );
  let hullDamage = 0;
  let toolWear = 0;
  withRng(state, (rng) => {
    if (rng.chance(pRisk)) {
      hullDamage = Math.round(rng.range(4, 10) * lvl.risk * body.hazard);
      toolWear = Math.round(rng.range(8, 18) * (1 + intensity * 0.5));
    }
  });
  const wearKindName = method === 'laser' ? 'laser' : method === 'scoop' ? 'scoop' : 'probe';
  wearKind(state.ship, wearKindName, (method === 'laser' ? 2.2 : 1.4) * lvl.mult + toolWear);
  if (stats.refineRate > 0 && REFINE[dep.goodId] && stats.powerMine >= -0.001)
    wearKind(state.ship, 'refinery', 0.8);
  dyn.mined[dep.id] =
    Math.max(0, (dyn.mined[dep.id] ?? 0) - (state.day - (dyn.minedDay[dep.id] ?? state.day)) / 25) +
    lvl.mult * 0.55;
  dyn.minedDay[dep.id] = state.day;
  // refine?
  let goodId = dep.goodId;
  let outUnits: number;
  let refined = false;
  const rf = REFINE[dep.goodId];
  if (rf && stats.refineRate > 0 && stats.powerMine >= -0.001) {
    const refUnits = Math.min(units, Math.floor(stats.refineRate));
    if (refUnits >= 2) {
      const refinedUnits = Math.floor(refUnits * rf[1]);
      const rest = units - refUnits;
      // add refined product first, then the raw remainder
      const quotas = { chilledCells: stats.chilledCells, secureCells: stats.secureCells };
      const r1 = addGoods(state.cargo, dims, quotas, rf[0], refinedUnits, 0, state.day);
      const r2 =
        rest > 0 ? addGoods(state.cargo, dims, quotas, dep.goodId, rest, 0, state.day) : { added: 0 };
      goodId = rf[0];
      outUnits = r1.added + r2.added;
      refined = true;
      state.stats.unitsMined += outUnits;
      passTime(state, 1);
      if (hullDamage) damageHull(state, hullDamage);
      return ok({
        out: { units: outUnits, goodId, refined, lost: refinedUnits + rest - outUnits, hullDamage, toolWear },
      });
    }
  }
  const quotas = { chilledCells: stats.chilledCells, secureCells: stats.secureCells };
  const r = addGoods(state.cargo, dims, quotas, goodId, units, 0, state.day);
  state.stats.unitsMined += r.added;
  passTime(state, 1);
  if (hullDamage) damageHull(state, hullDamage);
  void GOODS_BY_ID;
  void newUid;
  void unitsOf;
  return ok({ out: { units: r.added, goodId, refined, lost: units - r.added, hullDamage, toolWear } });
}

export function sellDiscoveries(
  state: GameState,
  stationId: string,
): Result<{ total: number; count: number }> {
  const g = galaxyOf(state);
  const st = g.stationsById[stationId];
  if (!st) return fail('err.noStation');
  const items = state.discoveries.filter((d) => !d.sold);
  if (!items.length) return fail('err.nothingToSell');
  const total = items.reduce((s, d) => s + d.value, 0);
  for (const d of items) d.sold = true;
  state.credits += total;
  state.stations[st.id].rep += 1;
  msg(state, 'msg.soldData', { total }, 'good');
  return ok({ total, count: items.length });
}

export interface MineEstimate {
  method: MineMethod;
  units: number;
  fuel: number;
  /** Probability of damage per day (0..1). */
  risk: number;
  refined: boolean;
  /** Error key when mining is currently impossible. */
  blocked?: string;
}

/** Preview for the UI: what mining a deposit at an intensity would yield, cost and risk. Mirrors `mine`. */
export function estimateMine(
  state: GameState,
  bodyIdx: number,
  depositId: string,
  intensity: 0 | 1 | 2,
): MineEstimate | null {
  const g = galaxyOf(state);
  const body = g.systems[state.location.systemId].bodies[bodyIdx];
  const dep = body?.deposits.find((d) => d.id === depositId);
  if (!body || !dep) return null;
  const { stats } = analyze(state);
  const method = mineMethodFor(body);
  const dyn = bodyDyn(state, body.id);
  const base =
    method === 'laser' ? stats.laserYield : method === 'scoop' ? stats.scoopYield : stats.probeValue * 5.5;
  const lvl = INTENSITY[intensity];
  const units = Math.max(
    1,
    Math.round(base * lvl.mult * (0.4 + dep.richness) * depositDecay(dyn, dep.id, state.day)),
  );
  const wearAvg =
    state.ship.slots.reduce((s, m) => s + (m ? 100 - m.condition : 0), 0) /
    Math.max(1, state.ship.slots.filter(Boolean).length) /
    100;
  const risk = Math.min(
    0.85,
    0.035 * lvl.risk * body.hazard * riskFactor(state.difficulty.risk) * (1 + wearAvg * 1.5),
  );
  let blocked: string | undefined;
  if (base <= 0)
    blocked = method === 'laser' ? 'err.noLaser' : method === 'scoop' ? 'err.noScoop' : 'err.noDrill';
  else if (method === 'drill' && state.ship.probes < 1) blocked = 'err.noProbes';
  else if (method !== 'drill' && stats.powerMine < -0.001) blocked = 'err.power';
  else if (method === 'drill' && stats.powerScan < -0.001) blocked = 'err.power';
  else if (state.ship.fuel < lvl.fuel) blocked = 'err.noFuel';
  const refined = !!REFINE[dep.goodId] && stats.refineRate > 0 && stats.powerMine >= -0.001;
  return { method, units, fuel: lvl.fuel, risk, refined, blocked };
}
