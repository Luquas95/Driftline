import type { ContractKind, StationTypeId } from '../core/types';

export interface ChainStepDef {
  kind: ContractKind;
  /** Destination preference: station types (first match wins), searched within `jumps`. */
  destTypes: StationTypeId[];
  jumps: number;
  goodId?: string;
  qty?: number;
  passengers?: number;
  comfort?: number;
  rewardMult: number;
  /** Optional reward on the last step. */
  finalModule?: boolean;
}

export interface ChainDef {
  id: string;
  /** Stations of these types offer the chain. */
  offeredAt: StationTypeId[];
  steps: ChainStepDef[];
}

/** i18n keys: chain.<id>.title, chain.<id>.<step>.text, chain.<id>.<step>.done */
export const CHAINS: ChainDef[] = [
  {
    id: 'vesna',
    offeredAt: ['scientific', 'research', 'trade_hub'],
    steps: [
      { kind: 'courier', destTypes: ['research', 'scientific'], jumps: 3, rewardMult: 1.0 },
      { kind: 'supply', destTypes: ['mining', 'research', 'agricultural'], jumps: 4, goodId: 'medicine', qty: 14, rewardMult: 1.1 },
      { kind: 'passenger', destTypes: ['trade_hub', 'scientific'], jumps: 4, passengers: 2, comfort: 1, rewardMult: 1.6, finalModule: true },
    ],
  },
  {
    id: 'expedition',
    offeredAt: ['research', 'scientific'],
    steps: [
      { kind: 'survey', destTypes: ['research'], jumps: 4, rewardMult: 1.0 },
      { kind: 'rescue', destTypes: ['research', 'scientific'], jumps: 4, rewardMult: 1.2 },
      { kind: 'courier', destTypes: ['scientific', 'trade_hub'], jumps: 5, rewardMult: 1.5, finalModule: true },
    ],
  },
  {
    id: 'crates',
    offeredAt: ['trade_hub', 'industrial', 'pirate'],
    steps: [
      { kind: 'freight', destTypes: ['trade_hub', 'industrial'], jumps: 3, goodId: 'crates', qty: 16, rewardMult: 1.0 },
      { kind: 'supply', destTypes: ['pirate', 'mining'], jumps: 4, goodId: 'spirits', qty: 12, rewardMult: 1.2 },
      { kind: 'courier', destTypes: ['trade_hub'], jumps: 5, rewardMult: 1.7, finalModule: true },
    ],
  },
];

export const CHAINS_BY_ID = Object.fromEntries(CHAINS.map((c) => [c.id, c]));
