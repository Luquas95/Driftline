import { SAVE_VERSION, type GameState } from './types';
import { syncCounters } from './state';

/**
 * Save format: the game state is plain JSON. The galaxy is NOT stored: it is regenerated from the seed,
 * so only dynamic data (stocks, knowledge, contracts, ship) is saved. Bump SAVE_VERSION and add a migration
 * whenever the shape of GameState changes.
 */
export interface SaveEnvelope {
  magic: 'driftline-save';
  version: number;
  savedAt: string;
  state: unknown;
}

type Raw = Record<string, unknown>;
type Migration = (s: Raw) => Raw;

/** Migrations keyed by the version they upgrade FROM. */
export const MIGRATIONS: Record<number, Migration> = {
  // v0 -> v1: early prototypes lacked these fields.
  0: (s) => {
    s.v = 1;
    s.inventory ??= [];
    s.hints ??= [];
    s.discoveries ??= [];
    s.notes ??= {};
    s.flags ??= {};
    s.tutorial ??= { step: 0, done: false };
    s.galaxySize ??= 300;
    s.pendingEvent ??= null;
    s.dead ??= false;
    s.insurance ??= { active: true, full: false, due: 0, lapsedSince: null };
    return s;
  },
};

export function serializeState(state: GameState): string {
  return JSON.stringify(state);
}

export function toEnvelope(state: GameState, savedAt: string): SaveEnvelope {
  return { magic: 'driftline-save', version: SAVE_VERSION, savedAt, state };
}

export function exportSave(state: GameState, savedAt: string): string {
  return JSON.stringify(toEnvelope(state, savedAt));
}

export class SaveError extends Error {}

export function migrateState(raw: Raw): GameState {
  let v = typeof raw.v === 'number' ? raw.v : 0;
  if (v > SAVE_VERSION) throw new SaveError('save from a newer version of the game');
  let s = raw;
  while (v < SAVE_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) throw new SaveError(`no migration from version ${v}`);
    s = m(s);
    v = typeof s.v === 'number' ? s.v : v + 1;
  }
  return s as unknown as GameState;
}

function validate(s: GameState): void {
  const bad = (what: string) => {
    throw new SaveError(`invalid save: ${what}`);
  };
  if (typeof s.seed !== 'string' || !s.seed) bad('seed');
  if (!s.ship || !Array.isArray(s.ship.slots)) bad('ship');
  if (!Array.isArray(s.cargo)) bad('cargo');
  if (typeof s.credits !== 'number' || !isFinite(s.credits)) bad('credits');
  if (!s.location || typeof s.location.systemId !== 'number') bad('location');
  if (!s.stations || typeof s.stations !== 'object') bad('stations');
}

export function deserializeState(json: string): GameState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new SaveError('not valid JSON');
  }
  return fromParsed(parsed);
}

export function fromParsed(parsed: unknown): GameState {
  if (!parsed || typeof parsed !== 'object') throw new SaveError('not an object');
  const p = parsed as Raw;
  const raw = (p.magic === 'driftline-save' ? p.state : p) as Raw;
  if (!raw || typeof raw !== 'object') throw new SaveError('missing state');
  const state = migrateState(raw);
  validate(state);
  syncCounters(state);
  return state;
}

/** Import from the contents of an exported file. */
export function importSave(text: string): GameState {
  return deserializeState(text);
}
