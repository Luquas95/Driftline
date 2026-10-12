import { SAVE_VERSION, type GameState } from './types';
import { syncCounters } from './state';
import { EVENTS_BY_ID } from '../content/events';
import { GOODS, GOODS_BY_ID } from '../content/goods';
import { HULLS_BY_ID } from '../content/hulls';
import { MODULES_BY_ID } from '../content/modules';
import { hullSlots } from './ship';
import { defaultCrew } from './crew';
import { OFFICERS_BY_ID, RACES_BY_ID, ROLE_SKILL, SKILLS } from '../content/crew';
import { ENEMIES_BY_ID } from '../content/enemies';
import { POWER_GROUPS, WEAPON_KINDS, type CShip, type CombatOutcome, type CombatState } from './combat/types';
import { QUALITIES } from './types';
import { newWorld } from './world';
import { FACTION_IDS, type Base } from './worldTypes';
import { BUILDINGS_BY_ID } from '../content/buildings';
import { ENDINGS_BY_ID } from './endings';

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
  // v1 -> v2: crew and combat. The default crew is derived from the hull so old saves stay deterministic.
  1: (s) => {
    s.v = 2;
    s.crew ??= [];
    s.wagesDue ??= 0;
    s.combat ??= null;
    s.encounter ??= null;
    s.officersMet ??= [];
    const st = (s.stats ??= {}) as Record<string, number>;
    st.fights ??= 0;
    st.victories ??= 0;
    st.fled ??= 0;
    const ship = s.ship as { hullId?: string } | undefined;
    if (!(s.crew as unknown[]).length && ship?.hullId) {
      let n = (typeof s.uidCounter === 'number' ? s.uidCounter : 0) + 1000;
      s.crew = defaultCrew(String(s.seed), ship.hullId, 0, () => `w${++n}`);
      s.uidCounter = n;
    }
    return s;
  },
  // v2 -> v3: new games start without a ship; existing saves already own one.
  2: (s) => {
    s.v = 3;
    s.noShip = false;
    s.captain ??= 'Kapitán';
    return s;
  },
  // v3 -> v4: factions, threat and the rest are generated deterministically from the seed; no base is built yet.
  3: (s) => {
    s.v = 4;
    // malformed saves are rejected later by validate(); do not generate a world for them
    if (typeof s.seed !== 'string' || !s.seed || !Number.isInteger(s.galaxySize)) return s;
    const loc = s.location as { systemId?: number } | undefined;
    const w = newWorld(
      String(s.seed),
      Number(s.galaxySize),
      (s.difficulty as GameState['difficulty']) ?? {
        prices: 'normal',
        risk: 'normal',
        insurance: true,
        permadeath: false,
      },
      loc?.systemId ?? 0,
    );
    s.fac ??= w.fac;
    s.base ??= null;
    s.research ??= w.research;
    s.threat ??= w.threat;
    s.lang ??= w.lang;
    s.story ??= w.story;
    s.ach ??= {};
    s.ending ??= null;
    s.run ??= w.run;
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
const COMBAT_OUTCOMES: CombatOutcome[] = ['victory', 'defeat', 'fled', 'surrender', 'tribute', 'enemy-fled'];

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
  if (!Array.isArray(s.crew) || s.crew.length > 200) bad('crew');
  for (const c of s.crew) {
    if (
      !c ||
      !RACES_BY_ID[c.race] ||
      !ROLE_SKILL[c.role] ||
      !finite(c.hp, 0, 1e4) ||
      !finite(c.morale, 0, 100) ||
      !c.skills
    )
      bad('crew');
  }
  if (!s.insurance || typeof s.insurance !== 'object' || !s.stats || !s.difficulty) bad('sections');
  if (!s.flags || typeof s.flags !== 'object') bad('flags');
}

/**
 * Make a validated save consistent with the current content: pad or trim stock arrays (goods are append-only),
 * drop events and goods that no longer exist, clamp resources. Never throws.
 */
