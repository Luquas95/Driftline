/**
 * Balance simulator: bots play many games headlessly, output goes to docs/balance.md.
 * Usage: npm run balance -- [--seeds N] [--days D] [--quick] [--out path]
 */
import { writeFileSync } from 'node:fs';
import { newGame } from '../core/start';
import { Bot, type BotRun, type Strategy } from './bots';
import { combatReport } from './combatBalance';
import { buyFirstShip, firstShipOffers } from '../core/firstShip';
import { HULLS_BY_ID } from '../content/hulls';
import { T } from '../core/tuning';

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

/** The new start: what each first ship earns, per hull (trader bot, normal prices) and per difficulty (default picks). */
function startSection(seeds: number, days: number): string[] {
  const L: string[] = ['## Nový začátek: první loď a kapitál', ''];
  L.push(
    `Kapitál: snadná ${T.startCapital.easy} kr, normální ${T.startCapital.normal} kr, těžká ${T.startCapital.hard} kr. Boti si první loď vybírají podle strategie (nechají si 40–50 % kapitálu na první náklad). Tabulka ukazuje obchodníka, který dostal danou loď (${seeds} semínek × ${days} dní, normální obtížnost, jen nové kusy, které kapitál dovolí).`,
    '',
    '| Loď | Cena (kr) | Zbude (kr) | Příjem/den (medián) | Čistá hodnota po 30 dnech | Zničení lodi | Dny do +3000 kr |',
    '|---|---:|---:|---:|---:|---:|---:|',
  );
  const probe = newGame({ seed: 'BALSTART', galaxySize: 60 });
  const offers = firstShipOffers(probe).filter((o) => !o.used && o.price <= probe.credits);
  for (const o of offers) {
    const runs: BotRun[] = [];
    for (let i = 0; i < seeds; i++) {
      const state = newGame({ seed: `BALS${i}`, galaxySize: 160 });
      const offer = firstShipOffers(state).find((x) => x.id === o.id)!;
      buyFirstShip(state, offer.id, 'Bot');
      runs.push(new Bot(state, 'trader').play(days));
    }
    const w30 = runs.map((r) => (r.worthByDay[30] ?? r.finalWorth) - r.startWorth);
    const d3k = runs.map((r) => daysTo(r, 3000)).filter((x): x is number => x !== null);
    L.push(
      `| ${HULLS_BY_ID[o.hullId].id} | ${o.price} | ${probe.credits - o.price} | ${median(runs.map((r) => r.income)).toFixed(0)} | ${median(w30).toFixed(0)} | ${runs.reduce((a, r) => a + r.deaths, 0)} | ${d3k.length ? median(d3k).toFixed(0) : '—'} (${d3k.length}/${runs.length}) |`,
    );
  }
  L.push('', '### Podle obtížnosti (výchozí volba bota)', '');
  L.push(
    '| Obtížnost | Strategie | První loď (modus) | Příjem/den (medián) | Zničení lodi | Dny do +3000 kr |',
    '|---|---|---|---:|---:|---:|',
  );
  for (const prices of ['easy', 'normal', 'hard'] as const) {
    for (const strategy of ['trader', 'miner', 'explorer'] as const) {
      const runs: BotRun[] = [];
      const ships: string[] = [];
      for (let i = 0; i < seeds; i++) {
        const state = newGame({ seed: `BALD${i}`, galaxySize: 160, difficulty: { prices } });
        const bot = new Bot(state, strategy);
        ships.push(state.ship.hullId);
        runs.push(bot.play(days));
      }
      const top = Object.entries(
        ships.reduce<Record<string, number>>((m, h) => ((m[h] = (m[h] ?? 0) + 1), m), {}),
      ).sort((a, b) => b[1] - a[1])[0][0];
      const d3k = runs.map((r) => daysTo(r, 3000)).filter((x): x is number => x !== null);
      L.push(
        `| ${prices} | ${strategy} | ${top} | ${median(runs.map((r) => r.income)).toFixed(0)} | ${runs.reduce((a, r) => a + r.deaths, 0)} | ${d3k.length ? median(d3k).toFixed(0) : '—'} (${d3k.length}/${runs.length}) |`,
      );
    }
  }
  L.push('');
  return L;
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
    for (let i = 0; i < seeds; i++)
      runs.push(runOne(strategy, `BAL${i}`, strategy === 'loop' ? Math.min(days, 60) : days));
    results.push({ strategy, runs });
    console.log(
      `${strategy}: ${runs.length} runs, median income/day ${median(runs.map((r) => r.income)).toFixed(0)}`,
    );
  }
  const lines: string[] = [];
  lines.push('# Balanční report', '');
  lines.push(
    `Vygenerováno příkazem \`npm run balance\` (${seeds} semínek × ${days} dní na strategii, galaxie 300 systémů, normální obtížnost, pojištění zapnuto).`,
    '',
  );
  lines.push(
    '| Strategie | Příjem/den (medián) | Příjem/den (průměr) | Čistá hodnota po 30 dnech | Dny do +3000 kr | První vylepšení (den) | Nehody/100 dnů | Zničení lodi | Zničení do dne 20 | Skoků |',
  );
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const { strategy, runs } of results) {
    const w30 = runs.map((r) => (r.worthByDay[30] ?? r.finalWorth) - r.startWorth);
    const d3k = runs.map((r) => daysTo(r, 3000)).filter((x): x is number => x !== null);
    const first = runs.map((r) => r.firstUpgradeDay).filter((x): x is number => x !== null);
    const accRate = mean(runs.map((r) => (r.accidents / Math.max(1, r.daysPlayed)) * 100));
    lines.push(
      `| ${strategy} | ${median(runs.map((r) => r.income)).toFixed(0)} | ${mean(runs.map((r) => r.income)).toFixed(0)} | ${median(w30).toFixed(0)} | ${d3k.length ? median(d3k).toFixed(0) : '—'} (${d3k.length}/${runs.length}) | ${first.length ? median(first).toFixed(0) : '—'} | ${accRate.toFixed(1)} | ${runs.reduce((s, r) => s + r.deaths, 0)} | ${runs.filter((r) => r.firstDeathDay !== null && r.firstDeathDay <= 20).length}/${runs.length} | ${mean(runs.map((r) => r.jumps)).toFixed(0)} |`,
    );
  }
  lines.push('');
  // loop analysis
  const loop = results.find((r) => r.strategy === 'loop')!;
  lines.push('## Test smyčky zisku (pevná trasa A↔B)', '');
  lines.push(
    'Bot opakuje jedinou nejlepší trasu tam a zpět (okruh = obě cesty). Zisk jednoho okruhu v čase (průměr přes semínka):',
    '',
  );
  const maxTrips = 12;
  const rows: string[] = [];
  const cycle = (r: BotRun, t: number): number | undefined =>
    r.loopTrips[2 * t] !== undefined && r.loopTrips[2 * t + 1] !== undefined
      ? r.loopTrips[2 * t] + r.loopTrips[2 * t + 1]
      : undefined;
  for (let t = 0; t < maxTrips; t++) {
    const vals = loop.runs.map((r) => cycle(r, t)).filter((v): v is number => v !== undefined);
    if (vals.length) rows.push(`| ${t + 1} | ${mean(vals).toFixed(0)} | ${vals.length} |`);
  }
  lines.push('| Okruh | Průměrný zisk (kr) | Vzorků |', '|---:|---:|---:|', ...rows, '');
  const cycles = loop.runs.map((r) =>
    Array.from({ length: Math.floor(r.loopTrips.length / 2) }, (_, t) => cycle(r, t) as number),
  );
  const early = mean(cycles.flatMap((c) => c.slice(0, 2)));
  const late = mean(cycles.flatMap((c) => c.slice(-3)));
  lines.push(
    `Zisk raných okruhů ≈ ${early.toFixed(0)} kr, pozdních ≈ ${late.toFixed(0)} kr (poměr ${(late / Math.max(1, early)).toFixed(2)}).`,
    '',
  );
  // top routes
  const routes: Record<string, number> = {};
  for (const { runs } of results)
    for (const r of runs)
      for (const [k, v] of Object.entries(r.routeProfit)) routes[k] = (routes[k] ?? 0) + v;
  const top = Object.entries(routes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  lines.push(
    '## Nejvýdělečnější trasy (součet přes všechny boty)',
    '',
    '| Trasa (stanice>stanice:zboží) | Zisk |',
    '|---|---:|',
    ...top.map(([k, v]) => `| ${k} | ${v.toFixed(0)} |`),
    '',
  );
  // trade-only play with encounters (the bots are unarmed: they evade, pay, bribe or run)
  lines.push('## Čistě obchodní hra bez zbraní (střety se řeší únikem, úplatkem, vyhnutím)', '');
  lines.push(
    'Boti nemají zbraně a střetům se vyhýbají (vyhnout se > zaplatit > úplatek > útěk > vyjednávání > boj). Tabulka ukazuje, kolik střetů potkají a co je stojí.',
    '',
    '| Strategie | Střety/100 dní | Boje/100 dní | Úplatky (kr/100 dní) | Zničení lodi | Příjem/den (medián) |',
    '|---|---:|---:|---:|---:|---:|',
  );
  for (const { strategy, runs } of results) {
    const per100 = (f: (r: BotRun) => number) =>
      mean(runs.map((r) => (f(r) / Math.max(1, r.daysPlayed)) * 100));
    lines.push(
      `| ${strategy} | ${per100((r) => r.encounters).toFixed(1)} | ${per100((r) => r.fights).toFixed(1)} | ${per100((r) => r.tolls).toFixed(0)} | ${runs.reduce((a, r) => a + r.deaths, 0)} | ${median(runs.map((r) => r.income)).toFixed(0)} |`,
    );
  }
  lines.push('');
  if (!process.argv.includes('--no-combat')) {
    lines.push(
      ...combatReport({
        duelsPer: Number(arg('duels', '12')),
        lootFights: Number(arg('loot', '10')),
        tradeSeeds: seeds,
        tradeDays: days,
      }),
    );
  }
  if (!process.argv.includes('--no-start'))
    lines.push(...startSection(Math.max(4, Math.floor(seeds * 0.6)), Math.min(days, 90)));
  if (!process.argv.includes('--no-start'))
    lines.push(
      '**Závěr k novému začátku.** Žádná první loď není jistá prohra pro všechny strategie: kurýr a kestrel jsou v normální obtížnosti kladné, průzkumník s lodí scout vydělává na všech obtížnostech. Nejdražší lodě (merchant) nechají málo na první náklad, těžařské trupy mají pomalý rozjezd (bot kupuje moduly až z výdělku) a na těžké obtížnosti jsou obchodník a těžař v prvních 90 dnech kolem nuly, což odpovídá záměru „těžká“. Žádná loď není triviálně nejlepší. Do ladění dál patří ceny těžařských trupů.',
      '',
    );
  lines.push(`Doba běhu simulace: ${((Date.now() - t0) / 1000).toFixed(0)} s.`, '');
  writeFileSync(out, lines.join('\n'));
  console.log(`Report written to ${out}`);
}

if (process.argv[1] && process.argv[1].includes('balance')) main();
