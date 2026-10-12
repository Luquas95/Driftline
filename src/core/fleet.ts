/**
 * The fleet: ships parked in the base hangar. They can switch places with the active ship, guard the base,
 * escort the player, or run trade routes on their own (the profit is simulated from the real market).
 */
import { GOODS_BY_ID } from '../content/goods';
import { routeThreat } from './combat/encounter';
import { feesFor, quoteBuy, quoteSell } from './economy';
import { shortestPath, dist } from './galaxy';
import { Rng } from './rng';
import { computeShipStats, jumpDays } from './ship';
import { fail, galaxyOf, msg, ok, type Result } from './state';
import { tariffMult } from './territory';
import { techBonus } from './research';
import { T } from './tuning';
import { GOOD_INDEX } from '../content/goods';
import type { GameState } from './types';
import type { FleetShip } from './worldTypes';

/** Broker cut and friction: what an automatic trader keeps of the theoretical profit. */
export const FLEET_EFFICIENCY = 0.62;

export interface TripPlan {
  ok: boolean;
  error?: string;
  goodId: string;
  units: number;
  cost: number;
  revenue: number;
  /** Net result after fuel, wages and risk (the expected value). */
  net: number;
  days: number;
  fuel: number;
  wages: number;
  risk: number;
  protection: number;
}

const NO_PLAN: TripPlan = {
  ok: false,
  goodId: '',
  units: 0,
  cost: 0,
  revenue: 0,
  net: 0,
  days: 0,
  fuel: 0,
  wages: 0,
  risk: 0,
  protection: 0,
};

/** Defence quality of a ship, 0..0.85: shields, guns and crew keep raiders away. */
export function protectionOf(fs: FleetShip): number {
  const st = computeShipStats(fs.ship);
  return Math.min(0.85, (st.shieldCap + st.weaponCount * 30 + fs.crew.length * 8) / 220);
}

function wagesPerDay(fs: FleetShip): number {
  return fs.crew.reduce((s, c) => s + c.wage, 0);
}

/** Expected result of one round trip along a route (what the planner shows and what the simulation books). */
export function planTrip(
  state: GameState,
  fs: FleetShip,
  route: { from: string; to: string; goodId: string | null },
  budget: number,
): TripPlan {
  const g = galaxyOf(state);
  const a = g.stationsById[route.from];
  const b = g.stationsById[route.to];
  if (!a || !b || a.id === b.id) return { ...NO_PLAN, error: 'err.badRoute' };
  const st = computeShipStats(fs.ship);
  if (st.coreMissing.length || st.jumpSpeed <= 0 || st.cargoCells <= 0)
    return { ...NO_PLAN, error: 'err.shipUnfit' };
  const path = shortestPath(
    g,
    a.systemId,
    b.systemId,
    (id) => (state.threat.grip[id] ?? 0) < T.threat.consumeAt,
  );
  if (!path) return { ...NO_PLAN, error: 'err.badRoute' };
  let ly = 0;
  let days = 0;
  for (let i = 1; i < path.length; i++) {
    const d = dist(g.systems[path[i - 1]], g.systems[path[i]]);
    if (d > st.rangeFull) return { ...NO_PLAN, error: 'err.outOfRange' };
    ly += d;
    days += jumpDays(st, d);
  }
  days = Math.max(1, days * 2 + 0.6);
  const fuel = ly * 2 * st.fuelPerLy * T.fuelPrice;
  const wages = wagesPerDay(fs) * days;
  const fa = feesFor(a, state.difficulty, false, tariffMult(state, a));
  const fb = feesFor(b, state.difficulty, false, tariffMult(state, b));
  const candidates = route.goodId ? [route.goodId] : a.goods.filter((x) => b.goods.includes(x));
  let best: TripPlan | null = null;
  const risk = Math.min(0.95, routeThreat(state, path) * 2);
  const prot = protectionOf(fs);
  for (const gid of candidates) {
    const good = GOODS_BY_ID[gid];
    if (!good || good.category === 'special' || good.tags.includes('illegal')) continue;
    if (!a.goods.includes(gid) || !b.goods.includes(gid)) continue;
    const stockA = state.stations[a.id].stock[GOOD_INDEX[gid]];
    const stockB = state.stations[b.id].stock[GOOD_INDEX[gid]];
    const maxUnits = Math.min(Math.floor(st.cargoCells * good.unitsPerCell), Math.floor(stockA * 0.4));
    if (maxUnits < 3) continue;
    // coarse search for the load that earns the most under slippage
    for (const frac of [1, 0.75, 0.55, 0.4, 0.28, 0.18, 0.1]) {
      const units = Math.max(3, Math.floor(maxUnits * frac));
      const qb = quoteBuy(a, stockA, gid, units, fa);
      if (qb.total > budget) continue;
      const qs = quoteSell(b, stockB, gid, units, fb);
      const gross = qs.total - qb.total;
      const loss = risk * (1 - prot) * 0.6;
      const net =
        gross * FLEET_EFFICIENCY * (1 + techBonus(state, 'fleet')) * (1 - loss) -
        qb.total * loss -
        fuel -
        wages;
      const plan: TripPlan = {
        ok: true,
        goodId: gid,
        units,
        cost: qb.total,
        revenue: qs.total,
        net,
        days,
        fuel,
        wages,
        risk,
        protection: prot,
      };
      if (!best || plan.net > best.net) best = plan;
    }
  }
  if (!best) return { ...NO_PLAN, days, error: 'err.noGoodsRoute' };
  return best;
}

