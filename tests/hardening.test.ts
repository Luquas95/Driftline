import { describe, expect, it } from 'vitest';
import { advanceChain, makeContract } from '../src/core/contracts';
import { completeContractsAt, isDeliverable } from '../src/core/contractOps';
import { buyFuel, wait } from '../src/core/game';
import { Rng } from '../src/core/rng';
import { deserializeState, serializeState, SaveError } from '../src/core/save';
import { newModule, hullSlots } from '../src/core/ship';
import { sellModule, toggleModule } from '../src/core/shop';
import { analyze, galaxyOf, stationOf } from '../src/core/state';
import { CHAINS } from '../src/content/chains';
import { mk } from './helpers';

describe('hardening', () => {
  it('every story chain can be played to its end (next step cargo is loaded)', () => {
    for (const chain of CHAINS) {
      const s = mk(`CH-${chain.id}`, 200);
      const g = galaxyOf(s);
      const st = stationOf(s, s.location.stationId!);
      let c = makeContract(g, s, st, Rng.fromSeed('c0'), {
        kind: chain.steps[0].kind,
        step: chain.steps[0],
        chainId: chain.id,
        chainStep: 0,
      });
      if (!c) continue;
      c.state = 'active';
      s.contracts.push(c);
      for (let step = 1; step < chain.steps.length; step++) {
        const dest = g.stationsById[c.dest];
        s.location = { systemId: dest.systemId, stationId: dest.id, body: dest.bodyIndex };
        // make the current step deliverable
        if (c.goodId && c.kind === 'supply')
          s.cargo.push({
            uid: `t${step}`,
            goodId: c.goodId,
            qty: c.qty!,
            w: 1,
            h: 1,
            x: 0,
            y: 0,
            cost: 0,
            acquiredDay: 0,
          });
        if ((c.kind === 'freight' || c.kind === 'courier') && !s.cargo.some((x) => x.contractId === c!.id))
          s.cargo.push({
            uid: `n${step}`,
            goodId: c.goodId!,
            qty: c.qty!,
            w: 1,
            h: 1,
            x: 2,
            y: 0,
            cost: 0,
            acquiredDay: 0,
            contractId: c.id,
          });
        if (c.kind === 'survey' || c.kind === 'rescue') c.progress = 2;
        if (c.kind === 'rescue')
          s.cargo.push({
            uid: `r${step}`,
            goodId: 'survivors',
            qty: 1,
            w: 1,
            h: 1,
            x: 1,
            y: 0,
            cost: 0,
            acquiredDay: 0,
            contractId: c.id,
          });
        completeContractsAt(s, g, dest.id);
        const next = s.contracts.find((x) => x.chainId === chain.id && x.state === 'active');
        if (!next) break;
        if (next.kind === 'freight' || next.kind === 'courier')
          expect(isDeliverable(s, next), `${chain.id} step ${step}`).toBe(true);
        c = next;
      }
    }
    void advanceChain;
  });

  it('rejects malicious or broken saves instead of crashing later', () => {
    const base = JSON.parse(serializeState(mk('EVIL', 60)));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attempts: ((s: any) => void)[] = [
      (s) => (s.ship.hullId = 'nope'),
      (s) => (s.ship.slots[0] = { defId: 'x', quality: 'C', condition: 100, enabled: true, uid: 'a' }),
      (s) => (s.galaxySize = 20000),
      (s) => (s.galaxySize = 'big'),
      (s) => (s.credits = -5),
      (s) => (s.rng = [0, 0, 0, 0]),
      (s) => delete s.insurance,
      (s) => (s.contracts = 'x'),
      (s) =>
        s.cargo.push({
          uid: 'z',
          goodId: 'metals',
          qty: 1,
          w: 1e9,
          h: 1,
          x: 0,
          y: 0,
          cost: 0,
          acquiredDay: 0,
        }),
    ];
    for (const mutate of attempts) {
      const copy = JSON.parse(JSON.stringify(base));
      mutate(copy);
      expect(() => deserializeState(JSON.stringify(copy))).toThrow(SaveError);
    }
  });

  it('repairs saves from older content: short stock arrays and unknown events', () => {
    const base = JSON.parse(serializeState(mk('OLD', 60)));
    for (const d of Object.values(base.stations) as { stock: number[] }[]) d.stock.length = 5;
    base.pendingEvent = { eventId: 'removed_event', context: { systemId: 0 } };
    const s = deserializeState(JSON.stringify(base));
    expect(s.pendingEvent).toBeNull();
    for (const d of Object.values(s.stations)) expect(d.stock.every((x) => Number.isFinite(x))).toBe(true);
  });

  it('non-finite amounts are rejected', () => {
    const s = mk('NAN');
    s.ship.fuel = 10;
    expect(buyFuel(s, s.location.stationId!, NaN).ok).toBe(false);
    expect(wait(s, NaN).ok).toBe(false);
    expect(wait(s, Infinity).ok).toBe(false);
    expect(Number.isFinite(s.credits)).toBe(true);
  });

  it('modules cannot be sold or switched off when cargo or passengers depend on them', () => {
    const s = mk('REFIT');
    const free = hullSlots(s.ship.hullId).filter((x) => !x.core && !s.ship.slots[x.index] && x.size !== 'L');
    s.ship.slots[free[0].index] = newModule('quarters_s', 'C', 'q1');
    s.contracts.push({
      id: 'k1',
      kind: 'passenger',
      origin: s.home,
      dest: s.home,
      destSystem: 0,
      passengers: 2,
      comfort: 1,
      deadline: 99,
      reward: 1,
      deposit: 0,
      penalty: 0,
      state: 'active',
    });
    expect(sellModule(s, s.location.stationId!, 'q1').ok).toBe(false);
    expect(toggleModule(s, free[0].index, false).ok).toBe(false);
    // fill the hold so the cargo pod cannot go
    const cap = analyze(s).dims.cells;
    for (let i = 0; i < cap; i++)
      s.cargo.push({
        uid: `f${i}`,
        goodId: 'metals',
        qty: 1,
        w: 1,
        h: 1,
        x: i % 5,
        y: Math.floor(i / 5),
        cost: 0,
        acquiredDay: 0,
      });
    const pod = s.ship.slots.findIndex((m) => m?.defId.startsWith('cargo_'));
    expect(sellModule(s, s.location.stationId!, s.ship.slots[pod]!.uid).ok).toBe(false);
  });
});
