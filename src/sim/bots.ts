/**
 * Headless bots that play the game through the public action API. Used by the balance simulator and tests.
 * Bots only use information a player has (known prices, visited systems), except the explicit `oracle` mode.
 */
import { MODULES, MODULES_BY_ID } from '../content/modules';
import { GOODS_BY_ID, MARKET_GOODS } from '../content/goods';
import { STATION_TYPES_BY_ID } from '../content/stations';
import { quoteBuy, quoteSell, feesFor, isBlackMarketGood } from '../core/economy';
import { acceptContract } from '../core/contractOps';
import { stationsNear } from '../core/contracts';
import { choiceAvailable } from '../core/events';
import { EVENTS_BY_ID } from '../content/events';
import { exploreAnomaly, mine, mineMethodFor, REFINE, scanSurface, scanSystem, sellDiscoveries, bodyDyn, salvage } from '../core/exploration';
import { dist, shortestPath } from '../core/galaxy';
import { Rng } from '../core/rng';
import { buyFuel, buyGoods, buyProbes, buySupplies, callTow, dockAt, jump, maxBuy, planJump, repairAll, sellGoods, stockOf, undock, wait } from '../core/game';
import { computeShipStats, hullSlots, moduleFits, modulePrice } from '../core/ship';
import { buyModule, installModule } from '../core/shop';
import { analyze, galaxyOf, stationOf } from '../core/state';
import { resolveEvent } from '../core/events';
import type { GameState, StationStatic } from '../core/types';
import { unitsOf } from '../core/cargo';

export type Strategy = 'trader' | 'oracle' | 'miner' | 'explorer' | 'hauler' | 'loop';

export interface BotRun {
  strategy: Strategy;
  seed: string;
  daysPlayed: number;
  startWorth: number;
  worthByDay: Record<number, number>;
  finalWorth: number;
  income: number;
  firstUpgradeDay: number | null;
  accidents: number;
  deaths: number;
  jumps: number;
  routeProfit: Record<string, number>;
  loopTrips: number[];
  stuck: number;
}

export function netWorth(state: GameState): number {
  let w = state.credits;
  for (const m of state.ship.slots) if (m) w += modulePrice(MODULES_BY_ID[m.defId], m.quality) * 0.5;
  for (const c of state.cargo) w += c.cost;
  w += state.ship.fuel * 3;
  return w;
}

export class Bot {
  rng: Rng;
  run: BotRun;
  state: GameState;
  /** Systems the bot has found unreachable (stuck handling). */
  constructor(
    state: GameState,
    public strategy: Strategy,
  ) {
    this.state = state;
    this.rng = Rng.fromSeed(`${state.seed}:bot:${strategy}`);
    this.run = {
      strategy,
      seed: state.seed,
      daysPlayed: 0,
      startWorth: netWorth(state),
      worthByDay: {},
      finalWorth: 0,
      income: 0,
      firstUpgradeDay: null,
      accidents: 0,
      deaths: 0,
      jumps: 0,
      routeProfit: {},
      loopTrips: [],
      stuck: 0,
    };
  }

  private g() {
    return galaxyOf(this.state);
  }

  /* ---------------------------- low-level helpers ---------------------------- */

  autoEvent(): void {
    const s = this.state;
    while (s.pendingEvent) {
      const ev = EVENTS_BY_ID[s.pendingEvent.eventId];
      const opts = ev.choices.map((_, i) => i).filter((i) => choiceAvailable(s, ev, i));
      const pick = opts.length ? this.rng.pick(opts) : 0;
      const r = resolveEvent(s, pick);
      if (!r.ok) {
        s.pendingEvent = null;
        break;
      }
    }
  }

  stationHere(): StationStatic | null {
    return this.state.location.stationId ? stationOf(this.state, this.state.location.stationId) : null;
  }

