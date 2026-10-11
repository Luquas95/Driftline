/**
 * Local player profile: achievements across runs, unlocked starts and the daily-challenge ranking.
 * Plain JSON, stored by the UI layer (`src/persist/profile.ts`); there is no server.
 */
import { STARTS } from '../content/starts';
import { ACHIEVEMENTS_BY_ID } from '../content/achievements';
import { dailyScore, isDateKey } from './daily';
import type { GameState } from './types';

export interface DailyResult {
  score: number;
  day: number;
  ending: string | null;
  /** Best score of the date. */
  best: number;
}

export interface Profile {
  v: 1;
  /** Achievement id -> { run seed, day }. */
  ach: Record<string, { seed: string; day: number }>;
  daily: Record<string, DailyResult>;
  runs: number;
}

export function emptyProfile(): Profile {
  return { v: 1, ach: {}, daily: {}, runs: 0 };
}

/** Parse stored JSON defensively. */
export function parseProfile(raw: unknown): Profile {
  const p = emptyProfile();
  if (!raw || typeof raw !== 'object') return p;
  const r = raw as Partial<Profile>;
  if (r.ach && typeof r.ach === 'object')
    for (const [id, v] of Object.entries(r.ach)) {
      if (!ACHIEVEMENTS_BY_ID[id] || !v || typeof v !== 'object') continue;
      p.ach[id] = {
        seed: String((v as { seed?: unknown }).seed ?? ''),
        day: Number((v as { day?: unknown }).day) || 0,
      };
    }
  if (r.daily && typeof r.daily === 'object')
    for (const [k, v] of Object.entries(r.daily)) {
      if (!isDateKey(k) || !v || typeof v !== 'object') continue;
      const d = v as Partial<DailyResult>;
      if (typeof d.score !== 'number' || !Number.isFinite(d.score)) continue;
      p.daily[k] = {
        score: d.score,
        day: Number(d.day) || 0,
        ending: typeof d.ending === 'string' ? d.ending : null,
        best: typeof d.best === 'number' ? d.best : d.score,
      };
    }
  p.runs = Number.isFinite(r.runs) ? Math.max(0, Math.floor(r.runs as number)) : 0;
  return p;
}

/** Copy this run's achievements into the profile. Returns the newly added ids. */
export function syncAchievements(profile: Profile, state: GameState): string[] {
  const added: string[] = [];
  for (const [id, day] of Object.entries(state.ach)) {
    if (profile.ach[id] || !ACHIEVEMENTS_BY_ID[id]) continue;
    profile.ach[id] = { seed: state.seed, day };
    added.push(id);
  }
  return added;
}

/** Record the score of a daily run (keeps the best of the date). */
export function recordDaily(profile: Profile, state: GameState): void {
  const date = state.run.daily;
  if (!date || !isDateKey(date)) return;
  const score = dailyScore(state);
  const prev = profile.daily[date];
  profile.daily[date] = {
    score,
    day: Math.floor(state.day),
    ending: state.ending?.id ?? null,
    best: Math.max(prev?.best ?? -Infinity, score),
  };
}

export function startUnlocked(profile: Profile, startId: string): boolean {
  const s = STARTS.find((x) => x.id === startId);
  if (!s) return false;
  return !s.unlock || !!profile.ach[s.unlock];
}

/** Local ranking: the best results of the daily challenges, best first. */
export function dailyRanking(
  profile: Profile,
  limit = 10,
): { date: string; best: number; ending: string | null }[] {
  return Object.entries(profile.daily)
    .map(([date, d]) => ({ date, best: d.best, ending: d.ending }))
    .sort((a, b) => b.best - a.best)
    .slice(0, limit);
}
