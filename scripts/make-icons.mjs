// Renders the PWA icons (PNG) from an inline SVG using the preinstalled Chromium. Run: node scripts/make-icons.mjs
import { chromium } from '@playwright/test';

const svg = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <radialGradient id="bg" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="#14264a"/><stop offset="1" stop-color="#070b14"/></radialGradient>
    <linearGradient id="ship" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8fe3ff"/><stop offset="1" stop-color="#2a8fd0"/></linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <g transform="translate(256 256) scale(${1 - pad}) translate(-256 -256)">
    <circle cx="256" cy="256" r="178" fill="none" stroke="#4cc9f0" stroke-opacity=".35" stroke-width="10"/>
    <circle cx="256" cy="256" r="120" fill="none" stroke="#4cc9f0" stroke-opacity=".18" stroke-width="6"/>
    <path d="M96 330 L420 190 L300 420 L262 300 Z" fill="url(#ship)"/>
    <path d="M262 300 L420 190 L300 420 Z" fill="#1d5f94" opacity=".55"/>
    <circle cx="372" cy="124" r="22" fill="#e6f8ff"/>
    <circle cx="372" cy="124" r="52" fill="#4cc9f0" opacity=".18"/>
  </g>
</svg>`;

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
for (const [name, size, pad] of [
  ['icon-192.png', 192, 0],
  ['icon-512.png', 512, 0],
  ['icon-maskable-512.png', 512, 0.2],
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<body style="margin:0;background:#070b14">${svg(pad).replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body>`,
  );
  await page.screenshot({ path: `public/${name}`, clip: { x: 0, y: 0, width: size, height: size } });
}
await browser.close();
