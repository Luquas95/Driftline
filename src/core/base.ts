/**
 * The home base: founding, buildings, production in time, storage, a small port market, build orders and attacks.
 * The base runs while the player travels (`baseDaily`, called from the daily tick).
 */
import { BUILDINGS_BY_ID, COLONY_BODIES, FOUNDING, fabQuality, type BuildingId } from '../content/buildings';
import { GOODS_BY_ID } from '../content/goods';
import { HULLS_BY_ID } from '../content/hulls';
import { MODULES_BY_ID } from '../content/modules';
import { removeGoods, unitsOf } from './cargo';
import { spawnEncounter } from './combat/encounter';
import { defaultCrew } from './crew';
import { addRep } from './factions';
import { fleetDaily } from './fleet';
import { Rng } from './rng';
import { buildStarterShip, modulePrice, newModule } from './ship';
import { addToHold, analyze, fail, galaxyOf, msg, newUid, ok, type Result } from './state';
import { ownerOf, repOf, tierOf } from './territory';
import { hasTech, moduleUnlocked, techBonus } from './research';
import { T } from './tuning';
import type { BodyStatic, GameState } from './types';
import type { Base, BuildOrder } from './worldTypes';

export const MAX_QUEUE = 3;
export const MAX_ORDERS = 3;

/* ------------------------------ queries ------------------------------ */

export function levelOf(base: Base | null, id: BuildingId): number {
  return base?.buildings[id] ?? 0;
}

export function inBaseSystem(state: GameState): boolean {
  return !!state.base && state.location.systemId === state.base.systemId;
}

export function storageCapacity(base: Base): number {
  return FOUNDING.baseStorage + FOUNDING.perWarehouseLevel * levelOf(base, 'warehouse');
}

export function storageUsed(base: Base): number {
  let n = 0;
  for (const v of Object.values(base.storage)) n += v;
  return n;
}

export function storageLeft(base: Base): number {
  return Math.max(0, storageCapacity(base) - storageUsed(base));
}

export function hangarSlots(base: Base): number {
  return levelOf(base, 'hangar') > 0 ? 1 + levelOf(base, 'hangar') : 0;
}

/** Daily cost of all buildings. */
export function upkeepPerDay(base: Base): number {
  let u = 0;
  for (const [id, lvl] of Object.entries(base.buildings))
    u += BUILDINGS_BY_ID[id as BuildingId]?.upkeep(lvl) ?? 0;
  return u;
}

/** Strength of the base against raiders. */
export function defenseRating(state: GameState): number {
  const b = state.base;
  if (!b) return 0;
  let r = 14 * levelOf(b, 'defense') * (1 + techBonus(state, 'defense'));
  for (const f of b.hangar) {
    if (f.order === 'guard') r += (HULLS_BY_ID[f.ship.hullId]?.hp ?? 0) / 14 + f.crew.length * 2;
  }
  return Math.round(r * 10) / 10;
}

/** What the base is worth to a raider (drives how often it is attacked). */
export function baseValue(base: Base): number {
  let v = 0;
  for (const [id, lvl] of Object.entries(base.buildings))
    v += (BUILDINGS_BY_ID[id as BuildingId]?.cost(lvl) ?? 0) * 0.5;
  for (const [gid, n] of Object.entries(base.storage)) v += n * (GOODS_BY_ID[gid]?.basePrice ?? 0) * 0.5;
  return v + base.treasury;
}

export function baseKindFor(body: BodyStatic): 'station' | 'colony' {
  return COLONY_BODIES.includes(body.kind) ? 'colony' : 'station';
}

function log(base: Base, day: number, key: string, params?: Record<string, string | number>): void {
  base.log.push({ day, key, params });
  if (base.log.length > 60) base.log.splice(0, base.log.length - 60);
}

/* ------------------------------ founding ------------------------------ */

export interface FoundCheck {
  ok: boolean;
  error?: string;
}

