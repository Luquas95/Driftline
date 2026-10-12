/**
 * Headless bots that play whole games to an ending: they run their trade strategy and, between trips, found a
 * base, build, research, run a fleet and follow the story towards a target ending. Used by the balance report.
 *
 * Abstractions (a bot is not a logistics planner): building materials are "bought" at the going price and
 * delivered instantly to the base, and the bot treats the surface scan of its base system as done.
 */
import { BUILDINGS_BY_ID, type BuildingId } from '../content/buildings';
import { GOODS_BY_ID } from '../content/goods';
import { TECHS } from '../content/tech';
import {
  checkBuilding,
  checkHullOrder,
  collectTreasury,
  commissionHull,
  defendBase,
  foundBase,
  hangarSlots,
  levelOf,
  mineOutput,
  producibleGoods,
  setAutoSell,
  setLine,
  startBuilding,
  maxLines,
  refuelAtBase,
  resupplyAtBase,
} from '../core/base';
import { addGoods } from '../core/cargo';
import { exploreAnomaly, bodyDyn } from '../core/exploration';
import { joinFaction, repOf } from '../core/factions';
import { planTrip, setFleetOrder } from '../core/fleet';
import { dist, shortestPath } from '../core/galaxy';
import { canResearch, hasTech, startResearch } from '../core/research';
import { ownerOf, tierOf } from '../core/territory';
import { analyze, galaxyOf } from '../core/state';
import { newGame } from '../core/start';
import { dockAt, undock, wait } from '../core/game';
import { understanding } from '../core/lang';
import { Bot, netWorth, type Strategy } from './bots';
import type { GameState } from '../core/types';
import type { EventDef } from '../core/eventTypes';

export type Target = 'science' | 'accord' | 'exodus' | 'dominion';

export const TARGET_BY_STRATEGY: Record<Strategy, Target> = {
  trader: 'exodus',
  hauler: 'dominion',
  miner: 'science',
  explorer: 'accord',
  oracle: 'science',
  loop: 'science',
};

const RESEARCH_PLAN: Record<Target, string[]> = {
  science: [
    'deep_scan',
    'xeno_1',
    'atlas',
    'xeno_2',
    'fusion_2',
    'mass_prod',
    'resonance',
    'xeno_3',
    'null_field',
    'anchor_array',
    'grey_decode',
  ],
  accord: ['deep_scan', 'xeno_1', 'atlas', 'xeno_2', 'resonance', 'xeno_3', 'accord_protocol'],
  exodus: ['deep_scan', 'xeno_1', 'mass_prod', 'fusion_2', 'xeno_2', 'jump_2', 'logistics', 'exodus_drive'],
  dominion: ['deep_scan', 'xeno_1', 'mass_prod', 'logistics', 'xeno_2', 'precision_fab'],
};

const BUILD_PLANS: Record<Target, BuildingId[]> = {
  science: [
    'warehouse',
    'lab',
    'mine',
    'lab',
    'port',
    'lab',
    'refinery',
    'anchor',
    'lab',
    'anchor',
    'anchor',
    'defense',
  ],
  accord: ['warehouse', 'lab', 'mine', 'lab', 'port', 'lab', 'defense', 'refinery', 'lab'],
  exodus: [
    'warehouse',
    'mine',
    'lab',
    'shipyard',
    'hangar',
    'shipyard',
    'lab',
    'hangar',
    'shipyard',
    'refinery',
    'factory',
    'hangar',
    'shipyard',
    'hangar',
  ],

  dominion: ['warehouse', 'port', 'lab', 'port', 'mine', 'port', 'refinery', 'lab', 'port', 'port'],
};

/** Artifacts needed by each target. */
const ARTIFACTS_NEEDED: Record<Target, number> = { science: 3, accord: 2, exodus: 1, dominion: 1 };

export interface EndgameRun {
  strategy: Strategy;
  seed: string;
  risk: string;
  prices: string;
  target: Target;
  ending: string | null;
  endDay: number;
  dead: boolean;
  baseDay: number | null;
  story5Day: number | null;
  /** Share of income made by the base and the fleet around day 200 (passive / total growth). */
  passiveMid: number | null;
  passiveEnd: number;
  consumedEnd: number;
  techs: number;
  fleet: number;
  credits: number;
  worth: number;
  language: number;
  artifacts: number;
  attacks: number;
  repelled: number;
  dailyIncome: number;
}