function validCombat(c: unknown): boolean {
  try {
    const cs = c as CombatState;
    if (!cs || cs.v !== 1 || typeof cs.seed !== 'string' || !finite(cs.time, 0, 1e6)) return false;
    if (
      !Array.isArray(cs.rng) ||
      cs.rng.length !== 4 ||
      !cs.rng.every(Number.isInteger) ||
      cs.rng.every((n) => n === 0)
    )
      return false;
    if (!Array.isArray(cs.enemies) || cs.enemies.length < 1 || cs.enemies.length > 4) return false;
    if (cs.outcome !== null && !COMBAT_OUTCOMES.includes(cs.outcome)) return false;
    if (!Array.isArray(cs.projectiles) || cs.projectiles.length > 300) return false;
    if (!Array.isArray(cs.enemyDefs) || !finite(cs.tier, 1, 3) || !finite(cs.difficultyRisk, 0.1, 10))
      return false;
    const idx = (n: unknown, len: number): boolean =>
      Number.isInteger(n) && (n as number) >= 0 && (n as number) < len;
    for (const sh of [cs.player, ...cs.enemies]) {
      if (!sh || !HULLS_BY_ID[sh.hullId]) return false;
      const nr = sh.rooms?.length;
      if (!Array.isArray(sh.rooms) || nr !== hullSlots(sh.hullId).length) return false;
      if (
        !finite(sh.hull, 0, 1e6) ||
        !finite(sh.hullMax, 1, 1e6) ||
        !finite(sh.shield, 0, 1e6) ||
        !finite(sh.shieldMax, 0, 1e6)
      )
        return false;
      if (!finite(sh.heat, 0, 1000) || !finite(sh.powerOut, 0, 1e4) || !finite(sh.jumpCharge, 0, 1e3))
        return false;
      if (
        !sh.need ||
        !sh.weights ||
        !POWER_GROUPS.every((g) => finite(sh.need[g], 0, 1e4) && finite(sh.weights[g], 0, 1e4))
      )
        return false;
      for (const r of sh.rooms) {
        if (!r || !Array.isArray(r.adj) || r.adj.length > 4 || !r.adj.every((a) => idx(a, nr))) return false;
        if (
          !finite(r.sys, 0, 100) ||
          !finite(r.o2, 0, 100) ||
          !finite(r.fire, 0, 100) ||
          !finite(r.breach, 0, 100) ||
          !finite(r.ion, 0, 1e4)
        )
          return false;
      }
      if (
        !Array.isArray(sh.weapons) ||
        sh.weapons.length > 16 ||
        !Array.isArray(sh.drones) ||
        sh.drones.length > 40
      )
        return false;
      for (const w of sh.weapons) {
        if (!WEAPON_KINDS.includes(w.kind) || !idx(w.room, nr) || !finite(w.charge, 0, 10)) return false;
        if (w.target && (!idx(w.target.ship, cs.enemies.length) || !idx(w.target.room, 64))) return false;
      }
      if (!Array.isArray(sh.crew) || sh.crew.length > 60) return false;
      for (const m of sh.crew) {
        if (
          !RACES_BY_ID[m.race] ||
          !ROLE_SKILL[m.role] ||
          !finite(m.hp, -1e4, 1e4) ||
          !finite(m.stepT, -10, 10)
        )
          return false;
        if (
          !idx(m.room, 64) ||
          !Array.isArray(m.path) ||
          m.path.length > 64 ||
          !m.path.every((a) => idx(a, 64))
        )
          return false;
        if (!m.skills || !SKILLS.every((k) => finite(m.skills[k], 0, 10)) || !m.xp) return false;
      }
    }
    for (const p of cs.projectiles)
      if (!p || !idx(p.toShip, 8) || !idx(p.toRoom, 64) || !finite(p.t, -10, 100)) return false;
    return true;
  } catch {
    return false;
  }
}

function repair(state: GameState): void {
  // v2: a fight or encounter that refers to removed content or is malformed is dropped instead of crashing later
  if (state.combat && !validCombat(state.combat)) state.combat = null;
  if (state.combat) {
    const nRooms = (sh: CShip) => sh.rooms.length;
    for (const sh of [state.combat.player, ...state.combat.enemies])
      for (const m of sh.crew) m.room = Math.min(m.room, nRooms(sh) - 1);
  }
  const enc = state.encounter;
  if (
    enc &&
    (!Array.isArray(enc.enemyDefs) ||
      enc.enemyDefs.length < 1 ||
      !enc.enemyDefs.every((id) => ENEMIES_BY_ID[id]) ||
      !Array.isArray(enc.options))
  )
    state.encounter = null;
  for (const c of state.crew) {
    for (const k of SKILLS) if (!finite(c.skills[k], 0, 10)) c.skills[k] = 0;
    if (!finite(c.wage, 0, 1e6)) c.wage = 5;
    if (!finite(c.fatigue, 0, 100)) c.fatigue = 0;
    if (c.officer && !OFFICERS_BY_ID[c.officer]) delete c.officer;
  }
  state.crew = state.crew.slice(0, 40);
  state.officersMet = Array.isArray(state.officersMet)
    ? state.officersMet.filter((o) => (OFFICERS_BY_ID as Record<string, unknown>)[o])
    : [];
  if (!finite(state.wagesDue, 0, 1e9)) state.wagesDue = 0;
  state.noShip = state.noShip === true;
  if (typeof state.captain !== 'string') state.captain = 'Kapitán';
  const n = GOODS.length;
  for (const dyn of Object.values(state.stations)) {
    if (!Array.isArray(dyn.stock)) dyn.stock = [];
    dyn.stock.length = n;
    for (let i = 0; i < n; i++) if (!finite(dyn.stock[i], 0)) dyn.stock[i] = 0;
    dyn.board ??= [];
    dyn.shop ??= { hulls: [], modules: [], epoch: -1 };
  }
  repairWorld(state);
  if (state.pendingEvent && !EVENTS_BY_ID[state.pendingEvent.eventId]) state.pendingEvent = null;
  state.inventory = state.inventory.filter((m) => m && MODULES_BY_ID[m.defId]);
  state.contracts = state.contracts.filter((c) => c && (!c.goodId || GOODS_BY_ID[c.goodId]));
  state.messages = state.messages.slice(-120);
}

