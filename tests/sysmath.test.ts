import { describe, expect, it } from 'vitest';
import {
  ZOOM_MAX,
  ZOOM_MIN,
  bezier,
  centreOn,
  clampCam,
  easeInOut,
  flightControls,
  flightDuration,
  hash01,
  isDoubleTap,
  isTap,
  moonSpeed,
  planetSpeed,
  toScreen,
  toWorld,
  zoomAt,
  zoomToFit,
  type Cam,
} from '../src/render/sysmath';

const W = 800;
const H = 600;
const k0 = 1.2;

describe('orbits follow Kepler: inner planets are faster, with period ∝ a^1.5', () => {
  it('speed ratio equals the 3/2 power law', () => {
    expect(planetSpeed(0.5) / planetSpeed(2)).toBeCloseTo(Math.pow(4, 1.5), 6);
    expect(planetSpeed(1)).toBeGreaterThan(planetSpeed(5));
    expect(planetSpeed(30)).toBeLessThan(planetSpeed(1) / 100);
  });
  it('moons slow down with distance from the host', () => {
    expect(moonSpeed(1)).toBeGreaterThan(moonSpeed(2));
    expect(moonSpeed(2) / moonSpeed(3)).toBeCloseTo(Math.pow(1.5, 1.5), 6);
  });
});

describe('camera', () => {
  const cam: Cam = { zoom: 1, x: 0, y: 0 };
  it('converts between screen and world and back', () => {
    const c: Cam = { zoom: 3.2, x: 40, y: -25 };
    const s = toScreen(c, W, H, k0, 12.5, -7);
    const w = toWorld(c, W, H, k0, s.x, s.y);
    expect(w.x).toBeCloseTo(12.5, 9);
    expect(w.y).toBeCloseTo(-7, 9);
  });
  it('zooms around the cursor: the world point under it stays put', () => {
    const sx = 620;
    const sy = 180;
    const before = toWorld(cam, W, H, k0, sx, sy);
    const z = zoomAt(cam, W, H, k0, sx, sy, 2.5);
    const after = toWorld(z, W, H, k0, sx, sy);
    expect(z.zoom).toBeCloseTo(2.5, 9);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });
  it('keeps zoom within limits and the view near the system', () => {
    expect(zoomAt(cam, W, H, k0, 0, 0, 1e6).zoom).toBe(ZOOM_MAX);
    expect(zoomAt(cam, W, H, k0, 0, 0, 1e-6).zoom).toBe(ZOOM_MIN);
    const far = clampCam({ zoom: 4, x: 1e6, y: -1e6 }, k0);
    expect(Math.abs(far.x)).toBeLessThan(1e4);
  });
  it('a click after zooming picks the body drawn under the pointer', () => {
    const bodies = [
      { id: 0, x: 0, y: 0, r: 20 },
      { id: 1, x: 120, y: 30, r: 8 },
    ];
    const c = zoomAt(cam, W, H, k0, 500, 330, 6);
    // the screen position of body 1 after the zoom selects body 1 (not body 0)
    const p = toScreen(c, W, H, k0, bodies[1].x, bodies[1].y);
    const hit = bodies
      .map((b) => ({
        b,
        d:
          Math.hypot(toScreen(c, W, H, k0, b.x, b.y).x - p.x, toScreen(c, W, H, k0, b.x, b.y).y - p.y) -
          b.r * k0 * c.zoom,
      }))
      .sort((a, b) => a.d - b.d)[0];
    expect(hit.b.id).toBe(1);
  });
  it('centres on a point', () => {
    const c = centreOn({ zoom: 5, x: 3, y: 4 }, k0, 10, -20);
    const s = toScreen(c, W, H, k0, 10, -20);
    expect(s.x).toBeCloseTo(W / 2, 9);
    expect(s.y).toBeCloseTo(H / 2, 9);
  });
  it('fits a body into the screen', () => {
    const z = zoomToFit(10, k0, 600, 0.5);
    expect(z * k0 * 10).toBeCloseTo(150, 6);
    expect(zoomToFit(0.001, k0, 600)).toBe(ZOOM_MAX);
  });
});

describe('flight path', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 200, y: 60 };
  it('starts and ends exactly at the endpoints and bends away from the straight line', () => {
    const { c1, c2 } = flightControls(a, 0.2, b);
    expect(bezier(a, c1, c2, b, 0)).toEqual(a);
    const e = bezier(a, c1, c2, b, 1);
    expect(e.x).toBeCloseTo(b.x, 9);
    expect(e.y).toBeCloseTo(b.y, 9);
    const m = bezier(a, c1, c2, b, 0.5);
    const lineY = 0.5 * b.y;
    expect(Math.abs(m.y - lineY)).toBeGreaterThan(1);
  });
  it('eases in and out: slow at the ends, fast in the middle', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.1)).toBeLessThan(0.1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 9);
    expect(easeInOut(0.9)).toBeGreaterThan(0.9);
  });
  it('lasts 1 to 3 s by distance, shorter when reduced and instant when off', () => {
    expect(flightDuration(1, 300, 'full')).toBeGreaterThanOrEqual(1);
    expect(flightDuration(300, 300, 'full')).toBeLessThanOrEqual(3);
    expect(flightDuration(150, 300, 'full')).toBeGreaterThan(flightDuration(30, 300, 'full'));
    expect(flightDuration(300, 300, 'reduced')).toBeLessThanOrEqual(0.4);
    expect(flightDuration(300, 300, 'off')).toBe(0);
  });
});

describe('tap versus drag', () => {
  const down = { x: 100, y: 100, t: 0 };
  it('a small movement is a tap, a longer one a drag', () => {
    expect(isTap(down, { x: 103, y: 102, t: 120 }, false)).toBe(true);
    expect(isTap(down, { x: 140, y: 100, t: 120 }, false)).toBe(false);
    expect(isTap(down, { x: 108, y: 100, t: 120 }, true)).toBe(true);
    expect(isTap(down, { x: 108, y: 100, t: 120 }, false)).toBe(false);
    expect(isTap(down, { x: 100, y: 100, t: 900 }, false)).toBe(false);
  });
  it('two close taps in a short time are a double tap', () => {
    expect(isDoubleTap(down, { x: 105, y: 101, t: 250 }, false)).toBe(true);
    expect(isDoubleTap(down, { x: 105, y: 101, t: 700 }, false)).toBe(false);
    expect(isDoubleTap(down, { x: 200, y: 101, t: 250 }, false)).toBe(false);
    expect(isDoubleTap(null, down, false)).toBe(false);
  });
});

describe('cosmetic hash', () => {
  it('is deterministic and spread over [0, 1)', () => {
    expect(hash01('a')).toBe(hash01('a'));
    expect(hash01('a')).not.toBe(hash01('b'));
    for (const s of ['x', 'y', 'zz', '123']) {
      const h = hash01(s);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
    }
  });
});
