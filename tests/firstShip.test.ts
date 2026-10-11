import { describe, expect, it } from 'vitest';
import { HULLS } from '../src/content/hulls';
import {
  buyFirstShip,
  firstShipOffers,
  previewOffer,
  suggestShipName,
  TIGHT_BUDGET,
} from '../src/core/firstShip';
import { dockAt, jump, undock } from '../src/core/game';
import { deserializeState, serializeState } from '../src/core/save';
import { computeShipStats, canJump, hullSlots, neighbours } from '../src/core/ship';
import { newGame } from '../src/core/start';
import { analyze } from '../src/core/state';
import { T } from '../src/core/tuning';

const fresh = (seed = 'FS1', prices: 'easy' | 'normal' | 'hard' = 'normal') =>
  newGame({ seed, galaxySize: 80, difficulty: { prices } });

describe('new game start', () => {
  it('starts docked without a ship and with capital by difficulty', () => {
    for (const p of ['easy', 'normal', 'hard'] as const) {
      const s = fresh('CAP', p);
      expect(s.noShip).toBe(true);
      expect(s.credits).toBe(T.startCapital[p]);
      expect(s.location.stationId).not.toBeNull();
      expect(s.crew).toEqual([]);
    }
    expect(T.startCapital.easy).toBeGreaterThan(T.startCapital.normal);
    expect(T.startCapital.normal).toBeGreaterThan(T.startCapital.hard);
  });

  it('refuses to fly or trade before a ship is bought', () => {
    const s = fresh();
    expect(undock(s).ok).toBe(false);
    expect(jump(s, 0).ok).toBe(false);
  });

  it('quick start keeps the old basic ship for tests and bots', () => {
    const s = newGame({ seed: 'Q', galaxySize: 60, quickStart: true });
    expect(s.noShip).toBe(false);
    expect(s.credits).toBe(T.quickStartCredits);
    expect(s.ship.hullId).toBe(T.startHull);
  });
});

describe('first ship offers', () => {
  it('are sorted from the cheapest to the most expensive and deterministic', () => {
    const a = firstShipOffers(fresh('SORT'));
    const b = firstShipOffers(fresh('SORT'));
    expect(a).toEqual(b);
    for (let i = 1; i < a.length; i++) expect(a[i].price).toBeGreaterThanOrEqual(a[i - 1].price);
    expect(a[0].used).toBe(true);
    expect(a[0].hullId).toBe('shuttle');
    expect(firstShipOffers(fresh('OTHER')).map((o) => o.id)).not.toEqual(a.map((o) => o.id));
  });

  it('cover at least ten hulls with used pieces that are cheaper and worn', () => {
    const offers = firstShipOffers(fresh('MANY'));
    expect(new Set(offers.map((o) => o.hullId)).size).toBeGreaterThanOrEqual(10);
    expect(offers.some((o) => o.used)).toBe(true);
    for (const o of offers.filter((x) => x.used)) {
      const nw = offers.find((x) => x.hullId === o.hullId && !x.used);
      if (nw) expect(o.price).toBeLessThan(nw.price);
      expect(o.condition).toBeLessThan(100);
    }
  });

  it('fit the budget: several cheap hulls, at most one mid-priced one, the dream ships stay out of reach', () => {
    const s = fresh('BUDGET');
    const offers = firstShipOffers(s);
    const cheap = offers.filter((o) => o.price <= s.credits * 0.3);
    const affordable = offers.filter((o) => o.price <= s.credits);
    expect(cheap.length).toBeGreaterThanOrEqual(4);
    expect(
      offers.filter((o) => o.price > s.credits * 0.6 && o.price <= s.credits).length,
    ).toBeLessThanOrEqual(2);
    expect(affordable.length).toBeLessThan(offers.length);
    const hard = fresh('BUDGET', 'hard');
    expect(firstShipOffers(hard).filter((o) => o.price <= hard.credits).length).toBeGreaterThanOrEqual(5);
  });
});

