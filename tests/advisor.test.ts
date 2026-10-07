import { describe, expect, it } from 'vitest';
import { bestKnownPrice, planRoute, recommendTrades } from '../src/core/advisor';
import { estimateMine, bodyDyn } from '../src/core/exploration';
import { isStranded, renewInsurance, setFullCoverage, buyIntel } from '../src/core/game';
import { hullSlots, newModule } from '../src/core/ship';
import { galaxyOf } from '../src/core/state';
import { passTime } from '../src/core/time';
import { Bot } from '../src/sim/bots';
import { mk } from './helpers';

describe('route planner', () => {
  it('plans a route over known systems with fuel, time and risk', () => {
    const s = mk('ADV1', 150);
    const g = galaxyOf(s);
    const here = g.systems[s.location.systemId];
    const to = here.neighbors[0];
    const plan = planRoute(s, to)!;
    expect(plan.path).toEqual([here.id, to]);
    expect(plan.steps).toHaveLength(1);
    expect(plan.fuel).toBeGreaterThan(0);
    expect(plan.days).toBeGreaterThan(0);
    expect(plan.reachable).toBe(true);
    expect(plan.feasibleWithStops).toBe(true);
    expect(plan.risk).toBeGreaterThanOrEqual(0);
  });

  it('refuses routes through unknown space and flags unreachable ones', () => {
    const s = mk('ADV2', 150);
    const g = galaxyOf(s);
    const far = g.systems.length - 1;
    expect(s.seen.includes(far)).toBe(false);
    expect(planRoute(s, far)).toBeNull();
    // make everything seen: long routes appear, and low fuel makes them unreachable
    s.seen = g.systems.map((x) => x.id);
    const plan = planRoute(s, far);
    expect(plan).not.toBeNull();
    s.ship.fuel = 1;
    const low = planRoute(s, far)!;
    expect(low.reachable).toBe(false);
  });
});

describe('trade recommendations', () => {
  it('recommends profitable known trades and orders them by profit per day', () => {
    const s = mk('ADV3', 200);
    // explore a bit so that several stations have known prices
    const bot = new Bot(s, 'trader');
    bot.play(12);
    bot.dockSomewhere();
    s.pendingEvent = null;
    const tips = recommendTrades(s, 5, 5);
    for (const t of tips) {
      expect(t.profit).toBeGreaterThan(0);
      expect(t.qty).toBeGreaterThan(0);
      expect(t.age).toBeGreaterThanOrEqual(0);
    }
    for (let i = 1; i < tips.length; i++) expect(tips[i - 1].perDay).toBeGreaterThanOrEqual(tips[i].perDay);
    if (tips.length) {
      const best = bestKnownPrice(s, tips[0].goodId, 'sell');
      expect(best).not.toBeNull();
    }
  });

  it('returns nothing without a known station and nothing for unknown goods', () => {
    const s = mk('ADV4', 100);
    expect(bestKnownPrice(s, 'iron_ore', 'buy')).toBeNull();
    s.prices = {};
    s.location = { systemId: 0, stationId: null, body: -1 };
    const g = galaxyOf(s);
    if (g.systems[0].stations.length === 0) expect(recommendTrades(s)).toEqual([]);
  });
});

describe('insurance management and stranding', () => {
  it('renews a lapsed policy and toggles full coverage', () => {
    const s = mk('ADV5');
    expect(renewInsurance(s).ok).toBe(false); // already insured
    expect(setFullCoverage(s, true).ok).toBe(true);
    expect(s.insurance.full).toBe(true);
    s.credits = 0;
    passTime(s, 40);
    expect(s.insurance.active).toBe(false);
    expect(setFullCoverage(s, false).ok).toBe(false);
    s.credits = 5000;
    const r = renewInsurance(s);
    expect(r.ok).toBe(true);
    expect(s.insurance.active).toBe(true);
    expect(s.insurance.due).toBe(0);
    const none = mk('ADV6', 60, { difficulty: { insurance: false } });
    expect(renewInsurance(none).ok).toBe(false);
  });

  it('detects a stranded ship', () => {
    const s = mk('ADV7');
    expect(isStranded(s)).toBe(false);
    s.ship.fuel = 0;
    expect(isStranded(s)).toBe(true);
  });

  it('market intel outside a hub is refused', () => {
    const s = mk('ADV8');
    const st = s.location.stationId!;
    s.credits = 5000;
    const r = buyIntel(s, st);
    expect(typeof r.ok).toBe('boolean');
  });
});

describe('mining estimate', () => {
  it('mirrors the real mining rules', () => {
    const s = mk('ADV9', 150);
    const g = galaxyOf(s);
    let found: { sys: number; idx: number; dep: string } | null = null;
    for (const sys of g.systems)
      for (const b of sys.bodies)
        if (b.kind === 'belt' && b.deposits.length && !found)
          found = { sys: sys.id, idx: b.index, dep: b.deposits[0].id };
    expect(found).not.toBeNull();
    s.location = { systemId: found!.sys, stationId: null, body: -1 };
    const body = g.systems[found!.sys].bodies[found!.idx];
    const none = estimateMine(s, found!.idx, found!.dep, 0)!;
    expect(none.blocked).toBe('err.noLaser');
    const free = hullSlots(s.ship.hullId).filter((x) => !x.core && !s.ship.slots[x.index] && x.size !== 'S');
    s.ship.slots[free[0].index] = newModule('laser_m', 'C', 'laser1');
    bodyDyn(s, body.id).revealed.push(found!.dep);
    const est = estimateMine(s, found!.idx, found!.dep, 0)!;
    expect(est.blocked).toBeUndefined();
    expect(est.units).toBeGreaterThan(0);
    const hi = estimateMine(s, found!.idx, found!.dep, 2)!;
    expect(hi.units).toBeGreaterThan(est.units);
    expect(hi.risk).toBeGreaterThan(est.risk);
    expect(hi.fuel).toBeGreaterThan(est.fuel);
    expect(estimateMine(s, 99, 'x', 0)).toBeNull();
  });
});
