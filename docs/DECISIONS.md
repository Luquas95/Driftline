# Rozhodnutí (ADR light)

Každé rozhodnutí má kontext, volbu a důvod. Novější rozhodnutí přepisují starší.

## Proces

**Větev.** Zadání mluví o `feat/v1`, spuštěná session ale určila pracovní větev `claude/new-session-y0wvwy`, takže práce probíhala v ní. Obsah i historie commitů (Conventional Commits) jsou stejné, PR míří do `main`.

**Samostatná práce bez doptávání.** Mezery v zadání se dořešily rozumným výchozím chováním a zapsaly sem.

## Technologie

**Preact + Signals místo Solidu.** Obě varianty jsou malé a reaktivní. Preact má JSX/TSX stejně jako React (známý model, všechny nástroje fungují bez speciálního překladače), `@preact/signals` dává granulární aktualizace tam, kde je potřeba, a build je kolem 8 kB. Herní stav je ale **měnitelný objekt** (`GameState`), takže signál `game` drží referenci a signál `rev` se zvýší po každé akci. Komponenty čtou `rev.value` a překreslí se. Je to jednoduché, předvídatelné a snadno se ladí, a jádro přitom nezná žádný framework.

**PixiJS v8 s vlastními GLSL shadery.** Planety, hvězdy, mlhoviny a hvězdné pole jsou `Mesh` s kvadem a vlastním programem (`src/render/glsl.ts`). Běží **jedna** instance `Application` na plátně pod DOM rozhraním. Obrazovky mění scénu (`useScene`). Panely, tabulky a formuláře jsou DOM, takže fungují čtečky obrazovky, tab-navigace a nativní dotykové ovládání. Každý mesh má vlastní geometrii, protože zničení scény geometrii uvolní.

**Jádro bez DOM a Pixi.** `src/core` a `src/content` smějí importovat jen sebe navzájem; pravidlo hlídá ESLint (`no-restricted-imports`, zákaz `Math.random`, `Date.now`, `window`). Díky tomu běží stejný kód v prohlížeči, ve Vitestu i v balančním simulátoru.

**Vlastní PRNG xoshiro128\*\*.** Semínko je text, hashuje se (cyrb128) do čtyř 32bitových slov. Stav PRNG je serializovatelná čtveřice čísel (`state.rng`), proto uložená hra pokračuje stejně jako původní (testováno). Procedurální obsah používá odvozená semínka (`${seed}:sys:${id}`), takže pořadí generování nehraje roli.

**Galaxie se neukládá.** Při načtení se znovu vygeneruje ze semínka (cache v paměti). Uložený stav je malý a verzovaný (`SAVE_VERSION`, migrace v `save.ts`). Změna generátoru by ale rozbila staré uložené hry, proto se generátor po vydání mění jen s migrací nebo novou verzí hry.

**Obsah je data-driven.** Zboží, trupy, moduly, typy stanic, události, tržní události a příběhové řetězce jsou datové soubory v `src/content/`. Moduly se generují z rodin (`FAMILIES`) a velikostí, takže přidání nového druhu je jeden řádek. Události se píší jednou (struktura i české texty dohromady) a pomocník `ev()` je rozdělí na definici s i18n klíči a slovník (`EVENT_TEXTS_CS`), který se sloučí do `i18n/cs`. Další jazyk se přidá voláním `addLanguage`.

**Texty přes slovník.** `t(klíč, parametry)`. Test `tests/i18n.test.ts` projde zdrojové kódy a ověří, že každý použitý klíč (včetně chybových a zpráv z jádra) v češtině existuje. Jádro vrací jen klíče (`err.noFuel`), nikdy věty.

## Herní systémy

**Čas jako desetinné dny.** Skok trvá `vzdálenost/rychlost + 0,35` dne, pobyt v doku čtvrt dne, těžba den. Ekonomika tiká po celých dnech a je deterministická podle (semínko, den), takže hráčovo čekání nic neřídí náhodně.

**Ceny z úrovně zásob.** Místo „ceny, která se hýbe sama“ má každá stanice zásobu a cíl; cena je funkce poměru zásoby a reference. Hráčův nákup či prodej zásobu skutečně mění, a tím vzniká skluz i opotřebení trasy bez zvláštních pravidel. Zásoba se vrací k cíli rychlostí 5 % denně. Výrobní řetězce působí jen na cíl výrobce (nedostatek vstupu = nižší cíl = dražší výstup), což stačí na „živý“ dojem a drží simulaci levnou a stabilní.

