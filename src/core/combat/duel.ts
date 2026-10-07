import type { Role } from '../../content/crew';
import { MODULES_BY_ID } from '../../content/modules';
import { Rng } from '../rng';
import { makeCrew } from '../crew';
import { buildStarterShip, hullSlots, moduleFits, newModule } from '../ship';
import type { Quality } from '../types';
import { buildCombatShip, crewToCombat, placeCrew } from './build';
import { chooseRoom } from './ai';
import type { CShip, CombatState, Personality } from './types';

/** A ship configuration for headless duels (balance simulation and tests). */
export interface DuelSide {
  hullId: string;
  /** Module definition ids, placed into the first free slots that fit them. */
  modules: string[];
  quality?: Quality;
  /** Crew roles and their main skill level. */
  crew?: Role[];
  skill?: number;
  personality?: Personality;
  missiles?: number;
  /** Hull hit points multiplier (difficulty, enemy tier). */
  hullMult?: number;
}

export function buildDuelShip(side: DuelSide, sideName: 'player' | 'enemy', index: number, rng: Rng): CShip {
  let n = 0;
  const ship = buildStarterShip(side.hullId, `${sideName}${index}`, () => `d${sideName[0]}${index}-${++n}`);
  const q = side.quality ?? 'C';
  for (const m of ship.slots) if (m) m.quality = q;
  for (const id of side.modules) {
    const def = MODULES_BY_ID[id];
    const slot = hullSlots(side.hullId).find((sl) => !ship.slots[sl.index] && moduleFits(sl, def));
    if (slot) ship.slots[slot.index] = newModule(id, q, `d${sideName[0]}${index}-${++n}`);
  }
  if (side.hullMult) ship.hp = Math.round(ship.hp * side.hullMult);
  const roles = side.crew ?? ['pilot', 'engineer', 'gunner', 'medic'];
  const level = side.skill ?? 3;
  const crew = roles.map((role, i) =>
    crewToCombat(
      makeCrew(rng, `${sideName[0]}${index}c${i}`, { role, level, day: 0 }),
      sideName === 'player' ? i : -1,
      0,
    ),
  );
  const cs = buildCombatShip({
    side: sideName,
    index,
    name: `${sideName}${index}`,
    ship,
    crew,
    personality: side.personality ?? 'aggressive',
    missiles: side.missiles ?? 0,
    lootId: '',
  });
  placeCrew(cs);
  return cs;
}

/** Builds a fight between a player-side ship and one to three enemy ships, ready for `autoResolve`. */
export function makeDuel(seed: string, a: DuelSide, enemies: DuelSide[]): CombatState {
  const rng = Rng.fromSeed(`${seed}:duel`);
  const player = buildDuelShip(a, 'player', 0, rng);
  const foes = enemies.map((e, i) => buildDuelShip(e, 'enemy', i, rng));
  const c: CombatState = {
    v: 1,
    seed,
    rng: rng.fork('combat').getState(),
    time: 0,
    nextId: 1,
    paused: false,
    auto: false,
    player,
    enemies: foes,
    projectiles: [],
    events: [],
    log: [],
    outcome: null,
    kind: 'pirate',
    enemyDefs: foes.map(() => ''),
    demand: null,
    difficultyRisk: 1,
    tier: 2,
    systemId: 0,
  };
  const r2 = Rng.fromSeed(`${seed}:t`);
  for (const w of player.weapons)
    if (w.kind !== 'drones' && w.kind !== 'teleporter')
      w.target = { ship: 0, room: chooseRoom(r2, w.kind, foes[0]) };
  return c;
}
