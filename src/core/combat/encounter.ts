import { ENEMIES, ENEMIES_BY_ID, TIER_HULL, TIER_QUALITY, type EnemyDef } from '../../content/enemies';
import { RACES, RACES_BY_ID } from '../../content/crew';
import { GOODS_BY_ID } from '../../content/goods';
import { HULLS_BY_ID } from '../../content/hulls';
import { unitsOf } from '../cargo';
import { bestSkill, crewHasOfficer, tradeBonus } from '../crew';
import { Rng } from '../rng';
import { buildStarterShip, hullSlots, moduleFits, newModule } from '../ship';
import { analyze, fail, galaxyOf, ok, withRng, type Result } from '../state';
import { T, riskFactor } from '../tuning';
import type { GameState, Ship } from '../types';
import { buildCombatShip, crewToCombat, placeCrew } from './build';
import { chooseRoom } from './ai';
import { MODULES_BY_ID } from '../../content/modules';
import type { CCrew, CShip, CombatState, Encounter, EncounterKind, EncounterOption } from './types';
import { stepCombat, DT } from './sim';

/* ------------------------------ enemies ------------------------------ */

export function buildEnemyShip(def: EnemyDef, tier: number, rng: Rng, index: number, risk = 1): CShip {
  let n = 0;
  const ship: Ship = buildStarterShip(def.hullId, `${def.id}`, () => `e${++n}`);
  const q = TIER_QUALITY[tier] ?? 'C';
  const slots = hullSlots(def.hullId);
  ship.slots.forEach((m, i) => {
    if (m) {
      m.quality = q;
      void i;
    }
  });
  // weaker tiers carry fewer modules: tier 3 the full loadout, tier 2 one less, tier 1 two less (at least two)
  const loadout = def.loadout.slice(
    0,
    Math.max(Math.min(2, def.loadout.length), def.loadout.length - (3 - tier)),
  );
  let li = 0;
  for (const sl of slots) {
    if (sl.core || li >= loadout.length) continue;
    const mod = MODULES_BY_ID[loadout[li]];
    if (mod && moduleFits(sl, mod)) {
      ship.slots[sl.index] = newModule(mod.id, q, `e${++n}`);
      li++;
    }
  }
  const hull = HULLS_BY_ID[def.hullId];
  ship.hp = Math.round(hull.hp * (TIER_HULL[tier] ?? 1) * (1 + (risk - 1) * 0.25));
  const crew: CCrew[] = [];
  for (let i = 0; i < def.crew; i++) {
    const race = rng.pick(RACES).id;
    const level = 1.2 + tier * 1.1 + rng.range(-0.4, 0.5) + (risk - 1) * 1.2;
    const role = (['pilot', 'engineer', 'gunner', 'gunner', 'medic'] as const)[i % 5];
    const skills = { piloting: 0.5, engineering: 0.8, gunnery: 0.8, medicine: 0.5, trade: 0, science: 0 };
    const key =
      role === 'pilot'
        ? 'piloting'
        : role === 'engineer'
          ? 'engineering'
          : role === 'gunner'
            ? 'gunnery'
            : 'medicine';
    skills[key] = Math.min(9, level + (RACES_BY_ID[race].affinity === key ? 1 : 0));
    crew.push({
      id: `e${index}c${i}`,
      name: `${def.id}-${i + 1}`,
      race,
      role,
      skills,
      hp: 100 * RACES_BY_ID[race].hp,
      maxHp: 100 * RACES_BY_ID[race].hp,
      room: 0,
      path: [],
      stepT: 0,
      post: null,
      task: 'idle',
      look: rng.nextU32() % 100000,
      stateIndex: -1,
      xp: {},
      boardedOn: -1,
    });
  }
  const cs = buildCombatShip({
    side: 'enemy',
    index,
    name: def.id,
    ship,
    crew,
    personality: def.personality,
    lootId: def.id,
    missiles: 6 + tier * 3,
  });
  placeCrew(cs);
  for (const m of cs.crew) m.post = null;
  return cs;
}

/* ------------------------------ starting a fight ------------------------------ */