/* ------------------------------ commands ------------------------------ */

export function findFleetShip(state: GameState, id: string): FleetShip | undefined {
  return state.base?.hangar.find((f) => f.id === id);
}

export function setFleetOrder(
  state: GameState,
  id: string,
  order: FleetShip['order'],
  route?: { from: string; to: string; goodId: string | null },
): Result {
  const fs = findFleetShip(state, id);
  if (!fs) return fail('err.noShipInFleet');
  if (order === 'trade') {
    if (!route) return fail('err.badRoute');
    const plan = planTrip(state, fs, route, 1e9);
    if (!plan.ok && plan.error !== 'err.noGoodsRoute') return fail(plan.error ?? 'err.badRoute');
    fs.route = route;
  } else fs.route = null;
  if (fs.trip && order !== 'trade') {
    // the ship finishes its trip first
  }
  fs.order = order;
  return ok();
}

/** Swap the active ship with a hangar ship (at the base, with an empty hold). */
export function switchShip(state: GameState, id: string): Result {
  const base = state.base;
  if (!base) return fail('err.noBase');
  if (state.location.systemId !== base.systemId) return fail('err.notAtBase');
  const fs = findFleetShip(state, id);
  if (!fs) return fail('err.noShipInFleet');
  if (fs.trip) return fail('err.shipOnTrip');
  if (state.encounter || state.combat || state.pendingEvent) return fail('err.eventPending');
  if (state.cargo.length) return fail('err.cargoAboard');
  if (state.contracts.some((c) => c.state === 'active' && c.kind === 'passenger'))
    return fail('err.passengersAboard');
  const ship = state.ship;
  const crew = state.crew;
  state.ship = fs.ship;
  state.crew = fs.crew;
  fs.ship = ship;
  fs.crew = crew;
  fs.order = 'idle';
  fs.route = null;
  state.location.stationId = null;
  msg(state, 'msg.shipSwitched', { name: state.ship.name }, 'info');
  return ok();
}

export function renameFleetShip(state: GameState, id: string, name: string): Result {
  const fs = findFleetShip(state, id);
  if (!fs) return fail('err.noShipInFleet');
  fs.name = name.trim().slice(0, 24) || fs.name;
  fs.ship.name = fs.name;
  return ok();
}

/** Number of escorts: they lower the chance of being attacked on a jump. */
export function escortCount(state: GameState): number {
  return state.base ? Math.min(3, state.base.hangar.filter((f) => f.order === 'escort').length) : 0;
}

/* ------------------------------ daily simulation ------------------------------ */

export function fleetDaily(state: GameState, day: number): void {
  const base = state.base;
  if (!base || !base.hangar.length) return;
  for (const fs of base.hangar) {
    // standing wages of ships on guard or escort duty
    if (fs.order === 'guard' || fs.order === 'escort') {
      const w = wagesPerDay(fs);
      if (base.treasury >= w) base.treasury -= w;
      else if (state.credits >= w) state.credits -= w;
    }
    if (fs.trip && day >= fs.trip.end) {
      const gain = fs.trip.profit - fs.trip.cost;
      base.treasury += fs.trip.profit;
      fs.earned += gain;
      base.stats.fleetIncome += gain;
      fs.trips++;
      fs.trip = null;
    }
    if (fs.order !== 'trade' || fs.trip || !fs.route || day < fs.idleUntil) continue;
    const plan = planTrip(state, fs, fs.route, Math.max(0, base.treasury));
    if (!plan.ok || plan.net <= 0) continue;
    const g = galaxyOf(state);
    const a = g.stationsById[fs.route.from];
    const b = g.stationsById[fs.route.to];
    base.treasury -= plan.cost;
    // the trade really moves the markets
    state.stations[a.id].stock[GOOD_INDEX[plan.goodId]] -= plan.units;
    state.stations[b.id].stock[GOOD_INDEX[plan.goodId]] += plan.units;
    const rng = Rng.fromSeed(`${state.seed}:trip:${fs.id}:${day}`);
    const hit = rng.chance(plan.risk * (1 - plan.protection));
    const loss = hit ? rng.range(0.3, 1) : 0;
    const gross = plan.revenue - plan.cost;
    const cash =
      (plan.cost + gross * FLEET_EFFICIENCY * (1 + techBonus(state, 'fleet'))) * (1 - loss) -
      plan.fuel -
      plan.wages;
    fs.trip = {
      start: day,
      end: day + Math.ceil(plan.days),
      profit: Math.round(cash),
      cost: Math.round(plan.cost),
      lost: hit,
    };
    if (hit && rng.chance(0.25)) {
      fs.idleUntil = day + Math.ceil(plan.days) + 8;
      msg(state, 'msg.fleetRaided', { name: fs.name }, 'warn');
    }
  }
}
