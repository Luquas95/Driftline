/**
 * Balance simulator: bots play many games headlessly, output goes to docs/balance.md.
 * Usage: npm run balance -- [--seeds N] [--days D] [--quick] [--out path]
 */
import { writeFileSync } from 'node:fs';
import { newGame } from '../core/state';
import { Bot, type BotRun, type Strategy } from './bots';

interface Agg {
  strategy: Strategy;
  runs: BotRun[];
}

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

export function median(a: number[]): number {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

function daysTo(run: BotRun, target: number): number | null {
  const entries = Object.entries(run.worthByDay)
    .map(([d, w]) => [Number(d), w] as const)
    .sort((a, b) => a[0] - b[0]);
  for (const [d, w] of entries) if (w >= run.startWorth + target) return d;
  return null;
}

export function runOne(strategy: Strategy, seed: string, days: number, size = 300): BotRun {
  const state = newGame({ seed, galaxySize: size });
  const bot = new Bot(state, strategy);
  return bot.play(days);
}

function main(): void {
  const seeds = Number(arg('seeds', '10'));
  const days = Number(arg('days', '120'));
  const out = arg('out', 'docs/balance.md');
  const strategies: Strategy[] = ['trader', 'hauler', 'miner', 'explorer', 'oracle', 'loop'];
  const results: Agg[] = [];
  const t0 = Date.now();
  for (const strategy of strategies) {
    const runs: BotRun[] = [];
    for (let i = 0; i < seeds; i++) runs.push(runOne(strategy, `BAL${i}`, strategy === 'loop' ? Math.min(days, 60) : days));
    results.push({ strategy, runs });
    console.log(`${strategy}: ${runs.length} runs, median income/day ${median(runs.map((r) => r.income)).toFixed(0)}`);
  }
  const lines: string[] = [];
  lines.push('# Balanční report', '');
  lines.push(`Vygenerováno příkazem \`npm run balance\` (${seeds} semínek × ${days} dní na strategii, galaxie 300 systémů, normální obtížnost, pojištění zapnuto).`, '');
  lines.push('| Strategie | Příjem/den (medián) | Příjem/den (průměr) | Čistá hodnota po 30 dnech | Dny do +3000 kr | První vylepšení (den) | Nehody/100 dnů | Zničení lodi | Skoků |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const { strategy, runs } of results) {
    const w30 = runs.map((r) => (r.worthByDay[30] ?? r.finalWorth) - r.startWorth);
    const d3k = runs.map((r) => daysTo(r, 3000)).filter((x): x is number => x !== null);
    const first = runs.map((r) => r.firstUpgradeDay).filter((x): x is number => x !== null);
    const accRate = mean(runs.map((r) => (r.accidents / Math.max(1, r.daysPlayed)) * 100));
    lines.push(
      `| ${strategy} | ${median(runs.map((r) => r.income)).toFixed(0)} | ${mean(runs.map((r) => r.income)).toFixed(0)} | ${median(w30).toFixed(0)} | ${d3k.length ? median(d3k).toFixed(0) : '—'} (${d3k.length}/${runs.length}) | ${first.length ? median(first).toFixed(0) : '—'} | ${accRate.toFixed(1)} | ${runs.reduce((s, r) => s + r.deaths, 0)} | ${mean(runs.map((r) => r.jumps)).toFixed(0)} |`,
    );
  }
  lines.push('');
  // loop analysis
  const loop = results.find((r) => r.strategy === 'loop')!;
  lines.push('## Test smyčky zisku (pevná trasa A↔B)', '');
  lines.push('Bot opakuje jedinou nejlepší trasu tam a zpět (okruh = obě cesty). Zisk jednoho okruhu v čase (průměr přes semínka):', '');
  const maxTrips = 12;
  const rows: string[] = [];
  const cycle = (r: BotRun, t: number): number | undefined =>
    r.loopTrips[2 * t] !== undefined && r.loopTrips[2 * t + 1] !== undefined ? r.loopTrips[2 * t] + r.loopTrips[2 * t + 1] : undefined;
  for (let t = 0; t < maxTrips; t++) {
    const vals = loop.runs.map((r) => cycle(r, t)).filter((v): v is number => v !== undefined);
    if (vals.length) rows.push(`| ${t + 1} | ${mean(vals).toFixed(0)} | ${vals.length} |`);
  }
  lines.push('| Okruh | Průměrný zisk (kr) | Vzorků |', '|---:|---:|---:|', ...rows, '');
  const cycles = loop.runs.map((r) => Array.from({ length: Math.floor(r.loopTrips.length / 2) }, (_, t) => cycle(r, t) as number));
  const early = mean(cycles.flatMap((c) => c.slice(0, 2)));
  const late = mean(cycles.flatMap((c) => c.slice(-3)));
  lines.push(`Zisk raných okruhů ≈ ${early.toFixed(0)} kr, pozdních ≈ ${late.toFixed(0)} kr (poměr ${(late / Math.max(1, early)).toFixed(2)}).`, '');
  // top routes
  const routes: Record<string, number> = {};
  for (const { runs } of results) for (const r of runs) for (const [k, v] of Object.entries(r.routeProfit)) routes[k] = (routes[k] ?? 0) + v;
  const top = Object.entries(routes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  lines.push('## Nejvýdělečnější trasy (součet přes všechny boty)', '', '| Trasa (stanice>stanice:zboží) | Zisk |', '|---|---:|', ...top.map(([k, v]) => `| ${k} | ${v.toFixed(0)} |`), '');
  lines.push(`Doba běhu simulace: ${((Date.now() - t0) / 1000).toFixed(0)} s.`, '');
  writeFileSync(out, lines.join('\n'));
  console.log(`Report written to ${out}`);
}

if (process.argv[1] && process.argv[1].includes('balance')) main();
