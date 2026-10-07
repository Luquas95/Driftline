import { describe, expect, it } from 'vitest';
import { CHAINS } from '../src/content/chains';
import {
  abandonContract,
  acceptContract,
  completeContractsAt,
  isDeliverable,
  MAX_ACTIVE_CONTRACTS,
} from '../src/core/contractOps';
import {
  advanceChain,
  boardEpoch,
  isChainFinal,
  makeContract,
  pathLength,
  refreshBoard,
  stationsNear,
} from '../src/core/contracts';
import { dockAt, jump, undock } from '../src/core/game';
import { Rng } from '../src/core/rng';
import { analyze, galaxyOf, stationOf } from '../src/core/state';
import { passTime } from '../src/core/time';
import { addGoods, unitsOf } from '../src/core/cargo';
import { hullSlots, newModule } from '../src/core/ship';
import type { Contract, GameState } from '../src/core/types';
import { mk } from './helpers';

function firstOf(s: GameState, kind: Contract['kind']): Contract | undefined {
  return s.stations[s.location.stationId!].board.find((c) => c.kind === kind);
}

function makeOne(s: GameState, kind: Contract['kind'], tries = 40): Contract {
  const g = galaxyOf(s);
  const st = stationOf(s, s.location.stationId!);
  for (let i = 0; i < tries; i++) {
    const c = makeContract(g, s, st, Rng.fromSeed(`mc${i}`), { kind });
    if (c) return c;
  }
  throw new Error(`could not create ${kind}`);
}