export class EndgameBot extends Bot {
  target: Target;
  baseDay: number | null = null;
  story5Day: number | null = null;
  lastVisit = -99;
  midSample: { passive: number; worth: number; day: number } | null = null;
  passiveMid: number | null = null;
  startWorthAtBase = 0;
  noBaseSite = false;
  artifactTries = 0;

  constructor(state: GameState, strategy: Strategy) {
    super(state, strategy);
    this.target = TARGET_BY_STRATEGY[strategy];
  }

  /* ------------------------------ decisions ------------------------------ */

  protected override pickChoice(ev: EventDef | { id: string }, opts: number[]): number {
    if (!opts.length) return 0;
    const id = ev.id;
    if (id.startsWith('end_') || id.startsWith('artifact_')) return opts[0];
    if (id.startsWith('st_')) return opts[0];
    return super.pickChoice(ev, opts);
  }

  protected override contractBonus(c: { facOnly?: boolean; faction?: string }): number {
    if (this.target !== 'dominion') return 0;
    if (c.facOnly) return 400;
    return c.faction === 'consortium' ? 35 : 0;
  }

  /** Debug switches for experiments. */
  off = new Set<string>();

  /** One management session between stretches of ordinary trading. */
  manage(): void {
    const s = this.state;
    if (s.ending || s.dead) return;
    this.sampleMid();
    if (!this.off.has('escape')) this.escape();
    if (!this.off.has('endgame')) this.endgame();
    if (!this.off.has('escape')) this.escape();
    // a base has fuel and supplies for its captain
    if (s.base && s.location.systemId === s.base.systemId) {
      refuelAtBase(s);
      resupplyAtBase(s);
    }
  }

  /** Leave dead zones and other places without a market (a real captain would not sit there and starve). */
  private escape(): void {
    const s = this.state;
    const g = galaxyOf(s);
    const sys = g.systems[s.location.systemId];
    const usable = sys.stations.some((st) => st.type !== 'pirate') && (s.threat.grip[sys.id] ?? 0) < 100;
    if (usable) return;
    const id = this.nearest(
      (x) => (s.threat.grip[x] ?? 0) < 60 && g.systems[x].stations.some((st) => st.type !== 'pirate'),
      30,
    );
    if (id !== null) this.go(id);
  }

  private passive(): number {
    const b = this.state.base;
    return b ? b.stats.sold + b.stats.fleetIncome : 0;
  }

  private sampleMid(): void {
    const s = this.state;
    if (this.midSample === null && this.baseDay !== null) {
      this.midSample = { passive: this.passive(), worth: netWorth(s), day: s.day };
    }
    if (this.passiveMid === null && s.day >= 200 && this.midSample) {
      const dw = netWorth(s) - this.midSample.worth + this.base_spent;
      const dp = this.passive() - this.midSample.passive;
      this.passiveMid = dw > 0 ? Math.max(0, Math.min(1, dp / dw)) : 0;
    }
  }

  /** Credits the bot has put into the base (so the "total income" comparison is fair). */
  base_spent = 0;

  private endgame(): void {
    const s = this.state;
    this.storyErrands();
    if (s.ending || s.dead) return;
    if (s.base) this.pickResearch();
    if (!s.base) this.tryFoundBase();
    else if (s.day - this.lastVisit >= 9 || (s.base.attack && s.day < s.base.attack.resolve - 1))
      this.visitBase();
    if (s.ending || s.dead) return;
    this.factionTasks();
    this.finale();
    if (s.story.stage >= 5 && this.story5Day === null) this.story5Day = s.day;
  }

  /* ------------------------------ travelling helpers ------------------------------ */

  private nearest(pred: (id: number) => boolean, maxLen = 14): number | null {
    const s = this.state;
    const g = galaxyOf(s);
    const here = g.systems[s.location.systemId];
    let best: number | null = null;
    let bd = Infinity;
    for (const x of g.systems) {
      if (x.id === here.id || !pred(x.id)) continue;
      const d = dist(here, x);
      if (d < bd) {
        const p = shortestPath(g, here.id, x.id);
        if (p && p.length <= maxLen) {
          bd = d;
          best = x.id;
        }
      }
    }
    return best;
  }

