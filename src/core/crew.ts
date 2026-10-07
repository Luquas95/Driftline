import {
  OFFICERS,
  OFFICERS_BY_ID,
  RACES,
  RACES_BY_ID,
  ROLES,
  ROLE_SKILL,
  SKILLS,
  crewName,
  type OfficerId,
  type RaceId,
  type Role,
  type Skill,
} from '../content/crew';
import { HULLS_BY_ID } from '../content/hulls';
import { EVENTS_BY_ID } from '../content/events';
import { Rng } from './rng';
import { analyze, fail, galaxyOf, msg, newUid, ok, stationOf, type Result } from './state';
import type { CrewMember, GameState, Recruit, StationStatic } from './types';

import { crewHasOfficer } from './crewBase';

export { crewSupplyPerDay, crewHasOfficer, SUPPLY_PER_CREW_DAY } from './crewBase';

export function maxHp(c: Pick<CrewMember, 'race'>): number {
  return Math.round(100 * RACES_BY_ID[c.race].hp);
}

export function mainSkill(c: Pick<CrewMember, 'role' | 'skills'>): number {
  return c.skills[ROLE_SKILL[c.role]];
}

export function wageOf(c: Pick<CrewMember, 'role' | 'skills' | 'officer'>): number {
  const mult = c.officer ? OFFICERS_BY_ID[c.officer].wageMult : 1;
  return Math.round((4 + 3 * mainSkill(c)) * mult);
}

/** Builds a crew member from a deterministic RNG. `level` is the main-skill level (0..10). */
export function makeCrew(
  rng: Rng,
  id: string,
  opts: { role?: Role; race?: RaceId; level: number; day: number; officer?: OfficerId },
): CrewMember {
  const off = opts.officer ? OFFICERS_BY_ID[opts.officer] : null;
  const role = off?.role ?? opts.role ?? rng.pick(ROLES);
  const race = off?.race ?? opts.race ?? rng.pick(RACES).id;
  const def = RACES_BY_ID[race];
  const skills = Object.fromEntries(
    SKILLS.map((s) => [s, Math.round(rng.range(0, 1.2) * 10) / 10]),
  ) as Record<Skill, number>;
  const main = ROLE_SKILL[role];
  skills[main] = Math.min(
    10,
    Math.round((opts.level + (def.affinity === main ? 1 : 0) + rng.range(-0.4, 0.4)) * 10) / 10,
  );
  if (off) skills[main] = Math.max(skills[main], 6 + rng.range(0, 1.5));
  const c: CrewMember = {
    id,
    name: off?.name ?? crewName((n) => rng.int(0, n - 1)),
    race,
    role,
    skills,
    hp: 0,
    fatigue: 0,
    morale: 70,
    wage: 0,
    officer: opts.officer,
    look: off?.portrait ?? rng.nextU32() % 100000,
    hired: opts.day,
  };
  c.hp = maxHp(c);
  c.wage = wageOf(c);
  return c;
}

/** Default crew for a hull (new games and v1 save migration): pilot, engineer, gunner, medic in that order. */
export function defaultCrew(seed: string, hullId: string, day: number, nextId: () => string): CrewMember[] {
  const rng = Rng.fromSeed(`${seed}:crew0`);
  const n = HULLS_BY_ID[hullId]?.crew ?? 2;
  const roles: Role[] = ['pilot', 'engineer', 'gunner', 'medic'];
  return Array.from({ length: n }, (_, i) =>
    makeCrew(rng, nextId(), { role: roles[i % roles.length], level: 2 + rng.range(0, 0.6), day }),
  );
}

/** Best skill on board for a skill (officers count for more because their level is high). */
export function bestSkill(state: Pick<GameState, 'crew'>, skill: Skill): number {
  let best = 0;
  for (const c of state.crew) best = Math.max(best, c.skills[skill] * (c.morale < 20 ? 0.7 : 1));
  return best;
}

export function gainXp(c: Pick<CrewMember, 'skills'>, skill: Skill, amount: number): void {
  const cur = c.skills[skill];
  c.skills[skill] = Math.min(10, cur + amount / (1 + cur * 0.9));
}

