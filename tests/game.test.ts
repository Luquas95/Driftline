import { describe, expect, it } from 'vitest';
import { STATION_TYPES } from '../src/content/stations';
import {
  buyFuel,
  buyIntel,
  buyProbes,
  buySupplies,
  callTow,
  dockAt,
  fieldRepair,
  hullRepairCost,
  inSystemTravelDays,
  jump,
  moduleRepairCost,
  planJump,
  refuelNeeded,
  repairAll,
  repairHull,
  repairModuleAt,
  serviceCost,
  snapshotAt,
  systemDistance,
  undock,
  wait,
  sellGoods,
  buyGoods,
} from '../src/core/game';
import { addGoods } from '../src/core/cargo';
import { hullSlots, newModule, wearKind } from '../src/core/ship';
import { analyze, galaxyOf, stationOf } from '../src/core/state';
import { passTime } from '../src/core/time';
import type { GameState } from '../src/core/types';
import { mk } from './helpers';

function load(s: GameState, goodId: string, qty: number) {
  const { stats, dims } = analyze(s);
  addGoods(
    s.cargo,
    dims,
    { chilledCells: stats.chilledCells, secureCells: stats.secureCells },
    goodId,
    qty,
    0,
    s.day,
  );
}

describe('game actions', () => {
  it('buys fuel, supplies and probes with price limits', () => {
    const s = mk('SRV1');
    const st = s.location.stationId!;
    s.ship.fuel = 10;
    s.ship.supplies = 10;
    const c = s.credits;
    const f = buyFuel(s, st, 20);
    expect(f.ok && f.units).toBe(20);
    expect(s.credits).toBeLessThan(c);
    expect(s.ship.fuel).toBe(30);
    expect(buySupplies(s, st, 5).ok).toBe(true);
    expect(buyProbes(s, st, 3).ok).toBe(true);
    expect(s.ship.probes).toBe(3);
    s.ship.fuel = analyze(s).stats.fuelCap;
    expect(buyFuel(s, st, 5).ok).toBe(false);
    s.credits = 0;
    s.ship.fuel = 0;
    expect(buyFuel(s, st, 5).ok).toBe(false);
    s.ship.supplies = 0;
    expect(buySupplies(s, st, 5).ok).toBe(false);
    expect(buyProbes(s, st, 1).ok).toBe(false);
    undock(s);
    expect(buyFuel(s, st, 1).ok).toBe(false);
    expect(refuelNeeded(s)).toBeGreaterThan(0);
    expect(serviceCost(s, st)).toBeGreaterThan(0);
  });

  it('repairs hull and modules at stations', () => {
    const s = mk('REP1');
    const st = s.location.stationId!;
    expect(repairHull(s, st).ok).toBe(false);
    s.ship.hp = 40;
    const jIdx = s.ship.slots.findIndex((m) => m?.defId.startsWith('jump'));
    s.ship.slots[jIdx]!.condition = 30;
    expect(hullRepairCost(s, st)).toBeGreaterThan(0);
    expect(moduleRepairCost(s, st, jIdx)).toBeGreaterThan(0);
    expect(moduleRepairCost(s, st, 0)).toBeGreaterThanOrEqual(0);
    s.credits = 5000;
    expect(repairModuleAt(s, st, jIdx).ok).toBe(true);
    expect(s.ship.slots[jIdx]!.condition).toBe(100);
    expect(repairModuleAt(s, st, jIdx).ok).toBe(false);
    expect(repairHull(s, st).ok).toBe(true);
    expect(s.ship.hp).toBe(analyze(s).stats.hpMax);
    s.ship.hp = 10;
    s.ship.slots[jIdx]!.condition = 10;
    s.credits = 1;
    expect(repairAll(s, st).ok).toBe(false);
    s.credits = 9999;
    expect(repairAll(s, st).ok).toBe(true);
    expect(repairAll(s, st).ok).toBe(false);
    expect(repairModuleAt(s, st, 99).ok).toBe(false);
  });

  it('field repairs use a repair module and spare parts', () => {
    const s = mk('FIELD');
    expect(fieldRepair(s, 'hull').ok).toBe(false);
    const free = hullSlots(s.ship.hullId).filter((x) => !x.core && !s.ship.slots[x.index] && x.size !== 'L');
    s.ship.slots[free[0].index] = newModule('repair_s', 'C', 'rp');
    expect(fieldRepair(s, 'hull').ok).toBe(false); // no parts
    load(s, 'spare_parts', 5);
    s.ship.hp = 50;
    expect(fieldRepair(s, 'hull').ok).toBe(true);
    expect(s.ship.hp).toBeGreaterThan(50);
    const j = s.ship.slots.findIndex((m) => m?.defId.startsWith('jump'));
    wearKind(s.ship, 'jump', 100);
    expect(fieldRepair(s, j).ok).toBe(true);
    expect(s.ship.slots[j]!.condition).toBeGreaterThan(0);
    s.ship.hp = analyze(s).stats.hpMax;
    expect(fieldRepair(s, 'hull').ok).toBe(false);
    expect(fieldRepair(s, 99).ok).toBe(false);
  });

  it('plans and performs jumps: fuel, time, wear, knowledge', () => {
    const s = mk('JUMP1');
    const g = galaxyOf(s);
    const here = s.location.systemId;
    const to = g.systems[here].neighbors[0];
    const plan = planJump(s, to);
    expect(plan.ok).toBe(true);
    expect(plan.fuel).toBeGreaterThan(0);
    const fuel = s.ship.fuel;
    const day = s.day;
    const r = jump(s, to);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.report.ly).toBeCloseTo(plan.ly, 6);
    if (!s.dead && s.location.systemId === to) {
      expect(s.ship.fuel).toBeLessThan(fuel);
      expect(s.day).toBeGreaterThan(day);
      expect(s.visited).toContain(to);
      expect(s.stats.jumps).toBe(1);
    }
  });

  it('refuses impossible jumps', () => {
    const s = mk('JUMP2');
    const g = galaxyOf(s);
    const far = g.systems.find(
      (x) => !g.systems[s.location.systemId].neighbors.includes(x.id) && x.id !== s.location.systemId,
    )!;
    expect(planJump(s, far.id).reason).toBe('err.noRoute');
    expect(jump(s, far.id).ok).toBe(false);
    s.ship.fuel = 0;
    expect(planJump(s, g.systems[s.location.systemId].neighbors[0]).reason).toBe('err.noFuel');
    s.ship.fuel = 50;
    s.pendingEvent = { eventId: 'quiet_space', context: { systemId: 0 } };
    expect(jump(s, g.systems[s.location.systemId].neighbors[0]).ok).toBe(false);
    s.pendingEvent = null;
    // broken jump drive
    s.ship.slots[s.ship.slots.findIndex((m) => m?.defId.startsWith('jump'))]!.condition = 0;
    expect(planJump(s, g.systems[s.location.systemId].neighbors[0]).reason).toBe('err.jumpMissing');
  });

  it('overloaded cargo and wear raise the accident rate', () => {
    const count = (setup: (s: GameState) => void) => {
      let n = 0;
      for (let k = 0; k < 150; k++) {
        const s = mk(`ACC${k}`, 60);
        setup(s);
        const g = galaxyOf(s);
        s.ship.fuel = 999;
        const to = g.systems[s.location.systemId].neighbors[0];
        const a0 = s.stats.accidents;
        jump(s, to);
        n += s.stats.accidents - a0;
      }
      return n;
    };
    const base = count(() => undefined);
    const worn = count((s) => {
      for (const m of s.ship.slots) if (m) m.condition = 50;
      load(s, 'iron_ore', 16 * 40);
    });
    expect(worn).toBeGreaterThan(base);
  });

  it('towing needs a stranded ship', () => {
    const s = mk('TOW');
    expect(callTow(s).ok).toBe(false);
  });

  it('docking moves the ship, learns prices and refreshes boards', () => {
    const s = mk('DOCK');
    const g = galaxyOf(s);
    const sys =
      g.systems.find((x) => x.stations.length > 1) ?? g.systems.find((x) => x.stations.length >= 1)!;
    s.location = { systemId: sys.id, stationId: null, body: -1 };
    const st = sys.stations[0];
    const d0 = s.day;
    const r = dockAt(s, st.id);
    expect(r.ok).toBe(true);
    expect(s.day).toBeGreaterThan(d0);
    expect(s.location.stationId).toBe(st.id);
    expect(s.home).toBe(st.id);
    expect(Object.keys(s.prices[st.id]).length).toBe(st.goods.length);
    expect(s.stations[st.id].board.length).toBeGreaterThan(0);
    expect(dockAt(s, 'nope').ok).toBe(false);
    expect(dockAt(s, st.id).ok).toBe(true);
    expect(snapshotAt(s, st, st.goods[0]).buy).toBeGreaterThan(snapshotAt(s, st, st.goods[0]).sell);
    expect(systemDistance(s, 0, 1)).toBeGreaterThan(0);
    expect(inSystemTravelDays(s, 0)).toBeGreaterThanOrEqual(0);
    expect(wait(s, 0).ok).toBe(false);
    expect(wait(s, 1).ok).toBe(true);
  });

  it('customs inspections confiscate illegal goods and fine the player at lawful stations', () => {
    let caught = 0;
    let clean = 0;
    for (let k = 0; k < 60; k++) {
      const s = mk(`CUSTOMS${k}`, 100);
      const g = galaxyOf(s);
      const lawful = Object.values(g.stationsById).find(
        (st) =>
          STATION_TYPES.find((t) => t.id === st.type)!.lawful &&
          !st.blackMarket &&
          st.systemId !== s.location.systemId,
      )!;
      s.location = { systemId: lawful.systemId, stationId: null, body: -1 };
      load(s, 'narcotics', 30);
      s.credits = 5000;
      const r = dockAt(s, lawful.id);
      if (r.ok && r.report.inspection) {
        caught++;
        expect(s.cargo.some((c) => c.goodId === 'narcotics')).toBe(false);
        expect(s.credits).toBeLessThan(5000);
        expect(s.stats.fines).toBe(1);
      } else clean++;
    }
    expect(caught).toBeGreaterThan(3);
    expect(clean).toBeGreaterThan(3);
  });

  it('a vault lowers the inspection rate', () => {
    const rate = (vault: boolean) => {
      let caught = 0;
      for (let k = 0; k < 150; k++) {
        const s = mk(`VAULT${k}`, 80);
        const g = galaxyOf(s);
        const lawful = Object.values(g.stationsById).find(
          (st) => st.type !== 'pirate' && !st.blackMarket && st.systemId !== s.location.systemId,
        )!;
        s.location = { systemId: lawful.systemId, stationId: null, body: -1 };
        if (vault) {
          const free = hullSlots(s.ship.hullId).filter((x) => !x.core && !s.ship.slots[x.index]);
          s.ship.slots[free.find((x) => x.size === 'M')!.index] = newModule('vault_m', 'C', 'v1');
        }
        load(s, 'narcotics', 24);
        const r = dockAt(s, lawful.id);
        if (r.ok && r.report.inspection) caught++;
      }
      return caught;
    };
    expect(rate(true)).toBeLessThan(rate(false));
  });

  it('sensitive and illegal goods trade only where listed; time passes for perishables', () => {
    const s = mk('PERISH');
    const st = stationOf(s, s.location.stationId!);
    expect(buyGoods(s, st.id, 'narcotics', 5).ok).toBe(false);
    expect(sellGoods(s, st.id, 'narcotics', 5).ok).toBe(false);
    const free = hullSlots(s.ship.hullId).filter((x) => !x.core && !s.ship.slots[x.index]);
    s.ship.slots[free.find((x) => x.size === 'M')!.index] = newModule('cooler_m', 'C', 'cool');
    load(s, 'fresh_produce', 24);
    expect(s.cargo.length).toBeGreaterThan(0);
    passTime(s, 60);
    expect(s.cargo.some((c) => c.goodId === 'fresh_produce')).toBe(false);
    expect(s.messages.some((m) => m.key === 'msg.spoiled')).toBe(true);
  });

  it('trade hubs sell market intel for the whole sector', () => {
    const s = mk('INTEL', 150);
    const g = galaxyOf(s);
    const hub = Object.values(g.stationsById).find((st) => st.type === 'trade_hub')!;
    s.location = { systemId: hub.systemId, stationId: hub.id, body: hub.bodyIndex };
    s.credits = 1000;
    const known = Object.keys(s.prices).length;
    const r = buyIntel(s, hub.id);
    expect(r.ok).toBe(true);
    expect(Object.keys(s.prices).length).toBeGreaterThan(known);
    s.credits = 1;
    expect(buyIntel(s, hub.id).ok).toBe(false);
    const other = Object.values(g.stationsById).find((st) => st.type === 'mining')!;
    s.location = { systemId: other.systemId, stationId: other.id, body: other.bodyIndex };
    expect(buyIntel(s, other.id).ok).toBe(false);
  });
});
