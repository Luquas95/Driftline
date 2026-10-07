import type { OfficerId, RaceId, Role, Skill } from '../content/crew';
import type { GoodTag, ModuleKind, Quality, Region } from './types';

/**
 * Event condition. The union is deliberately open: v2 adds crew/combat conditions, v3 faction/threat
 * conditions, either as new `t` variants or through the generic `ext` hook handled by registered evaluators.
 */
export type Cond =
  | { t: 'region'; in: Region[] }
  | { t: 'cargoTag'; tag: GoodTag }
  | { t: 'hasModule'; kind: ModuleKind }
  | { t: 'creditsMin'; n: number }
  | { t: 'creditsMax'; n: number }
  | { t: 'fuelBelow'; frac: number }
  | { t: 'hullBelow'; frac: number }
  | { t: 'repMin'; n: number }
  | { t: 'repMax'; n: number }
  | { t: 'flag'; key: string; value?: number | string | boolean }
  | { t: 'dangerMin'; n: number }
  | { t: 'cargoValueMin'; n: number }
  | { t: 'dayMin'; n: number }
  | { t: 'crewRole'; role: Role }
  | { t: 'crewRace'; race: RaceId }
  | { t: 'crewSkill'; skill: Skill; min: number }
  | { t: 'crewMoraleBelow'; n: number }
  | { t: 'officer'; id: OfficerId }
  | { t: 'not'; c: Cond }
  | { t: 'ext'; key: string; args?: Record<string, unknown> };

export type Effect =
  | { t: 'credits'; n: number }
  | { t: 'creditsPct'; pct: number }
  | { t: 'fuel'; n: number }
  | { t: 'supplies'; n: number }
  | { t: 'hull'; n: number }
  | { t: 'wear'; n: number; kind?: ModuleKind }
  | { t: 'goods'; goodId: string; qty: number }
  | { t: 'loseCargo'; frac: number }
  | { t: 'module'; quality?: Quality; kind?: ModuleKind }
  | { t: 'reveal'; radius: number }
  | { t: 'days'; n: number }
  | { t: 'rep'; n: number }
  | { t: 'flag'; key: string; value: number | string | boolean }
  | { t: 'probes'; n: number }
  | { t: 'discover'; value: number }
  | { t: 'crewHurt'; n: number; all?: boolean }
  | { t: 'crewXp'; skill: Skill; n: number }
  | { t: 'crewMorale'; n: number }
  | { t: 'crewLeave'; role?: Role }
  | { t: 'crewJoin'; role?: Role; race?: RaceId; level: number }
  | { t: 'fight'; enemy: string; tier: number }
  | { t: 'death' }
  | { t: 'ext'; key: string; args?: Record<string, unknown> };

export interface EventOutcome {
  weight: number;
  effects: Effect[];
  /** i18n key suffix is derived: ev.<id>.c<choice>.o<outcome> */
  textKey: string;
}

export interface EventChoice {
  textKey: string;
  requires?: Cond[];
  outcomes: EventOutcome[];
}

export type EventTrigger = 'jump' | 'arrival' | 'anomaly' | 'dock' | 'mine';

export interface EventDef {
  id: string;
  trigger: EventTrigger;
  weight: number;
  conditions: Cond[];
  textKey: string;
  titleKey: string;
  choices: EventChoice[];
}