/** Can the base be founded on this body of the current system? */
export function checkFounding(state: GameState, bodyIndex: number): FoundCheck {
  if (state.base) return { ok: false, error: 'err.baseExists' };
  if (state.noShip) return { ok: false, error: 'err.noShip' };
  const g = galaxyOf(state);
  const sys = g.systems[state.location.systemId];
  const body = sys.bodies[bodyIndex];
  if (!body) return { ok: false, error: 'err.noBody' };
  if (!(state.detected[sys.id] ?? []).includes(body.id)) return { ok: false, error: 'err.bodyUnknown' };
  const owner = ownerOf(state, sys.id);
  if (owner && state.fac.member !== owner && ['enemy', 'hostile'].includes(tierOf(repOf(state, owner))))
    return { ok: false, error: 'err.baseOwner' };
  if (state.credits < FOUNDING.credits) return { ok: false, error: 'err.noCredits' };
  for (const [gid, n] of Object.entries(FOUNDING.goods))
    if (unitsOf(state.cargo, gid) < n) return { ok: false, error: 'err.baseMaterials' };
  return { ok: true };
}

export function foundBase(state: GameState, bodyIndex: number, name: string): Result {
  const chk = checkFounding(state, bodyIndex);
  if (!chk.ok) return fail(chk.error!);
  const g = galaxyOf(state);
  const sys = g.systems[state.location.systemId];
  const body = sys.bodies[bodyIndex];
  for (const [gid, n] of Object.entries(FOUNDING.goods)) removeGoods(state.cargo, gid, n);
  state.credits -= FOUNDING.credits;
  const base: Base = {
    systemId: sys.id,
    bodyIndex,
    kind: baseKindFor(body),
    name: name.trim().slice(0, 28) || `${sys.name} Base`,
    founded: state.day,
    buildings: {},
    queue: [],
    storage: {},
    treasury: 0,
    lines: [],
    orders: [],
    autoSell: {},
    hangar: [],
    attack: null,
    log: [],
    lastTick: Math.floor(state.day),
    stats: { produced: 0, sold: 0, fleetIncome: 0, upkeep: 0, attacks: 0, repelled: 0 },
  };
  state.base = base;
  log(base, state.day, 'founded');
  msg(state, 'msg.baseFounded', { name: base.name }, 'good');
  return ok();
}

/* ------------------------------ buildings ------------------------------ */

export function nextLevel(base: Base, id: BuildingId): number {
  return levelOf(base, id) + (base.queue.some((q) => q.id === id) ? 1 : 0) + 1;
}

export interface BuildCheck {
  ok: boolean;
  error?: string;
  level: number;
  credits: number;
  materials: Record<string, number>;
  days: number;
}

export function checkBuilding(state: GameState, id: BuildingId): BuildCheck {
  const base = state.base;
  const none = { ok: false, level: 0, credits: 0, materials: {}, days: 0 };
  if (!base) return { ...none, error: 'err.noBase' };
  const def = BUILDINGS_BY_ID[id];
  if (!def) return { ...none, error: 'err.noBuilding' };
  if (base.queue.some((q) => q.id === id)) return { ...none, error: 'err.alreadyBuilding' };
  const level = levelOf(base, id) + 1;
  const res = { level, credits: def.cost(level), materials: def.materials(level), days: def.days(level) };
  if (level > def.maxLevel) return { ...res, ok: false, error: 'err.maxLevel' };
  if (def.tech && level >= (def.techFromLevel ?? 1) && !hasTech(state, def.tech))
    return { ...res, ok: false, error: 'err.techNeeded' };
  if (base.queue.length >= MAX_QUEUE) return { ...res, ok: false, error: 'err.queueFull' };
  if (id === 'port' && levelOf(base, 'warehouse') < 1)
    return { ...res, ok: false, error: 'err.needWarehouse' };
  if (id === 'refinery' && levelOf(base, 'mine') < 1) return { ...res, ok: false, error: 'err.needMine' };
  if (id === 'hangar' && levelOf(base, 'shipyard') < 1)
    return { ...res, ok: false, error: 'err.needShipyard' };
  if (id === 'anchor' && levelOf(base, 'lab') < 2) return { ...res, ok: false, error: 'err.needLab' };
  const unpaid = paymentError(state, base, res.credits, res.materials);
  return unpaid ? { ...res, ok: false, error: unpaid } : { ...res, ok: true };
}

