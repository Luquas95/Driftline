import type { Cond, Effect, EventChoice, EventDef, EventTrigger } from '../core/eventTypes';
import type { OfficerId, RaceId, Role, Skill } from './crew';
import type { GoodTag, ModuleKind, Quality, Region } from '../core/types';

/**
 * Event authoring: structure and Czech text are written together, then split into the data-driven
 * definition (EVENTS, referencing i18n keys) and the dictionary entries (EVENT_TEXTS_CS).
 */
export const EVENT_TEXTS_CS: Record<string, string> = {};

export interface OutIn {
  text: string;
  fx: Effect[];
  w: number;
}
export interface ChIn {
  text: string;
  req?: Cond[];
  outs: OutIn[];
}

export const out = (text: string, fx: Effect[] = [], w = 1): OutIn => ({ text, fx, w });
export const ch = (text: string, outs: OutIn[], req?: Cond[]): ChIn => ({ text, outs, req });

export const EVENTS: EventDef[] = [];

export function ev(
  id: string,
  trigger: EventTrigger,
  weight: number,
  conditions: Cond[],
  title: string,
  text: string,
  choices: ChIn[],
): void {
  EVENT_TEXTS_CS[`ev.${id}.title`] = title;
  EVENT_TEXTS_CS[`ev.${id}.text`] = text;
  const cs: EventChoice[] = choices.map((c, ci) => {
    EVENT_TEXTS_CS[`ev.${id}.c${ci}`] = c.text;
    return {
      textKey: `ev.${id}.c${ci}`,
      requires: c.req,
      outcomes: c.outs.map((o, oi) => {
        EVENT_TEXTS_CS[`ev.${id}.c${ci}.o${oi}`] = o.text;
        return { weight: o.w, effects: o.fx, textKey: `ev.${id}.c${ci}.o${oi}` };
      }),
    };
  });
  EVENTS.push({
    id,
    trigger,
    weight,
    conditions,
    titleKey: `ev.${id}.title`,
    textKey: `ev.${id}.text`,
    choices: cs,
  });
}

export const cr = (n: number): Effect => ({ t: 'credits', n });
export const hull = (n: number): Effect => ({ t: 'hull', n });
export const fuel = (n: number): Effect => ({ t: 'fuel', n });
export const sup = (n: number): Effect => ({ t: 'supplies', n });
export const days = (n: number): Effect => ({ t: 'days', n });
export const wear = (n: number, kind?: ModuleKind): Effect => ({ t: 'wear', n, kind });
export const goods = (goodId: string, qty: number): Effect => ({ t: 'goods', goodId, qty });
export const rep = (n: number): Effect => ({ t: 'rep', n });
export const reveal = (radius: number): Effect => ({ t: 'reveal', radius });
export const discover = (value: number): Effect => ({ t: 'discover', value });
export const flag = (key: string, value: number | string | boolean = true): Effect => ({
  t: 'flag',
  key,
  value,
});
export const lose = (frac: number): Effect => ({ t: 'loseCargo', frac });
export const mod = (quality?: Quality, kind?: ModuleKind): Effect => ({ t: 'module', quality, kind });
export const probes = (n: number): Effect => ({ t: 'probes', n });
export const regionIn = (...r: Region[]): Cond => ({ t: 'region', in: r });
export const hasMod = (kind: ModuleKind): Cond => ({ t: 'hasModule', kind });
export const tag = (t: GoodTag): Cond => ({ t: 'cargoTag', tag: t });
export const dangerMin = (n: number): Cond => ({ t: 'dangerMin', n });

export const hurt = (n: number, all = false): Effect => ({ t: 'crewHurt', n, all });
export const xp = (skill: Skill, n: number): Effect => ({ t: 'crewXp', skill, n });
export const morale = (n: number): Effect => ({ t: 'crewMorale', n });
export const leave = (role?: Role): Effect => ({ t: 'crewLeave', role });
export const join = (level: number, role?: Role, race?: RaceId): Effect => ({
  t: 'crewJoin',
  level,
  role,
  race,
});
export const fight = (enemy: string, tier: number): Effect => ({ t: 'fight', enemy, tier });
export const hasRole = (role: Role): Cond => ({ t: 'crewRole', role });
export const hasRace = (race: RaceId): Cond => ({ t: 'crewRace', race });
export const skillMin = (skill: Skill, min: number): Cond => ({ t: 'crewSkill', skill, min });
export const hasOfficer = (id: OfficerId): Cond => ({ t: 'officer', id });
