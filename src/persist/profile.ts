/** Browser storage for the cross-run profile (achievements, unlocked starts, daily scores) from core/profile.ts. */
import { emptyProfile, parseProfile, type Profile } from '../core/profile';

const KEY = 'driftline.profile.v1';

/** The profile lives in localStorage; every access may throw (private windows, blocked storage). */
export function loadProfile(): Profile {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? parseProfile(JSON.parse(raw)) : emptyProfile();
  } catch {
    return emptyProfile();
  }
}

/** Persist the profile; failures are swallowed since losing it never breaks a run. */
export function saveProfile(p: Profile): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore: the profile is a convenience */
  }
}
