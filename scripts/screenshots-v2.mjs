// README screenshots for v2 (crew and combat): node scripts/screenshots-v2.mjs  (needs `npm run build && npm run preview` on :4173)
import { mkdirSync } from 'node:fs';
import { GAME_URL, launchBrowser, newSession, snap, startNewGame } from './lib/browser.mjs';

mkdirSync('docs/screenshots', { recursive: true });
const browser = await launchBrowser();

async function session(name, viewport, mobile) {
  const { ctx, page } = await newSession(browser, { viewport, mobile, settings: { motion: 'full' } });
  await page.goto(GAME_URL);
  await startNewGame(page);
  await page.waitForFunction(() => !!window.__dl?.state());
  const shot = (file) => snap(page, `docs/screenshots/${name}-${file}.png`);
  // crew with recruits
  await page.evaluate(() => {
    window.__dl.state().credits = 20000;
  });
  await page.getByTestId('nav-crew').click();
  await page.waitForTimeout(600);
  await shot('crew');
  await page.getByTestId('tab-hire').click();
  await page.waitForTimeout(500);
  await shot('crew-hire');
  // encounter dialogue and a fight
  await page.evaluate(() => window.__dl.loadout(['energy_s', 'kinetic_m', 'shield_s', 'missile_m'], 6));
  await page.evaluate(() => window.__dl.encounter('raider', 2));
  await page.waitForTimeout(500);
  await shot('encounter');
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
  await shot('combat');
  await page.evaluate(() => {
    window.__dl.fightAuto();
    window.__dl.state().combat.paused = false;
    window.__dl.fightStep(300);
  });
  await page.waitForTimeout(2500);
  await shot('combat-result');
  await ctx.close();
}

await session('desktop', { width: 1440, height: 900 }, false);
await session('mobile', { width: 390, height: 844 }, true);
await browser.close();
