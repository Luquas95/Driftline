import { GOODS, GOODS_BY_ID, GOOD_INDEX } from '../content/goods';
import { MARKET_EVENTS } from '../content/marketEvents';
import { STATION_TYPES_BY_ID } from '../content/stations';
import { Rng } from './rng';
import { T } from './tuning';
import type { Difficulty, Galaxy, GameState, KnownPrice, MarketEvent, StationDyn, StationStatic } from './types';

export function goodCap(st: StationStatic, goodId: string): number {
  const g = GOODS_BY_ID[goodId];
  return (T.capBase * T.capSize[st.size]) / Math.sqrt(g.basePrice);
}

function targetFrac(role: number): number {
  if (role > 0) return 0.5 + 0.45 * role;
  if (role < 0) return 0.5 - 0.4 * -role;
  return 0.5;
}

export function eventMod(events: MarketEvent[], day: number, sector: number, goodId: string): number {
  let m = 1;
  const good = GOODS_BY_ID[goodId];
  for (const e of events) {
    if (e.sector !== sector || day < e.start || day >= e.end) continue;
    const v = e.mods[goodId] ?? e.mods[good.category];
    if (v !== undefined) m *= v;
  }
  return m;
}

export function targetStock(st: StationStatic, goodId: string, mod = 1): number {
  const role = st.role[goodId] ?? 0;
  return goodCap(st, goodId) * targetFrac(role) * mod;
}

/** Mid price (no spread, no tariff) at a given stock level. */
export function midPrice(st: StationStatic, goodId: string, stock: number): number {
  const g = GOODS_BY_ID[goodId];
  const ref = goodCap(st, goodId) * 0.5;
  const ratio = ref / Math.max(stock, ref * 0.04);
  const mult = Math.min(T.priceMax, Math.max(T.priceMin, Math.pow(ratio, T.priceElasticity)));
  return g.basePrice * mult;
}

export interface Fees {
  spread: number;
  tariff: number;
}

export function feesFor(st: StationStatic, difficulty: Difficulty, blackMarketDeal: boolean): Fees {
  const k = difficulty.prices === 'easy' ? 0.6 : difficulty.prices === 'hard' ? 1.5 : 1;
  if (blackMarketDeal) return { spread: 0.09 * k, tariff: 0 };
  void st;
  return { spread: T.spread * k, tariff: T.tariff * k };
}

export function isBlackMarketGood(goodId: string): boolean {
  return GOODS_BY_ID[goodId].tags.includes('illegal');
}

export interface Quote {
  /** Total credits (cost for buy, revenue for sell). */
  total: number;
  avg: number;
  /** Price per unit of the first / last unit. */
  first: number;
  last: number;
  tariffPaid: number;
  /** Mid price afterwards (for impact preview). */
  endMid: number;
  stockAfter: number;
}

/** Quote for the player buying `qty` from the station (station stock decreases). */
export function quoteBuy(st: StationStatic, stock: number, goodId: string, qty: number, fees: Fees): Quote {
  const steps = Math.min(qty, 24);
  const block = qty / steps;
  let total = 0;
  let first = 0;
  let last = 0;
  let s = stock;
  let tariff = 0;
  for (let i = 0; i < steps; i++) {
    const mid = midPrice(st, goodId, s - block / 2);
    const unit = mid * (1 + fees.spread + fees.tariff);
    if (i === 0) first = unit;
    last = unit;
    total += unit * block;
    tariff += mid * fees.tariff * block;
    s -= block;
  }
  return { total, avg: qty > 0 ? total / qty : 0, first, last, tariffPaid: tariff, endMid: midPrice(st, goodId, s), stockAfter: s };
}

/** Quote for the player selling `qty` to the station (station stock increases). `fresh` scales the payout. */
export function quoteSell(st: StationStatic, stock: number, goodId: string, qty: number, fees: Fees, fresh = 1): Quote {
  const steps = Math.max(1, Math.min(qty, 24));
  const block = qty / steps;
  let total = 0;
  let first = 0;
  let last = 0;
  let s = stock;
  let tariff = 0;
  for (let i = 0; i < steps; i++) {
    const mid = midPrice(st, goodId, s + block / 2);
    const unit = mid * (1 - fees.spread - fees.tariff) * fresh;
    if (i === 0) first = unit;
    last = unit;
    total += unit * block;
    tariff += mid * fees.tariff * block * fresh;
    s += block;
  }
  return { total, avg: qty > 0 ? total / qty : 0, first, last, tariffPaid: tariff, endMid: midPrice(st, goodId, s), stockAfter: s };
}

