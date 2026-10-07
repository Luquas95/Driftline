import { describe, expect, it } from 'vitest';
import { EVENTS, EVENTS_BY_ID, EVENT_TEXTS_CS } from '../src/content/events';
import { applyEffect, choiceAvailable, eligibleEvents, evalCond, extConditions, extEffects, resolveEvent, rollEvent } from '../src/core/events';
import { hullSlots, newModule } from '../src/core/ship';
import { addGoods, unitsOf } from '../src/core/cargo';
import { analyze, galaxyOf } from '../src/core/state';
import type { GameState } from '../src/core/types';
import { mk } from './helpers';

function force(s: GameState, id: string) {
  s.pendingEvent = { eventId: id, context: { systemId: s.location.systemId } };
}

describe('events', () => {
  it('every event has texts for all keys', () => {
    for (const e of EVENTS) {
      expect(EVENT_TEXTS_CS[e.titleKey], e.id).toBeTruthy();
      expect(EVENT_TEXTS_CS[e.textKey], e.id).toBeTruthy();
      for (const c of e.choices) {
        expect(EVENT_TEXTS_CS[c.textKey]).toBeTruthy();
        for (const o of c.outcomes) expect(EVENT_TEXTS_CS[o.textKey]).toBeTruthy();
      }
    }
  });

  it('conditions evaluate against state', () => {
    const s = mk('COND');
    const g = galaxyOf(s);
    const region = g.systems[s.location.systemId].region;
    expect(evalCond(s, { t: 'region', in: [region] })).toBe(true);
    expect(evalCond(s, { t: 'region', in: [region === 'core' ? 'rim' : 'core'] })).toBe(false);
    expect(evalCond(s, { t: 'creditsMin', n: 100 })).toBe(true);
    expect(evalCond(s, { t: 'creditsMax', n: 100 })).toBe(false);
    expect(evalCond(s, { t: 'cargoTag', tag: 'hazardous' })).toBe(false);
    expect(evalCond(s, { t: 'hasModule', kind: 'laser' })).toBe(false);
    expect(evalCond(s, { t: 'hasModule', kind: 'sensors' })).toBe(true);
    expect(evalCond(s, { t: 'fuelBelow', frac: 0.5 })).toBe(false);
    s.ship.fuel = 1;
    expect(evalCond(s, { t: 'fuelBelow', frac: 0.5 })).toBe(true);
    expect(evalCond(s, { t: 'hullBelow', frac: 0.5 })).toBe(false);
    expect(evalCond(s, { t: 'repMin', n: 5 })).toBe(false);
    s.stations[s.home].rep = 6;
    expect(evalCond(s, { t: 'repMin', n: 5 })).toBe(true);
    expect(evalCond(s, { t: 'repMax', n: 5 })).toBe(false);
    s.flags.x = 1;
    expect(evalCond(s, { t: 'flag', key: 'x' })).toBe(true);
    expect(evalCond(s, { t: 'flag', key: 'x', value: 2 })).toBe(false);
    expect(evalCond(s, { t: 'dangerMin', n: 0 })).toBe(true);
    expect(evalCond(s, { t: 'cargoValueMin', n: 1 })).toBe(false);
    expect(evalCond(s, { t: 'dayMin', n: 1 })).toBe(false);
    expect(evalCond(s, { t: 'not', c: { t: 'dayMin', n: 1 } })).toBe(true);
    expect(evalCond(s, { t: 'ext', key: 'unknown' })).toBe(false);
  });

  it('supports extension hooks for later versions', () => {
    const s = mk('EXT');
    extConditions['crewHas'] = () => true;
    let called = 0;
    extEffects['crewMorale'] = () => void called++;
    expect(evalCond(s, { t: 'ext', key: 'crewHas' })).toBe(true);
    applyEffect(s, { t: 'ext', key: 'crewMorale' });
    expect(called).toBe(1);
    delete extConditions['crewHas'];
  });

  it('cargo conditions gate events', () => {
    const s = mk('GATE');
    const base = eligibleEvents(s, 'jump').map((e) => e.id);
    expect(base).not.toContain('hazmat_leak');
    const { stats, dims } = analyze(s);
    addGoods(s.cargo, dims, { chilledCells: stats.chilledCells, secureCells: stats.secureCells }, 'radioactives', 8, 0, 0);
    expect(eligibleEvents(s, 'jump').map((e) => e.id)).toContain('hazmat_leak');
  });

  it('rolls events by chance and avoids immediate repeats', () => {
    const s = mk('ROLL');
    expect(rollEvent(s, 'jump', 0, { systemId: 0 })).toBe(false);
    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      s.pendingEvent = null;
      expect(rollEvent(s, 'jump', 1, { systemId: 0 })).toBe(true);
      seen.add(s.pendingEvent!.eventId);
    }
    expect(seen.size).toBeGreaterThan(3);
    expect(rollEvent(s, 'jump', 1, { systemId: 0 })).toBe(false); // already pending
  });

  it('resolves choices and applies outcomes', () => {
    const s = mk('RES');
    s.credits = 1000;
    force(s, 'local_trader');
    expect(resolveEvent(s, 9).ok).toBe(false);
    const r = resolveEvent(s, 1);
    expect(r.ok).toBe(true);
    expect(s.pendingEvent).toBeNull();
    expect(resolveEvent(s, 0).ok).toBe(false);
  });

  it('gated choices are unavailable without requirements', () => {
    const s = mk('GATE2');
    force(s, 'distress_call');
    const ev = EVENTS_BY_ID['distress_call'];
    expect(choiceAvailable(s, ev, 0)).toBe(true);
    expect(choiceAvailable(s, ev, 99)).toBe(false);
  });

  it('applies every effect type correctly', () => {
    const s = mk('FX');
    const stats = analyze(s).stats;
    s.credits = 1000;
    applyEffect(s, { t: 'credits', n: 100 });
    expect(s.credits).toBe(1100);
    applyEffect(s, { t: 'creditsPct', pct: -0.5 });
    expect(s.credits).toBe(550);
    applyEffect(s, { t: 'fuel', n: -10 });
    expect(s.ship.fuel).toBe(stats.fuelCap - 10);
    applyEffect(s, { t: 'fuel', n: 9999 });
    expect(s.ship.fuel).toBe(stats.fuelCap);
    applyEffect(s, { t: 'supplies', n: -5 });
    expect(s.ship.supplies).toBe(stats.suppliesCap - 5);
    applyEffect(s, { t: 'hull', n: -10 });
    expect(s.ship.hp).toBe(stats.hpMax - 10);
    applyEffect(s, { t: 'hull', n: 50 });
    expect(s.ship.hp).toBe(stats.hpMax);
    applyEffect(s, { t: 'wear', n: 20, kind: 'jump' });
    expect(s.ship.slots.find((m) => m?.defId.startsWith('jump'))!.condition).toBeLessThan(100);
    applyEffect(s, { t: 'wear', n: -10, kind: 'jump' });
    expect(s.ship.slots.find((m) => m?.defId.startsWith('jump'))!.condition).toBeGreaterThan(80);
    applyEffect(s, { t: 'wear', n: 5 });
    applyEffect(s, { t: 'goods', goodId: 'metals', qty: 6 });
    expect(unitsOf(s.cargo, 'metals')).toBe(6);
    applyEffect(s, { t: 'goods', goodId: 'metals', qty: -2 });
    expect(unitsOf(s.cargo, 'metals')).toBe(4);
    applyEffect(s, { t: 'loseCargo', frac: 0.5 });
    expect(unitsOf(s.cargo, 'metals')).toBe(2);
    applyEffect(s, { t: 'module', quality: 'B' });
    expect(s.inventory).toHaveLength(1);
    expect(s.inventory[0].quality).toBe('B');
    const seen0 = s.seen.length;
    applyEffect(s, { t: 'reveal', radius: 40 });
    expect(s.seen.length).toBeGreaterThanOrEqual(seen0);
    expect(Object.keys(s.prices).length).toBeGreaterThan(1);
    const d0 = s.day;
    applyEffect(s, { t: 'days', n: 1.5 });
    expect(s.day).toBe(d0 + 1.5);
    applyEffect(s, { t: 'days', n: -0.4 });
    expect(s.day).toBeCloseTo(d0 + 1.1, 5);
    applyEffect(s, { t: 'days', n: -5 });
    expect(s.day).toBeGreaterThanOrEqual(s.lastEconDay);
    applyEffect(s, { t: 'rep', n: 2 });
    expect(s.stations[s.home].rep).toBe(2);
    applyEffect(s, { t: 'flag', key: 'f', value: true });
    expect(s.flags.f).toBe(true);
    applyEffect(s, { t: 'probes', n: 2 });
    expect(s.ship.probes).toBe(2);
    applyEffect(s, { t: 'discover', value: 123 });
    expect(s.discoveries.at(-1)!.value).toBe(123);
    applyEffect(s, { t: 'ext', key: 'sellAllPremium', args: { pct: 0.1 } });
    applyEffect(s, { t: 'death' });
    expect(s.stats.deaths).toBe(1);
  });

  it('sellAllPremium pays out cargo', () => {
    const s = mk('PREM');
    const { stats, dims } = analyze(s);
    addGoods(s.cargo, dims, { chilledCells: stats.chilledCells, secureCells: stats.secureCells }, 'metals', 10, 400, 0);
    const c = s.credits;
    applyEffect(s, { t: 'ext', key: 'sellAllPremium', args: { pct: 0.1 } });
    expect(s.credits).toBe(c + 440);
    expect(s.cargo).toHaveLength(0);
  });

  it('wear on modules in unusual slots does not crash without modules', () => {
    const s = mk('NOMOD');
    s.ship.slots = s.ship.slots.map(() => null);
    applyEffect(s, { t: 'wear', n: 5 });
    applyEffect(s, { t: 'wear', n: -5 });
    void hullSlots;
    void newModule;
  });

  it('every event can be played through without errors (all choices, all outcomes)', () => {
    for (const e of EVENTS) {
      e.choices.forEach((c, ci) => {
        c.outcomes.forEach(() => {
          const s = mk(`PLAY-${e.id}-${ci}`, 80);
          s.credits = 5000;
          s.pendingEvent = { eventId: e.id, context: { systemId: s.location.systemId } };
          if (choiceAvailable(s, e, ci)) expect(resolveEvent(s, ci).ok, e.id).toBe(true);
          else s.pendingEvent = null;
        });
      });
    }
  });
});
