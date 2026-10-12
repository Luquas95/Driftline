/**
 * v4 state: factions, home base, research, fleet, threat, alien language, story and achievements.
 * All of it is plain JSON; static definitions live in `src/content/`.
 */
import type { CrewMember, Ship } from './types';

/* ------------------------------- factions ------------------------------- */

export type FactionId = 'consortium' | 'directorate' | 'freeholds' | 'lumen' | 'corsairs';
export const FACTION_IDS: FactionId[] = ['consortium', 'directorate', 'freeholds', 'lumen', 'corsairs'];

export interface War {
  id: string;
  a: FactionId;
  b: FactionId;
  start: number;
  /** Day the truce is signed (the war is over from this day). */
  end: number;
  /** -1..1: positive = `a` is winning. */
  front: number;
}

export interface FactionState {
  /** -100..100 per faction. */
  rep: Record<FactionId, number>;
  member: FactionId | null;
  /** Rank inside the member faction: 0 = recruit .. 5. */
  rank: number;
  /** Merit points toward the next rank. */
  merit: number;
  /** System ownership overrides won in wars: systemId -> owner (null = abandoned). */
  owner: Record<number, FactionId | null>;
  wars: War[];
  nextWarCheck: number;
  history: { day: number; key: string; params?: Record<string, string | number> }[];
}

/* -------------------------------- base --------------------------------- */

export interface ProdLine {
  goodId: string;
  /** Stop producing when the stock reaches this level (0 = no limit). */
  cap: number;
}

export interface BuildOrder {
  id: string;
  kind: 'module' | 'hull';
  /** Module or hull id. */
  item: string;
  quality?: string;
  start: number;
  done: number;
}

export interface FleetShip {
  id: string;
  name: string;
  ship: Ship;
  crew: CrewMember[];
  order: 'idle' | 'trade' | 'escort' | 'guard';
  route: { from: string; to: string; goodId: string | null } | null;
  /** Current trip of an auto trader: `profit` is the cash returned when it ends (capital + gain), `cost` the outlay. */
  trip: { start: number; end: number; profit: number; cost: number; lost: boolean } | null;
  earned: number;
  trips: number;
  /** Day the ship is available again (lost ships need repairs). */
  idleUntil: number;
}

export interface Base {
  systemId: number;
  bodyIndex: number;
  kind: 'station' | 'colony';
  name: string;
  founded: number;
  /** Building id -> level (0/absent = not built). */
  buildings: Record<string, number>;
  /** Buildings under construction. */
  queue: { id: string; level: number; start: number; done: number }[];
  storage: Record<string, number>;
  treasury: number;
  lines: ProdLine[];
  orders: BuildOrder[];
  /** Goods the port sells automatically above this keep level (goodId -> keep). */
  autoSell: Record<string, number>;
  hangar: FleetShip[];
  attack: { strength: number; day: number; resolve: number } | null;
  log: { day: number; key: string; params?: Record<string, string | number> }[];
  lastTick: number;
  /** Rolling stats for the balance report. */
  stats: {
    produced: number;
    sold: number;
    fleetIncome: number;
    upkeep: number;
    attacks: number;
    repelled: number;
  };
}

/* ------------------------------- research ------------------------------- */

export interface ResearchState {
  done: string[];
  /** Unspent research points. */
  points: number;
  active: string | null;
  progress: number;
  totalEarned: number;
}

/* -------------------------------- threat -------------------------------- */

export interface ThreatState {
  /** The spread begins on this day. */
  start: number;
  foci: number[];
  /** systemId -> grip 0..100 (sparse). 100 = consumed. */
  grip: Record<number, number>;
  consumed: number;
  /** 0..1 accumulated slowdown from research, artifacts and decisions. */
  mitigation: number;
  /** True once the story has stopped the spread. */
  stopped: boolean;
  lastTick: number;
}

/* -------------------------------- language ------------------------------- */

export interface LangState {
  /** How many concepts of the (seeded) learning order are known. */
  learned: number;
}

/* --------------------------------- story -------------------------------- */

export interface StoryState {
  /** Main line stage, 0 = not started. */
  stage: number;
  /** Decisions taken (stable keys). */
  log: { day: number; key: string }[];
  /** Artifacts found in exploration. */
  artifacts: number;
}

export interface EndingState {
  id: string;
  day: number;
  /** After a saving ending the player may keep playing. */
  freePlay: boolean;
}

export interface RunInfo {
  /** Start option id (`standard`, `smuggler`, ...). */
  start: string;
  /** Daily challenge date key (`2026-10-07`) or null. */
  daily: string | null;
}
