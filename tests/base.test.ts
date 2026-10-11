import { describe, expect, it } from 'vitest';
import {
  baseDaily,
  checkBuilding,
  collectTreasury,
  commissionHull,
  commissionModule,
  defenseRating,
  foundBase,
  hangarSlots,
  levelOf,
  mineOutput,
  repairAtBase,
  resolveAttack,
  setAutoSell,
  setLine,
  startBuilding,
  storageCapacity,
  transferGoods,
  upkeepPerDay,
} from '../src/core/base';
import { FOUNDING } from '../src/content/buildings';
import { addGoods } from '../src/core/cargo';
import { ownerOf } from '../src/core/factions';
import { analyze, galaxyOf } from '../src/core/state';
import { passTime } from '../src/core/time';
import { mk } from './helpers';
import type { GameState } from '../src/core/types';

/** A game with the captain in a free system next to some bodies, rich and carrying founding materials. */
function setup(seed = 'BASE1'): GameState {
  const s = mk(seed, 300);
  const g = galaxyOf(s);
  const sys = g.systems.find(
    (x) => ownerOf(s, x.id) === null && x.bodies.length >= 3 && x.bodies.some((b) => b.deposits.length),
  )!;
  s.location = { systemId: sys.id, stationId: null, body: -1 };
  s.detected[sys.id] = sys.bodies.map((b) => b.id);
  s.credits = 900000;
  // a roomy hold for the tests
  s.ship.hullId = 'behemoth';
  s.ship.slots = s.ship.slots.concat(Array(40).fill(null)).slice(0, s.ship.slots.length);
  return s;
}

