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
    { id: 'crew', ready: 'screen-crew' },
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

  test('screen combat (paused, fixed seed)', async ({ page }) => {
    await page.evaluate(() => window.__dl.loadout(['energy_s', 'kinetic_m', 'shield_s', 'missile_m'], 4));
    await page.evaluate(() => window.__dl.encounter('raider', 2));
    await page.getByTestId('enc-fight').click();
    await expect(page.getByTestId('screen-combat')).toBeVisible();
    await page.evaluate(() => {
      window.__dl.state().combat.paused = true;
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => window.__dl.freeze(3));
    await page.waitForTimeout(250);
    await expect(page).toHaveScreenshot('combat.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.04,
      timeout: 60_000,
    });
  });
  test('screen system, planet detail after zoom', async ({ page, isMobile }) => {
    test.skip(isMobile, 'mouse gestures');
    await page.evaluate(() => window.__dl.setAnim('off'));
    await openScreen(page, 'system');
    await expect(page.getByTestId('screen-system')).toBeVisible();
    const b = await page.evaluate(() => window.__dl.sys()!.body(1)!);
    await page.mouse.dblclick(b.x, b.y);
    await expect
      .poll(() => page.evaluate(() => window.__dl.sys()!.zoom), { timeout: 20_000 })
      .toBeGreaterThan(3);
    await page.waitForTimeout(800);
    await page.evaluate(() => window.__dl.freeze(3));
    await page.waitForTimeout(250);
    await expect(page).toHaveScreenshot('system-detail.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.04,
      timeout: 60_000,
    });
  });

  test('screen map, mid jump', async ({ page }) => {
    await openScreen(page, 'map');
    const target = await page.evaluate(() => window.__dl.neighborWithStation());
    await page.evaluate((id) => window.__dl.select(id), target);
    await page.evaluate(() => window.__dl.setAnim('full'));
    await page.getByTestId('btn-jump').click();
    await expect.poll(() => page.evaluate(() => window.__dl.map()!.jumping)).toBe(true);
    await page.evaluate(() => window.__dl.map()!.seek(0.55));
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__dl.freeze(3));
    await page.waitForTimeout(250);
    await expect(page).toHaveScreenshot('map-jump.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.06,
      timeout: 60_000,
    });
  });
});

test.describe('visual snapshots: first ship', () => {
  test('first ship screen', async ({ page }) => {
    await startGame(page, { seed: 'VISUAL1', quick: false });
    await expect(page.getByTestId('screen-firstship')).toBeVisible();
    await page
      .waitForFunction(
        () => [...document.querySelectorAll('.offer-pic')].every((e) => e.querySelector('img')),
        null,
        {
          timeout: 60_000,
        },
      )
      .catch(() => {});
    await page.waitForTimeout(500);
    await page.evaluate(() => window.__dl.freeze(3));
    await page.waitForTimeout(250);
    await expect(page).toHaveScreenshot('first-ship.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.04,
      timeout: 60_000,
    });
  });
});
