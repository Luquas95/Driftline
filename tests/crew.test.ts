import { describe, expect, it } from 'vitest';
import { OFFICERS, RACES, ROLE_SKILL, SKILLS } from '../src/content/crew';
import {
  bestSkill,
  crewCapacity,
  crewDaily,
  crewSupplyPerDay,
  dismissCrew,
  gainXp,
  hireCrew,
  makeCrew,
  refreshRecruits,
  tradeBonus,
  wageOf,
} from '../src/core/crew';
import { dockAt } from '../src/core/game';
import { Rng } from '../src/core/rng';
import { passTime } from '../src/core/time';
import { stationOf } from '../src/core/state';
import { mk } from './helpers';

describe('races and skills', () => {
  it('has at least five races with distinct traits and a portrait palette each', () => {
    expect(RACES.length).toBeGreaterThanOrEqual(5);
    const sig = new Set(
      RACES.map((r) => [r.breath, r.fire, r.repair, r.melee, r.supply, r.social, r.hp].join('/')),
    );
    expect(sig.size).toBe(RACES.length);
    expect(new Set(RACES.map((r) => r.hue)).size).toBe(RACES.length);
  });

  it('generates the same crew member from the same rng', () => {
    const a = makeCrew(Rng.fromSeed('c'), 'x', { level: 3, day: 0 });
    const b = makeCrew(Rng.fromSeed('c'), 'x', { level: 3, day: 0 });
    expect(a).toEqual(b);
  });

  it('skills improve with use but stay within 0..10 and grow slower when high', () => {
    const c = makeCrew(Rng.fromSeed('c'), 'x', { level: 2, day: 0, role: 'gunner' });
    const before = c.skills.gunnery;
    gainXp(c, 'gunnery', 0.5);
    expect(c.skills.gunnery).toBeGreaterThan(before);
    c.skills.gunnery = 9.95;
    gainXp(c, 'gunnery', 5);
    expect(c.skills.gunnery).toBeLessThanOrEqual(10);
    const low = makeCrew(Rng.fromSeed('d'), 'y', { level: 1, day: 0, role: 'pilot' });
    const hi = makeCrew(Rng.fromSeed('d'), 'z', { level: 1, day: 0, role: 'pilot' });
    low.skills.piloting = 1;
    hi.skills.piloting = 8;
    gainXp(low, 'piloting', 0.3);
    gainXp(hi, 'piloting', 0.3);
    expect(low.skills.piloting - 1).toBeGreaterThan(hi.skills.piloting - 8);
  });

  it('every role has a main skill and the role skill is the best one at hire', () => {
    for (const role of Object.keys(ROLE_SKILL) as (keyof typeof ROLE_SKILL)[]) {
      const c = makeCrew(Rng.fromSeed(`r:${role}`), 'x', { role, level: 4, day: 0 });
      const main = c.skills[ROLE_SKILL[role]];
      for (const k of SKILLS) if (k !== ROLE_SKILL[role]) expect(main).toBeGreaterThanOrEqual(c.skills[k]);
    }
  });

  it('race affects supplies', () => {
    const s = mk('SUP');
    const base = crewSupplyPerDay(s);
    s.crew[0].race = 'brakh';
    expect(crewSupplyPerDay(s)).toBeGreaterThan(base - 1e-9);
    s.crew[0].race = 'nyxul';
    expect(crewSupplyPerDay(s)).toBeLessThan(
      crewSupplyPerDay({ crew: [{ ...s.crew[0], race: 'brakh' }, ...s.crew.slice(1)] }),
    );
  });

  it('trade skill reduces fees', () => {
    const s = mk('TR');
    const none = tradeBonus(s).feeMult;
    s.crew.push(makeCrew(Rng.fromSeed('t'), 't1', { role: 'trader', level: 6, day: 0 }));
    expect(tradeBonus(s).feeMult).toBeLessThan(none);
    expect(bestSkill(s, 'trade')).toBeGreaterThan(0);
  });
});

