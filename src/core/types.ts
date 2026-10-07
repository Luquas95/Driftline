/** Shared type definitions for the simulation core (pure data, JSON-serialisable where it is game state). */
import type { RngState } from './rng';

export type Size = 'S' | 'M' | 'L';
export type Quality = 'E' | 'D' | 'C' | 'B' | 'A';
export const QUALITIES: Quality[] = ['E', 'D', 'C', 'B', 'A'];
export const SIZES: Size[] = ['S', 'M', 'L'];

export type Region = 'core' | 'inner' | 'outer' | 'rim';
export type GoodCategory =
  'raw' | 'food' | 'industry' | 'tech' | 'medical' | 'luxury' | 'illegal' | 'special';
export type GoodTag = 'chilled' | 'hazardous' | 'illegal' | 'perishable' | 'sensitive';

export interface GoodDef {
  id: string;
  category: GoodCategory;
  basePrice: number;
  /** Units that fit into one grid cell. */
  unitsPerCell: number;
  /** Mass of one unit (tons). */
  mass: number;
  tags: GoodTag[];
  /** For perishable goods: days until the value is mostly gone. */
  shelfDays?: number;
  /** Production recipe: inputs per unit of output. */
  inputs?: Record<string, number>;
}

export type ModuleKind =
  | 'reactor'
  | 'engine'
  | 'jump'
  | 'life'
  | 'sensors'
  | 'cargo'
  | 'fuel'
  | 'cooler'
  | 'vault'
  | 'laser'
  | 'refinery'
  | 'surface'
  | 'probe'
  | 'repair'
  | 'shield'
  | 'amplifier'
  | 'radiator'
  | 'quarters'
  | 'scoop'
  | 'energy'
  | 'kinetic'
  | 'missile'
  | 'ion'
  | 'drones'
  | 'teleporter';

export const CORE_KINDS: ModuleKind[] = ['reactor', 'engine', 'jump', 'life', 'sensors'];
export type PowerMode = 'always' | 'active';

export interface ModuleDef {
  id: string;
  kind: ModuleKind;
  size: Size;
  /** Primary stat at quality C. Meaning depends on kind (see ship.ts). */
  value: number;
  /** Power: output for reactors, draw for everything else. */
  power: number;
  powerMode: PowerMode;
  mass: number;
  price: number;
  /** Wear gained per use-unit (day of operation / jump), before modifiers. */
  wear: number;
  /** Secondary stat (e.g. jump speed, comfort, efficiency). */
  aux?: number;
  /** Adjacency effect on orthogonal neighbours. */
  adjacency?: { boost?: number; wearCut?: number; powerCut?: number };
  /** True for the five mandatory core module kinds. */
  core: boolean;
}

export interface HullDef {
  id: string;
  /** Short role key for the shipyard (hull.role.<role>). */
  role: string;
  /** Rows of slot tokens: lowercase = core (r e j l n), uppercase S/M/L = free slot, '.' = empty. */
  layout: string[];
  mass: number;
  cargoCells: number;
  cargoCols: number;
  fuel: number;
  supplies: number;
  hp: number;
  price: number;
  crew: number;
  /** Size of core slots (modules of this size or smaller fit). */
  coreSize: Size;
  /** Hull speed trait multiplier for sublight. */
  agility: number;
  tier: number;
}

export interface SlotDef {
  index: number;
  x: number;
  y: number;
  size: Size;
  /** If set the slot only takes this core kind. */
  core?: ModuleKind;
}

export type StationTypeId =
  'mining' | 'agricultural' | 'industrial' | 'scientific' | 'trade_hub' | 'research' | 'pirate';
export type StationSize = 'small' | 'medium' | 'large';

export interface StationTypeDef {
  id: StationTypeId;
  produces: Record<string, number>;
  consumes: Record<string, number>;
  /** Shipyard tier offered (0 = none). */
  shipyard: number;
  cartography: boolean;
  /** Sells fresh market data for the surrounding sector. */
  intel: boolean;
  blackMarket: boolean;
  /** Relative weights of contract kinds issued here. */
  contractBias: Partial<Record<ContractKind, number>>;
  /** Spawn weight per region. */
  weight: Record<Region, number>;
  /** Lawfulness 0..1 (inspections happen at lawful stations). */
  lawful: boolean;
}

