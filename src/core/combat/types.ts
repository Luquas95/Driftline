import type { ModuleKind, Quality, Size } from '../types';
import type { OfficerId, RaceId, Role, Skill } from '../../content/crew';
import type { RngState } from '../rng';
import type { WeaponStats } from '../../content/weapons';

export type Side = 'player' | 'enemy';
export type PowerGroup = 'weapons' | 'shields' | 'engines' | 'life' | 'other';
export const POWER_GROUPS: PowerGroup[] = ['weapons', 'shields', 'engines', 'life', 'other'];

export type WeaponKind = 'energy' | 'kinetic' | 'missile' | 'ion' | 'drones' | 'teleporter';
export const WEAPON_KINDS: WeaponKind[] = ['energy', 'kinetic', 'missile', 'ion', 'drones', 'teleporter'];

export type Personality = 'cautious' | 'aggressive' | 'greedy' | 'feral' | 'turret';

export interface CRoom {
  /** Slot index in the hull layout (rooms mirror the slot grid). */
  slot: number;
  x: number;
  y: number;
  /** Module kind installed here, null for an empty room. */
  kind: ModuleKind | null;
  size: Size | null;
  /** Installed module definition (for salvage). */
  defId: string | null;
  quality: Quality | null;
  /** System health 0..100 (module condition). */
  sys: number;
  o2: number;
  fire: number;
  /** Open hull breach: 0 = sealed, >0 = patch work remaining (0..100). */
  breach: number;
  /** Seconds the system is disabled by ion damage. */
  ion: number;
  /** Neighbouring room indices. */
  adj: number[];
}

export interface CWeapon {
  id: string;
  kind: WeaponKind;
  room: number;
  size: Size;
  quality: Quality;
  charge: number;
  /** Target: enemy ship index and room index. */
  target: { ship: number; room: number } | null;
  /** Fire automatically when charged (default true). */
  auto: boolean;
  /** Seconds left until a drone bay can launch again. */
  cooldown: number;
}

export interface CCrew {
  id: string;
  name: string;
  race: RaceId;
  role: Role;
  skills: Record<Skill, number>;
  hp: number;
  maxHp: number;
  room: number;
  /** Rooms to walk through (first element is the next room). */
  path: number[];
  /** Seconds until the next room is reached. */
  stepT: number;
  /** Post assigned by the player (stays there when idle). */
  post: number | null;
  task: 'idle' | 'repair' | 'fire' | 'breach' | 'heal' | 'fight' | 'man';
  look: number;
  officer?: OfficerId;
  /** Index in GameState.crew for player crew, -1 for enemy crew. */
  stateIndex: number;
  /** Experience gained in this fight: skill -> xp. */
  xp: Partial<Record<Skill, number>>;
  /** Boarding: ship index when currently on an enemy ship, else -1. */
  boardedOn: number;
}

export interface CDrone {
  id: string;
  kind: 'attack' | 'defense';
  ttl: number;
  cd: number;
}

export interface CShip {
  side: Side;
  /** Ship index within its side list. */
  index: number;
  name: string;
  hullId: string;
  hull: number;
  hullMax: number;
  shield: number;
  shieldMax: number;
  /** Shield points regenerated per second at full power. */
  shieldRegen: number;
  rooms: CRoom[];
  weapons: CWeapon[];
  crew: CCrew[];
  drones: CDrone[];
  heat: number;
  overheated: boolean;
  /** Reactor output (power units). */
  powerOut: number;
  /** Required power per group (sum of module draws). */
  need: Record<PowerGroup, number>;
  /** Player-chosen weights per group (relative). */
  weights: Record<PowerGroup, number>;
  /** Evasion base from hull agility. */
  agility: number;
  jumpCharge: number;
  /** Fleeing: charging the escape jump. */
  fleeing: boolean;
  canFlee: boolean;
  missiles: number;
  personality: Personality;
  alive: boolean;
  /** 'destroyed' | 'fled' | 'surrendered' once out of the fight. */
  out: null | 'destroyed' | 'fled' | 'surrendered';
  /** Radiator-style cooling bonus (heat per second). */
  cooling: number;
  /** Max crew hp pool multiplier unused for ships; loot table id for enemies. */
  lootId: string;
  /** Free flee (officer ability) still unused. */
  freeFlee: boolean;
  /** Enemy asked for tribute already. */
  demanded: boolean;
  /** Cargo value carried (enemy loot basis). */
  teleporterCharge: number;
}

export interface Projectile {
  id: number;
  from: Side;
  fromShip: number;
  toShip: number;
  toRoom: number;
  kind: WeaponKind | 'drone';
  dmg: number;
  t: number;
  total: number;
  quality: number;
  ws?: WeaponStats;
}

export type CombatEvent =
  | { t: 'fire'; side: Side; ship: number; room: number; kind: string; toShip: number; toRoom: number }
  | { t: 'hit'; ship: number; side: Side; room: number; shield: boolean; dmg: number; kind: string }
  | { t: 'miss'; ship: number; side: Side; room: number }
  | { t: 'shield'; ship: number; side: Side }
  | { t: 'breach'; ship: number; side: Side; room: number }
  | { t: 'fire-start'; ship: number; side: Side; room: number }
  | { t: 'explode'; ship: number; side: Side }
  | { t: 'crew-down'; ship: number; side: Side; name: string }
  | { t: 'overheat'; ship: number; side: Side }
  | { t: 'jump'; side: Side }
  | { t: 'msg'; key: string; params?: Record<string, string | number> };

export type CombatOutcome = 'victory' | 'defeat' | 'fled' | 'surrender' | 'tribute' | 'enemy-fled';

export interface CombatState {
  v: 1;
  seed: string;
  rng: RngState;
  time: number;
  nextId: number;
  paused: boolean;
  /** Auto-combat: the AI also drives the player's ship. */
  auto: boolean;
  player: CShip;
  enemies: CShip[];
  projectiles: Projectile[];
  /** Events produced since the last drain (UI effects, log). */
  events: CombatEvent[];
  log: { time: number; key: string; params?: Record<string, string | number> }[];
  outcome: CombatOutcome | null;
  /** Encounter id (loot, reputation rules). */
  kind: EncounterKind;
  /** Enemy template ids for loot and reputation. */
  enemyDefs: string[];
  /** Tribute demand awaiting the player's answer, as a fraction of cargo. */
  demand: number | null;
  /** True when the fight was started with a surprise advantage penalty etc. */
  difficultyRisk: number;
  /** Systems where the fight happens (for wreck/loot). */
  systemId: number;
}

export type EncounterKind = 'pirate' | 'hunter' | 'customs' | 'wreck' | 'fauna';

export interface EncounterOption {
  id: 'fight' | 'flee' | 'bribe' | 'negotiate' | 'pay' | 'evade';
  /** Credits needed (bribe, pay). */
  cost?: number;
  /** Success chance estimate shown to the player (0..1). */
  chance?: number;
}

export interface Encounter {
  kind: EncounterKind;
  enemyDefs: string[];
  tier: number;
  systemId: number;
  options: EncounterOption[];
  /** Short text key plus params for the modal. */
  textKey: string;
  params: Record<string, string | number>;
}