  dockSomewhere(): boolean {
    const s = this.state;
    if (s.location.stationId) return true;
    const sys = this.g().systems[s.location.systemId];
    const st = [...sys.stations].sort((a, b) => Number(a.type === 'pirate') - Number(b.type === 'pirate'))[0];
    if (!st) return false;
    const r = dockAt(s, st.id);
    this.autoEvent();
    return r.ok;
  }

  serviceHere(): void {
    const s = this.state;
    const st = this.stationHere();
    if (!st) return;
    const { stats } = analyze(s);
    if (s.ship.fuel < stats.fuelCap * 0.9) buyFuel(s, st.id, stats.fuelCap - s.ship.fuel);
    if (s.ship.supplies < stats.suppliesCap * 0.6) buySupplies(s, st.id, stats.suppliesCap - s.ship.supplies);
    if (s.ship.hp < stats.hpMax * 0.7 || s.ship.slots.some((m) => m && m.condition < 45)) repairAll(s, st.id);
    this.sellDiscoveries();
  }

  sellDiscoveries(): void {
    const st = this.stationHere();
    if (st && STATION_TYPES_BY_ID[st.type].cartography) sellDiscoveries(this.state, st.id);
  }

  /** Travel along the shortest route, refuelling where needed. Returns false if impossible. */
  travelTo(target: number): boolean {
    const s = this.state;
    let guard = 0;
    while (s.location.systemId !== target && guard++ < 60) {
      if (s.dead) return false;
      const path = shortestPath(this.g(), s.location.systemId, target);
      if (!path || path.length < 2) return false;
      const next = path[1];
      let plan = planJump(s, next);
      if (!plan.ok && plan.reason === 'err.noFuel') {
        if (!this.refuelHere()) {
          // try tow
          const t = callTow(s);
          if (!t.ok) return false;
          this.run.stuck++;
          continue;
        }
        plan = planJump(s, next);
      }
      if (!plan.ok) {
        if (plan.reason === 'err.power') this.fixPower();
        plan = planJump(s, next);
        if (!plan.ok) return false;
      }
      // top up before long hops when a station is here
      if (s.location.stationId === null && this.g().systems[s.location.systemId].stations.length) {
        const { stats } = analyze(s);
        if (s.ship.fuel < stats.fuelCap * 0.5) this.refuelHere();
      }
      undock(s);
      const r = jump(s, next);
      this.run.jumps++;
      if (!r.ok) return false;
      this.autoEvent();
    }
    return s.location.systemId === target;
  }

  refuelHere(): boolean {
    const s = this.state;
    const sys = this.g().systems[s.location.systemId];
    if (!sys.stations.length) return false;
    const st = sys.stations.find((x) => x.type !== 'pirate') ?? sys.stations[0];
    if (s.location.stationId !== st.id) {
      const r = dockAt(s, st.id);
      if (!r.ok) return false;
      this.autoEvent();
    }
    const { stats } = analyze(s);
    const r = buyFuel(s, st.id, stats.fuelCap - s.ship.fuel);
    return r.ok || s.ship.fuel >= stats.fuelCap - 1;
  }

  fixPower(): void {
    const s = this.state;
    // disable optional power hogs until the jump works
    for (const m of s.ship.slots) {
      if (!m) continue;
      const kind = MODULES_BY_ID[m.defId].kind;
      if (['cooler', 'vault', 'shield', 'amplifier', 'quarters', 'radiator'].includes(kind) && analyze(s).stats.powerJump < 0) m.enabled = false;
    }
  }

  /* ---------------------------- upgrades ---------------------------- */

