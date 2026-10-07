import { CHAINS_BY_ID } from '../content/chains';
import { addGoods, removeGoods, unitsOf, loadableUnits } from './cargo';
import { advanceChain, isChainFinal } from './contracts';
import { bedsUsedByCrew } from './crew';
import { analyze, fail, msg, newUid, ok, stationOf, type Result } from './state';
import { newModule } from './ship';
import { Rng } from './rng';
import { MODULES } from '../content/modules';
import type { Contract, Galaxy, GameState, Quality } from './types';

export const MAX_ACTIVE_CONTRACTS = 8;

export function activePassengers(state: GameState): number {
  return state.contracts
    .filter((c) => c.state === 'active' && c.kind === 'passenger')
    .reduce((s, c) => s + (c.passengers ?? 0), 0);
}

export function acceptContract(state: GameState, stationId: string, contractId: string): Result {
  const dyn = state.stations[stationId];
  if (!dyn || state.location.stationId !== stationId) return fail('err.notDocked');
  const c = dyn.board.find((x) => x.id === contractId);
  if (!c || c.deadline <= state.day) return fail('err.contractGone');
  if (state.contracts.filter((x) => x.state === 'active').length >= MAX_ACTIVE_CONTRACTS)
    return fail('err.tooManyContracts');
  const { stats, dims } = analyze(state);
  if (c.kind === 'passenger') {
    if (stats.beds - bedsUsedByCrew(state) < activePassengers(state) + (c.passengers ?? 0))
      return fail('err.noBeds');
    if (stats.comfort < (c.comfort ?? 1)) return fail('err.noComfort');
  }
  if ((c.kind === 'freight' || c.kind === 'courier') && c.goodId) {
    const quotas = { chilledCells: stats.chilledCells, secureCells: stats.secureCells };
    const can = loadableUnits(state.cargo, dims, quotas, c.goodId, c.qty ?? 1);
    if (can < (c.qty ?? 1)) return fail('err.noCargoSpace');
    addGoods(state.cargo, dims, quotas, c.goodId, c.qty ?? 1, 0, state.day, c.id);
  }
  dyn.board = dyn.board.filter((x) => x.id !== c.id);
  c.state = 'active';
  c.acceptedDay = state.day;
  state.credits += c.deposit;
  state.contracts.push(c);
  msg(state, 'msg.contractAccepted', { id: c.id }, 'info');
  return ok();
}

/** Whether a contract's delivery condition is met right now (at its destination). */
export function isDeliverable(state: GameState, c: Contract): boolean {
  switch (c.kind) {
    case 'freight':
    case 'courier':
      return !!c.goodId && unitsOf(state.cargo, c.goodId, c.id) >= (c.qty ?? 1);
    case 'supply':
      return !!c.goodId && unitsOf(state.cargo, c.goodId) >= (c.qty ?? 1);
    case 'passenger':
      return true;
    case 'survey':
      return (c.progress ?? 0) >= 1;
    case 'rescue':
      return (c.progress ?? 0) >= 2 && unitsOf(state.cargo, 'survivors', c.id) >= 1;
  }
}

export interface Completion {
  contract: Contract;
  payout: number;
  reward?: string;
}

/** Hand in everything deliverable at this station. Applies the bundle bonus for multiple deliveries. */
export function completeContractsAt(state: GameState, g: Galaxy, stationId: string): Completion[] {
  const ready = state.contracts.filter(
    (c) => c.state === 'active' && c.dest === stationId && isDeliverable(state, c),
  );
  if (!ready.length) return [];
  const bundle = Math.min(1.4, 1 + 0.08 * (ready.length - 1));
  const out: Completion[] = [];
  for (const c of ready) {
    if (c.kind === 'supply' && c.goodId) removeGoods(state.cargo, c.goodId, c.qty ?? 0);
    else if (c.kind === 'freight' || c.kind === 'courier' || c.kind === 'rescue') {
      state.cargo = state.cargo.filter((i) => i.contractId !== c.id);
    }
    const payout = Math.round((c.reward * bundle - c.deposit) / 5) * 5;
    state.credits += Math.max(0, payout);
    c.state = 'done';
    state.stats.contractsDone++;
    const st = stationOf(state, stationId);
    state.stations[st.id].rep += isChainFinal(c) ? 3 : 1;
    if (state.stations[c.origin]) state.stations[c.origin].rep += 1;
    msg(state, 'msg.contractDone', { id: c.id, reward: Math.round(c.reward * bundle) }, 'good');
    const comp: Completion = { contract: c, payout: Math.round(c.reward * bundle) };
    if (c.chainId) {
      const chain = CHAINS_BY_ID[c.chainId];
      const last = isChainFinal(c);
      if (last && chain.steps[c.chainStep ?? 0].finalModule) {
        const rng = Rng.fromSeed(`${state.seed}:chainreward:${c.id}`);
        const candidates = MODULES.filter((m) => !m.core && m.size !== 'L');
        const def = rng.pick(candidates);
        const q: Quality = 'A';
        state.inventory.push(newModule(def.id, q, newUid(state, 'm')));
        comp.reward = def.id;
        msg(state, 'msg.chainReward', { module: def.id }, 'good');
      }
      const nextC = advanceChain(g, state, c, st);
      if (nextC) {
        if ((nextC.kind === 'freight' || nextC.kind === 'courier') && nextC.goodId) {
          const an = analyze(state);
          const quotas = { chilledCells: an.stats.chilledCells, secureCells: an.stats.secureCells };
          addGoods(state.cargo, an.dims, quotas, nextC.goodId, nextC.qty ?? 1, 0, state.day, nextC.id);
        }
        state.contracts.push(nextC);
        msg(state, 'msg.chainNext', { chain: c.chainId }, 'info');
      }
    }
    out.push(comp);
  }
  state.contracts = state.contracts.filter((c) => c.state === 'active');
  return out;
}

function voidContractCargo(state: GameState, c: Contract): void {
  state.cargo = state.cargo.filter((i) => i.contractId !== c.id);
}

export function failContract(state: GameState, c: Contract, reasonKey: string): void {
  c.state = 'failed';
  voidContractCargo(state, c);
  const owed = c.deposit + c.penalty;
  state.credits = Math.max(0, state.credits - owed);
  state.stats.contractsFailed++;
  if (state.stations[c.origin]) state.stations[c.origin].rep -= 2;
  if (c.chainId) state.flags[`chain:${c.chainId}`] = 'failed';
  msg(state, reasonKey, { id: c.id, fee: owed }, 'bad');
}

export function failExpired(state: GameState, _g: Galaxy): void {
  let changed = false;
  for (const c of state.contracts) {
    if (c.state === 'active' && state.day > c.deadline) {
      failContract(state, c, 'msg.contractExpired');
      changed = true;
    }
  }
  if (changed) state.contracts = state.contracts.filter((c) => c.state === 'active');
}

export function abandonContract(state: GameState, contractId: string): Result {
  const c = state.contracts.find((x) => x.id === contractId && x.state === 'active');
  if (!c) return fail('err.contractGone');
  failContract(state, c, 'msg.contractAbandoned');
  state.contracts = state.contracts.filter((x) => x.state === 'active');
  return ok();
}
