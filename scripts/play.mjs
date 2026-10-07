// Quick manual driver: node scripts/play.mjs <out-prefix> [w] [h] — starts a game and captures screens.
import { chromium } from '@playwright/test';
const prefix = process.argv[2] ?? '/tmp/p';
const width = Number(process.argv[3] ?? 1440);
const height = Number(process.argv[4] ?? 900);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: [
    '--use-angle=swiftshader',
    '--use-gl=angle',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--no-sandbox',
  ],
});
const page = await browser.newPage({ viewport: { width, height } });
let n = 0;
page.on('console', (m) => {
  if (n++ < 15 && ['error', 'warning'].includes(m.type()))
    console.log('[console]', m.type(), m.text().slice(0, 300));
});
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:4173/');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${prefix}-menu.png` });
await page.getByTestId('menu-new').click();
await page.getByTestId('new-seed').fill('DEMO');
await page.getByTestId('menu-start').click();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${prefix}-station.png` });
for (const id of ['map', 'ship', 'cargo', 'system', 'journal', 'settings']) {
  await page.getByTestId(`nav-${id}`).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${prefix}-${id}.png` });
}
await browser.close();
