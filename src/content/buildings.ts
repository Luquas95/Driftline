import type { Quality } from '../core/types';

export type BuildingId =
  | 'mine'
  | 'refinery'
  | 'factory'
  | 'warehouse'
  | 'shipyard'
  | 'hangar'
  | 'lab'
  | 'defense'
  | 'port'
  | 'anchor';

export interface BuildingDef {
  id: BuildingId;
  maxLevel: number;
  /** Credits for building level L (1-based). */
  cost: (level: number) => number;
  /** Goods taken from the base storage for level L. */
  materials: (level: number) => Record<string, number>;
  /** Days of construction for level L. */
  days: (level: number) => number;
  /** Credits per day for the whole building at level L. */
  upkeep: (level: number) => number;
  /** Technology needed for the building (or for levels above `techFromLevel`). */
  tech?: string;
  techFromLevel?: number;
}

const grow = (base: number, level: number, k = 1.45): number =>
  Math.round((base * Math.pow(level, k)) / 50) * 50;

const mats =
  (c: number, m: number, extra: Record<string, number> = {}) =>
  (level: number) => ({
    construction: Math.round(c * level),
    machinery: Math.round(m * level),
    ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, Math.round(v * level)])),
  });

export const BUILDINGS: BuildingDef[] = [
  {
    id: 'mine',
    maxLevel: 5,
    cost: (l) => grow(5000, l),
    materials: mats(6, 2),
    days: (l) => 4 + 3 * l,
    upkeep: (l) => 14 * l,
    tech: 'deep_mining',
    techFromLevel: 4,
  },
  {
    id: 'refinery',
    maxLevel: 5,
    cost: (l) => grow(6500, l),
    materials: mats(7, 3),
    days: (l) => 5 + 3 * l,
    upkeep: (l) => 18 * l,
  },
  {
    id: 'factory',
    maxLevel: 5,
    cost: (l) => grow(8000, l),
    materials: mats(8, 4),
    days: (l) => 6 + 4 * l,
    upkeep: (l) => 24 * l,
    tech: 'mass_prod',
    techFromLevel: 4,
  },
  {
    id: 'warehouse',
    maxLevel: 5,
    cost: (l) => grow(3500, l),
    materials: mats(8, 1),
    days: (l) => 3 + 2 * l,
    upkeep: (l) => 6 * l,
  },
  {
    id: 'shipyard',
    maxLevel: 4,
    cost: (l) => grow(14000, l),
    materials: mats(10, 6),
    days: (l) => 10 + 6 * l,
    upkeep: (l) => 36 * l,
  },
  {
    id: 'hangar',
    maxLevel: 5,
    cost: (l) => grow(7000, l),
    materials: mats(8, 3),
    days: (l) => 5 + 3 * l,
    upkeep: (l) => 20 * l,
    tech: 'logistics',
    techFromLevel: 4,
  },
  {
    id: 'lab',
    maxLevel: 5,
    cost: (l) => grow(9000, l),
    materials: mats(6, 3, { electronics: 2 }),
    days: (l) => 6 + 4 * l,
    upkeep: (l) => 30 * l,
  },
  {
    id: 'defense',
    maxLevel: 5,
    cost: (l) => grow(8500, l),
    materials: mats(6, 4, { alloys: 3 }),
    days: (l) => 5 + 4 * l,
    upkeep: (l) => 26 * l,
    tech: 'defense_grid',
    techFromLevel: 4,
  },
  {
    id: 'port',
    maxLevel: 5,
    cost: (l) => grow(11000, l),
    materials: mats(7, 3),
    days: (l) => 6 + 3 * l,
    upkeep: (l) => 22 * l,
  },
  {
    id: 'anchor',
    maxLevel: 3,
    cost: (l) => grow(42000, l),
    materials: mats(12, 8, { electronics: 6, computers: 2 }),
    days: (l) => 18 + 8 * l,
    upkeep: (l) => 90 * l,
    tech: 'anchor_array',
  },
];

export const BUILDINGS_BY_ID: Record<BuildingId, BuildingDef> = Object.fromEntries(
  BUILDINGS.map((b) => [b.id, b]),
) as Record<BuildingId, BuildingDef>;

/** Founding the base: credits and goods carried in the ship's hold. */
export const FOUNDING = {
  credits: 18000,
  goods: { construction: 40, machinery: 12 } as Record<string, number>,
  baseStorage: 250,
  perWarehouseLevel: 350,
};

/** Quality of modules the factory builds: C normally, B and A with research. */
export function fabQuality(done: string[]): Quality {
  return done.includes('precision_fab') ? 'A' : done.includes('mass_prod') ? 'B' : 'C';
}

/** Body kinds a colony can stand on (the rest take an orbital station). */
export const COLONY_BODIES = ['rocky', 'desert', 'ocean', 'ice'];
