import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { importSave } from '../src/core/save';
import { SAVE_VERSION } from '../src/core/types';
import { passTime } from '../src/core/time';
import { galaxyOf } from '../src/core/state';
import { HULLS_BY_ID } from '../src/content/hulls';

const v1 = readFileSync('tests/fixtures/v1-save.json', 'utf8');

describe('v1 -> v2 save migration', () => {
  it('loads a v1 save and adds a default crew by hull, no weapons, no combat', () => {
    expect(JSON.parse(v1).version).toBe(1);
    const s = importSave(v1);
    expect(s.v).toBe(SAVE_VERSION);
    expect(s.noShip).toBe(false);
    expect(s.crew).toHaveLength(HULLS_BY_ID[s.ship.hullId].crew);
    expect(s.crew.map((c) => c.role)[0]).toBe('pilot');
    expect(s.combat).toBeNull();
    expect(s.encounter).toBeNull();
    expect(s.stats.fights).toBe(0);
    expect(
      s.ship.slots.some(
        (m) => m && ['energy', 'kinetic', 'missile', 'ion', 'drones'].some((k) => m.defId.startsWith(k)),
      ),
    ).toBe(false);
  });

  it('keeps the galaxy and economy identical and keeps playing', () => {
    const s = importSave(v1);
    expect(galaxyOf(s).seed).toBe('V1FIXTURE');
    const day = s.day;
    passTime(s, 10);
    expect(s.day).toBeCloseTo(day + 10, 6);
    expect(Number.isFinite(s.credits)).toBe(true);
  });

  it('migration is deterministic', () => {
    expect(importSave(v1).crew).toEqual(importSave(v1).crew);
  });
});

describe('v2 -> v3 save migration', () => {
  const asV2 = (): string => {
    const cur = JSON.parse(JSON.stringify(importSave(v1)));
    cur.v = 2;
    delete cur.noShip;
    delete cur.captain;
    return JSON.stringify({
      magic: 'driftline-save',
      version: 2,
      savedAt: '2026-01-01T00:00:00Z',
      state: cur,
    });
  };

  it('a v2 save keeps its ship and gets noShip=false and a captain name', () => {
    const s = importSave(asV2());
    expect(s.v).toBe(SAVE_VERSION);
    expect(s.noShip).toBe(false);
    expect(typeof s.captain).toBe('string');
    expect(s.captain.length).toBeGreaterThan(0);
    const before = s.day;
    passTime(s, 3);
    expect(s.day).toBeGreaterThan(before);
  });

  it('time does not pass while the player is still without a ship', () => {
    const s = importSave(v1);
    s.noShip = true;
    const day = s.day;
    expect(() => passTime(s, 5)).not.toThrow();
    expect(s.day).toBe(day);
  });
});

describe('v3 -> v4 save migration', () => {
  const asV3 = (): string => {
    const cur = JSON.parse(JSON.stringify(importSave(v1)));
    cur.v = 3;
    for (const k of ['fac', 'base', 'research', 'threat', 'lang', 'story', 'ach', 'ending', 'run'])
      delete cur[k];
    return JSON.stringify({
      magic: 'driftline-save',
      version: 3,
      savedAt: '2026-01-01T00:00:00Z',
      state: cur,
    });
  };

  it('generates factions and the threat deterministically from the seed; no base yet', () => {
    const a = importSave(asV3());
    const b = importSave(asV3());
    expect(a.v).toBe(SAVE_VERSION);
    expect(a.base).toBeNull();
    expect(a.fac.member).toBeNull();
    expect(a.threat.foci.length).toBeGreaterThanOrEqual(1);
    expect(a.threat.foci).toEqual(b.threat.foci);
    expect(a.ending).toBeNull();
    expect(a.research.done).toEqual([]);
    expect(a.run.start).toBe('standard');
  });

  it('a migrated game keeps playing: time passes, wars and the spread run', () => {
    const s = importSave(asV3());
    for (let i = 0; i < 120; i++) {
      s.ship.supplies = 1000;
      passTime(s, 1);
    }
    expect(s.day).toBeGreaterThan(100);
    expect(s.threat.lastTick).toBeGreaterThan(0);
  });

  it('a v1 save goes all the way to the current version', () => {
    const s = importSave(v1);
    expect(s.v).toBe(SAVE_VERSION);
    expect(s.fac.rep.consortium).toBe(0);
  });

  it('repairs malformed v4 sections instead of crashing', () => {
    const s = JSON.parse(JSON.stringify(importSave(v1)));
    s.fac = { rep: { consortium: 'x' }, wars: [{ a: 'nope' }], owner: null };
    s.threat = { foci: [9999], grip: { 5: 'a', 7: 40 } };
    s.lang = null;
    const back = importSave(JSON.stringify(s));
    expect(back.fac.rep.consortium).toBe(0);
    expect(back.fac.wars).toEqual([]);
    expect(back.threat.foci.every((id) => id < back.galaxySize)).toBe(true);
    expect(back.lang.learned).toBe(0);
  });
});