export function startBuilding(state: GameState, id: BuildingId): Result {
  if (!inBaseSystem(state)) return fail('err.notAtBase');
  const chk = checkBuilding(state, id);
  if (!chk.ok) return fail(chk.error!);
  const base = state.base!;
  state.credits -= chk.credits;
  takeMaterials(base, chk.materials);
  base.queue.push({ id, level: chk.level, start: state.day, done: state.day + chk.days });
  return ok();
}

/* ------------------------------ storage ------------------------------ */

/** Move goods between the ship's hold and the base storage. Requires being in the base system. */
export function transferGoods(
  state: GameState,
  goodId: string,
  qty: number,
  dir: 'toBase' | 'toShip',
): Result<{ moved: number }> {
  const base = state.base;
  if (!base) return fail('err.noBase');
  if (!inBaseSystem(state)) return fail('err.notAtBase');
  if (!GOODS_BY_ID[goodId] || !Number.isFinite(qty) || qty <= 0) return fail('err.badAmount');
  qty = Math.floor(qty);
  if (qty < 1) return fail('err.badAmount');
  if (dir === 'toBase') {
    const have = unitsOf(state.cargo, goodId);
    const n = Math.min(qty, have, storageLeft(base));
    if (n <= 0) return fail(have <= 0 ? 'err.nothingToMove' : 'err.storageFull');
    removeGoods(state.cargo, goodId, n);
    base.storage[goodId] = (base.storage[goodId] ?? 0) + n;
    return ok({ moved: n });
  }
  const stored = base.storage[goodId] ?? 0;
  if (stored <= 0) return fail('err.nothingToMove');
  const r = addToHold(state, goodId, Math.min(qty, stored));
  if (r.added <= 0) return fail('err.noCargoSpace');
  base.storage[goodId] = stored - r.added;
  if (base.storage[goodId] <= 0) delete base.storage[goodId];
  return ok({ moved: r.added });
}

export function collectTreasury(state: GameState): Result<{ amount: number }> {
  const base = state.base;
  if (!base) return fail('err.noBase');
  if (!inBaseSystem(state)) return fail('err.notAtBase');
  const amount = Math.floor(base.treasury);
  if (amount <= 0) return fail('err.nothingToMove');
  state.credits += amount;
  base.treasury -= amount;
  return ok({ amount });
}

/* ------------------------------ production ------------------------------ */

/** Raw goods a production line may make: those with a recipe and not illegal. */
export function producibleGoods(base: Base | null): string[] {
  if (!base) return [];
  const f = levelOf(base, 'factory');
  const r = levelOf(base, 'refinery');
  return Object.values(GOODS_BY_ID)
    .filter((g) => g.inputs && !g.tags.includes('illegal') && g.category !== 'special')
    .filter((g) => {
      const rawOnly = Object.keys(g.inputs!).every((i) => GOODS_BY_ID[i].category === 'raw');
      return rawOnly ? f + r > 0 : f > 0;
    })
    .map((g) => g.id);
}

export function maxLines(base: Base): number {
  return levelOf(base, 'factory') + levelOf(base, 'refinery');
}

