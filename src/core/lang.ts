/**
 * The language of the Grey. Each concept has a generated alien spelling (deterministic for the galaxy seed) and is
 * learned in a seeded order: encounters, artifacts and research reveal more words, and texts translate word by word.
 */
import { LEXICON, LEXICON_BY_ID } from '../content/lexicon';
import { Rng } from './rng';
import type { GameState } from './types';

const SYLLABLES = [
  'ae',
  'vo',
  'ur',
  'shi',
  'ka',
  'el',
  'na',
  'th',
  'or',
  'ix',
  'yu',
  'zae',
  'mi',
  'dra',
  'su',
  'en',
];
/** Glyphs used for the alien alphabet: one per syllable. */
const GLYPHS = ['◐', '◑', '◒', '◓', '◔', '◕', '⬖', '⬗', '⬘', '⬙', '◈', '◇', '◆', '◉', '◍', '◎'];

interface Spelling {
  latin: string;
  glyphs: string;
}

const spellCache = new Map<string, Spelling[]>();
const orderCache = new Map<string, number[]>();

function spellings(seed: string): Spelling[] {
  const hit = spellCache.get(seed);
  if (hit) return hit;
  const out: Spelling[] = [];
  const used = new Set<string>();
  LEXICON.forEach((cpt) => {
    const rng = Rng.fromSeed(`${seed}:lex:${cpt.id}`);
    let tries = 0;
    let idx: number[];
    let word: string;
    for (;;) {
      const n = rng.int(2, 3);
      idx = Array.from({ length: n }, () => rng.int(0, SYLLABLES.length - 1));
      word = idx.join(',');
      if (!used.has(word) || tries++ >= 30) break;
    }
    used.add(word);
    out.push({
      latin: idx.map((i) => SYLLABLES[i]).join(''),
      glyphs: idx.map((i) => GLYPHS[i]).join(''),
    });
  });
  if (spellCache.size > 6) spellCache.clear();
  spellCache.set(seed, out);
  return out;
}

/** Order in which concepts become known (indices into LEXICON), a seeded permutation. */
export function learningOrder(seed: string): number[] {
  const hit = orderCache.get(seed);
  if (hit) return hit;
  const rng = Rng.fromSeed(`${seed}:lexorder`);
  const idx = LEXICON.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  // the first words are the ones every traveller would pick up first
  const first = ['light', 'ship', 'voice', 'path'].map((id) => LEXICON.findIndex((x) => x.id === id));
  const rest = idx.filter((i) => !first.includes(i));
  const out = [...first, ...rest];
  if (orderCache.size > 6) orderCache.clear();
  orderCache.set(seed, out);
  return out;
}

export const WORD_COUNT = LEXICON.length;

export function alienWord(seed: string, conceptId: string): Spelling {
  const i = LEXICON.findIndex((x) => x.id === conceptId);
  return spellings(seed)[Math.max(0, i)];
}

export function isKnown(state: Pick<GameState, 'seed' | 'lang'>, conceptId: string): boolean {
  const i = LEXICON.findIndex((x) => x.id === conceptId);
  if (i < 0) return false;
  return learningOrder(state.seed).indexOf(i) < state.lang.learned;
}

/** Fraction of the language understood (0..1). */
export function understanding(state: Pick<GameState, 'lang'>): number {
  return Math.min(1, state.lang.learned / WORD_COUNT);
}

/** Learn the next `n` words of the learning order. Returns the concepts newly learned. */
export function learnWords(state: GameState, n: number): string[] {
  const order = learningOrder(state.seed);
  const from = state.lang.learned;
  state.lang.learned = Math.min(WORD_COUNT, from + Math.max(0, Math.floor(n)));
  return order.slice(from, state.lang.learned).map((i) => LEXICON[i].id);
}

/**
 * Translate marked words in a text. A marker `⟦concept⟧` becomes `⟦česky⟧` when the word is known and `⟦glyphs⟧` when not.
 * The brackets stay so the UI can style the alien parts.
 */
export function translateAlien(state: Pick<GameState, 'seed' | 'lang'>, text: string): string {
  return text.replace(/⟦([a-z_]+)⟧/g, (_m, id: string) => {
    const cpt = LEXICON_BY_ID[id];
    if (!cpt) return `⟦${id}⟧`;
    return isKnown(state, id) ? `⟦${cpt.cs}⟧` : `⟦${alienWord(state.seed, id).glyphs}⟧`;
  });
}

/** Dictionary rows for the journal: every concept with its alien spelling and whether it is known. */
export function dictionary(state: Pick<GameState, 'seed' | 'lang'>): {
  id: string;
  cs: string;
  glyphs: string;
  latin: string;
  known: boolean;
}[] {
  const sp = spellings(state.seed);
  const order = learningOrder(state.seed);
  return LEXICON.map((c, i) => ({
    id: c.id,
    cs: c.cs,
    glyphs: sp[i].glyphs,
    latin: sp[i].latin,
    known: order.indexOf(i) < state.lang.learned,
  }));
}
