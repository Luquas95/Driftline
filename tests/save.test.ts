import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { exportSave, deserializeState, fromParsed, importSave, migrateState, SaveError, serializeState, toEnvelope } from '../src/core/save';
import { buyGoods, dockAt, jump, maxBuy } from '../src/core/game';
import { galaxyOf } from '../src/core/state';
import { passTime } from '../src/core/time';
import { SaveStore } from '../src/persist/store';
import { SAVE_VERSION } from '../src/core/types';
import { mk } from './helpers';

function played() {
  const s = mk('SAVE1');
  const st = s.location.stationId!;
  const g = galaxyOf(s);
  const gid = Object.keys(g.stationsById[st].role).find((x) => maxBuy(s, st, x) > 5);
  if (gid) buyGoods(s, st, gid, 30);
  jump(s, g.systems[s.location.systemId].neighbors[0]);
  passTime(s, 5);
  return s;
}

describe('saving', () => {
  it('round-trips the full state through JSON without loss', () => {
    const s = played();
    const back = deserializeState(serializeState(s));
    expect(back).toEqual(JSON.parse(JSON.stringify(s)));
  });

  it('a restored game continues identically to the original', () => {
    const a = played();
    const b = deserializeState(serializeState(a));
    passTime(a, 12);
    passTime(b, 12);
    expect(b.credits).toBe(a.credits);
    expect(Object.values(b.stations)[3].stock).toEqual(Object.values(a.stations)[3].stock);
    const nb = galaxyOf(a).systems[a.location.systemId].neighbors[0];
    undockSafe(a);
    undockSafe(b);
    expect(jump(a, nb).ok).toBe(jump(b, nb).ok);
    expect(b.day).toBeCloseTo(a.day, 8);
    expect(b.ship.fuel).toBeCloseTo(a.ship.fuel, 8);
    expect(b.pendingEvent).toEqual(a.pendingEvent);
  });

  it('exports and imports envelopes', () => {
    const s = played();
    const txt = exportSave(s, '2026-01-01T00:00:00Z');
    expect(JSON.parse(txt).magic).toBe('driftline-save');
    expect(JSON.parse(txt).version).toBe(SAVE_VERSION);
    expect(importSave(txt).seed).toBe('SAVE1');
    expect(toEnvelope(s, 'x').state).toBe(s);
  });

  it('migrates old saves (v0) by filling new fields', () => {
    const s = played();
    const old = JSON.parse(JSON.stringify(s));
    old.v = 0;
    delete old.inventory;
    delete old.hints;
    delete old.tutorial;
    delete old.galaxySize;
    const m = migrateState(old);
    expect(m.v).toBe(SAVE_VERSION);
    expect(m.inventory).toEqual([]);
    expect(m.tutorial).toEqual({ step: 0, done: false });
    expect(m.galaxySize).toBe(300);
    expect(fromParsed(old).seed).toBe('SAVE1');
  });

  it('rejects broken or too-new saves', () => {
    expect(() => deserializeState('{nope')).toThrow(SaveError);
    expect(() => deserializeState('[]')).toThrow(SaveError);
    expect(() => deserializeState(JSON.stringify({ v: 1, seed: '' }))).toThrow(SaveError);
    expect(() => deserializeState(JSON.stringify({ v: 999, seed: 'x' }))).toThrow(/newer/);
    expect(() => fromParsed(null)).toThrow(SaveError);
    expect(() => fromParsed({ magic: 'driftline-save', state: null })).toThrow(SaveError);
    const s = played();
    const bad = JSON.parse(JSON.stringify(s));
    bad.credits = 'rich';
    expect(() => fromParsed(bad)).toThrow(SaveError);
  });

  it('stores saves in IndexedDB with slots, listing and deletion', async () => {
    const store = new SaveStore('test-db-' + Math.random());
    const s = played();
    await store.put('slot1', s, 'First');
    await store.put('autosave', s, 'Auto');
    const list = await store.list();
    expect(list.map((x) => x.id).sort()).toEqual(['autosave', 'slot1']);
    expect(list[0].day).toBeGreaterThan(0);
    const loaded = await store.get('slot1');
    expect(loaded!.seed).toBe('SAVE1');
    await store.remove('slot1');
    expect(await store.get('slot1')).toBeNull();
    expect((await store.list()).length).toBe(1);
    void dockAt;
  });
});

function undockSafe(s: ReturnType<typeof mk>) {
  s.pendingEvent = null;
}
