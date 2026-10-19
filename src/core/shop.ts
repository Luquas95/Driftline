import { HULLS, HULLS_BY_ID } from '../content/hulls';
import { MODULES, MODULES_BY_ID } from '../content/modules';
import { STATION_TYPES_BY_ID } from '../content/stations';
import { activePassengers } from './contractOps';
import { bedsUsedByCrew } from './crew';
import { serviceMult } from './economy';
import { exclusiveHullFor } from './factions';
import { moduleUnlocked } from './research';
import { Rng } from './rng';
import { autoArrange, cargoMass, gridDims } from './cargo';
import {
  buildStarterShip,
  computeShipStats,
  hullSlots,
  moduleFits,
  modulePrice,
  moduleValue,
  newModule,
  type ShipStats,
} from './ship';
import { addToHold, analyze, fail, galaxyOf, msg, newUid, ok, stationOf, type Result } from './state';
import {
  QUALITIES,
  type CargoItem,
  type GameState,
  type ModuleInstance,
  type Quality,
  type Ship,
  type StationStatic,
} from './types';

const SIZE_RANK = { S: 1, M: 2, L: 3 } as const;

export const SHOP_EPOCH_DAYS = 10;

const QUALITY_BY_TIER: Record<number, Quality[]> = {
  1: ['E', 'D', 'C', 'C', 'C'],
  2: ['D', 'C', 'C', 'B', 'B'],
  3: ['C', 'B', 'B', 'A', 'B'],
};

export function refreshShop(state: GameState, st: StationStatic): void {
  const dyn = state.stations[st.id];
  const tier = STATION_TYPES_BY_ID[st.type].shipyard;
  if (tier <= 0) return;
  const epoch = Math.floor(state.day / SHOP_EPOCH_DAYS);
  if (dyn.shop.epoch === epoch) return;
  const rng = Rng.fromSeed(`${state.seed}:shop:${st.id}:${epoch}`);
  const g = galaxyOf(state);
  const region = g.systems[st.systemId].region;
  const mult = serviceMult(st, region, state.difficulty);
  const hulls = HULLS.filter(
    (h) =>
      !h.faction &&
      !h.tech &&
      (h.tier <= tier || (h.tier === tier + 1 && rng.chance(0.3)) || h.id === 'wayfarer'),
  ).map((h) => h.id);
  const mods: ModuleInstance[] = [];
  const prices: number[] = [];
  const push = (defId: string, q: Quality) => {
    const def = MODULES_BY_ID[defId];
    mods.push({ ...newModule(defId, q, newUid(state, 'm')) });
    prices.push(Math.round((modulePrice(def, q) * mult * rng.range(0.93, 1.1)) / 10) * 10);
  };
  // always available basics
  for (const id of ['cargo_s', 'cargo_m', 'fuel_s', 'fuel_m']) push(id, 'C');
  const count = 6 + tier * 3;
  const pool = MODULES.filter(
    (m) =>
      (m.size !== 'L' || tier >= 2) && !(tier === 1 && m.kind === 'amplifier') && moduleUnlocked(state, m.id),
  );
  for (let i = 0; i < count; i++) {
    const def = rng.pick(pool);
    push(def.id, rng.pick(QUALITY_BY_TIER[tier]));
  }
  dyn.shop = {
    hulls,
    modules: mods.map((m, i) => ({ uid: m.uid, defId: m.defId, quality: m.quality, price: prices[i] })),
    epoch,
  };
}

/**
 * Hulls on offer at a station right now: the weekly shop selection plus what standing and research unlock
 * (the faction's own hull for friends and members, tech hulls at larger yards once researched).
 */
export function shopHulls(state: GameState, st: StationStatic): string[] {
  const dyn = state.stations[st.id];
  const out = [...dyn.shop.hulls];
  const ex = exclusiveHullFor(state, st);
  if (ex && !out.includes(ex)) out.push(ex);
  if (STATION_TYPES_BY_ID[st.type].shipyard >= 2)
    for (const h of HULLS)
      if (h.tech && state.research.done.includes(h.tech) && !out.includes(h.id)) out.push(h.id);
  return out;
}

export function hullTradeIn(state: GameState): number {
  const h = HULLS_BY_ID[state.ship.hullId];
  return Math.round(h.price * (0.4 + 0.6 * (state.ship.hp / h.hp)) * 0.7);
}

