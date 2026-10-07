/**
 * Public action API of the simulation. Every function mutates the given GameState and returns a Result.
 * UI, bots (balance simulator) and tests all drive the game through this file.
 */
import { GOODS_BY_ID, GOOD_INDEX, isIllegal } from '../content/goods';
import { MODULES_BY_ID, QUALITY } from '../content/modules';
import { STATION_TYPES_BY_ID } from '../content/stations';
import {
  addGoods,
  autoArrange,
  freshness,
  loadableUnits,
  moveItem,
  removeGoods,
  rotateItem,
  unitsOf,
} from './cargo';
import { completeContractsAt } from './contractOps';
import { refreshBoard } from './contracts';
import {
  feesFor,
  isBlackMarketGood,
  quoteBuy,
  quoteSell,
  serviceMult,
  snapshotPrice,
  type Quote,
} from './economy';
import { rollEvent } from './events';
import { dist } from './galaxy';
import { bodyAu, travelToBody } from './exploration';
import { canJump, jumpDays, jumpFuelCost, sublightDays, wearKind, wearModule } from './ship';
import { refreshShop } from './shop';
import {
  analyze,
  arrive,
  damageHull,
  fail,
  galaxyOf,
  learnStation,
  msg,
  ok,
  premiumPerDay,
  stationOf,
  updateSeen,
  withRng,
  type Result,
} from './state';
import { passTime } from './time';
import { T, riskFactor } from './tuning';
import type { Contract, GameState, StationStatic } from './types';

/* ------------------------------ docking ------------------------------ */

export interface DockReport {
  completed: { contract: Contract; payout: number }[];
  inspection?: { fine: number; confiscated: number } | null;
}

export function dockAt(state: GameState, stationId: string): Result<{ report: DockReport }> {
  const g = galaxyOf(state);
  const st = g.stationsById[stationId];
  if (!st || st.systemId !== state.location.systemId) return fail('err.noStation');
  if (state.pendingEvent) return fail('err.eventPending');
  if (state.location.stationId === stationId) return ok({ report: { completed: [] } });
  const { stats } = analyze(state);
  if (stats.speedAuDay <= 0 || stats.powerFree < -0.001) return fail('err.noEngine');
  const t = travelToBody(state, st.bodyIndex);
  if (!t.ok) return t;
  passTime(state, T.dockDays);
  if (state.dead) return fail('err.dead');
  state.location.stationId = st.id;
  state.location.body = st.bodyIndex;
  state.home = st.id;
  learnStation(state, st);
  refreshBoard(g, state, st);
  refreshShop(state, st);
  const report: DockReport = { completed: [] };
  report.inspection = inspect(state, st);
  const done = completeContractsAt(state, g, st.id);
  report.completed = done.map((d) => ({ contract: d.contract, payout: d.payout }));
  // repair modules / shield recharge at dock
  state.ship.shield = Math.max(state.ship.shield, analyze(state).stats.shieldCap);
  rollEvent(state, 'dock', 0.12, { systemId: st.systemId });
  return ok({ report });
}

export function undock(state: GameState): Result {
  if (!state.location.stationId) return ok();
  if (state.pendingEvent) return fail('err.eventPending');
  state.location.stationId = null;
  return ok();
}

