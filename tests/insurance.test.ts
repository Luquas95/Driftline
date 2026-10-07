import { describe, expect, it } from 'vitest';
import { newGame } from '../src/core/start';
import { applyEffect } from '../src/core/events';
import { damageHull, galaxyOf, premiumPerDay, analyze } from '../src/core/state';
import { passTime } from '../src/core/time';
import { callTow, jump } from '../src/core/game';
import { newModule, hullSlots } from '../src/core/ship';
import { addGoods } from '../src/core/cargo';
import { HULLS_BY_ID } from '../src/content/hulls';
import { mk } from './helpers';

function loaded(seed: string, insured = true, permadeath = false) {
  const s = newGame({ seed, galaxySize: 100, difficulty: { insurance: insured, permadeath } });
  const free = hullSlots(s.ship.hullId).filter((x) => !x.core && !s.ship.slots[x.index]);
  s.ship.slots[free[0].index] = newModule('shield_s', 'C', 'extra1');
  const { stats, dims } = analyze(s);
  addGoods(s.cargo, dims, { chilledCells: stats.chilledCells, secureCells: stats.secureCells }, 'metals', 20, 100, 0);
  s.credits = 4000;
  return s;
}

describe('insurance and death', () => {
  it('charges a daily premium', () => {
    const s = mk('INS1');
    expect(premiumPerDay(s)).toBeGreaterThan(0);
    const c = s.credits;
    passTime(s, 10);
    expect(s.credits).toBeLessThan(c);
  });

  it('lapses when the player cannot pay', () => {
    const s = mk('INS2');
    s.credits = 0;
    passTime(s, 30);
    expect(s.insurance.active).toBe(false);
    expect(s.insurance.lapsedSince).not.toBeNull();
    expect(s.messages.some((m) => m.key === 'msg.insuranceLapsed')).toBe(true);
  });

  it('destruction with insurance: respawn at the last station, cargo and uninsured modules lost', () => {
    const s = loaded('INS3');
    const home = s.home;
    const extra = s.ship.slots.find((m) => m?.uid === 'extra1');
    expect(extra).toBeTruthy();
    const credits = s.credits;
    const destroyed = damageHull(s, 9999, true);
    expect(destroyed).toBe(true);
    expect(s.dead).toBe(false);
    expect(s.cargo).toHaveLength(0);
    expect(s.ship.slots.some((m) => m?.uid === 'extra1')).toBe(false);
    expect(s.ship.hp).toBe(HULLS_BY_ID[s.ship.hullId].hp);
    expect(s.location.stationId).toBe(home);
    expect(s.credits).toBeLessThan(credits);
    expect(s.stats.deaths).toBe(1);
    // core modules survive
    expect(analyze(s).stats.coreMissing).toEqual([]);
  });

  it('full insurance keeps optional modules', () => {
    const s = loaded('INS4');
    s.insurance.full = true;
    damageHull(s, 9999, true);
    expect(s.ship.slots.some((m) => m?.uid === 'extra1')).toBe(true);
  });

  it('without insurance the player restarts with a starter ship and half the money', () => {
    const s = loaded('INS5', false);
    s.ship.hullId = 'wayfarer';
    const credits = s.credits;
    damageHull(s, 9999, true);
    expect(s.dead).toBe(false);
    expect(s.credits).toBe(Math.floor(credits * 0.5));
    expect(s.ship.slots.some((m) => m?.uid === 'extra1')).toBe(false);
    expect(s.location.stationId).not.toBeNull();
  });

  it('permadeath ends the run', () => {
    const s = loaded('INS6', true, true);
    damageHull(s, 9999, true);
    expect(s.dead).toBe(true);
    // time no longer advances
    const d = s.day;
    passTime(s, 5);
    expect(s.day).toBe(d);
  });

  it('shields absorb damage first', () => {
    const s = loaded('INS7');
    s.ship.shield = 20;
    damageHull(s, 15);
    expect(s.ship.hp).toBe(HULLS_BY_ID[s.ship.hullId].hp);
    expect(s.ship.shield).toBe(5);
    damageHull(s, 15);
    expect(s.ship.hp).toBe(HULLS_BY_ID[s.ship.hullId].hp - 10);
    expect(damageHull(s, 0)).toBe(false);
  });

  it('starving damages the hull and the effect death works', () => {
    const s = loaded('INS8');
    s.ship.supplies = 0;
    const hp = s.ship.hp;
    passTime(s, 2);
    expect(s.ship.hp).toBeLessThan(hp);
    applyEffect(s, { t: 'death' });
    expect(s.stats.deaths).toBe(1);
  });

  it('a stranded ship can always be towed to a station', () => {
    const s = loaded('INS9');
    const g = galaxyOf(s);
    s.location = { systemId: g.systems[50].id, stationId: null, body: -1 };
    s.ship.fuel = 0;
    const r = callTow(s);
    expect(r.ok).toBe(true);
    expect(s.location.stationId).not.toBeNull();
    expect(callTow(s).ok).toBe(false);
    expect(jump(s, g.systems[s.location.systemId].neighbors[0]).ok).toBeTypeOf('boolean');
  });
});
