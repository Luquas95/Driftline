import { HULLS_BY_ID } from '../content/hulls';
import { MODULES_BY_ID, QUALITY } from '../content/modules';
import type { HullDef, ModuleDef, ModuleInstance, ModuleKind, Quality, Ship, Size, SlotDef } from './types';
import { CORE_KINDS } from './types';
import { T } from './tuning';

const CORE_TOKEN: Record<string, ModuleKind> = { r: 'reactor', e: 'engine', j: 'jump', l: 'life', n: 'sensors' };
const slotCache = new Map<string, SlotDef[]>();

export function hullSlots(hullId: string): SlotDef[] {
  let s = slotCache.get(hullId);
  if (s) return s;
  const hull = HULLS_BY_ID[hullId];
  s = [];
  hull.layout.forEach((row, y) => {
    [...row].forEach((tok, x) => {
      if (tok === '.') return;
      if (tok in CORE_TOKEN) s!.push({ index: s!.length, x, y, size: hull.coreSize, core: CORE_TOKEN[tok] });
      else s!.push({ index: s!.length, x, y, size: tok as Size });
    });
  });
  slotCache.set(hullId, s);
  return s;
}

const SIZE_RANK: Record<Size, number> = { S: 1, M: 2, L: 3 };

export function moduleFits(slot: SlotDef, def: ModuleDef): boolean {
  if (SIZE_RANK[def.size] > SIZE_RANK[slot.size]) return false;
  if (slot.core) return def.kind === slot.core;
  return !def.core;
}

export function modulePrice(def: ModuleDef, q: Quality): number {
  return Math.round((def.price * QUALITY[q].price) / 10) * 10;
}

/** Current resale/insured value reflects wear. */
export function moduleValue(m: ModuleInstance): number {
  const def = MODULES_BY_ID[m.defId];
  return Math.round(modulePrice(def, m.quality) * (0.5 + 0.5 * (m.condition / 100)));
}

export function perf(condition: number): number {
  if (condition <= 0) return 0;
  if (condition >= 60) return 1;
  return 0.5 + (condition / 60) * 0.5;
}

export function neighbours(hullId: string, index: number): number[] {
  const slots = hullSlots(hullId);
  const me = slots[index];
  return slots.filter((o) => o.index !== index && Math.abs(o.x - me.x) + Math.abs(o.y - me.y) === 1).map((o) => o.index);
}

export interface ShipStats {
  mass: number;
  hullMass: number;
  powerOut: number;
  idleDraw: number;
  jumpDraw: number;
  mineDraw: number;
  scanDraw: number;
  powerFree: number;
  /** Power left while performing each activity. */
  powerJump: number;
  powerMine: number;
  powerScan: number;
  thrust: number;
  jumpEff: number;
  jumpSpeed: number;
  fuelPerLy: number;
  fuelCap: number;
  /** Maximum jump distance on a full tank (ly). */
  rangeFull: number;
  range: number;
  cargoCells: number;
  chilledCells: number;
  secureCells: number;
  beds: number;
  comfort: number;
  scanPower: number;
  sensorRange: number;
  surfacePower: number;
  hasProbe: boolean;
  probeValue: number;
  repairRate: number;
  laserYield: number;
  scoopYield: number;
  refineRate: number;
  shieldCap: number;
  hpMax: number;
  suppliesCap: number;
  suppliesPerDay: number;
  crew: number;
  lifeCrew: number;
  coreMissing: ModuleKind[];
  cargoCols: number;
  speedAuDay: number;
  moduleCount: number;
  /** Per slot: effective power draw (after radiator), boost multiplier. */
  slotInfo: { draw: number; boost: number; active: boolean; perf: number }[];
}

/**
 * Derives all ship properties. Pure and cheap, so the UI can call it for previews with hypothetical
 * ships (shipyard) or cargo masses (route planner).
 */