export function startCombat(state: GameState, enc: Encounter, extra?: { surprise?: boolean }): CombatState {
  const rng = Rng.fromSeed(`${state.seed}:fight:${state.stats.fights}:${Math.floor(state.day * 10)}`);
  const crew = state.crew.map((m, i) => crewToCombat(m, i, 0));
  const analysis = analyze(state);
  const cargoMissiles = unitsOf(state.cargo, 'missiles');
  const player = buildCombatShip({
    side: 'player',
    index: 0,
    name: state.ship.name,
    ship: state.ship,
    crew,
    personality: 'aggressive',
    missiles: cargoMissiles,
    cargoMass: 0,
    freeFlee: crewHasOfficer(state, 'ghost') && !state.flags['ghostUsed'],
  });
  void analysis;
  placeCrew(player);
  const enemies = enc.enemyDefs.map((id, i) =>
    buildEnemyShip(ENEMIES_BY_ID[id], enc.tier, rng, i, riskFactor(state.difficulty.risk)),
  );
  const c: CombatState = {
    v: 1,
    seed: `${state.seed}:f${state.stats.fights}`,
    rng: rng.fork('combat').getState(),
    time: 0,
    nextId: 1,
    paused: false,
    auto: false,
    player,
    enemies,
    projectiles: [],
    events: [],
    log: [],
    outcome: null,
    kind: enc.kind,
    enemyDefs: enc.enemyDefs,
    demand: null,
    difficultyRisk: riskFactor(state.difficulty.risk),
    tier: enc.tier,
    systemId: enc.systemId,
  };
  if (extra?.surprise) player.shield = 0;
  // default targets: every weapon starts on the first enemy's most valuable room
  const r2 = Rng.fromSeed(`${c.seed}:t`);
  for (const w of player.weapons)
    if (w.kind !== 'drones' && w.kind !== 'teleporter')
      w.target = { ship: 0, room: chooseRoom(r2, w.kind, enemies[0]) };
  state.combat = c;
  state.encounter = null;
  state.stats.fights++;
  return c;
}

/* ------------------------------ encounters ------------------------------ */

/** The player counts as wanted for 30 days after attacking customs, or while reputation at home is very low. */
export function isWanted(state: GameState): boolean {
  const w = state.flags['wanted'];
  return (
    (typeof w === 'number' && w > 0 && state.day - w < 30) || (state.stations[state.home]?.rep ?? 0) <= -4
  );
}

/**
 * Encounter chance for a jump. `days` is the travel time: short hops are proportionally safer, and a recent
 * encounter makes the next days quiet (no farming of fights by hopping around).
 */
export function threatLevel(state: GameState, systemId: number, days = 3): number {
  const g = galaxyOf(state);
  const sys = g.systems[systemId];
  const cargoValue = state.cargo.reduce((s, i) => s + i.qty * (GOODS_BY_ID[i.goodId]?.basePrice ?? 0), 0);
  const hasIllegal = state.cargo.some(
    (c) => GOODS_BY_ID[c.goodId]?.tags.includes('illegal') && !c.contractId,
  );
  const wanted = isWanted(state);
  let p =
    T.encounter.base *
    (0.35 + sys.danger * 1.3) *
    riskFactor(state.difficulty.risk) *
    (1 + Math.min(1, cargoValue / 6000));
  if (state.day < 4) p *= 0.25;
  p *= Math.max(0.3, Math.min(1.5, days / 3));
  const last = state.flags['lastEncounter'];
  if (typeof last === 'number' && state.day - last < 3) p *= 0.3;
  if (hasIllegal && sys.region !== 'rim') p += 0.03;
  if (wanted) p += 0.05;
  return Math.min(0.5, p);
}

export type ThreatBand = 'low' | 'mid' | 'high';

export function threatBand(p: number): ThreatBand {
  return p < 0.06 ? 'low' : p < 0.14 ? 'mid' : 'high';
}

/** Chance of at least one encounter when travelling the given system path (the start is excluded). */
export function routeThreat(state: GameState, path: number[]): number {
  let ok = 1;
  for (const id of path.slice(1)) ok *= 1 - threatLevel(state, id);
  return 1 - ok;
}

