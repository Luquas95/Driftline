/**
 * Pure math for the system scene (camera, orbits, flight paths, tap detection). No Pixi, no DOM: unit-tested and
 * safe to share with other scenes. Everything here is presentation only; it never touches the game state.
 */

export interface Cam {
  /** Zoom factor on top of the base fit (1 = whole system). */
  zoom: number;
  /** Pan offset in screen pixels. */
  x: number;
  y: number;
}

export const ZOOM_MIN = 0.7;
export const ZOOM_MAX = 80;
/** Wall-clock seconds for a 1 AU orbit; other orbits follow Kepler's third law (period ∝ a^1.5). */
export const ORBIT_PERIOD_1AU = 240;

/** Angular speed (rad/s) of a planet at `aAU` astronomical units: inner planets are faster, outer ones crawl. */
export function planetSpeed(aAU: number): number {
  return (2 * Math.PI) / (ORBIT_PERIOD_1AU * Math.pow(Math.max(0.05, aAU), 1.5));
}

/** Angular speed of the n-th moon (n = 1, 2, 3 ...): the same law around the host, in a faster time scale. */
export function moonSpeed(n: number): number {
  return (2 * Math.PI) / (22 * Math.pow(Math.max(1, n), 1.5));
}

export interface V2 {
  x: number;
  y: number;
}

export function toScreen(cam: Cam, W: number, H: number, k0: number, wx: number, wy: number): V2 {
  const k = k0 * cam.zoom;
  return { x: W / 2 + cam.x + wx * k, y: H / 2 + cam.y + wy * k };
}

export function toWorld(cam: Cam, W: number, H: number, k0: number, sx: number, sy: number): V2 {
  const k = k0 * cam.zoom;
  return { x: (sx - W / 2 - cam.x) / k, y: (sy - H / 2 - cam.y) / k };
}

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

/** Zoom by `factor` keeping the world point under the screen position (sx, sy) fixed. */
export function zoomAt(
  cam: Cam,
  W: number,
  H: number,
  k0: number,
  sx: number,
  sy: number,
  factor: number,
): Cam {
  const zoom = clamp(cam.zoom * factor, ZOOM_MIN, ZOOM_MAX);
  const w = toWorld(cam, W, H, k0, sx, sy);
  const k = k0 * zoom;
  return { zoom, x: sx - W / 2 - w.x * k, y: sy - H / 2 - w.y * k };
}

/** Keep the centre of the view within the system (plus a margin), so the player cannot lose it. */
export function clampCam(cam: Cam, k0: number, extent = 380): Cam {
  const k = k0 * cam.zoom;
  const lim = extent * k;
  return {
    zoom: clamp(cam.zoom, ZOOM_MIN, ZOOM_MAX),
    x: clamp(cam.x, -lim, lim),
    y: clamp(cam.y, -lim, lim),
  };
}

/** Pan so that world point (wx, wy) is in the centre of the view. */
export function centreOn(cam: Cam, k0: number, wx: number, wy: number): Cam {
  const k = k0 * cam.zoom;
  return { zoom: cam.zoom, x: -wx * k, y: -wy * k };
}

export function easeInOut(t: number): number {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function bezier(p0: V2, c1: V2, c2: V2, p1: V2, t: number): V2 {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return { x: a * p0.x + b * c1.x + c * c2.x + d * p1.x, y: a * p0.y + b * c1.y + c * c2.y + d * p1.y };
}

/**
 * Control points of a flight from `from` (leaving along `heading`) to `to`: a gentle curve that starts in the
 * direction the ship already points and arrives roughly head-on.
 */
export function flightControls(from: V2, heading: number, to: V2): { c1: V2; c2: V2 } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.hypot(dx, dy) || 1;
  const k = d * 0.38;
  const c1 = { x: from.x + Math.cos(heading) * k, y: from.y + Math.sin(heading) * k };
  // arrive from the side the ship came from, bent a little to one side so the path is a curve, not a line
  const nx = -dy / d;
  const ny = dx / d;
  const c2 = { x: to.x - (dx / d) * k * 0.9 + nx * d * 0.12, y: to.y - (dy / d) * k * 0.9 + ny * d * 0.12 };
  return { c1, c2 };
}

/** Flight time in seconds: 1 to 3 s by distance, short when motion is reduced, zero when animations are off. */
export function flightDuration(dist: number, maxDist: number, level: 'full' | 'reduced' | 'off'): number {
  if (level === 'off') return 0;
  const base = 1 + 2 * clamp(dist / Math.max(1, maxDist), 0, 1);
  return level === 'reduced' ? Math.min(0.4, base * 0.25) : base;
}

/** Heading (radians) of the motion between two points. */
export function headingOf(a: V2, b: V2, fallback = 0): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.hypot(dx, dy) < 1e-6 ? fallback : Math.atan2(dy, dx);
}

export interface PointerSample {
  x: number;
  y: number;
  t: number;
}

/** A tap selects, a drag pans: movement below the slop and a short press is a tap. */
export function isTap(down: PointerSample, up: PointerSample, touch: boolean): boolean {
  const slop = touch ? 10 : 6;
  return Math.hypot(up.x - down.x, up.y - down.y) <= slop && up.t - down.t < 600;
}

export function isDoubleTap(prev: PointerSample | null, cur: PointerSample, touch: boolean): boolean {
  if (!prev) return false;
  return cur.t - prev.t < 380 && Math.hypot(cur.x - prev.x, cur.y - prev.y) < (touch ? 36 : 18);
}

/** Zoom that fits a body of world radius `r` into about `frac` of the shorter screen side. */
export function zoomToFit(r: number, k0: number, shortSide: number, frac = 0.55): number {
  return clamp((shortSide * frac * 0.5) / (Math.max(0.5, r) * k0), ZOOM_MIN, ZOOM_MAX);
}

/** Deterministic hash in [0, 1) for cosmetic traffic (never the game RNG). */
export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return ((h >>> 0) % 1000003) / 1000003;
}
