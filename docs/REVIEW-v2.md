# Revize v2 (boj a posádka)

Tři nezávislé revize (subagenti, jen čtení, každá ověřovala skripty a screenshoty). Závažnost: HIGH a MEDIUM jsou opravené, u LOW je uveden stav.

## 1. Herní design a vyváženost boje

| # | Závažnost | Nález | Stav |
|---|---|---|---|
| 1 | HIGH | Útěk z boje vždy vyšel (156 ze 156 pokusů): nabití 14 s, nic ho nenarušilo, AI nemířila na skokový pohon. | **Opraveno.** Nabití 20 s, zásah skokového pohonu při útěku vrací nabití o 25 %, ion ho zastaví, AI při útěku míří na skokový pohon (priorita +3,5). |
| 2 | HIGH | Kořist mimo ekonomiku (1–5 tis. kr za souboj proti příjmu 100–200 kr/den): zboží se losovalo po kusech bez ohledu na cenu. | **Opraveno.** Množství zboží se škáluje cenou (`min(1, 100/cena)`), kredity z tabulky zůstaly; report počítá i spoluúčast pojištění. |
| 3 | HIGH | Ruční rozdělení energie dominovalo: skokový pohon trvale bral většinu skupiny motorů, motory a pilot byly past (úhyb jen 10–20 %). | **Opraveno.** Skokový pohon bere v boji 30 % příkonu, úhyb ×2, AI (i auto-boj) snižuje váhu motorů mimo útěk. |
| 4 | MEDIUM | Matice výher počítala útěk jako výhru/prohru a skrývala výsledky podle trupu; smíšená výzbroj dominovala; stalemate u borer. | **Částečně.** Výhra jen zabitím nebo vzdáním, útěk je remíza; regenerace štítu 4 → 3 %/s; zbraně znovu vyladěny optimalizací proti matici. Zůstává, že výsledek závisí na trupu (sloty S/M/L): report ukazuje tabulku podle trupu a smíšená výzbroj je o něco silnější (viz `balance.md`). |
| 5 | MEDIUM | Boj není „občas výdělečný“, ale útes (úroveň 1–2 100 %, úroveň 3 0 %). | **Opraveno částečně.** Protivníci úrovní 1 a 2 mají o 2 a 1 modul méně, trup ×0,85 / 1 / 1,2; report po úrovních a se spoluúčastí. Úroveň 3 zůstává záměrně nebezpečná. |
| 6 | MEDIUM | Šance na střet je na skok, ne na čas: krátké skoky se daly farmit. | **Opraveno.** Násobek podle délky cesty (0,3–1,5×) a ×0,3 tři dny po střetu. |
| 7 | MEDIUM | Příznak `wanted` se nikdy nerušil. | **Opraveno.** Platí 30 dní od útoku na celnici. |
| 8 | MEDIUM | Výkupné chamtivého bylo zdarma při prázdném nákladu. | **Opraveno.** Minimum `120 kr + 8 % kreditů`; munice se nebere. |
| 9 | MEDIUM | Obtížnost téměř nemění boj. | **Částečně.** Zvyšuje trup, dovednost posádky a kořist protivníka; počet lodí a kvalita se podle rizika nemění (rozhodnutí: riziko ovlivňuje hlavně četnost střetů). |
| 10 | LOW | Teplo, kyslík a zranění posádky skoro nehrají roli. | **Zmírněno.** Základní chlazení 3,2 → 2,4, únik kyslíku 15 → 20 %/s. |
| 11 | LOW | Důstojníci stojí víc, než dávají. | **Opraveno.** Násobek mzdy 3 → 1,8. |
| 12 | LOW | Boti nebojují (žádný armed bot). | Neopraveno: obchodní hra bez boje je pokrytá; boj je pokrytý souboji AI proti AI a tabulkou kořist/náklady. |
| 13 | LOW | Drobnosti (útěk bez paliva při 0 paliva, druhý chamtivý nežádá výkupné, časový limit 420 s je únik zdarma). | Neopraveno, zapsáno jako známé. |

## 2. Determinismus, výkon (60 FPS) a migrace

