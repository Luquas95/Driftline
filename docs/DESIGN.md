# Herní design a vzorce (v1)

Dokument popisuje herní systémy tak, jak jsou implementované, včetně vzorců a ladicích konstant. Konstanty žijí v `src/core/tuning.ts` a v definicích obsahu `src/content/`. Čísla v tabulkách jsou výchozí hodnoty.

## 1. Čas

- Čas je desetinné číslo ve **dnech**. Skok, přistání, těžba, skenování i čekání posouvají `state.day` přes `passTime`.
- Při překročení celého dne proběhne **denní tik**: ekonomika (`tickEconomy`), nová tržní událost (`maybeSpawnEvent`), obnova štítů, vyřazení zkažených surovin a propadlé zakázky.
- Průběžně se odečítají **zásoby** (`posádka × 0,35 × (1 + 0,12 × přetížené buňky)` za den) a platí se **pojistné**.
- Ekonomika je deterministická podle (semínko, den), takže výsledek nezávisí na pořadí hráčových akcí.

## 2. Galaxie

- 300 systémů ze semínka (`src/core/galaxy.ts`): ~16 % v jádru (gaussovo shluk), ~68 % ve 4 spirálních ramenech, zbytek v halo. Minimální vzdálenost 2,2 ly.
- Oblasti podle poloměru: `jádro < 22 %`, `vnitřní < 50 %`, `vnější < 80 %`, `okraj`. Jádro je bohaté a nebezpečné, okraj chudý a málo prozkoumaný (anomálie, vyšší odměny za objevy).
- **Trasy**: každý systém se spojí se 2–4 nejbližšími sousedy (jádro hustěji), občas s jednou dlouhou trasou; souvislost grafu zaručuje doplnění minimální kostry (`buildRoutes`).
- Systém má 1–8 těles (planety, měsíce, max. 2 pásy asteroidů), hvězdu spektrální třídy O–M podle oblasti a 0–3 stanice. Těleso nese ložiska (skrytost 0–3), anomálie a rizikový koeficient.
- Galaxie se **neukládá**, vždy se znovu vygeneruje ze semínka. Ukládá se jen dynamický stav.

## 3. Ekonomika (`src/core/economy.ts`)

**Zásoby a cílová úroveň.** Každá stanice drží zásobu zboží, které obchoduje. Kapacita zásoby:

```
cap = capBase · velikost / √(základní cena)        capBase = 3600, velikost: malá 0,4 / střední 1 / velká 2,4
cíl = cap · frakce(role) · modifikátor událostí      producent: 0,5 + 0,45·s,  konzument: 0,5 − 0,4·s,  jinak 0,5
```

**Denní vývoj:** `zásoba += (cíl − zásoba) · 0,05`, šum ±2,5 %. Výrobce, kterému chybí vstupy výrobní receptury, má cíl až o 40 % nižší (`cíl · (0,6 + 0,4 · min(1, vstup/(0,3·cap_vstupu)))`). Dodávka vstupních surovin do průmyslové stanice tedy zvedne produkci a stlačí cenu.

**Cena:**

```
střední cena = základ · clamp((cap·0,5 / max(zásoba, 0,04·cap·0,5))^0,5, 0,35, 3,2)
nákup (hráč) = střední · (1 + rozpětí + clo)       prodej = střední · (1 − rozpětí − clo) · čerstvost
```

Rozpětí 6 %, clo 7 % (obtížnost mění koeficientem 0,6 / 1 / 1,5). Černý trh nemá clo, rozpětí 9 %. Cena se počítá po dávkách (až 24 kroků), takže **velký objem sám posouvá cenu** (skluz) a zásoba po obchodu zůstává změněná. Zásoba se vrací k cíli s poločasem ≈ 14 dní, proto zisk opakované trasy klesá (viz `docs/balance.md`).