/** Customs inspection on arrival at lawful stations. Illegal cargo is confiscated and fined. */
function inspect(state: GameState, st: StationStatic): { fine: number; confiscated: number } | null {
  const g = galaxyOf(state);
  const def = STATION_TYPES_BY_ID[st.type];
  if (!def.lawful) return null;
  const illegal = state.cargo.filter((c) => isIllegal(c.goodId) && !c.contractId);
  if (!illegal.length) return null;
  const region = g.systems[st.systemId].region;
  const security = region === 'core' ? 1.15 : region === 'inner' ? 1 : region === 'outer' ? 0.8 : 0.55;
  const { stats } = analyze(state);
  const cells = illegal.reduce((s, c) => s + c.w * c.h, 0);
  const concealment = Math.min(0.7, (stats.secureCells / Math.max(1, cells)) * 0.6);
  const p = Math.min(
    0.95,
    T.inspectionBase *
      security *
      riskFactor(state.difficulty.risk) *
      (1 - concealment) *
      (1 + (st.blackMarket ? 0.3 : 0)),
  );
  const caught = withRng(state, (rng) => rng.chance(p));
  if (!caught) return null;
  let value = 0;
  for (const c of illegal) value += c.qty * GOODS_BY_ID[c.goodId].basePrice;
  const fine = Math.min(state.credits, Math.round(value * T.fineMult * 0.5));
  state.cargo = state.cargo.filter((c) => !(isIllegal(c.goodId) && !c.contractId));
  state.credits -= fine;
  state.stations[st.id].rep -= 3;
  state.stats.fines++;
  msg(state, 'msg.inspection', { fine, value: Math.round(value) }, 'bad');
  return { fine, confiscated: Math.round(value) };
}

/* -------------------------------- jump -------------------------------- */

export interface JumpPlan {
  ok: boolean;
  reason?: string;
  ly: number;
  fuel: number;
  days: number;
}

export function planJump(state: GameState, toId: number): JumpPlan {
  const g = galaxyOf(state);
  const from = g.systems[state.location.systemId];
  const to = g.systems[toId];
  const { stats } = analyze(state);
  const ly = dist(from, to);
  const fuel = jumpFuelCost(stats, ly);
  const days = jumpDays(stats, ly);
  const c = canJump(stats);
  if (!c.ok) return { ok: false, reason: `err.${c.reason}`, ly, fuel, days };
  if (!from.neighbors.includes(toId)) return { ok: false, reason: 'err.noRoute', ly, fuel, days };
  if (fuel > state.ship.fuel + 1e-6) return { ok: false, reason: 'err.noFuel', ly, fuel, days };
  return { ok: true, ly, fuel, days };
}

export interface JumpReport {
  ly: number;
  fuel: number;
  days: number;
  accident?: { kind: string; amount: number };
}

export function jump(state: GameState, toId: number): Result<{ report: JumpReport }> {
  if (state.pendingEvent) return fail('err.eventPending');
  const plan = planJump(state, toId);
  if (!plan.ok) return fail(plan.reason ?? 'err.noRoute');
  const g = galaxyOf(state);
  const to = g.systems[toId];
  const { stats, overload } = analyze(state);
  state.location.stationId = null;
  state.ship.fuel -= plan.fuel;
  // wear from jumping
  const unit = plan.ly / 4;
  wearKind(state.ship, 'jump', 1.0 * unit);
  wearKind(state.ship, 'engine', 0.25 * unit);
  wearKind(state.ship, 'reactor', 0.12 * unit);
  state.stats.jumps++;
  const report: JumpReport = { ly: plan.ly, fuel: plan.fuel, days: plan.days };
  // accident roll (before arrival, uses the destination's danger as a mix)
  const here = g.systems[state.location.systemId];
  const danger = (here.danger + to.danger) / 2;
  const slots = state.ship.slots.filter(Boolean);
  const wearAvg = slots.reduce((s, m) => s + (100 - m!.condition), 0) / Math.max(1, slots.length) / 100;
  const p = Math.min(
    0.5,
    T.baseAccident *
      riskFactor(state.difficulty.risk) *
      (1 + danger * 1.2) *
      (1 + wearAvg * 3.5) *
      (1 + overload * T.overloadRisk * 8) *
      (1 + unit * 0.15),
  );
  const accident = withRng(state, (rng) => {
    if (!rng.chance(p)) return null;
    const hazardous = state.cargo.some((c) => GOODS_BY_ID[c.goodId].tags.includes('hazardous'));
    const kinds: [string, number][] = [
      ['fuelLeak', 3],
      ['moduleDamage', 4],
      ['hullHit', 3],
      ['cargoLoss', state.cargo.some((c) => !c.contractId) ? 2 : 0],
      ['hazmat', hazardous ? 3 : 0],
    ];
    const [kind] = rng.weighted(
      kinds.filter((k) => k[1] > 0),
      (k) => k[1],
    );
    return { kind, roll: rng.next(), roll2: rng.next() };
  });
  passTime(state, plan.days);
  if (state.dead) return ok({ report });
  if (accident) {
    state.stats.accidents++;
    const amount = applyAccident(state, accident.kind, accident.roll, accident.roll2);
    report.accident = { kind: accident.kind, amount };
    if (state.dead || state.location.stationId !== null) return ok({ report });
  }
  arrive(state, toId);
  rollEvent(state, 'jump', 0.42, { systemId: toId });
  if (!state.pendingEvent) rollEvent(state, 'arrival', 0.12, { systemId: toId });
  void stats;
  return ok({ report });
}