**Dva druhy spotřeby energie.** Zadání chce „zapínat a vypínat moduly“. Kdyby motor i laser tahaly proud pořád, hráč by je musel před každou činností přepínat ručně. Proto jsou moduly buď **trvalé** (odebírají vždy, hráč je vypíná), nebo **aktivní** (odebírají při použití; hra jen kontroluje, zda činnost vychází). UI ukazuje čtyři bilance (klid, skok, těžba, skenování).

**Přetížení jako řádek navíc.** Zadání: „překročení kapacity stojí zásoby navíc a zvyšuje riziko nehody“. Mřížka má nad kapacitou jeden varovný řádek mimo trup. Co se do trupu nevejde, může tam ležet, ale podle počtu buněk roste spotřeba zásob a riziko. Je to vidět i hmatatelně v UI.

**Chlazení a trezor jako kvóty.** Chlazené a citlivé zboží se omezuje součtem buněk (kvóta), ne zvláštní mřížkou. Je to čitelnější a stejně vynucuje kompromis o slotech.

**Cestující jako součást zakázek.** „Cestující“ jsou typ zboží vázaný na ubikace. Ve v1 se vyskytují jen jako zakázky (modul Ubikace: lůžka a komfort), protože na trhu se nekupují.

**Záloha = platba předem od zadavatele.** Při přijetí zakázky hráč dostane zálohu (20 % odměny u přepravy, kurýra a cestujících), při splnění se odečte, při nesplnění ji ztrácí a platí pokutu.

**Mezerník na mapě** pozastavuje **autopilota** trasy (jeden skok za druhým s animací), což je jediná část hry, kde čas „teče“ sám.

**Pojištění po dnech.** Poplatek se platí z kreditů průběžně. Nelze-li platit, pojištění propadne a obnoví se ve stanici. Hráč se po smrti nikdy nezasekne: bez pojištění dostane základní loď, při zablokování palivem existuje odtah.

**Pověst** je číslo u stanice (zakázky ji zvyšují, propadnutí a pokuty snižují). Ve v1 ji čtou jen události (`repMin`/`repMax`); v3 na ni navážou frakce.

## Technika

**Ukládání:** IndexedDB (`SaveStore`) s pamětním záložním režimem, sloty `autosave`, `slot1..3`, export/import jako soubor s obálkou. Nastavení hráče (zvuk, kontrast, animace) je v `localStorage`.

**PWA:** `vite-plugin-pwa` (Workbox `generateSW`, `autoUpdate`) předcachuje celý build včetně fontů. Ikony vznikají skriptem `scripts/make-icons.mjs`. `BASE_PATH` umožní nasazení do podadresáře (GitHub Pages).

**Zvuk:** Web Audio, žádné soubory. Ambient je pomalý pad s filtrem a občasným zvonkem (`Math.random` je tu povolený, nejde o simulaci). Ovládání hlasitosti a vypnutí v Nastavení.

**Přístupnost:** `prefers-reduced-motion` i ruční volba animací, režim vysokého kontrastu, `aria` popisky, klávesnicové zkratky, cíle min. 44 px na dotykových zařízeních.

**Testy:** jádro ve Vitestu (cíl ≥ 85 %, aktuálně > 90 %). E2E běží přes `?e2e=1`, který zpřístupní minimální `window.__dl` (výběr systému bez klikání do plátna, zmrazení animací). Vizuální snapshoty používají pevné semínko, zmrazený čas shaderů a toleranci 4 % pixelů, protože rasterizace závisí na GPU a ovladači (referenční snímky vznikly ve vývojovém kontejneru se SwiftShaderem).

**Balanční simulátor** (`npm run balance`) používá stejné API jako UI. Boti vidí jen známé ceny (kromě záměrně vševědoucí strategie `oracle`, horní mez pro hledání exploitů).

## Co je připravené pro v2 a v3

- **Boj a posádka (v2):** `Ship` má štít a poškození trupu, `ModuleDef` může dostat boje (zbraně) jako další `ModuleKind` bez zásahu do energetiky. `HullDef.crew` a `lifeCrew` jsou základ posádky; události mají podmínky přes `ext` a lze přidat `Cond`/`Effect` s posádkou. Registry `extConditions` a `extEffects` ve `src/core/events.ts` jsou určené přesně pro to.
- **Základna, frakce, hrozba (v3):** `GameState.flags` a `StationDyn.rep` drží stav pro frakční logiku, `MarketEvent` už nese sektor a modifikátory a stejnou cestou půjdou hrozby. `Galaxy.sectors` jsou vhodné hranice území. Systém událostí má spouštěče a podmínky otevřené pro nové typy. Migrace uložených her jsou připravené (`MIGRATIONS`).
- **Ekonomika:** zásoby jsou pole indexovaná zbožím, přidání nového zboží = řádek v `goods.ts` (u starých uložení pole dorovná migrace).
