import type { ComponentChildren } from 'preact';
import { translateAlien } from '../core/lang';
import { game, rev } from './store';

/**
 * Text with alien words: `⟦...⟧` marks are translated word by word from what the player has learned
 * (known words in Czech, unknown ones as glyphs) and drawn in a separate style.
 */
export function AlienText({ text }: { text: string }) {
  void rev.value;
  const s = game.value;
  const tr = s ? translateAlien(s, text) : text;
  const parts: ComponentChildren[] = [];
  const re = /⟦([^⟧]*)⟧/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(tr))) {
    if (m.index > last) parts.push(tr.slice(last, m.index));
    const word = m[1];
    const glyph = !/\p{L}/u.test(word);
    parts.push(
      <span key={i++} class={`alien-word ${glyph ? 'unknown' : 'known'}`}>
        {word}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < tr.length) parts.push(tr.slice(last));
  return <>{parts}</>;
}