function applyAccident(state: GameState, kind: string, r1: number, r2: number): number {
  const { stats } = analyze(state);
  switch (kind) {
    case 'fuelLeak': {
      const lost = Math.round(state.ship.fuel * (0.08 + r1 * 0.2));
      state.ship.fuel -= lost;
      msg(state, 'msg.accident.fuelLeak', { n: lost }, 'bad');
      return lost;
    }
    case 'moduleDamage': {
      const idx = state.ship.slots.map((m, i) => (m ? i : -1)).filter((i) => i >= 0);
      if (!idx.length) return 0;
      const i = idx[Math.floor(r1 * idx.length) % idx.length];
      const amt = Math.round(12 + r2 * 24);
      wearModule(state.ship, i, amt);
      msg(state, 'msg.accident.module', { module: state.ship.slots[i]!.defId, n: amt }, 'bad');
      return amt;
    }
    case 'hullHit': {
      const dmg = Math.round(stats.hpMax * (0.06 + r1 * 0.12));
      msg(state, 'msg.accident.hull', { n: dmg }, 'bad');
      damageHull(state, dmg);
      return dmg;
    }
    case 'cargoLoss': {
      const items = state.cargo.filter((c) => !c.contractId);
      if (!items.length) return 0;
      const it = items[Math.floor(r1 * items.length) % items.length];
      const lost = Math.max(1, Math.round(it.qty * (0.3 + r2 * 0.5)));
      removeGoods([it], it.goodId, lost);
      it.cost *= 1 - lost / (it.qty + lost);
      if (it.qty <= 0) state.cargo = state.cargo.filter((c) => c.uid !== it.uid);
      msg(state, 'msg.accident.cargo', { good: it.goodId, n: lost }, 'bad');
      return lost;
    }
    case 'hazmat': {
      const dmg = Math.round(stats.hpMax * (0.12 + r1 * 0.14));
      msg(state, 'msg.accident.hazmat', { n: dmg }, 'bad');
      damageHull(state, dmg);
      return dmg;
    }
  }
  return 0;
}

/** Emergency tow when stranded without fuel. Costs money and days; always lands at a station. */
export function callTow(state: GameState): Result<{ station: string; fee: number }> {
  const g = galaxyOf(state);
  const here = g.systems[state.location.systemId];
  const { stats } = analyze(state);
  const reachable = planJumpsPossible(state);
  if (reachable) return fail('err.towNotNeeded');
  let best: StationStatic | null = null;
  let bd = Infinity;
  for (const s of g.systems) {
    for (const st of s.stations) {
      const d = dist(here, s);
      if (d < bd && st.type !== 'pirate') {
        bd = d;
        best = st;
      }
    }
  }
  if (!best) return fail('err.noStation');
  const fee = Math.min(state.credits, Math.round(60 + bd * 18));
  state.credits -= fee;
  passTime(state, 1 + bd / 5);
  arrive(state, best.systemId);
  state.location = { systemId: best.systemId, stationId: best.id, body: best.bodyIndex };
  state.home = best.id;
  state.ship.fuel = Math.max(state.ship.fuel, Math.min(stats.fuelCap, 4));
  learnStation(state, best);
  refreshBoard(g, state, best);
  refreshShop(state, best);
  msg(state, 'msg.towed', { station: best.name, fee }, 'warn');
  return ok({ station: best.id, fee });
}

