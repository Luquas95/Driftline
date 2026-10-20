# Balanční report

Vygenerováno příkazem `npm run balance` (10 semínek × 120 dní na strategii, galaxie 300 systémů, normální obtížnost, pojištění zapnuto).

| Strategie | Příjem/den (medián) | Příjem/den (průměr) | Čistá hodnota po 30 dnech | Dny do +3000 kr | První vylepšení (den) | Nehody/100 dnů | Zničení lodi | Zničení do dne 20 | Skoků |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| trader | 96 | 85 | 1167 | 63 (10/10) | 0 | 2.9 | 0 | 0/10 | 53 |
| hauler | 6 | -3 | 75 | 46 (5/10) | 0 | 2.3 | 0 | 0/10 | 38 |
| miner | 76 | 85 | -110 | 56 (8/10) | 0 | 2.7 | 0 | 0/10 | 49 |
| explorer | 84 | 64 | 478 | 66 (7/10) | 0 | 1.8 | 0 | 0/10 | 34 |
| oracle | 455 | 392 | 9589 | 14 (10/10) | 0 | 2.5 | 0 | 0/10 | 49 |
| loop | -403 | -390 | -23227 | 0 (2/10) | — | 2.6 | 0 | 0/10 | 20 |

## Test smyčky zisku (pevná trasa A↔B)

Bot opakuje jedinou nejlepší trasu tam a zpět (okruh = obě cesty). Zisk jednoho okruhu v čase (průměr přes semínka):

| Okruh | Průměrný zisk (kr) | Vzorků |
|---:|---:|---:|
| 1 | -1635 | 10 |
| 2 | -7682 | 10 |
| 3 | -5841 | 10 |
| 4 | -3364 | 10 |
| 5 | -1856 | 9 |
| 6 | -1149 | 9 |
| 7 | -192 | 8 |
| 8 | -492 | 6 |
| 9 | -124 | 5 |
| 10 | -418 | 5 |
| 11 | -338 | 5 |
| 12 | 9 | 5 |

Zisk raných okruhů ≈ -4658 kr, pozdních ≈ -829 kr (poměr -828.50).

## Nejvýdělečnější trasy (součet přes všechny boty)

| Trasa (stanice>stanice:zboží) | Zisk |
|---|---:|
| 253:0>154:0:machinery | 21456 |
| 114:2>114:1:spare_parts | 19040 |
| 68:0>145:0:spare_parts | 16628 |
| 68:0>145:0:machinery | 15056 |
| 250:0>15:0:spare_parts | 13663 |
| 145:0>68:0:iron_ore | 13635 |
| 253:0>154:0:spare_parts | 12677 |
| 216:0>149:0:crystals | 12287 |

## Čistě obchodní hra bez zbraní (střety se řeší únikem, úplatkem, vyhnutím)

Boti nemají zbraně a střetům se vyhýbají (vyhnout se > zaplatit > úplatek > útěk > vyjednávání > boj). Tabulka ukazuje, kolik střetů potkají a co je stojí.

| Strategie | Střety/100 dní | Boje/100 dní | Úplatky (kr/100 dní) | Zničení lodi | Příjem/den (medián) |
|---|---:|---:|---:|---:|---:|
| trader | 2.6 | 0.6 | 1406 | 0 | 96 |
| hauler | 2.8 | 0.7 | 975 | 0 | 6 |
| miner | 3.3 | 0.7 | 1527 | 0 | 76 |
| explorer | 1.7 | 0.4 | 100 | 0 | 84 |
| oracle | 3.2 | 0.6 | 2514 | 0 | 455 |
| loop | 2.4 | 0.8 | 376 | 0 | -403 |

## Boj: míra výher zbraní (AI proti AI)

Každá kombinace hraje 12 soubojů proti každé jiné na 5 trupech (wayfarer, kestrel, mule, swift, borer), obě lodě stejné třídy kvality C a stejné posádky, řídí je stejná AI. Řádek = výzbroj hráče, sloupec = protivník, hodnota = míra výher (remíza = 0,5).

| Výzbroj | energy | kinetic | missile | ion | drones | mixed | Průměr proti poli |
|---|---:|---:|---:|---:|---:|---:|---:|
| **energy** | 50 % | 40 % | 43 % | 53 % | 56 % | 34 % | **45 %** |
| **kinetic** | 63 % | 50 % | 57 % | 36 % | 66 % | 43 % | **53 %** |
| **missile** | 55 % | 54 % | 50 % | 74 % | 9 % | 51 % | **49 %** |
| **ion** | 28 % | 67 % | 28 % | 50 % | 63 % | 31 % | **43 %** |
| **drones** | 36 % | 38 % | 88 % | 43 % | 50 % | 33 % | **48 %** |
| **mixed** | 74 % | 54 % | 46 % | 56 % | 68 % | 50 % | **60 %** |

