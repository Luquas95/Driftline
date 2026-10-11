/**
 * Factions: territory (derived from the galaxy seed, changed by wars), reputation, membership with ranks,
 * and the effects of standing on tariffs and customs. Pure and deterministic.
 */
import { FACTIONS, FACTIONS_BY_ID, RANK_MERIT, relation } from '../content/factions';
import { MARKET_EVENTS } from '../content/marketEvents';
import { Rng } from './rng';
import { fail, galaxyOf, msg, ok, type Result } from './state';
import { clampRep, ownerOf, ownerOfStation, repOf, territoryOf, tierOf } from './territory';
import type { GameState, StationStatic } from './types';
import { FACTION_IDS, type FactionId, type War } from './worldTypes';

export {
  inspectionMult,
  localFaction,
  newFactionState,
  ownerOf,
  ownerOfStation,
  repOf,
  tariffMult,
  territoryOf,
  territorySizes,
  tierOf,
  type StandingTier,
  type Territory,
} from './territory';

/* ----------------------------- reputation ----------------------------- */

/**
 * Change the standing with a faction. Allies and enemies of that faction react by a fraction of the change
 * (a friend of my friend likes me, an enemy of my enemy is pleased). `ripple` = false for scripted changes.
 */
export function addRep(state: GameState, f: FactionId, n: number, ripple = true): void {
  if (!Number.isFinite(n) || n === 0) return;
  const before = tierOf(repOf(state, f));
  state.fac.rep[f] = clampRep(repOf(state, f) + n);
  if (ripple) {
    for (const o of FACTION_IDS) {
      if (o === f) continue;
      const r = relation(f, o);
      const d = n > 0 ? n * r * 0.3 : r > 0 ? n * r * 0.2 : -n * -r * 0.12;
      if (Math.abs(d) >= 0.05) state.fac.rep[o] = clampRep(repOf(state, o) + d);
    }
  }
  const after = tierOf(repOf(state, f));
  if (after !== before) msg(state, 'msg.facTier', { faction: f, tier: after }, n > 0 ? 'good' : 'bad');
}

/* ----------------------------- membership ----------------------------- */

export function rankName(f: FactionId, rank: number): string {
  return `fac.${f}.rank.${Math.max(0, Math.min(5, rank))}`;
}

export function joinFaction(state: GameState, f: FactionId): Result {
  if (state.fac.member === f) return fail('err.alreadyMember');
  if (state.fac.member) return fail('err.hasFaction');
  if (repOf(state, f) < 15) return fail('err.facRepLow');
  state.fac.member = f;
  state.fac.rank = 0;
  state.fac.merit = 0;
  // joining one side is a statement: its enemies resent it
  for (const o of FACTION_IDS) {
    const r = relation(f, o);
    if (o !== f && r < 0) state.fac.rep[o] = clampRep(repOf(state, o) + r * 12);
  }
  state.fac.history.push({ day: state.day, key: 'join', params: { faction: f } });
  msg(state, 'msg.facJoined', { faction: f }, 'good');
  return ok();
}

export function leaveFaction(state: GameState): Result {
  const f = state.fac.member;
  if (!f) return fail('err.noFaction');
  state.fac.member = null;
  state.fac.rank = 0;
  state.fac.merit = 0;
  state.fac.rep[f] = clampRep(repOf(state, f) - 20);
  state.fac.history.push({ day: state.day, key: 'leave', params: { faction: f } });
  msg(state, 'msg.facLeft', { faction: f }, 'warn');
  return ok();
}

export function rankFromMerit(merit: number): number {
  let r = 0;
  for (let i = 1; i < RANK_MERIT.length; i++) if (merit >= RANK_MERIT[i]) r = i;
  return r;
}

/** Merit for faction jobs; promotes the player. Only counts for the faction the player belongs to. */
export function addMerit(state: GameState, f: FactionId, n: number): void {
  if (state.fac.member !== f || n <= 0) return;
  state.fac.merit += n;
  const r = rankFromMerit(state.fac.merit);
  if (r > state.fac.rank) {
    state.fac.rank = r;
    state.fac.history.push({ day: state.day, key: 'rank', params: { faction: f, rank: r } });
    msg(state, 'msg.facRank', { faction: f, rank: r }, 'good');
  }
}

/** Hulls sold only by a faction: standing 40+ in its space, or a rank of 2+ as a member. */
export function exclusiveHullFor(state: GameState, st: StationStatic): string | null {
  const o = ownerOfStation(state, st);
  if (!o) return null;
  const ok2 = state.fac.member === o ? state.fac.rank >= 2 : repOf(state, o) >= 40;
  return ok2 ? FACTIONS_BY_ID[o].exclusiveHull : null;
}

/* -------------------------------- wars -------------------------------- */

export function activeWars(state: GameState): War[] {
  return state.fac.wars.filter((w) => w.end > state.day);
}

export function warBetween(state: GameState, a: FactionId, b: FactionId): War | null {
  return activeWars(state).find((w) => (w.a === a && w.b === b) || (w.a === b && w.b === a)) ?? null;
}

/** True when the system borders a faction its owner is at war with. */
export function isFrontier(state: GameState, systemId: number): boolean {
  const o = ownerOf(state, systemId);
  if (!o) return false;
  const wars = activeWars(state).filter((w) => w.a === o || w.b === o);
  if (!wars.length) return false;
  const g = galaxyOf(state);
  for (const n of g.systems[systemId].neighbors) {
    const no = ownerOf(state, n);
    if (no && wars.some((w) => w.a === no || w.b === no) && no !== o) return true;
  }
  return false;
}

/** Extra danger (0..0.5) from war at a system, used by the encounter model. */
export function warDanger(state: GameState, systemId: number): number {
  if (!activeWars(state).length) return 0;
  return isFrontier(state, systemId) ? 0.45 : 0;
}