**Události na trzích** (epidemie, neúroda, boom těžby, stávka, blokáda, slavnosti, technologický boom, zátah): násobí cílovou zásobu kategorie nebo zboží v jednom sektoru po dobu 8–40 dní. Hráč je vidí jako zprávy v sektorech, které navštívil.

**Stárnutí informací:** přesné ceny vidíš ve stanici, kde jsi. Jinak jen poslední známý snímek (`KnownPrice` s dnem). **Obchodní uzel** prodá aktuální snímek celého sektoru za 150 kr.

**Clo a černý trh:** legální trh má clo, černý trh (pirátské stanice a část ostatních v nepokojných oblastech) obchoduje s nelegálním zbožím. Při přistání na slušné stanici s nelegálním nákladem:

```
p = 0,22 · bezpečnost(oblast) · riziko · (1 − utajení) · (1 + 0,3 u stanic s černým trhem)
utajení = min(0,7, 0,6 · zabezpečené buňky / buňky nelegálního zboží)
```

Při odhalení: zabavení nelegálního zboží, pokuta `0,8 × hodnota` (ne víc než kreditů), pověst −3.

## 4. Loď

### Trupy

| Trup | Hmotnost | Náklad | Palivo | Trup (HP) | Cena | Poznámka |
|---|---:|---:|---:|---:|---:|---|
| Poutník (univerzální, start) | 50 | 10 | 60 | 100 | 9 000 | S/M/M/L |
| Poštolka (průzkumník) | 30 | 4 | 55 | 60 | 12 500 | obratná |
| Mula (lehký nákladní) | 45 | 16 | 50 | 90 | 14 500 | pomalá |
| Šipka (kurýr) | 22 | 3 | 40 | 45 | 15 500 | nejrychlejší |
| Vrták (těžební) | 85 | 18 | 90 | 150 | 31 000 | jádrové sloty M |
| Behemot (těžký nákladní) | 130 | 36 | 140 | 220 | 52 000 | jádrové sloty M |

Trup má mřížku slotů (`layout`): malá písmena jsou jádrové sloty (reaktor, motor, skok, podpora života, senzory), `S/M/L` volné sloty. Modul se vejde do slotu stejné nebo větší velikosti.

### Moduly

Velikost násobí hlavní vlastnost (×1 / ×2,2 / ×4,8), cenu (×1 / ×2,6 / ×6,5) a hmotnost. **Třída kvality** E, D, C, B, A: hlavní vlastnost ×0,7 / 0,85 / 1 / 1,2 / 1,45, spotřeba ×1,15 / 1,07 / 1 / 0,93 / 0,86, cena ×0,45 / 0,7 / 1 / 1,8 / 3,2, opotřebení ×1,3 / 1,15 / 1 / 0,85 / 0,7.

### Energie

Reaktor dává výkon `26 · velikost · kvalita · stav · sousedský bonus`. Moduly mají **trvalou** (senzory, podpora života, štít, chladicí prostor, trezor, ubikace, zesilovač, chladič) nebo **aktivní** spotřebu (motor, skokový pohon, laser, rafinerie, skenery, sběrač, oprava). Činnost vyžaduje:

```
skok:    trvalá + motor + skokový pohon ≤ výkon
těžba:   trvalá + laser (+ rafinerie / sběrač) ≤ výkon
skenování / opravy: trvalá + skener povrchu / odpalovač / oprava ≤ výkon
```

Vypnutý modul nespotřebovává ani nefunguje (reaktor a podporu života vypnout nejde). UI ukazuje všechny čtyři bilance.

### Sousednost

Zesilovač zvyšuje hlavní vlastnost ortogonálních sousedů o `18 % · kvalita` (max. +45 %), chladič snižuje jejich opotřebení o `25 % · kvalita` (max. 50 %) a spotřebu o `10 %` (max. 30 %).

### Odvozené vlastnosti

