import type { JSX } from 'preact';

/** Custom vector icon set (24x24 viewBox, stroke based). */
const P: Record<string, string> = {
  map: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14',
  system: 'M12 12m-2.2 0a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0-4.4 0M12 12m-8 0a8 4 0 1 0 16 0a8 4 0 1 0-16 0M17.5 8.5l.01 0',
  station: 'M12 3v4M12 17v4M3 12h4M17 12h4M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0M6 6l2 2M18 6l-2 2M6 18l2-2M18 18l-2-2',
  ship: 'M3 14l7-2 2-8 2 8 7 2-4 2 1 4-6-2-6 2 1-4z',
  cargo: 'M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8',
  journal: 'M6 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6zM9 7h6M9 11h6M9 15h4',
  settings: 'M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1',
  fuel: 'M6 20V6a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v14M4 20h12M14 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V9l-3-3M8 8h4',
  credits: 'M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0-16 0M9.5 9.5C10 8.5 11 8 12 8s2.5.6 2.5 1.8c0 2.2-5 1.6-5 4C9.5 15.1 10.8 16 12 16s2-.6 2.5-1.5',
  power: 'M13 3L6 13h5l-1 8 8-11h-5z',
  warning: 'M12 4l9 16H3zM12 10v4M12 17.2v.01',
  jump: 'M4 12h10M10 7l5 5-5 5M18 6v12',
  scan: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10M12 7v10',
  mine: 'M5 19l8-8M13 11l-2-6 6 2 3 5-5-1zM4 20l2-2',
  repair: 'M14 6a4 4 0 0 0-5 5l-6 6 3 3 6-6a4 4 0 0 0 5-5l-3 3-2-2z',
  market: 'M4 9l1.5-5h13L20 9M4 9v10h16V9M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0A2.7 2.7 0 0 0 20 9M10 19v-5h4v5',
  contract: 'M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6',
  clock: 'M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0-16 0M12 7v5l3 2',
  shield: 'M12 3l7 3v6c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6z',
  supplies: 'M5 9h14v11H5zM8 9V6a4 4 0 0 1 8 0v3M9 14h6',
  crew: 'M12 8m-3.5 0a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0M5 20c.5-4 3.5-6 7-6s6.5 2 7 6',
  cooler: 'M12 3v18M5 7l14 10M19 7L5 17M9 4l3 2 3-2M9 20l3-2 3 2',
  vault: 'M4 5h16v14H4zM12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M12 9v1M12 14v1M9 12h1M14 12h1',
  close: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  rotate: 'M20 12a8 8 0 1 1-3-6.2M20 4v5h-5',
  auto: 'M4 6h6v6H4zM14 6h6v4h-6zM4 16h8v4H4zM16 14h4v6h-4z',
  sound: 'M4 10v4h4l5 4V6l-5 4zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11',
  mute: 'M4 10v4h4l5 4V6l-5 4zM17 9l5 6M22 9l-5 6',
  help: 'M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0-16 0M9.7 9.5A2.4 2.4 0 0 1 12 8c1.3 0 2.3.9 2.3 2.1 0 1.8-2.3 1.8-2.3 3.4M12 16.5v.01',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  route: 'M5 19a2 2 0 1 0 0-.01M19 5a2 2 0 1 0 0-.01M7 19h6a4 4 0 0 0 0-8h-2a4 4 0 0 1 0-8h6',
  star: 'M12 3l2.6 5.6 6 .7-4.4 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.4 9.3l6-.7z',
  probe: 'M12 3l3 6-3 3-3-3zM12 12v9M8 17h8',
  check: 'M5 12.5l4.5 4.5L19 7',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
  info: 'M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0-16 0M12 11v5M12 8v.01',
  wrench: 'M14 6a4 4 0 0 0-5 5l-6 6 3 3 6-6a4 4 0 0 0 5-5l-3 3-2-2z',
  down: 'M6 9l6 6 6-6',
  up: 'M6 15l6-6 6 6',
  save: 'M5 4h12l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
  pause: 'M8 5v14M16 5v14',
  play: 'M8 5l11 7-11 7z',
  user: 'M12 8m-3.5 0a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0M5 20c.5-4 3.5-6 7-6s6.5 2 7 6',
  filter: 'M4 5h16l-6 8v6l-4-2v-4z',
  target: 'M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0-16 0M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
  anomaly: 'M12 3l2 5 5 1-4 3.5 1 5.5-4-2.7L8 18l1-5.5L5 9l5-1z',
  tag: 'M3 12l9-9h8v8l-9 9zM16 8h.01',
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 18, class: cls, title }: { name: IconName | string; size?: number; class?: string; title?: string }): JSX.Element {
  return (
    <svg
      class={`icon ${cls ?? ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      <path d={P[name] ?? P.info} />
    </svg>
  );
}

/** Small glyphs for goods categories. */
const CAT: Record<string, string> = {
  raw: 'M4 17l4-9 4 5 3-4 5 8z',
  food: 'M12 20c-4 0-7-3-7-7 0-3 2-5 4-5 1.3 0 2.3.6 3 1.3.7-.7 1.7-1.3 3-1.3 2 0 4 2 4 5 0 4-3 7-7 7zM12 8c0-2 1-3 3-4',
  industry: 'M4 20V10l5 3V10l5 3V6h6v14zM8 17h1M12 17h1M16 17h1',
  tech: 'M7 7h10v10H7zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4',
  medical: 'M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z',
  luxury: 'M6 4h12l3 5-9 11L3 9z',
  illegal: 'M12 3a8 8 0 0 0-5 14v3h10v-3a8 8 0 0 0-5-14zM9 12h.01M15 12h.01M10 17v2M14 17v2',
  special: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5',
};

export function CategoryIcon({ cat, size = 16 }: { cat: string; size?: number }): JSX.Element {
  return (
    <svg class="icon cat" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d={CAT[cat] ?? CAT.raw} />
    </svg>
  );
}