describe('contracts', () => {
  it('boards are deterministic per station and week', () => {
    const a = mk('BOARD');
    const b = mk('BOARD');
    expect(a.stations[a.location.stationId!].board.map((c) => [c.kind, c.reward, c.dest])).toEqual(
      b.stations[b.location.stationId!].board.map((c) => [c.kind, c.reward, c.dest]),
    );
    expect(a.stations[a.location.stationId!].board.length).toBeGreaterThan(2);
    expect(boardEpoch(15)).toBe(2);
  });

  it('refreshes boards weekly', () => {
    const s = mk('BOARD2');
    const st = stationOf(s, s.location.stationId!);
    const g = galaxyOf(s);
    const ids = s.stations[st.id].board.map((c) => c.id);
    passTime(s, 8);
    refreshBoard(g, s, st);
    expect(s.stations[st.id].board.map((c) => c.id)).not.toEqual(ids);
  });

  it('accepting pays the deposit, loads freight and removes the offer', () => {
    const s = mk('ACCEPT');
    const st = s.location.stationId!;
    const c = makeOne(s, 'freight');
    s.stations[st].board.push(c);
    const credits = s.credits;
    const r = acceptContract(s, st, c.id);
    expect(r.ok).toBe(true);
    expect(s.credits).toBe(credits + c.deposit);
    expect(s.contracts[0].state).toBe('active');
    expect(unitsOf(s.cargo, c.goodId!, c.id)).toBe(c.qty);
    expect(s.stations[st].board.find((x) => x.id === c.id)).toBeUndefined();
    expect(acceptContract(s, st, c.id).ok).toBe(false);
  });

  it('passenger contracts need beds and comfort', () => {
    const s = mk('PAX');
    const st = s.location.stationId!;
    const c = makeOne(s, 'passenger');
    c.passengers = 2;
    c.comfort = 1;
    s.stations[st].board.push(c);
    expect(acceptContract(s, st, c.id).ok).toBe(false);
    const free = hullSlots(s.ship.hullId).filter((x) => !x.core && !s.ship.slots[x.index] && x.size !== 'L');
    s.ship.slots[free[0].index] = newModule('quarters_s', 'C', 'q1');
    expect(analyze(s).stats.beds).toBeGreaterThanOrEqual(2);
    c.comfort = 3;
    expect(acceptContract(s, st, c.id).ok).toBe(false);
    c.comfort = 1;
    expect(acceptContract(s, st, c.id).ok).toBe(true);
  });

  it('limits the number of active contracts', () => {
    const s = mk('MANY');
    const st = s.location.stationId!;
    let accepted = 0;
    for (let i = 0; i < MAX_ACTIVE_CONTRACTS + 3; i++) {
      const c = makeOne(s, 'survey');
      s.stations[st].board.push(c);
      if (acceptContract(s, st, c.id).ok) accepted++;
    }
    expect(accepted).toBe(MAX_ACTIVE_CONTRACTS);
  });

  it('delivers freight, pays the reward minus the advance and grants reputation', () => {
    const s = mk('DELIVER');
    const g = galaxyOf(s);
    const st = s.location.stationId!;
    const c = makeOne(s, 'freight');
    s.stations[st].board.push(c);
    expect(acceptContract(s, st, c.id).ok).toBe(true);
    expect(isDeliverable(s, c)).toBe(true);
    // teleport to destination
    const dest = g.stationsById[c.dest];
    s.location = { systemId: dest.systemId, stationId: dest.id, body: dest.bodyIndex };
    const before = s.credits;
    const done = completeContractsAt(s, g, dest.id);
    expect(done).toHaveLength(1);
    expect(s.credits).toBe(before + done[0].payout - c.deposit);
    expect(s.contracts).toHaveLength(0);
    expect(s.stats.contractsDone).toBe(1);
    expect(s.stations[dest.id].rep).toBeGreaterThan(0);
    expect(unitsOf(s.cargo, c.goodId!, c.id)).toBe(0);
  });

  it('bundles deliveries to the same destination for a bonus', () => {
    const s = mk('BUNDLE');
    const g = galaxyOf(s);
    const st = s.location.stationId!;
    const dest = Object.values(g.stationsById).find((x) => x.id !== st && x.type !== 'pirate')!;
    const cs = [makeOne(s, 'courier'), makeOne(s, 'courier'), makeOne(s, 'courier')];
    cs.forEach((c) => {
      c.dest = dest.id;
      c.destSystem = dest.systemId;
      s.stations[st].board.push(c);
      expect(acceptContract(s, st, c.id).ok).toBe(true);
    });
    s.location = { systemId: dest.systemId, stationId: dest.id, body: dest.bodyIndex };
    const rewards = cs.reduce((a, c) => a + c.reward, 0);
    const done = completeContractsAt(s, g, dest.id);
    expect(done).toHaveLength(3);
    expect(done.reduce((a, d) => a + d.payout, 0)).toBeGreaterThan(rewards);
  });

  it('fails expired contracts: loses the advance and pays the penalty', () => {
    const s = mk('LATE');
    const st = s.location.stationId!;
    const c = makeOne(s, 'courier');
    s.stations[st].board.push(c);
    acceptContract(s, st, c.id);
    s.credits += 5000;
    const before = s.credits;
    passTime(s, c.deadline - s.day + 1);
    expect(s.contracts).toHaveLength(0);
    expect(s.credits).toBeLessThan(before);
    expect(s.stats.contractsFailed).toBe(1);
    expect(s.stations[st].rep).toBeLessThan(0);
  });

  it('abandoning costs the penalty', () => {
    const s = mk('ABANDON');
    const st = s.location.stationId!;
    const c = makeOne(s, 'survey');
    s.stations[st].board.push(c);
    acceptContract(s, st, c.id);
    s.credits = 5000;
    expect(abandonContract(s, c.id).ok).toBe(true);
    expect(s.credits).toBe(5000 - c.penalty - c.deposit);
    expect(abandonContract(s, c.id).ok).toBe(false);
  });

  it('supply contracts consume goods; survey needs the scan first', () => {
    const s = mk('SUPPLY');
    const g = galaxyOf(s);
    const st = s.location.stationId!;
    const c = makeOne(s, 'supply');
    s.stations[st].board.push(c);
    acceptContract(s, st, c.id);
    expect(isDeliverable(s, c)).toBe(false);
    const { stats, dims } = analyze(s);
    addGoods(
      s.cargo,
      dims,
      { chilledCells: stats.chilledCells, secureCells: stats.secureCells },
      c.goodId!,
      c.qty!,
      0,
      0,
    );
    expect(isDeliverable(s, c)).toBe(true);
    const sv = makeOne(s, 'survey');
    expect(isDeliverable(s, sv)).toBe(false);
    sv.progress = 1;
    expect(isDeliverable(s, sv)).toBe(true);
    void g;
  });

  it('story chains advance step by step and finish with a reward', () => {
    expect(CHAINS.length).toBeGreaterThanOrEqual(3);
    const s = mk('CHAIN', 200);
    const g = galaxyOf(s);
    const st = stationOf(s, s.location.stationId!);
    for (const chain of CHAINS) {
      const first = makeContract(g, s, st, Rng.fromSeed('c0'), {
        kind: chain.steps[0].kind,
        step: chain.steps[0],
        chainId: chain.id,
        chainStep: 0,
      });
      if (!first) continue;
      expect(first.title).toBe(`chain.${chain.id}.0.text`);
      expect(isChainFinal(first)).toBe(false);
      const next = advanceChain(g, s, first, st);
      if (next) {
        expect(next.state).toBe('active');
        expect(next.chainStep).toBe(1);
      }
    }
    const last = { ...makeOne(s, 'courier'), chainId: 'vesna', chainStep: 2 } as Contract;
    expect(isChainFinal(last)).toBe(true);
    expect(advanceChain(g, s, last, st)).toBeNull();
    expect(s.flags['chain:vesna']).toBe('done');
    expect(advanceChain(g, s, makeOne(s, 'courier'), st)).toBeNull();
  });

  it('path length and nearby stations behave', () => {
    const s = mk('NEAR');
    const g = galaxyOf(s);
    const st = stationOf(s, s.location.stationId!);
    const near = stationsNear(g, st.systemId, 3);
    expect(near.length).toBeGreaterThan(0);
    expect(near.every((n) => n.jumps <= 3)).toBe(true);
    expect(pathLength(g, 0, 0)).toBe(0);
    expect(pathLength(g, 0, 50)).toBeGreaterThan(0);
  });

  it('delivery happens automatically when docking', () => {
    const s = mk('AUTODOCK');
    const g = galaxyOf(s);
    const st = s.location.stationId!;
    const c = makeOne(s, 'courier');
    // make the destination a station in a neighbouring system
    const sys = g.systems[s.location.systemId];
    const target = sys.neighbors.map((n) => g.systems[n]).find((x) => x.stations.length)!;
    c.dest = target.stations[0].id;
    c.destSystem = target.id;
    s.stations[st].board.push(c);
    expect(acceptContract(s, st, c.id).ok).toBe(true);
    undock(s);
    expect(jump(s, target.id).ok).toBe(true);
    s.pendingEvent = null;
    const r = dockAt(s, c.dest);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.report.completed.length).toBe(1);
    void firstOf;
  });
});
