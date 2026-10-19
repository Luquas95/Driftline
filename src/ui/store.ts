import { signal, computed } from '@preact/signals';
import { newGame } from '../core/start';
import { analyze, galaxyOf, messagesSince, type NewGameOptions, type Result } from '../core/state';
import { SaveStore } from '../persist/store';
import { importSave, exportSave } from '../core/save';
import { t } from '../i18n';
import { FACTION_IDS } from '../core/worldTypes';
import { sfx } from '../audio/audio';
import { settings } from './settings';
import { loadProfile, saveProfile } from '../persist/profile';
import { recordDaily, syncAchievements, type Profile } from '../core/profile';
import type { GameState, Message } from '../core/types';

export type ScreenId =
  'map' | 'system' | 'station' | 'ship' | 'cargo' | 'crew' | 'factions' | 'base' | 'journal' | 'settings';

export const game = signal<GameState | null>(null);
/** Local profile: achievements across runs, unlocked starts, daily ranking. */
export const profile = signal<Profile>(loadProfile());
/** Bumped after every mutation; components read it to re-render (GameState is mutated in place). */
export const rev = signal(0);
export const screen = signal<ScreenId>('map');
export const selectedSystem = signal<number | null>(null);
export const selectedBody = signal<number | null>(null);
export const showHelp = signal(false);
export const menuOpen = signal(true);
export const busy = signal(false);

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'good' | 'bad' | 'warn';
}
export const toasts = signal<Toast[]>([]);
let toastId = 0;

export function toast(text: string, tone: Toast['tone'] = 'info', ms = 4200): void {
  const id = ++toastId;
  toasts.value = [...toasts.value.slice(-3), { id, text, tone }];
  setTimeout(() => {
    toasts.value = toasts.value.filter((x) => x.id !== id);
  }, ms);
}

export const saves = new SaveStore();
let saveTimer: number | undefined;
/** Last message already surfaced as a toast (an index would stall once the capped log is full). */
let lastMsg: Message | null = null;

export const analysis = computed(() => {
  void rev.value;
  const g = game.value;
  return g ? analyze(g) : null;
});

export const galaxy = computed(() => (game.value ? galaxyOf(game.value) : null));

/** Run a mutation of the game state, refresh the UI, surface new messages and schedule an autosave. */
export function act<T>(fn: (s: GameState) => T): T {
  const s = game.value!;
  const out = fn(s);
  afterMutation(s);
  return out;
}

export function afterMutation(s: GameState): void {
  rev.value++;
  for (const m of messagesSince(s.messages, lastMsg)) {
    if (m.tone !== 'info' || m.key.startsWith('msg.contract') || m.key.startsWith('msg.market')) {
      toast(describeMessage(m.key, m.params), m.tone);
    }
  }
  lastMsg = s.messages.at(-1) ?? null;
  syncProfile(s);
  scheduleAutosave(s);
  if (s.dead) {
    void saves.remove('autosave');
  }
}

/** Copy new achievements and the daily score into the profile (persisted). */
export function syncProfile(s: GameState): void {
  const p = profile.value;
  const added = syncAchievements(p, s);
  const before = s.run.daily ? JSON.stringify(p.daily[s.run.daily]) : '';
  recordDaily(p, s);
  const changed = added.length > 0 || (s.run.daily ? JSON.stringify(p.daily[s.run.daily]) !== before : false);
  if (changed) {
    profile.value = { ...p };
    saveProfile(p);
  }
}

/** Debounced autosave. Also used by the combat loop, which changes state outside `act`. */
export function scheduleAutosave(s: GameState, delay = 1500): void {
  clearTimeout(saveTimer);
  if (settings.value.autosave && !s.dead) {
    // re-check on fire: a death in the meantime deletes the autosave and must not write it back
    saveTimer = window.setTimeout(() => {
      if (!s.dead) void saves.put('autosave', s, t('save.autosave'));
    }, delay);
  }
}

