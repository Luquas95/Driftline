import { expect, test } from '@playwright/test';
import { clearModals, openScreen, startGame, state } from './helpers';

/** Cheats exist only in builds made with VITE_E2E=1 (the playwright web server does that). */
const cheat = <T = unknown>(page: import('@playwright/test').Page, fn: string, ...args: unknown[]) =>
  page.evaluate(
    ({ fn, args }) => {
      const c = (window as any).__dl.cheat; // eslint-disable-line @typescript-eslint/no-explicit-any
      return c[fn](...args) as T;
    },
    { fn, args },
  );

test.describe('endgame: base, research, fleet, factions, endings', () => {
  test.beforeEach(async ({ page }) => {
    await startGame(page, { seed: 'E2E-END' });
    await page.evaluate(() => window.__dl.setAnim('off'));
  });

  test('found a base from the system view, build and research', async ({ page }) => {
    await cheat(page, 'credits', 120000);
    await cheat(page, 'goods', 'construction', 40);
    await cheat(page, 'goods', 'machinery', 12);
    await cheat(page, 'detectHere');
    await openScreen(page, 'system');
    await page.getByTestId('body-0').click();
    await expect(page.getByTestId('btn-found-base')).toBeEnabled();
    await page.getByTestId('btn-found-base').click();
    await expect(page.getByTestId('screen-base')).toBeVisible();
    expect((await state(page)).base).not.toBeNull();
    // materials for buildings
    await cheat(page, 'baseGoods', 'construction', 200);
    await cheat(page, 'baseGoods', 'machinery', 100);
    await cheat(page, 'baseGoods', 'electronics', 50);
    await page.getByTestId('tab-buildings').click();
    await page.getByTestId('build-lab').click();
    await page.waitForTimeout(500);
    await expect(page.getByTestId('bld-lab')).toContainText('Hotovo');
    await cheat(page, 'finishBuilds');
    await cheat(page, 'days', 1);
    await page.getByTestId('tab-buildings').click();
    expect((await state(page)).base.buildings.lab).toBe(1);
    // research
    await cheat(page, 'research', 500);
    await page.getByTestId('tab-research').click();
    await page.getByTestId('research-deep_scan').click();
    await expect(page.getByTestId('tech-deep_scan')).toHaveClass(/active/);
    await cheat(page, 'days', 10);
    await page.getByTestId('tab-research').click();
    await expect(page.getByTestId('tech-deep_scan')).toHaveClass(/done/);
  });

  test('a ship in the hangar takes a trade route', async ({ page }) => {
    await cheat(page, 'credits', 200000);
    await cheat(page, 'goods', 'construction', 40);
    await cheat(page, 'goods', 'machinery', 12);
    await cheat(page, 'detectHere');
    await openScreen(page, 'system');
    await page.getByTestId('body-0').click();
    await page.getByTestId('btn-found-base').click();
    await expect(page.getByTestId('screen-base')).toBeVisible();
    // give the base a hangar with a ship (state edit through the order machinery)
    await cheat(page, 'baseGoods', 'construction', 400);
    await cheat(page, 'baseGoods', 'machinery', 200);
    await cheat(page, 'baseGoods', 'alloys', 100);
    await cheat(page, 'baseGoods', 'electronics', 100);
    for (const id of ['shipyard', 'hangar']) {
      await page.getByTestId('tab-buildings').click();
      await page.getByTestId(`build-${id}`).click();
      await cheat(page, 'finishBuilds');
      await cheat(page, 'days', 1);
    }
    await page.getByTestId('tab-production').click();
    await page
      .locator('select[aria-label]')
      .filter({ hasText: /Objednat loď/ })
      .selectOption({ index: 1 });
    await page.getByTestId('order-hull').click();
    await cheat(page, 'finishBuilds');
    await cheat(page, 'days', 1);
    await page.getByTestId('tab-fleet').click();
    const s = await state(page);
    expect(s.base.hangar.length).toBe(1);
    await page.getByTestId('fleet-order-guard').click();
    expect((await state(page)).base.hangar[0].order).toBe('guard');
    await page.getByTestId('fleet-order-idle').click();
    await expect(page.getByTestId('base-fleet')).toBeVisible();
  });

  test('reputation changes prices and the faction screen shows it', async ({ page }) => {
    const sys = await page.evaluate(() => window.__dl.state().location.systemId);
    expect(sys).toBeGreaterThanOrEqual(0);
    const owner = await page.evaluate(() => {
      const s = window.__dl.state();
      return Object.keys(s.fac.rep)[0] as string;
    });
    await openScreen(page, 'factions');
    await expect(page.getByTestId(`fac-${owner}`)).toBeVisible();
    await cheat(page, 'rep', owner, -90);
    const lowTariff = await cheat<number | null>(page, 'tariff');
    await cheat(page, 'rep', owner, 190);
    const highTariff = await cheat<number | null>(page, 'tariff');
    if (lowTariff !== null && highTariff !== null) expect(highTariff).toBeLessThanOrEqual(lowTariff);
    await openScreen(page, 'factions');
    await expect(page.getByTestId(`fac-${owner}`)).toContainText('Spojenec');
  });

  test('a saving ending shows the summary and the game can continue', async ({ page }) => {
    await cheat(page, 'ending', 'science');
    await clearModals(page);
    await expect(page.getByTestId('ending-screen')).toBeVisible();
    await expect(page.getByTestId('ending-title')).toBeVisible();
    await page.getByTestId('ending-continue').click();
    await expect(page.getByTestId('ending-screen')).toHaveCount(0);
    const s = await state(page);
    expect(s.ending.id).toBe('science');
    expect(s.flags.endingSeen).toBe(1);
  });

  test('a lost galaxy offers only a new game', async ({ page }) => {
    await cheat(page, 'ending', 'consumed');
    await clearModals(page);
    await expect(page.getByTestId('ending-screen')).toBeVisible();
    await expect(page.getByTestId('ending-continue')).toHaveCount(0);
    await expect(page.getByTestId('ending-new')).toBeVisible();
  });

  test('journal tabs: story, dictionary, threat, achievements', async ({ page }) => {
    await openScreen(page, 'journal');
    await page.getByTestId('tab-story').click();
    await expect(page.getByTestId('journal-story')).toBeVisible();
    await cheat(page, 'words', 5);
    await page.getByTestId('tab-language').click();
    await expect(page.getByTestId('journal-lang')).toBeVisible();
    await page.getByTestId('tab-threat').click();
    await expect(page.getByTestId('journal-threat')).toBeVisible();
    await page.getByTestId('tab-ach').click();
    await expect(page.getByTestId('journal-ach')).toBeVisible();
  });
});
