import { expect, test } from '@playwright/test';
import { closeTrade, clearModals, openScreen, startGame, state } from './helpers';

test.describe('core game flow', () => {
  test('new game starts at a station with credits and a ship', async ({ page }) => {
    await startGame(page);
    await expect(page.getByTestId('top-credits')).toContainText('2');
    await expect(page.getByTestId('station-name')).toBeVisible();
    const s = await state(page);
    expect(s.credits).toBe(2500);
    expect(s.day).toBe(0);
    expect(s.seed).toBe('E2E1');
  });

  test('tutorial guides through the first trade and can be skipped', async ({ page }) => {
    await startGame(page, { tutorial: true });
    const tut = page.getByTestId('tutorial');
    await expect(tut).toContainText('1/5');
    const row = page
      .locator('[data-testid^="good-"]')
      .filter({ hasNotText: /chlazené|citlivé|nelegální|nebezpečné/ })
      .first();
    await row.click();
    await page.getByTestId('trade-max-buy').click();
    await page.getByTestId('btn-buy').click();
    await closeTrade(page);
    await expect(tut).toContainText('2/5');
    await page.getByTestId('tutorial-skip').click();
    await expect(tut).toBeHidden();
  });

  test('buy goods, jump to a neighbouring system, dock and sell', async ({ page }) => {
    await startGame(page);
    const before = await state(page);
    // buy
    const row = page
      .locator('[data-testid^="good-"]')
      .filter({ hasNotText: /chlazené|citlivé|nelegální|nebezpečné/ })
      .first();
    const goodId = ((await row.getAttribute('data-testid')) ?? '').replace('good-', '');
    await row.click();
    await page.getByTestId('trade-qty').fill('30');
    await page.getByTestId('btn-buy').click();
    await closeTrade(page);
    const afterBuy = await state(page);
    expect(afterBuy.credits).toBeLessThan(before.credits);
    expect(afterBuy.cargo.reduce((a: number, c: { qty: number }) => a + c.qty, 0)).toBeGreaterThan(0);
    // jump
    await openScreen(page, 'map');
    const target = await page.evaluate(() => window.__dl.neighborWithStation());
    expect(target).not.toBeNull();
    await page.evaluate((id) => window.__dl.select(id), target);
    await expect(page.getByTestId('route-plan')).toBeVisible();
    await page.getByTestId('btn-jump').click();
    await clearModals(page);
    const afterJump = await state(page);
    expect(afterJump.location.systemId).toBe(target);
    expect(afterJump.day).toBeGreaterThan(0);
    expect(afterJump.ship.fuel).toBeLessThan(before.ship.fuel);
    expect(afterJump.stats.jumps).toBe(1);
    // dock
    await openScreen(page, 'system');
    await page.locator('[data-testid^="btn-dock-"]').first().click();
    await clearModals(page);
    await expect(page.getByTestId('screen-station')).toBeVisible();
    // sell (if this station buys the good; otherwise just verify the table renders)
    const sellRow = page.getByTestId(`good-${goodId}`);
    if (await sellRow.count()) {
      const credits = (await state(page)).credits;
      await sellRow.click();
      await page.getByTestId('trade-qty').fill('30');
      await page.getByTestId('btn-sell').click();
      await closeTrade(page);
      expect((await state(page)).credits).toBeGreaterThan(credits);
    } else {
      await expect(page.getByTestId('goods-table')).toBeVisible();
    }
  });

  test('accept a contract and see it in the journal', async ({ page }) => {
    await startGame(page);
    await page.getByTestId('tab-contracts').click();
    const accepts = page.locator('[data-testid^="accept-"]');
    const n = await accepts.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      await accepts.nth(i).click();
      if ((await state(page)).contracts.length > 0) break;
    }
    expect((await state(page)).contracts.length).toBeGreaterThan(0);
    await openScreen(page, 'journal');
    await expect(page.locator('[data-testid^="contract-"]').first()).toBeVisible();
  });

  test('buy a cargo module and install it: capacity grows', async ({ page }) => {
    await startGame(page);
    await page.getByTestId('tab-shipyard').click();
    const before = await state(page);
    const row = page.getByTestId('shop-cargo_s-C').first();
    await row.getByRole('button').click();
    await page.getByTestId('tab-inventory').click();
    await page.locator('[data-testid^="btn-install-"]').first().click();
    await page.locator('[data-testid^="slot-pick-"]:not([disabled])').first().click();
    await page.getByTestId('btn-install-confirm').click();
    const after = await state(page);
    const cargoMods = (s: { ship: { slots: ({ defId: string } | null)[] } }) =>
      s.ship.slots.filter((m) => m && m.defId.startsWith('cargo_')).length;
    expect(cargoMods(after)).toBe(cargoMods(before) + 1);
    expect(after.credits).toBeLessThan(before.credits);
    await openScreen(page, 'cargo');
    await expect(page.getByTestId('cargo-board')).toBeVisible();
  });

  test('ship screen: power balance and module toggling', async ({ page }) => {
    await startGame(page);
    await openScreen(page, 'ship');
    await expect(page.getByTestId('power-panel')).toBeVisible();
    await page.getByTestId('slot-6').click(); // sensors
    await page.getByTestId('btn-toggle-module').click();
    const s = await state(page);
    expect(s.ship.slots[6].enabled).toBe(false);
    await expect(page.getByTestId('slot-grid')).toBeVisible();
  });

  test('cargo grid: drag a container to another cell, rotate and auto-arrange', async ({ page }) => {
    await startGame(page);
    const row = page
      .locator('[data-testid^="good-"]')
      .filter({ hasNotText: /chlazené|citlivé|nelegální|nebezpečné/ })
      .first();
    await row.click();
    await page.getByTestId('trade-qty').fill('40');
    await page.getByTestId('btn-buy').click();
    await closeTrade(page);
    await openScreen(page, 'cargo');
    const item = page.locator('[data-testid^="cargo-item-"]').first();
    const box = await item.boundingBox();
    expect(box).not.toBeNull();
    const before = (await state(page)).cargo[0];
    await page.mouse.move(box!.x + 10, box!.y + 10);
    await page.mouse.down();
    await page.mouse.move(box!.x + 10 + 120, box!.y + 10 + 60, { steps: 6 });
    await page.mouse.up();
    const after = (await state(page)).cargo[0];
    expect(after.x !== before.x || after.y !== before.y).toBe(true);
    await page.getByTestId('btn-autoarrange').click();
    const arranged = (await state(page)).cargo[0];
    expect(arranged.x).toBe(0);
    expect(arranged.y).toBe(0);
  });

  test('saving and loading restores the game, the autosave survives a reload', async ({ page }) => {
    await startGame(page);
    await page.getByTestId('btn-refuel').isDisabled();
    await openScreen(page, 'settings');
    await page.getByTestId('save-slot1').click();
    const saved = await state(page);
    // change something: wait a day by buying probes
    await openScreen(page, 'station');
    await page.getByRole('button', { name: '+5' }).click();
    expect((await state(page)).credits).toBeLessThan(saved.credits);
    await openScreen(page, 'settings');
    await page.getByTestId('load-slot1').click();
    await expect(page.getByTestId('screen-station')).toBeVisible();
    expect((await state(page)).credits).toBe(saved.credits);
    // autosave + reload
    await page.waitForTimeout(2200);
    await page.reload();
    await page.getByTestId('menu-continue').click();
    await expect(page.getByTestId('screen-station')).toBeVisible();
    expect((await state(page)).seed).toBe('E2E1');
  });

  test('keyboard shortcuts and help', async ({ page }) => {
    await startGame(page);
    await page.keyboard.press('m');
    await expect(page.getByTestId('screen-map')).toBeVisible();
    await page.keyboard.press('l');
    await expect(page.getByTestId('screen-ship')).toBeVisible();
    await page.keyboard.press('c');
    await expect(page.getByTestId('screen-cargo')).toBeVisible();
    await page.keyboard.press('j');
    await expect(page.getByTestId('screen-journal')).toBeVisible();
    await page.keyboard.press('?');
    await expect(page.getByTestId('modal-help')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('modal-help')).toBeHidden();
  });

  test('permadeath option is offered and shown in settings', async ({ page }) => {
    await page.goto('/?e2e=1');
    await page.getByTestId('menu-new').click();
    await page.getByTestId('new-permadeath').check();
    await page.getByTestId('menu-start').click();
    await openScreen(page, 'settings');
    await expect(page.getByTestId('seed-display')).toBeVisible();
    expect((await state(page)).difficulty.permadeath).toBe(true);
  });

  test('map accepts real pointer input: clicking a star selects it', async ({ page }) => {
    await startGame(page);
    await openScreen(page, 'map');
    await page.waitForTimeout(1500);
    const target = await page.evaluate(() => window.__dl.neighborWithStation());
    const d = await page.evaluate((id) => window.__dl.delta(id as number), target);
    const vp = page.viewportSize()!;
    await page.mouse.click(vp.width / 2 + d.dx * 11, vp.height / 2 + d.dy * 11);
    await expect(page.getByTestId('route-plan')).toBeVisible();
  });
});
