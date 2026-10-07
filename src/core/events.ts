import { EVENTS, EVENTS_BY_ID } from '../content/events';
import { GOODS_BY_ID } from '../content/goods';
import { MODULES } from '../content/modules';
import { addGoods, removeGoods } from './cargo';
import type { Cond, Effect, EventDef, EventTrigger } from './eventTypes';
import { spawnEncounter } from './combat/encounter';
import { crewCapacity, crewHasOfficer, gainXp, makeCrew } from './crew';
import { dist } from './galaxy';
import type { Rng } from './rng';
import { newModule, slotsOfKind, wearModule } from './ship';
import {
  analyze,
  damageHull,
  destroyShip,
  fail,
  galaxyOf,
  learnStation,
  msg,
  newUid,
  ok,
  updateSeen,
  withRng,
  type Result,
} from './state';
import { passTime } from './time';
import type { GameState, Quality } from './types';

export interface EventContext {
  systemId: number;
  bodyId?: string;
  anomalyId?: string;
}

type ExtCond = (state: GameState, args: Record<string, unknown> | undefined) => boolean;
type ExtEffect = (state: GameState, args: Record<string, unknown> | undefined) => void;

/** Extension registries: v2 (crew) and v3 (factions, threat) register their own conditions and effects here. */
export const extConditions: Record<string, ExtCond> = {};
export const extEffects: Record<string, ExtEffect> = {
  sellAllPremium: (state, args) => {
    const pct = Number(args?.pct ?? 0);
    let total = 0;
    for (const it of state.cargo) {
      if (it.contractId) continue;
      total += (it.cost > 0 ? it.cost : it.qty * GOODS_BY_ID[it.goodId].basePrice * 0.6) * (1 + pct);
    }
    state.cargo = state.cargo.filter((c) => c.contractId);
    state.credits += Math.round(total);
  },
};

export function evalCond(state: GameState, c: Cond): boolean {
  const g = galaxyOf(state);
  const sys = g.systems[state.location.systemId];
  switch (c.t) {
    case 'region':
      return c.in.includes(sys.region);
    case 'cargoTag':
      return state.cargo.some((i) => GOODS_BY_ID[i.goodId].tags.includes(c.tag) && !i.contractId);
    case 'hasModule':
      return state.ship.slots.some(
        (m) => m && m.enabled && m.condition > 0 && m.defId.startsWith(c.kind + '_'),
      );
    case 'creditsMin':
      return state.credits >= c.n;
    case 'creditsMax':
      return state.credits <= c.n;
    case 'fuelBelow':
      return state.ship.fuel / Math.max(1, analyze(state).stats.fuelCap) < c.frac;
    case 'hullBelow':
      return state.ship.hp / Math.max(1, analyze(state).stats.hpMax) < c.frac;
    case 'repMin':
      return (state.stations[state.home]?.rep ?? 0) >= c.n;
    case 'repMax':
      return (state.stations[state.home]?.rep ?? 0) <= c.n;
    case 'flag':
      return c.value === undefined ? !!state.flags[c.key] : state.flags[c.key] === c.value;
    case 'dangerMin':
      return sys.danger >= c.n;
    case 'cargoValueMin':
      return state.cargo.reduce((s, i) => s + i.qty * GOODS_BY_ID[i.goodId].basePrice, 0) >= c.n;
    case 'dayMin':
      return state.day >= c.n;
    case 'crewRole':
      return state.crew.some((m) => m.role === c.role);
    case 'crewRace':
      return state.crew.some((m) => m.race === c.race);
    case 'crewSkill':
      return state.crew.some((m) => m.skills[c.skill] >= c.min);
    case 'crewMoraleBelow':
      return state.crew.some((m) => m.morale < c.n);
    case 'officer':
      return crewHasOfficer(state, c.id);
    case 'not':
      return !evalCond(state, c.c);
    case 'ext':
      return extConditions[c.key]?.(state, c.args) ?? false;
  }
}

