/** The story director: offers the next beat of the main line as an event when its conditions hold. */
import { STORY_BEATS } from '../content/story';
import { evalCond, type EventContext } from './events';
import type { GameState } from './types';

export function rollStory(state: GameState, trigger: 'dock' | 'arrival', ctx: EventContext): boolean {
  if (state.pendingEvent || state.encounter || state.combat || state.dead) return false;
  if (state.ending && !state.ending.freePlay) return false;
  for (const b of STORY_BEATS) {
    if (b.trigger !== trigger && b.trigger !== 'both') continue;
    const key = `sb:${b.id}`;
    const last = state.flags[key];
    if (typeof last === 'number') {
      if (!b.cooldown || state.day - last < b.cooldown) continue;
    }
    if (state.ending && b.id.startsWith('end_')) continue;
    if (!b.when.every((c) => evalCond(state, c))) continue;
    state.flags[key] = state.day;
    state.pendingEvent = { eventId: b.id, context: ctx };
    return true;
  }
  return false;
}