function pickEnemy(rng: Rng, kind: EncounterKind, region: string, tier: number): EnemyDef | null {
  const pool = ENEMIES.filter((e) => e.kind === kind && tier >= e.tiers[0] && tier <= e.tiers[1]);
  if (!pool.length) return null;
  return rng.weighted(pool, (e) => e.weight[region as 'core'] || 0.001);
}

export function makeEncounter(
  state: GameState,
  kind: EncounterKind,
  systemId: number,
  rng: Rng,
  tierOverride?: number,
): Encounter | null {
  const g = galaxyOf(state);
  const sys = g.systems[systemId];
  let tier =
    tierOverride ??
    1 +
      (sys.danger > 0.35 ? 1 : 0) +
      (sys.danger > 0.62 ? 1 : 0) +
      (rng.chance(0.2) ? 1 : 0) -
      (rng.chance(0.25) ? 1 : 0);
  tier = Math.max(1, Math.min(3, tier));
  const def = pickEnemy(rng, kind, sys.region, tier);
  if (!def) return null;
  const defs = [def.id];
  if (kind === 'pirate' && tier >= 2 && rng.chance(0.22))
    defs.push(pickEnemy(rng, 'pirate', sys.region, Math.max(1, tier - 1))!.id);
  const cargoValue = state.cargo.reduce((s, i) => s + i.qty * (GOODS_BY_ID[i.goodId]?.basePrice ?? 0), 0);
  const trade = tradeBonus(state);
  const pilot = bestSkill(state, 'piloting');
  const social = Math.max(
    0.6,
    ...state.crew.filter((c) => c.role === 'trader').map((c) => RACES_BY_ID[c.race].social),
  );
  const options: EncounterOption[] = [{ id: 'fight' }];
  const canFlee = analyze(state).stats.jumpEff > 0;
  if (canFlee)
    options.push({
      id: 'flee',
      chance: Math.min(0.9, 0.42 + 0.06 * pilot + (def.personality === 'turret' ? 0.4 : 0)),
    });
  if (kind === 'pirate' || kind === 'hunter') {
    const toll = Math.max(
      60,
      Math.round(Math.min(state.credits * 0.35, 80 + cargoValue * 0.1) * trade.feeMult),
    );
    options.push({ id: 'bribe', cost: toll, chance: def.personality === 'greedy' ? 0.9 : 0.7 });
    options.push({
      id: 'negotiate',
      chance: Math.min(0.7, 0.12 + 0.05 * bestSkill(state, 'trade') * social),
    });
  }
  if (kind === 'customs') {
    const illegal = state.cargo.some((c) => GOODS_BY_ID[c.goodId]?.tags.includes('illegal') && !c.contractId);
    options.push({ id: 'pay', cost: illegal ? 300 : 0, chance: 1 });
    options.push({ id: 'bribe', cost: 200 + Math.round(cargoValue * 0.06), chance: 0.5 });
  }
  if (kind === 'wreck' || kind === 'fauna')
    options.push({ id: 'evade', chance: Math.min(0.85, 0.35 + 0.07 * pilot) });
  return {
    kind,
    enemyDefs: defs,
    tier,
    systemId,
    options,
    textKey: `enc.${kind}`,
    params: { ship: defs[0], tier },
  };
}

/** Roll for a random encounter after a jump. Sets `state.encounter` when one happens. */
export function rollEncounter(state: GameState, systemId: number, days = 3): boolean {
  if (state.encounter || state.combat || state.pendingEvent) return false;
  const p = threatLevel(state, systemId, days);
  return withRng(state, (rng) => {
    if (!rng.chance(p)) return false;
    const g = galaxyOf(state);
    const sys = g.systems[systemId];
    const hasIllegal = state.cargo.some(
      (c) => GOODS_BY_ID[c.goodId]?.tags.includes('illegal') && !c.contractId,
    );
    const wanted = isWanted(state);
    const weights: [EncounterKind, number][] = [
      ['pirate', 3],
      ['fauna', sys.region === 'rim' || sys.region === 'outer' ? 1.2 : 0.2],
      ['customs', hasIllegal ? 3 : sys.region === 'core' || sys.region === 'inner' ? 0.6 : 0],
      ['hunter', wanted ? 4 : 0.3],
    ];
    const kind = rng.weighted(weights, (w) => w[1])[0];
    const enc = makeEncounter(state, kind, systemId, rng);
    if (!enc) return false;
    state.encounter = enc;
    state.flags['lastEncounter'] = state.day;
    return true;
  });
}