```
hmotnost = trup + Σ moduly + náklad
palivo/ly = 0,0105 · hmotnost / účinnost skoku          dolet = palivo / palivo_na_ly
dny skoku = vzdálenost / rychlost skoku + 0,35
dny v systému = AU · 0,08 · hmotnost / (tah · obratnost)
dosah senzorů = 5 + 2,2 · síla senzorů (ly)
```

### Opotřebení

Stav modulu 0–100 %. Výkon `perf = 1` nad 60 %, pod tím lineárně klesá k 0,5, při 0 % modul nefunguje. Opotřebení přibývá skoky (skokový pohon `1,0 · ly/4`, motor `0,25`, reaktor `0,12`), těžbou, skenováním a nehodami. Oprava ve stanici: `(100−stav)/100 · cena · 0,25`, trup `12 kr/bod`. **Opravárenský modul** opraví i ve vesmíru za cenu **náhradních dílů** z nákladu (hráč je může vyrobit rozebráním modulů). Rozebrání modulu dá kovy a náhradní díly.

## 5. Náklad

- Mřížka `sloupce × řádky` z `hull.cargoCols` a počtu buněk (trup + moduly). Zbytek posledního řádku je zablokován.
- Navíc **přetížený řádek** mimo trup. Kontejnery tam se počítají jako přetížení: `+12 %` spotřeby zásob za buňku a nehody `× (1 + 0,4 · buňky)`.
- Zboží se dělí na kontejnery 2×2, 2×1, 1×1 (kapacita `jedn./buňku · plocha`), doplňuje se do rozpracovaných kontejnerů. Tah myší a dotykem, otočení (R / opětovné klepnutí), automatické uspořádání.
- **Kvóty:** chlazené zboží potřebuje buňky chladicího prostoru, citlivé buňky trezoru. **Zkazitelné** zboží ztrácí hodnotu (čerstvost 1 → 0,2 mezi 30 % a 100 % doby trvanlivosti), po 140 % se zničí. **Nebezpečné** zboží při nehodě poškodí trup víc. **Nelegální** zboží viz celní kontrola.
- Hmotnost zboží zvyšuje spotřebu paliva na světelný rok a zkracuje dolet; plánovač trasy i náhled obchodu to ukazují.

## 6. Zakázky (`src/core/contracts.ts`, `contractOps.ts`)

Nástěnka se na stanici obnovuje každých 7 dní, deterministicky ze semínka. Odměny (zaokrouhlené na 5 kr):

| Druh | Odměna |
|---|---|
| Přeprava | `(ly · (15 + 9 · buňky) + 90) · 0,9–1,25` |
| Kurýr | `ly · 34 + 200 + 0–100` (termín 1,15–1,6 × odhad cesty) |
| Cestující | `cestující · ly · (10 + 6 · komfort) + 120` |
| Dodávka | `množství · cena · 1,25–1,55 + 12 · ly` |
| Průzkum | systém `380 + 22 · ly`, těleso `160 + 22 · ly` |
| Záchrana | `520 + 40 · ly` |

**Záloha** (20 % u přepravy, kurýra a cestujících) se vyplatí při přijetí a při splnění se odečte. **Pokuta** = záloha + 30 % odměny, platí se při propadnutí nebo vzdání se. **Bonus za společný cíl:** doručení více zakázek do stejné stanice najednou zvýší odměny o `8 %` za každou další (max. +40 %). Aktivních zakázek je nejvýš 8. Dokončení dává pověst stanici, propadnutí ji snižuje.

**Příběhové řetězce** (`src/content/chains.ts`): Doktorka Vesna, Ztracená expedice, Zapečetěné bedny. Každý má 3 kroky, další krok vznikne po splnění předchozího a poslední dává modul třídy A.

## 7. Průzkum a těžba (`src/core/exploration.ts`)