const WAR_CHECK_EVERY = 5;
const MAX_WARS = 2;

/** Daily faction simulation: declares wars, moves fronts, flips border systems, signs truces. */
export function factionDaily(state: GameState, day: number): void {
  const fs = state.fac;
  const g = galaxyOf(state);
  // fronts and conquests, every 4 days per war
  for (const w of fs.wars) {
    if (w.end <= day) continue;
    if (day % 4 !== 0) continue;
    const rng = Rng.fromSeed(`${state.seed}:warstep:${w.id}:${day}`);
    w.front = Math.max(-1, Math.min(1, w.front + rng.range(-0.28, 0.28)));
    if (Math.abs(w.front) < 0.35 || !rng.chance(0.55)) continue;
    const winner = w.front > 0 ? w.a : w.b;
    const loser = winner === w.a ? w.b : w.a;
    const cands: number[] = [];
    for (const s of g.systems) {
      if (ownerOf(state, s.id) !== loser) continue;
      if (territoryOf(g).capital[loser] === s.id) continue;
      if (s.neighbors.some((n) => ownerOf(state, n) === winner)) cands.push(s.id);
    }
    if (!cands.length) continue;
    const id = rng.pick(cands);
    fs.owner[id] = winner;
    msg(state, 'msg.facConquered', { system: g.systems[id].name, faction: winner }, 'info');
    fs.history.push({ day, key: 'conquest', params: { system: id, faction: winner } });
  }
  // truces
  for (const w of fs.wars) {
    if (w.end === day) {
      msg(state, 'msg.facTruce', { a: w.a, b: w.b }, 'info');
      fs.history.push({ day, key: 'truce', params: { a: w.a, b: w.b } });
    }
  }
  fs.wars = fs.wars.filter((w) => w.end > day - 60);
  // new wars
  if (day >= fs.nextWarCheck) {
    fs.nextWarCheck = day + WAR_CHECK_EVERY;
    if (activeWars(state).length >= MAX_WARS) return;
    const rng = Rng.fromSeed(`${state.seed}:war:${day}`);
    for (let i = 0; i < FACTIONS.length; i++) {
      for (let j = i + 1; j < FACTIONS.length; j++) {
        const a = FACTIONS[i].id;
        const b = FACTIONS[j].id;
        const r = relation(a, b);
        if (r > -0.3 || warBetween(state, a, b)) continue;
        // rarely: a war a hundred days or so apart per pair at the most hostile
        if (!rng.chance(-r * 0.028)) continue;
        if (fs.wars.some((w) => w.end > day - 25 && ((w.a === a && w.b === b) || (w.a === b && w.b === a))))
          continue;
        const w: War = {
          id: `w${day}${a[0]}${b[0]}`,
          a,
          b,
          start: day,
          end: day + rng.int(40, 110),
          front: rng.range(-0.2, 0.2),
        };
        fs.wars.push(w);
        // the front disturbs trade in the sector where the two borders meet
        const border = g.systems.find(
          (x) => ownerOf(state, x.id) === a && x.neighbors.some((n) => ownerOf(state, n) === b),
        );
        const sector = (border ?? g.systems[territoryOf(g).capital[a]]).sector;
        const mods = MARKET_EVENTS.find((m) => m.kind === 'blockade')!.mods;
        state.events.push({
          id: `war-${w.id}`,
          kind: 'blockade',
          sector,
          start: day,
          end: Math.min(w.end, day + 45),
          mods,
        });
        msg(state, 'msg.facWar', { a, b }, 'warn');
        fs.history.push({ day, key: 'war', params: { a, b } });
        if (activeWars(state).length >= MAX_WARS) return;
      }
    }
  }
}

/* ----------------------------- hooks used elsewhere ----------------------------- */

/** Standing changes caused by what the player did in a system (trade, contracts, fights). */
export function reward(state: GameState, f: FactionId | null, n: number): void {
  if (f) addRep(state, f, n);
}

/** A finished job raises the standing with the faction that issued it and, for members, merit toward promotion. */
export function onContractDone(
  state: GameState,
  c: { faction?: FactionId; facOnly?: boolean; evac?: boolean },
  payout: number,
): void {
  if (c.evac) {
    addRep(state, 'freeholds', 3);
    addRep(state, 'lumen', 2);
    addRep(state, 'directorate', 1.5);
  }
  const f = c.faction;
  if (!f) return;
  addRep(state, f, Math.min(6, 1.2 + payout / 2600) * (c.facOnly ? 1.4 : 1));
  addMerit(state, f, Math.ceil(payout / 320) * (c.facOnly ? 2 : 1));
}

export function onContractFailed(state: GameState, c: { faction?: FactionId; penalty: number }): void {
  if (c.faction) addRep(state, c.faction, -Math.min(8, 2 + c.penalty / 1200));
}

/** Standing consequences of a finished fight, by who the enemy was and where it happened. */
export function onFightEnded(
  state: GameState,
  kind: 'pirate' | 'hunter' | 'customs' | 'wreck' | 'fauna' | string,
  outcome: string,
  systemId: number,
): void {
  const owner = ownerOf(state, systemId);
  const won = outcome === 'victory' || outcome === 'surrender';
  if (!won) return;
  if (kind === 'pirate') {
    addRep(state, 'corsairs', -2.5, false);
    addRep(state, 'directorate', 1.5);
    if (owner && owner !== 'corsairs') addRep(state, owner, 1, false);
  } else if (kind === 'customs') {
    addRep(state, owner ?? 'directorate', -8, false);
    addRep(state, 'directorate', -5, false);
  } else if (kind === 'hunter') {
    addRep(state, owner ?? 'directorate', -2, false);
  }
}
