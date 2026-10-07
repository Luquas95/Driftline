/** Read-only planning helpers for the player: route planner and trade recommendations (use only known information). */
import { feesFor, isBlackMarketGood, quoteBuy, quoteSell } from './economy';
import { dist, shortestPath } from './galaxy';
import { stationsNear } from './contracts';
import { jumpDays, jumpFuelCost } from './ship';
import { analyze, galaxyOf } from './state';
import type { GameState, StationStatic } from './types';
import { GOOD_INDEX } from '../content/goods';

export interface RouteStep {
  from: number;
  to: number;
  ly: number;
  fuel: number;
  days: number;
  danger: number;
  hasStation: boolean;
}

export interface RoutePlan {
  path: number[];
  steps: RouteStep[];
  ly: number;
  fuel: number;
  days: number;
  /** 0..1 average danger of the systems along the route. */
  risk: number;
  /** Systems along the way with a station where the player can refuel. */
  refuelAt: number[];
  /** Enough fuel for the whole route right now. */
  reachable: boolean;
  /** Possible with refuelling stops along the way. */
  feasibleWithStops: boolean;
}

export function planRoute(state: GameState, to: number): RoutePlan | null {
  const g = galaxyOf(state);
  const from = state.location.systemId;
  const seen = new Set(state.seen);
  const path = shortestPath(g, from, to, (id) => seen.has(id));
  if (!path) return null;
  const { stats } = analyze(state);
  const steps: RouteStep[] = [];
  for (let i = 1; i < path.length; i++) {
    const a = g.systems[path[i - 1]];
    const b = g.systems[path[i]];
    const ly = dist(a, b);
    steps.push({
      from: a.id,
      to: b.id,
      ly,
      fuel: jumpFuelCost(stats, ly),
      days: jumpDays(stats, ly),
      danger: b.danger,
      hasStation: b.stations.length > 0,
    });
  }
  const fuel = steps.reduce((s, x) => s + x.fuel, 0);
  const refuelAt = steps.filter((s) => s.hasStation && s.to !== to).map((s) => s.to);
  // can we do every stretch between refuel points on a full tank?
  let feasible = true;
  let tank = state.ship.fuel;
  let first = true;
  for (const st of steps) {
    if (st.fuel > tank + 1e-6) {
      feasible = false;
      break;
    }
    tank -= st.fuel;
    if (st.hasStation) {
      tank = stats.fuelCap;
      first = false;
    }
  }
  void first;
  return {
    path,
    steps,
    ly: steps.reduce((s, x) => s + x.ly, 0),
    fuel,
    days: steps.reduce((s, x) => s + x.days, 0),
    risk: steps.length ? steps.reduce((s, x) => s + x.danger, 0) / steps.length : 0,
    refuelAt,
    reachable: fuel <= state.ship.fuel + 1e-6,
    feasibleWithStops: feasible,
  };
}

export interface TradeTip {
  from: StationStatic;
  dest: StationStatic;
  goodId: string;
  qty: number;
  cost: number;
  revenue: number;
  profit: number;
  days: number;
  fuel: number;
  jumps: number;
  /** Age in days of the destination price data. */
  age: number;
  perDay: number;
}

/**
 * Best known buy -> sell trades starting from the station the player is at (or the nearest one in the system).
 * Uses the last known prices of destinations, so recommendations can be stale: that is shown via `age`.
 */
export function recommendTrades(state: GameState, limit = 5, maxJumps = 5): TradeTip[] {
  const g = galaxyOf(state);
  const originId = state.location.stationId ?? g.systems[state.location.systemId].stations[0]?.id;
  if (!originId) return [];
  const origin = g.stationsById[originId];
  const { stats, dims } = analyze(state);
  const cellsFree = dims.cells - state.cargo.reduce((s, c) => s + c.w * c.h, 0);
  const tips: TradeTip[] = [];
  const originPrices = state.prices[origin.id];
  for (const { station: d, jumps } of stationsNear(g, origin.systemId, maxJumps)) {
    if (d.id === origin.id || d.type === 'pirate') continue;
    const known = state.prices[d.id];
    if (!known) continue;
    const path = shortestPath(g, origin.systemId, d.systemId);
    if (!path) continue;
    let ly = 0;
    for (let i = 1; i < path.length; i++) ly += dist(g.systems[path[i - 1]], g.systems[path[i]]);
    const days = jumpDays(stats, ly) + 0.6;
    const fuelCost = jumpFuelCost(stats, ly) * 4.4;
    for (const goodId of origin.goods) {
      if (isBlackMarketGood(goodId) || !d.goods.includes(goodId)) continue;
      const dk = known[goodId];
      const ok = originPrices?.[goodId];
      if (!dk || !ok) continue;
      const stock =
        state.location.stationId === origin.id
          ? state.stations[origin.id].stock[GOOD_INDEX[goodId]]
          : ok.stock;
      if (stock < 2) continue;
      const feesO = feesFor(origin, state.difficulty, false);
      const feesD = feesFor(d, state.difficulty, false);
      const unitsPerCell = 10;
      const qMax = Math.min(
        Math.floor(stock),
        Math.max(1, Math.floor(cellsFree * unitsPerCell)),
        400,
        Math.floor(state.credits / Math.max(1, ok.buy)),
      );
      if (qMax < 1) continue;
      let best: TradeTip | null = null;
      for (const f of [0.25, 0.5, 0.75, 1]) {
        const q = Math.max(1, Math.floor(qMax * f));
        const cost = quoteBuy(origin, stock, goodId, q, feesO).total;
        const revenue = quoteSell(d, dk.stock, goodId, q, feesD).total;
        const profit = revenue - cost - fuelCost;
        const perDay = profit / days;
        if (profit > 50 && (!best || perDay > best.perDay))
          best = {
            from: origin,
            dest: d,
            goodId,
            qty: q,
            cost,
            revenue,
            profit,
            days,
            fuel: jumpFuelCost(stats, ly),
            jumps,
            age: state.day - dk.day,
            perDay,
          };
      }
      if (best) tips.push(best);
    }
  }
  tips.sort((a, b) => b.perDay - a.perDay);
  const out: TradeTip[] = [];
  const seenGood = new Set<string>();
  for (const t of tips) {
    const key = `${t.dest.id}:${t.goodId}`;
    if (seenGood.has(key)) continue;
    seenGood.add(key);
    out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

/** Best known sell price for a good among known stations, with distance from the current system. */
export function bestKnownPrice(
  state: GameState,
  goodId: string,
  side: 'sell' | 'buy' = 'sell',
): { stationId: string; price: number; age: number; jumps: number } | null {
  const g = galaxyOf(state);
  let best: { stationId: string; price: number; age: number; jumps: number } | null = null;
  const near = new Map<string, number>();
  for (const n of stationsNear(g, state.location.systemId, 6)) near.set(n.station.id, n.jumps);
  for (const [sid, prices] of Object.entries(state.prices)) {
    if (sid === state.location.stationId) continue;
    const p = prices[goodId];
    const jumps = near.get(sid);
    if (!p || jumps === undefined) continue;
    const price = side === 'sell' ? p.sell : p.buy;
    if (!best || (side === 'sell' ? price > best.price : price < best.price))
      best = { stationId: sid, price, age: state.day - p.day, jumps };
  }
  return best;
}
