/** Central tuning constants. Documented in docs/DESIGN.md. */
export const T = {
  /** Capital of a new game by difficulty (prices setting): the first ship is bought from it. */
  startCapital: { easy: 60000, normal: 40000, hard: 25000 },
  /** Credits of the quick start used by tests and bots that skip the shipyard. */
  quickStartCredits: 2500,
  startHull: 'wayfarer',
  galaxySystems: 300,
  galaxyRadius: 80,
  /** price = base * (ref/stock)^elasticity, clamped. */
  priceElasticity: 0.5,
  priceMin: 0.35,
  priceMax: 3.2,
  /** Station margin: station sells at +x, buys at -x. */
  spread: 0.06,
  tariff: 0.07,
  revertRate: 0.05,
  capBase: 3600,
  capSize: { small: 0.4, medium: 1, large: 2.4 },
  /** Fuel: units per ly per ton of ship mass at jump efficiency 1. */
  fuelK: 0.0105,
  fuelPrice: 8,
  suppliesPrice: 6,
  probePrice: 55,
  /** Probes the ship can carry. */
  probeCap: 20,
  missilePrice: 26,
  /** Sublight: days per AU at mass/thrust = 1 */
  sublightK: 0.08,
  jumpOverhead: 0.35,
  dockDays: 0.25,
  repairHullPrice: 12,
  repairModuleFactor: 0.25,
  supplyPerCrewDay: 0.35,
  insuranceRate: 0.0015,
  insuranceLapseDays: 6,
  overloadRow: 1,
  overloadRisk: 0.05,
  baseAccident: 0.008,
  inspectionBase: 0.22,
  fineMult: 1.6,
  survey: { sys: 380, body: 160 },
  firstDiscoveryBonus: 1.8,
  /** v2: encounter chance per jump before modifiers. */
  encounter: { base: 0.055 },
  /** v4: the spreading threat. `rate` is calibrated so an unopposed spread consumes 80 % of the galaxy in about 530 / 475 / 350 days (low / normal / high). */
  threat: {
    startDay: { low: 40, normal: 28, high: 18 },
    foci: { low: 1, normal: 2, high: 3 },
    rate: { low: 0.9, normal: 0.66, high: 0.68 },
    /** The rate grows with time: x(1 + t / growthDays). */
    growthDays: { low: 260, normal: 200, high: 160 },
    spreadMin: 28,
    consumeAt: 100,
    mitigationCap: 0.85,
  },
};

export function priceFactor(difficulty: 'easy' | 'normal' | 'hard'): number {
  return difficulty === 'easy' ? 0.85 : difficulty === 'hard' ? 1.2 : 1;
}
export function riskFactor(risk: 'low' | 'normal' | 'high'): number {
  return risk === 'low' ? 0.55 : risk === 'high' ? 1.6 : 1;
}
