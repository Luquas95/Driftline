import { BUILDINGS } from '../../content/buildings';
import { Rng } from '../../core/rng';
import type { Base } from '../../core/worldTypes';

/**
 * Vector picture of the base: a hub that grows with every building level. Drawn from the base itself
 * (positions come from the seed), so two bases never look alike.
 */
export function BaseView({ base, seed }: { base: Base; seed: string }) {
  const rng = Rng.fromSeed(`${seed}:baseview`);
  const total = Object.values(base.buildings).reduce((s, v) => s + v, 0);
  const hubR = 16 + Math.min(14, total * 0.7);
  const rot = rng.range(0, 360);
  const items = BUILDINGS.map((b, i) => {
    const lvl = base.buildings[b.id] ?? 0;
    const pending = base.queue.some((q) => q.id === b.id);
    const a = ((i / BUILDINGS.length) * Math.PI * 2 + (rot * Math.PI) / 180) % (Math.PI * 2);
    const r = 70 + (i % 2) * 22;
    return { b, lvl, pending, x: 160 + Math.cos(a) * r, y: 110 + Math.sin(a) * r * 0.72 };
  });
  return (
    <svg class="base-view" viewBox="0 0 320 220" role="img" aria-label={base.name} data-testid="base-view">
      <defs>
        <radialGradient id="bv-glow">
          <stop offset="0" stop-color="#7fd6ff" stop-opacity="0.35" />
          <stop offset="1" stop-color="#7fd6ff" stop-opacity="0" />
        </radialGradient>
      </defs>
      <circle cx="160" cy="110" r={hubR * 3} fill="url(#bv-glow)" />
      {items
        .filter((x) => x.lvl > 0 || x.pending)
        .map((x) => (
          <line
            key={`l${x.b.id}`}
            x1="160"
            y1="110"
            x2={x.x}
            y2={x.y}
            stroke="#7fd6ff"
            stroke-opacity={x.lvl > 0 ? 0.45 : 0.2}
            stroke-dasharray={x.lvl > 0 ? '' : '3 3'}
          />
        ))}
      <circle cx="160" cy="110" r={hubR} fill="#0d2233" stroke="#7fd6ff" stroke-width="2" />
      <circle cx="160" cy="110" r={hubR * 0.45} fill="#7fd6ff" fill-opacity="0.5" />
      {items.map((x) => {
        const size = x.lvl > 0 ? 6 + x.lvl * 2.4 : 5;
        return (
          <g key={x.b.id} opacity={x.lvl > 0 ? 1 : x.pending ? 0.6 : 0.18} data-building={x.b.id}>
            <rect
              x={x.x - size / 2}
              y={x.y - size / 2}
              width={size}
              height={size}
              rx="2"
              fill={x.lvl > 0 ? '#16384f' : 'none'}
              stroke="#9be3ff"
              stroke-width="1.4"
              stroke-dasharray={x.lvl > 0 ? '' : '2 2'}
              transform={`rotate(${(x.b.id.length * 17) % 45} ${x.x} ${x.y})`}
            />
            {x.lvl > 0 && (
              <text x={x.x} y={x.y + size / 2 + 10} text-anchor="middle" font-size="8" fill="#9be3ff">
                {x.lvl}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
