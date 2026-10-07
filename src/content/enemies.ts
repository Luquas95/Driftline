import type { EncounterKind, Personality } from '../core/combat/types';
import type { Quality, Region } from '../core/types';

export interface EnemyDef {
  id: string;
  kind: EncounterKind;
  hullId: string;
  personality: Personality;
  /** Modules for the free slots, in layout order. */
  loadout: string[];
  /** Tier range this template appears in (1 weak .. 3 dangerous). */
  tiers: [number, number];
  crew: number;
  /** Credits carried: [min, max] at tier 1 (scales with tier). */
  credits: [number, number];
  /** Goods the wreck may hold. */
  goods: string[];
  /** Base chance that a surviving module can be salvaged. */
  moduleChance: number;
  /** Relative spawn weight per region. */
  weight: Record<Region, number>;
}

const w = (core: number, inner: number, outer: number, rim: number) => ({ core, inner, outer, rim });

/** Quality of enemy modules by tier. */
export const TIER_QUALITY: Record<number, Quality> = { 1: 'D', 2: 'C', 3: 'B' };
export const TIER_HULL: Record<number, number> = { 1: 0.85, 2: 1, 3: 1.2 };

export const ENEMIES: EnemyDef[] = [
  {
    id: 'scrapper',
    kind: 'pirate',
    hullId: 'kestrel',
    personality: 'aggressive',
    loadout: ['kinetic_s', 'energy_s', 'shield_s'],
    tiers: [1, 2],
    crew: 2,
    credits: [80, 260],
    goods: ['metals', 'spare_parts', 'grain'],
    moduleChance: 0.25,
    weight: w(0.4, 1, 2, 3),
  },
  {
    id: 'raider',
    kind: 'pirate',
    hullId: 'mule',
    personality: 'greedy',
    loadout: ['kinetic_s', 'missile_m', 'shield_s', 'kinetic_s'],
    tiers: [1, 3],
    crew: 3,
    credits: [150, 420],
    goods: ['electronics', 'spirits', 'machinery', 'polymers'],
    moduleChance: 0.3,
    weight: w(0.5, 1, 2, 2),
  },
  {
    id: 'corsair',
    kind: 'pirate',
    hullId: 'wayfarer',
    personality: 'aggressive',
    loadout: ['energy_s', 'ion_m', 'shield_m', 'energy_m'],
    tiers: [2, 3],
    crew: 3,
    credits: [260, 700],
    goods: ['gems', 'narcotics', 'optics', 'fusion_cells'],
    moduleChance: 0.35,
    weight: w(0.3, 0.6, 1.4, 2),
  },
  {
    id: 'warlord',
    kind: 'pirate',
    hullId: 'borer',
    personality: 'greedy',
    loadout: ['kinetic_m', 'energy_l', 'shield_m', 'missile_s', 'kinetic_s', 'shield_s'],
    tiers: [3, 3],
    crew: 4,
    credits: [600, 1500],
    goods: ['art', 'gems', 'robotics', 'computers'],
    moduleChance: 0.5,
    weight: w(0.1, 0.3, 0.8, 1.6),
  },
  {
    id: 'hunter',
    kind: 'hunter',
    hullId: 'swift',
    personality: 'aggressive',
    loadout: ['ion_s', 'energy_s', 'shield_m'],
    tiers: [1, 3],
    crew: 2,
    credits: [120, 360],
    goods: ['optics', 'electronics'],
    moduleChance: 0.35,
    weight: w(1, 1, 1, 1),
  },
  {
    id: 'tracker',
    kind: 'hunter',
    hullId: 'wayfarer',
    personality: 'cautious',
    loadout: ['missile_m', 'energy_s', 'shield_m', 'ion_m'],
    tiers: [2, 3],
    crew: 3,
    credits: [300, 800],
    goods: ['computers', 'medicine'],
    moduleChance: 0.4,
    weight: w(1, 1, 1, 1),
  },
  {
    id: 'patrol',
    kind: 'customs',
    hullId: 'kestrel',
    personality: 'cautious',
    loadout: ['energy_s', 'energy_s', 'shield_s'],
    tiers: [1, 2],
    crew: 2,
    credits: [50, 160],
    goods: ['spare_parts'],
    moduleChance: 0.15,
    weight: w(2, 2, 1, 0.2),
  },
  {
    id: 'cruiser',
    kind: 'customs',
    hullId: 'borer',
    personality: 'cautious',
    loadout: ['energy_m', 'energy_m', 'shield_m', 'ion_s', 'shield_s', 'kinetic_s'],
    tiers: [3, 3],
    crew: 4,
    credits: [150, 400],
    goods: ['spare_parts', 'metals'],
    moduleChance: 0.3,
    weight: w(1.5, 1, 0.3, 0),
  },
  {
    id: 'autoturret',
    kind: 'wreck',
    hullId: 'turret',
    personality: 'turret',
    loadout: ['kinetic_s', 'missile_s'],
    tiers: [1, 3],
    crew: 0,
    credits: [100, 500],
    goods: ['rare_metals', 'crystals', 'electronics', 'machinery'],
    moduleChance: 0.6,
    weight: w(0.5, 1, 1.5, 2),
  },
  {
    id: 'swarmer',
    kind: 'fauna',
    hullId: 'swarmer',
    personality: 'feral',
    loadout: ['kinetic_s'],
    tiers: [1, 2],
    crew: 0,
    credits: [0, 0],
    goods: ['biosamples'],
    moduleChance: 0,
    weight: w(0.2, 0.8, 1.6, 2.5),
  },
  {
    id: 'maw',
    kind: 'fauna',
    hullId: 'maw',
    personality: 'feral',
    loadout: ['energy_m', 'kinetic_s', 'kinetic_s', 'ion_s'],
    tiers: [3, 3],
    crew: 0,
    credits: [0, 0],
    goods: ['biosamples', 'rare_ore'],
    moduleChance: 0.1,
    weight: w(0, 0.2, 0.8, 2),
  },
];
export const ENEMIES_BY_ID = Object.fromEntries(ENEMIES.map((e) => [e.id, e])) as Record<string, EnemyDef>;