/** True when no neighbouring system can be reached with the current fuel and power. */
export function isStranded(state: GameState): boolean {
  return !planJumpsPossible(state);
}

function planJumpsPossible(state: GameState): boolean {
  const g = galaxyOf(state);
  return g.systems[state.location.systemId].neighbors.some((n) => planJump(state, n).ok);
}

/** Just let time pass at the current location. */
export function wait(state: GameState, days: number): Result {
  if (days <= 0) return fail('err.badAmount');
  passTime(state, days);
  return ok();
}

/* ------------------------------- trading ------------------------------ */

function atStation(state: GameState, stationId: string): StationStatic | null {
  if (state.location.stationId !== stationId) return null;
  return stationOf(state, stationId);
}

export function stockOf(state: GameState, stationId: string, goodId: string): number {
  return state.stations[stationId].stock[GOOD_INDEX[goodId]];
}

export function quoteFor(
  state: GameState,
  stationId: string,
  goodId: string,
  side: 'buy' | 'sell',
  qty: number,
): Quote {
  const st = stationOf(state, stationId);
  const fees = feesFor(st, state.difficulty, isBlackMarketGood(goodId));
  const stock = stockOf(state, stationId, goodId);
  if (side === 'buy') return quoteBuy(st, stock, goodId, qty, fees);
  return quoteSell(st, stock, goodId, qty, fees);
}

/** How many units the player can buy right now (stock, money, space, quotas). */
export function maxBuy(state: GameState, stationId: string, goodId: string): number {
  const st = stationOf(state, stationId);
  if (!st.goods.includes(goodId)) return 0;
  const stock = Math.floor(stockOf(state, stationId, goodId));
  if (stock <= 0) return 0;
  const { stats, dims } = analyze(state);
  const quotas = { chilledCells: stats.chilledCells, secureCells: stats.secureCells };
  let q = Math.min(stock, loadableUnits(state.cargo, dims, quotas, goodId, stock));
  if (q <= 0) return 0;
  // affordability by bisection
  if (quoteFor(state, stationId, goodId, 'buy', q).total <= state.credits) return q;
  let lo = 0;
  let hi = q;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (quoteFor(state, stationId, goodId, 'buy', mid).total <= state.credits) lo = mid;
    else hi = mid - 1;
  }
  q = lo;
  return q;
}

export function buyGoods(
  state: GameState,
  stationId: string,
  goodId: string,
  qty: number,
): Result<{ qty: number; paid: number }> {
  const st = atStation(state, stationId);
  if (!st) return fail('err.notDocked');
  if (!st.goods.includes(goodId)) return fail('err.notSold');
  qty = Math.floor(qty);
  if (qty <= 0) return fail('err.badAmount');
  const max = maxBuy(state, stationId, goodId);
  if (max <= 0) {
    const stock = stockOf(state, stationId, goodId);
    if (stock < 1) return fail('err.outOfStock');
    return fail(
      state.credits < quoteFor(state, stationId, goodId, 'buy', 1).total
        ? 'err.noCredits'
        : 'err.noCargoSpace',
    );
  }
  qty = Math.min(qty, max);
  const quote = quoteFor(state, stationId, goodId, 'buy', qty);
  const { stats, dims } = analyze(state);
  const quotas = { chilledCells: stats.chilledCells, secureCells: stats.secureCells };
  const paid = Math.round(quote.total);
  const r = addGoods(state.cargo, dims, quotas, goodId, qty, paid, state.day);
  if (r.added < qty) {
    // quota or overflow limited the load: pay only for what fits
    const part = quoteFor(state, stationId, goodId, 'buy', r.added);
    state.credits -= Math.round(part.total);
    state.stations[stationId].stock[GOOD_INDEX[goodId]] -= r.added;
    learnStation(state, st);
    return ok({ qty: r.added, paid: Math.round(part.total) });
  }
  state.credits -= paid;
  state.stations[stationId].stock[GOOD_INDEX[goodId]] -= qty;
  learnStation(state, st);
  return ok({ qty, paid });
}

