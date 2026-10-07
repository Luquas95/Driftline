import { describe, expect, it } from 'vitest';
import {
  addGoods,
  autoArrange,
  capacityOf,
  cargoMass,
  daysLeft,
  freshness,
  gridDims,
  isSpoiled,
  loadableUnits,
  moveItem,
  occupancyGrid,
  overloadCells,
  quotaUse,
  removeGoods,
  rotateItem,
  shapesFor,
  unitsOf,
  usedCells,
  findSpot,
  fitsAt,
  totalRows,
} from '../src/core/cargo';
import { GOODS_BY_ID } from '../src/content/goods';
import { buildStarterShip, computeShipStats, hullSlots, newModule } from '../src/core/ship';
import { analyze } from '../src/core/state';
import { buyGoods, cargoAutoArrange, cargoMove, cargoRotate, jettison, maxBuy } from '../src/core/game';
import type { CargoItem } from '../src/core/types';
import { mk } from './helpers';

const dims = gridDims({ cargoCells: 10, cargoCols: 5 });
const none = { chilledCells: 0, secureCells: 0 };

describe('cargo grid', () => {
  it('computes dimensions with an overflow row', () => {
    expect(dims).toMatchObject({ cols: 5, rows: 2, cells: 10, overflowRows: 1 });
    expect(totalRows(dims)).toBe(3);
    const odd = gridDims({ cargoCells: 7, cargoCols: 4 });
    expect(odd.rows).toBe(2);
  });

  it('splits quantities into 2x2, 2x1 and 1x1 containers', () => {
    const g = GOODS_BY_ID.iron_ore; // 16/cell
    const shapes = shapesFor(g, 16 * 4 + 16 * 2 + 5);
    expect(shapes.filter((s) => s.w === 2 && s.h === 2)).toHaveLength(1);
    expect(shapes.filter((s) => s.w === 2 && s.h === 1)).toHaveLength(1);
    expect(shapes.reduce((a, s) => a + s.qty, 0)).toBe(16 * 6 + 5);
    expect(capacityOf(g, 2, 2)).toBe(64);
  });

  it('places goods, tops up partial containers and keeps cost', () => {
    const items: CargoItem[] = [];
    const r = addGoods(items, dims, none, 'iron_ore', 20, 360, 0);
    expect(r.added).toBe(20);
    expect(unitsOf(items, 'iron_ore')).toBe(20);
    const r2 = addGoods(items, dims, none, 'iron_ore', 6, 108, 0);
    expect(r2.added).toBe(6);
    expect(items.reduce((s, i) => s + i.cost, 0)).toBeCloseTo(468, 5);
    // no overlap
    const g = occupancyGrid(dims, items);
    let cells = 0;
    for (const row of g) for (const c of row) if (c) cells++;
    expect(cells).toBe(usedCells(items));
  });

  it('refuses when full and reports partial additions (overflow row is the last resort)', () => {
    const items: CargoItem[] = [];
    const r = addGoods(items, dims, none, 'iron_ore', 16 * 50, 0, 0, undefined, false);
    expect(r.added).toBeLessThan(16 * 50);
    expect(r.reason).toBe('full');
    expect(usedCells(items)).toBeLessThanOrEqual(10);
    const items2: CargoItem[] = [];
    addGoods(items2, dims, none, 'iron_ore', 16 * 50, 0, 0);
    expect(usedCells(items2)).toBeGreaterThan(10);
    expect(overloadCells(dims, items2)).toBeGreaterThan(0);
    expect(overloadCells(dims, items)).toBe(0);
  });

  it('enforces chilled and secure quotas', () => {
    const items: CargoItem[] = [];
    expect(addGoods(items, dims, none, 'fresh_produce', 10, 0, 0).added).toBe(0);
    const ok = addGoods(items, dims, { chilledCells: 2, secureCells: 0 }, 'fresh_produce', 100, 0, 0);
    expect(ok.added).toBeLessThanOrEqual(24);
    expect(ok.reason).toBe('chilled');
    expect(quotaUse(items).chilled).toBeLessThanOrEqual(2);
    const items2: CargoItem[] = [];
    expect(addGoods(items2, dims, none, 'gems', 3, 0, 0).reason).toBe('secure');
    expect(addGoods(items2, dims, { chilledCells: 0, secureCells: 2 }, 'gems', 3, 0, 0).added).toBe(3);
    expect(loadableUnits(items2, dims, { chilledCells: 0, secureCells: 2 }, 'gems', 100)).toBeLessThanOrEqual(5);
  });

  it('rotates, moves and auto-arranges items', () => {
    const items: CargoItem[] = [];
    addGoods(items, dims, none, 'iron_ore', 32, 0, 0); // a 2x1
    const it = items[0];
    expect(it.w * it.h).toBe(2);
    const w = it.w;
    expect(rotateItem(items, dims, it.uid)).toBe(true);
    expect(it.w).not.toBe(w);
    expect(moveItem(items, dims, it.uid, 4, 0)).toBe(it.w === 1);
    expect(moveItem(items, dims, it.uid, 0, 0)).toBe(true);
    expect(moveItem(items, dims, 'nope', 0, 0)).toBe(false);
    addGoods(items, dims, none, 'grain', 20, 0, 0);
    addGoods(items, dims, none, 'metals', 10, 0, 0);
    expect(autoArrange(items, dims)).toBe(true);
    const g = occupancyGrid(dims, items);
    expect(g.flat().filter(Boolean).length).toBe(usedCells(items));
    expect(fitsAt(dims, items, 1, 1, 0, 0)).toBe(false);
    expect(findSpot(dims, items, 1, 1)).not.toBeNull();
    expect(rotateItem(items, dims, 'nope')).toBe(false);
  });

  it('auto-arrange fails safely when nothing fits', () => {
    const tiny = gridDims({ cargoCells: 2, cargoCols: 2 });
    const items: CargoItem[] = [
      { uid: 'a', goodId: 'grain', qty: 1, w: 2, h: 2, x: 0, y: 0, cost: 0, acquiredDay: 0 },
      { uid: 'b', goodId: 'grain', qty: 1, w: 2, h: 2, x: 0, y: 0, cost: 0, acquiredDay: 0 },
    ];
    expect(autoArrange(items, tiny)).toBe(false);
  });

  it('removes goods oldest first and tracks cost', () => {
    const items: CargoItem[] = [];
    addGoods(items, dims, none, 'grain', 10, 100, 1);
    addGoods(items, dims, none, 'metals', 5, 50, 1);
    const r = removeGoods(items, 'grain', 4);
    expect(r.removed).toBe(4);
    expect(r.cost).toBeCloseTo(40, 5);
    expect(unitsOf(items, 'grain')).toBe(6);
    expect(removeGoods(items, 'grain', 100).removed).toBe(6);
    expect(items.some((i) => i.goodId === 'grain')).toBe(false);
  });

  it('computes mass and freshness for perishables', () => {
    const items: CargoItem[] = [];
    addGoods(items, dims, { chilledCells: 4, secureCells: 0 }, 'fresh_produce', 12, 0, 0);
    expect(cargoMass(items)).toBeCloseTo(12 * GOODS_BY_ID.fresh_produce.mass, 5);
    const g = GOODS_BY_ID.fresh_produce;
    expect(freshness(g, 0)).toBe(1);
    expect(freshness(g, 15)).toBeLessThan(1);
    expect(freshness(g, 100)).toBeCloseTo(0.2, 5);
    expect(isSpoiled(g, g.shelfDays! * 1.5)).toBe(true);
    expect(isSpoiled(GOODS_BY_ID.grain, 1000)).toBe(false);
    expect(daysLeft(g, 10)).toBeGreaterThan(0);
    expect(daysLeft(GOODS_BY_ID.grain, 10)).toBeNull();
  });
});

