import { signal, effect } from '@preact/signals';

export interface Settings {
  master: number;
  ambient: number;
  sfx: number;
  muted: boolean;
  motion: 'auto' | 'reduced' | 'full';
  contrast: 'normal' | 'high';
  tutorial: boolean;
  autosave: boolean;
  /** v3: how much the world moves: full, reduced (short, simple) or off (no animation at all). */
  animations: 'full' | 'reduced' | 'off';
  /** v2: screen shake in combat (also off with reduced motion). */
  shake: boolean;
  /** v2: weak enemies are fought by the AI automatically. */
  autoCombat: boolean;
  /** v2: pause the fight on every selection (on by default for touch screens). */
  pauseOnSelect: boolean;
}

function coarse(): boolean {
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

const DEFAULTS: Settings = {
  master: 0.6,
  ambient: 0.5,
  sfx: 0.7,
  muted: false,
  motion: 'auto',
  contrast: 'normal',
  tutorial: true,
  autosave: true,
  animations: 'full',
  shake: true,
  autoCombat: false,
  pauseOnSelect: coarse(),
};
const KEY = 'driftline.settings';

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* storage unavailable */
  }
  return { ...DEFAULTS };
}

export const settings = signal<Settings>(load());

export function updateSettings(patch: Partial<Settings>): void {
  settings.value = { ...settings.value, ...patch };
}

export type AnimLevel = 'full' | 'reduced' | 'off';

/** The effective animation level: the setting, lowered by the accessibility (reduced motion) preference. */
export function animLevel(): AnimLevel {
  const a = settings.value.animations;
  if (a === 'off') return 'off';
  if (a === 'reduced' || prefersReducedMotion()) return 'reduced';
  return 'full';
}

export function prefersReducedMotion(): boolean {
  const s = settings.value.motion;
  if (s === 'reduced') return true;
  if (s === 'full') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

effect(() => {
  const s = settings.value;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.contrast = s.contrast;
    document.documentElement.dataset.motion = prefersReducedMotion() ? 'reduced' : 'full';
  }
});