  /** Fill empty free slots with useful modules when cash allows. */
  upgrade(priority: string[]): void {
    const s = this.state;
    const st = this.stationHere();
    if (!st) return;
    const dyn = s.stations[st.id];
    if (!dyn.shop.modules.length) return;
    const slots = hullSlots(s.ship.hullId);
    for (const kind of priority) {
      const free = slots.filter((sl) => !s.ship.slots[sl.index] && !sl.core);
      if (!free.length) return;
      const options = dyn.shop.modules
        .filter((it) => MODULES_BY_ID[it.defId].kind === kind)
        .filter((it) => free.some((sl) => moduleFits(sl, MODULES_BY_ID[it.defId])))
        .filter((it) => s.credits - it.price > 700 + this.reserve())
        .sort((a, b) => b.price - a.price);
      const pick = options.find((it) => it.quality !== 'E' && it.quality !== 'D') ?? options[0];
      if (!pick) continue;
      const slot = free.filter((sl) => moduleFits(sl, MODULES_BY_ID[pick.defId])).sort((a, b) => (a.size < b.size ? 1 : -1))[0];
      const before = netWorth(s);
      void before;
      if (buyModule(s, st.id, pick.uid).ok) {
        if (installModule(s, pick.uid, slot.index).ok) {
          if (this.run.firstUpgradeDay === null) this.run.firstUpgradeDay = s.day;
          // power check: disable if the ship cannot jump anymore
          const stats = analyze(s).stats;
          if (stats.powerJump < 0) this.fixPower();
        }
      }
    }
  }

  reserve(): number {
    return 500;
  }

  /* ---------------------------- trading ---------------------------- */

  bestTrade(oracle: boolean): { dest: StationStatic; goodId: string; qty: number; score: number; profit: number } | null {
    const s = this.state;
    const here = this.stationHere();
    if (!here) return null;
    const g = this.g();
    const { stats } = analyze(s);
    let best: { dest: StationStatic; goodId: string; qty: number; score: number; profit: number } | null = null;
    const near = stationsNear(g, here.systemId, 4).filter((n) => n.station.id !== here.id && n.station.type !== 'pirate');
    for (const { station: d } of near) {
      const known = s.prices[d.id];
      if (!known && !oracle) continue;
      const len = this.pathLen(here.systemId, d.systemId);
      const days = len / Math.max(1, stats.jumpSpeed) + 0.4 * Math.max(1, Math.round(len / 5)) + 0.6;
      const fuelCost = len * stats.fuelPerLy * 4.6;
      for (const goodId of here.goods) {
        if (isBlackMarketGood(goodId) && !oracle) continue;
        if (!d.goods.includes(goodId)) continue;
        const stock = stockOf(s, here.id, goodId);
        if (stock < 2) continue;
        const qMax = maxBuy(s, here.id, goodId);
        if (qMax <= 0) continue;
        const feesH = feesFor(here, s.difficulty, false);
        const feesD = feesFor(d, s.difficulty, false);
        const dStock = oracle ? stockOf(s, d.id, goodId) : known[goodId]?.stock;
        if (dStock === undefined) continue;
        // pick qty maximising profit under slippage (coarse search)
        for (const frac of [0.25, 0.5, 0.75, 1]) {
          const q = Math.max(1, Math.floor(qMax * frac));
          const cost = quoteBuy(here, stock, goodId, q, feesH).total;
          const rev = quoteSell(d, dStock, goodId, q, feesD).total;
          const profit = rev - cost - fuelCost;
          const score = profit / days;
          if (profit > 120 && (!best || score > best.score)) best = { dest: d, goodId, qty: q, score, profit };
        }
      }
    }
    return best;
  }

  pathLen(a: number, b: number): number {
    const p = shortestPath(this.g(), a, b);
    if (!p) return 999;
    let l = 0;
    for (let i = 1; i < p.length; i++) l += dist(this.g().systems[p[i - 1]], this.g().systems[p[i]]);
    return l;
  }

  sellAllHere(): void {
    const s = this.state;
    const st = this.stationHere();
    if (!st) return;
    const before = s.credits;
    for (const goodId of [...new Set(s.cargo.filter((c) => !c.contractId).map((c) => c.goodId))]) {
      if (!st.goods.includes(goodId)) continue;
      sellGoods(s, st.id, goodId, unitsOf(s.cargo, goodId));
    }
    void before;
  }

