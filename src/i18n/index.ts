import { cs } from './cs';
import { EVENT_TEXTS_CS } from '../content/events';

export type Dict = Record<string, string>;
const dictionaries: Record<string, Dict> = { cs: { ...cs, ...EVENT_TEXTS_CS } };
let current = 'cs';

/** Register or extend a language (e.g. English later): `addLanguage('en', {...})`. Missing keys fall back to Czech. */
export function addLanguage(code: string, dict: Dict): void {
  dictionaries[code] = { ...(dictionaries[code] ?? {}), ...dict };
}

export function setLanguage(code: string): void {
  if (dictionaries[code]) current = code;
}

export function hasKey(key: string): boolean {
  return key in dictionaries.cs;
}

/** Translate a key; `{name}` placeholders are replaced from params. Unknown keys render as the key itself. */
export function t(key: string, params?: Record<string, string | number>): string {
  const raw = dictionaries[current]?.[key] ?? dictionaries.cs[key] ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k: string) => (k in params ? String(params[k]) : `{${k}}`));
}

/** Czech plural: 1 / 2–4 / 5+ */
export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n);
  if (a === 1) return one;
  if (a >= 2 && a <= 4) return few;
  return many;
}

export function fmt(n: number, digits = 0): string {
  return n.toLocaleString('cs-CZ', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function money(n: number): string {
  return `${fmt(Math.round(n))} kr`;
}
