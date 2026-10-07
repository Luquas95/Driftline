/** Deterministic PRNG (xoshiro128**) seeded from strings. Never use Math.random in core code. */

export type RngState = [number, number, number, number];

/** cyrb128-style string hash producing four 32-bit words. */
export function hashString(str: string): RngState {
  let h1 = 1779033703,
    h2 = 3144134277,
    h3 = 1013904242,
    h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

export function hashToUnit(str: string): number {
  return hashString(str)[0] / 4294967296;
}

export class Rng {
  private s: RngState;

  constructor(state: RngState) {
    this.s = [state[0] | 0, state[1] | 0, state[2] | 0, state[3] | 0];
    if (!(this.s[0] | this.s[1] | this.s[2] | this.s[3])) this.s[0] = 1;
    for (let i = 0; i < 8; i++) this.nextU32();
  }

  static fromSeed(seed: string): Rng {
    return new Rng(hashString(seed));
  }

  /** Restore an Rng from a saved state without re-warming it. */
  static restore(state: RngState): Rng {
    const r = new Rng([1, 2, 3, 4]);
    r.s = [...state] as RngState;
    return r;
  }

  getState(): RngState {
    return [...this.s] as RngState;
  }

  /** Independent child generator, derived without disturbing the parent beyond one draw. */
  fork(label: string): Rng {
    return Rng.fromSeed(`${this.nextU32()}:${label}`);
  }

  nextU32(): number {
    const s = this.s;
    const rotl = (x: number, k: number) => (x << k) | (x >>> (32 - k));
    const result = Math.imul(rotl(Math.imul(s[1], 5), 7), 9) >>> 0;
    const t = s[1] << 9;
    s[2] ^= s[0];
    s[3] ^= s[1];
    s[1] ^= s[2];
    s[0] ^= s[3];
    s[2] ^= t;
    s[3] = rotl(s[3], 11);
    return result;
  }

  /** Float in [0, 1). */
  next(): number {
    return this.nextU32() / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Approximate normal distribution (sum of uniforms). */
  gauss(mean = 0, sd = 1): number {
    let s = 0;
    for (let i = 0; i < 6; i++) s += this.next();
    return mean + (s - 3) * sd * Math.SQRT2;
  }

  weighted<T>(items: readonly T[], weight: (t: T) => number): T {
    let total = 0;
    for (const it of items) total += weight(it);
    let r = this.next() * total;
    for (const it of items) {
      r -= weight(it);
      if (r < 0) return it;
    }
    return items[items.length - 1];
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

/** Generates a short human-readable seed (used when the player does not enter one). */
export function randomSeedFrom(entropy: number): string {
  const r = Rng.fromSeed(`seed:${entropy}`);
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += abc[r.int(0, abc.length - 1)];
  return s;
}
