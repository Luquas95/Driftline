import { SAVE_VERSION, type GameState } from './types';
import { syncCounters } from './state';
import { EVENTS_BY_ID } from '../content/events';
import { GOODS, GOODS_BY_ID } from '../content/goods';
import { HULLS_BY_ID } from '../content/hulls';
import { MODULES_BY_ID } from '../content/modules';
import { hullSlots } from './ship';
import { QUALITIES } from './types';

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

const MAX_ARRAY = 5000;

function finite(n: unknown, min = -Infinity, max = Infinity): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
}

/** Structural validation: rejects anything that would crash or hang the game. Throws SaveError. */
function validate(s: GameState): void {
  const bad = (what: string): never => {
    throw new SaveError(`invalid save: ${what}`);
  };
  if (typeof s.seed !== 'string' || !s.seed || s.seed.length > 64) bad('seed');
  if (!Number.isInteger(s.galaxySize) || s.galaxySize < 20 || s.galaxySize > 400) bad('galaxySize');
  if (!finite(s.credits, 0, 1e12)) bad('credits');
  if (!finite(s.day, 0, 1e7)) bad('day');
  if (
    !Array.isArray(s.rng) ||
    s.rng.length !== 4 ||
    !s.rng.every((n) => Number.isInteger(n)) ||
    s.rng.every((n) => n === 0)
  )
    bad('rng');
  const hull = HULLS_BY_ID[s.ship?.hullId];
  if (!hull) bad('hull');
  if (!Array.isArray(s.ship.slots) || s.ship.slots.length !== hullSlots(hull.id).length) bad('slots');
  for (const m of s.ship.slots) {
    if (m === null) continue;
    if (!m || !MODULES_BY_ID[m.defId] || !QUALITIES.includes(m.quality) || !finite(m.condition, 0, 100))
      bad('module');
  }
  if (!finite(s.ship.fuel, 0, 1e6) || !finite(s.ship.hp, 0, 1e6) || !finite(s.ship.supplies, 0, 1e6))
    bad('ship numbers');
  if (!Array.isArray(s.cargo) || s.cargo.length > 500) bad('cargo');
  for (const c of s.cargo) {
    if (
      !c ||
      !GOODS_BY_ID[c.goodId] ||
      !finite(c.qty, 0, 1e6) ||
      !(c.w === 1 || c.w === 2) ||
      !(c.h === 1 || c.h === 2) ||
      !finite(c.x, 0, 20) ||
      !finite(c.y, 0, 40)
    )
      bad('cargo item');
  }
  if (
    !s.location ||
    !Number.isInteger(s.location.systemId) ||
    s.location.systemId < 0 ||
    s.location.systemId >= s.galaxySize
  )
    bad('location');
  if (!s.stations || typeof s.stations !== 'object') bad('stations');
  for (const k of [
    'contracts',
    'messages',
    'visited',
    'seen',
    'discoveries',
    'inventory',
    'events',
  ] as const) {
    if (!Array.isArray(s[k]) || (s[k] as unknown[]).length > MAX_ARRAY) bad(k);
  }
  if (!s.insurance || typeof s.insurance !== 'object' || !s.stats || !s.difficulty) bad('sections');
  if (!s.flags || typeof s.flags !== 'object') bad('flags');
}

/**
 * Make a validated save consistent with the current content: pad or trim stock arrays (goods are append-only),
 * drop events and goods that no longer exist, clamp resources. Never throws.
 */
function repair(state: GameState): void {
  const n = GOODS.length;
  for (const dyn of Object.values(state.stations)) {
    if (!Array.isArray(dyn.stock)) dyn.stock = [];
    dyn.stock.length = n;
    for (let i = 0; i < n; i++) if (!finite(dyn.stock[i], 0)) dyn.stock[i] = 0;
    dyn.board ??= [];
    dyn.shop ??= { hulls: [], modules: [], epoch: -1 };
  }
  if (state.pendingEvent && !EVENTS_BY_ID[state.pendingEvent.eventId]) state.pendingEvent = null;
  state.inventory = state.inventory.filter((m) => m && MODULES_BY_ID[m.defId]);
  state.contracts = state.contracts.filter((c) => c && (!c.goodId || GOODS_BY_ID[c.goodId]));
  state.messages = state.messages.slice(-120);
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
  repair(state);
  syncCounters(state);
  return state;
}

/** Import from the contents of an exported file. */
export function importSave(text: string): GameState {
  return deserializeState(text);
}
