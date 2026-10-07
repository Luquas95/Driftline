// Produces the README screenshots: node scripts/screenshots.mjs  (needs `npm run build && npm run preview` on :4173)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

mkdirSync('docs/screenshots', { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
  args: [
    '--use-angle=swiftshader',
    '--use-gl=angle',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--no-sandbox',
  ],
});

async function session(name, viewport, mobile) {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    hasTouch: mobile,
    isMobile: mobile,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.addInitScript(() =>
    localStorage.setItem(
      'driftline.settings',
      JSON.stringify({ tutorial: false, motion: 'reduced', muted: true }),
    ),
  );
  await page.goto('http://localhost:4173/?e2e=1');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `docs/screenshots/${name}-menu.png` });
  await page.getByTestId('menu-new').click();
  await page.getByTestId('new-seed').fill('SHOWCASE');
  await page.getByTestId('menu-start').click();
  await page.waitForFunction(() => !!window.__dl?.state());
  await page.evaluate(() => window.__dl.autoplay('trader', 22));
  await page.waitForTimeout(500);
  const shot = async (id, file, prep) => {
    await page.getByTestId(`nav-${id}`).click();
    await page.waitForTimeout(700);
    if (prep) await prep();
    await page.evaluate(() => window.__dl.freeze(3));
    await page.waitForTimeout(500);
    await page.screenshot({ path: `docs/screenshots/${name}-${file}.png` });
    await page.evaluate(() => window.__dl.unfreeze());
    await page.keyboard.press('Escape');
  };
  // market with a selected good
  await shot('station', 'station', async () => {
    const row = page
      .locator('[data-testid^="good-"]')
      .filter({ hasNotText: /chlazené|citlivé|nelegální/ })
      .first();
    if (await row.count()) {
      await row.click();
      await page.getByTestId('trade-max-buy').click();
      await page.waitForTimeout(200);
      await page.screenshot({ path: `docs/screenshots/${name}-trade-preview.png` });
      await page.getByTestId('btn-buy').click();
      await page.waitForTimeout(300);
    }
  });
  await shot('map', 'map', async () => {
    const st = await page.evaluate(() => {
      const s = window.__dl.state();
      return { here: s.location.systemId, visited: s.visited };
    });
    const far = st.visited.find((v) => v !== st.here);
    if (far !== undefined) await page.evaluate((id) => window.__dl.select(id), far);
    await page.waitForTimeout(400);
  });
  await shot('system', 'system');
  await shot('ship', 'ship');
  await shot('cargo', 'cargo');
  await shot('journal', 'journal');
  await ctx.close();
}

await session('desktop', { width: 1440, height: 900 }, false);
await session('mobile', { width: 390, height: 844 }, true);
await browser.close();
