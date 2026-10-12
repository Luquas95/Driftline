/**
 * Endgame section of the balance report: how fast the Grey spreads, and how the endgame bots fare
 * (endings reached, pace of the story, share of passive income of the base and the fleet).
 */
import { newGame } from '../core/start';
import { simulateSpread } from '../core/threat';
import { playGame, TARGET_BY_STRATEGY, type EndgameRun } from './endgame';
import type { Strategy } from './bots';

const median = (a: number[]): number => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};

const STRATEGIES: Strategy[] = ['miner', 'explorer', 'trader', 'hauler'];

export function greySpeedSection(seeds: string[]): string[] {
  const lines = [
    '### Rychlost Šedi (bez zásahu hráče)',
    '',
    'Dny do pohlcení podílu galaxie, medián přes semínka; „zpomalená“ = plné zpomalení z výzkumu (strop 85 %).',
    '',
    '| Riziko | 20 % | 50 % | 80 % (konec „pohlceno“) | 80 % při plném zpomalení |',
    '|---|---:|---:|---:|---:|',
  ];
  for (const risk of ['low', 'normal', 'high'] as const) {
    const rows = seeds.map((seed) => {
      const s = newGame({ seed, difficulty: { risk }, quickStart: true });
      const f = (share: number, keep = false) => simulateSpread(s, share, 2500, keep);
      const slow = JSON.parse(JSON.stringify(s)) as typeof s;
      slow.threat.mitigation = 0.85;
      return [f(0.2), f(0.5), f(0.8), simulateSpread(slow, 0.8, 2500, true)];
    });
    const col = (i: number) => {
      const v = median(rows.map((r) => r[i]).filter(Number.isFinite));
      return v ? String(Math.round(v)) : '>2500';
    };
    lines.push(`| ${risk} | ${col(0)} | ${col(1)} | ${col(2)} | ${col(3)} |`);
  }
  lines.push('');
  return lines;
}

function scenarioRows(label: string, boost: number, seeds: string[]): string[] {
  const lines = [
    `#### ${label}`,
    '',
    '| Strategie (cíl) | Konce | Medián dne konce | Základna (den) | Příběh 5 (den) | Podíl pasivního příjmu (den ~200) | Pohlceno na konci |',
    '|---|---|---:|---:|---:|---:|---:|',
  ];
  for (const strategy of STRATEGIES) {
    const runs: EndgameRun[] = seeds.map((seed) =>
      playGame(seed, strategy, { maxDays: 650, incomeBoost: boost }),
    );
    const ends: Record<string, number> = {};
    for (const r of runs) ends[r.ending ?? 'nic'] = (ends[r.ending ?? 'nic'] ?? 0) + 1;
    const share = Object.entries(ends)
      .map(([k, v]) => `${k} ${v}/${runs.length}`)
      .join(', ');
    const med = (f: (r: EndgameRun) => number | null) => {
      const v = runs.map(f).filter((x): x is number => x !== null);
      return v.length ? String(Math.round(median(v))) : '—';
    };
    const passive = runs.map((r) => r.passiveMid).filter((x): x is number => x !== null);
    lines.push(
      `| ${strategy} (${TARGET_BY_STRATEGY[strategy]}) | ${share} | ${med((r) => r.endDay)} | ${med((r) => r.baseDay)} | ${med((r) => r.story5Day)} | ${passive.length ? `${Math.round(median(passive) * 100)} %` : '—'} | ${Math.round(median(runs.map((r) => r.consumedEnd)))} % |`,
    );
  }
  lines.push('');
  return lines;
}

export function endgameReport(opts: { seeds: number }): string[] {
  const seeds = Array.from({ length: opts.seeds }, (_, i) => `E${i + 1}`);
  return [
    '## Koncová hra: základna, frakce, Šeď a konce',
    '',
    ...greySpeedSection(seeds.slice(0, 4)),
    '### Boti v koncové hře',
    '',
    'Bot má ke stejným strategiím jako dosud správce základny: staví podle plánu cíle, zkoumá, plní příběhové zastávky a v závěru se pokusí o „svůj“ konec. Boti hrají s předpokladem: materiál na stavbu kupují přímo do skladu a skenování ložisek berou jako hotové. Druhý scénář přidává příjem navíc (model hráče, který vydělává víc než boti).',
    '',
    ...scenarioRows('Boti sami (příjem jen z obchodu)', 0, seeds),
    ...scenarioRows('Hráč s vyšším příjmem (+600 kr/den navíc)', 600, seeds),
    '**Čtení tabulky.** Bot je v koncové hře slabý: nechává Šeď růst a spoléhá na obchod. Každý ze čtyř koncových scénářů je dosažitelný (scénář s příběhem prochází `tests/story.test.ts`), tabulka ukazuje tempo, kterého dosáhne bot, ne strop hráče.',
    '',
  ];
}
