import { expect, test, type Page } from '@playwright/test';
import { clearModals, openScreen, startGame, state } from './helpers';

async function viewport(page: Page) {
  return page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
}

test.describe('new game: first ship', () => {
  test('offers are sorted from the cheapest, buying one starts the game', async ({ page }) => {
    await startGame(page, { seed: 'E2E-FIRST', quick: false, tutorial: true });
    await expect(page.getByTestId('screen-firstship')).toBeVisible();
    const s0 = await state(page);
    expect(s0.noShip).toBe(true);
    expect(s0.credits).toBe(40000);
    const prices = await page
      .locator('[data-testid^="offer-"]')
      .evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-price'))));
    expect(prices.length).toBeGreaterThanOrEqual(10);
    for (let i = 1; i < prices.length; i++) expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
    // pick the third offer, rename, buy
    await page.locator('[data-testid^="offer-"]').nth(2).click();
    await expect(page.getByTestId('first-left')).toContainText('kr');
    await page.getByTestId('first-name').fill('Zkušební');
    await page.getByTestId('btn-buy-ship').click();
    await expect(page.getByTestId('screen-station')).toBeVisible();
    const s1 = await state(page);
    expect(s1.noShip).toBe(false);
    expect(s1.ship.name).toBe('Zkušební');
    expect(s1.credits).toBe(40000 - prices[2]);
    await expect(page.getByTestId('tutorial')).toContainText('1/6');
  });

  test('an unaffordable ship cannot be bought', async ({ page }) => {
    await startGame(page, { seed: 'E2E-POOR', quick: false });
    const last = page.locator('[data-testid^="offer-"]').last();
    await last.click();
    await expect(page.getByTestId('btn-buy-ship')).toBeDisabled();
    expect((await state(page)).noShip).toBe(true);
  });
});

test.describe('system view', () => {
  test.beforeEach(async ({ page }) => {
    await startGame(page, { seed: 'E2E-SYS' });
    await page.evaluate(() => window.__dl.setAnim('off'));
    await openScreen(page, 'system');
    await page.waitForFunction(() => !!window.__dl.sys());
  });

  test('the ship of the player is drawn on screen', async ({ page }) => {
    const v = await viewport(page);
    const ship = await page.evaluate(() => window.__dl.sys()!.ship);
    expect(ship.x).toBeGreaterThan(0);
    expect(ship.x).toBeLessThan(v.w);
    expect(ship.y).toBeGreaterThan(0);
    expect(ship.y).toBeLessThan(v.h);
  });

  test('wheel zoom goes to the cursor and selecting a body works after zooming', async ({ page }) => {
    const b = await page.evaluate(() => window.__dl.sys()!.body(1)!);
    await page.mouse.move(b.x, b.y);
    for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -240);
    await page.waitForTimeout(250);
    const z = await page.evaluate(() => window.__dl.sys()!.zoom);
    expect(z).toBeGreaterThan(2);
    const after = await page.evaluate(() => window.__dl.sys()!.body(1)!);
    // the body under the cursor stays under it
    expect(Math.hypot(after.x - b.x, after.y - b.y)).toBeLessThan(6);
    await page.mouse.click(after.x, after.y);
    await expect(page.getByTestId('body-panel')).toBeVisible();
  });

  test('dragging pans the view and does not select', async ({ page }) => {
    const before = await page.evaluate(() => window.__dl.sys()!.cam);
    await page.mouse.move(700, 600);
    await page.mouse.down();
    await page.mouse.move(640, 560, { steps: 6 });
    await page.mouse.move(560, 520, { steps: 6 });
    await page.mouse.up();
    const after = await page.evaluate(() => window.__dl.sys()!.cam);
    expect(after.x).toBeLessThan(before.x - 40);
    expect(after.y).toBeLessThan(before.y - 20);
  });

  test('double click focuses a body; the reset button returns to the whole system', async ({ page }) => {
    const b = await page.evaluate(() => window.__dl.sys()!.body(1)!);
    await page.mouse.dblclick(b.x, b.y);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.__dl.sys()!.zoom)).toBeGreaterThan(3);
    await page.getByTestId('sys-zoom-reset').click();
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.__dl.sys()!.zoom)).toBeLessThan(1.2);
  });

  test('keyboard zoom works and there is a visible dock button', async ({ page }) => {
    await page.keyboard.press('+');
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__dl.sys()!.zoom)).toBeGreaterThan(1.2);
    await page.keyboard.press('0');
    await page.waitForTimeout(300);
    const dock = page.locator('[data-testid^="btn-dock-quick-"]').first();
    await expect(dock).toBeVisible();
    await dock.click();
    await expect(page.getByTestId('screen-station')).toBeVisible();
  });

  test('docking with animations on plays a flight that can be skipped', async ({ page }) => {
    await page.evaluate(() => window.__dl.setAnim('full'));
    await page.locator('[data-testid^="btn-dock-quick-"]').last().click();
    await expect.poll(() => page.evaluate(() => window.__dl.sys()?.flying ?? false)).toBe(true);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('screen-station')).toBeVisible({ timeout: 20_000 });
  });
});