export function setLine(state: GameState, goodId: string, on: boolean, cap = 0): Result {
  const base = state.base;
  if (!base) return fail('err.noBase');
  if (on) {
    if (!producibleGoods(base).includes(goodId)) return fail('err.cantProduce');
    if (base.lines.some((l) => l.goodId === goodId)) {
      base.lines.find((l) => l.goodId === goodId)!.cap = cap;
      return ok();
    }
    if (base.lines.length >= maxLines(base)) return fail('err.linesFull');
    base.lines.push({ goodId, cap });
  } else base.lines = base.lines.filter((l) => l.goodId !== goodId);
  return ok();
}

export function setAutoSell(state: GameState, goodId: string, keep: number | null): Result {
  const base = state.base;
  if (!base) return fail('err.noBase');
  if (levelOf(base, 'port') < 1) return fail('err.needPort');
  if (keep === null) delete base.autoSell[goodId];
  else base.autoSell[goodId] = Math.max(0, Math.floor(keep));
  return ok();
}

function add(base: Base, goodId: string, n: number): number {
  const room = storageLeft(base);
  const k = Math.min(n, room);
  if (k > 0) base.storage[goodId] = (base.storage[goodId] ?? 0) + k;
  return k;
}

/** What the mine delivers per day (units per good) from the deposits the player has revealed in the system. */
export function mineOutput(state: GameState): { goodId: string; perDay: number }[] {
  const base = state.base;
  if (!base) return [];
  const lvl = levelOf(base, 'mine');
  if (lvl <= 0) return [];
  const g = galaxyOf(state);
  const sys = g.systems[base.systemId];
  const deps: { goodId: string; richness: number }[] = [];
  for (const b of sys.bodies) {
    const dyn = state.bodies[b.id];
    if (!dyn) continue;
    for (const d of b.deposits)
      if (dyn.revealed.includes(d.id)) deps.push({ goodId: d.goodId, richness: d.richness });
  }
  deps.sort((a, b) => b.richness - a.richness);
  const use = deps.slice(0, lvl + 1);
  return use.map((d) => ({
    goodId: d.goodId,
    perDay: Math.round(lvl * 1.15 * (0.35 + d.richness) * 100) / 100,
  }));
}

function produce(state: GameState, base: Base): void {
  for (const m of mineOutput(state)) {
    const k = add(base, m.goodId, m.perDay);
    base.stats.produced += k;
  }
  let ref = 3 * levelOf(base, 'refinery');
  let fac = 3 * levelOf(base, 'factory');
  for (const line of base.lines) {
    const good = GOODS_BY_ID[line.goodId];
    if (!good?.inputs) continue;
    if (line.cap > 0 && (base.storage[line.goodId] ?? 0) >= line.cap) continue;
    const rawOnly = Object.keys(good.inputs).every((i) => GOODS_BY_ID[i].category === 'raw');
    let want = Math.min(rawOnly ? ref + fac : fac, 14, storageLeft(base));
    for (const [inp, per] of Object.entries(good.inputs))
      want = Math.min(want, (base.storage[inp] ?? 0) / per);
    if (want <= 0.01) continue;
    for (const [inp, per] of Object.entries(good.inputs)) {
      base.storage[inp] -= want * per;
      if (base.storage[inp] < 1e-6) delete base.storage[inp];
    }
    add(base, line.goodId, want);
    base.stats.produced += want;
    if (rawOnly) {
      const fromRef = Math.min(ref, want);
      ref -= fromRef;
      fac -= want - fromRef;
    } else fac -= want;
  }
}

/** The port sells surplus above the keep levels at a discount, up to a daily limit. */
function portSales(state: GameState, base: Base): void {
  const lvl = levelOf(base, 'port');
  if (lvl <= 0) return;
  let room = 6 * lvl;
  const factor = 0.62 + 0.05 * lvl;
  for (const [gid, keep] of Object.entries(base.autoSell)) {
    if (room <= 0) break;
    const have = base.storage[gid] ?? 0;
    const n = Math.min(room, Math.floor(have - keep));
    if (n <= 0) continue;
    base.storage[gid] = have - n;
    if (base.storage[gid] <= 0) delete base.storage[gid];
    const income = n * GOODS_BY_ID[gid].basePrice * factor;
    base.treasury += income;
    base.stats.sold += income;
    room -= n;
  }
  void state;
}

