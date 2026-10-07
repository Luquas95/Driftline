import { RACES_BY_ID, type Accessory, type HeadShape, type RaceId } from '../content/crew';

/** Small deterministic generator (the portrait must not depend on the simulation RNG). */
function hash(seed: number, n: number): number {
  let h = (seed ^ (n * 2654435761)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489917) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const ACCESSORIES: Accessory[] = ['none', 'none', 'visor', 'antenna', 'scar', 'horns', 'mask'];

export interface PortraitSpec {
  head: HeadShape;
  acc: Accessory;
  skin: string;
  skin2: string;
  bg: string;
  eye: string;
  eyes: number;
  hair: boolean;
}

/** Vector portrait description from the race and the portrait seed; the same inputs always give the same face. */
export function portraitSpec(race: RaceId, look: number): PortraitSpec {
  const r = RACES_BY_ID[race];
  const hue = (r.hue + (hash(look, 1) - 0.5) * 0.06 + 1) % 1;
  const sat = 38 + hash(look, 2) * 24;
  const lum = 46 + hash(look, 3) * 18;
  const h = Math.round(hue * 360);
  return {
    head: r.heads[Math.floor(hash(look, 4) * r.heads.length)],
    acc: ACCESSORIES[Math.floor(hash(look, 5) * ACCESSORIES.length)],
    skin: `hsl(${h} ${sat}% ${lum}%)`,
    skin2: `hsl(${h} ${sat}% ${lum - 16}%)`,
    bg: `hsl(${(h + 180) % 360} 30% ${16 + hash(look, 6) * 8}%)`,
    eye: `hsl(${(h + 120 + Math.floor(hash(look, 7) * 120)) % 360} 85% 68%)`,
    eyes: r.eyes,
    hair: hash(look, 8) > 0.6,
  };
}

const HEAD_PATH: Record<HeadShape, string> = {
  round: 'M32 10c13 0 20 9 20 22s-7 22-20 22S12 45 12 32 19 10 32 10z',
  tall: 'M32 6c11 0 16 10 16 26 0 15-6 24-16 24S16 47 16 32C16 16 21 6 32 6z',
  wide: 'M32 14c15 0 24 7 24 19 0 11-9 19-24 19S8 44 8 33c0-12 9-19 24-19z',
  angular: 'M32 8l17 8 3 18-8 18H20l-8-18 3-18z',
  crest: 'M32 10c11 0 19 8 19 22 0 12-8 22-19 22S13 44 13 32c0-14 8-22 19-22zM28 10l4-7 4 7z',
};

export function Portrait({
  race,
  look,
  size = 48,
  title,
}: {
  race: RaceId;
  look: number;
  size?: number;
  title?: string;
}) {
  const p = portraitSpec(race, look);
  const eyeX = p.eyes === 3 ? [22, 32, 42] : [24, 40];
  const eyeY = p.head === 'wide' ? 33 : 30;
  return (
    <svg
      class="portrait"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <rect width="64" height="64" rx="8" fill={p.bg} />
      <circle cx="32" cy="34" r="26" fill="#ffffff08" />
      {p.hair && <path d="M14 30c0-14 8-22 18-22s18 8 18 22c-4-8-10-11-18-11s-14 3-18 11z" fill={p.skin2} />}
      <path d={HEAD_PATH[p.head]} fill={p.skin} stroke={p.skin2} stroke-width="1.6" />
      {p.acc === 'horns' && <path d="M18 18l-6-10 11 5zM46 18l6-10-11 5z" fill={p.skin2} />}
      {p.acc === 'antenna' && (
        <g stroke={p.skin2} stroke-width="1.6" fill="none">
          <path d="M26 10l-5-8M38 10l5-8" />
          <circle cx="21" cy="2.5" r="1.6" fill={p.eye} />
          <circle cx="43" cy="2.5" r="1.6" fill={p.eye} />
        </g>
      )}
      {eyeX.map((x) => (
        <g key={x}>
          <ellipse cx={x} cy={eyeY} rx="3.4" ry="2.6" fill="#0b0f18" />
          <circle cx={x} cy={eyeY} r="1.7" fill={p.eye} />
        </g>
      ))}
      <path
        d={`M25 ${eyeY + 13}q7 4 14 0`}
        stroke={p.skin2}
        stroke-width="1.6"
        fill="none"
        stroke-linecap="round"
      />
      {p.acc === 'visor' && (
        <rect
          x="14"
          y={eyeY - 5}
          width="36"
          height="9"
          rx="4"
          fill="#0b0f18cc"
          stroke={p.eye}
          stroke-width="1"
        />
      )}
      {p.acc === 'scar' && (
        <path d="M38 22l7 14" stroke="#f3d6c0" stroke-width="1.6" stroke-linecap="round" />
      )}
      {p.acc === 'mask' && (
        <path d={`M16 ${eyeY + 8}h32v10c-5 5-27 5-32 0z`} fill="#1b2433" stroke={p.eye} stroke-width="0.8" />
      )}
    </svg>
  );
}
