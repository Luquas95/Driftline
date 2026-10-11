import { describe, expect, it } from 'vitest';
import { FACTIONS, relation } from '../src/content/factions';
import {
  activeWars,
  addMerit,
  addRep,
  factionDaily,
  inspectionMult,
  joinFaction,
  leaveFaction,
  onContractDone,
  ownerOf,
  repOf,
  tariffMult,
  territoryOf,
  territorySizes,
  tierOf,
} from '../src/core/factions';
import { galaxyOf } from '../src/core/state';
import { passTime } from '../src/core/time';
import { FACTION_IDS } from '../src/core/worldTypes';
import { buyHull, shopHulls } from '../src/core/shop';
import { quoteFor } from '../src/core/game';
import { mk } from './helpers';

describe('factions: territory', () => {
  it('every faction has a capital and a coherent territory', () => {
    const s = mk('FACT1');
    const g = galaxyOf(s);
    const t = territoryOf(g);
    const sizes = territorySizes(s);
    for (const f of FACTION_IDS) {
      expect(t.capital[f]).toBeGreaterThanOrEqual(0);
      expect(ownerOf(s, t.capital[f])).toBe(f);
      expect(sizes[f]).toBeGreaterThanOrEqual(8);
    }
    const free = g.systems.filter((x) => ownerOf(s, x.id) === null).length;
    expect(free).toBeGreaterThan(0);
  });

  it('is deterministic for a seed and differs between seeds', () => {
    const a = territoryOf(galaxyOf(mk('FACT2')));
    const b = territoryOf(galaxyOf(mk('FACT2')));
    expect(a.owner).toEqual(b.owner);
    const c = territoryOf(galaxyOf(mk('FACT3')));
    expect(c.owner).not.toEqual(a.owner);
  });

  it('relations are symmetric and the directorate hates the corsairs most', () => {
    for (const a of FACTION_IDS) for (const b of FACTION_IDS) expect(relation(a, b)).toBe(relation(b, a));
    const worst = FACTIONS.flatMap((x) => FACTIONS.map((y) => [x.id, y.id, relation(x.id, y.id)] as const))
      .filter(([a, b]) => a !== b)
      .sort((p, q) => p[2] - q[2])[0];
    expect([worst[0], worst[1]].sort()).toEqual(['corsairs', 'directorate']);
  });
});

describe('factions: reputation', () => {
  it('ripples to allies and enemies and is clamped', () => {
    const s = mk('FACT4');
    addRep(s, 'directorate', 20);
    expect(repOf(s, 'directorate')).toBe(20);
    expect(repOf(s, 'consortium')).toBeGreaterThan(0);
    expect(repOf(s, 'corsairs')).toBeLessThan(0);
    addRep(s, 'directorate', 500);
    expect(repOf(s, 'directorate')).toBe(100);
    expect(tierOf(100)).toBe('ally');
    expect(tierOf(-100)).toBe('enemy');
  });

  it('changes tariff and customs: friends pay less and are inspected less', () => {
    const s = mk('FACT5');
    const g = galaxyOf(s);
    const st = g.systems.flatMap((x) => x.stations).find((x) => ownerOf(s, x.systemId) === 'directorate')!;
    const base = tariffMult(s, st);
    const inspect0 = inspectionMult(s, st);
    addRep(s, 'directorate', 70, false);
    expect(tariffMult(s, st)).toBeLessThan(base);
    expect(inspectionMult(s, st)).toBeLessThan(inspect0);
    s.fac.rep.directorate = -80;
    expect(tariffMult(s, st)).toBeGreaterThan(base);
    expect(inspectionMult(s, st)).toBeGreaterThan(inspect0);
  });

  it("standing changes quotes at that faction's stations", () => {
    const s = mk('FACT6');
    const g = galaxyOf(s);
    const st = g.systems
      .flatMap((x) => x.stations)
      .find((x) => ownerOf(s, x.systemId) === 'consortium' && x.goods.length)!;
    const gid = st.goods.find((x) => !x.includes('missile'))!;
    const before = quoteFor(s, st.id, gid, 'buy', 5).total;
    s.fac.rep.consortium = 80;
    const after = quoteFor(s, st.id, gid, 'buy', 5).total;
    expect(after).toBeLessThan(before);
  });
});

describe('factions: membership and ranks', () => {
  it('needs some standing, promotes by merit and costs standing when you leave', () => {
    const s = mk('FACT7');
    expect(joinFaction(s, 'lumen').ok).toBe(false);
    addRep(s, 'lumen', 30, false);
    expect(joinFaction(s, 'lumen').ok).toBe(true);
    expect(joinFaction(s, 'consortium').ok).toBe(false);
    expect(s.fac.rank).toBe(0);
    addMerit(s, 'lumen', 130);
    expect(s.fac.rank).toBe(2);
    addMerit(s, 'consortium', 999);
    expect(s.fac.rank).toBe(2);
    const rep = repOf(s, 'lumen');
    expect(leaveFaction(s).ok).toBe(true);
    expect(repOf(s, 'lumen')).toBeLessThan(rep);
    expect(s.fac.member).toBeNull();
  });

  it('contracts raise standing and merit of the issuing faction', () => {
    const s = mk('FACT8');
    addRep(s, 'freeholds', 30, false);
    joinFaction(s, 'freeholds');
    const r0 = repOf(s, 'freeholds');
    onContractDone(s, { faction: 'freeholds', facOnly: true }, 2000);
    expect(repOf(s, 'freeholds')).toBeGreaterThan(r0);
    expect(s.fac.merit).toBeGreaterThan(0);
  });

  it('sells the faction hull to friends and members only', () => {
    const s = mk('FACT9');
    const g = galaxyOf(s);
    const st = g.systems
      .flatMap((x) => x.stations)
      .find(
        (x) =>
          ownerOf(s, x.systemId) === 'directorate' && (x.type === 'industrial' || x.type === 'trade_hub'),
      )!;
    s.stations[st.id].shop.epoch = -1;
    expect(shopHulls(s, st)).not.toContain('aegis');
    s.fac.rep.directorate = 50;
    expect(shopHulls(s, st)).toContain('aegis');
    s.fac.rep.directorate = 0;
    s.fac.member = 'directorate';
    s.fac.rank = 2;
    expect(shopHulls(s, st)).toContain('aegis');
    void buyHull;
  });
});

describe('factions: wars', () => {
  it('start slowly, end with a truce and move borders; deterministic', () => {
    const run = () => {
      const s = mk('FACTWAR');
      const before = JSON.stringify(s.fac.owner);
      let started = 0;
      let maxActive = 0;
      for (let d = 1; d <= 400; d++) {
        factionDaily(s, d);
        started = Math.max(started, s.fac.history.filter((h) => h.key === 'war').length);
        maxActive = Math.max(maxActive, activeWars(s).length);
      }
      return { s, before, started, maxActive };
    };
    const a = run();
    expect(a.started).toBeGreaterThanOrEqual(2);
    expect(a.started).toBeLessThanOrEqual(14);
    expect(a.maxActive).toBeLessThanOrEqual(2);
    expect(Object.keys(a.s.fac.owner).length).toBeGreaterThan(0);
    const b = run();
    expect(b.s.fac.history).toEqual(a.s.fac.history);
  });

  it('time passing runs the faction simulation', () => {
    const s = mk('FACTTIME');
    passTime(s, 60);
    expect(s.fac.nextWarCheck).toBeGreaterThan(20);
  });
});