  private go(id: number): boolean {
    const s = this.state;
    if (s.location.systemId === id) return true;
    undock(s);
    return this.travelTo(id);
  }

  /** Arrive again in a system (story beats trigger on arrival). */
  private reenter(id: number): void {
    const s = this.state;
    if (s.location.systemId !== id) {
      this.go(id);
      return;
    }
    const g = galaxyOf(s);
    const n = g.systems[id].neighbors.find((x) => (s.threat.grip[x] ?? 0) < 100);
    if (n === undefined) return;
    if (this.go(n)) this.go(id);
  }

  /* ------------------------------ story ------------------------------ */

  private storyErrands(): void {
    const s = this.state;
    if (s.day < 14 || s.credits < 12000) return;
    // a first look at a place the Grey has touched, then at a dead zone
    if (s.story.stage === 1) {
      const id = this.nearest((x) => (s.threat.grip[x] ?? 0) >= 5 && (s.threat.grip[x] ?? 0) < 100);
      if (id !== null) this.go(id);
    } else if (s.story.stage === 2) {
      const id = this.nearest((x) => (s.threat.grip[x] ?? 0) >= 100);
      if (id !== null) this.go(id);
    }
    // artifacts
    if (
      s.story.stage >= 1 &&
      s.story.artifacts < ARTIFACTS_NEEDED[this.target] &&
      s.day >= 40 &&
      this.artifactTries < 14 &&
      s.day - this.lastArtifact >= 6
    )
      this.grabArtifact();
    // a ready-made dock: some beats happen on dock, so make sure we dock somewhere
    this.dockSomewhere();
  }

  lastArtifact = -99;

  private grabArtifact(): void {
    const s = this.state;
    const g = galaxyOf(s);
    this.lastArtifact = s.day;
    this.artifactTries++;
    const spots = g.systems.flatMap((sys) =>
      sys.bodies.flatMap((b) =>
        b.anomalies
          .filter((a) => a.eventId.startsWith('artifact_') && !bodyDyn(s, b.id).anomaliesDone.includes(a.id))
          .map((a) => ({ sys, b, a })),
      ),
    );
    const here = g.systems[s.location.systemId];
    spots.sort((p, q) => dist(here, p.sys) - dist(here, q.sys));
    for (const sp of spots.slice(0, 3)) {
      if ((s.threat.grip[sp.sys.id] ?? 0) >= 100) continue;
      const path = shortestPath(g, here.id, sp.sys.id);
      if (!path || path.length > 9) continue;
      undock(s);
      if (!this.travelTo(sp.sys.id)) continue;
      // the bot treats the scan as done (it carries the scanners of a real explorer)
      s.detected[sp.sys.id] = sp.sys.bodies.map((x) => x.id);
      bodyDyn(s, sp.b.id).revealed.push(sp.a.id);
      exploreAnomaly(s, sp.b.index, sp.a.id);
      this.autoEvent();
      return;
    }
  }

  /* ------------------------------ base ------------------------------ */