/** Sell goods of one type, oldest first. Returns revenue and profit vs. the cost basis. */
export function sellGoods(
  state: GameState,
  stationId: string,
  goodId: string,
  qty: number,
): Result<{ qty: number; revenue: number; profit: number }> {
  const st = atStation(state, stationId);
  if (!st) return fail('err.notDocked');
  if (!st.goods.includes(goodId)) return fail('err.notBought');
  const good = GOODS_BY_ID[goodId];
  const have = unitsOf(state.cargo, goodId);
  qty = Math.min(Math.floor(qty), have);
  if (qty <= 0) return fail('err.badAmount');
  const fees = feesFor(st, state.difficulty, isBlackMarketGood(goodId));
  const items = state.cargo
    .filter((c) => c.goodId === goodId && !c.contractId)
    .sort((a, b) => a.acquiredDay - b.acquiredDay);
  let left = qty;
  let revenue = 0;
  let cost = 0;
  let stock = stockOf(state, stationId, goodId);
  for (const it of items) {
    if (left <= 0) break;
    const take = Math.min(it.qty, left);
    const q = quoteSell(st, stock, goodId, take, fees, freshness(good, state.day - it.acquiredDay));
    revenue += q.total;
    stock = q.stockAfter;
    cost += it.qty > 0 ? (it.cost * take) / it.qty : 0;
    left -= take;
  }
  removeGoods(state.cargo, goodId, qty);
  revenue = Math.round(revenue);
  state.credits += revenue;
  state.stations[stationId].stock[GOOD_INDEX[goodId]] = stock;
  state.stats.tradesProfit += revenue - cost;
  learnStation(state, st);
  return ok({ qty, revenue, profit: Math.round(revenue - cost) });
}

/* ------------------------------ services ------------------------------ */

export function serviceCost(state: GameState, stationId: string): number {
  const st = stationOf(state, stationId);
  const g = galaxyOf(state);
  return serviceMult(st, g.systems[st.systemId].region, state.difficulty);
}

export function buyFuel(
  state: GameState,
  stationId: string,
  units: number,
): Result<{ units: number; paid: number }> {
  const st = atStation(state, stationId);
  if (!st) return fail('err.notDocked');
  const { stats } = analyze(state);
  const room = Math.floor(stats.fuelCap - state.ship.fuel);
  const unit = T.fuelPrice * serviceCost(state, stationId);
  const n = Math.min(Math.floor(units), room, Math.floor(state.credits / unit));
  if (n <= 0) return fail(room <= 0 ? 'err.tankFull' : 'err.noCredits');
  const paid = Math.round(n * unit);
  state.credits -= paid;
  state.ship.fuel += n;
  return ok({ units: n, paid });
}

export function buySupplies(
  state: GameState,
  stationId: string,
  units: number,
): Result<{ units: number; paid: number }> {
  const st = atStation(state, stationId);
  if (!st) return fail('err.notDocked');
  const { stats } = analyze(state);
  const room = Math.floor(stats.suppliesCap - state.ship.supplies);
  const unit = T.suppliesPrice * serviceCost(state, stationId);
  const n = Math.min(Math.floor(units), room, Math.floor(state.credits / unit));
  if (n <= 0) return fail(room <= 0 ? 'err.suppliesFull' : 'err.noCredits');
  const paid = Math.round(n * unit);
  state.credits -= paid;
  state.ship.supplies += n;
  return ok({ units: n, paid });
}

