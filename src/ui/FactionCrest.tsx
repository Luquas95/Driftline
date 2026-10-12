import { FACTIONS_BY_ID } from '../content/factions';
import type { FactionId } from '../core/worldTypes';

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

function polygon(sides: number, r: number, rot: number): string {
  if (sides < 3) return '';
  const pts: string[] = [];
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2 - Math.PI / 2;
    pts.push(`${(50 + Math.cos(a) * r).toFixed(1)},${(50 + Math.sin(a) * r).toFixed(1)}`);
  }
  return pts.join(' ');
}

const GLYPHS: Record<string, string> = {
  diamond: 'M50 26 L68 50 L50 74 L32 50 Z',
  cross: 'M44 28h12v16h16v12H56v16H44V56H28V44h16z',
  wing: 'M28 66 L50 28 L72 66 L50 56 Z',
  eye: 'M24 50 Q50 24 76 50 Q50 76 24 50 Z M50 42a8 8 0 1 0 .01 0',
  bolt: 'M54 24 L34 54 H48 L44 76 L66 44 H52 Z',
  tri: 'M50 28 L72 68 H28 Z',
};

/** Vector crest of a faction, drawn from its `CrestSpec`. */
export function FactionCrest({ id, size = 48 }: { id: FactionId; size?: number }) {
  const f = FACTIONS_BY_ID[id];
  const c = f.crest;
  const main = hex(f.color);
  const accent = hex(f.accent);
  return (
    <svg
      class="crest"
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-hidden="true"
      data-testid={`crest-${id}`}
    >
      {c.sides >= 3 ? (
        <polygon
          points={polygon(c.sides, 46, (c.rot * Math.PI) / 180)}
          fill={main}
          fill-opacity="0.18"
          stroke={main}
          stroke-width="4"
        />
      ) : (
        <circle cx="50" cy="50" r="45" fill={main} fill-opacity="0.18" stroke={main} stroke-width="4" />
      )}
      <path d={GLYPHS[c.glyph]} fill={accent} fill-rule="evenodd" />
      {Array.from({ length: c.bars }, (_, i) => (
        <rect
          key={i}
          x={30 + i * 0}
          y={80 + i * 5 - (c.bars - 1) * 2.5}
          width="40"
          height="2.6"
          fill={main}
        />
      ))}
    </svg>
  );
}
