// Usage: node scripts/shot.mjs <url> <out.png> [width] [height] [waitMs]
import { launchBrowser } from './lib/browser.mjs';
const [url, out, w = '1440', h = '900', wait = '1500'] = process.argv.slice(2);
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
let n = 0;
page.on('console', (m) => {
  if (n++ < 12 && m.type() !== 'log') console.log('[console]', m.type(), m.text().slice(0, 300));
});
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url);
await page.waitForTimeout(Number(wait));
await page.screenshot({ path: out });
await browser.close();