| # | Závažnost | Nález | Stav |
|---|---|---|---|
| 1 | HIGH | `validate()`/`repair()` neznaly `combat`, `encounter` a pole posádky: poškozená nebo zastaralá uložená hra s bojem shodila simulaci. | **Opraveno.** `validCombat` kontroluje rozsahy indexů, druhy zbraní, rasy, čísla, délky polí a stav RNG; neplatný boj se zahodí, střet s neznámými nepřáteli také, dovednosti, důstojníci a mzdy se opraví. Test v `hardening.test.ts`. |
| 2 | HIGH | Výjimka v simulaci nebo vykreslení zastaví ticker Pixi navždy a nic nechytá chyby v UI. | **Opraveno.** `try/catch` v `driveCombat` (boj se zruší, hra pokračuje) a ve `Stage`, `ErrorBoundary` na kořeni s návratem do menu. |
| 3 | MEDIUM | Boj se ukládal jen po `act()`: reload uprostřed boje vrátil stav ze začátku. | **Opraveno.** Autosave každých 5 s herního času boje, při pauze, a při `pagehide` / skrytí karty. |
| 4 | MEDIUM | Štítové vrstvy bez limitu (až 44 elips na loď). | **Opraveno.** Nejvýš 8 vrstev. |
| 5 | MEDIUM | Dynamická grafika se při pozastavení překresluje každý snímek. | **Opraveno.** Při pauze se překresluje jen při změně (čas, výběr, cíl, událost); animace podle `dt`. |
| 6 | MEDIUM | Texty místností se ničí a vytvářejí při každém rozložení, popisek kyslíku se mění každý snímek. | **Opraveno.** Texty se vytvářejí jednou, kyslík po 5 %. |
| 7 | LOW | HUD se překresluje 10× za sekundu i při pauze. | Pauza už nepřekresluje; vykreslování jen aktivní záložky neopraveno. |
| 8 | LOW | Velká pole (drony, posádka) nebyla omezená. | **Opraveno** v `validCombat` a `validate`. |
| 9 | LOW | Odstraněné moduly a zboží v uložené hře odmítnou celé uložení. | Neopraveno (stejné chování už ve v1). |
| 10 | LOW | Pojištěná porážka s mrtvou posádkou nechá prázdnou posádku. | **Opraveno** v `destroyShip`. |
| 11 | LOW | Odznak výsledku se nemusí vykreslit. | **Opraveno.** |
| 12 | LOW | Animace vázané na snímky. | **Opraveno.** |

Potvrzeno bez nálezu: žádné `Math.random`/`Date.now` v jádru, pevný krok `DT` nezávislý na snímkové frekvenci, perzistentní RNG spotřebovávají jen akce hráče, `autoResolve` má pojistku, migrace v1 → v2 pokrývá všechna nová pole.

## 3. UX boje (desktop a mobil)

| # | Závažnost | Nález | Stav |
|---|---|---|---|
| 1 | MEDIUM | Třída `.skill.main` kolidovala s `.main` rozložení: rozbité řádky dovedností. | **Opraveno** (`.is-main`). |
| 2 | MEDIUM | Požár, průraz a ion jen barvou, málo čitelné. | **Opraveno.** Plamen, klikatá linie a blesk jako tvary, popisek O₂ při nízkém kyslíku, silnější požár i při omezeném pohybu. |
| 3 | MEDIUM | Na mobilu zmizel log (a `aria-live`). | **Opraveno.** Poslední řádek jako pruh nad HUD. |
| 4 | MEDIUM | Místnosti bez označení (jen barva). | **Opraveno.** Písmeno druhu místnosti. |
| 5 | MEDIUM | Lišty trupu a štítu bez popisku a čísel. | **Opraveno.** |
| 6 | MEDIUM | Mobil: lišty překrývají loď, loď skáče mezi záložkami. | **Opraveno.** Rozložení počítá se štítovou bublinou, minimální výška HUD. |
| 7 | MEDIUM | Dialog výkupného: bez okraje, malá tlačítka, žádný odznak pauzy, bez hodnoty nákladu. | **Opraveno.** |
| 8 | MEDIUM | Klávesy během dialogu výkupného ovládaly boj. | **Opraveno** (jen `Y` / `N`). |
| 9 | LOW | Energie startuje přetížená bez vysvětlení. | **Opraveno.** Upozornění „nedostatek energie“. |
| 10 | LOW | Malé zásahové plochy členů posádky. | **Opraveno** (poloměr 22 px, klepnutí na místnost má přednost). |
| 11 | LOW | Tlačítka pod 44 px na dotyku. | **Opraveno** (`pointer: coarse`). |
| 12 | LOW | Propuštění bez potvrzení. | **Opraveno.** |
| 13 | LOW | `aria-pressed`, šipky v záložkách, `aria-valuetext`. | `aria-pressed` hotovo; šipky a `aria-valuetext` ne. |
| 14 | LOW | Mobil: tlačítko Skočit pod přehybem, zkrácený štítek „Nastavení“. | Neopraveno. |
| 15 | LOW | Dialog střetu bez souhrnu síly protivníka. | Neopraveno. |
