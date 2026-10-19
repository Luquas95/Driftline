import { describe, expect, it } from 'vitest';
import {
  consumedShare,
  gripLevel,
  initThreat,
  simulateSpread,
  spreadSpeed,
  threatDaily,
  threatSupply,
} from '../src/core/threat';
import { checkAutoEndings, endingSummary, ENDINGS, triggerEnding } from '../src/core/endings';
import { galaxyOf } from '../src/core/state';
import { dist } from '../src/core/galaxy';
import { passTime } from '../src/core/time';
import { dockAt } from '../src/core/game';
import { mk } from './helpers';
import type { GameState } from '../src/core/types';

const game = (seed: string, risk: 'low' | 'normal' | 'high' = 'normal'): GameState =>
  mk(seed, 300, { difficulty: { risk } });

describe('threat: the Grey', () => {
  it('has foci far from the start, deterministic for a seed, more of them on harder risk', () => {
    const a = game('TH1');
    const g = galaxyOf(a);
    const start = g.systems[a.location.systemId];
    for (const f of a.threat.foci) expect(dist(g.systems[f], start)).toBeGreaterThan(g.radius * 0.5);
    expect(initThreat(g, a.seed, 'normal', start).foci).toEqual(a.threat.foci);
    expect(game('TH1', 'high').threat.foci.length).toBeGreaterThan(game('TH1', 'low').threat.foci.length);
  });

  it('spreads slowly and visibly along routes, faster over time', () => {
    const s = game('TH2');
    for (let d = 1; d < s.threat.start; d++) threatDaily(s, d);
    expect(Object.keys(s.threat.grip)).toHaveLength(0);
    for (let d = s.threat.start + 1; d <= s.threat.start + 40; d++) threatDaily(s, d);
    const early = Object.keys(s.threat.grip).length;
    expect(early).toBeGreaterThanOrEqual(1);
    // grip spreads to a neighbour of a focus first
    const g = galaxyOf(s);
    const reached = Object.keys(s.threat.grip).map(Number);
    for (const id of reached) {
      const near = s.threat.foci.some(
        (f) =>
          f === id ||
          g.systems[f].neighbors.includes(id) ||
          g.systems[f].neighbors.some((n) => g.systems[n].neighbors.includes(id)),
      );
      expect(near).toBe(true);
    }
    expect(spreadSpeed(s, 300)).toBeGreaterThan(spreadSpeed(s, 60));
    for (let d = s.threat.start + 41; d <= 250; d++) threatDaily(s, d);
    expect(Object.keys(s.threat.grip).length).toBeGreaterThan(early * 2);
    expect(gripLevel(0)).toBe(0);
    expect(gripLevel(100)).toBe(4);
  });

  it('consumes the galaxy in roughly 300-500 days without opposition, by difficulty', () => {
    const t: Record<string, number> = {};
    for (const risk of ['low', 'normal', 'high'] as const) {
      const times = ['TH3', 'TH4', 'TH5'].map((seed) => simulateSpread(game(seed, risk), 0.8, 1500));
      t[risk] = times.reduce((a, b) => a + b, 0) / times.length;
    }
    expect(t.high).toBeGreaterThan(250);
    expect(t.high).toBeLessThan(t.normal);
    expect(t.normal).toBeLessThan(t.low);
    expect(t.normal).toBeGreaterThan(330);
    expect(t.normal).toBeLessThan(520);
    expect(t.low).toBeLessThan(650);
  });

  it('slows with mitigation and recedes once stopped', () => {
    const base = game('TH6');
    const slow = game('TH6');
    slow.threat.mitigation = 0.6;
    expect(simulateSpread(slow, 0.3, 1500, true)).toBeGreaterThan(simulateSpread(base, 0.3, 1500, true));
    const s = game('TH6');
    for (let d = 1; d <= 120; d++) threatDaily(s, d);
    const before = Object.values(s.threat.grip).reduce((a, b) => a + b, 0);
    expect(before).toBeGreaterThan(0);
    s.threat.stopped = true;
    for (let d = 121; d <= 260; d++) threatDaily(s, d);
    expect(Object.values(s.threat.grip).reduce((a, b) => a + b, 0)).toBeLessThan(before * 0.2);
  });

  it('empties shelves, closes docks of consumed systems and reaches milestones', () => {
    const s = game('TH7');
    const g = galaxyOf(s);
    const sys = g.systems.find((x) => x.stations.length)!;
    expect(threatSupply(s, sys.id)).toBe(1);
    s.threat.grip[sys.id] = 60;
    expect(threatSupply(s, sys.id)).toBeLessThan(0.6);
    s.threat.grip[sys.id] = 100;
    s.location = { systemId: sys.id, stationId: null, body: -1 };
    expect(dockAt(s, sys.stations[0].id)).toMatchObject({ ok: false, error: 'err.consumed' });
    // milestones fire once and end the wars
    s.fac.wars.push({ id: 'w', a: 'directorate', b: 'corsairs', start: 0, end: 999, front: 0 });
    for (let i = 0; i < 40; i++) s.threat.grip[(i * 7) % 300] = 100;
    s.threat.consumed = 40;
    threatDaily(s, 200);
    expect(s.fac.wars[0].end).toBeLessThanOrEqual(200);
    expect(s.flags['thm:0.12']).toBeDefined();
  });

  it('time passing runs the spread and stays deterministic', () => {
    const run = () => {
      const s = game('TH8');
      for (let i = 0; i < 160; i++) {
        s.ship.supplies = 1000;
        passTime(s, 1);
      }
      return JSON.stringify(s.threat);
    };
    expect(run()).toBe(run());
  });
});