- **Skener systému** odhalí těleso, když `síla senzorů ≥ 1 + 0,5 · obtížnost`. Tělesa s nulovou obtížností vidíš při příletu. Naskenování systému vytvoří **objev** k prodeji.
- **Skener povrchu** odhalí ložisko nebo anomálii, když `síla ≥ skrytost + 1`. **Sonda** odhalí vše.
- **Hodnota objevů:** `(90 + 55·tělesa + 200·bohatost) · oblast · 1,8 · 0,85`, oblast: jádro 0,3, vnitřní 0,5, vnější 1, okraj 1,8. Prodává se v kartografii.
- **Těžba** trvá den; metoda podle tělesa: pás = laser, plynný obr = sběrač, povrch = vrt (spotřebuje sondu a vyžaduje odpalovač). Intenzita 1 / 2 / 3 má násobek výnosu `1 / 1,9 / 3,2`, palivo `0,6 / 1,4 / 2,8` a riziko `×0,5 / 1,4 / 3,2`.

```
výnos = základ · intenzita · (0,4 + bohatost ložiska) · 0,82^n          n = počet těžeb (obnovuje se o 1 za 15 dní)
riziko škody = 0,035 · riziko intenzity · riziko tělesa · obtížnost · (1 + 1,5 · průměrné opotřebení)
```

- **Rafinerie** přemění rudu na hustší a cennější materiál (železná ruda → kovy 2:1, vzácná ruda → vzácné kovy 2:1, uhlovodíky → polymery 2:1). Omezuje ji propustnost modulu a energie.
- **Anomálie** spouštějí textové události s volbami (zisk, ztráta, poškození, informace, nový modul).

## 8. Události (`src/content/events.ts`, `src/core/events.ts`)

50 událostí ve 4 spouštěčích: skok (42 % šance na skok), příletová (12 %), dokovací (12 %), těžební, a anomálie. Událost má podmínky (oblast, náklad, modul, kredity, palivo, pověst, příznak, den…), volby (volitelně s požadavkem) a vážené výsledky s efekty (kredity, palivo, zásoby, trup, opotřebení, zboží, ztráta nákladu, modul, odhalení okolí, čas, pověst, příznak, objev, smrt).

**Rozšiřitelnost pro v2 a v3:** typ `Cond` a `Effect` je diskriminovaná unie s variantou `ext` a registry `extConditions` / `extEffects` v `events.ts`. Podmínky na posádku, frakce či hrozbu se přidají registrací, bez změny enginu.

## 9. Nehody, pojištění, smrt

```
p(nehoda na skok) = 0,008 · riziko · (1 + 1,2·nebezpečnost) · (1 + 3,5·průměrné opotřebení) · (1 + 0,4·přetížení) · (1 + 0,15·skok/4 ly)
```

Druhy: únik paliva, poškození modulu, zásah do trupu, ztráta nákladu, únik nebezpečného zboží. Štít pohltí škodu trupu jako první a v dokovaných stanicích se dobije.

**Pojištění** stojí `0,07 % hodnoty / den` (trup + jádrové moduly, případně všechny moduly při plném krytí). Nelze-li platit, propadne a lze ho obnovit ve stanici (dluh + 5 dní). Po zničení lodi: návrat do poslední stanice, spoluúčast 10 % ceny trupu, trup a jádrové moduly (při plném krytí všechny) zůstanou, náklad a zakázky ztraceny, 3 dny pryč. Bez pojištění: základní loď a polovina kreditů. **Trvalá smrt** ukončí hru a smaže automatické uložení. Při ztrátě paliva existuje **odtah** (`callTow`), takže hra se nikdy nezasekne.

## 10. Ukládání

Stav je čisté JSON s `v: SAVE_VERSION`. Migrace jsou v `MIGRATIONS` v `src/core/save.ts` (klíč = verze, ze které se upgraduje). Ukládá se do IndexedDB (sloty, automatické uložení po každé akci s odkladem 1,5 s), export a import jsou soubory `driftline-save` s obálkou `{magic, version, savedAt, state}`.
