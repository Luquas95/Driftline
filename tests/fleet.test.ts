import { describe, expect, it } from 'vitest';
import { levelOf } from '../src/core/base';
import {
  escortCount,
  planTrip,
  protectionOf,
  setFleetOrder,
  switchShip,
  FLEET_EFFICIENCY,
} from '../src/core/fleet';
import { buildStarterShip } from '../src/core/ship';
import { defaultCrew } from '../src/core/crew';
import { galaxyOf } from '../src/core/state';
import { passTime } from '../src/core/time';
import { mk } from './helpers';
import type { GameState } from '../src/core/types';
import type { FleetShip } from '../src/core/worldTypes';

function withFleet(seed: string): { s: GameState; fs: FleetShip } {
  const s = mk(seed, 300);
  const g = galaxyOf(s);
  const here = g.systems[s.location.systemId];
  s.base = {
    systemId: here.id,
    bodyIndex: 0,
    kind: 'station',
    name: 'B',
    founded: 0,
    buildings: { hangar: 3, shipyard: 2, warehouse: 2 },
    queue: [],
    storage: {},
    treasury: 50000,
    lines: [],
    orders: [],
    autoSell: {},
    hangar: [],
    attack: null,
    log: [],
    lastTick: Math.floor(s.day),
    stats: { produced: 0, sold: 0, fleetIncome: 0, upkeep: 0, attacks: 0, repelled: 0 },
  };
  let n = 0;
  const ship = buildStarterShip('mule', 'Mula 2', () => `fm${++n}`);
  const fs: FleetShip = {
    id: 'f1',
    name: 'Mula 2',
    ship,
    crew: defaultCrew(seed, 'mule', 0, () => `fw${++n}`),
    order: 'idle',
    route: null,
    trip: null,
    earned: 0,
    trips: 0,
    idleUntil: 0,
  };
  s.base.hangar.push(fs);
  return { s, fs };
}

/** Two stations a couple of jumps apart that trade a common good. */
function routeFor(s: GameState): { from: string; to: string } {
  const g = galaxyOf(s);
  const from = g.systems[s.location.systemId].stations[0];
  const near = g.systems[s.location.systemId].neighbors;
  for (const id of near) {
    for (const st of g.systems[id].stations) {
      if (st.id !== from.id && st.goods.some((x) => from.goods.includes(x)))
        return { from: from.id, to: st.id };
    }
  }
  throw new Error('no route');
}

describe('fleet', () => {
  it('plans a round trip: goods, expected profit, risk and protection', () => {
    const { s, fs } = withFleet('FL1');
    const r = routeFor(s);
    let best = null as ReturnType<typeof planTrip> | null;
    // try both directions: at least one has a positive margin on the best good
    for (const route of [r, { from: r.to, to: r.from }]) {
      const p = planTrip(s, fs, { ...route, goodId: null }, 1e6);
      if (p.ok && (!best || p.net > best.net)) best = p;
    }
    expect(best).not.toBeNull();
    expect(best!.units).toBeGreaterThan(2);
    expect(best!.days).toBeGreaterThan(1);
    expect(best!.protection).toBe(protectionOf(fs));
    expect(FLEET_EFFICIENCY).toBeLessThan(1);
  });

  it('refuses unfit routes and unknown ships', () => {
    const { s, fs } = withFleet('FL2');
    expect(setFleetOrder(s, 'nope', 'guard').ok).toBe(false);
    expect(setFleetOrder(s, fs.id, 'trade')).toMatchObject({ ok: false, error: 'err.badRoute' });
    expect(setFleetOrder(s, fs.id, 'guard').ok).toBe(true);
    expect(setFleetOrder(s, fs.id, 'escort').ok).toBe(true);
    expect(escortCount(s)).toBe(1);
  });

  it('auto traders earn into the treasury over time and move the markets', () => {
    let earned = 0;
    let trips = 0;
    for (const seed of ['FL3', 'FL4', 'FL5', 'FL6', 'FL7']) {
      const { s, fs } = withFleet(seed);
      const r = routeFor(s);
      const options = [r, { from: r.to, to: r.from }]
        .map((route) => ({ route, p: planTrip(s, fs, { ...route, goodId: null }, 1e6) }))
        .filter((x) => x.p.ok)
        .sort((a, b) => b.p.net - a.p.net);
      if (!options.length || options[0].p.net <= 0) continue;
      expect(setFleetOrder(s, fs.id, 'trade', { ...options[0].route, goodId: null }).ok).toBe(true);
      const stockBefore = s.stations[options[0].route.from].stock.slice();
      for (let d = 0; d < 60; d++) {
        s.ship.supplies = 1000;
        passTime(s, 1);
      }
      expect(fs.trips).toBeGreaterThan(0);
      trips += fs.trips;
      earned += fs.earned;
      expect(s.stations[options[0].route.from].stock).not.toEqual(stockBefore);
    }
    expect(trips).toBeGreaterThan(0);
    expect(earned).not.toBe(0);
  });

  it('switching ships swaps the active ship and the crew, only at the base with an empty hold', () => {
    const { s, fs } = withFleet('FL6');
    const active = s.ship.name;
    const crew0 = s.crew.length;
    const fleetCrew = fs.crew.length;
    s.cargo.push({ uid: 'x', goodId: 'grain', qty: 5, w: 1, h: 1, x: 0, y: 0, cost: 0, acquiredDay: 0 });
    expect(switchShip(s, fs.id)).toMatchObject({ ok: false, error: 'err.cargoAboard' });
    s.cargo = [];
    expect(switchShip(s, fs.id).ok).toBe(true);
    expect(s.ship.hullId).toBe('mule');
    expect(s.crew.length).toBe(fleetCrew);
    expect(fs.ship.name).toBe(active);
    expect(fs.crew.length).toBe(crew0);
    s.location.systemId = (s.base!.systemId + 1) % s.galaxySize;
    expect(switchShip(s, fs.id)).toMatchObject({ ok: false, error: 'err.notAtBase' });
    void levelOf;
  });
});
