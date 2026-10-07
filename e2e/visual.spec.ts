import { expect, test } from '@playwright/test';
import { openScreen, startGame } from './helpers';

/** Visual snapshots of the main screens with a fixed seed and a frozen animation clock. */
test.describe('visual snapshots', () => {
  test.beforeEach(async ({ page }) => {
    await startGame(page, { seed: 'VISUAL1' });
  });

  const shots: { id: string; ready: string }[] = [
    { id: 'station', ready: 'screen-station' },
    { id: 'map', ready: 'screen-map' },
    { id: 'system', ready: 'screen-system' },
    { id: 'ship', ready: 'screen-ship' },
    { id: 'cargo', ready: 'screen-cargo' },
    { id: 'journal', ready: 'screen-journal' },
  ];
  for (const sh of shots) {
    test(`screen ${sh.id}`, async ({ page }) => {
      await openScreen(page, sh.id);
      await expect(page.getByTestId(sh.ready)).toBeVisible();
      await page.waitForTimeout(500);
      await page.evaluate(() => window.__dl.freeze(3));
      await page.waitForTimeout(250);
      await expect(page).toHaveScreenshot(`${sh.id}.png`, {
        animations: 'disabled',
        maxDiffPixelRatio: 0.04,
        // software WebGL + backdrop blur make each capture slow; allow several to reach a stable one
        timeout: 60_000,
      });
    });
  }
});
