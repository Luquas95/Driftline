/** Endings of the game and the summary shown on the final screen. */
import { checkAchievements } from './achievements';
import { Rng } from './rng';
import { galaxyOf, msg } from './state';
import { consumedShare } from './threat';
import { understanding } from './lang';
import type { GameState } from './types';
import { FACTION_IDS } from './worldTypes';

export interface EndingDef {
  id: string;
  /** The galaxy survives: the player may keep playing without the threat. */
  saves: boolean;
  /** Tone for the final screen. */
  tone: 'good' | 'bittersweet' | 'bad';
}

export const ENDINGS: EndingDef[] = [
  { id: 'science', saves: true, tone: 'good' },
  { id: 'accord', saves: true, tone: 'bittersweet' },
  { id: 'exodus', saves: false, tone: 'bittersweet' },
  { id: 'consumed', saves: false, tone: 'bad' },
  { id: 'dominion', saves: true, tone: 'bittersweet' },
];

export const ENDINGS_BY_ID: Record<string, EndingDef> = Object.fromEntries(ENDINGS.map((e) => [e.id, e]));

/** The galaxy is lost when this share of the systems is consumed. */
export const CONSUMED_ENDING_SHARE = 0.8;

export function triggerEnding(state: GameState, id: string): void {
  if (state.ending) return;
  const def = ENDINGS_BY_ID[id];
  if (!def) return;
  state.ending = { id, day: state.day, freePlay: def.saves };
  if (def.saves) state.threat.stopped = true;
  state.story.log.push({ day: state.day, key: `ending.${id}` });
  msg(state, 'msg.ending', { ending: id }, def.tone === 'bad' ? 'bad' : 'good');
  checkAchievements(state);
}

/** The only ending that comes by itself: the Grey consumes the galaxy. */
export function checkAutoEndings(state: GameState): void {
  if (state.ending) return;
  if (consumedShare(state) >= CONSUMED_ENDING_SHARE) triggerEnding(state, 'consumed');
}

export interface EndingSummary {
  id: string;
  tone: EndingDef['tone'];
  freePlay: boolean;
  stats: { key: string; value: number }[];
  decisions: string[];
  crew: { name: string; role: string; fate: string }[];
  factions: { faction: string; rep: number }[];
}

/** What the player did: statistics, decisions, the crew's fates (deterministic). */
export function endingSummary(state: GameState): EndingSummary | null {
  const e = state.ending;
  if (!e) return null;
  const def = ENDINGS_BY_ID[e.id];
  const g = galaxyOf(state);
  const rng = Rng.fromSeed(`${state.seed}:fates:${e.id}`);
  const variants = 3;
  const crew = state.crew.map((c) => ({
    name: c.name,
    role: c.role,
    fate: `fate.${e.id}.${rng.int(0, variants - 1)}`,
  }));
  const b = state.base;
  const buildingLevels = b ? Object.values(b.buildings).reduce((s, v) => s + v, 0) : 0;
  return {
    id: e.id,
    tone: def.tone,
    freePlay: e.freePlay,
    stats: [
      { key: 'days', value: Math.floor(e.day) },
      { key: 'jumps', value: state.stats.jumps },
      { key: 'visited', value: state.visited.length },
      { key: 'galaxy', value: g.systems.length },
      { key: 'profit', value: Math.round(state.stats.tradesProfit) },
      { key: 'contracts', value: state.stats.contractsDone },
      { key: 'discoveries', value: state.stats.discoveries },
      { key: 'fights', value: state.stats.fights },
      { key: 'victories', value: state.stats.victories },
      { key: 'deaths', value: state.stats.deaths },
      { key: 'buildings', value: buildingLevels },
      { key: 'fleet', value: b ? b.hangar.length : 0 },
      { key: 'techs', value: state.research.done.length },
      { key: 'language', value: Math.round(understanding(state) * 100) },
      { key: 'artifacts', value: state.story.artifacts },
      { key: 'consumed', value: Math.round(consumedShare(state) * 100) },
      { key: 'credits', value: Math.round(state.credits) },
    ],
    decisions: state.story.log.filter((x) => !x.key.startsWith('ending.')).map((x) => x.key),
    crew,
    factions: FACTION_IDS.map((f) => ({ faction: f, rep: Math.round(state.fac.rep[f]) })),
  };
}

export function markEndingSeen(state: GameState): void {
  state.flags['endingSeen'] = 1;
}
