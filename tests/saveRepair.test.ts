import { describe, expect, it } from 'vitest';
import { fromParsed, serializeState } from '../src/core/save';
import { callTow } from '../src/core/game';
import { galaxyOf } from '../src/core/state';
import { passTime } from '../src/core/time';
import { transferGoods } from '../src/core/base';
import { T } from '../src/core/tuning';
import { mk } from './helpers';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const reload = (s: ReturnType<typeof mk>, edit: (raw: Record<string, any>) => void) => {
  const raw = JSON.parse(serializeState(s));
  edit(raw);
  return fromParsed(raw);
};

describe('loading damaged v4 saves', () => {
  it('drops or repairs a broken base instead of crashing the daily tick', () => {
    const s = mk('REP1', 120);
    for (const base of [{}, { systemId: 9999 }, { systemId: 0, queue: null, stats: null, hangar: 5 }]) {
      const loaded = reload(s, (raw) => (raw.base = base));
      expect(() => passTime(loaded, 5)).not.toThrow();
    }
  });

  it('ignores grip keys that are not system ids', () => {
    const s = mk('REP2', 120);
    const loaded = reload(s, (raw) => {
      raw.threat.grip = { abc: 50, '-1': 50, '1.5': 50, '3': 40 };
    });
    expect(Object.keys(loaded.threat.grip)).toEqual(['3']);
    expect(() => passTime(loaded, 60)).not.toThrow();
  });

  it('clamps the economy clock so a bad value cannot freeze the load', () => {
    const s = mk('REP3', 120);
    const loaded = reload(s, (raw) => (raw.lastEconDay = -5000000));
    expect(loaded.lastEconDay).toBeGreaterThanOrEqual(Math.floor(loaded.day) - 400);
    const t0 = Date.now();
    passTime(loaded, 1);
    expect(Date.now() - t0).toBeLessThan(5000);
  });

  it('replaces an unknown risk level and ending', () => {
    const s = mk('REP4', 120);
    const loaded = reload(s, (raw) => {
      raw.difficulty.risk = 'nope';
      raw.ending = { id: 'zzz', day: 3, freePlay: true };
    });
    expect(loaded.difficulty.risk).toBe('normal');
    expect(loaded.ending).toBeNull();
  });
});

describe('consumed systems', () => {
  it('a tow never lands in a consumed system and leaves fuel for a jump', () => {
    const s = mk('TOWDEAD', 120);
    const g = galaxyOf(s);
    // consume the player's own system
    s.threat.grip[s.location.systemId] = 100;
    s.location.stationId = null;
    s.ship.fuel = 0;
    const r = callTow(s);
    if (r.ok) {
      expect(s.threat.grip[s.location.systemId] ?? 0).toBeLessThan(T.threat.consumeAt);
      expect(s.ship.fuel).toBeGreaterThan(3);
      expect(g.stationsById[r.station]).toBeDefined();
    }
  });

  it('a fractional amount is rejected as a bad amount', () => {
    const s = mk('REP5', 120);
    expect(transferGoods(s, 'iron_ore', 0.5, 'toBase').ok).toBe(false);
  });
});
