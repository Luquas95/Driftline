import { describe, expect, it } from 'vitest';
import { Rng, hashString, randomSeedFrom } from '../src/core/rng';

describe('rng', () => {
  it('is deterministic for a seed', () => {
    const a = Rng.fromSeed('abc');
    const b = Rng.fromSeed('abc');
    for (let i = 0; i < 50; i++) expect(a.next()).toBe(b.next());
  });
  it('differs between seeds', () => {
    expect(Rng.fromSeed('abc').next()).not.toBe(Rng.fromSeed('abd').next());
  });
  it('restores state exactly', () => {
    const a = Rng.fromSeed('x');
    a.next();
    const st = a.getState();
    const b = Rng.restore(st);
    for (let i = 0; i < 20; i++) expect(b.next()).toBe(a.next());
  });
  it('produces values in range', () => {
    const r = Rng.fromSeed('range');
    for (let i = 0; i < 500; i++) {
      const n = r.int(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
      const f = r.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });
  it('weighted picks follow weights and shuffle keeps elements', () => {
    const r = Rng.fromSeed('w');
    let a = 0;
    for (let i = 0; i < 2000; i++) if (r.weighted(['a', 'b'], (x) => (x === 'a' ? 9 : 1)) === 'a') a++;
    expect(a).toBeGreaterThan(1650);
    const arr = [1, 2, 3, 4, 5, 6];
    expect([...r.shuffle([...arr])].sort()).toEqual(arr);
    expect(r.pick(arr)).toBeTypeOf('number');
    expect(r.range(2, 3)).toBeGreaterThanOrEqual(2);
    expect(typeof r.gauss(0, 1)).toBe('number');
    expect(r.fork('x').next()).toBeTypeOf('number');
    expect(r.chance(1)).toBe(true);
  });
  it('hashes strings and creates readable seeds', () => {
    expect(hashString('a')).toHaveLength(4);
    expect(randomSeedFrom(5)).toMatch(/^[A-Z2-9]{6}$/);
    expect(randomSeedFrom(5)).toBe(randomSeedFrom(5));
  });
});