export function computeShipStats(ship: Ship, cargoMass = 0, overloadCells = 0): ShipStats {
  const hull: HullDef = HULLS_BY_ID[ship.hullId];
  const slots = hullSlots(ship.hullId);
  const info = slots.map(() => ({ draw: 0, boost: 1, active: false, perf: 0 }));
  // adjacency first
  slots.forEach((_, i) => {
    let boost = 0;
    let powerCut = 0;
    for (const n of neighbours(ship.hullId, i)) {
      const nm = ship.slots[n];
      if (!nm || !nm.enabled || nm.condition <= 0) continue;
      const adj = MODULES_BY_ID[nm.defId].adjacency;
      if (!adj) continue;
      const qv = QUALITY[nm.quality].value;
      if (adj.boost) boost += adj.boost * qv;
      if (adj.powerCut) powerCut += adj.powerCut * qv;
    }
    info[i].boost = 1 + Math.min(0.45, boost);
    info[i].draw = Math.max(0, 1 - Math.min(0.3, powerCut));
  });

  const s: ShipStats = {
    mass: hull.mass,
    hullMass: hull.mass,
    powerOut: 0,
    idleDraw: 0,
    jumpDraw: 0,
    mineDraw: 0,
    scanDraw: 0,
    powerFree: 0,
    powerJump: 0,
    powerMine: 0,
    powerScan: 0,
    thrust: 0,
    jumpEff: 0,
    jumpSpeed: 0,
    fuelPerLy: 0,
    fuelCap: hull.fuel,
    rangeFull: 0,
    range: 0,
    cargoCells: hull.cargoCells,
    chilledCells: 0,
    secureCells: 0,
    beds: 0,
    comfort: 0,
    scanPower: 0,
    sensorRange: 0,
    surfacePower: 0,
    hasProbe: false,
    probeValue: 0,
    repairRate: 0,
    laserYield: 0,
    scoopYield: 0,
    refineRate: 0,
    shieldCap: 0,
    hpMax: hull.hp,
    suppliesCap: hull.supplies,
    suppliesPerDay: 0,
    crew: hull.crew,
    lifeCrew: 0,
    coreMissing: [],
    cargoCols: hull.cargoCols,
    speedAuDay: 0,
    moduleCount: 0,
    slotInfo: info,
  };

  const present = new Set<ModuleKind>();
  ship.slots.forEach((m, i) => {
    if (!m) return;
    const def = MODULES_BY_ID[m.defId];
    const q = QUALITY[m.quality];
    s.mass += def.mass * q.mass;
    s.moduleCount++;
    const operable = m.enabled && m.condition > 0;
    info[i].active = operable;
    info[i].perf = perf(m.condition);
    if (!operable) return;
    present.add(def.kind);
    const eff = def.value * q.value * perf(m.condition) * info[i].boost;
    const draw = def.power * q.power * info[i].draw;
    switch (def.kind) {
      case 'reactor':
        s.powerOut += eff;
        break;
      case 'engine':
        s.thrust += eff;
        s.jumpDraw += draw;
        break;
      case 'jump':
        s.jumpEff += eff;
        s.jumpSpeed += (def.aux ?? 4) * (0.6 + 0.4 * q.value) * perf(m.condition);
        s.jumpDraw += draw;
        break;
      case 'life':
        s.lifeCrew += Math.floor(eff);
        break;
      case 'sensors':
        s.scanPower += eff;
        break;
      case 'cargo':
        s.cargoCells += Math.round(eff);
        break;
      case 'fuel':
        s.fuelCap += eff;
        break;
      case 'cooler':
        s.chilledCells += Math.round(eff);
        break;
      case 'vault':
        s.secureCells += Math.round(eff);
        break;
      case 'laser':
        s.laserYield += eff;
        s.mineDraw += draw;
        break;
      case 'scoop':
        s.scoopYield += eff;
        s.mineDraw += draw;
        break;
      case 'refinery':
        s.refineRate += eff;
        s.mineDraw += draw;
        break;
      case 'surface':
        s.surfacePower += eff;
        s.scanDraw += draw;
        break;
      case 'probe':
        s.hasProbe = true;
        s.probeValue += eff;
        s.scanDraw += draw;
        break;
      case 'repair':
        s.repairRate += eff;
        s.scanDraw += draw;
        break;
      case 'shield':
        s.shieldCap += eff;
        break;
      case 'quarters':
        s.beds += Math.round(eff);
        s.comfort = Math.max(s.comfort, def.aux ?? 1);
        break;
      default:
        break;
    }
    if (def.kind !== 'reactor' && def.powerMode === 'always') s.idleDraw += draw;
  });
  s.coreMissing = CORE_KINDS.filter((k) => !present.has(k));
  s.sensorRange = s.scanPower > 0 ? 5 + s.scanPower * 2.2 : 0;
  s.mass += cargoMass;
  s.powerFree = s.powerOut - s.idleDraw;
  s.powerJump = s.powerFree - s.jumpDraw;
  s.powerMine = s.powerFree - s.mineDraw;
  s.powerScan = s.powerFree - s.scanDraw;
  s.fuelPerLy = s.jumpEff > 0 ? (T.fuelK * s.mass) / s.jumpEff : Infinity;
  s.rangeFull = s.fuelPerLy > 0 && isFinite(s.fuelPerLy) ? s.fuelCap / s.fuelPerLy : 0;
  s.range = s.fuelPerLy > 0 && isFinite(s.fuelPerLy) ? ship.fuel / s.fuelPerLy : 0;
  s.suppliesPerDay = s.crew * T.supplyPerCrewDay * (1 + 0.12 * overloadCells);
  s.speedAuDay = s.thrust > 0 ? (s.thrust * hull.agility) / (s.mass * T.sublightK) : 0;
  return s;
}

