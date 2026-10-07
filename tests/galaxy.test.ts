import { describe, expect, it } from 'vitest';
import { generateGalaxy, findStartSystem, shortestPath, getGalaxy, dist } from '../src/core/galaxy';

describe('galaxy generator', () => {
  const g = generateGalaxy('SEED-A', 300);

  it('is deterministic for the same seed', () => {
    const g2 = generateGalaxy('SEED-A', 300);
    expect(JSON.stringify(g2.systems.slice(0, 40))).toBe(JSON.stringify(g.systems.slice(0, 40)));
    expect(Object.keys(g2.stationsById).length).toBe(Object.keys(g.stationsById).length);
  });

  it('differs for other seeds', () => {
    const g3 = generateGalaxy('SEED-B', 300);
    expect(g3.systems[5].name === g.systems[5].name && g3.systems[5].x === g.systems[5].x).toBe(false);
  });

  it('has 300 systems and a connected route graph', () => {
    expect(g.systems.length).toBe(300);
    const seen = new Set([0]);
    const q = [0];
    while (q.length) {
      const s = q.pop()!;
      for (const n of g.systems[s].neighbors) if (!seen.has(n)) (seen.add(n), q.push(n));
    }
    expect(seen.size).toBe(300);
    // graph, not complete: average degree is small
    const avg = g.systems.reduce((s, x) => s + x.neighbors.length, 0) / 300;
    expect(avg).toBeGreaterThan(2);
    expect(avg).toBeLessThan(7);
    // symmetric
    for (const s of g.systems) for (const n of s.neighbors) expect(g.systems[n].neighbors).toContain(s.id);
  });

  it('respects body and station count limits', () => {
    for (const s of g.systems) {
      expect(s.bodies.length).toBeGreaterThanOrEqual(1);
      expect(s.bodies.length).toBeLessThanOrEqual(8);
      expect(s.stations.length).toBeLessThanOrEqual(3);
    }
    const withStation = g.systems.filter((s) => s.stations.length > 0).length;
    expect(withStation).toBeGreaterThan(120);
  });

  it('has region characters: core richer than rim', () => {
    const avg = (r: string, f: (s: (typeof g.systems)[0]) => number) => {
      const xs = g.systems.filter((s) => s.region === r);
      return xs.reduce((a, s) => a + f(s), 0) / xs.length;
    };
    expect(avg('core', (s) => s.richness)).toBeGreaterThan(avg('rim', (s) => s.richness));
    expect(avg('core', (s) => s.danger)).toBeGreaterThan(avg('rim', (s) => s.danger));
  });

  it('station roles reference only traded goods; illegal goods only on black markets', () => {
    for (const st of Object.values(g.stationsById)) {
      for (const k of Object.keys(st.role)) expect(st.goods).toContain(k);
      if (!st.blackMarket) expect(st.goods.some((x) => ['narcotics', 'contraband_arms', 'stolen_data'].includes(x))).toBe(false);
    }
  });

  it('offers a start system and finds paths', () => {
    const start = findStartSystem(g.systems)!;
    expect(start).toBeDefined();
    const p = shortestPath(g, start.id, 250)!;
    expect(p[0]).toBe(start.id);
    expect(p[p.length - 1]).toBe(250);
    expect(shortestPath(g, 3, 3)).toEqual([3]);
    expect(dist(g.systems[0], g.systems[1])).toBeGreaterThan(0);
  });

  it('caches galaxies', () => {
    expect(getGalaxy('CACHE', 80)).toBe(getGalaxy('CACHE', 80));
  });
});
