/** Daily challenge: the same seed for everybody on a given date, scored locally. */
import { HULLS_BY_ID } from '../content/hulls';
import { GOODS_BY_ID } from '../content/goods';
import { MODULES_BY_ID } from '../content/modules';
import { modulePrice } from './ship';
import type { GameState } from './types';

/** `2026-10-07` (the caller supplies the date: core never reads the clock). */
export function isDateKey(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function dailySeed(dateKey: string): string {
  return `daily-${dateKey}`;
}

/** Wealth used by the daily challenge: credits, ship, cargo and the base. */
export function wealthOf(state: GameState): number {
  let w = state.credits;
  const h = HULLS_BY_ID[state.ship.hullId];
  if (h) w += h.price * 0.5;
  for (const m of state.ship.slots) if (m) w += modulePrice(MODULES_BY_ID[m.defId], m.quality) * 0.5;
  for (const c of state.cargo) w += c.qty * (GOODS_BY_ID[c.goodId]?.basePrice ?? 0) * 0.6;
  const b = state.base;
  if (b) {
    w += b.treasury;
    for (const [gid, n] of Object.entries(b.storage)) w += n * (GOODS_BY_ID[gid]?.basePrice ?? 0) * 0.5;
    w += Object.values(b.buildings).reduce((s, l) => s + l * 4000, 0);
    for (const f of b.hangar) w += (HULLS_BY_ID[f.ship.hullId]?.price ?? 0) * 0.4;
  }
  return Math.round(w);
}

/** Score: wealth plus rewards for the story. Ending the game well counts most. */
export function dailyScore(state: GameState): number {
  let s = wealthOf(state);
  s += state.story.artifacts * 5000;
  s += state.research.done.length * 1500;
  s += Math.round(state.lang.learned * 400);
  if (state.ending?.freePlay) s += 150000;
  else if (state.ending) s -= 20000;
  s -= state.stats.deaths * 4000;
  return s;
}
