import type { FactionId } from '../core/worldTypes';
import type { Region } from '../core/types';

/** Vector crest parameters; `FactionCrest` (ui) draws it as SVG, the map draws the colour only. */
export interface CrestSpec {
  /** Outline polygon sides (0 = circle). */
  sides: number;
  /** Inner glyph. */
  glyph: 'diamond' | 'cross' | 'wing' | 'eye' | 'bolt' | 'tri';
  bars: number;
  rot: number;
}

export interface FactionDef {
  id: FactionId;
  /** 0xRRGGBB */
  color: number;
  accent: number;
  crest: CrestSpec;
  /** Where the capital is looked for. */
  capitalRegion: Region[];
  /** Polar angle (rad) from the galaxy centre where the capital is preferred. */
  capitalAngle: number;
  /** Territory reach as a fraction of the galaxy radius. */
  reach: number;
  /** Relation to the others, -1 (hatred) .. 1 (alliance). Symmetric by construction (see `relation`). */
  relations: Partial<Record<FactionId, number>>;
  /** Tariff multiplier in the faction's own space (before reputation). */
  tariff: number;
  /** Customs inspection multiplier (before reputation). */
  inspection: number;
  /** Contract kinds the faction prefers to issue. */
  contractBias: Partial<Record<string, number>>;
  /** Exclusive hull the faction sells to members (and friends, see hull `minRank`). */
  exclusiveHull: string;
}

/** Required merit points per rank 1..5 (rank 0 = no rank). */
export const RANK_MERIT = [0, 40, 120, 280, 520, 900];

export const FACTIONS: FactionDef[] = [
  {
    id: 'consortium',
    color: 0xe0b341,
    accent: 0xfff0b5,
    crest: { sides: 6, glyph: 'diamond', bars: 2, rot: 0 },
    capitalRegion: ['inner', 'outer'],
    capitalAngle: 2.1,
    reach: 0.55,
    relations: { directorate: 0.3, freeholds: -0.15, lumen: 0.25, corsairs: -0.6 },
    tariff: 0.85,
    inspection: 0.8,
    contractBias: { freight: 1.7, supply: 1.3, courier: 1.1 },
    exclusiveHull: 'karavela',
  },
  {
    id: 'directorate',
    color: 0x4f86d6,
    accent: 0xcfe2ff,
    crest: { sides: 8, glyph: 'cross', bars: 3, rot: 0.39 },
    capitalRegion: ['core'],
    capitalAngle: 0,
    reach: 0.5,
    relations: { consortium: 0.3, freeholds: -0.45, lumen: 0.1, corsairs: -0.95 },
    tariff: 1.2,
    inspection: 1.6,
    contractBias: { courier: 1.6, rescue: 1.4, survey: 0.8 },
    exclusiveHull: 'aegis',
  },
  {
    id: 'freeholds',
    color: 0x58b86c,
    accent: 0xd3f5da,
    crest: { sides: 5, glyph: 'wing', bars: 1, rot: -0.31 },
    capitalRegion: ['rim', 'outer'],
    capitalAngle: 0.6,
    reach: 0.6,
    relations: { consortium: -0.15, directorate: -0.45, lumen: 0.25, corsairs: 0.05 },
    tariff: 0.6,
    inspection: 0.5,
    contractBias: { passenger: 1.6, supply: 1.4, rescue: 1.2 },
    exclusiveHull: 'pioneer',
  },
  {
    id: 'lumen',
    color: 0xa377e0,
    accent: 0xe8dcff,
    crest: { sides: 0, glyph: 'eye', bars: 0, rot: 0 },
    capitalRegion: ['inner', 'outer'],
    capitalAngle: 4.0,
    reach: 0.5,
    relations: { consortium: 0.25, directorate: 0.1, freeholds: 0.25, corsairs: -0.3 },
    tariff: 0.95,
    inspection: 0.7,
    contractBias: { survey: 1.9, rescue: 1.3, courier: 1.1 },
    exclusiveHull: 'observatory',
  },
  {
    id: 'corsairs',
    color: 0xd8503f,
    accent: 0xffd0c8,
    crest: { sides: 3, glyph: 'bolt', bars: 2, rot: 0.52 },
    capitalRegion: ['outer', 'rim'],
    capitalAngle: 5.2,
    reach: 0.38,
    relations: { consortium: -0.6, directorate: -0.95, freeholds: 0.05, lumen: -0.3 },
    tariff: 0.4,
    inspection: 0,
    contractBias: { freight: 1.2, courier: 1.4, supply: 1.2 },
    exclusiveHull: 'raider',
  },
];

export const FACTIONS_BY_ID: Record<FactionId, FactionDef> = Object.fromEntries(
  FACTIONS.map((f) => [f.id, f]),
) as Record<FactionId, FactionDef>;

/** Symmetric relation between two factions, -1..1 (1 for itself). */
export function relation(a: FactionId, b: FactionId): number {
  if (a === b) return 1;
  return FACTIONS_BY_ID[a].relations[b] ?? FACTIONS_BY_ID[b].relations[a] ?? 0;
}

/** Reputation tiers (from the lowest). Boundaries are the lower limits. */
export const STANDING_TIERS: { id: 'enemy' | 'hostile' | 'neutral' | 'friendly' | 'ally'; min: number }[] = [
  { id: 'enemy', min: -100 },
  { id: 'hostile', min: -60 },
  { id: 'neutral', min: -20 },
  { id: 'friendly', min: 25 },
  { id: 'ally', min: 60 },
];

/** Faction hulls need this standing (or rank) with their faction. */
export const HULL_UNLOCK_REP = 40;