  /** Explore towards the nearest unvisited system that has a station. */
  exploreStep(withScan = true): boolean {
    const s = this.state;
    const g = this.g();
    const here = g.systems[s.location.systemId];
    const cands = g.systems
      .filter((x) => !s.visited.includes(x.id) && s.seen.includes(x.id))
      .map((x) => ({ x, d: dist(here, x) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 6);
    for (const c of cands) {
      const pathOk = shortestPath(g, here.id, c.x.id);
      if (!pathOk) continue;
      if (this.travelTo(c.x.id)) {
        if (withScan) this.scanHere();
        return true;
      }
    }
    return false;
  }

  scanHere(): void {
    const s = this.state;
    scanSystem(s);
    const sys = this.g().systems[s.location.systemId];
    const { stats } = analyze(s);
    if (stats.surfacePower > 0) {
      for (const b of sys.bodies) {
        if ((s.detected[sys.id] ?? []).includes(b.id) && !bodyDyn(s, b.id).surface) {
          scanSurface(s, b.index, false);
          if (s.dead) return;
        }
      }
      // anomalies
      for (const b of sys.bodies) {
        const d = bodyDyn(s, b.id);
        for (const a of b.anomalies) {
          if (d.revealed.includes(a.id) && !d.anomaliesDone.includes(a.id)) {
            exploreAnomaly(s, b.index, a.id);
            this.autoEvent();
          }
        }
      }
    }
  }

  /* ---------------------------- strategies ---------------------------- */

  stepTrader(oracle: boolean): void {
    const s = this.state;
    if (!this.dockSomewhere()) {
      this.exploreStep(false);
      return;
    }
    const st = this.stationHere()!;
    this.sellAllHere();
    this.serviceHere();
    this.upgrade(['cargo', 'fuel', 'cargo', 'repair']);
    const known = Object.keys(s.prices).length;
    const trade = this.bestTrade(oracle);
    if (!trade || known < 5) {
      if (trade && known >= 3) {
        /* proceed with the trade */
      } else {
        if (!this.exploreStep(false)) wait(s, 1);
        this.dockSomewhere();
        return;
      }
    }
    const t = trade!;
    const r = buyGoods(s, st.id, t.goodId, t.qty);
    if (!r.ok) {
      wait(s, 1);
      return;
    }
    const startCredits = s.credits + r.paid;
    if (this.travelTo(t.dest.systemId)) {
      const d = dockAt(s, t.dest.id);
      this.autoEvent();
      if (d.ok) {
        const before = s.credits;
        this.sellAllHere();
        const gain = s.credits - before - r.paid;
        const key = `${st.id}>${t.dest.id}:${t.goodId}`;
        this.run.routeProfit[key] = (this.run.routeProfit[key] ?? 0) + gain;
      }
    }
    void startCredits;
  }

  stepHauler(): void {
    const s = this.state;
    if (!this.dockSomewhere()) return void this.exploreStep(false);
    const st = this.stationHere()!;
    this.sellAllHere();
    this.serviceHere();
    this.upgrade(['cargo', 'fuel']);
    const g = this.g();
    const dyn = s.stations[st.id];
    const { stats } = analyze(s);
    // choose contracts: freight / courier / supply-from-cargo, best reward per day, same destination bundle
    const scored = dyn.board
      .filter((c) => (c.kind === 'freight' || c.kind === 'courier' || c.kind === 'passenger') && c.state === 'offered')
      .filter((c) => c.kind !== 'passenger' || (stats.beds >= (c.passengers ?? 0) && stats.comfort >= (c.comfort ?? 1)))
      .map((c) => {
        const len = this.pathLen(st.systemId, c.destSystem);
        const days = len / Math.max(1, stats.jumpSpeed) + 1;
        const fuel = len * stats.fuelPerLy * 4.6;
        return { c, score: (c.reward - fuel) / days, len, fuel };
      })
      .filter((x) => x.score > 30 && x.len < 70)
      .sort((a, b) => b.score - a.score);
    if (!scored.length) {
      if (!this.exploreStep(false)) wait(s, 2);
      return;
    }
    const top = scored[0];
    const group = scored.filter((x) => x.c.dest === top.c.dest).slice(0, 4);
    let accepted = 0;
    for (const x of group) if (acceptContract(s, st.id, x.c.id).ok) accepted++;
    if (!accepted) {
      wait(s, 1);
      return;
    }
    if (this.travelTo(top.c.destSystem)) {
      dockAt(s, top.c.dest);
      this.autoEvent();
    }
    void g;
  }

  stepExplorer(): void {
    const s = this.state;
    if (!this.dockSomewhere()) return void this.exploreStep(true);
    this.sellAllHere();
    this.serviceHere();
    this.upgrade(['surface', 'sensors', 'fuel']);
    const st = this.stationHere()!;
    const { stats } = analyze(s);
    if (stats.hasProbe && s.ship.probes < 3) buyProbes(s, st.id, 3);
    if (!this.exploreStep(true)) {
      wait(s, 1);
    }
    // sell data at the next cartography stop
    this.dockSomewhere();
    this.sellDiscoveries();
    void salvage;
  }

  stepMiner(): void {
    const s = this.state;
    const { stats } = analyze(s);
    if (stats.laserYield <= 0 && stats.scoopYield <= 0) {
      // bootstrap with trading until a laser is affordable
      this.stepTrader(false);
      if (this.stationHere()) this.upgradeMining();
      return;
    }
    if (!this.dockSomewhere()) return void this.exploreStep(false);
    this.sellAllHere();
    this.serviceHere();
    const st = this.stationHere()!;
    // find a minable body in nearby known systems, preferring where we already are
    const g = this.g();
    const site = this.findMiningSite();
    if (!site) {
      if (!this.exploreStep(true)) wait(s, 1);
      return;
    }
    if (site.systemId !== s.location.systemId) {
      if (!this.travelTo(site.systemId)) return;
    }
    // scan if needed
    const sys = g.systems[site.systemId];
    if (!bodyDyn(s, site.bodyId).revealed.length) {
      scanSystem(s);
      scanSurface(s, sys.bodies.findIndex((b) => b.id === site.bodyId), false);
    }
    const body = sys.bodies.find((b) => b.id === site.bodyId)!;
    const dyn = bodyDyn(s, body.id);
    let guard = 0;
    while (guard++ < 14 && !s.dead) {
      const dep = body.deposits.filter((d) => dyn.revealed.includes(d.id)).sort((a, b) => GOODS_BY_ID[b.goodId].basePrice * b.richness - GOODS_BY_ID[a.goodId].basePrice * a.richness)[0];
      if (!dep) break;
      const free = analyze(s).dims.cells - s.cargo.reduce((x, c) => x + c.w * c.h, 0);
      if (free < 1 || s.ship.fuel < 3) break;
      const r = mine(s, body.index, dep.id, 1);
      this.autoEvent();
      if (!r.ok) break;
      if (r.out.units < 3) break;
    }
    // go sell
    const sellers = this.bestSellStation();
    if (sellers) {
      if (this.travelTo(sellers.systemId)) {
        dockAt(s, sellers.id);
        this.autoEvent();
        this.sellAllHere();
      }
    } else this.dockSomewhere();
    void st;
    void REFINE;
    void mineMethodFor;
  }

  upgradeMining(): void {
    const s = this.state;
    const st = this.stationHere();
    if (!st) return;
    if (s.credits < 3300) return;
    this.upgrade(['laser', 'surface', 'refinery', 'fuel']);
  }

  findMiningSite(): { systemId: number; bodyId: string } | null {
    const s = this.state;
    const g = this.g();
    const here = g.systems[s.location.systemId];
    let best: { systemId: number; bodyId: string; score: number } | null = null;
    for (const id of s.visited) {
      const sys = g.systems[id];
      if (dist(sys, here) > 25) continue;
      for (const b of sys.bodies) {
        if (b.kind !== 'belt') continue;
        if (!(s.detected[sys.id] ?? []).includes(b.id) && id !== s.location.systemId) continue;
        const score = b.deposits.reduce((m, d) => Math.max(m, d.richness * GOODS_BY_ID[d.goodId].basePrice), 0) / (1 + dist(sys, here) / 6);
        if (!best || score > best.score) best = { systemId: id, bodyId: b.id, score };
      }
    }
    return best;
  }

  bestSellStation(): StationStatic | null {
    const s = this.state;
    const goods = [...new Set(s.cargo.map((c) => c.goodId))];
    if (!goods.length) return null;
    const g = this.g();
    const here = g.systems[s.location.systemId];
    let best: StationStatic | null = null;
    let bs = -1;
    for (const [id, prices] of Object.entries(s.prices)) {
      const st = g.stationsById[id];
      if (st.type === 'pirate') continue;
      let v = 0;
      for (const gid of goods) v += (prices[gid]?.sell ?? 0) * unitsOf(s.cargo, gid);
      v /= 1 + dist(g.systems[st.systemId], here) / 8;
      if (v > bs) {
        bs = v;
        best = st;
      }
    }
    return best;
  }

  /** One high-level decision. */
  step(): void {
    switch (this.strategy) {
      case 'trader':
        return this.stepTrader(false);
      case 'oracle':
        return this.stepTrader(true);
      case 'miner':
        return this.stepMiner();
      case 'explorer':
        return this.stepExplorer();
      case 'hauler':
        return this.stepHauler();
      case 'loop':
        return this.stepLoop();
    }
  }

  /** Fixed A<->B shuttle on the best initial pair, to detect infinite profit loops. */
  loopPair: { a: StationStatic; b: StationStatic; goodId: string } | null = null;
  stepLoop(): void {
    const s = this.state;
    if (!this.dockSomewhere()) return;
    this.serviceHere();
    if (!this.loopPair) {
      const t = this.bestTrade(true);
      if (!t) return void wait(s, 1);
      this.loopPair = { a: this.stationHere()!, b: t.dest, goodId: t.goodId };
    }
    const { a, b, goodId } = this.loopPair;
    const here = this.stationHere()!;
    const w0 = s.credits;
    const from = here.id === b.id ? b : a;
    const to = from.id === a.id ? b : a;
    // only the profitable direction carries cargo; the return leg is a deadhead
    const q = from.id === a.id ? maxBuy(s, from.id, goodId) : 0;
    if (q > 0) buyGoods(s, from.id, goodId, q);
    if (this.travelTo(to.systemId)) {
      dockAt(s, to.id);
      this.autoEvent();
      this.sellAllHere();
    }
    this.run.loopTrips.push(Math.round(s.credits - w0));
  }

  play(days: number): BotRun {
    const s = this.state;
    const start = s.day;
    this.run.startWorth = netWorth(s);
    let guard = 0;
    while (s.day - start < days && !s.dead && guard++ < 5000) {
      this.step();
      this.autoEvent();
      const d = Math.floor(s.day - start);
      for (let k = Math.max(0, d - 6); k <= d; k++) if (this.run.worthByDay[k] === undefined && k <= s.day - start) this.run.worthByDay[k] = netWorth(s);
    }
    this.run.daysPlayed = s.day - start;
    this.run.finalWorth = netWorth(s);
    this.run.income = (this.run.finalWorth - this.run.startWorth) / Math.max(1, this.run.daysPlayed);
    this.run.accidents = s.stats.accidents;
    this.run.deaths = s.stats.deaths;
    return this.run;
  }
}

void MODULES;
void MARKET_GOODS;
void computeShipStats;
