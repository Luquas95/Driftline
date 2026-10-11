import type { Cond } from '../core/eventTypes';

/**
 * Beats of the main line ("Dlouhá cesta"). A beat is an event (same id in `storyEvents.ts`) that is offered
 * on `dock` or `arrival` as soon as its conditions hold. Every beat is offered once, except the endings:
 * those return after `cooldown` days when the player declines.
 */
export interface Beat {
  id: string;
  trigger: 'dock' | 'arrival';
  when: Cond[];
  cooldown?: number;
}

const story = (min?: number, max?: number): Cond => ({ t: 'story', min, max });

export const STORY_BEATS: Beat[] = [
  { id: 'st_signal', trigger: 'dock', when: [{ t: 'dayMin', n: 12 }, story(0, 0)] },
  { id: 'st_pale', trigger: 'arrival', when: [{ t: 'gripHere', min: 5 }, story(1, 1)] },
  {
    id: 'st_lumen',
    trigger: 'dock',
    when: [story(2, 2), { t: 'fRep', f: 'lumen', min: 5 }, { t: 'dayMin', n: 30 }],
  },
  { id: 'st_dead', trigger: 'arrival', when: [{ t: 'gripHere', min: 100 }, story(2, 3)] },
  {
    id: 'st_directorate',
    trigger: 'dock',
    when: [
      story(3),
      { t: 'owner', f: 'directorate' },
      { t: 'consumedMin', share: 0.02 },
      { t: 'fRep', f: 'directorate', min: -30 },
    ],
  },
  {
    id: 'st_consortium',
    trigger: 'dock',
    when: [story(3), { t: 'owner', f: 'consortium' }, { t: 'consumedMin', share: 0.02 }],
  },
  {
    id: 'st_freeholds',
    trigger: 'dock',
    when: [story(3), { t: 'owner', f: 'freeholds' }, { t: 'consumedMin', share: 0.02 }],
  },
  {
    id: 'st_corsairs',
    trigger: 'dock',
    when: [story(3), { t: 'owner', f: 'corsairs' }, { t: 'fRep', f: 'corsairs', min: -30 }],
  },
  {
    id: 'st_sentence',
    trigger: 'dock',
    when: [story(3, 3), { t: 'langMin', frac: 0.4 }, { t: 'fRep', f: 'lumen', min: -10 }],
  },
  { id: 'st_paths', trigger: 'dock', when: [story(4, 4), { t: 'artifactsMin', n: 1 }] },
  // endings: offered when the conditions hold; "not yet" brings them back later
  {
    id: 'end_science',
    trigger: 'arrival',
    when: [
      story(5),
      { t: 'atBase' },
      { t: 'building', id: 'anchor', min: 1 },
      { t: 'tech', id: 'grey_decode' },
      { t: 'artifactsMin', n: 3 },
    ],
    cooldown: 25,
  },
  {
    id: 'end_accord',
    trigger: 'arrival',
    when: [
      story(5),
      { t: 'gripHere', min: 30 },
      { t: 'tech', id: 'accord_protocol' },
      { t: 'langMin', frac: 0.85 },
      { t: 'artifactsMin', n: 2 },
    ],
    cooldown: 25,
  },
  {
    id: 'end_exodus',
    trigger: 'arrival',
    when: [
      story(5),
      { t: 'atBase' },
      { t: 'tech', id: 'exodus_drive' },
      { t: 'hasHull', id: 'ark' },
      { t: 'fleetMin', n: 3 },
    ],
    cooldown: 25,
  },
  {
    id: 'end_dominion',
    trigger: 'dock',
    when: [
      story(5),
      { t: 'owner', f: 'consortium' },
      { t: 'fMember', f: 'consortium' },
      { t: 'fRank', min: 5 },
      { t: 'creditsMin', n: 600000 },
      { t: 'building', id: 'port', min: 3 },
    ],
    cooldown: 25,
  },
];

export const STORY_BEATS_BY_ID: Record<string, Beat> = Object.fromEntries(STORY_BEATS.map((b) => [b.id, b]));
