import { expect, test, type Page } from '@playwright/test';
import { openScreen, startGame } from './helpers';

const cheat = (page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(
    ({ fn, args }) => (window as any).__dl.cheat[fn](...args), // eslint-disable-line @typescript-eslint/no-explicit-any
    { fn, args },
  );

async function shot(page: Page, name: string) {
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__dl.freeze(3));
  await page.waitForTimeout(250);
  await expect(page).toHaveScreenshot(`${name}.png`, {
    animations: 'disabled',
    maxDiffPixelRatio: 0.05,
    timeout: 60_000,
  });
}

/** Snapshots of the endgame screens: factions and the Grey on the map, base, research, ending. */
test.describe('visual snapshots: endgame', () => {
  test.beforeEach(async ({ page }) => {
    await startGame(page, { seed: 'VISUAL-END' });
    await page.evaluate(() => window.__dl.setAnim('off'));
  });

  test('map with factions', async ({ page }) => {
    await cheat(page, 'revealGalaxy');
    await openScreen(page, 'map');
    await page.getByTestId('filter-factions').click();
    await shot(page, 'map-factions');
  });

  test('map with the Grey', async ({ page }) => {
    await cheat(page, 'revealGalaxy');
    await cheat(page, 'grey', 200);
    await openScreen(page, 'map');
    await page.getByTestId('filter-threat').click();
    await shot(page, 'map-threat');
  });

  test('factions screen', async ({ page }) => {
    await openScreen(page, 'factions');
    await shot(page, 'factions');
  });

  test('base screen', async ({ page }) => {
    await cheat(page, 'quickBase', { mine: 2, warehouse: 2, lab: 2, defense: 1, shipyard: 1, port: 1 });
    await openScreen(page, 'base');
    await shot(page, 'base');
  });

  test('research tree', async ({ page }) => {
    await cheat(page, 'quickBase', { lab: 2 });
    await cheat(page, 'research', 300);
    await openScreen(page, 'base');
    await page.getByTestId('tab-research').click();
    await shot(page, 'research');
  });

  test('ending screen', async ({ page }) => {
    await cheat(page, 'ending', 'accord');
    await expect(page.getByTestId('ending-screen')).toBeVisible();
    await shot(page, 'ending');
  });
});
