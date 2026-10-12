/**
 * The Grey ("Šeď"): a silent front that spreads from a few foci along the jump routes and turns systems into
 * dead zones. Deterministic from the galaxy seed. Slowed by research, artifacts, anchors and story decisions.
 */
import { dist } from './galaxy';
import { hashToUnit } from './rng';
import { Rng } from './rng';
import { galaxyOf, msg, withRng } from './state';
import { wearModule } from './ship';
import { T } from './tuning';
import type { Galaxy, GameState, SystemStatic } from './types';
import type { ThreatState } from './worldTypes';

export type GripLevel = 0 | 1 | 2 | 3 | 4;

/** 0 clean, 1 touched, 2 gripped, 3 dying, 4 consumed. */
export function gripLevel(grip: number): GripLevel {
  if (grip >= T.threat.consumeAt) return 4;
  if (grip >= 70) return 3;
  if (grip >= T.threat.spreadMin) return 2;
  if (grip >= 5) return 1;
  return 0;
}

function riskKey(risk: 'low' | 'normal' | 'high'): 'low' | 'normal' | 'high' {
  return risk;
}

/** Choose the foci far from the starting system and from each other (rim and outer systems). */
export function initThreat(
  g: Galaxy,
  seed: string,
  risk: 'low' | 'normal' | 'high',
  start: SystemStatic,
): ThreatState {
  const rng = Rng.fromSeed(`${seed}:threat:foci`);
  const want = T.threat.foci[riskKey(risk)];
  const far = g.systems.filter(
    (s) => (s.region === 'rim' || s.region === 'outer') && dist(s, start) > g.radius * 0.6,
  );
  const pool = far.length >= want ? far : g.systems.filter((s) => dist(s, start) > g.radius * 0.4);
  const foci: number[] = [];
  let guard = 0;
  while (foci.length < want && guard++ < 400 && pool.length) {
    const c = rng.pick(pool);
    if (foci.some((id) => dist(g.systems[id], c) < g.radius * 0.45) && guard < 300) continue;
    if (!foci.includes(c.id)) foci.push(c.id);
  }
  if (!foci.length) foci.push(g.systems[g.systems.length - 1].id);
  return {
    start: T.threat.startDay[riskKey(risk)],
    foci,
    grip: {},
    consumed: 0,
    mitigation: 0,
    stopped: false,
    lastTick: 0,
  };
}

export function gripOf(state: GameState, systemId: number): number {
  return state.threat.grip[systemId] ?? 0;
}

export function isConsumed(state: GameState, systemId: number): boolean {
  return gripOf(state, systemId) >= T.threat.consumeAt;
}

/** Share of the galaxy's systems that are consumed (0..1). */
export function consumedShare(state: GameState): number {
  return state.threat.consumed / Math.max(1, state.galaxySize);
}

/** Supply multiplier for a system's stations (the closer the Grey, the emptier the shelves). */
export function threatSupply(state: GameState, systemId: number): number {
  const g = gripOf(state, systemId);
  if (g <= 0) return 1;
  return Math.max(0.02, 1 - (g / 100) * 0.88);
}

/** Grip level of the worst neighbour: used for refugee jobs and danger. */
export function nearThreat(state: GameState, systemId: number): number {
  const g = galaxyOf(state);
  let m = gripOf(state, systemId);
  for (const n of g.systems[systemId].neighbors) m = Math.max(m, gripOf(state, n) * 0.7);
  return m;
}

/** Addition to the encounter chance at a system. */
export function threatDanger(state: GameState, systemId: number): number {
  const gr = gripOf(state, systemId);
  return gr >= 30 ? Math.min(0.35, (gr - 20) / 250) : 0;
}

/** Current spread speed factor (before the per-edge terms), for display and calibration. */
export function spreadSpeed(state: GameState, day: number): number {
  const th = state.threat;
  const rk = state.difficulty.risk;
  const t = Math.max(0, day - th.start);
  return (
    T.threat.rate[rk] *
    (1 + t / T.threat.growthDays[rk]) *
    (1 - Math.min(T.threat.mitigationCap, th.mitigation + 0.04 * (state.base?.buildings.anchor ?? 0)))
  );
}

