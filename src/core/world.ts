/** Initial v4 state for new games and for migrated saves (everything derives from the seed). */
import { newFactionState } from './factions';
import { getGalaxy } from './galaxy';
import { initThreat } from './threat';
import type { Difficulty, GameState } from './types';

export type WorldPart = Pick<
  GameState,
  'fac' | 'base' | 'research' | 'threat' | 'lang' | 'story' | 'ach' | 'ending' | 'run'
>;

export function newWorld(
  seed: string,
  galaxySize: number,
  difficulty: Difficulty,
  startSystemId: number,
  startId = 'standard',
  daily: string | null = null,
): WorldPart {
  const g = getGalaxy(seed, galaxySize);
  return {
    fac: newFactionState(),
    base: null,
    research: { done: [], points: 0, active: null, progress: 0, totalEarned: 0 },
    threat: initThreat(g, seed, difficulty.risk, g.systems[startSystemId] ?? g.systems[0]),
    lang: { learned: 0 },
    story: { stage: 0, log: [], artifacts: 0 },
    ach: {},
    ending: null,
    run: { start: startId, daily },
  };
}
