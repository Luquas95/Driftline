import { expect, test } from '@playwright/test';

test('works fully offline after the service worker is installed', async ({ page, context }) => {
  await page.goto('/?e2e=1&quick=1');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // reload once so the page is controlled by the service worker and everything is precached
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('menu')).toBeVisible();
  await page.getByTestId('menu-new').click();
  await page.getByTestId('new-seed').fill('OFFLINE');
  await page.getByTestId('menu-start').click();
  await expect(page.getByTestId('screen-station')).toBeVisible();
  await page.getByTestId('nav-map').click();
  await expect(page.getByTestId('screen-map')).toBeVisible();
  await context.setOffline(false);
});
