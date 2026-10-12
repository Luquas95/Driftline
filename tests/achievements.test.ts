import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS } from '../src/content/achievements';
import { STARTS } from '../src/content/starts';
import { checkAchievements } from '../src/core/achievements';
import { dailyScore, dailySeed, isDateKey, wealthOf } from '../src/core/daily';
import {
  dailyRanking,
  emptyProfile,
  parseProfile,
  recordDaily,
  startUnlocked,
  syncAchievements,
} from '../src/core/profile';
import { triggerEnding } from '../src/core/endings';
import { newGame } from '../src/core/start';
import { cs } from '../src/i18n/cs';
import { computeShipStats } from '../src/core/ship';
import { mk } from './helpers';

describe('achievements', () => {
  it('there are at least thirty, with unique ids and texts', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(30);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) {
      expect(cs[`ach.${a.id}`], a.id).toBeTruthy();
      expect(cs[`ach.${a.id}.desc`], a.id).toBeTruthy();
    }
    for (const c of ['trade', 'explore', 'combat', 'story', 'challenge'])
      expect(cs[`ach.cat.${c}`]).toBeTruthy();
  });

  it('unlock once when their condition holds', () => {
    const s = mk('ACH1');
    expect(checkAchievements(s)).toEqual([]);
    s.stats.tradesProfit = 150;
    s.stats.victories = 1;
    const got = checkAchievements(s);
    expect(got).toContain('first_profit');
    expect(got).toContain('first_blood');
    expect(checkAchievements(s)).toEqual([]);
    expect(s.ach.first_profit).toBe(s.day);
  });

  it('every achievement can be earned (its check is satisfiable by some state)', () => {
    const s = mk('ACH2');
    s.credits = 5_000_000;
    Object.assign(s.stats, {
      tradesProfit: 1e6,
      contractsDone: 100,
      discoveries: 50,
      jumps: 500,
      victories: 100,
      deaths: 1,
    });
    s.visited = Array.from({ length: 150 }, (_, i) => i);
    s.story.artifacts = 4;
    s.research.done = Array.from({ length: 30 }, (_, i) => `t${i}`);
    s.lang.learned = 64;
    s.fac.member = 'lumen';
    s.fac.rank = 5;
    s.fac.rep = { consortium: 40, directorate: 40, freeholds: 40, lumen: 40, corsairs: 40 };
    s.crew.push(
      ...Array.from({ length: 6 }, (_, i) => ({ ...s.crew[0], id: `x${i}`, officer: 'navigator' as const })),
    );
    s.base = {
      systemId: 0,
      bodyIndex: 0,
      kind: 'station',
      name: 'B',
      founded: 0,
      buildings: {},
      queue: [],
      storage: {},
      treasury: 0,
      lines: [],
      orders: [],
      autoSell: {},
      hangar: [1, 2, 3].map((i) => ({
        id: `f${i}`,
        name: 'f',
        ship: s.ship,
        crew: [],
        order: 'idle' as const,
        route: null,
        trip: null,
        earned: 0,
        trips: 0,
        idleUntil: 0,
      })),
      attack: null,
      log: [],
      lastTick: 0,
      stats: { produced: 5000, sold: 0, fleetIncome: 20000, upkeep: 0, attacks: 5, repelled: 5 },
    };
    s.day = 150;
    checkAchievements(s);
    // the ending ones, one run each
    const rest = ACHIEVEMENTS.filter((a) => s.ach[a.id] === undefined).map((a) => a.id);
    for (const id of ['science', 'accord', 'exodus', 'dominion', 'consumed']) {
      const t = JSON.parse(JSON.stringify(s)) as typeof s;
      t.base = null;
      t.flags['hullChanges'] = 0;
      t.difficulty = { prices: 'hard', risk: 'high', insurance: true, permadeath: true };
      t.day = 100;
      triggerEnding(t, id);
      for (const a of Object.keys(t.ach)) if (!s.ach[a]) s.ach[a] = 1;
    }
    expect(ACHIEVEMENTS.filter((a) => s.ach[a.id] === undefined).map((a) => a.id)).toEqual([]);
    expect(rest.length).toBeGreaterThan(3);
  });
});

