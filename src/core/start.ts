import { HULLS_BY_ID } from '../content/hulls';
import { STATION_TYPES_BY_ID } from '../content/stations';
import { refreshBoard } from './contracts';
import { createStationDyn } from './economy';
import { findStartSystem, getGalaxy } from './galaxy';
import { Rng, randomSeedFrom } from './rng';
import { buildStarterShip, newModule } from './ship';
import { refreshShop } from './shop';
import { DEFAULT_DIFFICULTY, arrive, learnStation, msg, newUid, type NewGameOptions } from './state';
import { SAVE_VERSION, type Difficulty, type GameState } from './types';
import { T } from './tuning';

export function newGame(opts: NewGameOptions = {}): GameState {
  const seed = (opts.seed ?? '').trim() || randomSeedFrom(opts.entropy ?? 1);
  const galaxySize = opts.galaxySize ?? T.galaxySystems;
  const difficulty: Difficulty = { ...DEFAULT_DIFFICULTY, ...opts.difficulty };
  const g = getGalaxy(seed, galaxySize);
  const startSys = findStartSystem(g.systems) ?? g.systems[0];
  const startSt =
    [...startSys.stations].filter((s) => s.type !== 'pirate').sort((a, b) => STATION_TYPES_BY_ID[b.type].shipyard - STATION_TYPES_BY_ID[a.type].shipyard)[0] ?? startSys.stations[0];

  const state: GameState = {
    v: SAVE_VERSION,
    seed,
    galaxySize,
    difficulty,
    day: 0,
    rng: Rng.fromSeed(`${seed}:play`).getState(),
    credits: T.startCredits,
    ship: null as never,
    cargo: [],
    location: { systemId: startSys.id, stationId: startSt.id, body: startSt.bodyIndex },
    inventory: [],
    visited: [startSys.id],
    seen: [],
    detected: {},
    prices: {},
    stations: {},
    bodies: {},
    events: [],
    contracts: [],
    messages: [],
    notes: {},
    discoveries: [],
    stats: { jumps: 0, tradesProfit: 0, contractsDone: 0, contractsFailed: 0, discoveries: 0, deaths: 0, unitsMined: 0, daysPlayed: 0, accidents: 0, fines: 0 },
    insurance: { active: difficulty.insurance, full: false, due: 0, lapsedSince: null },
    home: startSt.id,
    flags: {},
    pendingEvent: null,
    uidCounter: 0,
    lastEconDay: 0,
    dead: false,
    tutorial: { step: 0, done: false },
    hints: [],
  };
  state.ship = buildStarterShip(T.startHull, opts.shipName ?? 'Poutník', () => newUid(state, 'm'));
  // starter loadout: a cargo pod in the first free medium slot
  const hull = HULLS_BY_ID[state.ship.hullId];
  void hull;
  const mIdx = starterSlot(state, 'M');
  if (mIdx >= 0) state.ship.slots[mIdx] = newModule('cargo_m', 'C', newUid(state, 'm'));

  for (const sys of g.systems) {
    for (const st of sys.stations) {
      state.stations[st.id] = createStationDyn(st, Rng.fromSeed(`${seed}:stock:${st.id}`));
    }
  }
  arrive(state, startSys.id);
  state.location = { systemId: startSys.id, stationId: startSt.id, body: startSt.bodyIndex };
  refreshBoard(g, state, startSt);
  refreshShop(state, startSt);
  learnStation(state, startSt);
  msg(state, 'msg.welcome', { station: startSt.name }, 'info');
  return state;
}

function starterSlot(state: GameState, size: 'S' | 'M' | 'L'): number {
  const hull = HULLS_BY_ID[state.ship.hullId];
  let idx = -1;
  let i = 0;
  for (const row of hull.layout) {
    for (const tok of row) {
      if (tok === '.') continue;
      if (tok === size && idx < 0) idx = i;
      i++;
    }
  }
  return idx;
}