export function buyProbes(
  state: GameState,
  stationId: string,
  n: number,
): Result<{ units: number; paid: number }> {
  const st = atStation(state, stationId);
  if (!st) return fail('err.notDocked');
  const unit = T.probePrice * serviceCost(state, stationId);
  const units = Math.min(Math.floor(n), Math.floor(state.credits / unit), 20 - state.ship.probes);
  if (units <= 0) return fail('err.noCredits');
  const paid = Math.round(units * unit);
  state.credits -= paid;
  state.ship.probes += units;
  return ok({ units, paid });
}

export function hullRepairCost(state: GameState, stationId: string): number {
  const { stats } = analyze(state);
  return Math.round((stats.hpMax - state.ship.hp) * T.repairHullPrice * serviceCost(state, stationId));
}

export function moduleRepairCost(state: GameState, stationId: string, slot: number): number {
  const m = state.ship.slots[slot];
  if (!m) return 0;
  const def = MODULES_BY_ID[m.defId];
  const price = def.price * QUALITY[m.quality].price;
  return Math.round(
    ((100 - m.condition) / 100) * price * T.repairModuleFactor * serviceCost(state, stationId),
  );
}

export function repairHull(state: GameState, stationId: string): Result<{ paid: number }> {
  if (!atStation(state, stationId)) return fail('err.notDocked');
  const cost = hullRepairCost(state, stationId);
  if (cost <= 0) return fail('err.nothingToRepair');
  if (state.credits < cost) return fail('err.noCredits');
  state.credits -= cost;
  state.ship.hp = analyze(state).stats.hpMax;
  return ok({ paid: cost });
}

export function repairModuleAt(state: GameState, stationId: string, slot: number): Result<{ paid: number }> {
  if (!atStation(state, stationId)) return fail('err.notDocked');
  const m = state.ship.slots[slot];
  if (!m) return fail('err.noModule');
  const cost = moduleRepairCost(state, stationId, slot);
  if (cost <= 0) return fail('err.nothingToRepair');
  if (state.credits < cost) return fail('err.noCredits');
  state.credits -= cost;
  m.condition = 100;
  return ok({ paid: cost });
}

export function repairAll(state: GameState, stationId: string): Result<{ paid: number }> {
  if (!atStation(state, stationId)) return fail('err.notDocked');
  let total = hullRepairCost(state, stationId);
  state.ship.slots.forEach((_, i) => (total += moduleRepairCost(state, stationId, i)));
  if (total <= 0) return fail('err.nothingToRepair');
  if (state.credits < total) return fail('err.noCredits');
  state.credits -= total;
  state.ship.hp = analyze(state).stats.hpMax;
  for (const m of state.ship.slots) if (m) m.condition = 100;
  return ok({ paid: total });
}

/** Field repair with the ship's repair module, consuming spare parts. */
export function fieldRepair(state: GameState, target: 'hull' | number): Result<{ restored: number }> {
  const { stats } = analyze(state);
  if (stats.repairRate <= 0) return fail('err.noRepairModule');
  if (stats.powerScan < -0.001) return fail('err.power');
  if (unitsOf(state.cargo, 'spare_parts') < 1) return fail('err.noSpareParts');
  let restored: number;
  if (target === 'hull') {
    if (state.ship.hp >= stats.hpMax) return fail('err.nothingToRepair');
    restored = Math.min(stats.hpMax - state.ship.hp, stats.repairRate * 0.8);
    state.ship.hp += restored;
  } else {
    const m = state.ship.slots[target];
    if (!m) return fail('err.noModule');
    if (m.condition >= 100) return fail('err.nothingToRepair');
    restored = Math.min(100 - m.condition, stats.repairRate * 1.4);
    m.condition += restored;
  }
  removeGoods(state.cargo, 'spare_parts', 1);
  wearKind(state.ship, 'repair', 1);
  passTime(state, 0.15);
  return ok({ restored });
}