export function canJump(st: ShipStats): { ok: boolean; reason?: string } {
  if (st.coreMissing.includes('jump')) return { ok: false, reason: 'jumpMissing' };
  if (st.coreMissing.includes('reactor')) return { ok: false, reason: 'reactorMissing' };
  if (st.coreMissing.includes('engine')) return { ok: false, reason: 'engineMissing' };
  if (st.powerJump < -0.001) return { ok: false, reason: 'power' };
  return { ok: true };
}

export function isOperational(st: ShipStats): boolean {
  return st.powerFree >= -0.001 && !st.coreMissing.includes('life') && !st.coreMissing.includes('reactor');
}

export function jumpFuelCost(st: ShipStats, ly: number): number {
  return ly * st.fuelPerLy;
}

export function jumpDays(st: ShipStats, ly: number): number {
  if (st.jumpSpeed <= 0) return Infinity;
  return ly / st.jumpSpeed + T.jumpOverhead;
}

export function sublightDays(st: ShipStats, au: number): number {
  if (st.speedAuDay <= 0) return Infinity;
  return Math.max(0.05, au / st.speedAuDay);
}

/** Wear a module; radiator neighbours cut wear. Returns the applied amount. */
export function wearModule(ship: Ship, slotIndex: number, amount: number): number {
  const m = ship.slots[slotIndex];
  if (!m || amount <= 0) return 0;
  let cut = 0;
  for (const n of neighbours(ship.hullId, slotIndex)) {
    const nm = ship.slots[n];
    if (nm && nm.enabled && nm.condition > 0) cut += (MODULES_BY_ID[nm.defId].adjacency?.wearCut ?? 0) * QUALITY[nm.quality].value;
  }
  const real = amount * QUALITY[m.quality].wear * (1 - Math.min(0.5, cut));
  const before = m.condition;
  m.condition = Math.max(0, m.condition - real);
  return before - m.condition;
}

export function slotsOfKind(ship: Ship, kind: ModuleKind): number[] {
  const out: number[] = [];
  ship.slots.forEach((m, i) => {
    if (m && MODULES_BY_ID[m.defId].kind === kind) out.push(i);
  });
  return out;
}

export function wearKind(ship: Ship, kind: ModuleKind, amount: number): void {
  for (const i of slotsOfKind(ship, kind)) wearModule(ship, i, amount);
}

export function shipValue(ship: Ship): number {
  const hull = HULLS_BY_ID[ship.hullId];
  let v = hull.price * (0.4 + 0.6 * (ship.hp / hull.hp));
  for (const m of ship.slots) if (m) v += moduleValue(m);
  return Math.round(v);
}

export function insuredValue(ship: Ship, full: boolean): number {
  const hull = HULLS_BY_ID[ship.hullId];
  let v = hull.price;
  for (const m of ship.slots) if (m && (full || MODULES_BY_ID[m.defId].core)) v += modulePrice(MODULES_BY_ID[m.defId], m.quality);
  return v;
}

let uidSeq = 0;
export function newModule(defId: string, quality: Quality, uid?: string): ModuleInstance {
  return { uid: uid ?? `m${++uidSeq}`, defId, quality, condition: 100, enabled: true };
}

/** Build a ship with default C-class core modules (used for new games). */
export function buildStarterShip(hullId: string, name: string, nextUid: () => string): Ship {
  const hull = HULLS_BY_ID[hullId];
  const slots = hullSlots(hullId);
  const ship: Ship = {
    hullId,
    name,
    slots: slots.map(() => null),
    hp: hull.hp,
    fuel: 0,
    supplies: hull.supplies,
    probes: 0,
    shield: 0,
  };
  for (const s of slots) {
    if (s.core) ship.slots[s.index] = newModule(`${s.core}_${s.size.toLowerCase()}`, 'C', nextUid());
  }
  const st = computeShipStats(ship);
  ship.fuel = st.fuelCap;
  return ship;
}

export function qualityLabel(q: Quality): string {
  return q;
}
