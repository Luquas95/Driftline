/**
 * Territory and standing lookups with no dependency on the rest of the state module (so the economy can use them):
 * who owns a system, how the player stands with them, and what that does to tariffs and customs.
 */
import { FACTIONS, FACTIONS_BY_ID, STANDING_TIERS } from '../content/factions';
import { dist, getGalaxy } from './galaxy';
import { Rng } from './rng';
import type { Galaxy, GameState, StationStatic } from './types';
import type { FactionId, FactionState } from './worldTypes';

/* ------------------------------ territory ------------------------------ */

export interface Territory {
  owner: (FactionId | null)[];
  capital: Record<FactionId, number>;
}

const territoryCache = new Map<string, Territory>();

/** Where the factions sit before any war: deterministic for a galaxy. */
export function territoryOf(g: Galaxy): Territory {
  const key = `${g.seed}:${g.systems.length}`;
  const hit = territoryCache.get(key);
  if (hit) return hit;
  const t = buildTerritory(g);
  if (territoryCache.size > 8) territoryCache.clear();
  territoryCache.set(key, t);
  return t;
}

function buildTerritory(g: Galaxy): Territory {
  const rng = Rng.fromSeed(`${g.seed}:territory`);
  let cx = 0;
  let cy = 0;
  for (const s of g.systems) {
    cx += s.x;
    cy += s.y;
  }
  cx /= g.systems.length;
  cy /= g.systems.length;
  const taken: number[] = [];
  const capital = {} as Record<FactionId, number>;
  for (const f of FACTIONS) {
    const want = f.capitalAngle + rng.range(-0.25, 0.25);
    const cands = g.systems.filter((s) => {
      if (!f.capitalRegion.includes(s.region) && s.region !== 'inner') return false;
      const hasPirate = s.stations.some((x) => x.type === 'pirate');
      if (f.id === 'corsairs') return hasPirate;
      return s.stations.some((x) => x.type !== 'pirate');
    });
    const pool = cands.length ? cands : g.systems;
    let best = pool[0];
    let bs = Infinity;
    for (const s of pool) {
      if (taken.some((id) => dist(g.systems[id], s) < g.radius * 0.28)) continue;
      const ang = Math.atan2(s.y - cy, s.x - cx);
      let d = Math.abs(ang - want) % (Math.PI * 2);
      if (d > Math.PI) d = Math.PI * 2 - d;
      const regionPenalty = f.capitalRegion.includes(s.region) ? 0 : 1.2;
      const bonus =
        f.id === 'consortium' && s.stations.some((x) => x.type === 'trade_hub')
          ? -0.5
          : f.id === 'lumen' && s.stations.some((x) => x.type === 'research' || x.type === 'scientific')
            ? -0.5
            : 0;
      const score = d + regionPenalty + bonus;
      if (score < bs) {
        bs = score;
        best = s;
      }
    }
    capital[f.id] = best.id;
    taken.push(best.id);
  }
  const owner: (FactionId | null)[] = [];
  for (const s of g.systems) {
    let bestF: FactionId | null = null;
    let bd = Infinity;
    for (const f of FACTIONS) {
      const d = dist(s, g.systems[capital[f.id]]) / (f.reach * g.radius);
      if (d < bd) {
        bd = d;
        bestF = f.id;
      }
    }
    owner[s.id] = bd <= 1 ? bestF : null;
  }
  // pirate hideouts belong to the clans wherever they are
  for (const s of g.systems) if (s.stations.some((x) => x.type === 'pirate')) owner[s.id] = 'corsairs';
  for (const f of FACTIONS) owner[capital[f.id]] = f.id;
  return { owner, capital };
}

export function newFactionState(): FactionState {
  return {
    rep: { consortium: 0, directorate: 0, freeholds: 0, lumen: 0, corsairs: 0 },
    member: null,
    rank: 0,
    merit: 0,
    owner: {},
    wars: [],
    nextWarCheck: 20,
    history: [],
  };
}

/** Current owner of a system (war conquests override the original territory). */
export function ownerOf(state: GameState, systemId: number): FactionId | null {
  const o = state.fac.owner[systemId];
  if (o !== undefined) return o;
  return territoryOf(getGalaxy(state.seed, state.galaxySize)).owner[systemId] ?? null;
}

export function ownerOfStation(state: GameState, st: StationStatic): FactionId | null {
  return ownerOf(state, st.systemId);
}

/** Number of systems each faction owns right now. */
export function territorySizes(state: GameState): Record<FactionId, number> {
  const out = { consortium: 0, directorate: 0, freeholds: 0, lumen: 0, corsairs: 0 };
  const g = getGalaxy(state.seed, state.galaxySize);
  for (const s of g.systems) {
    const o = ownerOf(state, s.id);
    if (o) out[o]++;
  }
  return out;
}

/* ----------------------------- reputation ----------------------------- */

export type StandingTier = (typeof STANDING_TIERS)[number]['id'];

export function repOf(state: GameState, f: FactionId): number {
  return state.fac.rep[f] ?? 0;
}

export function tierOf(rep: number): StandingTier {
  let id: StandingTier = 'enemy';
  for (const t of STANDING_TIERS) if (rep >= t.min) id = t.id;
  return id;
}

/** Repute multiplier on the tariff in a faction's space: enemies pay more, allies less. */
const TARIFF_BY_TIER: Record<StandingTier, number> = {
  enemy: 1.5,
  hostile: 1.25,
  neutral: 1,
  friendly: 0.85,
  ally: 0.7,
};
const INSPECT_BY_TIER: Record<StandingTier, number> = {
  enemy: 1.9,
  hostile: 1.4,
  neutral: 1,
  friendly: 0.55,
  ally: 0.25,
};

/** Tariff multiplier at a station: faction policy x standing x membership. */
export function tariffMult(state: GameState, st: StationStatic): number {
  const o = ownerOfStation(state, st);
  if (!o) return 1;
  const t = TARIFF_BY_TIER[tierOf(repOf(state, o))];
  const member = state.fac.member === o ? 1 - 0.03 * state.fac.rank : 1;
  return Math.max(0.3, Math.min(2, FACTIONS_BY_ID[o].tariff * t * member));
}

/** Multiplier on the customs inspection chance at a station. */
export function inspectionMult(state: GameState, st: StationStatic): number {
  return inspectionAtSystem(state, st.systemId);
}

export function inspectionAtSystem(state: GameState, systemId: number): number {
  const o = ownerOf(state, systemId);
  if (!o) return 1;
  const member = state.fac.member === o ? (state.fac.rank >= 3 ? 0.5 : 0.8) : 1;
  return FACTIONS_BY_ID[o].inspection * INSPECT_BY_TIER[tierOf(repOf(state, o))] * member;
}

/** The faction whose standing counts for what happens at this system (null in free space). */
export function localFaction(state: GameState, systemId: number): FactionId | null {
  return ownerOf(state, systemId);
}

export const clampRep = (n: number): number => Math.max(-100, Math.min(100, n));
