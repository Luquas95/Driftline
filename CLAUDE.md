# CLAUDE.md: pracovní pokyny pro projekt Driftline

Obchodně-průzkumná hra v prohlížeči (TypeScript strict, Vite, Preact + Signals, PixiJS v8). Uživatelské texty česky, kód a komentáře anglicky, dokumentace česky.

## Mapa repozitáře

```
src/core/       čistá simulace (bez DOM a Pixi), deterministická podle semínka
  game.ts       veřejné akce (dock, jump, buy/sell, služby, opravy, odtah, pojištění)
  state.ts      GameState helpery, analyze(), damageHull(), destroyShip(), withRng()
  start.ts      newGame()
  time.ts       passTime(): den po dni (ekonomika, zásoby, pojištění, propadlé zakázky)
  galaxy.ts     generátor galaxie, shortestPath
  economy.ts    ceny, skluz, denní tik, tržní události
  ship.ts       computeShipStats(): energie, sousednost, palivo, opotřebení
  cargo.ts      mřížka nákladu, kontejnery, kvóty, čerstvost
  contracts.ts  nástěnky a generování zakázek, řetězce   contractOps.ts: přijetí, doručení, propadnutí
  exploration.ts skenery, sondy, těžba, odměny za objevy
  events.ts     engine událostí (podmínky, efekty, registry ext)
  shop.ts       loděnice (nabídka, nákup, instalace, výměna trupu)
  advisor.ts    plánovač trasy a doporučení obchodů (jen čtení)
  save.ts       serializace, migrace, export/import
src/content/    data: goods, hulls, modules, stations, events, chains, marketEvents
src/render/     Pixi: glsl.ts (shadery), materials.ts, mapscene/systemscene/shipscene/backdrop, shipgen.ts
src/ui/         Preact: App, screens/*, components, store.ts (signály), settings.ts
src/i18n/       t(), cs.ts (slovník); texty událostí jsou v content/events.ts
src/sim/        boti (bots.ts) a balanční simulátor (balance.ts)
src/persist/    IndexedDB ukládání
tests/          Vitest (jádro)       e2e/   Playwright (E2E + vizuální snapshoty)
docs/           DESIGN.md, DECISIONS.md, balance.md, REVIEW-v1.md, screenshots/
```

## Pravidla

- **Jádro je čisté.** V `src/core` a `src/content` nesmí být DOM, Pixi, `Math.random`, `Date.now`. ESLint to hlídá. Náhoda jen přes `Rng` (`withRng(state, …)` pro perzistentní proud, `Rng.fromSeed(\`${seed}:…\`)` pro odvozené).
- **Jádro nevrací věty**, jen i18n klíče (`err.*`, `msg.*`). Každý nový klíč přidej do `src/i18n/cs.ts` (test `tests/i18n.test.ts` to ověří).
- **Stav je JSON.** Nové pole `GameState` = zvýšit `SAVE_VERSION`, přidat migraci v `save.ts` a test.
- Akce vrací `Result` (`ok()` / `fail('err.klíč')`) a mění stav na místě. UI je volá přes `act(fn)` (zvýší `rev`, ukáže zprávy, naplánuje autosave) a chyby ukáže `report(result)`.
- Před commitem: `npm run lint && npm run typecheck && npm test`. Commity ve stylu Conventional Commits.

## Jak přidat…

**Zboží:** řádek v `src/content/goods.ts` (cena, jedn./buňku, hmotnost, štítky, případně `inputs` receptury). Přidej `good.<id>` do `cs.ts`. Zkontroluj `docs/balance.md` (`npm run balance`).

**Modul:** rodina v `FAMILIES` v `src/content/modules.ts` (druh, velikosti, hlavní hodnota, spotřeba, režim `always`/`active`, hmotnost, cena, opotřebení). Nový *druh* (`ModuleKind`) vyžaduje ještě `case` v `computeShipStats` (`ship.ts`), `moduleStat` (`ui/moduleInfo.ts`), kreslení v `render/shipgen.ts` a `mod.<druh>` v `cs.ts`.

**Trup:** objekt v `src/content/hulls.ts` s `layout` (malá písmena = jádrové sloty, `S/M/L` volné). Přidej siluetu do `SHAPES` v `render/shipgen.ts` a `hull.<id>` + `hull.<id>.desc` do `cs.ts`.

**Typ stanice:** položka v `src/content/stations.ts` (co vyrábí a spotřebovává se silou 0–1, služby, váhy podle oblasti). Přidej `st.<id>` do `cs.ts` a typ do `StationTypeId` v `core/types.ts`.

**Událost:** v `src/content/events.ts` zavolej `ev(id, spouštěč, váha, podmínky, titulek, text, [volby…])`. Volba = `ch(text, [out(text, [efekty], váha)…], požadavky?)`. Efekty a podmínky jsou helpery nahoře souboru. Anomálie (`'anomaly'`) se automaticky rozdělují mezi tělesa galaxie. Nové typy podmínek/efektů: rozšiř `Cond`/`Effect` v `core/eventTypes.ts` a vyhodnoť je v `core/events.ts` (nebo registruj přes `extConditions` / `extEffects`).

**Příběhový řetězec:** `src/content/chains.ts` + texty `chain.<id>.title` a `chain.<id>.<krok>.text` v `cs.ts`.

**Tržní událost:** `src/content/marketEvents.ts` + `msg.market.<druh>` v `cs.ts`.

**Shader planety:** v `src/render/glsl.ts` přidej funkci `surface(...)` do `SURFACES` (typ `PlanetKind`), v `materials.ts` paletu do `planetParams` (barvy ze semínka) a typ tělesa do `BodyKind`. Galerii všech typů uvidíš na `/?gallery`.

**Překlad:** `addLanguage('en', {...})` z `src/i18n/index.ts`; chybějící klíče padají zpět na češtinu.

## Příkazy

| Příkaz | Co dělá |
|---|---|
| `npm run dev` | vývojový server (`/?gallery` = galerie shaderů, `/?e2e=1` = testovací háčky) |
| `npm run build` / `npm run preview` | produkční build (typy + Vite + PWA), náhled na `:4173` |
| `npm test` / `npm run test:cov` | Vitest (jádro), pokrytí |
| `npm run test:e2e` | Playwright (desktop 1440×900, mobil 390×844); v sandboxu je Chromium předinstalovaný, **nespouštěj `playwright install`** |
| `npx playwright test e2e/visual.spec.ts --update-snapshots` | přegeneruje referenční snímky |
| `npm run balance -- --seeds 10 --days 120` | balanční simulátor, zapíše `docs/balance.md` |
| `npm run lint` / `npm run format` | ESLint + Prettier |
| `node scripts/make-icons.mjs` | znovu vytvoří PNG ikony PWA |
| `npx tsx scripts/i18n-missing.ts` | vypíše chybějící překladové klíče |

## Ladění balancu

Konstanty jsou v `src/core/tuning.ts` (ceny paliva, rozpětí, clo, elasticita, rychlost návratu zásob), v `content/` (ceny zboží a modulů) a ve vzorcích v `contracts.ts` (odměny). Po změně spusť `npm run balance` a zkontroluj tabulku strategií a test smyčky zisku v `docs/balance.md`: pozdní okruhy fixní trasy musí mít nulový nebo záporný zisk.