  private tryFoundBase(): void {
    const s = this.state;
    if (this.noBaseSite || s.credits < 32000 || s.day < 8) return;
    const g = galaxyOf(s);
    const here = g.systems[s.location.systemId];
    const cands = g.systems
      .filter((x) => x.bodies.length >= 3 && x.bodies.some((b) => b.deposits.length))
      .filter((x) => {
        const o = ownerOf(s, x.id);
        return (!o || tierOf(repOf(s, o)) !== 'enemy') && (s.threat.grip[x.id] ?? 0) < 20;
      })
      .filter((x) => {
        const o = ownerOf(s, x.id);
        return !o || !['enemy', 'hostile'].includes(tierOf(repOf(s, o))) || s.fac.member === o;
      })
      .map((x) => ({ x, d: dist(here, x) }))
      .sort((a, b) => a.d - b.d);
    for (const c of cands.slice(0, 4)) {
      const p = shortestPath(g, here.id, c.x.id);
      if (!p || p.length > 12) continue;
      undock(s);
      if (!this.travelTo(c.x.id)) continue;
      // buy the founding goods at the market price and carry them in the hold
      const price = 40 * GOODS_BY_ID.construction.basePrice + 12 * GOODS_BY_ID.machinery.basePrice;
      s.credits -= Math.round(price * 1.3);
      this.base_spent += Math.round(price * 1.3);
      const { stats, dims } = analyze(s);
      const q = { chilledCells: stats.chilledCells, secureCells: stats.secureCells };
      addGoods(s.cargo, dims, q, 'construction', 40, 0, s.day);
      addGoods(s.cargo, dims, q, 'machinery', 12, 0, s.day);
      s.detected[c.x.id] = c.x.bodies.map((b) => b.id);
      // a day of scanning reveals what lies in the ground
      for (const b of c.x.bodies) {
        const dyn = bodyDyn(s, b.id);
        for (const d of b.deposits) if (!dyn.revealed.includes(d.id)) dyn.revealed.push(d.id);
      }
      wait(s, 1);
      const rich = c.x.bodies
        .map((b, i) => ({ i, v: b.deposits.reduce((a, d) => a + d.richness, 0) }))
        .sort((a, b) => b.v - a.v)[0];
      const r = foundBase(s, rich.i, `${c.x.name} Base`);
      if (r.ok) {
        this.base_spent += 14000;
        this.baseDay = s.day;
        this.lastVisit = s.day;
        return;
      }
    }
    this.noBaseSite = true;
  }

  /** Buy missing building materials at the market price into the base storage. */
  private supply(mats: Record<string, number>): number {
    const s = this.state;
    const base = s.base!;
    let cost = 0;
    for (const [gid, n] of Object.entries(mats)) {
      const have = base.storage[gid] ?? 0;
      if (have >= n) continue;
      const add = n - have;
      cost += add * GOODS_BY_ID[gid].basePrice * 1.3;
    }
    cost = Math.round(cost);
    if (s.credits - cost < 6000) return -1;
    s.credits -= cost;
    this.base_spent += cost;
    for (const [gid, n] of Object.entries(mats)) {
      const have = base.storage[gid] ?? 0;
      if (have < n) base.storage[gid] = n;
    }
    return cost;
  }

  private visitBase(): void {
    const s = this.state;
    const base = s.base!;
    undock(s);
    if (!this.go(base.systemId)) {
      this.lastVisit = s.day;
      return;
    }
    this.lastVisit = s.day;
    refuelAtBase(s);
    resupplyAtBase(s);
    if (base.attack) defendBase(s);
    this.autoEvent();
    collectTreasury(s);
    this.pickResearch();
    // buildings: the first affordable steps of the plan
    let started = 0;
    const plan = BUILD_PLANS[this.target];
    for (let i = 0; i < plan.length; i++) {
      const id = plan[i];
      if (started >= 3) break;
      // the plan lists a building once per level: the n-th entry is level n
      const wanted = plan.slice(0, i + 1).filter((x) => x === id).length;
      if (levelOf(base, id) + (base.queue.some((q) => q.id === id) ? 1 : 0) >= wanted) continue;
      const def = BUILDINGS_BY_ID[id];
      let chk = checkBuilding(s, id);
      if (!chk.ok && chk.error === 'err.baseMaterials') {
        // only buy the materials when the whole building is affordable
        const mats = Object.entries(chk.materials).reduce(
          (sum, [gid, n]) =>
            sum + Math.max(0, n - (base.storage[gid] ?? 0)) * GOODS_BY_ID[gid].basePrice * 1.3,
          0,
        );
        if (s.credits - chk.credits - mats < 5000) continue;
        const paid = this.supply(chk.materials);
        if (paid >= 0) chk = checkBuilding(s, id);
      }
      if (!chk.ok) continue;
      if (s.credits - chk.credits < 5000) continue;
      if (startBuilding(s, id).ok) {
        this.base_spent += chk.credits;
        started++;
      }
      void def;
    }
    this.setupProduction();
    this.fleet();
    // the bot's own ship is serviced elsewhere; here it only passes by
    void hangarSlots;
  }

