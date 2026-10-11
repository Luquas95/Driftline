# CLAUDE.md: pracovní pokyny pro projekt Driftline

Obchodně-průzkumná hra v prohlížeči (TypeScript strict, Vite, Preact + Signals, PixiJS v8). Uživatelské texty česky, kód a komentáře anglicky, dokumentace česky.

## Mapa repozitáře

```
src/core/       čistá simulace (bez DOM a Pixi), deterministická podle semínka
  crew.ts       posádka: najímání, mzdy, morálka, dovednosti, důstojníci (crewBase.ts: sdílené drobnosti)
  firstShip.ts  nový začátek: nabídka první lodi (nové a ojeté kusy), náhled, nákup
  combat/       boj (v2): types, build (loď → místnosti), sim (krok simulace), ai, encounter (střety, hrozba),
                resolve (výsledek → GameState), duel (hlavolamy pro balanc a testy)
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
src/content/    data: goods, hulls, modules, stations, events, chains, marketEvents, crew (rasy, role, důstojníci), weapons, enemies
src/render/     Pixi: glsl.ts (shadery), materials.ts, mapscene/systemscene/shipscene/backdrop, shipgen.ts, stationgen.ts (stanice), sysmath.ts (čistá matematika kamery a letů), hullThumb.ts, combatscene.ts (boj)
src/ui/         Preact: App, anim.ts (animace UI: plynulé hodnoty, probliknutí, letící ikony), screens/* (CrewScreen, CombatScreen), components, Portrait.tsx, combatCtl.ts (řízení boje), store.ts (signály), settings.ts
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

## Jak přidat… (v2: posádka a boj)

**Zbraň:** rodina v `WEAPON_SPECS` (`src/content/weapons.ts`: poškození, nabíjení, teplo, násobky proti štítu a trupu, šance na průraz a požár, ion, munice, spotřeba, cena). Moduly `<druh>_<s|m|l>` vzniknou samy z `WEAPON_SIZES` (a jsou v `MODULES`). Nový *druh* zbraně: přidej do `WeaponKind` a `WEAPON_KINDS` (`combat/types.ts`), `case` ve `fire()` a `resolveHit()` v `combat/sim.ts`, barvu v `render/combatscene.ts` (`KIND_COLOR`, `PROJ_COLOR`) a `mod.<druh>` v `cs-v2.ts`. Po změně spusť `npx tsx scripts/combat-balance.ts` a `npm run balance`; míra výher žádné zbraně proti vyrovnanému protivníkovi nesmí dlouhodobě přesahovat 40–60 %. Globální škálu poškození drží `DMG_SCALE`.

**Rasu:** objekt v `RACES` (`src/content/crew.ts`): násobky dýchání, ohně, oprav, boje zblízka, zásob, společenského vlivu, zdraví, výchozí dovednost, odstín a tvary hlavy pro portrét. Přidej `race.<id>` do `cs-v2.ts` a ověř do `RACE_WEIGHT` v `core/crew.ts`, v jakých oblastech se najímá. Portrét (`ui/Portrait.tsx`) se generuje ze semínka `look`, nic dalšího kreslit nemusíš.

**Důstojníka:** položka v `OFFICERS` (role, rasa, pevný portrét, událost při najmutí) + `officer.<id>.desc` a událost `officer_<id>` v `content/events.ts`. Schopnost se implementuje tam, kde se použije, přes `crewHasOfficer(state, id)` (obchod v `tradeBonus`, palivo v `analyze`, útěk v `startCombat`, léčení a přesnost v `combat/sim.ts`).

**Nepřítele:** položka v `ENEMIES` (`src/content/enemies.ts`): trup (i `NPC_HULLS` pro zvířata a věže), osobnost AI, výzbroj po slotech v pořadí rozložení, úrovně hrozby, posádka, kredity, zboží z vraku, váhy výskytu podle oblasti. Přidej `enemy.<id>` do `cs-v2.ts`. Střet vybírá `makeEncounter` podle druhu (`pirate`, `hunter`, `customs`, `wreck`, `fauna`).

**Osobnost AI:** hodnota v `Personality` (`combat/types.ts`), rozdělení energie v `lean` a prahy útěku v `aiControl` (`combat/ai.ts`), případně zvláštní chování (výkupné chamtivých je ve `stepCombat`). Text `combat.pers.<id>` do `cs-v2.ts`.

**Událost s posádkou:** v `content/events.ts` použij podmínky `hasRole`, `hasRace`, `skillMin`, `hasOfficer` a efekty `hurt`, `xp`, `morale`, `leave`, `join`, `fight` (spustí střet). Boj spouštěný událostí jde stejnou cestou jako náhodný střet.

## Jak přidat… (v3: trupy a animace)

**Trup k výběru první lodi:** objekt v `HULLS` (`src/content/hulls.ts`): `role` (klíč `hull.role.<role>` v `cs.ts`), `layout` (5 jádrových slotů `r e j l n` + volné `S/M/L`), cena, náklad, palivo, trup, kajuty, obratnost, `tier` (obchody ho nabízejí od úrovně loděnice). Cena rozhoduje o pořadí v nabídce a o tom, zda ji hráč na dané obtížnosti dosáhne (`T.startCapital`); drž ceny rozložené od levných po nedosažitelné. Nová loď potřebuje siluetu: `shape({ … })` nebo ručně v `SHAPES` (`render/shipgen.ts`), texty `hull.<id>` a `hull.<id>.desc` v `cs.ts`. Test `firstShip.test.ts` ověří letuschopnost každé nabídky.

**Animaci:** vždy jen ve vrstvě vykreslování, jako funkci času nebo `dt`, nikdy ve stavu jádra. Úroveň čti z `animLevel()` (`full` / `reduced` / `off`) a při `off` ji vynech, při `reduced` zkrať. Čistý výpočet (dráha, easing, kamera) patří do `render/sysmath.ts` s unit testem. Efekty ve scéně systému jsou metody `SystemScene` (`scanPulse`, `mineBeam`, `launchProbe`, `dockInto`) volané z UI po úspěšné akci; efekty UI (probliknutí, plynulé počítadlo, letící ikona) jsou v `ui/anim.ts`. Každá animace jde přeskočit (klik, mezerník, Enter) a má zvuk přes `sfx` v `audio.ts`.

## Příkazy

| Příkaz | Co dělá |
|---|---|
| `npm run dev` | vývojový server (`/?gallery` = galerie shaderů, `/?e2e=1` = testovací háčky) |
| `npm run build` / `npm run preview` | produkční build (typy + Vite + PWA), náhled na `:4173` |
| `npm test` / `npm run test:cov` | Vitest (jádro), pokrytí |
| `npm run test:e2e` | Playwright (desktop 1440×900, mobil 390×844); v sandboxu je Chromium předinstalovaný, **nespouštěj `playwright install`** |
| `npx playwright test e2e/visual.spec.ts --update-snapshots` | přegeneruje referenční snímky |
| `npm run balance -- --seeds 10 --days 120` | balanční simulátor (obchod i boj), zapíše `docs/balance.md` |
| `npx tsx scripts/combat-balance.ts` | rychlá matice výher zbraní (AI proti AI) |
| `npm run lint` / `npm run format` | ESLint + Prettier |
| `node scripts/make-icons.mjs` | znovu vytvoří PNG ikony PWA |
| `npx tsx scripts/i18n-missing.ts` | vypíše chybějící překladové klíče |

## Ladění balancu

Konstanty jsou v `src/core/tuning.ts` (ceny paliva, rozpětí, clo, elasticita, rychlost návratu zásob), v `content/` (ceny zboží a modulů) a ve vzorcích v `contracts.ts` (odměny). Po změně spusť `npm run balance` a zkontroluj tabulku strategií a test smyčky zisku v `docs/balance.md`: pozdní okruhy fixní trasy musí mít nulový nebo záporný zisk.