/** Soft crew limit: base cabins of the hull plus the beds of quarters modules. */
export function crewCapacity(state: GameState): number {
  const { stats } = analyze(state);
  return stats.crew + stats.beds;
}

/** Beds taken by crew above the hull's own cabins (passengers can only use the rest). */
export function bedsUsedByCrew(state: GameState): number {
  const base = HULLS_BY_ID[state.ship.hullId].crew;
  return Math.max(0, state.crew.length - base);
}

/** Trading modifiers from the crew: smaller fees and less price impact. */
export function tradeBonus(state: Pick<GameState, 'crew'>): { feeMult: number; impact: number } {
  const trade = bestSkill(state, 'trade');
  const social = state.crew
    .filter((c) => c.role === 'trader')
    .reduce((m, c) => Math.max(m, RACES_BY_ID[c.race].social), 1);
  return {
    feeMult: Math.max(0.65, 1 - 0.025 * trade * social),
    impact: crewHasOfficer(state, 'haggler') ? 0.85 : 1,
  };
}

/* ------------------------------- hiring ------------------------------- */

export function recruitEpoch(day: number): number {
  return Math.floor(day / 7);
}

const RACE_WEIGHT: Record<string, Record<RaceId, number>> = {
  core: { orrin: 2, sylk: 3, brakh: 2, tessari: 4, nyxul: 1, veth: 2 },
  inner: { orrin: 2, sylk: 3, brakh: 2, tessari: 3, nyxul: 2, veth: 3 },
  outer: { orrin: 3, sylk: 2, brakh: 3, tessari: 1, nyxul: 3, veth: 2 },
  rim: { orrin: 3, sylk: 1, brakh: 4, tessari: 1, nyxul: 4, veth: 2 },
};

export function refreshRecruits(state: GameState, st: StationStatic): Recruit[] {
  const dyn = state.stations[st.id];
  const epoch = recruitEpoch(state.day);
  if (dyn.recruits?.epoch === epoch) return dyn.recruits.list;
  const g = galaxyOf(state);
  const region = g.systems[st.systemId].region;
  const rng = Rng.fromSeed(`${state.seed}:recruits:${st.id}:${epoch}`);
  const n = (st.size === 'small' ? 2 : st.size === 'medium' ? 3 : 5) + rng.int(0, 1);
  const rep = dyn.rep;
  const list: Recruit[] = [];
  for (let i = 0; i < n; i++) {
    const race = rng.weighted(RACES, (r) => RACE_WEIGHT[region][r.id]).id;
    const level = Math.max(
      0.5,
      Math.min(
        7.5,
        1.5 +
          rng.range(0, 3) +
          Math.max(-1, Math.min(1.5, rep * 0.15)) +
          (st.type === 'trade_hub' || st.type === 'scientific' ? 0.7 : 0),
      ),
    );
    const c = makeCrew(rng, `r${epoch}-${st.id}-${i}`, { race, level, day: state.day });
    const { hp: _hp, fatigue: _f, morale: _m, ...rest } = c;
    void _hp;
    void _f;
    void _m;
    list.push({ ...rest, fee: c.wage * 5 });
  }
  // officers are rare and appear at most once per game, more readily with good reputation
  const free = OFFICERS.filter((o) => !state.officersMet.includes(o.id));
  if (free.length && rng.chance(0.05 + Math.max(0, rep) * 0.01) && (st.size !== 'small' || rng.chance(0.4))) {
    const o = rng.pick(free);
    const c = makeCrew(rng, `r${epoch}-${st.id}-o`, { level: 6, day: state.day, officer: o.id });
    const { hp: _hp, fatigue: _f, morale: _m, ...rest } = c;
    void _hp;
    void _f;
    void _m;
    list.push({ ...rest, fee: c.wage * 8 });
  }
  dyn.recruits = { epoch, list };
  return list;
}