function load(s: GameState, goodId: string, qty: number): void {
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

function founded(seed = 'BASE1'): GameState {
  const s = setup(seed);
  s.cargo = [];
  s.ship.hullId = 'wayfarer';
  // materials directly into the cargo grid (the hold is small: use the base storage afterwards)
  s.cargo.push({
    uid: 'c1',
    goodId: 'construction',
    qty: 40,
    w: 2,
    h: 2,
    x: 0,
    y: 0,
    cost: 0,
    acquiredDay: 0,
  });
  s.cargo.push({ uid: 'c2', goodId: 'machinery', qty: 12, w: 2, h: 2, x: 2, y: 0, cost: 0, acquiredDay: 0 });
  expect(foundBase(s, 0, 'Test').ok).toBe(true);
  return s;
}

function stock(s: GameState, goods: Record<string, number>): void {
  for (const [g, n] of Object.entries(goods)) s.base!.storage[g] = (s.base!.storage[g] ?? 0) + n;
}

function run(s: GameState, days: number): void {
  for (let i = 0; i < days; i++) {
    s.ship.supplies = 1000;
    s.ship.hp = 1e6;
    passTime(s, 1);
  }
}

describe('base: founding', () => {
  it('needs credits, goods in the hold, a known body and friendly or free space', () => {
    const s = setup('BASE2');
    expect(foundBase(s, 0, 'X').ok).toBe(false);
    s.cargo.push({
      uid: 'c1',
      goodId: 'construction',
      qty: 40,
      w: 2,
      h: 2,
      x: 0,
      y: 0,
      cost: 0,
      acquiredDay: 0,
    });
    s.cargo.push({
      uid: 'c2',
      goodId: 'machinery',
      qty: 12,
      w: 2,
      h: 2,
      x: 2,
      y: 0,
      cost: 0,
      acquiredDay: 0,
    });
    s.credits = 100;
    const r = foundBase(s, 0, 'X');
    expect(r.ok).toBe(false);
    s.credits = 900000;
    const g = galaxyOf(s);
    const hostile = g.systems.find((x) => ownerOf(s, x.id) === 'directorate')!;
    const here = s.location.systemId;
    s.location = { systemId: hostile.id, stationId: null, body: -1 };
    s.detected[hostile.id] = hostile.bodies.map((b) => b.id);
    s.fac.rep.directorate = -70;
    expect(foundBase(s, 0, 'X')).toMatchObject({ ok: false, error: 'err.baseOwner' });
    s.location = { systemId: here, stationId: null, body: -1 };
    const ok = foundBase(s, 0, 'Domov');
    expect(ok.ok).toBe(true);
    expect(s.base!.name).toBe('Domov');
    expect(s.credits).toBe(900000 - FOUNDING.credits);
    expect(foundBase(s, 0, 'Again')).toMatchObject({ ok: false, error: 'err.baseExists' });
  });

  it('is a colony on a habitable body and a station on a gas giant or belt', () => {
    const s = setup('BASE3');
    const g = galaxyOf(s);
    const sys = g.systems[s.location.systemId];
    const kinds = sys.bodies.map((b, i) => ({ i, k: b.kind }));
    const rocky = kinds.find((x) => ['rocky', 'desert', 'ocean', 'ice'].includes(x.k));
    const other = kinds.find((x) => !['rocky', 'desert', 'ocean', 'ice'].includes(x.k));
    s.cargo.push({
      uid: 'c1',
      goodId: 'construction',
      qty: 80,
      w: 2,
      h: 2,
      x: 0,
      y: 0,
      cost: 0,
      acquiredDay: 0,
    });
    s.cargo.push({
      uid: 'c2',
      goodId: 'machinery',
      qty: 24,
      w: 2,
      h: 2,
      x: 2,
      y: 0,
      cost: 0,
      acquiredDay: 0,
    });
    const i = (rocky ?? other)!.i;
    expect(foundBase(s, i, 'B').ok).toBe(true);
    expect(s.base!.kind).toBe(rocky ? 'colony' : 'station');
  });
});

describe('base: buildings, storage and production in time', () => {
  it('builds with credits and stored materials, finishes after the build time and costs upkeep', () => {
    const s = founded();
    expect(startBuilding(s, 'warehouse')).toMatchObject({ ok: false, error: 'err.baseMaterials' });
    stock(s, { construction: 400, machinery: 150, electronics: 40, alloys: 40, computers: 20 });
    const credits = s.credits;
    expect(startBuilding(s, 'warehouse').ok).toBe(true);
    expect(s.credits).toBeLessThan(credits);
    expect(levelOf(s.base, 'warehouse')).toBe(0);
    expect(startBuilding(s, 'warehouse')).toMatchObject({ ok: false, error: 'err.alreadyBuilding' });
    run(s, 6);
    expect(levelOf(s.base, 'warehouse')).toBe(1);
    expect(upkeepPerDay(s.base!)).toBeGreaterThan(0);
    expect(storageCapacity(s.base!)).toBe(FOUNDING.baseStorage + FOUNDING.perWarehouseLevel);
    expect(checkBuilding(s, 'port').ok).toBe(true);
    expect(checkBuilding(s, 'anchor')).toMatchObject({ ok: false });
  });

  it('a mine delivers only from deposits revealed by exploration', () => {
    const s = founded('BASE4');
    s.base!.buildings.mine = 2;
    expect(mineOutput(s)).toEqual([]);
    const g = galaxyOf(s);
    const sys = g.systems[s.base!.systemId];
    const body = sys.bodies.find((b) => b.deposits.length)!;
    s.bodies[body.id] = {
      surface: true,
      probed: false,
      mined: {},
      minedDay: {},
      revealed: body.deposits.map((d) => d.id),
      anomaliesDone: [],
    };
    const out = mineOutput(s);
    expect(out.length).toBeGreaterThan(0);
    run(s, 10);
    const total = Object.values(s.base!.storage).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(5);
    expect(s.base!.stats.produced).toBeGreaterThan(5);
  });

  it('production lines use recipes, respect line limits and the storage capacity', () => {
    const s = founded('BASE5');
    s.base!.buildings.refinery = 1;
    s.base!.buildings.mine = 1;
    stock(s, { iron_ore: 100 });
    expect(setLine(s, 'metals', true).ok).toBe(true);
    expect(setLine(s, 'polymers', true)).toMatchObject({ ok: false, error: 'err.linesFull' });
    expect(setLine(s, 'computers', true)).toMatchObject({ ok: false });
    run(s, 5);
    expect(s.base!.storage.metals ?? 0).toBeGreaterThan(5);
    expect(s.base!.storage.iron_ore).toBeLessThan(100);
    // a full storage stops production
    s.base!.storage = { iron_ore: 100, water_ice: storageCapacity(s.base!) };
    const before = s.base!.storage.metals ?? 0;
    run(s, 3);
    expect(s.base!.storage.metals ?? 0).toBe(before);
  });

  it('transfers goods between the hold and the storage only at the base', () => {
    const s = founded('BASE6');
    s.cargo = [];
    load(s, 'grain', 30);
    expect(transferGoods(s, 'grain', 20, 'toBase')).toMatchObject({ ok: true, moved: 20 });
    expect(s.base!.storage.grain).toBe(20);
    expect(transferGoods(s, 'grain', 5, 'toShip')).toMatchObject({ ok: true, moved: 5 });
    s.location = { systemId: (s.base!.systemId + 1) % s.galaxySize, stationId: null, body: -1 };
    expect(transferGoods(s, 'grain', 5, 'toBase')).toMatchObject({ ok: false, error: 'err.notAtBase' });
  });

  it('the port sells surplus above the keep level into the treasury', () => {
    const s = founded('BASE7');
    s.base!.buildings.warehouse = 1;
    s.base!.buildings.port = 2;
    stock(s, { grain: 100 });
    expect(setAutoSell(s, 'grain', 40).ok).toBe(true);
    run(s, 12);
    expect(s.base!.storage.grain).toBeLessThan(100);
    expect(s.base!.storage.grain).toBeGreaterThanOrEqual(40);
    expect(s.base!.treasury).toBeGreaterThan(0);
    const t = Math.floor(s.base!.treasury);
    const c = s.credits;
    expect(collectTreasury(s)).toMatchObject({ ok: true, amount: t });
    expect(s.credits).toBe(c + t);
  });

  it('modules and hulls are built by orders: materials, credits, time and technology', () => {
    const s = founded('BASE8');
    stock(s, { construction: 900, machinery: 400, electronics: 200, alloys: 200 });
    s.base!.buildings.factory = 2;
    expect(commissionModule(s, 'cargo_s').ok).toBe(true);
    expect(commissionModule(s, 'kinetic_l')).toMatchObject({ ok: false });
    run(s, 4);
    expect(s.inventory.some((m) => m.defId === 'cargo_s')).toBe(true);
    // hulls: shipyard and hangar
    expect(commissionHull(s, 'mule')).toMatchObject({ ok: false, error: 'err.needShipyard' });
    s.base!.buildings.shipyard = 2;
    s.base!.buildings.hangar = 1;
    expect(hangarSlots(s.base!)).toBe(2);
    expect(commissionHull(s, 'mule').ok).toBe(true);
    run(s, 12);
    expect(s.base!.hangar.length).toBe(1);
    expect(s.base!.hangar[0].crew.length).toBeGreaterThan(0);
  });

  it('repairs the active ship cheaply at a base with a shipyard', () => {
    const s = founded('BASE9');
    s.ship.hp = 10;
    expect(repairAtBase(s)).toMatchObject({ ok: false, error: 'err.needShipyard' });
    s.base!.buildings.shipyard = 1;
    expect(repairAtBase(s).ok).toBe(true);
    expect(s.ship.hp).toBeGreaterThan(10);
  });

  it('is deterministic: the same game gives the same base', () => {
    const a = founded('BASED');
    const b = founded('BASED');
    for (const s of [a, b]) {
      stock(s, { iron_ore: 200, construction: 300, machinery: 100 });
      s.base!.buildings.refinery = 2;
      s.base!.buildings.mine = 1;
      setLine(s, 'metals', true);
      run(s, 30);
    }
    expect(a.base).toEqual(b.base);
  });
});

describe('base: raiders', () => {
  it('attacks come with a warning; a strong defence repels them, a weak one loses', () => {
    let attacked = false;
    for (const seed of ['RAID1', 'RAID2', 'RAID3', 'RAID4']) {
      const s = founded(seed);
      stock(s, { grain: 100 });
      s.base!.treasury = 1000;
      s.base!.buildings.warehouse = 1;
      for (let d = 0; d < 400 && !s.base!.attack; d++) {
        s.ship.supplies = 1000;
        passTime(s, 1);
      }
      if (!s.base!.attack) continue;
      attacked = true;
      const a = s.base!.attack!;
      expect(a.resolve).toBeGreaterThan(a.day);
      // weak: lose some stock
      s.base!.buildings.defense = 0;
      expect(defenseRating(s)).toBe(0);
      const copy = JSON.parse(JSON.stringify(s)) as GameState;
      const won = resolveAttack(copy, copy.base!, copy.day);
      if (!won) expect(copy.base!.storage.grain ?? 0).toBeLessThan(100);
      // strong: repelled
      s.base!.buildings.defense = 5;
      s.base!.attack = { ...a, strength: 5 };
      expect(resolveAttack(s, s.base!, s.day)).toBe(true);
      break;
    }
    expect(attacked).toBe(true);
  });

  it('upkeep halts production when nothing can pay it', () => {
    const s = founded('BASEU');
    s.base!.buildings.mine = 3;
    s.base!.buildings.refinery = 1;
    stock(s, { iron_ore: 50 });
    setLine(s, 'metals', true);
    s.credits = 0;
    s.base!.treasury = 0;
    run(s, 3);
    expect(s.base!.storage.metals ?? 0).toBe(0);
    void baseDaily;
  });
});
