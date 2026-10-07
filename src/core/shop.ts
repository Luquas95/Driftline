import { HULLS, HULLS_BY_ID } from '../content/hulls';
import { MODULES, MODULES_BY_ID } from '../content/modules';
import { STATION_TYPES_BY_ID } from '../content/stations';
import { serviceMult } from './economy';
import { Rng } from './rng';
import { autoArrange, gridDims } from './cargo';
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
import { analyze, fail, galaxyOf, msg, newUid, ok, stationOf, type Result } from './state';
import {
  QUALITIES,
  type GameState,
  type ModuleInstance,
  type Quality,
  type Ship,
  type StationStatic,
} from './types';

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
    (h) => h.tier <= tier || (h.tier === tier + 1 && rng.chance(0.3)) || h.id === 'wayfarer',
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
    (m) => (m.size !== 'L' || tier >= 2) && !(tier === 1 && m.kind === 'amplifier'),
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
  const st = dockedShop(state, stationId);
  if (!st) return fail('err.noShipyard');
  let m = state.inventory.find((x) => x.uid === uid);
  if (m) state.inventory = state.inventory.filter((x) => x.uid !== uid);
  else {
    const idx = state.ship.slots.findIndex((x) => x?.uid === uid);
    if (idx < 0) return fail('err.itemGone');
    m = state.ship.slots[idx]!;
    if (MODULES_BY_ID[m.defId].core) {
      // refuse to strip the last core module of a kind
      return fail('err.sellCore');
    }
    state.ship.slots[idx] = null;
  }
  const price = sellValue(m);
  state.credits += price;
  return ok({ price });
}

export function installModule(state: GameState, uid: string, slotIndex: number): Result {
  if (!state.location.stationId) return fail('err.mustBeDocked');
  const inv = state.inventory.findIndex((x) => x.uid === uid);
  if (inv < 0) return fail('err.itemGone');
  const slot = hullSlots(state.ship.hullId)[slotIndex];
  if (!slot) return fail('err.noSlot');
  const m = state.inventory[inv];
  if (!moduleFits(slot, MODULES_BY_ID[m.defId])) return fail('err.moduleDoesNotFit');
  const old = state.ship.slots[slotIndex];
  const trial: Ship = { ...state.ship, slots: state.ship.slots.map((x, i) => (i === slotIndex ? m : x)) };
  const stats = computeShipStats(trial);
  // the cargo hold must still hold the cargo
  const dims = gridDims(stats);
  const cargoCopy = state.cargo.map((c) => ({ ...c }));
  if (!autoArrange(cargoCopy, dims)) return fail('err.cargoWontFit');
  state.inventory.splice(inv, 1);
  if (old) state.inventory.push(old);
  state.ship.slots[slotIndex] = m;
  for (let i = 0; i < state.cargo.length; i++)
    Object.assign(state.cargo[i], { x: cargoCopy[i].x, y: cargoCopy[i].y });
  clampShipResources(state);
  return ok();
}

export function removeModuleToInventory(state: GameState, slotIndex: number): Result {
  if (!state.location.stationId) return fail('err.mustBeDocked');
  const m = state.ship.slots[slotIndex];
  if (!m) return fail('err.noModule');
  const trial: Ship = { ...state.ship, slots: state.ship.slots.map((x, i) => (i === slotIndex ? null : x)) };
  const dims = gridDims(computeShipStats(trial));
  const cargoCopy = state.cargo.map((c) => ({ ...c }));
  if (!autoArrange(cargoCopy, dims)) return fail('err.cargoWontFit');
  state.ship.slots[slotIndex] = null;
  state.inventory.push(m);
  for (let i = 0; i < state.cargo.length; i++)
    Object.assign(state.cargo[i], { x: cargoCopy[i].x, y: cargoCopy[i].y });
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
  m.enabled = enabled ?? !m.enabled;
  return ok();
}

/** Disassemble a module into raw materials (works anywhere, even in an emergency). */
export function disassembleModule(
  state: GameState,
  uid: string,
  addGoodsFn: (goodId: string, qty: number) => number,
): Result<{ metals: number; parts: number }> {
  let m = state.inventory.find((x) => x.uid === uid);
  if (m) state.inventory = state.inventory.filter((x) => x.uid !== uid);
  else {
    const fromSlot = state.ship.slots.findIndex((x) => x?.uid === uid);
    if (fromSlot < 0) return fail('err.itemGone');
    m = state.ship.slots[fromSlot]!;
    if (MODULES_BY_ID[m.defId].core) return fail('err.sellCore');
    state.ship.slots[fromSlot] = null;
  }
  const value = modulePrice(MODULES_BY_ID[m.defId], m.quality);
  const metals = Math.max(2, Math.round(value / 90));
  const parts = Math.max(1, Math.round(value / 260));
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
        (defaults.has(cur.uid) && def.core && QUALITIES.indexOf(m.quality) >= QUALITIES.indexOf(cur.quality))
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
  const after = computeShipStats(result, before.mass - before.hullMass + 0);
  const dims = gridDims(computeShipStats(result));
  const cargoCopy = state.cargo.map((c) => ({ ...c }));
  const cargoFits = autoArrange(cargoCopy, dims);
  result.fuel = Math.min(state.ship.fuel, after.fuelCap);
  result.supplies = Math.min(state.ship.supplies, after.suppliesCap);
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
  const dyn = state.stations[stationId];
  if (!dyn.shop.hulls.includes(hullId)) return fail('err.itemGone');
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
  msg(state, 'msg.boughtHull', { hull: hullId, price: cost }, 'good');
  return ok();
}