/* ------------------------------ build orders ------------------------------ */

export function moduleMaterials(price: number): Record<string, number> {
  return {
    construction: Math.ceil(price / 220),
    machinery: Math.ceil(price / 500),
    electronics: Math.ceil(price / 900),
  };
}

export function hullMaterials(price: number): Record<string, number> {
  return {
    construction: Math.ceil(price / 260),
    machinery: Math.ceil(price / 700),
    alloys: Math.ceil(price / 900),
    electronics: Math.ceil(price / 2200),
  };
}

function hasMaterials(base: Base, mats: Record<string, number>): boolean {
  return Object.entries(mats).every(([gid, n]) => (base.storage[gid] ?? 0) >= n);
}

/** The last check of every base order (building, module, hull): can the player pay for it? */
function paymentError(
  state: GameState,
  base: Base,
  credits: number,
  mats: Record<string, number>,
): string | null {
  if (state.credits < credits) return 'err.noCredits';
  if (!hasMaterials(base, mats)) return 'err.baseMaterials';
  return null;
}

function takeMaterials(base: Base, mats: Record<string, number>): boolean {
  if (!hasMaterials(base, mats)) return false;
  for (const [gid, n] of Object.entries(mats)) {
    base.storage[gid] -= n;
    if (base.storage[gid] <= 1e-6) delete base.storage[gid];
  }
  return true;
}

/** Quote for a production order at the base; `error` says why it cannot be placed. */
export interface OrderCheck {
  ok: boolean;
  error?: string;
  credits: number;
  days: number;
  materials: Record<string, number>;
}

/** Checks shared by module and hull orders once their own requirements are met: queue room and payment. */
function queueOrder(state: GameState, base: Base, res: Omit<OrderCheck, 'ok'>): OrderCheck {
  if (base.orders.length >= MAX_ORDERS) return { ok: false, error: 'err.queueFull', ...res };
  const unpaid = paymentError(state, base, res.credits, res.materials);
  return unpaid ? { ok: false, error: unpaid, ...res } : { ok: true, ...res };
}

/** Pay for a checked order and put it in the production queue. */
function placeOrder(
  state: GameState,
  chk: OrderCheck,
  order: Omit<BuildOrder, 'id' | 'start' | 'done'>,
): void {
  const base = state.base!;
  takeMaterials(base, chk.materials);
  state.credits -= chk.credits;
  base.orders.push({ id: newUid(state, 'o'), ...order, start: state.day, done: state.day + chk.days });
}

export function checkModuleOrder(state: GameState, moduleId: string): OrderCheck {
  const base = state.base;
  const def = MODULES_BY_ID[moduleId];
  const z = { credits: 0, days: 0, materials: {} };
  if (!base) return { ok: false, error: 'err.noBase', ...z };
  if (!def || def.core) return { ok: false, error: 'err.noModule', ...z };
  const q = fabQuality(state.research.done);
  const price = modulePrice(def, q);
  const res = {
    credits: Math.round(price * 0.5),
    days: Math.max(1, Math.ceil(price / 900)),
    materials: moduleMaterials(price),
  };
  const f = levelOf(base, 'factory');
  const need = def.size === 'L' ? 3 : def.size === 'M' ? 2 : 1;
  if (f < need) return { ok: false, error: 'err.needFactory', ...res };
  const gate = moduleUnlocked(state, moduleId);
  if (!gate) return { ok: false, error: 'err.techNeeded', ...res };
  return queueOrder(state, base, res);
}