/** The base is dropped when its structure is unusable, otherwise unknown content is removed and gaps are filled. */
function repairBase(state: GameState): void {
  const b = state.base;
  if (!b) return;
  const isObj = (x: unknown): x is Record<string, unknown> =>
    !!x && typeof x === 'object' && !Array.isArray(x);
  const sys = Number.isInteger(b.systemId) && b.systemId >= 0 && b.systemId < state.galaxySize;
  if (!sys || !isObj(b)) {
    state.base = null;
    return;
  }
  if (typeof b.name !== 'string') b.name = 'Base';
  if (!finite(b.bodyIndex, 0, 100)) b.bodyIndex = 0;
  if (b.kind !== 'station' && b.kind !== 'colony') b.kind = 'station';
  if (!finite(b.founded)) b.founded = 0;
  if (!finite(b.treasury, 0, 1e12)) b.treasury = 0;
  if (!finite(b.lastTick)) b.lastTick = Math.floor(state.day);
  if (!isObj(b.buildings)) b.buildings = {};
  for (const [k, v] of Object.entries(b.buildings))
    if (!BUILDINGS_BY_ID[k as never] || !finite(v, 0, 10)) delete b.buildings[k];
  b.queue = Array.isArray(b.queue)
    ? b.queue.filter((q) => q && BUILDINGS_BY_ID[q.id as never] && finite(q.level, 1, 10) && finite(q.done))
    : [];
  if (!isObj(b.storage)) b.storage = {};
  for (const [k, v] of Object.entries(b.storage))
    if (!GOODS_BY_ID[k] || !finite(v, 0, 1e9)) delete b.storage[k];
  b.lines = Array.isArray(b.lines)
    ? b.lines.filter((l) => l && GOODS_BY_ID[l.goodId] && finite(l.cap, 0))
    : [];
  b.orders = Array.isArray(b.orders)
    ? b.orders.filter(
        (o) =>
          o &&
          finite(o.done) &&
          ((o.kind === 'module' && MODULES_BY_ID[o.item]) || (o.kind === 'hull' && HULLS_BY_ID[o.item])),
      )
    : [];
  if (!isObj(b.autoSell)) b.autoSell = {};
  b.hangar = Array.isArray(b.hangar)
    ? b.hangar.filter(
        (f) => f && f.ship && HULLS_BY_ID[f.ship.hullId] && Array.isArray(f.crew) && typeof f.id === 'string',
      )
    : [];
  for (const f of b.hangar) {
    if (!['idle', 'trade', 'escort', 'guard'].includes(f.order)) f.order = 'idle';
    if (!finite(f.idleUntil)) f.idleUntil = 0;
    if (!finite(f.earned)) f.earned = 0;
    if (!finite(f.trips)) f.trips = 0;
    if (f.route && (!isObj(f.route) || typeof f.route.from !== 'string' || typeof f.route.to !== 'string'))
      f.route = null;
    if (f.trip && (!isObj(f.trip) || !finite(f.trip.end) || !finite(f.trip.profit) || !finite(f.trip.cost)))
      f.trip = null;
  }
  b.attack =
    b.attack && finite(b.attack.strength) && finite(b.attack.resolve) && finite(b.attack.day)
      ? b.attack
      : null;
  b.log = Array.isArray(b.log) ? b.log.slice(-60) : [];
  const st = isObj(b.stats) ? b.stats : ({} as Base['stats']);
  for (const k of ['produced', 'sold', 'fleetIncome', 'upkeep', 'attacks', 'repelled'] as const)
    if (!finite(st[k])) st[k] = 0;
  b.stats = st;
}

