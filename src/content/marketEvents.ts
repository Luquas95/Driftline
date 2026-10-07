export interface MarketEventDef {
  kind: string;
  /** Multipliers on target stock: good id or category. <1 = demand surge / shortage (prices up), >1 = glut (prices down). */
  mods: Record<string, number>;
  minDays: number;
  maxDays: number;
  weight: number;
}

export const MARKET_EVENTS: MarketEventDef[] = [
  { kind: 'epidemic', mods: { medical: 0.18, food: 0.8 }, minDays: 14, maxDays: 30, weight: 3 },
  { kind: 'crop_failure', mods: { food: 0.25, fresh_produce: 0.15 }, minDays: 15, maxDays: 35, weight: 3 },
  {
    kind: 'mining_boom',
    mods: { raw: 1.6, machinery: 0.35, spare_parts: 0.4, fusion_cells: 0.5 },
    minDays: 18,
    maxDays: 40,
    weight: 3,
  },
  { kind: 'strike', mods: { industry: 0.3, tech: 0.55 }, minDays: 10, maxDays: 22, weight: 3 },
  {
    kind: 'blockade',
    mods: { food: 0.35, medical: 0.4, industry: 0.55, tech: 0.55, raw: 0.6 },
    minDays: 8,
    maxDays: 18,
    weight: 2,
  },
  {
    kind: 'festival',
    mods: { luxury: 0.35, spirits: 0.3, textiles: 0.45 },
    minDays: 8,
    maxDays: 16,
    weight: 2,
  },
  {
    kind: 'tech_boom',
    mods: { computers: 0.4, robotics: 0.4, electronics: 0.5 },
    minDays: 14,
    maxDays: 28,
    weight: 2,
  },
  { kind: 'crackdown', mods: { illegal: 0.45 }, minDays: 10, maxDays: 20, weight: 1 },
];