describe('cargo in the game', () => {
  it('cargo mass changes fuel use and overload costs supplies', () => {
    const s = mk('CARGO');
    const base = analyze(s).stats;
    const stId = s.location.stationId!;
    const st = s.stations[stId];
    void st;
    const stats0 = base.fuelPerLy;
    // fill the hold with whatever the station sells
    const g = (globalThis as unknown as { __g?: unknown }).__g;
    void g;
    const station = s.location.stationId!;
    const stn = (s as unknown as { x?: number }).x;
    void stn;
    for (const gid of Object.keys(GOODS_BY_ID)) {
      if (maxBuy(s, station, gid) > 0) buyGoods(s, station, gid, 9999);
    }
    const loaded = analyze(s);
    expect(loaded.stats.mass).toBeGreaterThan(base.mass);
    expect(loaded.stats.fuelPerLy).toBeGreaterThan(stats0);
    if (loaded.overload > 0) expect(loaded.stats.suppliesPerDay).toBeGreaterThan(base.suppliesPerDay);
  });

  it('exposes grid actions and rejects contract cargo jettison', () => {
    const s = mk('CARGO2');
    const station = s.location.stationId!;
    const gid = Object.keys(GOODS_BY_ID).find((x) => maxBuy(s, station, x) > 20)!;
    buyGoods(s, station, gid, 40);
    const it = s.cargo[0];
    expect(cargoRotate(s, it.uid).ok).toBe(it.w !== it.h);
    expect(cargoAutoArrange(s).ok).toBe(true);
    expect(cargoMove(s, it.uid, 0, 0).ok).toBeTypeOf('boolean');
    it.contractId = 'k1';
    expect(jettison(s, it.uid).ok).toBe(false);
    it.contractId = undefined;
    expect(jettison(s, it.uid).ok).toBe(true);
    expect(jettison(s, 'zzz').ok).toBe(false);
  });

  it('a cooler module unlocks chilled goods', () => {
    const ship = buildStarterShip('wayfarer', 'T', () => 'q');
    const free = hullSlots('wayfarer').filter((x) => !x.core && x.size === 'M');
    ship.slots[free[0].index] = newModule('cooler_m', 'C', 'c1');
    const st = computeShipStats(ship);
    expect(st.chilledCells).toBeGreaterThan(5);
  });
});
