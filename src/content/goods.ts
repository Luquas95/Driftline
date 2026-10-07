import type { GoodDef } from '../core/types';

const g = (
  id: string,
  category: GoodDef['category'],
  basePrice: number,
  unitsPerCell: number,
  mass: number,
  tags: GoodDef['tags'] = [],
  extra: Partial<GoodDef> = {},
): GoodDef => ({ id, category, basePrice, unitsPerCell, mass, tags, ...extra });

export const GOODS: GoodDef[] = [
  // raw
  g('water_ice', 'raw', 12, 20, 0.25),
  g('iron_ore', 'raw', 18, 16, 0.4),
  g('silicates', 'raw', 14, 18, 0.3),
  g('hydrocarbons', 'raw', 22, 16, 0.25),
  g('rare_ore', 'raw', 60, 10, 0.5),
  g('crystals', 'raw', 95, 8, 0.2),
  g('radioactives', 'raw', 75, 8, 0.6, ['hazardous']),
  g('rare_metals', 'raw', 150, 8, 0.4),
  // food
  g('grain', 'food', 20, 18, 0.2),
  g('protein', 'food', 38, 14, 0.2, [], { inputs: { grain: 2 } }),
  g('fresh_produce', 'food', 48, 12, 0.2, ['chilled', 'perishable'], { shelfDays: 22 }),
  g('spirits', 'food', 105, 10, 0.2, [], { inputs: { grain: 2 } }),
  // industry
  g('metals', 'industry', 50, 12, 0.5, [], { inputs: { iron_ore: 2 } }),
  g('alloys', 'industry', 85, 10, 0.5, [], { inputs: { metals: 1, silicates: 1 } }),
  g('polymers', 'industry', 55, 12, 0.25, [], { inputs: { hydrocarbons: 2 } }),
  g('construction', 'industry', 70, 10, 0.6, [], { inputs: { metals: 1, silicates: 1 } }),
  g('machinery', 'industry', 125, 8, 0.6, [], { inputs: { metals: 1, polymers: 1 } }),
  g('spare_parts', 'industry', 95, 12, 0.2, [], { inputs: { metals: 1, polymers: 1 } }),
  // tech
  g('electronics', 'tech', 155, 10, 0.1, [], { inputs: { crystals: 1, polymers: 1 } }),
  g('optics', 'tech', 190, 8, 0.1, [], { inputs: { crystals: 1, polymers: 1 } }),
  g('computers', 'tech', 270, 8, 0.15, [], { inputs: { electronics: 1, metals: 1 } }),
  g('robotics', 'tech', 330, 6, 0.3, [], { inputs: { machinery: 1, electronics: 1 } }),
  g('fusion_cells', 'tech', 210, 8, 0.3, ['hazardous'], { inputs: { hydrocarbons: 1, radioactives: 1 } }),
  // medical
  g('medicine', 'medical', 145, 12, 0.1, ['chilled'], { inputs: { polymers: 1, hydrocarbons: 1 } }),
  g('vaccines', 'medical', 230, 10, 0.1, ['chilled', 'perishable'], { shelfDays: 30, inputs: { medicine: 1 } }),
  g('biosamples', 'medical', 120, 8, 0.1, ['chilled', 'perishable', 'sensitive'], { shelfDays: 18 }),
  // luxury
  g('textiles', 'luxury', 75, 12, 0.15, [], { inputs: { polymers: 2 } }),
  g('art', 'luxury', 420, 4, 0.2, ['sensitive']),
  g('gems', 'luxury', 520, 4, 0.05, ['sensitive']),
  // illegal
  g('narcotics', 'illegal', 360, 8, 0.1, ['illegal'], { inputs: { biosamples: 1 } }),
  g('contraband_arms', 'illegal', 470, 6, 0.4, ['illegal', 'hazardous']),
  g('stolen_data', 'illegal', 540, 6, 0.05, ['illegal', 'sensitive']),
  // special: contract cargo, never traded on markets
  g('data_core', 'special', 0, 1, 0.05),
  g('survivors', 'special', 0, 1, 0.3),
  g('black_box', 'special', 0, 1, 0.05),
  g('crates', 'special', 0, 8, 0.4),
];

export const GOODS_BY_ID: Record<string, GoodDef> = Object.fromEntries(GOODS.map((x) => [x.id, x]));
export const GOOD_INDEX: Record<string, number> = Object.fromEntries(GOODS.map((x, i) => [x.id, i]));
export const GOOD_IDS = GOODS.map((x) => x.id);

export const MARKET_GOODS = GOODS.filter((x) => x.category !== 'special');

export function isIllegal(goodId: string): boolean {
  return GOODS_BY_ID[goodId].tags.includes('illegal');
}
