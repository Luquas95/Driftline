import type { GameState } from '../core/types';
import { FACTION_IDS } from '../core/worldTypes';
import { TECHS } from './tech';

export type AchCategory = 'trade' | 'explore' | 'combat' | 'story' | 'challenge';

export interface AchievementDef {
  id: string;
  cat: AchCategory;
  /** Pure check on the game state (called after every action). */
  check: (s: GameState) => boolean;
}

const a = (id: string, cat: AchCategory, check: (s: GameState) => boolean): AchievementDef => ({
  id,
  cat,
  check,
});
const ended = (s: GameState, id: string): boolean => s.ending?.id === id;
const saved = (s: GameState): boolean => !!s.ending?.freePlay;
const hullChanges = (s: GameState): number => Number(s.flags['hullChanges'] ?? 0);
const langShare = (s: GameState, n: number): boolean => s.lang.learned >= n;

/** Texts: ach.<id> (name) and ach.<id>.desc. */
export const ACHIEVEMENTS: AchievementDef[] = [
  // trade
  a('first_profit', 'trade', (s) => s.stats.tradesProfit >= 100),
  a('merchant_10k', 'trade', (s) => s.stats.tradesProfit >= 10000),
  a('merchant_100k', 'trade', (s) => s.stats.tradesProfit >= 100000),
  a('rich_100k', 'trade', (s) => s.credits >= 100000),
  a('millionaire', 'trade', (s) => s.credits >= 1000000),
  a('contracts_10', 'trade', (s) => s.stats.contractsDone >= 10),
  a('contracts_50', 'trade', (s) => s.stats.contractsDone >= 50),
  a('landlord', 'trade', (s) => !!s.base),
  a('industrialist', 'trade', (s) => (s.base?.stats.produced ?? 0) >= 2000),
  a('fleet_3', 'trade', (s) => (s.base?.hangar.length ?? 0) >= 3),
  a('fleet_income', 'trade', (s) => (s.base?.stats.fleetIncome ?? 0) >= 10000),
  // exploration
  a('explorer_20', 'explore', (s) => s.visited.length >= 20),
  a('explorer_100', 'explore', (s) => s.visited.length >= 100),
  a('discoveries_10', 'explore', (s) => s.stats.discoveries >= 10),
  a('jumps_100', 'explore', (s) => s.stats.jumps >= 100),
  a('artifact_1', 'explore', (s) => s.story.artifacts >= 1),
  a('artifact_3', 'explore', (s) => s.story.artifacts >= 3),
  a('techs_10', 'explore', (s) => s.research.done.length >= 10),
  a('techs_all', 'explore', (s) => s.research.done.length >= TECHS.length),
  // combat and crew
  a('first_blood', 'combat', (s) => s.stats.victories >= 1),
  a('warrior_25', 'combat', (s) => s.stats.victories >= 25),
  a('crew_5', 'combat', (s) => s.crew.length >= 5),
  a('officer', 'combat', (s) => s.crew.some((c) => !!c.officer)),
  a('survivor', 'combat', (s) => s.stats.deaths >= 1 && !s.dead),
  a('base_defended', 'combat', (s) => (s.base?.stats.repelled ?? 0) >= 3),
  // story and factions
  a('faction_join', 'story', (s) => s.fac.member !== null),
  a('faction_rank3', 'story', (s) => s.fac.rank >= 3),
  a('faction_rank5', 'story', (s) => s.fac.rank >= 5),
  a('diplomat', 'story', (s) => FACTION_IDS.filter((f) => s.fac.rep[f] >= 25).length >= 3),
  a('clan_friend', 'story', (s) => s.fac.rep.corsairs >= 25),
  a('language_half', 'story', (s) => langShare(s, 32)),
  a('language_full', 'story', (s) => langShare(s, 64)),
  a('ending_science', 'story', (s) => ended(s, 'science')),
  a('ending_accord', 'story', (s) => ended(s, 'accord')),
  a('ending_exodus', 'story', (s) => ended(s, 'exodus')),
  a('ending_dominion', 'story', (s) => ended(s, 'dominion')),
  a('ending_consumed', 'story', (s) => ended(s, 'consumed')),
  // challenges
  a('no_fight_100', 'challenge', (s) => s.day >= 100 && s.stats.fights === 0),
  a('ending_permadeath', 'challenge', (s) => saved(s) && s.difficulty.permadeath),
  a('ending_one_hull', 'challenge', (s) => saved(s) && hullChanges(s) === 0 && !s.base),
  a(
    'ending_hard',
    'challenge',
    (s) => saved(s) && s.difficulty.prices === 'hard' && s.difficulty.risk === 'high',
  ),
  a('ending_quick', 'challenge', (s) => saved(s) && (s.ending?.day ?? 1e9) <= 320),
];

export const ACHIEVEMENTS_BY_ID: Record<string, AchievementDef> = Object.fromEntries(
  ACHIEVEMENTS.map((x) => [x.id, x]),
);
