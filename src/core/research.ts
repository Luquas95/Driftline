/** Research: points from the lab, discoveries and artifacts are spent on one technology at a time. */
import { TECHS, TECHS_BY_ID, MODULE_TECH, type TechDef } from '../content/tech';
import { learnWords } from './lang';
import { fail, msg, ok, type Result } from './state';
import { T } from './tuning';
import type { GameState } from './types';

export function hasTech(state: GameState, id: string): boolean {
  return state.research.done.includes(id);
}

export function moduleUnlocked(state: GameState, moduleId: string): boolean {
  const t = MODULE_TECH[moduleId];
  return !t || hasTech(state, t);
}

export function canResearch(state: GameState, id: string): boolean {
  const t = TECHS_BY_ID[id];
  return !!t && !hasTech(state, id) && t.requires.every((r) => hasTech(state, r));
}

/** Technologies that can be started right now. */
export function availableTechs(state: GameState): TechDef[] {
  return TECHS.filter((t) => canResearch(state, t.id));
}

/** Sum of an effect field over the researched technologies. */
export function techBonus(state: GameState, key: 'rp' | 'fleet' | 'defense' | 'mitigation'): number {
  let s = 0;
  for (const id of state.research.done) s += TECHS_BY_ID[id]?.effect?.[key] ?? 0;
  return s;
}

/** Research points per day produced by the lab. */
export function labRate(state: GameState): number {
  const lvl = state.base?.buildings.lab ?? 0;
  if (lvl <= 0) return 0;
  return 1.6 * Math.pow(lvl, 1.1) * (1 + techBonus(state, 'rp'));
}

export function addResearchPoints(state: GameState, n: number): void {
  if (!(n > 0)) return;
  state.research.points += n;
  state.research.totalEarned += n;
}

export function startResearch(state: GameState, id: string): Result {
  if (!TECHS_BY_ID[id]) return fail('err.noTech');
  if (hasTech(state, id)) return fail('err.techDone');
  if (!canResearch(state, id)) return fail('err.techLocked');
  state.research.active = id;
  state.research.progress = 0;
  return ok();
}

function complete(state: GameState, t: TechDef): void {
  state.research.done.push(t.id);
  state.research.active = null;
  state.research.progress = 0;
  const e = t.effect;
  if (e?.mitigation)
    state.threat.mitigation = Math.min(T.threat.mitigationCap, state.threat.mitigation + e.mitigation);
  if (e?.words) learnWords(state, e.words);
  msg(state, 'msg.techDone', { tech: t.id }, 'good');
}

/** Daily research: the lab adds points, the pool feeds the active technology. */
export function researchDaily(state: GameState): void {
  const rs = state.research;
  addResearchPoints(state, labRate(state));
  const t = rs.active ? TECHS_BY_ID[rs.active] : null;
  if (!t) return;
  const need = t.cost - rs.progress;
  const take = Math.min(need, rs.points, Math.max(8, t.cost / 12));
  if (take > 0) {
    rs.points -= take;
    rs.progress += take;
  }
  if (rs.progress >= t.cost - 1e-6) complete(state, t);
}