export type BodyKind = 'rocky' | 'desert' | 'ocean' | 'ice' | 'volcanic' | 'gas' | 'dead' | 'belt' | 'moon';

export type SpectralClass = 'O' | 'B' | 'A' | 'F' | 'G' | 'K' | 'M';

export interface Deposit {
  id: string;
  goodId: string;
  richness: number; // 0..1
  /** Minimum surface scan power needed to notice this. */
  hidden: number;
}

export interface Anomaly {
  id: string;
  eventId: string;
  hidden: number;
}

export interface BodyStatic {
  id: string;
  systemId: number;
  index: number;
  kind: BodyKind;
  name: string;
  /** Orbit radius in AU. */
  orbit: number;
  /** Parent body index for moons, else -1. */
  parent: number;
  seed: number;
  size: number; // relative radius
  rings: boolean;
  /** 0..3: scan power needed to detect the body in a system scan. */
  scanDifficulty: number;
  deposits: Deposit[];
  anomalies: Anomaly[];
  /** Hazard multiplier (volcanic, gas giants are riskier). */
  hazard: number;
  atmosphere: boolean;
}

export interface StationStatic {
  id: string;
  systemId: number;
  name: string;
  type: StationTypeId;
  size: StationSize;
  colony: boolean;
  /** Body index the station orbits / sits on. */
  bodyIndex: number;
  /** Role per good: strength 0..1 positive produce, negative consume. */
  role: Record<string, number>;
  /** Goods traded here (legal and, on the black market, illegal). */
  goods: string[];
  blackMarket: boolean;
}

export interface SystemStatic {
  id: number;
  name: string;
  x: number;
  y: number;
  region: Region;
  sector: number;
  spectral: SpectralClass;
  starSeed: number;
  /** 0..1 how rich/dangerous the system is. */
  richness: number;
  danger: number;
  bodies: BodyStatic[];
  stations: StationStatic[];
  neighbors: number[];
}

export interface Galaxy {
  seed: string;
  systems: SystemStatic[];
  stationsById: Record<string, StationStatic>;
  sectors: { id: number; name: string; x: number; y: number }[];
  radius: number;
}

/* ---------------------------- Game state ---------------------------- */

export interface ModuleInstance {
  uid: string;
  defId: string;
  quality: Quality;
  /** 0..100 */
  condition: number;
  enabled: boolean;
}

export interface Ship {
  hullId: string;
  name: string;
  slots: (ModuleInstance | null)[];
  hp: number;
  fuel: number;
  supplies: number;
  probes: number;
  shield: number;
}

export interface CargoItem {
  uid: string;
  goodId: string;
  qty: number;
  w: number;
  h: number;
  x: number;
  y: number;
  /** Total price paid for this container (for profit display). */
  cost: number;
  acquiredDay: number;
  contractId?: string;
}

export type ContractKind = 'freight' | 'courier' | 'passenger' | 'survey' | 'supply' | 'rescue';

export interface Contract {
  id: string;
  kind: ContractKind;
  origin: string;
  dest: string;
  destSystem: number;
  goodId?: string;
  qty?: number;
  passengers?: number;
  comfort?: number;
  /** For survey/rescue: target system / body id. */
  targetSystem?: number;
  targetBody?: string;
  deadline: number;
  reward: number;
  deposit: number;
  penalty: number;
  state: 'offered' | 'active' | 'done' | 'failed';
  chainId?: string;
  chainStep?: number;
  acceptedDay?: number;
  /** Progress flags (e.g. survey completed, wreck found). */
  progress?: number;
  /** Chain story context key. */
  title?: string;
}

export interface KnownPrice {
  buy: number; // price the station asks when the player buys
  sell: number; // price the station pays when the player sells
  stock: number;
  day: number;
}

export interface ShopItem {
  uid: string;
  defId: string;
  quality: Quality;
  price: number;
}

