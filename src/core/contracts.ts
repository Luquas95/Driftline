import { CHAINS, CHAINS_BY_ID, type ChainStepDef } from '../content/chains';
import { GOODS_BY_ID, MARKET_GOODS } from '../content/goods';
import { STATION_TYPES_BY_ID } from '../content/stations';
import { dist, shortestPath } from './galaxy';
import { Rng } from './rng';
import { T } from './tuning';
import type { Contract, ContractKind, Galaxy, GameState, StationStatic } from './types';

export interface Nearby {
  station: StationStatic;
  jumps: number;
}

const nearbyCache = new Map<string, Nearby[]>();

/** Stations reachable within `maxJumps` hops of a system, nearest first (excluding the system itself when `exclude`). */
export function stationsNear(g: Galaxy, systemId: number, maxJumps: number): Nearby[] {
  const key = `${g.seed}|${systemId}|${maxJumps}`;
  const hit = nearbyCache.get(key);
  if (hit) return hit;
  const seen = new Map<number, number>([[systemId, 0]]);
  const queue = [systemId];
  const out: Nearby[] = [];
  while (queue.length) {
    const s = queue.shift()!;
    const d = seen.get(s)!;
    for (const st of g.systems[s].stations) out.push({ station: st, jumps: d });
    if (d >= maxJumps) continue;
    for (const n of g.systems[s].neighbors) {
      if (!seen.has(n)) {
        seen.set(n, d + 1);
        queue.push(n);
      }
    }
  }
  if (nearbyCache.size > 400) nearbyCache.clear();
  nearbyCache.set(key, out);
  return out;
}

export function pathLength(g: Galaxy, a: number, b: number): number {
  if (a === b) return 0;
  const p = shortestPath(g, a, b);
  if (!p) return dist(g.systems[a], g.systems[b]) * 1.4;
  let len = 0;
  for (let i = 1; i < p.length; i++) len += dist(g.systems[p[i - 1]], g.systems[p[i]]);
  return len;
}

function estDays(len: number, jumps: number): number {
  return len / 4 + jumps * T.jumpOverhead + 1.5;
}

export function nextId(state: GameState, prefix: string): string {
  return `${prefix}${++state.uidCounter}`;
}

function pickDest(g: Galaxy, origin: StationStatic, rng: Rng, jumps: number, types?: string[]): Nearby | null {
  const all = stationsNear(g, origin.systemId, jumps).filter((n) => n.station.id !== origin.id);
  const pool = types ? all.filter((n) => types.includes(n.station.type)) : all;
  const choices = pool.length ? pool : all;
  if (!choices.length) return null;
  const away = choices.filter((c) => c.jumps >= 1);
  return rng.pick(away.length ? away : choices);
}

interface MakeOpts {
  kind: ContractKind;
  step?: ChainStepDef;
  chainId?: string;
  chainStep?: number;
  /** For chain continuation the contract is created active. */
  originOverride?: StationStatic;
}

