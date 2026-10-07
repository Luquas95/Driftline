import { describe, expect, it } from 'vitest';
import { Bot, netWorth, type Strategy } from '../src/sim/bots';
import { runOne, median } from '../src/sim/balance';
import { newGame } from '../src/core/start';
import { feesFor } from '../src/core/economy';
import { stationOf } from '../src/core/state';

describe('bots (headless play-through)', () => {
  const strategies: Strategy[] = ['trader', 'oracle', 'miner', 'explorer', 'hauler', 'loop'];
  for (const strategy of strategies) {
    it(`${strategy} plays 40 days without errors and stays solvent`, () => {
      const s = newGame({ seed: `BOT-${strategy}`, galaxySize: 160 });
      const bot = new Bot(s, strategy);
      const run = bot.play(40);
      expect(run.daysPlayed).toBeGreaterThanOrEqual(40);
      expect(netWorth(s)).toBeGreaterThan(0);
      expect(s.credits).toBeGreaterThanOrEqual(0);
    });
  }

  it('is reproducible: same seed and strategy give the same result', () => {
    const a = runOne('trader', 'REPRO', 30, 150);
    const b = runOne('trader', 'REPRO', 30, 150);
    expect(b.finalWorth).toBe(a.finalWorth);
    expect(b.jumps).toBe(a.jumps);
  });

  it('no strategy gets rich absurdly fast (no runaway profit loop)', () => {
    const incomes = Array.from({ length: 4 }, (_, i) => runOne('oracle', `RICH${i}`, 60, 200).income);
    expect(median(incomes)).toBeLessThan(1500);
  });

  it('difficulty changes fees', () => {
    const easy = newGame({ seed: 'DIFF', galaxySize: 80, difficulty: { prices: 'easy' } });
    const hard = newGame({ seed: 'DIFF', galaxySize: 80, difficulty: { prices: 'hard' } });
    const st = stationOf(easy, easy.location.stationId!);
    expect(feesFor(st, easy.difficulty, false).spread).toBeLessThan(
      feesFor(st, hard.difficulty, false).spread,
    );
    expect(feesFor(st, easy.difficulty, true).tariff).toBe(0);
  });

  it('new games honour the seed and offer a random one otherwise', () => {
    const a = newGame({ seed: 'MYSEED', galaxySize: 60 });
    const b = newGame({ seed: 'MYSEED', galaxySize: 60 });
    expect(a.location).toEqual(b.location);
    expect(newGame({ galaxySize: 60, entropy: 7 }).seed).toMatch(/^[A-Z2-9]{6}$/);
  });
});