export function initialStock(st: StationStatic, rng: Rng): number[] {
  return GOODS.map((g) => {
    if (!st.goods.includes(g.id)) return 0;
    const t = targetStock(st, g.id);
    return Math.max(0, t * rng.range(0.8, 1.2));
  });
}

export function createStationDyn(st: StationStatic, rng: Rng): StationDyn {
  return { stock: initialStock(st, rng), board: [], boardEpoch: -1, rep: 0, shop: { hulls: [], modules: [], epoch: -1 } };
}

/** Advance the economy by one day. Deterministic per (seed, day) regardless of player actions. */
export function tickEconomy(galaxy: Galaxy, state: GameState, day: number): void {
  const rng = Rng.fromSeed(`${state.seed}:econ:${day}`);
  for (const sys of galaxy.systems) {
    for (const st of sys.stations) {
      const dyn = state.stations[st.id];
      if (!dyn) continue;
      for (const gid of st.goods) {
        const gi = GOOD_INDEX[gid];
        const good = GOODS_BY_ID[gid];
        let target = targetStock(st, gid, eventMod(state.events, day, sys.sector, gid));
        // production chains: a producer short on inputs makes less
        if (good.inputs && (st.role[gid] ?? 0) > 0) {
          let eff = 1;
          for (const input of Object.keys(good.inputs)) {
            if (!st.goods.includes(input)) continue;
            const inStock = dyn.stock[GOOD_INDEX[input]];
            const inRef = goodCap(st, input) * 0.3;
            eff = Math.min(eff, Math.min(1, inStock / inRef));
          }
          target *= 0.6 + 0.4 * eff;
        }
        const noise = 1 + rng.range(-0.025, 0.025);
        dyn.stock[gi] = Math.max(0, (dyn.stock[gi] + (target - dyn.stock[gi]) * T.revertRate) * noise);
      }
    }
  }
}

export function maybeSpawnEvent(galaxy: Galaxy, state: GameState, day: number): MarketEvent | null {
  const rng = Rng.fromSeed(`${state.seed}:mev:${day}`);
  state.events = state.events.filter((e) => e.end > day - 5);
  const active = state.events.filter((e) => e.end > day).length;
  if (active >= 7 || !rng.chance(0.13)) return null;
  const def = rng.weighted(MARKET_EVENTS, (e) => e.weight);
  const sector = rng.int(0, galaxy.sectors.length - 1);
  if (state.events.some((e) => e.sector === sector && e.kind === def.kind && e.end > day)) return null;
  const ev: MarketEvent = {
    id: `me${day}-${sector}`,
    kind: def.kind,
    sector,
    start: day,
    end: day + rng.int(def.minDays, def.maxDays),
    mods: def.mods,
  };
  state.events.push(ev);
  return ev;
}

export function snapshotPrice(st: StationStatic, stock: number, goodId: string, difficulty: Difficulty, day: number): KnownPrice {
  const bm = isBlackMarketGood(goodId);
  const fees = feesFor(st, difficulty, bm);
  const mid = midPrice(st, goodId, stock);
  return { buy: mid * (1 + fees.spread + fees.tariff), sell: mid * (1 - fees.spread - fees.tariff), stock, day };
}

export function stationHasShipyard(st: StationStatic): boolean {
  return STATION_TYPES_BY_ID[st.type].shipyard > 0;
}

/** Service price multiplier (fuel, repair): cheaper at hubs, dearer at the rim. */
export function serviceMult(st: StationStatic, region: string, difficulty: Difficulty): number {
  let m = 1;
  if (st.type === 'trade_hub') m *= 0.92;
  if (region === 'rim') m *= 1.3;
  else if (region === 'outer') m *= 1.1;
  if (st.type === 'pirate') m *= 1.25;
  return m * (difficulty.prices === 'easy' ? 0.85 : difficulty.prices === 'hard' ? 1.2 : 1);
}