export function hullPrice(state: GameState, st: StationStatic, hullId: string): number {
  const g = galaxyOf(state);
  return (
    Math.round(
      (HULLS_BY_ID[hullId].price * serviceMult(st, g.systems[st.systemId].region, state.difficulty)) / 50,
    ) * 50
  );
}

/**
 * Would the ship still work with these slots? Cargo must still fit, and carried passengers need their beds.
 * On success the repacked cargo positions are applied; returns an error key otherwise.
 */
function refit(state: GameState, slots: (ModuleInstance | null)[]): string | null {
  const plan = refitPlan(state, slots);
  if ('error' in plan) return plan.error;
  applyLayout(state, plan.layout);
  return null;
}

/** The checks of `refit` without changing anything: an error key, or the repacked cargo to apply. */
function refitPlan(
  state: GameState,
  slots: (ModuleInstance | null)[],
): { error: string } | { layout: CargoItem[] } {
  const stats = computeShipStats({ ...state.ship, slots });
  const layout = cargoLayout(state, stats);
  if (!layout) return { error: 'err.cargoWontFit' };
  // passengers need beds the crew does not take; an overcrowded crew alone (a soft limit) blocks nothing
  const pax = state.contracts.filter((c) => c.state === 'active' && c.kind === 'passenger');
  const need = activePassengers(state);
  if (
    (need > 0 && need > stats.beds - bedsUsedByCrew(state)) ||
    pax.some((c) => (c.comfort ?? 1) > stats.comfort)
  )
    return { error: 'err.passengersAboard' };
  return { layout };
}

/** The cargo repacked (on a copy) for a ship with these stats, or null if it would not fit the new grid. */
function cargoLayout(state: GameState, stats: ShipStats): CargoItem[] | null {
  const copy = state.cargo.map((c) => ({ ...c }));
  return autoArrange(copy, gridDims(stats)) ? copy : null;
}

function applyLayout(state: GameState, layout: CargoItem[]): void {
  for (let i = 0; i < state.cargo.length; i++)
    Object.assign(state.cargo[i], { x: layout[i].x, y: layout[i].y });
}

const withoutSlot = (slots: (ModuleInstance | null)[], idx: number) =>
  slots.map((x, i) => (i === idx ? null : x));

/** Take a module out of the inventory, or off the ship if it is not a core module and the ship works without it. */
function takeModule(state: GameState, uid: string): Result<{ module: ModuleInstance }> {
  const inv = state.inventory.findIndex((x) => x.uid === uid);
  if (inv >= 0) return ok({ module: state.inventory.splice(inv, 1)[0] });
  const idx = state.ship.slots.findIndex((x) => x?.uid === uid);
  if (idx < 0) return fail('err.itemGone');
  const m = state.ship.slots[idx]!;
  if (MODULES_BY_ID[m.defId].core) return fail('err.sellCore');
  const bad = refit(state, withoutSlot(state.ship.slots, idx));
  if (bad) return fail(bad);
  state.ship.slots[idx] = null;
  return ok({ module: m });
}

export function sellValue(m: ModuleInstance): number {
  return Math.round(moduleValue(m) * 0.6);
}

function dockedShop(state: GameState, stationId: string): StationStatic | null {
  if (state.location.stationId !== stationId) return null;
  const st = stationOf(state, stationId);
  return STATION_TYPES_BY_ID[st.type].shipyard > 0 ? st : null;
}

export function buyModule(state: GameState, stationId: string, itemUid: string): Result {
  const st = dockedShop(state, stationId);
  if (!st) return fail('err.noShipyard');
  const dyn = state.stations[stationId];
  const item = dyn.shop.modules.find((m) => m.uid === itemUid);
  if (!item) return fail('err.itemGone');
  if (state.credits < item.price) return fail('err.noCredits');
  state.credits -= item.price;
  dyn.shop.modules = dyn.shop.modules.filter((m) => m.uid !== itemUid);
  state.inventory.push({
    uid: item.uid,
    defId: item.defId,
    quality: item.quality,
    condition: 100,
    enabled: true,
  });
  msg(state, 'msg.boughtModule', { module: item.defId, price: item.price }, 'info');
  return ok();
}

