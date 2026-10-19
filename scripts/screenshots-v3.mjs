/* global document */
// README media for v3: node scripts/screenshots-v3.mjs  (needs `npm run build && npm run preview` on :4173, ffmpeg for the GIF)
import { mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { GAME_URL, launchBrowser, newSession, snap as snapPng, startNewGame } from './lib/browser.mjs';

mkdirSync('docs/screenshots', { recursive: true });
const browser = await launchBrowser();

async function newPage(viewport, mobile, video) {
  const { ctx, page } = await newSession(browser, {
    viewport,
    mobile,
    settings: { motion: 'full', animations: 'full' },
    recordVideo: video ? { dir: 'tmp-video', size: viewport } : null,
  });
  await page.goto(GAME_URL);
  await startNewGame(page);
  await page.getByTestId('screen-firstship').waitFor();
  return { ctx, page };
}
const snap = (page, file) => snapPng(page, `docs/screenshots/${file}.png`);
const buyThird = async (page) => {
  await page.locator('[data-price]').nth(2).click();
  await page.getByTestId('first-name').fill('Nadějná');
  await page.getByTestId('btn-buy-ship').click();
  await page.getByTestId('screen-station').waitFor();
};

for (const [name, vp, mobile] of [
  ['desktop', { width: 1440, height: 900 }, false],
  ['mobile', { width: 390, height: 844 }, true],
]) {
  const { ctx, page } = await newPage(vp, mobile, false);
  await page
    .waitForFunction(
      () => [...document.querySelectorAll('.offer-pic')].every((e) => e.querySelector('img')),
      null,
      { timeout: 60000 },
    )
    .catch(() => {});
  await page.waitForTimeout(800);
  await snap(page, `${name}-first-ship`);
  await buyThird(page);
  await page.getByTestId('nav-system').click();
  await page.getByTestId('screen-system').waitFor();
  await page.waitForTimeout(1000);
  await snap(page, `${name}-system-ship`);
  if (!mobile) {
    const b = await page.evaluate(() => window.__dl.sys().body(1));
    await page.mouse.dblclick(b.x, b.y);
    await page.waitForFunction(() => window.__dl.sys().zoom > 3, null, { timeout: 30000 });
    await page.waitForTimeout(800);
    await snap(page, `${name}-system-detail`);
  }
  await ctx.close();
}

// short demo: first ship -> system -> zoom -> jump
{
  const vp = { width: 960, height: 600 };
  const { ctx, page } = await newPage(vp, false, true);
  await page.waitForTimeout(2500);
  await page.locator('[data-price]').nth(1).click();
  await page.waitForTimeout(1500);
  await page.locator('[data-price]').nth(3).click();
  await page.waitForTimeout(1500);
  await page.getByTestId('btn-buy-ship').click();
  await page.getByTestId('screen-station').waitFor();
  await page.waitForTimeout(1200);
  await page.getByTestId('nav-system').click();
  await page.waitForTimeout(2000);
  const b = await page.evaluate(() => window.__dl.sys().body(1));
  if (b) {
    await page.mouse.move(b.x, b.y);
    for (let i = 0; i < 8; i++) {
      await page.mouse.wheel(0, -240);
      await page.waitForTimeout(250);
    }
  }
  await page.waitForTimeout(1500);
  await page.getByTestId('sys-zoom-reset').click();
  await page.waitForTimeout(1500);
  await page.getByTestId('nav-map').click();
  await page.waitForTimeout(1200);
  const target = await page.evaluate(() => window.__dl.neighborWithStation());
  await page.evaluate((id) => window.__dl.select(id), target);
  await page.getByTestId('btn-jump').click();
  await page.waitForTimeout(6000);
  const vid = page.video();
  await ctx.close();
  const src = await vid.path();
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      src,
      '-vf',
      'fps=6,scale=560:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=48[p];[b][p]paletteuse',
      'docs/screenshots/v3-demo.gif',
    ],
    { stdio: 'ignore' },
  );
  rmSync('tmp-video', { recursive: true, force: true });
}
await browser.close();
