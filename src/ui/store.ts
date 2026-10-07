import { signal, computed } from '@preact/signals';
import { newGame } from '../core/start';
import { analyze, galaxyOf, type NewGameOptions, type Result } from '../core/state';
import { SaveStore } from '../persist/store';
import { importSave, exportSave } from '../core/save';
import { t } from '../i18n';
import { sfx } from '../audio/audio';
import { settings } from './settings';
import type { GameState } from '../core/types';

export type ScreenId = 'map' | 'system' | 'station' | 'ship' | 'cargo' | 'crew' | 'journal' | 'settings';

export const game = signal<GameState | null>(null);
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
let msgSeen = 0;

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
  for (let i = msgSeen; i < s.messages.length; i++) {
    const m = s.messages[i];
    if (m.tone !== 'info' || m.key.startsWith('msg.contract') || m.key.startsWith('msg.market')) {
      toast(describeMessage(m.key, m.params), m.tone);
    }
  }
  msgSeen = s.messages.length;
  if (settings.value.autosave && !s.dead) {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => void saves.put('autosave', s, t('save.autosave')), 1500);
  }
  if (s.dead) {
    void saves.remove('autosave');
  }
}

export function describeMessage(key: string, params?: Record<string, string | number>): string {
  const p: Record<string, string | number> = { ...(params ?? {}) };
  if (typeof p.module === 'string')
    p.module =
      t(`mod.${String(p.module).replace(/_[sml]$/, '')}`) + ' ' + String(p.module).slice(-1).toUpperCase();
  if (typeof p.hull === 'string') p.hull = t(`hull.${p.hull}`);
  if (typeof p.good === 'string') p.good = t(`good.${p.good}`);
  return t(key, p);
}

/** Show a failed Result as an error toast; returns true if the action succeeded. */
export function report(r: Result<object>): boolean {
  if (r.ok) return true;
  sfx('error');
  toast(t(r.error, r.params), 'bad');
  return false;
}

export function startNewGame(opts: NewGameOptions): void {
  const s = newGame({ ...opts, entropy: opts.entropy ?? Date.now() });
  game.value = s;
  msgSeen = s.messages.length;
  menuOpen.value = false;
  screen.value = 'station';
  selectedSystem.value = null;
  s.tutorial.done = !settings.value.tutorial;
  rev.value++;
  void saves.put('autosave', s, t('save.autosave'));
}

export function loadGame(s: GameState): void {
  game.value = s;
  msgSeen = s.messages.length;
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