/** Write the autosave right now (tab hidden or closing): the debounce timer would not survive. */
export function flushAutosave(): void {
  const s = game.value;
  if (!s || s.dead || !settings.value.autosave || menuOpen.value) return;
  clearTimeout(saveTimer);
  void saves.put('autosave', s, t('save.autosave'));
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushAutosave);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAutosave();
  });
}

export function describeMessage(key: string, params?: Record<string, string | number>): string {
  const p: Record<string, string | number> = { ...(params ?? {}) };
  if (typeof p.module === 'string')
    p.module =
      t(`mod.${String(p.module).replace(/_[sml]$/, '')}`) + ' ' + String(p.module).slice(-1).toUpperCase();
  if (typeof p.hull === 'string') p.hull = t(`hull.${p.hull}`);
  if (typeof p.good === 'string') p.good = t(`good.${p.good}`);
  // v4 ids: factions, ranks, tiers, buildings, technologies
  const fid = typeof p.faction === 'string' ? p.faction : null;
  for (const k of ['faction', 'a', 'b'] as const)
    if (typeof p[k] === 'string' && (FACTION_IDS as string[]).includes(p[k] as string))
      p[k] = t(`fac.${p[k]}`);
  if (typeof p.rank === 'number' && fid) p.rank = t(`fac.${fid}.rank.${p.rank}`);
  if (typeof p.tier === 'string') p.tier = t(`fac.tier.${p.tier}`);
  if (typeof p.building === 'string') p.building = t(`bld.${p.building}`);
  if (typeof p.tech === 'string') p.tech = t(`tech.${p.tech}`);
  if (typeof p.ach === 'string') p.ach = t(`ach.${p.ach}`);
  if (typeof p.ending === 'string') p.ending = t(`ending.${p.ending}`);
  return t(key, p);
}

/** Show a failed Result as an error toast; returns true if the action succeeded. */
export function report(r: Result<object>): boolean {
  if (r.ok) return true;
  sfx('error');
  toast(t(r.error, r.params), 'bad');
  return false;
}

/** Set after a jump: the next system view opens with the hyperspace arrival effect. */
export const arrivalFlag = { pending: false };

/** Set when the player leaves a station: the system scene shows the ship flying out. */
export const launchFlag = { pending: false };

/** Test hook: `?e2e=1&quick=1` skips the shipyard (set by e2eHooks, never by the game itself). */
export const e2eFlags = { quick: false };

export function startNewGame(opts: NewGameOptions): void {
  const s = newGame({ ...opts, quickStart: e2eFlags.quick, entropy: opts.entropy ?? Date.now() });
  game.value = s;
  lastMsg = s.messages.at(-1) ?? null;
  menuOpen.value = false;
  screen.value = 'station';
  selectedSystem.value = null;
  s.tutorial.done = !settings.value.tutorial || s.noShip;
  rev.value++;
  void saves.put('autosave', s, t('save.autosave'));
}

export function loadGame(s: GameState): void {
  if (s.combat) s.combat.paused = true;
  game.value = s;
  lastMsg = s.messages.at(-1) ?? null;
  menuOpen.value = false;
  screen.value = s.location.stationId ? 'station' : 'system';
  selectedSystem.value = null;
  rev.value++;
}

export async function loadSlot(id: string): Promise<boolean> {
  try {
    const s = await saves.get(id);
    if (!s) return false;
    loadGame(s);
    return true;
  } catch {
    toast(t('err.badSave'), 'bad');
    return false;
  }
}

export function importFromText(text: string): boolean {
  try {
    loadGame(importSave(text));
    return true;
  } catch {
    toast(t('err.badSave'), 'bad');
    return false;
  }
}

export function exportCurrent(): string | null {
  const s = game.value;
  if (!s) return null;
  return exportSave(s, new Date().toISOString());
}

export function go(id: ScreenId): void {
  if (screen.value === id) return;
  screen.value = id;
  sfx('click');
}

/** Mark progress flags used by the tutorial. */
export function flag(key: string): void {
  const s = game.value;
  if (s && !s.flags[key]) {
    s.flags[key] = 1;
    rev.value++;
  }
}
