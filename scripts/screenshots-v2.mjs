// README screenshots for v2 (crew and combat): node scripts/screenshots-v2.mjs  (needs `npm run build && npm run preview` on :4173)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

mkdirSync('docs/screenshots', { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});

async function session(name, viewport, mobile) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: mobile, isMobile: mobile });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.addInitScript(() =>
    localStorage.setItem('driftline.settings', JSON.stringify({ tutorial: false, motion: 'full', muted: true })),
  );
  await page.goto('http://localhost:4173/?e2e=1');
  await page.getByTestId('menu-new').click();
  await page.getByTestId('new-seed').fill('SHOWCASE');
  await page.getByTestId('menu-start').click();
  await page.waitForFunction(() => !!window.__dl?.state());
  const snap = async (file) => {
    await page.evaluate(() => window.__dl.freeze(3));
    await page.waitForTimeout(500);
    await page.screenshot({ path: `docs/screenshots/${name}-${file}.png` });
    await page.evaluate(() => window.__dl.unfreeze());
  };
  // crew with recruits
  await page.evaluate(() => {
    window.__dl.state().credits = 20000;
  });
  await page.getByTestId('nav-crew').click();
  await page.waitForTimeout(600);
  await snap('crew');
  await page.getByTestId('tab-hire').click();
  await page.waitForTimeout(500);
  await snap('crew-hire');
  // encounter dialogue and a fight
  await page.evaluate(() => window.__dl.loadout(['energy_s', 'kinetic_m', 'shield_s', 'missile_m'], 6));
  await page.evaluate(() => window.__dl.encounter('raider', 2));
  await page.waitForTimeout(500);
  await snap('encounter');
  await page.getByTestId('enc-fight').click();
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    window.__dl.fightStep(22);
    const c = window.__dl.state().combat;
    const room = c.player.rooms.findIndex((r) => r.kind === 'life');
    if (room >= 0) c.player.rooms[room].fire = 55;
    const r2 = c.player.rooms.findIndex((r) => r.kind === 'engine');
    if (r2 >= 0) c.player.rooms[r2].breach = 60;
    c.paused = true;
  });
  await page.waitForTimeout(600);
  await snap('combat');
  await page.evaluate(() => {
    window.__dl.fightAuto();
    window.__dl.state().combat.paused = false;
    window.__dl.fightStep(300);
  });
  await page.waitForTimeout(2500);
  await snap('combat-result');
  await ctx.close();
}

await session('desktop', { width: 1440, height: 900 }, false);
await session('mobile', { width: 390, height: 844 }, true);
await browser.close();