  private setupProduction(): void {
    const s = this.state;
    const base = s.base!;
    if (levelOf(base, 'mine') > 0 && levelOf(base, 'refinery') + levelOf(base, 'factory') > 0) {
      const mined = new Set(mineOutput(s).map((m) => m.goodId));
      const options = producibleGoods(base)
        .filter((gid) =>
          Object.keys(GOODS_BY_ID[gid].inputs!).every(
            (i) => mined.has(i) || GOODS_BY_ID[i].category === 'industry' || i in base.storage,
          ),
        )
        .sort((a, b) => GOODS_BY_ID[b].basePrice - GOODS_BY_ID[a].basePrice);
      for (const gid of options.slice(0, maxLines(base))) setLine(s, gid, true, 0);
    }
    if (levelOf(base, 'port') > 0) {
      const keep = new Set(['construction', 'machinery', 'electronics', 'alloys', 'computers']);
      const goods = new Set<string>([
        ...Object.keys(base.storage),
        ...mineOutput(s).map((m) => m.goodId),
        ...base.lines.map((l) => l.goodId),
      ]);
      for (const gid of goods) setAutoSell(s, gid, keep.has(gid) ? 150 : 0);
    }
  }

  private fleet(): void {
    const s = this.state;
    const base = s.base!;
    if (levelOf(base, 'shipyard') < 1 || levelOf(base, 'hangar') < 1) return;
    // a ship for every hangar place (an ark is built only when exodus is the goal)
    const want: string[] = [];
    if (
      this.target === 'exodus' &&
      hasTech(s, 'exodus_drive') &&
      !base.hangar.some((f) => f.ship.hullId === 'ark')
    )
      want.push('ark');
    want.push('mule');
    for (const hull of want) {
      const chk = checkHullOrder(s, hull);
      if (!chk.ok && chk.error === 'err.baseMaterials') {
        // buy exactly the materials of the order (when affordable), then commission
        const mats = Object.entries(chk.materials).reduce(
          (sum, [gid, n]) =>
            sum + Math.max(0, n - (base.storage[gid] ?? 0)) * GOODS_BY_ID[gid].basePrice * 1.3,
          0,
        );
        if (s.credits - chk.credits - mats < 5000) continue;
        if (this.supply(chk.materials) >= 0) {
          const r = commissionHull(s, hull);
          if (r.ok) this.base_spent += chk.credits;
        }
      } else if (chk.ok) {
        const r = commissionHull(s, hull);
        if (r.ok) this.base_spent += chk.credits;
      }
    }
    // routes
    const g = galaxyOf(s);
    const here = g.systems[base.systemId];
    const stations = g.systems
      .filter((x) => dist(here, x) < 26 && (s.threat.grip[x.id] ?? 0) < 50)
      .flatMap((x) => x.stations)
      .filter((st) => st.type !== 'pirate')
      .slice(0, 14);
    for (const fs of base.hangar) {
      if (fs.trip || fs.order === 'trade') continue;
      let best: { from: string; to: string; net: number } | null = null;
      for (const a of stations)
        for (const b of stations) {
          if (a.id === b.id || a.systemId === b.systemId) continue;
          const p = planTrip(s, fs, { from: a.id, to: b.id, goodId: null }, Math.max(0, base.treasury));
          if (p.ok && p.net > 0 && (!best || p.net > best.net)) best = { from: a.id, to: b.id, net: p.net };
        }
      if (best) setFleetOrder(s, fs.id, 'trade', { from: best.from, to: best.to, goodId: null });
      else setFleetOrder(s, fs.id, 'guard');
    }
  }

  private pickResearch(): void {
    const s = this.state;
    if (s.research.active) return;
    for (const id of RESEARCH_PLAN[this.target]) {
      if (hasTech(s, id)) continue;
      if (canResearch(s, id)) {
        startResearch(s, id);
        return;
      }
    }
    const any = TECHS.find((t) => canResearch(s, t.id));
    if (any) startResearch(s, any.id);
  }

  /* ------------------------------ faction ------------------------------ */

  private factionTasks(): void {
    const s = this.state;
    if (this.target === 'dominion' && !s.fac.member && repOf(s, 'consortium') >= 15)
      joinFaction(s, 'consortium');
    // research also without a base: points from discoveries
    if (!s.base) this.pickResearch();
  }

  /* ------------------------------ the finale ------------------------------ */