export function eligibleEvents(state: GameState, trigger: EventTrigger): EventDef[] {
  return EVENTS.filter((e) => e.trigger === trigger && e.conditions.every((c) => evalCond(state, c)));
}

/** Roll for an event of the given trigger; sets `pendingEvent` on success. */
export function rollEvent(
  state: GameState,
  trigger: EventTrigger,
  chance: number,
  ctx: EventContext,
  forceId?: string,
): boolean {
  if (state.pendingEvent) return false;
  return withRng(state, (rng) => {
    if (forceId) {
      state.pendingEvent = { eventId: forceId, context: ctx };
      return true;
    }
    if (!rng.chance(chance)) return false;
    const recent = String(state.flags['evlast'] ?? '').split(',');
    let pool = eligibleEvents(state, trigger).filter((e) => !recent.includes(e.id));
    if (!pool.length) pool = eligibleEvents(state, trigger);
    if (!pool.length) return false;
    const ev = rng.weighted(pool, (e) => e.weight);
    state.flags['evlast'] = [ev.id, ...recent].slice(0, 4).join(',');
    state.pendingEvent = { eventId: ev.id, context: ctx };
    return true;
  });
}

export function choiceAvailable(state: GameState, ev: EventDef, idx: number): boolean {
  const c = ev.choices[idx];
  return !!c && (c.requires ?? []).every((x) => evalCond(state, x));
}

export interface EventOutcomeResult {
  textKey: string;
  eventId: string;
  summary: Effect[];
}

export function resolveEvent(state: GameState, choiceIdx: number): Result<{ outcome: EventOutcomeResult }> {
  const pe = state.pendingEvent;
  if (!pe) return fail('err.noEvent');
  const ev = EVENTS_BY_ID[pe.eventId];
  if (!ev || !choiceAvailable(state, ev, choiceIdx)) return fail('err.choiceUnavailable');
  const choice = ev.choices[choiceIdx];
  const outcome = withRng(state, (rng) => rng.weighted(choice.outcomes, (o) => o.weight));
  state.pendingEvent = null;
  for (const e of outcome.effects) {
    if (state.dead) break;
    applyEffect(state, e, pe.context);
  }
  if (!state.dead) updateSeen(state);
  return ok({ outcome: { textKey: outcome.textKey, eventId: ev.id, summary: outcome.effects } });
}

function randomInstalled(state: GameState, rng: Rng, kind?: string): number | null {
  const idx: number[] = [];
  state.ship.slots.forEach((m, i) => {
    if (m && (!kind || m.defId.startsWith(kind + '_'))) idx.push(i);
  });
  return idx.length ? rng.pick(idx) : null;
}

