import type { ModuleDef, Quality, Size } from '../core/types';
import { QUALITY } from './quality';
import type { WeaponKind } from '../core/combat/types';

/**
 * Combat weapon table. Damage types: energy melts shields (x1.5 vs shield, weaker on hull),
 * kinetic hits hulls hard but shields blunt it, missiles ignore shields (and use ammo), ion disables systems,
 * drones fly out and shoot or intercept, a teleporter sends boarders.
 */
export interface WeaponSpec {
  /** Damage per shot at size S, quality C. */
  dmg: number;
  /** Seconds to charge at full power, S. */
  charge: number;
  /** Heat added per shot. */
  heat: number;
  /** Projectile flight time, seconds. */
  speed: number;
  /** Multiplier of damage against shields. */
  shieldMult: number;
  /** Multiplier of damage against hull. */
  hullMult: number;
  /** Multiplier of damage against the targeted system. */
  sysMult: number;
  /** Chances per hit: breach and fire. */
  breach: number;
  fire: number;
  /** Seconds of ion lock per hit. */
  ion: number;
  /** Missiles use one unit of ammo per shot. */
  ammo: number;
  /** Power draw at size S (combat). */
  power: number;
  /** Base price at size S. */
  price: number;
  mass: number;
}

/** Global damage scale: keeps a fight at roughly one to two minutes without touching module stat tables. */
export const DMG_SCALE = 0.32;

export const WEAPON_SPECS: Record<WeaponKind, WeaponSpec> = {
  energy: {
    dmg: 16,
    charge: 5,
    heat: 6,
    speed: 0.45,
    shieldMult: 1.4,
    hullMult: 1.0,
    sysMult: 0.9,
    breach: 0.04,
    fire: 0.18,
    ion: 0,
    ammo: 0,
    power: 5,
    price: 1500,
    mass: 3,
  },
  kinetic: {
    dmg: 9,
    charge: 3.6,
    heat: 4,
    speed: 0.8,
    shieldMult: 0.75,
    hullMult: 1.3,
    sysMult: 1.1,
    breach: 0.18,
    fire: 0.03,
    ion: 0,
    ammo: 0,
    power: 5,
    price: 950,
    mass: 3.5,
  },
  missile: {
    dmg: 22,
    charge: 10,
    heat: 2,
    speed: 1.5,
    shieldMult: 0,
    hullMult: 1.1,
    sysMult: 1.2,
    breach: 0.22,
    fire: 0.25,
    ion: 0,
    ammo: 1,
    power: 3,
    price: 1700,
    mass: 4,
  },
  ion: {
    dmg: 6,
    charge: 6,
    heat: 4,
    speed: 0.5,
    shieldMult: 2,
    hullMult: 0,
    sysMult: 0,
    breach: 0,
    fire: 0,
    ion: 9,
    ammo: 0,
    power: 4,
    price: 1600,
    mass: 3,
  },
  drones: {
    dmg: 4.5,
    charge: 19,
    heat: 1,
    speed: 0.6,
    shieldMult: 0.8,
    hullMult: 1,
    sysMult: 1,
    breach: 0.03,
    fire: 0.02,
    ion: 0,
    ammo: 0,
    power: 5,
    price: 2100,
    mass: 4,
  },
  teleporter: {
    dmg: 0,
    charge: 16,
    heat: 0,
    speed: 0,
    shieldMult: 0,
    hullMult: 0,
    sysMult: 0,
    breach: 0,
    fire: 0,
    ion: 0,
    ammo: 0,
    power: 5,
    price: 3000,
    mass: 3,
  },
};

export const WEAPON_SIZE: Record<
  Size,
  { dmg: number; charge: number; power: number; price: number; mass: number; drones: number }
> = {
  S: { dmg: 1, charge: 1, power: 1, price: 1, mass: 1, drones: 2 },
  M: { dmg: 1.75, charge: 1.25, power: 1.6, price: 2.5, mass: 2.2, drones: 3 },
  L: { dmg: 2.7, charge: 1.5, power: 2.4, price: 5.5, mass: 4, drones: 4 },
};

export const WEAPON_KIND_SET: ReadonlySet<string> = new Set(Object.keys(WEAPON_SPECS));

export function isWeaponKind(k: string): k is WeaponKind {
  return WEAPON_KIND_SET.has(k);
}

export interface WeaponStats {
  kind: WeaponKind;
  dmg: number;
  charge: number;
  heat: number;
  speed: number;
  shieldDmg: number;
  hullDmg: number;
  sysDmg: number;
  breach: number;
  fire: number;
  ion: number;
  ammo: number;
  drones: number;
}

export function weaponStats(kind: WeaponKind, size: Size, quality: Quality): WeaponStats {
  const sp = WEAPON_SPECS[kind];
  const sz = WEAPON_SIZE[size];
  const q = QUALITY[quality];
  const dmg = sp.dmg * sz.dmg * q.value * DMG_SCALE;
  return {
    kind,
    dmg,
    charge: (sp.charge * sz.charge) / (0.9 + 0.1 * q.value),
    heat: sp.heat * Math.sqrt(sz.dmg),
    speed: sp.speed,
    shieldDmg: dmg * sp.shieldMult,
    hullDmg: dmg * sp.hullMult,
    sysDmg: dmg * sp.sysMult,
    breach: sp.breach,
    fire: sp.fire,
    ion: sp.ion * (0.8 + 0.2 * sz.dmg),
    ammo: sp.ammo,
    drones: sz.drones,
  };
}

/** Build the module definition for a weapon family/size (used by modules.ts). */
export function weaponModuleDef(kind: WeaponKind, size: Size): ModuleDef {
  const sp = WEAPON_SPECS[kind];
  const sz = WEAPON_SIZE[size];
  return {
    id: `${kind}_${size.toLowerCase()}`,
    kind,
    size,
    value: Math.round(sp.dmg * sz.dmg * 10) / 10,
    power: Math.round(sp.power * sz.power * 10) / 10,
    powerMode: 'active',
    mass: Math.round(sp.mass * sz.mass * 10) / 10,
    price: Math.round((sp.price * sz.price) / 10) * 10,
    wear: 0.2,
    core: false,
  };
}

export const WEAPON_SIZES: Record<WeaponKind, Size[]> = {
  energy: ['S', 'M', 'L'],
  kinetic: ['S', 'M', 'L'],
  missile: ['S', 'M'],
  ion: ['S', 'M'],
  drones: ['S', 'M', 'L'],
  teleporter: ['M'],
};