Nejsilnější výzbroj: **mixed** (60 %), nejslabší: **ion** (43 %). Cíl je průměr proti poli v rozmezí 40–60 %.

### Míra výher proti vyrovnanému protivníkovi (smíšená výzbroj stejného trupu)

| Trup | energy | kinetic | missile | ion | drones |
|---|---:|---:|---:|---:|---:|
| wayfarer | 0 % | 25 % | 75 % | 0 % | 0 % |
| kestrel | 17 % | 33 % | 58 % | 33 % | 42 % |
| mule | 25 % | 33 % | 4 % | 21 % | 17 % |
| swift | 58 % | 33 % | 79 % | 50 % | 17 % |
| borer | 71 % | 88 % | 38 % | 50 % | 88 % |

Nejsilnější kombinace proti smíšenému protivníkovi: borer + kinetic (88 %), borer + drones (88 %), swift + missile (79 %). Nejslabší: wayfarer + energy (0 %), wayfarer + ion (0 %), wayfarer + drones (0 %).

## Boj: kořist proti nákladům

Skutečné střety (loď třídy mule se smíšenou výzbrojí, auto-boj, 10 soubojů na protivníka a úroveň). Kořist = kredity + hodnota zboží ze zničeného vraku. Náklady = účet za opravu trupu a modulů ve stanici + spotřebované rakety (26 kr/ks). Zničení lodi se počítá jako spoluúčast pojištění (25 % ceny trupu).

### Obtížnost rizika: nízké

Míra výher 36 %, zničení vlastní lodi 53 %, průměrná kořist na souboj 368 kr, průměrné náklady 2074 kr, čistý výsledek na souboj -1706 kr.

### Obtížnost rizika: normální

Míra výher 36 %, zničení vlastní lodi 56 %, průměrná kořist na souboj 380 kr, průměrné náklady 2176 kr, čistý výsledek na souboj -1796 kr.

| Protivník | Úroveň | Výhry | Kořist/souboj | Náklady/souboj | Čisté |
|---|---:|---:|---:|---:|---:|
| scrapper | 1 | 100 % | 815 | 0 | 815 |
| scrapper | 2 | 100 % | 799 | 0 | 799 |
| raider | 1 | 100 % | 1372 | 606 | 766 |
| raider | 3 | 0 % | 0 | 203 | -203 |
| corsair | 2 | 0 % | 0 | 128 | -128 |
| corsair | 3 | 0 % | 0 | 0 | 0 |
| warlord | 3 | 0 % | 0 | 497 | -497 |
| hunter | 1 | 100 % | 1196 | 0 | 1196 |
| hunter | 3 | 0 % | 0 | 0 | 0 |
| tracker | 2 | 0 % | 0 | 0 | 0 |
| tracker | 3 | 0 % | 0 | 0 | 0 |

### Obtížnost rizika: vysoké

Míra výher 36 %, zničení vlastní lodi 55 %, průměrná kořist na souboj 397 kr, průměrné náklady 2153 kr, čistý výsledek na souboj -1755 kr.

### Míra výher podle výzbroje a obtížnosti (proti střetům)

| Výzbroj | nízké riziko | normální | vysoké |
|---|---:|---:|---:|
| energy | 36 % | 35 % | 36 % |
| kinetic | 36 % | 36 % | 36 % |
| missile | 47 % | 40 % | 40 % |
| ion | 31 % | 33 % | 27 % |
| drones | 36 % | 36 % | 36 % |
| mixed | 36 % | 36 % | 36 % |

## Koncová hra: základna, frakce, Šeď a konce

### Rychlost Šedi (bez zásahu hráče)

Dny do pohlcení podílu galaxie, medián přes semínka; „zpomalená“ = plné zpomalení z výzkumu (strop 85 %).

| Riziko | 20 % | 50 % | 80 % (konec „pohlceno“) | 80 % při plném zpomalení |
|---|---:|---:|---:|---:|
| low | 401 | 516 | 582 | 1734 |
| normal | 243 | 350 | 451 | 1355 |
| high | 187 | 254 | 319 | 978 |

### Boti v koncové hře

Bot má ke stejným strategiím jako dosud správce základny: staví podle plánu cíle, zkoumá, plní příběhové zastávky a v závěru se pokusí o „svůj“ konec. Boti hrají s předpokladem: materiál na stavbu kupují přímo do skladu a skenování ložisek berou jako hotové. Druhý scénář přidává příjem navíc (model hráče, který vydělává víc než boti).

