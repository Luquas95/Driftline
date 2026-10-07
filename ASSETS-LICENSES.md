# Licence assetů a závislostí

Hra neobsahuje žádné ručně vytvořené ani stažené obrázky, zvuky ani modely. Všechno, co hráč vidí a slyší, vzniká v kódu:

| Co | Jak vzniká | Licence |
|---|---|---|
| Planety, hvězdy, mlhoviny, hvězdné pole | GLSL shadery v `src/render/glsl.ts` | MIT (součást projektu) |
| Lodě | vektorový generátor `src/render/shipgen.ts` | MIT |
| Ikony UI | vlastní sada SVG cest v `src/ui/Icon.tsx` | MIT |
| Ikony aplikace (PNG) | `scripts/make-icons.mjs` (SVG vykreslené Chromiem) | MIT |
| Zvuk a hudba | Web Audio syntéza za běhu, `src/audio/audio.ts` | MIT |
| Texty | `src/i18n/cs.ts`, `src/content/events.ts` | MIT |

## Písma (balíčky npm, bundlované do aplikace, žádné CDN)

| Balíček | Použití | Licence |
|---|---|---|
| `@fontsource/inter` | hlavní písmo UI | SIL Open Font License 1.1 |
| `@fontsource/jetbrains-mono` | čísla a monospace | SIL Open Font License 1.1 |

## Hlavní knihovny

| Balíček | Licence |
|---|---|
| `pixi.js` | MIT |
| `preact`, `@preact/signals` | MIT |
| `vite`, `@preact/preset-vite`, `vite-plugin-pwa`, `workbox-*` | MIT |
| `typescript` | Apache-2.0 |
| `vitest`, `@vitest/coverage-v8` | MIT |
| `@playwright/test` | Apache-2.0 |
| `eslint`, `typescript-eslint`, `prettier` | MIT / BSD-2-Clause |
| `tsx`, `fake-indexeddb`, `jsdom` | MIT / Apache-2.0 |

Všechny licence jsou slučitelné s MIT licencí kódu hry.