/** v4 sections: fill in anything missing or malformed with deterministic defaults, drop unknown content ids. */
function repairWorld(state: GameState): void {
  const w = newWorld(state.seed, state.galaxySize, state.difficulty, state.location.systemId);
  const f = state.fac;
  if (!f || typeof f !== 'object') state.fac = w.fac;
  else {
    f.rep ??= w.fac.rep;
    for (const id of FACTION_IDS) if (!finite(f.rep[id], -100, 100)) f.rep[id] = 0;
    if (f.member !== null && !FACTION_IDS.includes(f.member as never)) f.member = null;
    f.rank = finite(f.rank, 0, 5) ? Math.floor(f.rank) : 0;
    if (!finite(f.merit, 0, 1e6)) f.merit = 0;
    if (!f.owner || typeof f.owner !== 'object') f.owner = {};
    f.wars = Array.isArray(f.wars)
      ? f.wars.filter(
          (x) =>
            x &&
            FACTION_IDS.includes(x.a) &&
            FACTION_IDS.includes(x.b) &&
            x.a !== x.b &&
            finite(x.start) &&
            finite(x.end) &&
            finite(x.front, -1, 1),
        )
      : [];
    if (!finite(f.nextWarCheck)) f.nextWarCheck = state.day;
    f.history = Array.isArray(f.history) ? f.history.slice(-80) : [];
  }
  state.base = state.base && typeof state.base === 'object' ? state.base : null;
  if (!state.research || typeof state.research !== 'object') state.research = w.research;
  else {
    if (!Array.isArray(state.research.done)) state.research.done = [];
    if (!finite(state.research.points, 0, 1e9)) state.research.points = 0;
    if (!finite(state.research.progress, 0, 1e9)) state.research.progress = 0;
    if (!finite(state.research.totalEarned, 0, 1e9)) state.research.totalEarned = 0;
    if (typeof state.research.active !== 'string') state.research.active = null;
  }
  const th = state.threat;
  if (!th || typeof th !== 'object' || !Array.isArray(th.foci) || !th.grip) state.threat = w.threat;
  else {
    th.foci = th.foci.filter((id) => Number.isInteger(id) && id >= 0 && id < state.galaxySize);
    if (!th.foci.length) th.foci = w.threat.foci;
    for (const [k, v] of Object.entries(th.grip))
      if (!finite(v, 0, 100) || !/^\d+$/.test(k) || Number(k) >= state.galaxySize) delete th.grip[k as never];
    th.consumed = Object.values(th.grip).filter((v) => v >= 100).length;
    if (!finite(th.mitigation, 0, 1)) th.mitigation = 0;
    if (!finite(th.start, 0, 1e5)) th.start = w.threat.start;
    th.stopped = th.stopped === true;
    if (!finite(th.lastTick, 0, 1e7)) th.lastTick = 0;
  }
  if (!state.lang || !finite(state.lang.learned, 0, 1000)) state.lang = w.lang;
  if (!state.story || typeof state.story !== 'object') state.story = w.story;
  else {
    if (!finite(state.story.stage, 0, 1000)) state.story.stage = 0;
    if (!finite(state.story.artifacts, 0, 100)) state.story.artifacts = 0;
    state.story.log = Array.isArray(state.story.log) ? state.story.log.slice(-200) : [];
  }
  if (!state.ach || typeof state.ach !== 'object') state.ach = {};
  if (state.ending && (!ENDINGS_BY_ID[state.ending.id] || !finite(state.ending.day))) state.ending = null;
  if (!['low', 'normal', 'high'].includes(state.difficulty?.risk)) state.difficulty.risk = 'normal';
  if (f && typeof f === 'object')
    for (const [k, v] of Object.entries(state.fac.owner))
      if (v !== null && !FACTION_IDS.includes(v as never)) delete state.fac.owner[Number(k)];
  if (!finite(state.lastEconDay)) state.lastEconDay = Math.floor(state.day);
  state.lastEconDay = Math.max(
    Math.floor(state.day) - 400,
    Math.min(Math.floor(state.day), state.lastEconDay),
  );
  repairBase(state);
  state.ending ??= null;
  if (!state.run || typeof state.run.start !== 'string') state.run = w.run;
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