export function commissionModule(state: GameState, moduleId: string): Result {
  if (!inBaseSystem(state)) return fail('err.notAtBase');
  const chk = checkModuleOrder(state, moduleId);
  if (!chk.ok) return fail(chk.error!);
  placeOrder(state, chk, { kind: 'module', item: moduleId, quality: fabQuality(state.research.done) });
  return ok();
}

export function checkHullOrder(state: GameState, hullId: string): OrderCheck {
  const base = state.base;
  const h = HULLS_BY_ID[hullId];
  const z = { credits: 0, days: 0, materials: {} };
  if (!base) return { ok: false, error: 'err.noBase', ...z };
  if (!h) return { ok: false, error: 'err.noHull', ...z };
  const res = {
    credits: Math.round(h.price * 0.5),
    days: Math.max(2, Math.ceil(h.price / 2000)),
    materials: hullMaterials(h.price),
  };
  if (levelOf(base, 'shipyard') < h.tier - 1) return { ok: false, error: 'err.needShipyard', ...res };
  if (h.tech && !hasTech(state, h.tech)) return { ok: false, error: 'err.techNeeded', ...res };
  if (h.faction && !(state.fac.member === h.faction && state.fac.rank >= 2))
    return { ok: false, error: 'err.facHull', ...res };
  if (base.hangar.length + base.orders.filter((o) => o.kind === 'hull').length >= hangarSlots(base))
    return { ok: false, error: 'err.hangarFull', ...res };
  return queueOrder(state, base, res);
}

export function commissionHull(state: GameState, hullId: string): Result {
  if (!inBaseSystem(state)) return fail('err.notAtBase');
  const chk = checkHullOrder(state, hullId);
  if (!chk.ok) return fail(chk.error!);
  placeOrder(state, chk, { kind: 'hull', item: hullId });
  return ok();
}

function completeOrder(state: GameState, base: Base, o: BuildOrder): void {
  if (o.kind === 'module') {
    state.inventory.push(newModule(o.item, (o.quality ?? 'C') as never, newUid(state, 'm')));
    msg(state, 'msg.orderModule', { module: o.item }, 'good');
  } else {
    const rng = Rng.fromSeed(`${state.seed}:fleetname:${o.id}`);
    const name = `${rng.pick(['Svítání', 'Kometa', 'Vytrvalost', 'Horizont', 'Lyra', 'Orion', 'Zimní', 'Majáček'])} ${base.hangar.length + 2}`;
    const ship = buildStarterShip(o.item, name, () => newUid(state, 'm'));
    base.hangar.push({
      id: newUid(state, 'f'),
      name,
      ship,
      crew: defaultCrew(`${state.seed}:fleet:${o.id}`, o.item, state.day, () => newUid(state, 'w')),
      order: 'idle',
      route: null,
      trip: null,
      earned: 0,
      trips: 0,
      idleUntil: 0,
    });
    msg(state, 'msg.orderHull', { hull: o.item }, 'good');
  }
}

/* ------------------------------ attacks ------------------------------ */

function attackStrength(state: GameState, day: number): number {
  const rk = state.difficulty.risk === 'low' ? 0.75 : state.difficulty.risk === 'high' ? 1.35 : 1;
  const threatBoost = 1 + Math.min(1.2, (state.threat.consumed / Math.max(1, state.galaxySize)) * 3);
  return Math.round((14 + day * 0.18) * rk * threatBoost);
}

function attackChance(state: GameState, base: Base): number {
  const g = galaxyOf(state);
  const sys = g.systems[base.systemId];
  const rk = state.difficulty.risk === 'low' ? 0.6 : state.difficulty.risk === 'high' ? 1.5 : 1;
  const owner = ownerOf(state, sys.id);
  let f = 1;
  if (owner === 'corsairs') f = repOf(state, 'corsairs') >= 25 ? 0.2 : 1.6;
  else if (owner) f = 0.7;
  const wealth = Math.min(2, baseValue(base) / 60000);
  const grey = Math.max(0, (state.threat.grip[base.systemId] ?? 0) - 20) / 60;
  return Math.min(0.12, 0.004 * (0.5 + sys.danger * 2) * (0.6 + wealth) * rk * f + grey * 0.01);
}