  private finale(): void {
    const s = this.state;
    if (s.story.stage < 5 || s.ending) return;
    const g = galaxyOf(s);
    switch (this.target) {
      case 'science':
        if (s.base && levelOf(s.base, 'anchor') >= 1 && hasTech(s, 'grey_decode') && s.story.artifacts >= 3)
          this.reenter(s.base.systemId);
        break;
      case 'accord':
        if (hasTech(s, 'accord_protocol') && understanding(s) >= 0.85 && s.story.artifacts >= 2) {
          const id = this.nearest((x) => (s.threat.grip[x] ?? 0) >= 30 && (s.threat.grip[x] ?? 0) < 100);
          if (id !== null) this.reenter(id);
        }
        break;
      case 'exodus':
        if (
          s.base &&
          hasTech(s, 'exodus_drive') &&
          s.base.hangar.some((f) => f.ship.hullId === 'ark') &&
          s.base.hangar.length >= 3
        ) {
          // the ark must be the active ship's equal: the end only needs it in the hangar, but the story wants the player there
          this.reenter(s.base.systemId);
        }
        break;
      case 'dominion':
        if (
          s.fac.member === 'consortium' &&
          s.fac.rank >= 5 &&
          s.credits >= 150000 &&
          s.base &&
          levelOf(s.base, 'port') >= 3
        ) {
          const st = g.systems
            .flatMap((x) => x.stations)
            .find((x) => ownerOf(s, x.systemId) === 'consortium' && x.type !== 'pirate');
          if (st) {
            undock(s);
            if (this.travelTo(st.systemId)) {
              dockAt(s, st.id);
              this.autoEvent();
            }
          }
        }
        break;
    }
  }

  /* ------------------------------ result ------------------------------ */

  result(): EndgameRun {
    const s = this.state;
    const b = s.base;
    return {
      strategy: this.strategy,
      seed: s.seed,
      risk: s.difficulty.risk,
      prices: s.difficulty.prices,
      target: this.target,
      ending: s.ending?.id ?? null,
      endDay: Math.round(s.ending?.day ?? s.day),
      dead: s.dead,
      baseDay: this.baseDay,
      story5Day: this.story5Day,
      passiveMid: this.passiveMid,
      passiveEnd: (() => {
        if (!b) return 0;
        const dw = netWorth(s) - this.startWorthAtBase + this.base_spent;
        return dw > 0 ? Math.max(0, Math.min(1, this.passive() / dw)) : 0;
      })(),
      consumedEnd: Math.round((s.threat.consumed / s.galaxySize) * 100),
      techs: s.research.done.length,
      fleet: b?.hangar.length ?? 0,
      credits: Math.round(s.credits),
      worth: Math.round(netWorth(s)),
      language: Math.round(understanding(s) * 100),
      artifacts: s.story.artifacts,
      attacks: b?.stats.attacks ?? 0,
      repelled: b?.stats.repelled ?? 0,
      dailyIncome: Math.round(netWorth(s) / Math.max(1, s.day)),
    };
  }
}

export interface PlayOptions {
  risk?: 'low' | 'normal' | 'high';
  prices?: 'easy' | 'normal' | 'hard';
  maxDays?: number;
  /** Extra credits per day: models a player who earns more than the bots (reported as such). */
  incomeBoost?: number;
}

/** Play one whole game with a strategy until an ending, death or the day limit. */
export function playGame(seed: string, strategy: Strategy, opts: PlayOptions = {}): EndgameRun {
  const state = newGame({
    seed,
    difficulty: { risk: opts.risk ?? 'normal', prices: opts.prices ?? 'normal' },
  });
  const bot = new EndgameBot(state, strategy);
  bot.startWorthAtBase = netWorth(state);
  const max = opts.maxDays ?? 650;
  let guard = 0;
  while (state.day < max && !state.ending && !state.dead && guard++ < 400) {
    const d0 = state.day;
    // ordinary trading for a while, then a management session (base, research, story errands)
    bot.play(Math.min(14, max - state.day));
    bot.manage();
    if (state.day === d0) wait(state, 1);
    if (opts.incomeBoost) state.credits += opts.incomeBoost * (state.day - d0);
  }
  return bot.result();
}
