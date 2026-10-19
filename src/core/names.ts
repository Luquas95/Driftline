/**
 * Procedural names for sectors, systems and stations, drawn from the galaxy generator's Rng.
 * The galaxy is regenerated from the seed on every load (galaxyOf), so editing these lists or the
 * order of rng calls renames places in existing saves.
 */
import type { Rng } from './rng';

const SYL_A = [
  'Al',
  'Ber',
  'Cor',
  'Dra',
  'El',
  'Fen',
  'Gal',
  'Hel',
  'Ith',
  'Jor',
  'Kes',
  'Lum',
  'Mor',
  'Nal',
  'Or',
  'Pyr',
  'Qua',
  'Ros',
  'Sol',
  'Tar',
  'Ul',
  'Vel',
  'Wen',
  'Xan',
  'Yar',
  'Zen',
  'Ae',
  'Cal',
  'Dor',
  'Eri',
];
const SYL_B = ['a', 'e', 'i', 'o', 'u', 'ae', 'io', 'ia', 'ou'];
const SYL_C = [
  'dan',
  'tis',
  'nor',
  'ria',
  'lex',
  'mir',
  'vos',
  'thar',
  'sen',
  'kan',
  'phi',
  'rus',
  'lon',
  'dra',
  'bel',
  'gor',
  'zim',
  'nus',
  'tek',
  'wyn',
];
const SUFFIX = ['', '', '', '', ' Prime', ' Minor', ' Reach', ' Gate', ' Anchorage'];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

/** Two- or three-syllable name with an occasional suffix; uniqueness is up to the caller. */
export function systemName(rng: Rng): string {
  const parts = rng.chance(0.5)
    ? [rng.pick(SYL_A), rng.pick(SYL_C)]
    : [rng.pick(SYL_A), rng.pick(SYL_B), rng.pick(SYL_C)];
  const base = parts.join('');
  return base + rng.pick(SUFFIX);
}

/** Roman numeral for index i (0 → I), capped at VIII. */
export function romanNumeral(i: number): string {
  return ROMAN[Math.min(i, ROMAN.length - 1)];
}

// station names are proper names baked into the galaxy, so they stay Czech instead of going through i18n
const STATION_PREFIX = ['Orbitální', 'Kotva', 'Přístav', 'Stanice', 'Kolonie', 'Základna', 'Hvězdná'];
export { STATION_PREFIX };

export function stationSuffix(rng: Rng): string {
  return rng.pick([
    'Aurora',
    'Nadějná',
    'Helios',
    'Zenit',
    'Perun',
    'Vega',
    'Tichá',
    'Svítání',
    'Útočiště',
    'Majáku',
    'Prstenec',
    'Hraniční',
    'Kometa',
    'Svorník',
    'Marnost',
    'Kalliope',
  ]);
}