export function makeContract(g: Galaxy, state: GameState, origin: StationStatic, rng: Rng, opts: MakeOpts): Contract | null {
  const { kind, step } = opts;
  const mult = step?.rewardMult ?? 1;
  const jumps = step?.jumps ?? rng.int(1, 4);
  const types = step?.destTypes;
  const base: Omit<Contract, 'dest' | 'destSystem' | 'reward' | 'deadline'> = {
    id: nextId(state, 'k'),
    kind,
    origin: origin.id,
    deposit: 0,
    penalty: 0,
    state: 'offered',
    chainId: opts.chainId,
    chainStep: opts.chainStep,
  };
  const finalize = (c: Omit<Contract, 'deposit' | 'penalty'> & Partial<Contract>): Contract => {
    const reward = Math.round((c.reward * mult) / 5) * 5;
    return {
      ...base,
      ...c,
      reward,
      deposit: kind === 'freight' || kind === 'courier' || kind === 'passenger' ? Math.round((reward * 0.2) / 5) * 5 : 0,
      penalty: Math.round((reward * 0.3) / 5) * 5,
      title: opts.chainId ? `chain.${opts.chainId}.${opts.chainStep}.text` : undefined,
      progress: 0,
      deadline: c.deadline + (opts.chainId ? 4 : 0),
    } as Contract;
  };
  switch (kind) {
    case 'freight': {
      const d = pickDest(g, origin, rng, jumps, types);
      if (!d) return null;
      const good = step?.goodId
        ? GOODS_BY_ID[step.goodId]
        : rng.pick(MARKET_GOODS.filter((x) => !x.tags.includes('illegal') && !x.tags.includes('perishable') && (origin.role[x.id] ?? 0) >= 0 && x.basePrice < 400));
      const cells = rng.int(2, 7);
      const qty = step?.qty ?? cells * good.unitsPerCell;
      const len = pathLength(g, origin.systemId, d.station.systemId);
      const reward = (len * (9 + 6 * Math.ceil(qty / good.unitsPerCell)) + 60) * rng.range(0.9, 1.25);
      return finalize({ ...base, dest: d.station.id, destSystem: d.station.systemId, goodId: good.id, qty, reward, deadline: state.day + estDays(len, d.jumps) * rng.range(1.7, 2.8) });
    }
    case 'courier': {
      const d = pickDest(g, origin, rng, Math.max(jumps, 2), types);
      if (!d) return null;
      const len = pathLength(g, origin.systemId, d.station.systemId);
      const reward = len * 20 + 140 + rng.range(0, 80);
      return finalize({ ...base, dest: d.station.id, destSystem: d.station.systemId, goodId: 'data_core', qty: 1, reward, deadline: state.day + estDays(len, d.jumps) * rng.range(1.15, 1.6) });
    }
    case 'passenger': {
      const d = pickDest(g, origin, rng, jumps, types);
      if (!d) return null;
      const pax = step?.passengers ?? rng.int(1, 5);
      const comfort = step?.comfort ?? rng.int(1, 3);
      const len = pathLength(g, origin.systemId, d.station.systemId);
      const reward = pax * len * (7 + 4 * comfort) + 80;
      return finalize({ ...base, dest: d.station.id, destSystem: d.station.systemId, passengers: pax, comfort, reward, deadline: state.day + estDays(len, d.jumps) * rng.range(1.8, 3) });
    }
    case 'supply': {
      const d = pickDest(g, origin, rng, jumps, types);
      if (!d) return null;
      const dst = d.station;
      const wanted = MARKET_GOODS.filter((x) => (dst.role[x.id] ?? 0) < 0 && !x.tags.includes('illegal') && !x.tags.includes('perishable'));
      const good = step?.goodId ? GOODS_BY_ID[step.goodId] : rng.pick(wanted.length ? wanted : MARKET_GOODS.filter((x) => x.category === 'raw'));
      const qty = step?.qty ?? Math.max(good.unitsPerCell, Math.round((rng.int(2, 8) * good.unitsPerCell) / 2) * 2);
      const len = pathLength(g, origin.systemId, dst.systemId);
      const reward = qty * good.basePrice * rng.range(1.25, 1.55) + len * 12;
      return finalize({ ...base, dest: dst.id, destSystem: dst.systemId, goodId: good.id, qty, reward, deadline: state.day + estDays(len, d.jumps) * rng.range(2.2, 3.6) });
    }
    case 'survey': {
      const cands = stationsNear(g, origin.systemId, Math.max(jumps, 3)).map((n) => n.station.systemId).filter((s, i, a) => a.indexOf(s) === i && s !== origin.systemId);
      const unseen = cands.filter((s) => !state.visited.includes(s));
      const pool = unseen.length ? unseen : [...new Set(g.systems[origin.systemId].neighbors.flatMap((n) => [n, ...g.systems[n].neighbors]))].filter((s) => s !== origin.systemId && !state.visited.includes(s));
      if (!pool.length) return null;
      const sys = g.systems[rng.pick(pool)];
      const body = rng.chance(0.4) ? rng.pick(sys.bodies) : null;
      const len = pathLength(g, origin.systemId, sys.id);
      const reward = (body ? T.survey.body : T.survey.sys) + len * 22 + rng.range(0, 90);
      const jumpsEst = Math.max(1, Math.round(len / 4.5));
      return finalize({ ...base, dest: origin.id, destSystem: origin.systemId, targetSystem: sys.id, targetBody: body?.id, reward, deadline: state.day + estDays(len, jumpsEst) * rng.range(2, 3) * 2 });
    }
    case 'rescue': {
      const cands = [...new Set(stationsNear(g, origin.systemId, Math.max(jumps, 3)).map((n) => n.station.systemId))].filter((s) => s !== origin.systemId);
      if (!cands.length) return null;
      const sys = g.systems[rng.pick(cands)];
      const body = rng.pick(sys.bodies);
      const len = pathLength(g, origin.systemId, sys.id);
      const reward = 520 + len * 40 + rng.range(0, 160);
      const jumpsEst = Math.max(1, Math.round(len / 4.5));
      return finalize({ ...base, dest: origin.id, destSystem: origin.systemId, targetSystem: sys.id, targetBody: body.id, reward, deadline: state.day + estDays(len, jumpsEst) * rng.range(2.5, 3.5) * 2 });
    }
  }
}

