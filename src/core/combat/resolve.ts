import { ENEMIES_BY_ID } from '../../content/enemies';
import { GOODS_BY_ID } from '../../content/goods';
import { MODULES_BY_ID } from '../../content/modules';
import { SKILLS } from '../../content/crew';
import { addGoods, removeGoods, unitsOf } from '../cargo';
import { gainXp, maxHp } from '../crew';
import { Rng } from '../rng';
import { newModule } from '../ship';
import { analyze, destroyShip, msg, newUid } from '../state';
import type { GameState } from '../types';
import { SHIELD_SCALE } from './build';
import type { CShip, CombatOutcome, CombatState } from './types';

export interface CombatSummary {
  outcome: CombatOutcome;
  credits: number;
  goods: { goodId: string; qty: number }[];
  modules: string[];
  fuel: number;
  tribute: number;
  hullLost: number;
  crewLost: string[];
  missilesUsed: number;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Reputation delta (at the nearest station and at home) for destroying a given kind of enemy. */
function repFor(kind: CombatState['kind'], outcome: CombatOutcome): number {
  if (outcome === 'victory' || outcome === 'surrender') {
    if (kind === 'pirate') return 1;
    if (kind === 'hunter') return 0;
    if (kind === 'customs') return -3;
    return 0;
  }
  return 0;
}

/**
 * Applies a finished fight to the persistent state. Always clears `state.combat`.
 * The returned summary feeds the result screen.
 */
export function resolveCombat(state: GameState, c: CombatState): CombatSummary {
  const outcome: CombatOutcome = c.outcome ?? 'fled';
  const p = c.player;
  const sum: CombatSummary = {
    outcome,
    credits: 0,
    goods: [],
    modules: [],
    fuel: 0,
    tribute: 0,
    hullLost: Math.max(0, Math.round(state.ship.hp - p.hull)),
    crewLost: [],
    missilesUsed: 0,
  };
  const lost = !p.alive;
  // consumed ammo
  const used = Math.max(0, unitsOf(state.cargo, 'missiles') - p.missiles);
  if (used > 0) removeGoods(state.cargo, 'missiles', used);
  state.cargo = state.cargo.filter((i) => i.qty > 0);
  sum.missilesUsed = used;

  // crew: hp, xp, deaths (boarders that are still away count as lost)
  const alive = new Map<string, (typeof p.crew)[number]>();
  for (const m of p.crew) if (m.hp > 0) alive.set(m.id, m);
  for (const e of c.enemies) for (const m of e.crew) if (m.boardedOn >= 0 && m.hp > 0) alive.set(m.id, m);
  const survivors = [];
  for (const m of state.crew) {
    const cm = alive.get(m.id);
    if (!cm) {
      sum.crewLost.push(m.name);
      continue;
    }
    m.hp = clamp(Math.round(cm.hp), 1, maxHp(m));
    m.fatigue = Math.min(100, m.fatigue + 12);
    for (const sk of SKILLS) {
      const x = cm.xp[sk];
      if (x) gainXp(m, sk, x);
    }
    if (outcome === 'victory' || outcome === 'surrender') m.morale = Math.min(100, m.morale + 6);
    else if (lost) m.morale = Math.max(0, m.morale - 12);
    else m.morale = Math.max(0, m.morale - 2);
    survivors.push(m);
  }
  state.crew = survivors;
  for (const n of sum.crewLost) msg(state, 'msg.crewKilled', { name: n }, 'bad');
  // keep at least one hand on a surviving ship
  if (!lost && state.crew.length === 0) {
    msg(state, 'msg.crewWiped', undefined, 'bad');
  }

  if (lost) {
    state.combat = null;
    state.encounter = null;
    destroyShip(state);
    return sum;
  }

  // ship wear: hull, module condition from rooms
  state.ship.hp = clamp(Math.round(p.hull), 1, analyze(state).stats.hpMax);
  state.ship.shield = Math.min(state.ship.shield, p.shield / SHIELD_SCALE);
  for (const r of p.rooms) {
    const m = state.ship.slots[r.slot];
    if (m) m.condition = clamp(Math.round(r.sys), m.condition > 0 ? 1 : 0, m.condition);
  }

  const rng = Rng.fromSeed(`${c.seed}:loot`);
  if (outcome === 'victory' || outcome === 'surrender') {
    state.stats.victories++;
    for (const [i, e] of c.enemies.entries()) {
      if (e.out !== 'destroyed' && e.out !== 'surrendered') continue;
      const def = ENEMIES_BY_ID[c.enemyDefs[i] ?? e.lootId];
      if (!def) continue;
      const mult = e.out === 'surrendered' ? 1 : 0.85;
      const lootMult = (0.7 + 0.4 * c.tier) * (c.difficultyRisk > 1 ? 1.15 : c.difficultyRisk < 1 ? 0.85 : 1);
      sum.credits += Math.round(rng.range(def.credits[0], def.credits[1]) * mult * lootMult);
      // no hangar in this game: a wreck is dismantled for raw materials
      if (e.out === 'destroyed')
        sum.goods.push({ goodId: 'metals', qty: Math.max(1, Math.round(e.hullMax / 18)) });
      const nGoods = rng.int(1, 2);
      for (let k = 0; k < nGoods; k++) {
        const goodId = rng.pick(def.goods);
        const good = GOODS_BY_ID[goodId];
        if (!good) continue;
        // cargo value, not unit count, keeps loot in line with the trading economy
        const price = Math.max(1, good.basePrice);
        const qty = Math.max(
          1,
          Math.round(rng.range(2, 9) * Math.min(1, 100 / price) * (e.out === 'surrendered' ? 1.3 : 1)),
        );
        sum.goods.push({ goodId, qty });
      }
      sum.fuel += Math.round(rng.range(0, 6));
      // salvage modules from surviving rooms
      for (const r of e.rooms) {
        if (!r.defId || r.sys < 35) continue;
        if (MODULES_BY_ID[r.defId]?.core) continue;
        if (rng.chance(def.moduleChance * (r.sys / 100))) sum.modules.push(r.defId);
      }
      // missiles left in the wreck
      if (e.missiles > 2 && rng.chance(0.5))
        sum.goods.push({ goodId: 'missiles', qty: Math.floor(e.missiles / 2) });
    }
    state.credits += sum.credits;
    const { stats, dims } = analyze(state);
    const quotas = { chilledCells: stats.chilledCells, secureCells: stats.secureCells };
    for (const g of sum.goods) {
      const r = addGoods(state.cargo, dims, quotas, g.goodId, g.qty, 0, state.day, undefined, false);
      if (r.added < g.qty) g.qty = r.added;
    }
    sum.goods = sum.goods.filter((g) => g.qty > 0);
    for (const defId of sum.modules) {
      const qual = rng.chance(0.2) ? 'C' : 'D';
      const inst = newModule(defId, qual, newUid(state, 'm'));
      inst.condition = Math.round(rng.range(35, 70));
      state.inventory.push(inst);
    }
    state.ship.fuel = Math.min(stats.fuelCap, state.ship.fuel + sum.fuel);
    const dRep = repFor(c.kind, outcome);
    if (dRep) {
      const st = state.stations[state.home];
      if (st) st.rep = clamp(st.rep + dRep, -10, 10);
      if (c.kind === 'customs') state.flags['wanted'] = state.day;
    }
    msg(state, 'msg.combat.victory', { credits: sum.credits }, 'good');
  } else if (outcome === 'tribute') {
    const share = c.demand ?? 0.4;
    const items = state.cargo.filter((i) => !i.contractId && i.goodId !== 'missiles');
    for (const it of items) {
      const take = Math.floor(it.qty * share);
      if (take > 0) {
        removeGoods(state.cargo, it.goodId, take);
        sum.tribute += take * (GOODS_BY_ID[it.goodId]?.basePrice ?? 0);
      }
    }
    state.cargo = state.cargo.filter((i) => i.qty > 0);
    // an empty hold does not make the pirates go away for free: they take a floor in credits
    const floor = 120 + 0.08 * state.credits;
    if (sum.tribute < floor) {
      const pay = Math.min(state.credits, Math.round(floor - sum.tribute));
      state.credits -= pay;
      sum.tribute += pay;
    }
    msg(state, 'msg.combat.tribute', { value: Math.round(sum.tribute) }, 'warn');
  } else if (outcome === 'fled') {
    state.stats.fled++;
    const { stats } = analyze(state);
    const cost = p.freeFlee ? 0 : Math.max(2, Math.round(stats.fuelCap * 0.1));
    if (!p.freeFlee) state.ship.fuel = Math.max(0, state.ship.fuel - cost);
    else state.flags['ghostUsed'] = 1;
    msg(state, 'msg.combat.fled', { fuel: cost }, 'info');
  } else if (outcome === 'enemy-fled') {
    msg(state, 'msg.combat.enemyFled', undefined, 'info');
  }
  state.combat = null;
  state.encounter = null;
  return sum;
}

/** Helper for the UI and bots: is a fight the player ship can still win/flee from? */
export function playerShipAlive(c: CombatState): boolean {
  return c.player.alive && !c.player.out;
}

export type { CShip };
