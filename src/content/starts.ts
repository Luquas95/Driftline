import type { FactionId } from '../core/worldTypes';

/**
 * Starting options. `standard` is the shipyard start (the first-ship screen); the others begin with a given
 * ship and a different past, and are unlocked by achievements (see `src/core/profile.ts`).
 */
export interface StartDef {
  id: string;
  /** Achievement that unlocks it (none = always available). */
  unlock?: string;
  hull?: string;
  modules?: string[];
  credits?: number;
  rep?: Partial<Record<FactionId, number>>;
  research?: number;
  words?: number;
  supplies?: number;
}

export const STARTS: StartDef[] = [
  { id: 'standard' },
  {
    id: 'smuggler',
    unlock: 'clan_friend',
    hull: 'courier',
    modules: ['vault_s'],
    credits: 20000,
    rep: { corsairs: 30, directorate: -15 },
  },
  {
    id: 'scientist',
    unlock: 'artifact_1',
    hull: 'scout',
    modules: ['surface_s', 'probe_s'],
    credits: 24000,
    rep: { lumen: 30 },
    research: 40,
    words: 4,
  },
  {
    id: 'refugee',
    unlock: 'survivor',
    hull: 'shuttle',
    modules: ['cargo_s'],
    credits: 9000,
    rep: { freeholds: 25 },
    supplies: 40,
  },
];

export const STARTS_BY_ID: Record<string, StartDef> = Object.fromEntries(STARTS.map((s) => [s.id, s]));
