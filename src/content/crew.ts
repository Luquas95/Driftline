/** Crew content: races, roles and officers. All original. Texts live in i18n (race.*, role.*, officer.*). */

export type RaceId = 'orrin' | 'sylk' | 'brakh' | 'tessari' | 'nyxul' | 'veth';
export type Role = 'pilot' | 'engineer' | 'gunner' | 'medic' | 'trader' | 'scientist';
export type Skill = 'piloting' | 'engineering' | 'gunnery' | 'medicine' | 'trade' | 'science';
export type HeadShape = 'round' | 'tall' | 'wide' | 'angular' | 'crest';
export type Accessory = 'none' | 'visor' | 'antenna' | 'scar' | 'horns' | 'mask';

export interface RaceDef {
  id: RaceId;
  /** Damage multiplier from thin air (lower = more tolerant). */
  breath: number;
  /** Fire damage multiplier. */
  fire: number;
  repair: number;
  melee: number;
  /** Supplies per day multiplier. */
  supply: number;
  /** Trade and negotiation influence. */
  social: number;
  hp: number;
  /** Skill with a +1 head start. */
  affinity: Skill;
  /** Portrait palette hue (0..1) and typical heads. */
  hue: number;
  heads: HeadShape[];
  eyes: number;
}

export const RACES: RaceDef[] = [
  {
    id: 'orrin',
    breath: 0.4,
    fire: 0.8,
    repair: 0.8,
    melee: 1.2,
    supply: 1.2,
    social: 0.9,
    hp: 1.2,
    affinity: 'engineering',
    hue: 0.08,
    heads: ['angular', 'crest'],
    eyes: 2,
  },
  {
    id: 'sylk',
    breath: 1.0,
    fire: 1.2,
    repair: 1.3,
    melee: 0.8,
    supply: 0.8,
    social: 1.0,
    hp: 0.8,
    affinity: 'piloting',
    hue: 0.55,
    heads: ['tall', 'round'],
    eyes: 2,
  },
  {
    id: 'brakh',
    breath: 0.9,
    fire: 1.0,
    repair: 0.9,
    melee: 1.5,
    supply: 1.5,
    social: 0.8,
    hp: 1.4,
    affinity: 'gunnery',
    hue: 0.02,
    heads: ['wide', 'angular'],
    eyes: 2,
  },
  {
    id: 'tessari',
    breath: 1.1,
    fire: 1.0,
    repair: 1.0,
    melee: 0.6,
    supply: 1.0,
    social: 1.4,
    hp: 0.9,
    affinity: 'trade',
    hue: 0.78,
    heads: ['round', 'crest'],
    eyes: 2,
  },
  {
    id: 'nyxul',
    breath: 0.7,
    fire: 1.1,
    repair: 1.0,
    melee: 1.0,
    supply: 0.6,
    social: 0.9,
    hp: 0.9,
    affinity: 'science',
    hue: 0.66,
    heads: ['tall', 'angular'],
    eyes: 3,
  },
  {
    id: 'veth',
    breath: 1.0,
    fire: 0.5,
    repair: 1.0,
    melee: 1.0,
    supply: 1.0,
    social: 1.1,
    hp: 1.0,
    affinity: 'medicine',
    hue: 0.38,
    heads: ['crest', 'wide'],
    eyes: 2,
  },
];
export const RACES_BY_ID = Object.fromEntries(RACES.map((r) => [r.id, r])) as Record<RaceId, RaceDef>;

export const ROLES: Role[] = ['pilot', 'engineer', 'gunner', 'medic', 'trader', 'scientist'];
export const ROLE_SKILL: Record<Role, Skill> = {
  pilot: 'piloting',
  engineer: 'engineering',
  gunner: 'gunnery',
  medic: 'medicine',
  trader: 'trade',
  scientist: 'science',
};
export const SKILLS: Skill[] = ['piloting', 'engineering', 'gunnery', 'medicine', 'trade', 'science'];

export type OfficerId = 'haggler' | 'ghost' | 'taskmaster' | 'sharpshooter' | 'mender' | 'navigator';

export interface OfficerDef {
  id: OfficerId;
  role: Role;
  /** Fixed name and portrait seed so every officer is a recognisable character. */
  name: string;
  race: RaceId;
  portrait: number;
  /** Event shown on hiring (ev.<eventId>). */
  eventId: string;
  wageMult: number;
}

/** Officers are rare, one of each per game; each offers a special ability (see core/crew.ts `officerBonus`). */
export const OFFICERS: OfficerDef[] = [
  {
    id: 'haggler',
    role: 'trader',
    name: 'Ilvaria Dun',
    race: 'tessari',
    portrait: 1101,
    eventId: 'officer_haggler',
    wageMult: 1.8,
  },
  {
    id: 'ghost',
    role: 'pilot',
    name: 'Kesh Oru',
    race: 'sylk',
    portrait: 1102,
    eventId: 'officer_ghost',
    wageMult: 1.8,
  },
  {
    id: 'taskmaster',
    role: 'engineer',
    name: 'Brom Tark',
    race: 'brakh',
    portrait: 1103,
    eventId: 'officer_taskmaster',
    wageMult: 1.8,
  },
  {
    id: 'sharpshooter',
    role: 'gunner',
    name: 'Zhe Nuvai',
    race: 'nyxul',
    portrait: 1104,
    eventId: 'officer_sharpshooter',
    wageMult: 1.8,
  },
  {
    id: 'mender',
    role: 'medic',
    name: 'Orsa Vell',
    race: 'veth',
    portrait: 1105,
    eventId: 'officer_mender',
    wageMult: 1.8,
  },
  {
    id: 'navigator',
    role: 'scientist',
    name: 'Teq Ahlun',
    race: 'orrin',
    portrait: 1106,
    eventId: 'officer_navigator',
    wageMult: 1.8,
  },
];
export const OFFICERS_BY_ID = Object.fromEntries(OFFICERS.map((o) => [o.id, o])) as Record<
  OfficerId,
  OfficerDef
>;

const SYL_A = [
  'Ka',
  'Vo',
  'Ilu',
  'Tess',
  'Mar',
  'Dzu',
  'Nel',
  'Ruk',
  'Sha',
  'Orn',
  'Pel',
  'Yas',
  'Quo',
  'Hel',
];
const SYL_B = ['ri', 'an', 'ul', 'esh', 'ova', 'ik', 'ara', 'un', 'eth', 'ix'];
const SYL_C = ['', 'n', 'th', 'ra', 'x', 'vi', 'ko', 'sa'];

export function crewName(pick: (n: number) => number): string {
  return SYL_A[pick(SYL_A.length)] + SYL_B[pick(SYL_B.length)] + SYL_C[pick(SYL_C.length)];
}
