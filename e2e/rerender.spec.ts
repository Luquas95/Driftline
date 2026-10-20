import { expect, test } from '@playwright/test';
import { openScreen, startGame, state } from './helpers';

// GameState is mutated in place, so a component that reads `game` but not `rev` (or `analysis`) and has no
// hook state is skipped by @preact/signals when its parent re-renders with the same props.
// Each test changes the state the way an action does (mutation + rev bump) and expects the view to follow.
test.describe('views follow in-place state changes', () => {
  test('ship screen: a swapped-in module leaves the "from inventory" list', async ({ page }) => {
    await startGame(page);
    await page.getByTestId('tab-shipyard').click();
    await page.getByTestId('shop-cargo_s-C').first().getByRole('button').click();
    // a second spare, so the list stays mounted after the first swap
    await page.evaluate(() => {
      const inv = window.__dl.state().inventory;
      inv.push({ ...inv[0], uid: `${inv[0].uid}-copy` });
      window.__dl.bump();
    });
    const [a, b] = ((await state(page)).inventory as { uid: string }[]).map((m) => m.uid);
    await openScreen(page, 'ship');
    const card = page.getByTestId(`from-inv-${a}`);
    const slots: unknown[] = (await state(page)).ship.slots;
    let slot = -1;
    for (let i = 0; i < slots.length && slot < 0; i++) {
      if (!slots[i]) continue; // swap into an occupied slot: the panel keeps its place in the tree
      await page.getByTestId(`slot-${i}`).click();
      if (await card.isVisible()) slot = i;
    }
    expect(slot).toBeGreaterThanOrEqual(0);
    await card.getByRole('button').click();
    expect((await state(page)).ship.slots[slot].uid).toBe(a);
    await expect(card).toHaveCount(0);
    await expect(page.getByTestId(`from-inv-${b}`)).toBeVisible();
  });

  test('crew screen: hire buttons follow the credit balance', async ({ page }) => {
    await startGame(page);
    await openScreen(page, 'crew');
    await page.getByTestId('tab-hire').click();
    const hire = page.locator('[data-testid^="hire-"]').first();
    await expect(hire).toBeEnabled();
    await page.evaluate(() => {
      window.__dl.state().credits = 0;
      window.__dl.bump();
    });
    await expect(hire).toBeDisabled();
  });

  test('map: tow offer appears when stranded and disappears after the tow', async ({ page }) => {
    await startGame(page);
    await openScreen(page, 'map');
    await expect(page.getByTestId('stranded')).toHaveCount(0);
    await page.evaluate(() => {
      window.__dl.state().ship.fuel = 0;
      window.__dl.bump();
    });
    await expect(page.getByTestId('stranded')).toBeVisible();
    await page.getByTestId('btn-tow').click();
    expect((await state(page)).ship.fuel).toBeGreaterThan(0);
    await expect(page.getByTestId('stranded')).toHaveCount(0);
  });

  test('starving to death on the way shows the respawn dialog', async ({ page }) => {
    await startGame(page);
    await openScreen(page, 'map');
    await page.evaluate(() => {
      const s = window.__dl.state();
      s.ship.fuel = 0;
      s.ship.supplies = 0;
      s.ship.hp = 1;
      window.__dl.bump();
    });
    // the tow takes days, so the empty larder destroys the ship on the way
    await page.getByTestId('btn-tow').click();
    expect((await state(page)).stats.deaths).toBe(1);
    await expect(page.getByTestId('modal-respawn')).toBeVisible();
  });
});