describe('endings', () => {
  it('has at least four, one of them automatic (the galaxy is consumed)', () => {
    expect(ENDINGS.length).toBeGreaterThanOrEqual(4);
    expect(ENDINGS.filter((e) => e.saves).length).toBeGreaterThanOrEqual(2);
  });

  it('the consumed ending comes by itself and ends time; the saving ones stop the Grey', () => {
    const s = game('TH9');
    for (let i = 0; i < 300; i++) s.threat.grip[i] = 100;
    s.threat.consumed = 300;
    checkAutoEndings(s);
    expect(s.ending?.id).toBe('consumed');
    expect(s.ending?.freePlay).toBe(false);
    const day = s.day;
    passTime(s, 5);
    expect(s.day).toBe(day);
    expect(consumedShare(s)).toBe(1);
    const t = game('TH9');
    triggerEnding(t, 'science');
    expect(t.ending).toMatchObject({ id: 'science', freePlay: true });
    expect(t.threat.stopped).toBe(true);
    triggerEnding(t, 'accord');
    expect(t.ending?.id).toBe('science');
  });

  it('a final ending reached mid-trip stops the daily ticks that day', () => {
    const s = game('TH9b');
    for (let i = 0; i < 300; i++) s.threat.grip[i] = 100;
    s.threat.consumed = 300;
    const econDay = s.lastEconDay;
    passTime(s, 10);
    expect(s.ending?.id).toBe('consumed');
    expect(s.lastEconDay).toBe(econDay + 1);
  });

  it('summarises the run: stats, decisions, fates of the crew (deterministic)', () => {
    const s = game('TH10');
    s.story.log.push({ day: 3, key: 'copied' });
    triggerEnding(s, 'accord');
    const a = endingSummary(s)!;
    const b = endingSummary(s)!;
    expect(a).toEqual(b);
    expect(a.decisions).toEqual(['copied']);
    expect(a.crew.length).toBe(s.crew.length);
    expect(a.stats.find((x) => x.key === 'days')).toBeDefined();
    expect(a.factions).toHaveLength(5);
    expect(endingSummary(game('TH11'))).toBeNull();
  });
});