export function applyEffect(state: GameState, e: Effect, ctx?: EventContext): void {
  const { stats, dims } = analyze(state);
  const g = galaxyOf(state);
  switch (e.t) {
    case 'credits':
      state.credits = Math.max(0, state.credits + e.n);
      break;
    case 'creditsPct':
      state.credits = Math.max(0, Math.round(state.credits * (1 + e.pct)));
      break;
    case 'fuel':
      state.ship.fuel = Math.max(0, Math.min(stats.fuelCap, state.ship.fuel + e.n));
      break;
    case 'supplies':
      state.ship.supplies = Math.max(0, Math.min(stats.suppliesCap, state.ship.supplies + e.n));
      break;
    case 'hull':
      if (e.n >= 0) state.ship.hp = Math.min(stats.hpMax, state.ship.hp + e.n);
      else {
        state.stats.accidents++;
        damageHull(state, -e.n);
      }
      break;
    case 'wear':
      withRng(state, (rng) => {
        if (e.n > 0) {
          const slots = e.kind ? slotsOfKind(state.ship, e.kind) : [];
          const idx = e.kind ? (slots.length ? rng.pick(slots) : null) : randomInstalled(state, rng);
          if (idx !== null) wearModule(state.ship, idx, e.n);
        } else {
          const worn = state.ship.slots
            .map((m, i) => ({ m, i }))
            .filter((x) => x.m && x.m.condition < 100 && (!e.kind || x.m.defId.startsWith(e.kind + '_')));
          if (worn.length) {
            const w = rng.pick(worn);
            w.m!.condition = Math.min(100, w.m!.condition - e.n);
          }
        }
      });
      break;
    case 'goods':
      if (e.qty > 0) {
        const quotas = { chilledCells: stats.chilledCells, secureCells: stats.secureCells };
        addGoods(state.cargo, dims, quotas, e.goodId, e.qty, 0, state.day);
      } else removeGoods(state.cargo, e.goodId, -e.qty);
      break;
    case 'loseCargo':
      for (const it of state.cargo) {
        if (it.contractId) continue;
        const lost = Math.floor(it.qty * e.frac);
        it.cost *= 1 - lost / Math.max(1, it.qty);
        it.qty -= lost;
      }
      state.cargo = state.cargo.filter((i) => i.qty > 0);
      break;
    case 'module':
      withRng(state, (rng) => {
        const pool = MODULES.filter((m) => !m.core && m.size !== 'L' && (!e.kind || m.kind === e.kind));
        const def = rng.pick(pool);
        state.inventory.push(newModule(def.id, e.quality ?? ('C' as Quality), newUid(state, 'm')));
        msg(state, 'msg.foundModule', { module: def.id }, 'good');
      });
      break;
    case 'reveal': {
      const here = g.systems[state.location.systemId];
      for (const s of g.systems) {
        if (dist(here, s) <= e.radius) {
          if (!state.seen.includes(s.id)) state.seen.push(s.id);
          for (const st of s.stations) learnStation(state, st);
        }
      }
      break;
    }
    case 'days':
      if (e.n > 0) passTime(state, e.n);
      else state.day = Math.max(state.lastEconDay, state.day + e.n);
      break;
    case 'rep':
      if (state.stations[state.home]) state.stations[state.home].rep += e.n;
      break;
    case 'flag':
      state.flags[e.key] = e.value;
      break;
    case 'probes':
      state.ship.probes += e.n;
      break;
    case 'discover': {
      const sys = g.systems[ctx?.systemId ?? state.location.systemId];
      const id = ctx?.anomalyId ?? `event:${state.discoveries.length}:${sys.id}`;
      state.discoveries.push({
        id,
        name: sys.name,
        day: state.day,
        value: Math.round(e.value * 1),
        sold: false,
      });
      state.stats.discoveries++;
      break;
    }
    case 'crewHurt': {
      const targets = e.all
        ? state.crew
        : state.crew.length
          ? [state.crew[withRng(state, (r) => r.int(0, state.crew.length - 1))]]
          : [];
      for (const m of targets) m.hp = Math.max(1, m.hp - e.n);
      break;
    }
    case 'crewXp': {
      const best = [...state.crew].sort((a, b) => b.skills[e.skill] - a.skills[e.skill])[0];
      if (best) gainXp(best, e.skill, e.n);
      break;
    }
    case 'crewMorale':
      for (const m of state.crew) m.morale = Math.max(0, Math.min(100, m.morale + e.n));
      break;
    case 'crewLeave': {
      const pool = state.crew.filter((m) => !m.officer && (!e.role || m.role === e.role));
      if (pool.length && state.crew.length > 1) {
        const m = pool[withRng(state, (r) => r.int(0, pool.length - 1))];
        state.crew = state.crew.filter((x) => x !== m);
        msg(state, 'msg.crewLeft', { name: m.name }, 'bad');
      }
      break;
    }
    case 'crewJoin': {
      if (state.crew.length >= crewCapacity(state) + 3) break;
      const c = withRng(state, (rng) =>
        makeCrew(rng, newUid(state, 'w'), { role: e.role, race: e.race, level: e.level, day: state.day }),
      );
      state.crew.push(c);
      msg(state, 'msg.hired', { name: c.name }, 'good');
      break;
    }
    case 'fight':
      spawnEncounter(state, e.enemy, e.tier);
      break;
    case 'death':
      destroyShip(state);
      break;
    case 'ext':
      extEffects[e.key]?.(state, e.args);
      break;
  }
}
