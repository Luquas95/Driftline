import { RACES_BY_ID } from '../../content/crew';
import { MODULES_BY_ID, QUALITY } from '../../content/modules';
import { isWeaponKind } from '../../content/weapons';
import { HULLS_BY_ID } from '../../content/hulls';
import { computeShipStats, hullSlots, neighbours, perf } from '../ship';
import type { CrewMember, ModuleKind, Ship } from '../types';
import type { CCrew, CRoom, CShip, CWeapon, Personality, PowerGroup, Side } from './types';

export const SHIELD_LAYER = 15;

export function groupOf(kind: ModuleKind): PowerGroup | null {
  if (kind === 'reactor') return null;
  if (isWeaponKind(kind)) return 'weapons';
  if (kind === 'shield') return 'shields';
  if (kind === 'engine' || kind === 'jump') return 'engines';
  if (kind === 'life') return 'life';
  return 'other';
}

export function crewToCombat(c: CrewMember, index: number, room: number): CCrew {
  const max = Math.round(100 * RACES_BY_ID[c.race].hp);
  return {
    id: c.id,
    name: c.name,
    race: c.race,
    role: c.role,
    skills: { ...c.skills },
    hp: Math.max(1, Math.min(max, c.hp)),
    maxHp: max,
    room,
    path: [],
    stepT: 0,
    post: null,
    task: 'idle',
    look: c.look,
    officer: c.officer,
    stateIndex: index,
    xp: {},
    boardedOn: -1,
  };
}

/** Where a crew role naturally works (core room kind). */
export const ROLE_ROOM: Record<string, ModuleKind> = {
  pilot: 'engine',
  engineer: 'reactor',
  medic: 'life',
  scientist: 'sensors',
};

export interface BuildOpts {
  side: Side;
  index: number;
  name: string;
  ship: Ship;
  crew: CCrew[];
  personality: Personality;
  lootId?: string;
  missiles?: number;
  /** Mass of the cargo (affects nothing in combat but keeps stats identical to the map). */
  cargoMass?: number;
  freeFlee?: boolean;
}

export function buildCombatShip(o: BuildOpts): CShip {
  const hull = HULLS_BY_ID[o.ship.hullId];
  const slots = hullSlots(o.ship.hullId);
  const stats = computeShipStats(o.ship, o.cargoMass ?? 0);
  const need: Record<PowerGroup, number> = { weapons: 0, shields: 0, engines: 0, life: 0, other: 0 };
  const rooms: CRoom[] = slots.map((sl) => {
    const m = o.ship.slots[sl.index];
    const def = m ? MODULES_BY_ID[m.defId] : null;
    if (m && def && m.enabled && m.condition > 0) {
      const g = groupOf(def.kind);
      if (g) need[g] += def.power * QUALITY[m.quality].power * stats.slotInfo[sl.index].draw;
    }
    return {
      slot: sl.index,
      x: sl.x,
      y: sl.y,
      kind: def ? def.kind : (sl.core ?? null),
      size: def ? def.size : sl.size,
      defId: m ? m.defId : null,
      quality: m ? m.quality : null,
      sys: m ? (m.enabled ? m.condition : 0) : sl.core ? 0 : 100,
      o2: 100,
      fire: 0,
      breach: 0,
      ion: 0,
      adj: neighbours(o.ship.hullId, sl.index),
    };
  });
  const weapons: CWeapon[] = [];
  o.ship.slots.forEach((m, i) => {
    if (!m) return;
    const def = MODULES_BY_ID[m.defId];
    if (!isWeaponKind(def.kind)) return;
    weapons.push({
      id: `${o.side[0]}${o.index}w${i}`,
      kind: def.kind,
      room: i,
      size: def.size,
      quality: m.quality,
      charge: 0.3,
      target: null,
      auto: true,
      cooldown: 0,
    });
  });
  // radiators and coolers dissipate combat heat
  let cooling = 3.2;
  o.ship.slots.forEach((m) => {
    if (!m || !m.enabled || m.condition <= 0) return;
    const k = MODULES_BY_ID[m.defId].kind;
    if (k === 'radiator') cooling += 2.2 * QUALITY[m.quality].value;
    if (k === 'cooler') cooling += 0.6;
  });
  const reactor = rooms.find((r) => r.kind === 'reactor');
  const reactorPerf = reactor ? perf(reactor.sys) : 1;
  return {
    side: o.side,
    index: o.index,
    name: o.name,
    hullId: o.ship.hullId,
    hull: o.ship.hp,
    hullMax: stats.hpMax,
    shield: o.ship.shield > 0 ? Math.min(o.ship.shield, stats.shieldCap) : stats.shieldCap,
    shieldMax: stats.shieldCap,
    shieldRegen: stats.shieldCap * 0.05,
    rooms,
    weapons,
    crew: o.crew,
    drones: [],
    heat: 0,
    overheated: false,
    powerOut: stats.powerOut * reactorPerf,
    need,
    weights: { ...need },
    agility: hull.agility,
    jumpCharge: 0,
    fleeing: false,
    canFlee: stats.jumpEff > 0 && hull.agility > 0,
    missiles: o.missiles ?? 0,
    personality: o.personality,
    alive: true,
    out: null,
    cooling,
    lootId: o.lootId ?? '',
    freeFlee: !!o.freeFlee,
    demanded: false,
    teleporterCharge: 0,
  };
}

/** Place player crew in their natural rooms (pilot at the engines, engineer at the reactor, ...). */
export function placeCrew(ship: CShip): void {
  const used = new Map<number, number>();
  for (const c of ship.crew) {
    const want: ModuleKind | undefined = c.role === 'gunner' ? undefined : ROLE_ROOM[c.role];
    let room = want ? ship.rooms.findIndex((r) => r.kind === want) : -1;
    if (c.role === 'gunner') {
      const ws = ship.weapons.map((w) => w.room);
      room = ws.length ? ws[(used.get(-1) ?? 0) % ws.length] : -1;
      used.set(-1, (used.get(-1) ?? 0) + 1);
    }
    if (room < 0) room = ship.rooms.findIndex((r) => r.kind === 'life');
    if (room < 0) room = 0;
    c.room = room;
    c.post = room;
  }
}