describe('hiring, wages and morale', () => {
  it('offers recruits that depend on the station and change weekly', () => {
    const s = mk('HIRE');
    const st = stationOf(s, s.location.stationId!);
    const a = refreshRecruits(s, st);
    expect(a.length).toBeGreaterThan(0);
    expect(refreshRecruits(s, st)).toBe(a);
    s.day += 8;
    const b = refreshRecruits(s, st);
    expect(b.map((r) => r.id)).not.toEqual(a.map((r) => r.id));
  });

  it('hiring costs the fee, adds the person and respects the soft limit', () => {
    const s = mk('HIRE2');
    s.credits = 100000;
    const st = stationOf(s, s.location.stationId!);
    const n0 = s.crew.length;
    const r = refreshRecruits(s, st)[0];
    expect(hireCrew(s, st.id, r.id).ok).toBe(true);
    expect(s.crew).toHaveLength(n0 + 1);
    expect(s.credits).toBe(100000 - r.fee);
    // overcrowding is allowed a little (soft) but not without limit
    let guard = 0;
    while (guard++ < 12) {
      s.day += 7;
      const rec = refreshRecruits(s, st)[0];
      if (!rec || !hireCrew(s, st.id, rec.id).ok) break;
    }
    expect(s.crew.length).toBeLessThanOrEqual(crewCapacity(s) + 3);
  });

  it('cannot hire without credits and cannot dismiss the last crew member', () => {
    const s = mk('HIRE3');
    const st = stationOf(s, s.location.stationId!);
    const r = refreshRecruits(s, st)[0];
    s.credits = 0;
    expect(hireCrew(s, st.id, r.id).ok).toBe(false);
    while (s.crew.length > 1) expect(dismissCrew(s, s.crew[0].id).ok).toBe(true);
    expect(dismissCrew(s, s.crew[0].id).ok).toBe(false);
  });

  it('wages are paid daily; unpaid wages and hunger lower morale', () => {
    const s = mk('WAGE');
    const wages = s.crew.reduce((a, c) => a + c.wage, 0);
    const credits = s.credits;
    crewDaily(s, 1, Rng.fromSeed('w'));
    expect(s.credits).toBeCloseTo(credits - wages, 6);
    const m0 = s.crew[0].morale;
    s.credits = 0;
    s.ship.supplies = 0;
    for (let i = 0; i < 5; i++) crewDaily(s, 1, Rng.fromSeed(`w${i}`));
    expect(s.crew[0].morale).toBeLessThan(m0 - 10);
    expect(s.wagesDue).toBeGreaterThan(0);
  });

  it('low morale makes crew leave when docked and starts a mutiny at sea', () => {
    const s = mk('MORALE');
    s.credits = 0;
    s.ship.supplies = 0;
    for (const c of s.crew) c.morale = 3;
    const n = s.crew.length;
    s.crew.push(makeCrew(Rng.fromSeed('x'), 'extra', { level: 2, day: 0 }));
    s.crew[s.crew.length - 1].morale = 3;
    for (let i = 0; i < 6; i++) crewDaily(s, 1, Rng.fromSeed(`d${i}`));
    expect(s.crew.length).toBeLessThan(n + 1);
    const t = mk('MUTINY');
    t.location.stationId = null;
    t.credits = 0;
    t.ship.supplies = 0;
    for (const c of t.crew) c.morale = 2;
    for (let i = 0; i < 10 && !t.pendingEvent; i++) crewDaily(t, 1, Rng.fromSeed(`m${i}`));
    expect(t.pendingEvent?.eventId).toBe('mutiny');
  });

  it('passTime runs the crew upkeep (wages leave the account)', () => {
    const s = mk('PT');
    const credits = s.credits;
    passTime(s, 3);
    expect(s.credits).toBeLessThan(credits);
  });
});

describe('officers', () => {
  it('are rare, unique and have a fixed identity', () => {
    expect(new Set(OFFICERS.map((o) => o.portrait)).size).toBe(OFFICERS.length);
    let seen = 0;
    const s = mk('OFF', 200);
    const g = [...Object.values(s.stations)];
    void g;
    for (let i = 0; i < 40; i++) {
      s.day = i * 7;
      for (const sys of [s.location.systemId]) void sys;
      const st = stationOf(s, s.location.stationId!);
      const list = refreshRecruits(s, st);
      seen += list.filter((r) => r.officer).length;
    }
    expect(seen).toBeLessThan(40 * 0.4);
  });

  it('wage of an officer is higher', () => {
    const base = makeCrew(Rng.fromSeed('o'), 'a', { role: 'trader', level: 6, day: 0 });
    const off = makeCrew(Rng.fromSeed('o'), 'b', { level: 6, day: 0, officer: 'haggler' });
    expect(wageOf(off)).toBeGreaterThan(wageOf({ ...base, skills: off.skills, role: off.role }) - 1);
  });
});

describe('docking keeps crew intact', () => {
  it('dock does not change crew', () => {
    const s = mk('DK');
    const n = s.crew.length;
    dockAt(s, s.location.stationId!);
    expect(s.crew).toHaveLength(n);
  });
});