export function sellModule(state: GameState, stationId: string, uid: string): Result<{ price: number }> {
  if (!dockedShop(state, stationId)) return fail('err.noShipyard');
  const taken = takeModule(state, uid);
  if (!taken.ok) return taken;
  clampShipResources(state);
  const price = sellValue(taken.module);
  state.credits += price;
  return ok({ price });
}

/** Can this module go into that slot? Same rules as taking one out: the cargo must fit, passengers keep their beds. */
function installPlan(
  state: GameState,
  m: ModuleInstance,
  slotIndex: number,
): { error: string } | { layout: CargoItem[] } {
  const slot = hullSlots(state.ship.hullId)[slotIndex];
  if (!slot) return { error: 'err.noSlot' };
  if (!moduleFits(slot, MODULES_BY_ID[m.defId])) return { error: 'err.moduleDoesNotFit' };
  return refitPlan(
    state,
    state.ship.slots.map((x, i) => (i === slotIndex ? m : x)),
  );
}

/** Why a module (e.g. one still in a shop) could not be installed in that slot right now; null if it could. */
export function installError(
  state: GameState,
  item: Pick<ModuleInstance, 'defId' | 'quality'>,
  slotIndex: number,
): string | null {
  const plan = installPlan(state, { uid: '', condition: 100, enabled: true, ...item }, slotIndex);
  return 'error' in plan ? plan.error : null;
}

export function installModule(state: GameState, uid: string, slotIndex: number): Result {
  if (!state.location.stationId) return fail('err.mustBeDocked');
  const inv = state.inventory.findIndex((x) => x.uid === uid);
  if (inv < 0) return fail('err.itemGone');
  const m = state.inventory[inv];
  const old = state.ship.slots[slotIndex];
  const plan = installPlan(state, m, slotIndex);
  if ('error' in plan) return fail(plan.error);
  applyLayout(state, plan.layout);
  state.inventory.splice(inv, 1);
  if (old) state.inventory.push(old);
  state.ship.slots[slotIndex] = m;
  clampShipResources(state);
  return ok();
}

export function removeModuleToInventory(state: GameState, slotIndex: number): Result {
  if (!state.location.stationId) return fail('err.mustBeDocked');
  const m = state.ship.slots[slotIndex];
  if (!m) return fail('err.noModule');
  if (MODULES_BY_ID[m.defId].core) return fail('err.sellCore');
  const bad = refit(state, withoutSlot(state.ship.slots, slotIndex));
  if (bad) return fail(bad);
  state.ship.slots[slotIndex] = null;
  state.inventory.push(m);
  clampShipResources(state);
  return ok();
}

export function clampShipResources(state: GameState): void {
  const { stats } = analyze(state);
  state.ship.fuel = Math.min(state.ship.fuel, stats.fuelCap);
  state.ship.supplies = Math.min(state.ship.supplies, stats.suppliesCap);
  state.ship.shield = Math.min(state.ship.shield, stats.shieldCap);
}

export function toggleModule(state: GameState, slotIndex: number, enabled?: boolean): Result {
  const m = state.ship.slots[slotIndex];
  if (!m) return fail('err.noModule');
  const kind = MODULES_BY_ID[m.defId].kind;
  if (kind === 'reactor' || kind === 'life') return fail('err.cannotDisable');
  const next = enabled ?? !m.enabled;
  if (!next) {
    const bad = refit(
      state,
      state.ship.slots.map((x, i) => (i === slotIndex ? { ...x!, enabled: false } : x)),
    );
    if (bad) return fail(bad);
  }
  m.enabled = next;
  clampShipResources(state);
  return ok();
}

/**
 * Disassemble a module into raw materials (works anywhere, even in an emergency). The materials go to the
 * hold by default; `addGoodsFn` returns how many units it actually stored.
 */
export function disassembleModule(
  state: GameState,
  uid: string,
  addGoodsFn: (goodId: string, qty: number) => number = (g, q) => addToHold(state, g, q).added,
): Result<{ metals: number; parts: number }> {
  const taken = takeModule(state, uid);
  if (!taken.ok) return taken;
  const m = taken.module;
  const value = modulePrice(MODULES_BY_ID[m.defId], m.quality);
  const metals = Math.max(2, Math.round(value / 180));
  const parts = Math.max(1, Math.round(value / 520));
  addGoodsFn('metals', metals);
  addGoodsFn('spare_parts', parts);
  clampShipResources(state);
  return ok({ metals, parts });
}