export function hireCrew(state: GameState, stationId: string, recruitId: string): Result {
  if (state.location.stationId !== stationId) return fail('err.notDocked');
  const st = stationOf(state, stationId);
  const list = refreshRecruits(state, st);
  const r = list.find((x) => x.id === recruitId);
  if (!r) return fail('err.itemGone');
  if (state.credits < r.fee) return fail('err.noCredits');
  if (state.crew.length >= crewCapacity(state) + 3) return fail('err.crewFull');
  const { fee, ...rest } = r;
  const c: CrewMember = { ...rest, id: newUid(state, 'w'), hp: maxHp(rest), fatigue: 0, morale: 70 };
  state.credits -= fee;
  state.crew.push(c);
  state.stations[stationId].recruits!.list = list.filter((x) => x.id !== recruitId);
  msg(state, 'msg.hired', { name: c.name }, 'good');
  if (c.officer) {
    state.officersMet.push(c.officer);
    const ev = OFFICERS_BY_ID[c.officer].eventId;
    if (EVENTS_BY_ID[ev] && !state.pendingEvent)
      state.pendingEvent = { eventId: ev, context: { systemId: state.location.systemId } };
  }
  return ok();
}

export function dismissCrew(state: GameState, id: string): Result {
  if (!state.location.stationId) return fail('err.mustBeDocked');
  if (state.crew.length <= 1) return fail('err.lastCrew');
  const i = state.crew.findIndex((c) => c.id === id);
  if (i < 0) return fail('err.itemGone');
  const [c] = state.crew.splice(i, 1);
  msg(state, 'msg.dismissed', { name: c.name }, 'info');
  return ok();
}

/* --------------------------- daily upkeep --------------------------- */

/**
 * Wages, hunger, morale, fatigue and healing for `days` elapsed days. Low morale makes people leave
 * (while docked) or turns into a mutiny event (at sea).
 */
export function crewDaily(state: GameState, days: number, rng: Rng): void {
  if (!state.crew.length) return;
  const docked = !!state.location.stationId;
  const wage = state.crew.reduce((s, c) => s + c.wage, 0) * days;
  state.wagesDue += wage;
  const owed = state.wagesDue;
  let paid = false;
  if (state.credits >= owed) {
    state.credits -= owed;
    state.wagesDue = 0;
    paid = true;
  } else if (state.credits > 0 && docked) {
    state.wagesDue -= state.credits;
    state.credits = 0;
  }
  const hungry = state.ship.supplies <= 0;
  const cap = crewCapacity(state);
  const over = Math.max(0, state.crew.length - cap);
  const hasTaskmaster = crewHasOfficer(state, 'taskmaster');
  const leave: CrewMember[] = [];
  for (const c of state.crew) {
    let d = 0.4;
    if (!paid) d -= 3.2;
    if (state.wagesDue > c.wage * 6) d -= 2;
    if (hungry) d -= 5;
    d -= over * 1.2;
    if (hasTaskmaster) d += 1.2;
    if (c.fatigue > 70) d -= 1;
    c.morale = Math.max(0, Math.min(100, c.morale + d * days));
    c.fatigue = Math.max(0, c.fatigue - (docked ? 25 : 6) * days);
    const medic = bestSkill(state, 'medicine');
    c.hp = Math.min(maxHp(c), c.hp + (docked ? 6 : 2) * (1 + medic * 0.15) * days);
    if (c.morale < 15 && !c.officer && docked && rng.chance(Math.min(0.9, 0.25 * days))) leave.push(c);
  }
  for (const c of leave) {
    state.crew.splice(state.crew.indexOf(c), 1);
    msg(state, 'msg.crewLeft', { name: c.name }, 'bad');
  }
  if (
    state.crew.length &&
    !docked &&
    !state.pendingEvent &&
    state.crew.some((c) => c.morale < 8) &&
    rng.chance(Math.min(0.8, 0.3 * days)) &&
    EVENTS_BY_ID['mutiny']
  ) {
    state.pendingEvent = { eventId: 'mutiny', context: { systemId: state.location.systemId } };
  }
}

export function crewLabel(c: CrewMember): string {
  return `${c.name}`;
}
