/** Applying a starting option to a new game. */
import { MODULES_BY_ID } from '../content/modules';
import { STARTS_BY_ID } from '../content/starts';
import { defaultCrew } from './crew';
import { addResearchPoints } from './research';
import { learnWords } from './lang';
import { buildStarterShip, computeShipStats, hullSlots, moduleFits, newModule } from './ship';
import { msg, newUid } from './state';
import type { GameState } from './types';
import { FACTION_IDS } from './worldTypes';

/** Gives the player the ship, purse and past of a start option. No-op for `standard` and unknown ids. */
export function applyStart(state: GameState, startId: string): void {
  const def = STARTS_BY_ID[startId];
  state.run.start = def ? def.id : 'standard';
  if (!def || !def.hull) return;
  const ship = buildStarterShip(def.hull, state.ship.name, () => newUid(state, 'm'));
  const slots = hullSlots(def.hull);
  for (const id of def.modules ?? []) {
    const md = MODULES_BY_ID[id];
    const i = slots.findIndex((sl) => !ship.slots[sl.index] && moduleFits(sl, md));
    if (i >= 0) ship.slots[i] = newModule(id, 'C', newUid(state, 'm'));
  }
  const st = computeShipStats(ship);
  ship.fuel = st.fuelCap;
  ship.supplies = def.supplies ? Math.min(st.suppliesCap, def.supplies) : st.suppliesCap * 0.6;
  state.ship = ship;
  state.crew = defaultCrew(state.seed, def.hull, 0, () => newUid(state, 'w'));
  state.noShip = false;
  if (def.credits !== undefined) state.credits = def.credits;
  for (const f of FACTION_IDS)
    if (def.rep?.[f]) state.fac.rep[f] = Math.max(-100, Math.min(100, def.rep[f]!));
  if (def.research) addResearchPoints(state, def.research);
  if (def.words) learnWords(state, def.words);
  msg(state, `msg.start.${def.id}`, undefined, 'info');
}