export interface HullSwapPreview {
  ok: boolean;
  error?: string;
  cost: number;
  newShip: Ship;
  moved: string[];
  toInventory: string[];
  inventoryAdds: ModuleInstance[];
  before: ShipStats;
  after: ShipStats;
  cargoFits: boolean;
}

export function previewHullSwap(state: GameState, st: StationStatic, hullId: string): HullSwapPreview {
  const price = hullPrice(state, st, hullId);
  const cost = price - hullTradeIn(state);
  return swapCore(state, hullId, cost);
}

function swapCore(state: GameState, hullId: string, cost: number): HullSwapPreview {
  let n = 0;
  const fresh = buildStarterShip(hullId, state.ship.name, () => `d${++n}`);
  const defaults = new Set(fresh.slots.filter(Boolean).map((m) => m!.uid));
  const slots = hullSlots(hullId);
  const moved: string[] = [];
  const toInv: string[] = [];
  const old = state.ship.slots.filter(Boolean) as ModuleInstance[];
  const order = [...old].sort(
    (a, b) =>
      Number(MODULES_BY_ID[b.defId].core) - Number(MODULES_BY_ID[a.defId].core) ||
      QUALITIES.indexOf(b.quality) - QUALITIES.indexOf(a.quality),
  );
  const result: Ship = { ...fresh, slots: [...fresh.slots] };
  const placedInv: ModuleInstance[] = [];
  for (const m of order) {
    const def = MODULES_BY_ID[m.defId];
    let target = -1;
    for (const s of slots) {
      if (!moduleFits(s, def)) continue;
      const cur = result.slots[s.index];
      if (
        !cur ||
        (defaults.has(cur.uid) &&
          def.core &&
          (SIZE_RANK[def.size] > SIZE_RANK[MODULES_BY_ID[cur.defId].size] ||
            (def.size === MODULES_BY_ID[cur.defId].size &&
              QUALITIES.indexOf(m.quality) > QUALITIES.indexOf(cur.quality))))
      ) {
        target = s.index;
        break;
      }
    }
    if (target >= 0) {
      result.slots[target] = m;
      moved.push(m.uid);
    } else {
      placedInv.push(m);
      toInv.push(m.uid);
    }
  }
  const before = analyze(state).stats;
  const after = computeShipStats(result, cargoMass(state.cargo));
  const dims = gridDims(computeShipStats(result));
  const cargoCopy = state.cargo.map((c) => ({ ...c }));
  const cargoFits = autoArrange(cargoCopy, dims);
  result.fuel = Math.min(state.ship.fuel, after.fuelCap);
  result.supplies = Math.min(state.ship.supplies, after.suppliesCap);
  result.probes = state.ship.probes;
  return {
    ok: true,
    cost,
    newShip: result,
    moved,
    toInventory: toInv,
    inventoryAdds: placedInv,
    before,
    after,
    cargoFits,
  };
}

export function buyHull(state: GameState, stationId: string, hullId: string): Result {
  const st = dockedShop(state, stationId);
  if (!st) return fail('err.noShipyard');
  if (!shopHulls(state, st).includes(hullId)) return fail('err.itemGone');
  if (hullId === state.ship.hullId) return fail('err.sameHull');
  const price = hullPrice(state, st, hullId);
  const cost = price - hullTradeIn(state);
  if (state.credits < cost) return fail('err.noCredits');
  const p = swapCore(state, hullId, cost);
  if (!p.cargoFits) return fail('err.cargoWontFit');
  const dims = gridDims(computeShipStats(p.newShip));
  autoArrange(state.cargo, dims);
  state.credits -= cost;
  p.newShip.hp = HULLS_BY_ID[hullId].hp;
  state.ship = p.newShip;
  state.inventory.push(...p.inventoryAdds);
  clampShipResources(state);
  state.flags['hullChanges'] = Number(state.flags['hullChanges'] ?? 0) + 1;
  msg(state, 'msg.boughtHull', { hull: hullId, price: cost }, 'good');
  return ok();
}