const ALL_KINDS: ContractKind[] = ['freight', 'courier', 'passenger', 'survey', 'supply', 'rescue'];

export function boardEpoch(day: number): number {
  return Math.floor(day / 7);
}

/** (Re)generate the board of a station if the weekly epoch changed. Deterministic per (seed, station, epoch). */
export function refreshBoard(g: Galaxy, state: GameState, st: StationStatic): void {
  const dyn = state.stations[st.id];
  const epoch = boardEpoch(state.day);
  if (dyn.boardEpoch === epoch) return;
  const rng = Rng.fromSeed(`${state.seed}:board:${st.id}:${epoch}`);
  const def = STATION_TYPES_BY_ID[st.type];
  const n = (st.size === 'small' ? 3 : st.size === 'medium' ? 5 : 7) + rng.int(-1, 1);
  const board: Contract[] = [];
  for (let i = 0; i < n; i++) {
    const kind = rng.weighted(ALL_KINDS, (k) => (def.contractBias[k] ?? 0.6) * (k === 'rescue' ? 0.5 : 1));
    const c = makeContract(g, state, st, rng, { kind });
    if (c) board.push(c);
  }
  // occasional story chain
  for (const chain of CHAINS) {
    if (!chain.offeredAt.includes(st.type)) continue;
    if (state.flags[`chain:${chain.id}`] !== undefined) continue;
    if (!rng.chance(0.22)) continue;
    const c = makeContract(g, state, st, rng, { kind: chain.steps[0].kind, step: chain.steps[0], chainId: chain.id, chainStep: 0 });
    if (c) {
      board.unshift(c);
      break;
    }
  }
  dyn.board = board;
  dyn.boardEpoch = epoch;
}

/** Continue a story chain after a step is completed at `at`. Returns the new (active) contract or null when finished. */
export function advanceChain(g: Galaxy, state: GameState, done: Contract, at: StationStatic): Contract | null {
  if (!done.chainId) return null;
  const chain = CHAINS_BY_ID[done.chainId];
  const next = (done.chainStep ?? 0) + 1;
  if (next >= chain.steps.length) {
    state.flags[`chain:${chain.id}`] = 'done';
    return null;
  }
  const rng = Rng.fromSeed(`${state.seed}:chain:${chain.id}:${next}:${state.day | 0}`);
  const step = chain.steps[next];
  const c = makeContract(g, state, at, rng, { kind: step.kind, step, chainId: chain.id, chainStep: next });
  if (!c) {
    state.flags[`chain:${chain.id}`] = 'done';
    return null;
  }
  c.state = 'active';
  c.acceptedDay = state.day;
  c.deposit = 0;
  state.flags[`chain:${chain.id}`] = 'active';
  return c;
}

export function isChainFinal(c: Contract): boolean {
  if (!c.chainId) return false;
  return (c.chainStep ?? 0) + 1 >= CHAINS_BY_ID[c.chainId].steps.length;
}
