import type { ChainDef } from '../src/content/chains';
import { EVENTS } from '../src/content/events';
import { foundBase } from '../src/core/base';
import { ownerOf } from '../src/core/factions';
import { makeContract } from '../src/core/contracts';
import { Rng } from '../src/core/rng';
import { newGame } from '../src/core/start';
import { galaxyOf, stationOf, type Result } from '../src/core/state';
import type { Contract, GameState } from '../src/core/types';
import type { Base } from '../src/core/worldTypes';

export function mk(seed = 'T1', size = 120, extra: Parameters<typeof newGame>[0] = {}): GameState {
  return newGame({ seed, galaxySize: size, quickStart: true, ...extra });
}

/** The two cargo items that founding a base needs (construction 40 + machinery 12), placed in the hold. */
export function stockFoundingMaterials(s: GameState): void {
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
}

/**
 * Captain goes to a free system with at least 3 bodies, all of them detected, stocks the founding
 * materials and founds a base there. Returns the result of foundBase.
 */
export function foundBaseNearby(s: GameState, name: string): Result {
  const g = galaxyOf(s);
  const sys = g.systems.find((x) => ownerOf(s, x.id) === null && x.bodies.length >= 3)!;
  s.location = { systemId: sys.id, stationId: null, body: -1 };
  s.detected[sys.id] = sys.bodies.map((b) => b.id);
  stockFoundingMaterials(s);
  return foundBase(s, 0, name);
}

/** A base with the default (empty) state; `buildings`, `name` and any other field can be overridden. */
export function makeBase(
  s: GameState,
  o: { name: string; buildings: Base['buildings'] } & Partial<Base>,
): void {
  const { name, buildings, ...overrides } = o;
  s.base = {
    systemId: 0,
    bodyIndex: 0,
    kind: 'station',
    name,
    founded: 0,
    buildings,
    queue: [],
    storage: {},
    treasury: 0,
    lines: [],
    orders: [],
    autoSell: {},
    hangar: [],
    attack: null,
    log: [],
    lastTick: 0,
    stats: { produced: 0, sold: 0, fleetIncome: 0, upkeep: 0, attacks: 0, repelled: 0 },
    ...overrides,
  };
}

/** Every i18n key an event uses: titles, texts, choice texts and outcome texts. */
export function eventTextKeys(): string[] {
  const keys: string[] = [];
  for (const e of EVENTS) {
    keys.push(e.titleKey, e.textKey);
    for (const c of e.choices) {
      keys.push(c.textKey);
      for (const o of c.outcomes) keys.push(o.textKey);
    }
  }
  return keys;
}

/** The first step of a story chain, made into a contract the way the board does it. */
export function firstChainContract(s: GameState, chain: ChainDef): Contract | null {
  const g = galaxyOf(s);
  const st = stationOf(s, s.location.stationId!);
  return makeContract(g, s, st, Rng.fromSeed('c0'), {
    kind: chain.steps[0].kind,
    step: chain.steps[0],
    chainId: chain.id,
    chainStep: 0,
  });
}