/** Buy fresh market intel for the whole sector at a trade hub. */
export function intelPrice(): number {
  return 150;
}

export function buyIntel(state: GameState, stationId: string): Result<{ stations: number }> {
  const st = atStation(state, stationId);
  if (!st) return fail('err.notDocked');
  if (!STATION_TYPES_BY_ID[st.type].intel) return fail('err.noIntel');
  const price = intelPrice();
  if (state.credits < price) return fail('err.noCredits');
  const g = galaxyOf(state);
  const sector = g.systems[st.systemId].sector;
  let n = 0;
  for (const s of g.systems) {
    if (s.sector !== sector) continue;
    for (const o of s.stations) {
      learnStation(state, o);
      n++;
    }
    if (!state.seen.includes(s.id)) state.seen.push(s.id);
  }
  state.credits -= price;
  updateSeen(state);
  return ok({ stations: n });
}

/* ------------------------------ cargo grid ---------------------------- */

export function cargoMove(state: GameState, uid: string, x: number, y: number): Result {
  const { dims } = analyze(state);
  return moveItem(state.cargo, dims, uid, x, y) ? ok() : fail('err.cannotPlace');
}

export function cargoRotate(state: GameState, uid: string): Result {
  const { dims } = analyze(state);
  return rotateItem(state.cargo, dims, uid) ? ok() : fail('err.cannotRotate');
}

export function cargoAutoArrange(state: GameState): Result {
  const { dims } = analyze(state);
  return autoArrange(state.cargo, dims) ? ok() : fail('err.cannotArrange');
}

export function jettison(state: GameState, uid: string): Result {
  const it = state.cargo.find((c) => c.uid === uid);
  if (!it) return fail('err.itemGone');
  if (it.contractId) {
    return fail('err.contractCargo');
  }
  state.cargo = state.cargo.filter((c) => c.uid !== uid);
  return ok();
}

/* ------------------------------- helpers ------------------------------ */

export function systemDistance(state: GameState, a: number, b: number): number {
  const g = galaxyOf(state);
  return dist(g.systems[a], g.systems[b]);
}

export function inSystemTravelDays(state: GameState, bodyIdx: number): number {
  const g = galaxyOf(state);
  const sys = g.systems[state.location.systemId];
  const { stats } = analyze(state);
  return sublightDays(stats, Math.abs(bodyAu(sys, bodyIdx) - bodyAu(sys, state.location.body)));
}

export function refuelNeeded(state: GameState): number {
  const { stats } = analyze(state);
  return Math.max(0, stats.fuelCap - state.ship.fuel);
}

export function snapshotAt(state: GameState, st: StationStatic, goodId: string) {
  return snapshotPrice(st, stockOf(state, st.id, goodId), goodId, state.difficulty, state.day);
}

/* ------------------------------ insurance ----------------------------- */

/** Re-activate a lapsed policy at a station: pays the debt plus a re-activation fee. */
export function renewInsurance(state: GameState): Result<{ paid: number }> {
  if (!state.location.stationId) return fail('err.notDocked');
  if (!state.difficulty.insurance) return fail('err.noInsuranceMode');
  if (state.insurance.active) return fail('err.alreadyInsured');
  const fee = Math.round(state.insurance.due + premiumPerDay(state) * 5);
  if (state.credits < fee) return fail('err.noCredits');
  state.credits -= fee;
  state.insurance = { ...state.insurance, active: true, due: 0, lapsedSince: null };
  msg(state, 'msg.insuranceRenewed', undefined, 'good');
  return ok({ paid: fee });
}

/** Full coverage also insures optional modules (higher premium). */
export function setFullCoverage(state: GameState, full: boolean): Result {
  if (!state.location.stationId) return fail('err.notDocked');
  if (!state.insurance.active) return fail('err.notInsured');
  state.insurance.full = full;
  return ok();
}