describe('buying the first ship', () => {
  it('charges the price, delivers a working ship with a crew and the basic outfit', () => {
    const s = fresh('BUY');
    const offer = firstShipOffers(s)[2];
    const before = s.credits;
    expect(buyFirstShip(s, offer.id, 'Moje loď').ok).toBe(true);
    expect(s.noShip).toBe(false);
    expect(s.credits).toBe(before - offer.price);
    expect(s.ship.hullId).toBe(offer.hullId);
    expect(s.ship.name).toBe('Moje loď');
    expect(s.crew.length).toBeGreaterThan(0);
    const st = analyze(s).stats;
    expect(canJump(st).ok).toBe(true);
    expect(s.ship.fuel).toBeCloseTo(st.fuelCap, 5);
    expect(buyFirstShip(s, offer.id, 'x').ok).toBe(false);
  });

  it('used ships come worn: lower module condition and hull', () => {
    const s = fresh('USED');
    const used = firstShipOffers(s).find((o) => o.used)!;
    buyFirstShip(s, used.id, '');
    const mods = s.ship.slots.filter(Boolean);
    expect(mods.every((m) => m!.condition < 100)).toBe(true);
    expect(s.ship.hp).toBeLessThan(HULLS.find((h) => h.id === used.hullId)!.hp);
    expect(s.ship.name.length).toBeGreaterThan(0);
  });

  it('cannot buy what you cannot afford or an unknown offer', () => {
    const s = fresh('POOR', 'hard');
    s.credits = 100;
    expect(buyFirstShip(s, firstShipOffers(s)[3].id, 'a').ok).toBe(false);
    expect(buyFirstShip(s, 'nope', 'a').ok).toBe(false);
    expect(s.noShip).toBe(true);
  });

  it('previews what is left and warns when it is little', () => {
    const s = fresh('PREV');
    const offers = firstShipOffers(s);
    const cheap = previewOffer(s, offers[0]);
    expect(cheap.warning).toBe('none');
    expect(cheap.left).toBe(s.credits - offers[0].price);
    s.credits = offers[0].price + TIGHT_BUDGET - 10;
    expect(previewOffer(s, offers[0]).warning).toBe('tight');
    s.credits = offers[0].price - 1;
    expect(previewOffer(s, offers[0]).warning).toBe('broke');
  });

  it('can start the game normally after buying (dock, undock, jump)', () => {
    const s = fresh('PLAY');
    buyFirstShip(s, firstShipOffers(s)[1].id, 'Test');
    expect(dockAt(s, s.location.stationId!).ok).toBe(true);
    expect(undock(s).ok).toBe(true);
  });

  it('suggests a stable name', () => {
    expect(suggestShipName('A', 'mule')).toBe(suggestShipName('A', 'mule'));
  });

  it('a new game survives save and load in both states', () => {
    const s = fresh('SAVE');
    expect(deserializeState(serializeState(s)).noShip).toBe(true);
    buyFirstShip(s, firstShipOffers(s)[0].id, 'Z');
    expect(deserializeState(serializeState(s)).noShip).toBe(false);
  });
});

describe('every offer is a flyable ship', () => {
  it('can jump and has fuel right after purchase', () => {
    for (const seed of ['A1', 'B2']) {
      for (const o of firstShipOffers(fresh(seed, 'easy'))) {
        const s = fresh(seed, 'easy');
        s.credits = 1e6;
        expect(buyFirstShip(s, o.id, 'x').ok).toBe(true);
        const st = analyze(s).stats;
        expect(canJump(st).ok, o.id).toBe(true);
        expect(st.fuelCap).toBeGreaterThan(0);
      }
    }
  });
});

describe('hull catalogue', () => {
  it('has distinct price points and every layout works with its core modules', () => {
    expect(HULLS.length).toBeGreaterThanOrEqual(12);
    for (const h of HULLS) {
      const slots = hullSlots(h.id);
      expect(slots.filter((x) => x.core).length).toBe(5);
      for (const sl of slots)
        for (const n of neighbours(h.id, sl.index)) expect(neighbours(h.id, n)).toContain(sl.index);
      expect(
        computeShipStats({
          hullId: h.id,
          name: 'x',
          slots: slots.map(() => null),
          hp: h.hp,
          fuel: 0,
          supplies: 0,
          probes: 0,
          shield: 0,
        }).cargoCells,
      ).toBeGreaterThan(0);
    }
  });
});
