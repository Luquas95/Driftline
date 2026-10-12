import { describe, expect, it } from 'vitest';
import { LEXICON } from '../src/content/lexicon';
import {
  alienWord,
  dictionary,
  isKnown,
  learnWords,
  translateAlien,
  understanding,
  WORD_COUNT,
} from '../src/core/lang';
import { mk } from './helpers';

describe('alien language', () => {
  it('spells every concept deterministically, uniquely, with glyphs', () => {
    const seen = new Set<string>();
    for (const c of LEXICON) {
      const w = alienWord('G1', c.id);
      expect(w.glyphs.length).toBeGreaterThanOrEqual(2);
      expect(alienWord('G1', c.id)).toEqual(w);
      seen.add(w.latin);
    }
    expect(seen.size).toBeGreaterThan(LEXICON.length * 0.9);
    expect(alienWord('G1', 'light')).not.toEqual(alienWord('G2', 'light'));
  });

  it('translates texts word by word as words are learned', () => {
    const s = mk('LANG3');
    const text = 'Zpráva: ⟦light⟧ ⟦path⟧ ⟦gate⟧ a ⟦nonsense⟧.';
    const t0 = translateAlien(s, text);
    expect(t0).not.toContain('světlo');
    expect(t0).toContain('⟦nonsense⟧');
    const learned = learnWords(s, 4);
    expect(learned).toHaveLength(4);
    expect(isKnown(s, 'light')).toBe(true);
    const t1 = translateAlien(s, text);
    expect(t1).toContain('⟦světlo⟧');
    // the more is learned, the more is Czech
    learnWords(s, WORD_COUNT);
    const t2 = translateAlien(s, text);
    expect(t2).toContain('⟦cesta⟧');
    expect(t2).toContain('⟦brána⟧');
    expect(understanding(s)).toBe(1);
  });

  it('the dictionary lists every concept and marks the known ones', () => {
    const s = mk('LANG4');
    learnWords(s, 7);
    const d = dictionary(s);
    expect(d).toHaveLength(WORD_COUNT);
    expect(d.filter((x) => x.known)).toHaveLength(7);
  });

  it('is deterministic for a seed', () => {
    const a = mk('LANG5');
    const b = mk('LANG5');
    learnWords(a, 10);
    learnWords(b, 10);
    expect(translateAlien(a, '⟦light⟧⟦hope⟧⟦sleep⟧')).toBe(translateAlien(b, '⟦light⟧⟦hope⟧⟦sleep⟧'));
  });
});
