import type { Quality, Size } from '../core/types';

export const SIZE_MULT: Record<Size, { value: number; power: number; mass: number; price: number }> = {
  S: { value: 1, power: 1, mass: 1, price: 1 },
  M: { value: 2.2, power: 2.2, mass: 2.4, price: 2.6 },
  L: { value: 4.8, power: 4.8, mass: 5.5, price: 6.5 },
};

/** Quality class multipliers. `value` scales the primary stat, `power` the draw (lower is better). */
export const QUALITY: Record<
  Quality,
  { value: number; power: number; mass: number; price: number; wear: number }
> = {
  E: { value: 0.7, power: 1.15, mass: 1.1, price: 0.45, wear: 1.3 },
  D: { value: 0.85, power: 1.07, mass: 1.05, price: 0.7, wear: 1.15 },
  C: { value: 1, power: 1, mass: 1, price: 1, wear: 1 },
  B: { value: 1.2, power: 0.93, mass: 0.97, price: 1.8, wear: 0.85 },
  A: { value: 1.45, power: 0.86, mass: 0.94, price: 3.2, wear: 0.7 },
};
