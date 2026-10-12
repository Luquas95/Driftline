import { ACHIEVEMENTS } from '../content/achievements';
import { msg } from './state';
import type { GameState } from './types';

/** Check all achievements; records the new ones in `state.ach` and returns their ids. */
export function checkAchievements(state: GameState): string[] {
  const out: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (state.ach[a.id] !== undefined) continue;
    let earned: boolean;
    try {
      earned = a.check(state);
    } catch {
      earned = false;
    }
    if (!earned) continue;
    state.ach[a.id] = state.day;
    out.push(a.id);
    msg(state, 'msg.achievement', { ach: a.id }, 'good');
  }
  return out;
}
