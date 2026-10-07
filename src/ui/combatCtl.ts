import { signal } from '@preact/signals';
import { autoResolve, chooseEncounterOption } from '../core/combat/encounter';
import { resolveCombat, type CombatSummary } from '../core/combat/resolve';
import { DT, drainEvents, stepCombat } from '../core/combat/sim';
import type { CombatEvent, EncounterOption } from '../core/combat/types';
import { sfx } from '../audio/audio';
import { t } from '../i18n';
import { settings } from './settings';
import { act, game, report, rev, scheduleAutosave, toast } from './store';

/** Bumped ~10 times per second while a fight runs so the HUD re-renders. */
export const combatRev = signal(0);
export const selWeapon = signal<string | null>(null);
export const selCrew = signal<string | null>(null);
export const combatSpeed = signal(1);
export const combatSummary = signal<CombatSummary | null>(null);

let acc = 0;
let uiAcc = 0;
let outcomeSeen = false;
let lastSaveSlot = 0;

export function resetCombatUi(): void {
  selWeapon.value = null;
  selCrew.value = null;
  combatSpeed.value = 1;
  acc = 0;
  uiAcc = 0;
  outcomeSeen = false;
}

function sounds(events: CombatEvent[]): void {
  let fired = 0;
  let hit = 0;
  for (const e of events) {
    if (e.t === 'fire' && fired++ < 2) sfx(e.side === 'player' ? 'laser' : 'laserFar');
    else if (e.t === 'hit' && hit++ < 2) sfx(e.shield ? 'shield' : 'impact');
    else if (e.t === 'explode') sfx('boom');
    else if (e.t === 'breach' || e.t === 'overheat') sfx('alert');
  }
}

/** Finish the fight: apply the outcome to the game state and show the result screen. */
export function finishCombat(): void {
  const s = game.value;
  if (!s?.combat) return;
  const c = s.combat;
  const summary = act((st) => resolveCombat(st, c));
  combatSummary.value = summary;
  resetCombatUi();
  sfx(summary.outcome === 'defeat' ? 'error' : 'success');
}

/** Called every frame by the combat scene. Steps the simulation at a fixed rate and returns the visual events. */
export function driveCombat(dt: number): CombatEvent[] {
  try {
    return driveCombatInner(dt);
  } catch (err) {
    // a broken fight must never freeze the render loop: abandon it and keep the game playable
    console.error('combat aborted', err);
    const s = game.value;
    if (s) {
      s.combat = null;
      s.encounter = null;
      resetCombatUi();
      toast(t('combat.error'), 'bad');
      rev.value++;
    }
    return [];
  }
}

function driveCombatInner(dt: number): CombatEvent[] {
  const s = game.value;
  const c = s?.combat;
  if (!c) return [];
  if (c.outcome) {
    // let the last explosion play for a moment, then close the fight
    if (!outcomeSeen) {
      outcomeSeen = true;
      uiAcc = 0;
      combatRev.value++;
    }
    uiAcc += dt;
    if (uiAcc > 1.4) {
      uiAcc = 0;
      finishCombat();
    }
    return drainEvents(c);
  }
  const out: CombatEvent[] = [];
  if (!c.paused) {
    acc += Math.min(dt, 0.25) * combatSpeed.value;
    let n = 0;
    while (acc >= DT && n < 10 && !c.outcome && !c.paused) {
      stepCombat(c, DT);
      acc -= DT;
      n++;
      out.push(...drainEvents(c));
    }
    if (n >= 10) acc = 0;
    if (out.length) sounds(out);
  }
  uiAcc += dt;
  if (out.length || (!c.paused && uiAcc > 0.1)) {
    if (!c.outcome) uiAcc = 0;
    combatRev.value++;
  }
  // keep a mid-fight autosave (the fight state mutates outside `act`)
  if (Math.floor(c.time / 5) !== lastSaveSlot) {
    lastSaveSlot = Math.floor(c.time / 5);
    scheduleAutosave(s!, 200);
  }
  return out;
}

export function pauseForSelection(): void {
  const c = game.value?.combat;
  if (c && settings.value.pauseOnSelect && !c.paused) {
    c.paused = true;
    combatRev.value++;
  }
}

export function togglePause(): void {
  const c = game.value?.combat;
  if (!c || c.outcome) return;
  if (c.demand !== null) return;
  c.paused = !c.paused;
  combatRev.value++;
  scheduleAutosave(game.value!, 200);
}

/** Choose an option in the encounter dialogue. Starts a fight, or resolves it without one. */
export function pickEncounterOption(option: EncounterOption['id']): void {
  const s = game.value;
  if (!s?.encounter) return;
  const enc = s.encounter;
  const r = act((st) => chooseEncounterOption(st, option));
  if (!report(r) || !r.ok) return;
  resetCombatUi();
  const weak = enc.tier <= 1 && enc.enemyDefs.length === 1;
  if (r.fight && s.combat && settings.value.autoCombat && weak && option === 'fight') {
    autoResolve(s.combat);
    toast(t('combat.autoDone'), 'info');
    finishCombat();
    return;
  }
  if (!r.fight) toast(t(r.text), 'info');
}
