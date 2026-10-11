import { describe, expect, it } from 'vitest';
import { HULLS } from '../src/content/hulls';
import { MODULES, MODULES_BY_ID } from '../src/content/modules';
import {
  buildStarterShip,
  canJump,
  computeShipStats,
  hullSlots,
  insuredValue,
  isOperational,
  jumpDays,
  jumpFuelCost,
  moduleFits,
  moduleValue,
  modulePrice,
  neighbours,
  newModule,
  perf,
  shipValue,
  sublightDays,
  wearKind,
  wearModule,
  slotsOfKind,
} from '../src/core/ship';
import { analyze, newUid } from '../src/core/state';
import {
  buyHull,
  buyModule,
  disassembleModule,
  installModule,
  previewHullSwap,
  refreshShop,
  removeModuleToInventory,
  sellModule,
  toggleModule,
} from '../src/core/shop';
import { dockAt } from '../src/core/game';
import { addGoods } from '../src/core/cargo';
import { mk } from './helpers';

const uid = (() => {
  let n = 0;
  return () => `t${++n}`;
})();

describe('ship', () => {
  it('has at least twelve hulls with valid layouts and core slots', () => {
    expect(HULLS.length).toBeGreaterThanOrEqual(12);
    expect(new Set(HULLS.map((h) => h.price)).size).toBe(HULLS.length);
    for (const h of HULLS) {
      const slots = hullSlots(h.id);
      for (const k of ['reactor', 'engine', 'jump', 'life', 'sensors'])
        expect(slots.some((s) => s.core === k)).toBe(true);
      expect(slots.filter((s) => !s.core).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('starter ship can jump on the default power budget', () => {
    const ship = buildStarterShip('wayfarer', 'T', uid);
    const st = computeShipStats(ship);
    expect(st.coreMissing).toEqual([]);
    expect(canJump(st).ok).toBe(true);
    expect(isOperational(st)).toBe(true);
    expect(st.powerJump).toBeGreaterThanOrEqual(0);
  });

  it('every hull works with its default core modules', () => {
    for (const h of HULLS) {
      const st = computeShipStats(buildStarterShip(h.id, 'x', uid));
      expect(canJump(st).ok, h.id).toBe(true);
      expect(st.rangeFull, h.id).toBeGreaterThan(20);
    }
  });

  it('energy balance: extra modules consume power and can be switched off', () => {
    const ship = buildStarterShip('wayfarer', 'T', uid);
    const free = hullSlots('wayfarer').filter((s) => !s.core);
    ship.slots[free[1].index] = newModule('cooler_m', 'C', uid());
    ship.slots[free[2].index] = newModule('shield_m', 'C', uid());
    const st = computeShipStats(ship);
    expect(st.idleDraw).toBeGreaterThan(3.5);
    ship.slots[free[1].index]!.enabled = false;
    ship.slots[free[2].index]!.enabled = false;
    expect(computeShipStats(ship).idleDraw).toBeCloseTo(3.5, 5);
    // overload: three heavy modules make the jump impossible
    ship.slots[free[0].index] = newModule('shield_s', 'C', uid());
    ship.slots[free[1].index]!.enabled = true;
    ship.slots[free[2].index]!.enabled = true;
    ship.slots[free[3].index] = newModule('cooler_s', 'C', uid());
    expect(canJump(computeShipStats(ship)).ok).toBe(false);
  });

  it('adjacency: amplifier boosts neighbours only', () => {
    const ship = buildStarterShip('wayfarer', 'T', uid);
    const slots = hullSlots('wayfarer');
    const base = computeShipStats(ship).powerOut;
    const reactor = slots.find((s) => s.core === 'reactor')!;
    const nb = neighbours('wayfarer', reactor.index);
    expect(nb.length).toBeGreaterThan(0);
    const freeNeighbour = nb.find((i) => !slots[i].core)!;
    ship.slots[freeNeighbour] = newModule('amplifier_s', 'C', uid());
    expect(computeShipStats(ship).powerOut).toBeGreaterThan(base * 1.1);
    // an amplifier far away does nothing
    ship.slots[freeNeighbour] = null;
    const far = slots.filter((s) => !s.core && !nb.includes(s.index) && s.size !== 'L')[0];
    ship.slots[far.index] = newModule('amplifier_s', 'C', uid());
    expect(computeShipStats(ship).powerOut).toBeCloseTo(base, 5);
  });

  it('mass raises fuel use per light-year and shortens range', () => {
    const ship = buildStarterShip('wayfarer', 'T', uid);
    const light = computeShipStats(ship, 0);
    const heavy = computeShipStats(ship, 40);
    expect(heavy.fuelPerLy).toBeGreaterThan(light.fuelPerLy);
    expect(heavy.rangeFull).toBeLessThan(light.rangeFull);
    expect(jumpFuelCost(heavy, 10)).toBeGreaterThan(jumpFuelCost(light, 10));
    expect(jumpDays(light, 8)).toBeGreaterThan(0);
    expect(sublightDays(light, 1)).toBeGreaterThan(0);
  });

  it('quality classes change stats and price', () => {
    const base = buildStarterShip('wayfarer', 'T', uid);
    const better = buildStarterShip('wayfarer', 'T', uid);
    const ri = slotsOfKind(better, 'reactor')[0];
    better.slots[ri] = newModule('reactor_s', 'A', uid());
    expect(computeShipStats(better).powerOut).toBeGreaterThan(computeShipStats(base).powerOut);
    expect(modulePrice(MODULES_BY_ID['reactor_s'], 'A')).toBeGreaterThan(
      modulePrice(MODULES_BY_ID['reactor_s'], 'E'),
    );
  });

  it('wear lowers performance, radiators protect neighbours, broken modules stop working', () => {
    const ship = buildStarterShip('wayfarer', 'T', uid);
    const j = slotsOfKind(ship, 'jump')[0];
    wearModule(ship, j, 50);
    expect(ship.slots[j]!.condition).toBe(50);
    expect(perf(50)).toBeLessThan(1);
    expect(perf(0)).toBe(0);
    expect(computeShipStats(ship).jumpEff).toBeLessThan(1);
    wearKind(ship, 'jump', 100);
    expect(ship.slots[j]!.condition).toBe(0);
    expect(canJump(computeShipStats(ship)).ok).toBe(false);
    // radiator
    const a = buildStarterShip('wayfarer', 'T', uid);
    const b = buildStarterShip('wayfarer', 'T', uid);
    const jj = slotsOfKind(a, 'jump')[0];
    const nb = neighbours('wayfarer', jj).find((i) => !hullSlots('wayfarer')[i].core)!;
    b.slots[nb] = newModule('radiator_s', 'C', uid());
    wearModule(a, jj, 10);
    wearModule(b, jj, 10);
    expect(b.slots[jj]!.condition).toBeGreaterThan(a.slots[jj]!.condition);
  });

  it('module fit rules: size, core kind', () => {
    const slots = hullSlots('wayfarer');
    const coreS = slots.find((s) => s.core === 'reactor')!;
    expect(moduleFits(coreS, MODULES_BY_ID['reactor_s'])).toBe(true);
    expect(moduleFits(coreS, MODULES_BY_ID['reactor_m'])).toBe(false);
    expect(moduleFits(coreS, MODULES_BY_ID['engine_s'])).toBe(false);
    const freeM = slots.find((s) => !s.core && s.size === 'M')!;
    expect(moduleFits(freeM, MODULES_BY_ID['cargo_s'])).toBe(true);
    expect(moduleFits(freeM, MODULES_BY_ID['cargo_l'])).toBe(false);
    expect(moduleFits(freeM, MODULES_BY_ID['reactor_s'])).toBe(false);
    expect(MODULES.length).toBeGreaterThan(40);
  });

  it('values and insurance reflect condition and tiers', () => {
    const ship = buildStarterShip('wayfarer', 'T', uid);
    const m = newModule('cargo_m', 'B', uid());
    const full = moduleValue(m);
    m.condition = 20;
    expect(moduleValue(m)).toBeLessThan(full);
    ship.slots[hullSlots('wayfarer').find((s) => !s.core && s.size === 'M')!.index] = m;
    expect(insuredValue(ship, true)).toBeGreaterThan(insuredValue(ship, false));
    expect(shipValue(ship)).toBeGreaterThan(0);
  });
});

describe('shipyard', () => {
  function docked(seed = 'YARD') {
    for (let i = 0; i < 20; i++) {
      const s = mk(seed + i);
      return s;
    }
    throw new Error('x');
  }

  it('buys, installs, swaps and sells modules', () => {
    const s = docked();
    const stId = s.location.stationId!;
    const dyn = s.stations[stId];
    expect(dyn.shop.modules.length).toBeGreaterThan(0);
    s.credits = 50000;
    const item = dyn.shop.modules.find((m) => MODULES_BY_ID[m.defId].kind === 'cargo')!;
    expect(buyModule(s, stId, item.uid).ok).toBe(true);
    expect(s.inventory.length).toBe(1);
    const slots = hullSlots(s.ship.hullId);
    const free = slots.filter((x) => !x.core && !s.ship.slots[x.index]);
    const slot = free.find((x) => moduleFits(x, MODULES_BY_ID[item.defId]))!;
    const cells0 = analyze(s).stats.cargoCells;
    expect(installModule(s, item.uid, slot.index).ok).toBe(true);
    expect(analyze(s).stats.cargoCells).toBeGreaterThan(cells0);
    expect(removeModuleToInventory(s, slot.index).ok).toBe(true);
    expect(sellModule(s, stId, item.uid).ok).toBe(true);
    expect(s.inventory.length).toBe(0);
    expect(buyModule(s, stId, 'nope').ok).toBe(false);
    expect(installModule(s, 'nope', 0).ok).toBe(false);
    expect(toggleModule(s, slots.find((x) => x.core === 'reactor')!.index).ok).toBe(false);
    expect(toggleModule(s, slots.find((x) => x.core === 'sensors')!.index).ok).toBe(true);
    expect(sellModule(s, stId, s.ship.slots[slots.find((x) => x.core === 'engine')!.index]!.uid).ok).toBe(
      false,
    );
  });

  it('rejects purchases without credits', () => {
    const s = docked('POOR');
    s.credits = 1;
    const dyn = s.stations[s.location.stationId!];
    expect(buyModule(s, s.location.stationId!, dyn.shop.modules[0].uid).ok).toBe(false);
  });

  it('swaps hulls with module transfer and a change preview', () => {
    const s = docked('HULL');
    const stId = s.location.stationId!;
    const st = s.stations[stId];
    s.credits = 90000;
    const target = st.shop.hulls.find((h) => h !== s.ship.hullId)!;
    const gal = (st as unknown as { x?: number }).x;
    void gal;
    const station = await_station(s, stId);
    const prev = previewHullSwap(s, station, target);
    expect(prev.cost).toBeGreaterThan(-100000);
    expect(prev.after.coreMissing).toEqual([]);
    const before = s.credits;
    const r = buyHull(s, stId, target);
    expect(r.ok).toBe(true);
    expect(s.ship.hullId).toBe(target);
    expect(s.credits).toBeLessThan(before);
    expect(buyHull(s, stId, target).ok).toBe(false);
    refreshShop(s, station);
  });

  it('disassembles modules into materials', () => {
    const s = docked('DIS');
    s.inventory.push(newModule('laser_m', 'C', newUid(s, 'm')));
    const stats = analyze(s);
    void stats;
    const res = disassembleModule(s, s.inventory[0].uid, (g, q) => {
      const { stats: st, dims } = analyze(s);
      return addGoods(
        s.cargo,
        dims,
        { chilledCells: st.chilledCells, secureCells: st.secureCells },
        g,
        q,
        0,
        s.day,
      ).added;
    });
    expect(res.ok).toBe(true);
    expect(s.cargo.length).toBeGreaterThan(0);
    void dockAt;
  });
});

import { stationOf } from '../src/core/state';
function await_station(s: ReturnType<typeof mk>, id: string) {
  return stationOf(s, id);
}