/** One day of the spread. Called from the daily tick. */
export function threatDaily(state: GameState, day: number): void {
  const th = state.threat;
  if (state.ending && !state.ending.freePlay) return;
  if (th.stopped || (state.ending?.freePlay && state.ending.id !== 'dominion')) {
    // the front recedes
    let n = 0;
    for (const k of Object.keys(th.grip)) {
      const id = Number(k);
      th.grip[id] = Math.max(0, th.grip[id] - 1.2);
      if (th.grip[id] <= 0) delete th.grip[id];
      else if (th.grip[id] >= T.threat.consumeAt) n++;
    }
    th.consumed = n;
    th.lastTick = day;
    return;
  }
  if (day < th.start) return;
  const g = galaxyOf(state);
  const k = spreadSpeed(state, day);
  // the foci feed themselves
  for (const f of th.foci) th.grip[f] = Math.min(100, (th.grip[f] ?? 0) + k * 4);
  const add: Record<number, number> = {};
  for (const [idStr, gv] of Object.entries(th.grip)) {
    if (gv < T.threat.spreadMin) continue;
    const id = Number(idStr);
    const s = g.systems[id];
    for (const n of s.neighbors) {
      const d = dist(s, g.systems[n]);
      const jitter = 0.75 + 0.5 * hashToUnit(`${state.seed}:th:${id}:${n}:${day}`);
      add[n] = (add[n] ?? 0) + ((gv / 100) * k * 2.2 * jitter) / (1 + d / 12);
    }
  }
  for (const [idStr, v] of Object.entries(add)) {
    const id = Number(idStr);
    th.grip[id] = Math.min(100, (th.grip[id] ?? 0) + v);
  }
  let n = 0;
  for (const v of Object.values(th.grip)) if (v >= T.threat.consumeAt) n++;
  th.consumed = n;
  th.lastTick = day;
  threatMilestones(state, day);
}

/** How many days an unopposed spread needs to consume `share` of the galaxy (simulation, for calibration and tests). */
export function simulateSpread(
  state: GameState,
  share: number,
  maxDays = 900,
  keepMitigation = false,
): number {
  const copy = JSON.parse(JSON.stringify(state)) as GameState;
  if (!keepMitigation) copy.threat.mitigation = 0;
  copy.ending = null;
  for (let d = copy.threat.start; d <= maxDays; d++) {
    threatDaily(copy, d);
    if (consumedShare(copy) >= share) return d;
  }
  return Infinity;
}

/** Arriving in a dying system: the Grey eats at the electronics. */
export function greyArrival(state: GameState, systemId: number): void {
  if (gripOf(state, systemId) < 70) return;
  withRng(state, (rng) => {
    const idx = state.ship.slots.map((m, i) => (m ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) return;
    const i = rng.pick(idx);
    wearModule(state.ship, i, Math.round(rng.range(6, 16)));
  });
  msg(state, 'msg.greyArrival', undefined, 'warn');
}

/** Reactions of the world as the Grey advances (once per threshold). */
const MILESTONES = [0.05, 0.12, 0.25, 0.5, 0.7];

export function threatMilestones(state: GameState, day: number): void {
  const share = consumedShare(state);
  for (const m of MILESTONES) {
    const key = `thm:${m}`;
    if (share < m || state.flags[key]) continue;
    state.flags[key] = day;
    const g = galaxyOf(state);
    const gripped = g.systems.filter((s) => (state.threat.grip[s.id] ?? 0) >= 25);
    const sectors = [...new Set(gripped.map((s) => s.sector))];
    msg(state, `msg.threatStage.${MILESTONES.indexOf(m) + 1}`, undefined, 'warn');
    if (m === 0.05) {
      // quarantine: the neighbours close their borders around the affected sectors
      for (const sector of sectors)
        state.events.push({
          id: `grey-q${sector}-${day}`,
          kind: 'blockade',
          sector,
          start: day,
          end: day + 40,
          mods: { food: 0.35, medical: 0.4, industry: 0.55, tech: 0.55, raw: 0.6 },
        });
    }
    if (m === 0.12) {
      // cooperation: the wars stop
      for (const w of state.fac.wars) if (w.end > day) w.end = day;
    }
    if (m === 0.25) {
      for (const sector of sectors)
        state.events.push({
          id: `grey-p${sector}-${day}`,
          kind: 'panic',
          sector,
          start: day,
          end: day + 60,
          mods: { food: 0.3, medical: 0.3 },
        });
    }
    if (m === 0.5) state.flags['corsairRaids'] = 1;
  }
}
