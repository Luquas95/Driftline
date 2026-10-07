import type { ModuleDef, ModuleKind, PowerMode, Size } from '../core/types';
import { WEAPON_SIZES, weaponModuleDef } from './weapons';
import { QUALITY, SIZE_MULT } from './quality';

export { QUALITY, SIZE_MULT };

interface Family {
  kind: ModuleKind;
  sizes: Size[];
  /** Primary stat (S, C quality). */
  value: number;
  power: number;
  mode: PowerMode;
  mass: number;
  price: number;
  wear: number;
  aux?: number;
  core?: boolean;
  adjacency?: ModuleDef['adjacency'];
}

/*
 * Primary stat meaning:
 *  reactor: power output (value) | engine: thrust | jump: jump efficiency (fuel economy factor)
 *  life: crew supported | sensors: scan power | cargo: cells | fuel: units | cooler: chilled cells
 *  vault: secure cells | laser: units/day | refinery: refine rate (units/day) | surface: scan power
 *  probe: probes per launch (accuracy) | repair: condition points/day | shield: capacity
 *  amplifier/radiator: (adjacency only) | quarters: passenger beds | scoop: units/day
 * aux: jump speed (ly/day), sensor range (ly), quarters comfort, ...
 */
const FAMILIES: Record<string, Family> = {
  reactor: {
    kind: 'reactor',
    sizes: ['S', 'M', 'L'],
    value: 26,
    power: 0,
    mode: 'always',
    mass: 3,
    price: 900,
    wear: 0.05,
    core: true,
  },
  engine: {
    kind: 'engine',
    sizes: ['S', 'M', 'L'],
    value: 12,
    power: 4,
    mode: 'active',
    mass: 4,
    price: 700,
    wear: 0.1,
    core: true,
  },
  jump: {
    kind: 'jump',
    sizes: ['S', 'M', 'L'],
    value: 1,
    power: 14,
    mode: 'active',
    mass: 6,
    price: 1800,
    wear: 0.9,
    aux: 4,
    core: true,
  },
  life: {
    kind: 'life',
    sizes: ['S', 'M', 'L'],
    value: 2,
    power: 2,
    mode: 'always',
    mass: 2,
    price: 500,
    wear: 0.03,
    core: true,
  },
  sensors: {
    kind: 'sensors',
    sizes: ['S', 'M', 'L'],
    value: 1.5,
    power: 1.5,
    mode: 'always',
    mass: 1,
    price: 600,
    wear: 0.03,
    aux: 8,
    core: true,
  },
  cargo: {
    kind: 'cargo',
    sizes: ['S', 'M', 'L'],
    value: 3,
    power: 0,
    mode: 'always',
    mass: 2,
    price: 700,
    wear: 0,
  },
  fuel: {
    kind: 'fuel',
    sizes: ['S', 'M', 'L'],
    value: 25,
    power: 0,
    mode: 'always',
    mass: 2.5,
    price: 350,
    wear: 0,
  },
  cooler: {
    kind: 'cooler',
    sizes: ['S', 'M'],
    value: 4,
    power: 3,
    mode: 'always',
    mass: 2,
    price: 900,
    wear: 0.02,
  },
  vault: {
    kind: 'vault',
    sizes: ['S', 'M'],
    value: 3,
    power: 1,
    mode: 'always',
    mass: 3,
    price: 1100,
    wear: 0.01,
  },
  laser: {
    kind: 'laser',
    sizes: ['M', 'L'],
    value: 2,
    power: 7,
    mode: 'active',
    mass: 5,
    price: 1500,
    wear: 1.4,
  },
  refinery: {
    kind: 'refinery',
    sizes: ['M', 'L'],
    value: 10,
    power: 6,
    mode: 'active',
    mass: 7,
    price: 2400,
    wear: 0.5,
  },
  surface: {
    kind: 'surface',
    sizes: ['S', 'M'],
    value: 2,
    power: 4,
    mode: 'active',
    mass: 2,
    price: 1300,
    wear: 0.3,
  },
  probe: {
    kind: 'probe',
    sizes: ['S', 'M'],
    value: 1,
    power: 2.5,
    mode: 'active',
    mass: 2,
    price: 1200,
    wear: 0.2,
  },
  repair: {
    kind: 'repair',
    sizes: ['S', 'M'],
    value: 6,
    power: 4,
    mode: 'active',
    mass: 2.5,
    price: 1400,
    wear: 0.1,
  },
  shield: {
    kind: 'shield',
    sizes: ['S', 'M', 'L'],
    value: 15,
    power: 3,
    mode: 'always',
    mass: 3,
    price: 1600,
    wear: 0.15,
  },
  amplifier: {
    kind: 'amplifier',
    sizes: ['S', 'M'],
    value: 0,
    power: 3,
    mode: 'always',
    mass: 2,
    price: 1800,
    wear: 0.05,
    adjacency: { boost: 0.18 },
  },
  radiator: {
    kind: 'radiator',
    sizes: ['S', 'M'],
    value: 0,
    power: 1,
    mode: 'always',
    mass: 2,
    price: 1300,
    wear: 0.02,
    adjacency: { wearCut: 0.25, powerCut: 0.1 },
  },
  quarters: {
    kind: 'quarters',
    sizes: ['S', 'M', 'L'],
    value: 2,
    power: 2,
    mode: 'always',
    mass: 3,
    price: 800,
    wear: 0.02,
    aux: 1,
  },
  scoop: {
    kind: 'scoop',
    sizes: ['M', 'L'],
    value: 2.2,
    power: 6,
    mode: 'active',
    mass: 4,
    price: 1500,
    wear: 0.7,
  },
};

export const MODULES: ModuleDef[] = [];
for (const [key, f] of Object.entries(FAMILIES)) {
  for (const size of f.sizes) {
    const m = SIZE_MULT[size];
    const isReactor = f.kind === 'reactor';
    MODULES.push({
      id: `${key}_${size.toLowerCase()}`,
      kind: f.kind,
      size,
      value: Math.round(f.value * m.value * 100) / 100,
      power: isReactor ? 0 : Math.round(f.power * m.power * 100) / 100,
      powerMode: f.mode,
      mass: Math.round(f.mass * m.mass * 10) / 10,
      price: Math.round((f.price * m.price) / 10) * 10,
      wear: f.wear,
      aux:
        f.kind === 'quarters'
          ? size === 'S'
            ? 1
            : size === 'M'
              ? 2
              : 3
          : f.kind === 'jump'
            ? f.aux! * (1 + (m.value - 1) * 0.18)
            : f.aux,
      adjacency: f.adjacency,
      core: !!f.core,
    });
  }
}

export const MODULES_BY_ID: Record<string, ModuleDef> = Object.fromEntries(MODULES.map((m) => [m.id, m]));

export function defaultCoreModules(): Record<ModuleKind, string> {
  return { reactor: 'reactor', engine: 'engine', jump: 'jump', life: 'life', sensors: 'sensors' } as Record<
    ModuleKind,
    string
  >;
}

// v2: weapons (kept in separate tables so tuning lives in content/weapons.ts)
for (const kind of Object.keys(WEAPON_SIZES) as (keyof typeof WEAPON_SIZES)[]) {
  for (const size of WEAPON_SIZES[kind]) {
    const def = weaponModuleDef(kind, size);
    MODULES.push(def);
    MODULES_BY_ID[def.id] = def;
  }
}
