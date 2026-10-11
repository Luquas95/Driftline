import { HULLS } from '../content/hulls';
import { HULLS_BY_ID } from '../content/hulls';
import { defaultCrew } from './crew';
import { Rng } from './rng';
import { buildStarterShip, computeShipStats } from './ship';
import { fail, msg, newUid, ok, type Result } from './state';
import { priceFactor } from './tuning';
import type { GameState, Ship } from './types';

/** One ship the player can buy at the start of a new game. */
export interface ShipOffer {
  /** Stable id: `<hullId>:new` or `<hullId>:used`. */
  id: string;
  hullId: string;
  used: boolean;
  price: number;
  /** Condition of the installed modules in percent (100 for a new ship). */
  condition: number;
  /** Hull integrity as a fraction of the maximum. */
  hullFrac: number;
}

/** Credits that should stay in the pocket for the first cargo: below this the preview warns. */
export const TIGHT_BUDGET = 1500;

const roundPrice = (n: number) => Math.round(n / 10) * 10;

/**
 * The first-ship offers, deterministic from the seed and sorted from the cheapest to the most expensive.
 * Every hull has a new offer (except the used-only budget shuttle); many also have a cheaper, worn used one.
 */
export function firstShipOffers(state: Pick<GameState, 'seed' | 'difficulty'>): ShipOffer[] {
  const rng = Rng.fromSeed(`${state.seed}:firstships`);
  const k = priceFactor(state.difficulty.prices);
  const out: ShipOffer[] = [];
  for (const h of HULLS) {
    const base = h.price * k;
    const usedChance = h.id === 'shuttle' ? 1 : h.tier >= 3 ? 0.35 : 0.6;
    const isUsed = rng.chance(usedChance);
    const cond = Math.round(rng.range(48, 82));
    const frac = Math.round(rng.range(0.62, 0.92) * 100) / 100;
    const disc = rng.range(0.5, 0.72);
    if (h.id !== 'shuttle')
      out.push({
        id: `${h.id}:new`,
        hullId: h.id,
        used: false,
        price: roundPrice(base),
        condition: 100,
        hullFrac: 1,
      });
    if (isUsed)
      out.push({
        id: `${h.id}:used`,
        hullId: h.id,
        used: true,
        price: roundPrice(base * disc * (0.5 + cond / 200)),
        condition: cond,
        hullFrac: frac,
      });
  }
  return out.sort((a, b) => a.price - b.price || a.id.localeCompare(b.id));
}

export interface ShipPreview {
  /** Credits left after the purchase. */
  left: number;
  affordable: boolean;
  /** `tight` when little is left for the first cargo, `none` when nothing. */
  warning: 'none' | 'tight' | 'broke';
  cargoCells: number;
  fuelCap: number;
}

export function previewOffer(state: Pick<GameState, 'credits'>, offer: ShipOffer): ShipPreview {
  const left = state.credits - offer.price;
  const ship = buildOfferShip(offer, 'x', () => 'p');
  const st = computeShipStats(ship);
  return {
    left,
    affordable: left >= 0,
    warning: left < 0 ? 'broke' : left < TIGHT_BUDGET ? 'tight' : 'none',
    cargoCells: st.cargoCells,
    fuelCap: st.fuelCap,
  };
}

/** The ship an offer delivers: basic core modules, worn (lower condition and hull) when used. */
export function buildOfferShip(offer: ShipOffer, name: string, nextUid: () => string): Ship {
  const ship = buildStarterShip(offer.hullId, name, nextUid);
  if (!offer.used) return ship;
  for (let i = 0; i < ship.slots.length; i++) {
    const m = ship.slots[i];
    if (!m) continue;
    ship.slots[i] = { ...m, condition: offer.condition };
  }
  ship.hp = Math.max(1, Math.round(HULLS_BY_ID[offer.hullId].hp * offer.hullFrac));
  return ship;
}

const NAME_A = [
  'Poutník',
  'Svítání',
  'Bouřlivák',
  'Kometa',
  'Naděje',
  'Stopař',
  'Plamínek',
  'Vlaštovka',
  'Mlha',
  'Hvězdný pes',
];
const NAME_B = ['II', 'Nova', 'Rudá', 'Tichá', 'Malá', 'Věrná', 'Letec', 'Zelená', 'Daleká', 'Šťastná'];

/** A ship name suggestion, deterministic from the seed. */
export function suggestShipName(seed: string, hullId: string): string {
  const rng = Rng.fromSeed(`${seed}:shipname:${hullId}`);
  return `${rng.pick(NAME_A)} ${rng.pick(NAME_B)}`;
}

/** Buy the first ship of a new game. Only valid while `noShip` is set. */
export function buyFirstShip(state: GameState, offerId: string, name: string): Result<{ price: number }> {
  if (!state.noShip) return fail('err.hasShip');
  const offer = firstShipOffers(state).find((o) => o.id === offerId);
  if (!offer) return fail('err.itemGone');
  if (state.credits < offer.price) return fail('err.noCredits');
  const clean = name.trim().slice(0, 28) || suggestShipName(state.seed, offer.hullId);
  state.ship = buildOfferShip(offer, clean, () => newUid(state, 'm'));
  state.credits -= offer.price;
  state.crew = defaultCrew(state.seed, offer.hullId, 0, () => newUid(state, 'w'));
  state.noShip = false;
  state.tutorial = { step: 0, done: false };
  msg(state, 'msg.firstShip', { ship: clean }, 'good');
  return ok({ price: offer.price });
}