#### Boti sami (příjem jen z obchodu)

| Strategie (cíl) | Konce | Medián dne konce | Základna (den) | Příběh 5 (den) | Podíl pasivního příjmu (den ~200) | Pohlceno na konci |
|---|---|---:|---:|---:|---:|---:|
| miner (science) | nic 1/6, consumed 5/6 | 535 | 215 | 319 | 0 % | 80 % |
| explorer (accord) | consumed 5/6, accord 1/6 | 517 | 119 | 284 | 0 % | 80 % |
| trader (exodus) | consumed 6/6 | 518 | 163 | 401 | 0 % | 80 % |
| hauler (dominion) | consumed 6/6 | 518 | 249 | 394 | 0 % | 80 % |

#### Hráč s vyšším příjmem (+600 kr/den navíc)

| Strategie (cíl) | Konce | Medián dne konce | Základna (den) | Příběh 5 (den) | Podíl pasivního příjmu (den ~200) | Pohlceno na konci |
|---|---|---:|---:|---:|---:|---:|
| miner (science) | science 3/6, consumed 2/6, nic 1/6 | 500 | 46 | 219 | 4 % | 77 % |
| explorer (accord) | accord 3/6, consumed 3/6 | 441 | 42 | 238 | 1 % | 80 % |
| trader (exodus) | consumed 6/6 | 521 | 71 | 206 | 0 % | 80 % |
| hauler (dominion) | consumed 6/6 | 536 | 47 | 207 | 12 % | 80 % |

**Čtení tabulky.** Bot je v koncové hře slabý: nechává Šeď růst a spoléhá na obchod. Každý ze čtyř koncových scénářů je dosažitelný (scénář s příběhem prochází `tests/story.test.ts`), tabulka ukazuje tempo, kterého dosáhne bot, ne strop hráče.

## Nový začátek: první loď a kapitál

Kapitál: snadná 60000 kr, normální 40000 kr, těžká 25000 kr. Boti si první loď vybírají podle strategie (nechají si 40–50 % kapitálu na první náklad). Tabulka ukazuje obchodníka, který dostal danou loď (6 semínek × 90 dní, normální obtížnost, jen nové kusy, které kapitál dovolí).

| Loď | Cena (kr) | Zbude (kr) | Příjem/den (medián) | Čistá hodnota po 30 dnech | Zničení lodi | Dny do +3000 kr |
|---|---:|---:|---:|---:|---:|---:|
| courier | 7000 | 33000 | 127 | 2949 | 1 | 34 (5/6) |
| wayfarer | 9000 | 31000 | 5 | -3296 | 2 | 22 (2/6) |
| scout | 11500 | 28500 | 92 | 290 | 1 | 41 (5/6) |
| kestrel | 12500 | 27500 | 98 | 345 | 1 | 41 (5/6) |
| mule | 14500 | 25500 | 50 | -1611 | 1 | 23 (3/6) |
| prospector | 15000 | 25000 | 38 | -3500 | 0 | 40 (3/6) |
| swift | 15500 | 24500 | 121 | 283 | 0 | 70 (6/6) |
| merchant | 31000 | 9000 | 7 | -3708 | 0 | 44 (2/6) |

### Podle obtížnosti (výchozí volba bota)

| Obtížnost | Strategie | První loď (modus) | Příjem/den (medián) | Zničení lodi | Dny do +3000 kr |
|---|---|---|---:|---:|---:|
| easy | trader | merchant | 67 | 0 | 39 (5/6) |
| easy | miner | borer | 27 | 1 | 47 (2/6) |
| easy | explorer | scout | 75 | 1 | 28 (5/6) |
| normal | trader | merchant | 44 | 2 | 62 (3/6) |
| normal | miner | prospector | 41 | 0 | 43 (3/6) |
| normal | explorer | scout | 64 | 1 | 28 (5/6) |
| hard | trader | mule | -49 | 0 | 70 (1/6) |
| hard | miner | prospector | -38 | 1 | — (0/6) |
| hard | explorer | wayfarer | 41 | 1 | 55 (4/6) |

**Závěr k novému začátku.** Žádná první loď není jistá prohra pro všechny strategie: kurýr a kestrel jsou v normální obtížnosti kladné, průzkumník s lodí scout vydělává na všech obtížnostech. Nejdražší lodě (merchant) nechají málo na první náklad, těžařské trupy mají pomalý rozjezd (bot kupuje moduly až z výdělku) a na těžké obtížnosti jsou obchodník a těžař v prvních 90 dnech kolem nuly, což odpovídá záměru „těžká“. Žádná loď není triviálně nejlepší. Do ladění dál patří ceny těžařských trupů.

Doba běhu simulace: 308 s.