/** Resolve an attack by simulation (defence rating vs. strength). Returns true when the raiders were beaten. */
export function resolveAttack(state: GameState, base: Base, day: number): boolean {
  const a = base.attack!;
  const def = defenseRating(state);
  const rng = Rng.fromSeed(`${state.seed}:attack:${a.day}`);
  const ratio = def / Math.max(1, a.strength);
  const pWin = Math.max(0.03, Math.min(0.97, ratio / (1 + ratio) + (ratio - 1) * 0.18));
  const won = rng.chance(pWin);
  base.attack = null;
  delete state.flags['baseDefense'];
  base.stats.attacks++;
  if (won) {
    base.stats.repelled++;
    log(base, day, 'repelled', { strength: a.strength });
    msg(state, 'msg.baseRepelled', { name: base.name }, 'good');
    return true;
  }
  // damage: lose part of the stock and the treasury, and a building loses a level
  for (const gid of Object.keys(base.storage)) base.storage[gid] = Math.floor(base.storage[gid] * 0.6);
  base.treasury = Math.floor(base.treasury * 0.7);
  const ids = Object.keys(base.buildings).filter((k) => (base.buildings[k] ?? 0) > 0);
  if (ids.length) {
    const id = rng.pick(ids);
    base.buildings[id]--;
    if (base.buildings[id] <= 0) delete base.buildings[id];
    log(base, day, 'damaged', { building: id as never });
    msg(state, 'msg.baseDamaged', { name: base.name, building: id }, 'bad');
  } else msg(state, 'msg.baseDamaged2', { name: base.name }, 'bad');
  return false;
}

/** The player can fly to a threatened base and fight the raiders himself. */
export function defendBase(state: GameState): Result {
  const base = state.base;
  if (!base?.attack) return fail('err.noAttack');
  if (!inBaseSystem(state)) return fail('err.notAtBase');
  if (state.encounter || state.combat) return fail('err.eventPending');
  const tier = base.attack.strength > 60 ? 3 : base.attack.strength > 30 ? 2 : 1;
  state.flags['baseDefense'] = base.attack.day;
  // reuse the encounter machinery: a raid is a pirate fight
  spawnEncounter(state, tier >= 3 ? 'warlord' : tier === 2 ? 'corsair' : 'raider', tier);
  if (!state.encounter) {
    delete state.flags['baseDefense'];
    return fail('err.noAttack');
  }
  return ok();
}

/** Called when a fight ends: a won defence of the base ends the attack. */
export function onBaseFightEnded(state: GameState, won: boolean): void {
  const base = state.base;
  if (!base || state.flags['baseDefense'] === undefined) return;
  delete state.flags['baseDefense'];
  if (!won || !base.attack) return;
  base.attack = null;
  base.stats.attacks++;
  base.stats.repelled++;
  log(base, state.day, 'defended');
  addRep(state, 'directorate', 0.5, false);
  msg(state, 'msg.baseDefended', { name: base.name }, 'good');
}

/* ------------------------------ daily tick ------------------------------ */