test.describe('map and jumps', () => {
  test('after zooming the galaxy map can be dragged left and right', async ({ page }) => {
    await startGame(page, { seed: 'E2E-MAP' });
    await openScreen(page, 'map');
    await page.waitForFunction(() => !!window.__dl.map());
    await page.mouse.move(700, 450);
    for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -200);
    await page.waitForTimeout(300);
    const z = await page.evaluate(() => window.__dl.map()!.cam.zoom);
    expect(z).toBeGreaterThan(12);
    for (const dx of [-120, 220]) {
      const before = await page.evaluate(() => window.__dl.map()!.cam.x);
      await page.mouse.move(720, 450);
      await page.mouse.down();
      await page.mouse.move(720 + dx / 2, 450, { steps: 5 });
      await page.mouse.move(720 + dx, 450, { steps: 5 });
      await page.mouse.up();
      const after = await page.evaluate(() => window.__dl.map()!.cam.x);
      // dragging right moves the world right: the camera goes the other way
      expect(Math.sign(after - before)).toBe(-Math.sign(dx));
    }
  });

  test('a jump plays an animation that can be skipped, and is instant with animations off', async ({
    page,
  }) => {
    await startGame(page, { seed: 'E2E-JUMP' });
    await clearModals(page);
    await openScreen(page, 'map');
    const target = await page.evaluate(() => window.__dl.neighborWithStation());
    expect(target).not.toBeNull();
    await page.evaluate((id) => window.__dl.select(id), target);
    await page.evaluate(() => window.__dl.setAnim('off'));
    await page.getByTestId('btn-jump').click();
    expect(await page.evaluate(() => window.__dl.map()!.jumping)).toBe(false);
    expect((await state(page)).stats.jumps).toBe(1);
    await clearModals(page);
    // second jump with animation
    await page.evaluate(() => window.__dl.setAnim('full'));
    const back = await page.evaluate(() => window.__dl.state().location.systemId);
    void back;
    const next = await page.evaluate(() => {
      const s = window.__dl.state();
      return s.visited.find((v: number) => v !== s.location.systemId);
    });
    await page.evaluate((id) => window.__dl.select(id), next);
    await page.getByTestId('btn-jump').click();
    await expect.poll(() => page.evaluate(() => window.__dl.map()!.jumping)).toBe(true);
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => window.__dl.map()!.jumping), { timeout: 20_000 }).toBe(false);
    expect((await state(page)).stats.jumps).toBe(2);
  });
});

test.describe('feedback', () => {
  test('buying shows a visible confirmation and the credits update', async ({ page }) => {
    await startGame(page, { seed: 'E2E-BUY' });
    const row = page
      .locator('[data-testid^="good-"]')
      .filter({ hasNotText: /chlazené|citlivé|nelegální|nebezpečné/ })
      .first();
    await row.click();
    const before = (await state(page)).credits;
    await page.getByTestId('trade-max-buy').click();
    await page.getByTestId('btn-buy').click();
    await expect(page.getByTestId('trade-confirm')).toBeVisible();
    expect((await state(page)).credits).toBeLessThan(before);
  });
});