/* ------------------------------ encounter choices ------------------------------ */

export function chooseEncounterOption(
  state: GameState,
  option: EncounterOption['id'],
): Result<{ fight: boolean; text: string }> {
  const enc = state.encounter;
  if (!enc) return fail('err.noEncounter');
  const opt = enc.options.find((o) => o.id === option);
  if (!opt) return fail('err.choiceUnavailable');
  if (opt.cost && state.credits < opt.cost) return fail('err.noCredits');
  const roll = withRng(state, (r) => r.next());
  switch (option) {
    case 'fight':
      startCombat(state, enc);
      return ok({ fight: true, text: 'enc.result.fight' });
    case 'flee': {
      const { stats } = analyze(state);
      const cost = Math.max(2, Math.round(stats.fuelCap * 0.1));
      const free = crewHasOfficer(state, 'ghost') && !state.flags['ghostUsed'];
      if (!free) state.ship.fuel = Math.max(0, state.ship.fuel - cost);
      else state.flags['ghostUsed'] = 1;
      if (roll < (opt.chance ?? 0.4)) {
        state.encounter = null;
        state.stats.fled++;
        return ok({ fight: false, text: 'enc.result.fled' });
      }
      startCombat(state, enc, { surprise: true });
      return ok({ fight: true, text: 'enc.result.fleeFailed' });
    }
    case 'bribe':
      state.credits -= opt.cost ?? 0;
      if (roll < (opt.chance ?? 0.5)) {
        state.encounter = null;
        return ok({ fight: false, text: 'enc.result.bribed' });
      }
      startCombat(state, enc);
      return ok({ fight: true, text: 'enc.result.bribeFailed' });
    case 'negotiate':
      if (roll < (opt.chance ?? 0.2)) {
        state.encounter = null;
        const t = state.crew.find((c) => c.role === 'trader');
        if (t) t.skills.trade = Math.min(10, t.skills.trade + 0.15);
        return ok({ fight: false, text: 'enc.result.negotiated' });
      }
      startCombat(state, enc);
      return ok({ fight: true, text: 'enc.result.negotiateFailed' });
    case 'pay': {
      state.credits = Math.max(0, state.credits - (opt.cost ?? 0));
      const before = state.cargo.length;
      state.cargo = state.cargo.filter(
        (c) => !(GOODS_BY_ID[c.goodId]?.tags.includes('illegal') && !c.contractId),
      );
      if (state.cargo.length < before) state.stats.fines++;
      state.encounter = null;
      return ok({ fight: false, text: 'enc.result.paid' });
    }
    case 'evade':
      if (roll < (opt.chance ?? 0.5)) {
        state.encounter = null;
        return ok({ fight: false, text: 'enc.result.evaded' });
      }
      startCombat(state, enc, { surprise: true });
      return ok({ fight: true, text: 'enc.result.evadeFailed' });
  }
}

/** Effect hook for events: start an encounter of a given enemy template. */
export function spawnEncounter(state: GameState, enemyId: string, tier: number): void {
  const def = ENEMIES_BY_ID[enemyId];
  if (!def || state.encounter || state.combat) return;
  const enc = withRng(state, (rng) => makeEncounter(state, def.kind, state.location.systemId, rng, tier));
  if (enc) {
    enc.enemyDefs = [enemyId];
    state.encounter = enc;
  }
}

/** Run the fight to its end with the AI in charge of both ships (auto-combat and balance bots). */
export function autoResolve(c: CombatState): void {
  c.auto = true;
  c.paused = false;
  let guard = 0;
  while (!c.outcome && guard++ < 10000) {
    if (c.demand !== null) {
      // the AI captain pays up only when badly hurt
      const hurt = c.player.hull < c.player.hullMax * 0.4;
      c.demand = hurt ? c.demand : null;
      if (hurt) c.outcome = 'tribute';
      else c.paused = false;
      continue;
    }
    stepCombat(c, DT);
  }
}