describe('starts', () => {
  it('lists a standard start and at least three unlockable ones with texts', () => {
    expect(STARTS.length).toBeGreaterThanOrEqual(4);
    for (const st of STARTS) {
      expect(cs[`start.${st.id}`]).toBeTruthy();
      if (st.id !== 'standard') expect(cs[`msg.start.${st.id}`]).toBeTruthy();
    }
  });

  it('a special start gives its ship, purse, standing and knowledge; flyable', () => {
    for (const id of ['smuggler', 'scientist', 'refugee']) {
      const s = newGame({ seed: `START-${id}`, start: id });
      expect(s.noShip).toBe(false);
      expect(s.run.start).toBe(id);
      expect(s.crew.length).toBeGreaterThan(0);
      const st = computeShipStats(s.ship);
      expect(st.coreMissing).toEqual([]);
      expect(st.rangeFull).toBeGreaterThan(5);
    }
    const sm = newGame({ seed: 'START-s', start: 'smuggler' });
    expect(sm.fac.rep.corsairs).toBe(30);
    expect(sm.fac.rep.directorate).toBe(-15);
    expect(sm.ship.slots.some((m) => m?.defId === 'vault_s')).toBe(true);
    const sc = newGame({ seed: 'START-s', start: 'scientist' });
    expect(sc.lang.learned).toBe(4);
    expect(sc.research.points).toBeGreaterThan(0);
  });

  it('standard still goes through the shipyard; unknown ids fall back to it', () => {
    expect(newGame({ seed: 'S1' }).noShip).toBe(true);
    expect(newGame({ seed: 'S1', start: 'nope' }).noShip).toBe(true);
  });
});

describe('profile and the daily challenge', () => {
  it('the daily seed comes from the date; difficulty is fixed; same date = same galaxy', () => {
    expect(isDateKey('2026-10-07')).toBe(true);
    expect(isDateKey('7.10.2026')).toBe(false);
    expect(dailySeed('2026-10-07')).toBe('daily-2026-10-07');
    const a = newGame({ daily: '2026-10-07', difficulty: { prices: 'hard' } });
    const b = newGame({ daily: '2026-10-07' });
    const c = newGame({ daily: '2026-10-08' });
    expect(a.seed).toBe('daily-2026-10-07');
    expect(a.difficulty).toEqual(b.difficulty);
    expect(a.difficulty.prices).toBe('normal');
    expect(a.run.daily).toBe('2026-10-07');
    expect(JSON.stringify(a.threat.foci)).toBe(JSON.stringify(b.threat.foci));
    expect(c.seed).not.toBe(a.seed);
  });

  it('scores wealth and the story and keeps the best of a date in a local ranking', () => {
    const p = emptyProfile();
    const s = newGame({ daily: '2026-10-07', quickStart: true });
    const w0 = wealthOf(s);
    expect(dailyScore(s)).toBeGreaterThanOrEqual(w0);
    recordDaily(p, s);
    const first = p.daily['2026-10-07'].best;
    s.credits += 50000;
    recordDaily(p, s);
    expect(p.daily['2026-10-07'].best).toBeGreaterThan(first);
    s.credits = 0;
    recordDaily(p, s);
    expect(p.daily['2026-10-07'].best).toBeGreaterThan(first);
    const other = newGame({ daily: '2026-10-08', quickStart: true });
    other.credits = 1;
    recordDaily(p, other);
    const rank = dailyRanking(p);
    expect(rank[0].date).toBe('2026-10-07');
    expect(rank).toHaveLength(2);
    // a run that is not a daily is ignored
    recordDaily(p, mk('X'));
    expect(Object.keys(p.daily)).toHaveLength(2);
  });

  it('collects achievements across runs and unlocks starts', () => {
    const p = emptyProfile();
    expect(startUnlocked(p, 'standard')).toBe(true);
    expect(startUnlocked(p, 'smuggler')).toBe(false);
    const s = mk('PROF');
    s.fac.rep.corsairs = 30;
    checkAchievements(s);
    expect(syncAchievements(p, s)).toContain('clan_friend');
    expect(syncAchievements(p, s)).toEqual([]);
    expect(startUnlocked(p, 'smuggler')).toBe(true);
  });

  it('parses stored profiles defensively', () => {
    expect(parseProfile(null)).toEqual(emptyProfile());
    expect(parseProfile('x')).toEqual(emptyProfile());
    const p = parseProfile({
      ach: { nope: { seed: 'a', day: 1 }, millionaire: { seed: 'a', day: 5 } },
      daily: { bad: { score: 1 }, '2026-01-02': { score: 'x' }, '2026-01-03': { score: 9, day: 4 } },
      runs: -3,
    });
    expect(Object.keys(p.ach)).toEqual(['millionaire']);
    expect(Object.keys(p.daily)).toEqual(['2026-01-03']);
    expect(p.runs).toBe(0);
  });
});
