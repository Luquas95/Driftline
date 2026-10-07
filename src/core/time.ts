import { maybeSpawnEvent, tickEconomy } from './economy';
import { failExpired } from './contractOps';
import { isSpoiled } from './cargo';
import { GOODS_BY_ID } from '../content/goods';
import { analyze, damageHull, galaxyOf, msg, premiumPerDay } from './state';
import { T } from './tuning';
import type { Galaxy, GameState } from './types';

/**
 * Advance game time. Handles upkeep (supplies, insurance), the daily economy tick, perishables and expired contracts.
 */
export function passTime(state: GameState, days: number): void {
  if (!Number.isFinite(days) || days <= 0 || state.dead) return;
  const g = galaxyOf(state);
  const { stats } = analyze(state);
  state.day += days;
  state.stats.daysPlayed += days;
  state.ship.supplies = Math.max(0, state.ship.supplies - stats.suppliesPerDay * days);
  if (state.ship.supplies <= 0) {
    msg(state, 'msg.starving', undefined, 'bad');
    if (damageHull(state, 3 * days, true)) return;
  }
  if (state.insurance.active) {
    state.insurance.due += premiumPerDay(state) * days;
    if (state.credits >= state.insurance.due) {
      state.credits -= state.insurance.due;
      state.insurance.due = 0;
    } else if (state.insurance.due > premiumPerDay(state) * T.insuranceLapseDays) {
      state.insurance.active = false;
      state.insurance.lapsedSince = state.day;
      msg(state, 'msg.insuranceLapsed', undefined, 'bad');
    }
  }
  while (state.lastEconDay < Math.floor(state.day)) {
    state.lastEconDay++;
    tickEconomy(g, state, state.lastEconDay);
    const ev = maybeSpawnEvent(g, state, state.lastEconDay);
    if (ev && sectorKnown(state, g, ev.sector))
      msg(state, `msg.market.${ev.kind}`, { sector: g.sectors[ev.sector].name }, 'info');
    if (state.ship.shield < stats.shieldCap)
      state.ship.shield = Math.min(stats.shieldCap, state.ship.shield + stats.shieldCap * 0.5);
  }
  removeSpoiled(state);
  failExpired(state, g);
}

function removeSpoiled(state: GameState): void {
  const before = state.cargo.length;
  state.cargo = state.cargo.filter((c) => !isSpoiled(GOODS_BY_ID[c.goodId], state.day - c.acquiredDay));
  if (state.cargo.length < before) msg(state, 'msg.spoiled', undefined, 'warn');
}

function sectorKnown(state: GameState, g: Galaxy, sector: number): boolean {
  return state.visited.some((id) => g.systems[id].sector === sector);
}
