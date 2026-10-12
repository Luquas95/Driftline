/** Technology tree. Names and descriptions: tech.<id>, tech.<id>.desc in the dictionary. */
export type TechBranch = 'nav' | 'power' | 'industry' | 'war' | 'xeno';

export interface TechDef {
  id: string;
  branch: TechBranch;
  /** Research points. */
  cost: number;
  requires: string[];
  /** Module ids that appear in shops and in the factory only after this research. */
  modules?: string[];
  /** Effects when the research completes. */
  effect?: {
    /** Slows the Grey (adds to `threat.mitigation`). */
    mitigation?: number;
    /** Alien words learned at once. */
    words?: number;
    /** +fraction of lab output. */
    rp?: number;
    /** +fraction of income of automatic trade routes. */
    fleet?: number;
    /** +fraction to the base defence rating. */
    defense?: number;
  };
}

export const TECHS: TechDef[] = [
  // navigation and sensors
  { id: 'deep_scan', branch: 'nav', cost: 60, requires: [], modules: ['sensors_l', 'surface_m', 'probe_m'] },
  { id: 'atlas', branch: 'nav', cost: 140, requires: ['deep_scan'], effect: { rp: 0.1 } },
  { id: 'survey_net', branch: 'nav', cost: 260, requires: ['atlas'], effect: { rp: 0.1, mitigation: 0.03 } },
  // power and ship systems
  { id: 'fusion_2', branch: 'power', cost: 80, requires: [], modules: ['reactor_l', 'engine_l'] },
  { id: 'jump_2', branch: 'power', cost: 150, requires: ['fusion_2'], modules: ['jump_l'] },
  { id: 'shield_2', branch: 'power', cost: 120, requires: ['fusion_2'], modules: ['shield_l'] },
  { id: 'cooling', branch: 'power', cost: 100, requires: [], modules: ['radiator_m', 'amplifier_m'] },
  // industry and logistics
  {
    id: 'compact_cargo',
    branch: 'industry',
    cost: 90,
    requires: [],
    modules: ['cargo_l', 'vault_m', 'cooler_m'],
  },
  { id: 'deep_mining', branch: 'industry', cost: 100, requires: [], modules: ['laser_l'] },
  { id: 'mass_prod', branch: 'industry', cost: 120, requires: [] },
  { id: 'logistics', branch: 'industry', cost: 140, requires: ['mass_prod'], effect: { fleet: 0.15 } },
  { id: 'precision_fab', branch: 'industry', cost: 300, requires: ['mass_prod'] },
  // weapons and defence
  { id: 'kinetics_2', branch: 'war', cost: 90, requires: [], modules: ['kinetic_l'] },
  { id: 'energy_2', branch: 'war', cost: 90, requires: [], modules: ['energy_l'] },
  { id: 'missiles_2', branch: 'war', cost: 110, requires: ['kinetics_2'], modules: ['missile_m'] },
  { id: 'ion_2', branch: 'war', cost: 160, requires: ['energy_2'], modules: ['ion_m'] },
  {
    id: 'drone_bay',
    branch: 'war',
    cost: 200,
    requires: ['ion_2'],
    modules: ['drones_m', 'drones_l', 'teleporter_m'],
  },
  { id: 'defense_grid', branch: 'war', cost: 180, requires: ['kinetics_2'], effect: { defense: 0.3 } },
  // the Grey and its language
  { id: 'xeno_1', branch: 'xeno', cost: 80, requires: ['deep_scan'], effect: { words: 10 } },
  { id: 'xeno_2', branch: 'xeno', cost: 180, requires: ['xeno_1'], effect: { words: 14, mitigation: 0.04 } },
  { id: 'xeno_3', branch: 'xeno', cost: 340, requires: ['xeno_2'], effect: { words: 16, mitigation: 0.05 } },
  { id: 'resonance', branch: 'xeno', cost: 260, requires: ['xeno_2'], effect: { mitigation: 0.08 } },
  { id: 'null_field', branch: 'xeno', cost: 420, requires: ['resonance'], effect: { mitigation: 0.1 } },
  {
    id: 'anchor_array',
    branch: 'xeno',
    cost: 480,
    requires: ['resonance', 'fusion_2'],
    effect: { mitigation: 0.05 },
  },
  { id: 'exodus_drive', branch: 'xeno', cost: 650, requires: ['jump_2', 'logistics'] },
  { id: 'accord_protocol', branch: 'xeno', cost: 600, requires: ['xeno_3'] },
  {
    id: 'grey_decode',
    branch: 'xeno',
    cost: 800,
    requires: ['xeno_3', 'null_field'],
    effect: { mitigation: 0.1 },
  },
];

export const TECHS_BY_ID: Record<string, TechDef> = Object.fromEntries(TECHS.map((t) => [t.id, t]));

/** Module id -> the technology that unlocks it (for the shop pool and the factory). */
export const MODULE_TECH: Record<string, string> = {};
for (const t of TECHS) for (const m of t.modules ?? []) MODULE_TECH[m] = t.id;
