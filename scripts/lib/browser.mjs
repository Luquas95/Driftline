// Shared browser setup for the scripts in scripts/ (screenshots, shot, play). Imported only, not run directly.
import { chromium } from '@playwright/test';

/** Game served by `npm run build && npm run preview`, with the e2e hooks enabled. */
export const GAME_URL = 'http://localhost:4173/?e2e=1';

/** Chromium with software GL (swiftshader). CHROMIUM_PATH overrides the default binary. */
export function launchBrowser() {
  return chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
    args: [
      '--use-angle=swiftshader',
      '--use-gl=angle',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--no-sandbox',
    ],
  });
}

/**
 * New context and page for a capture session: scale 1, touch emulation for mobile, pageerror logging,
 * and the app settings written to localStorage before any page script runs.
 * `settings` is merged over the defaults (tutorial off, reduced motion, muted).
 * `recordVideo` (Playwright option) is optional.
 */
export async function newSession(
  browser,
  { viewport, mobile = false, settings = {}, recordVideo = null } = {},
) {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    hasTouch: mobile,
    isMobile: mobile,
    ...(recordVideo ? { recordVideo } : {}),
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.addInitScript((s) => localStorage.setItem('driftline.settings', JSON.stringify(s)), {
    tutorial: false,
    motion: 'reduced',
    ...settings,
    muted: true,
  });
  return { ctx, page };
}

/** Freezes the game clock, lets the frame settle, writes a PNG to `path` and resumes the game. */
export async function snap(page, path) {
  await page.evaluate(() => window.__dl.freeze(3));
  await page.waitForTimeout(500);
  await page.screenshot({ path });
  await page.evaluate(() => window.__dl.unfreeze());
}

/** From the menu: new game with the given seed (default SHOWCASE) and start it. */
export async function startNewGame(page, seed = 'SHOWCASE') {
  await page.getByTestId('menu-new').click();
  await page.getByTestId('new-seed').fill(seed);
  await page.getByTestId('menu-start').click();
}