export function baseDaily(state: GameState, day: number): void {
  const base = state.base;
  if (!base) return;
  if (base.lastTick >= day) return;
  base.lastTick = day;
  // construction
  for (const q of [...base.queue]) {
    if (day < q.done) continue;
    base.buildings[q.id] = q.level;
    base.queue = base.queue.filter((x) => x !== q);
    log(base, day, 'built', { building: q.id, level: q.level });
    msg(state, 'msg.baseBuilt', { building: q.id, level: q.level }, 'good');
  }
  // upkeep: from the treasury first, then from the captain's purse; unpaid = no production today
  const up = upkeepPerDay(base);
  let paid = true;
  if (up > 0) {
    if (base.treasury >= up) base.treasury -= up;
    else if (state.credits >= up) state.credits -= up;
    else paid = false;
    if (paid) base.stats.upkeep += up;
    else if (day % 5 === 0) msg(state, 'msg.baseUnpaid', { name: base.name }, 'warn');
  }
  if (paid) {
    produce(state, base);
    portSales(state, base);
  }
  for (const o of [...base.orders]) {
    if (day < o.done) continue;
    base.orders = base.orders.filter((x) => x !== o);
    completeOrder(state, base, o);
  }
  // raiders
  if (!base.attack) delete state.flags['baseDefense'];
  if (base.attack) {
    if (day >= base.attack.resolve) resolveAttack(state, base, day);
  } else if (day > base.founded + 12) {
    const rng = Rng.fromSeed(`${state.seed}:attackroll:${day}`);
    if (rng.chance(attackChance(state, base))) {
      base.attack = { strength: attackStrength(state, day), day, resolve: day + 3 };
      msg(state, 'msg.baseAttack', { name: base.name, days: 3 }, 'bad');
      log(base, day, 'attack', { strength: base.attack.strength });
    }
  }
  fleetDaily(state, day);
}

/* ------------------------------ repairs at the base ------------------------------ */

/** Free field repairs at a base with a shipyard (hull and modules), paid in spare time: costs a little credit. */
export function repairAtBase(state: GameState): Result<{ paid: number }> {
  const base = state.base;
  if (!base) return fail('err.noBase');
  if (!inBaseSystem(state)) return fail('err.notAtBase');
  if (levelOf(base, 'shipyard') < 1) return fail('err.needShipyard');
  const { stats } = analyze(state);
  const missing = Math.max(0, stats.hpMax - state.ship.hp);
  let cost = missing * T.repairHullPrice * 0.5;
  for (const m of state.ship.slots)
    if (m && m.condition < 100) cost += (100 - m.condition) * T.repairHullPrice * 0.3;
  cost = Math.round(cost);
  if (cost <= 0) return fail('err.nothingToRepair');
  if (state.credits < cost) return fail('err.noCredits');
  state.credits -= cost;
  state.ship.hp = stats.hpMax;
  for (const m of state.ship.slots) if (m) m.condition = 100;
  return ok({ paid: cost });
}

/* ------------------------------ services of the base ------------------------------ */

/** Fuel and supplies at the base cost a little less than at a station (no margin), but only in the base system. */
export function baseServiceCost(state: GameState): { fuel: number; supplies: number } {
  const { stats } = analyze(state);
  return {
    fuel: Math.round(Math.max(0, stats.fuelCap - state.ship.fuel) * T.fuelPrice * 0.8),
    supplies: Math.round(Math.max(0, stats.suppliesCap - state.ship.supplies) * T.suppliesPrice * 0.8),
  };
}

export function refuelAtBase(state: GameState): Result<{ paid: number }> {
  if (!state.base) return fail('err.noBase');
  if (!inBaseSystem(state)) return fail('err.notAtBase');
  const cost = baseServiceCost(state).fuel;
  if (cost <= 0) return fail('err.nothingToMove');
  if (state.credits < cost) return fail('err.noCredits');
  state.credits -= cost;
  state.ship.fuel = analyze(state).stats.fuelCap;
  return ok({ paid: cost });
}

export function resupplyAtBase(state: GameState): Result<{ paid: number }> {
  if (!state.base) return fail('err.noBase');
  if (!inBaseSystem(state)) return fail('err.notAtBase');
  const cost = baseServiceCost(state).supplies;
  if (cost <= 0) return fail('err.nothingToMove');
  if (state.credits < cost) return fail('err.noCredits');
  state.credits -= cost;
  state.ship.supplies = analyze(state).stats.suppliesCap;
  return ok({ paid: cost });
}
