import { expect, test, type Page } from '@playwright/test';
import { clearModals, openScreen, startGame, state } from './helpers';

async function arm(page: Page, missiles = 4) {
  await page.evaluate(
    (m) => window.__dl.loadout(['energy_s', 'kinetic_m', 'shield_s', 'missile_m'], m),
    missiles,
  );
}

async function openEncounter(page: Page, enemy: string, tier: number) {
  await page.evaluate(([e, t]) => window.__dl.encounter(e as string, t as number), [enemy, tier]);
  await expect(page.getByTestId('modal-encounter')).toBeVisible();
}

test.describe('crew', () => {
  test('hire a crew member at a station', async ({ page }) => {
    await startGame(page, { seed: 'E2E-CREW' });
    await page.evaluate(() => {
      window.__dl.state().credits = 50000;
      (window as unknown as { __dl: { bump(): void } }).__dl.bump();
    });
    await openScreen(page, 'crew');
    const before = (await state(page)).crew.length;
    await page.getByTestId('tab-hire').click();
    const hire = page.locator('[data-testid^="hire-"]').first();
    await expect(hire).toBeVisible();
    await hire.click();
    expect((await state(page)).crew.length).toBe(before + 1);
    await page.getByTestId('tab-crew').click();
    await expect(page.getByTestId('crew-count')).toContainText(String(before + 1));
  });
});

test.describe('combat', () => {
  test('encounter dialogue, pause, targeting a room and a victory with loot', async ({ page }) => {
    await startGame(page, { seed: 'E2E-FIGHT' });
    await arm(page);
    await openEncounter(page, 'autoturret', 1);
    await page.getByTestId('enc-fight').click();
    await expect(page.getByTestId('screen-combat')).toBeVisible();
    // pause with the keyboard on desktop, with the button on touch screens
    const pause = page.getByTestId('btn-pause');
    if (await pause.isVisible().catch(() => false)) await pause.click();
    else {
      await page.getByTestId('tab-actions').click();
      await pause.click();
    }
    await expect(page.getByTestId('paused')).toBeVisible();
    const t0 = (await state(page)).combat.time;
    await page.waitForTimeout(600);
    expect((await state(page)).combat.time).toBe(t0);
    // select a weapon and tap an enemy room on the canvas
    const weaponsTab = page.getByTestId('tab-weapons');
    if (await weaponsTab.isVisible()) await weaponsTab.click();
    await page.getByTestId('weapon-1').click();
    const pos = await page.evaluate(() => window.__dl.roomPos('enemy', 0, 2));
    expect(pos).not.toBeNull();
    await page.mouse.click(pos!.x, pos!.y);
    const c = await state(page).then((s) => s.combat);
    expect(c.player.weapons[0].target).toEqual({ ship: 0, room: 2 });
    // let the AI finish the fight and check the loot screen
    const credits = (await state(page)).credits;
    await page.evaluate(() => {
      window.__dl.fightAuto();
      window.__dl.state().combat.paused = false;
      window.__dl.fightStep(400);
    });
    await expect(page.getByTestId('modal-combat-result')).toBeVisible({ timeout: 20_000 });
    const after = await state(page);
    expect(after.combat).toBeNull();
    expect(after.stats.fights).toBe(1);
    if (after.stats.victories === 1) expect(after.credits).toBeGreaterThan(credits);
    await page.getByTestId('btn-result-ok').click();
    await clearModals(page);
  });

  test('fleeing from a fight', async ({ page }) => {
    await startGame(page, { seed: 'E2E-FLEE' });
    await arm(page);
    await openEncounter(page, 'raider', 2);
    await page.getByTestId('enc-fight').click();
    await expect(page.getByTestId('screen-combat')).toBeVisible();
    const actions = page.getByTestId('tab-actions');
    if (await actions.isVisible().catch(() => false)) await actions.click();
    await page.getByTestId('btn-flee').click();
    expect((await state(page)).combat.player.fleeing).toBe(true);
    await page.evaluate(() => {
      window.__dl.state().combat.paused = false;
      window.__dl.state().combat.enemies.forEach((e: { weapons: unknown[] }) => (e.weapons = []));
      window.__dl.state().combat.enemies.forEach((e: { demanded: boolean }) => (e.demanded = true));
      window.__dl.fightStep(150);
    });
    await expect(page.getByTestId('modal-combat-result')).toBeVisible({ timeout: 20_000 });
    expect((await state(page)).stats.fled).toBe(1);
  });

  test('losing the ship with insurance puts you back at home', async ({ page }) => {
    await startGame(page, { seed: 'E2E-LOSE' });
    await arm(page);
    await openEncounter(page, 'warlord', 3);
    await page.getByTestId('enc-fight').click();
    await expect(page.getByTestId('screen-combat')).toBeVisible();
    await page.evaluate(() => {
      const s = window.__dl.state();
      s.combat.player.hull = 1;
      s.combat.player.shield = 0;
      s.combat.enemies.forEach((e: { demanded: boolean }) => (e.demanded = true));
      s.combat.paused = false;
      window.__dl.fightAuto();
      window.__dl.fightStep(300);
    });
    await expect(page.getByTestId('modal-combat-result')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('btn-result-ok').click();
    const s = await state(page);
    expect(s.stats.deaths).toBeGreaterThanOrEqual(1);
    await expect(page.getByTestId('modal-respawn')).toBeVisible();
  });

  test('avoiding a fight: paying a bribe ends the encounter', async ({ page }) => {
    await startGame(page, { seed: 'E2E-BRIBE' });
    await openEncounter(page, 'scrapper', 1);
    const credits = (await state(page)).credits;
    await page.getByTestId('enc-bribe').click();
    await clearModals(page);
    const s = await state(page);
    expect(s.credits).toBeLessThan(credits);
  });
});

test.describe('saves', () => {
  test('a v1 save loads and keeps playing with a default crew', async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem(
        'driftline.settings',
        JSON.stringify({ tutorial: false, motion: 'reduced', muted: true }),
      ),
    );
    await page.goto('/?e2e=1');
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /Importovat/ }).click();
    (await chooser).setFiles('tests/fixtures/v1-save.json');
    await page.waitForFunction(() => !!window.__dl?.state());
    const s = await state(page);
    expect(s.v).toBe(3)
    expect(s.noShip).toBe(false);
    expect(s.seed).toBe('V1FIXTURE');
    expect(s.crew.length).toBeGreaterThan(0);
    await openScreen(page, 'crew');
    await expect(page.locator('[data-testid^="crew-"]').first()).toBeVisible();
  });
});