export interface StationDyn {
  stock: number[];
  board: Contract[];
  boardEpoch: number;
  rep: number;
  shop: { hulls: string[]; modules: ShopItem[]; epoch: number };
  /** v2: crew available for hire (regenerated weekly). */
  recruits?: { epoch: number; list: Recruit[] };
}

export interface BodyDyn {
  surface: boolean;
  probed: boolean;
  /** deposit id -> times mined (decays back over time) */
  mined: Record<string, number>;
  minedDay: Record<string, number>;
  /** Revealed deposit / anomaly ids. */
  revealed: string[];
  anomaliesDone: string[];
}

export interface MarketEvent {
  id: string;
  kind: string;
  sector: number;
  start: number;
  end: number;
  /** good category or good id -> demand multiplier on target stock. */
  mods: Record<string, number>;
}

export interface Message {
  day: number;
  key: string;
  params?: Record<string, string | number>;
  tone: 'info' | 'good' | 'bad' | 'warn';
}

export interface Difficulty {
  prices: 'easy' | 'normal' | 'hard';
  risk: 'low' | 'normal' | 'high';
  insurance: boolean;
  permadeath: boolean;
}

export interface Stats {
  jumps: number;
  tradesProfit: number;
  contractsDone: number;
  contractsFailed: number;
  discoveries: number;
  deaths: number;
  unitsMined: number;
  daysPlayed: number;
  accidents: number;
  fines: number;
  /** v2 */
  fights: number;
  victories: number;
  fled: number;
}

export interface PendingEvent {
  eventId: string;
  context: { systemId: number; bodyId?: string; anomalyId?: string };
}

export interface GameState {
  v: number;
  seed: string;
  galaxySize: number;
  difficulty: Difficulty;
  day: number;
  rng: RngState;
  credits: number;
  ship: Ship;
  /** v3: true on a new game until the first ship is bought (the placeholder `ship` is not owned yet). */
  noShip: boolean;
  /** v3: the captain's name chosen on the new-game screen. */
  captain: string;
  cargo: CargoItem[];
  /** body: index of the body the ship is at, -1 = jump point. */
  location: { systemId: number; stationId: string | null; body: number };
  inventory: ModuleInstance[];
  visited: number[];
  seen: number[];
  /** Systems whose bodies the player has detected, systemId -> body ids. */
  detected: Record<number, string[]>;
  prices: Record<string, Record<string, KnownPrice>>;
  stations: Record<string, StationDyn>;
  bodies: Record<string, BodyDyn>;
  events: MarketEvent[];
  contracts: Contract[];
  messages: Message[];
  notes: Record<string, string>;
  discoveries: { id: string; name: string; day: number; value: number; sold: boolean }[];
  stats: Stats;
  insurance: { active: boolean; full: boolean; due: number; lapsedSince: number | null };
  home: string;
  flags: Record<string, number | string | boolean>;
  pendingEvent: PendingEvent | null;
  uidCounter: number;
  lastEconDay: number;
  dead: boolean;
  tutorial: { step: number; done: boolean };
  /** Systems where the player found hints (unlocked via events). */
  hints: string[];
  /** v2 */
  crew: CrewMember[];
  wagesDue: number;
  combat: import('./combat/types').CombatState | null;
  encounter: import('./combat/types').Encounter | null;
  /** Officer ids already met (each appears once per game). */
  officersMet: string[];
}

export const SAVE_VERSION = 3;

/* ------------------------------ v2: crew & combat ------------------------------ */

export interface CrewMember {
  id: string;
  name: string;
  race: import('../content/crew').RaceId;
  role: import('../content/crew').Role;
  /** Skill levels 0..10 (fractional: experience accumulates). */
  skills: Record<import('../content/crew').Skill, number>;
  hp: number;
  fatigue: number;
  morale: number;
  wage: number;
  officer?: import('../content/crew').OfficerId;
  /** Portrait seed. */
  look: number;
  /** Day hired (for tenure and stories). */
  hired: number;
}

export interface Recruit extends Omit<CrewMember, 'hp' | 'fatigue' | 'morale'> {
  fee: number;
}
