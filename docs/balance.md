# Balanční report

Vygenerováno příkazem `npm run balance` (10 semínek × 120 dní na strategii, galaxie 300 systémů, normální obtížnost, pojištění zapnuto).

| Strategie | Příjem/den (medián) | Příjem/den (průměr) | Čistá hodnota po 30 dnech | Dny do +3000 kr | První vylepšení (den) | Nehody/100 dnů | Zničení lodi | Zničení do dne 20 | Skoků |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| trader | 117 | 77 | 1007 | 51 (8/10) | 0 | 3.0 | 2 | 0/10 | 51 |
| hauler | 55 | 18 | 702 | 58 (7/10) | 0 | 3.1 | 1 | 0/10 | 46 |
| miner | 75 | 50 | -885 | 61 (7/10) | 0 | 2.2 | 0 | 0/10 | 46 |
| explorer | 81 | 62 | 602 | 59 (8/10) | 0 | 1.8 | 1 | 0/10 | 38 |
| oracle | 431 | 392 | 8301 | 12 (10/10) | 0 | 2.1 | 1 | 0/10 | 48 |
| loop | -389 | -391 | -22886 | 0 (2/10) | — | 2.5 | 0 | 0/10 | 21 |

## Test smyčky zisku (pevná trasa A↔B)

Bot opakuje jedinou nejlepší trasu tam a zpět (okruh = obě cesty). Zisk jednoho okruhu v čase (průměr přes semínka):

| Okruh | Průměrný zisk (kr) | Vzorků |
|---:|---:|---:|
| 1 | -1795 | 10 |
| 2 | -7852 | 10 |
| 3 | -5338 | 10 |
| 4 | -3397 | 10 |
| 5 | -1897 | 9 |
| 6 | -1141 | 9 |
| 7 | -330 | 8 |
| 8 | -409 | 6 |
| 9 | -124 | 5 |
| 10 | -395 | 5 |
| 11 | -313 | 5 |
| 12 | -5 | 5 |

Zisk raných okruhů ≈ -4824 kr, pozdních ≈ -814 kr (poměr -813.53).

## Nejvýdělečnější trasy (součet přes všechny boty)

| Trasa (stanice>stanice:zboží) | Zisk |
|---|---:|
| 253:0>154:0:machinery | 30017 |
| 76:0>15:0:computers | 17355 |
| 250:0>15:0:spare_parts | 15626 |
| 114:2>114:1:spare_parts | 15093 |
| 194:0>195:0:machinery | 14848 |
| 15:0>287:0:machinery | 14682 |
| 68:0>145:0:spare_parts | 13082 |
| 172:2>186:0:machinery | 12153 |

## Čistě obchodní hra bez zbraní (střety se řeší únikem, úplatkem, vyhnutím)

Boti nemají zbraně a střetům se vyhýbají (vyhnout se > zaplatit > úplatek > útěk > vyjednávání > boj). Tabulka ukazuje, kolik střetů potkají a co je stojí.

| Strategie | Střety/100 dní | Boje/100 dní | Úplatky (kr/100 dní) | Zničení lodi | Příjem/den (medián) |
|---|---:|---:|---:|---:|---:|
| trader | 2.3 | 0.9 | 1356 | 2 | 117 |
| hauler | 2.7 | 0.7 | 731 | 1 | 55 |
| miner | 2.9 | 0.9 | 1210 | 0 | 75 |
| explorer | 1.8 | 0.4 | 100 | 1 | 81 |
| oracle | 3.0 | 0.4 | 2490 | 1 | 431 |
| loop | 2.1 | 0.8 | 347 | 0 | -389 |

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

## Nový začátek: první loď a kapitál

Kapitál: snadná 60000 kr, normální 40000 kr, těžká 25000 kr. Boti si první loď vybírají podle strategie (nechají si 40–50 % kapitálu na první náklad). Tabulka ukazuje obchodníka, který dostal danou loď (6 semínek × 90 dní, normální obtížnost, jen nové kusy, které kapitál dovolí).

| Loď | Cena (kr) | Zbude (kr) | Příjem/den (medián) | Čistá hodnota po 30 dnech | Zničení lodi | Dny do +3000 kr |
|---|---:|---:|---:|---:|---:|---:|
| courier | 7000 | 33000 | 52 | 2481 | 1 | 45 (4/6) |
| wayfarer | 9000 | 31000 | -24 | -4256 | 1 | 63 (2/6) |
| scout | 11500 | 28500 | 78 | -440 | 2 | 36 (3/6) |
| kestrel | 12500 | 27500 | 94 | -185 | 2 | 18 (3/6) |
| mule | 14500 | 25500 | 48 | -1577 | 1 | 17 (3/6) |
| prospector | 15000 | 25000 | -35 | -3157 | 2 | 64 (2/6) |
| swift | 15500 | 24500 | 25 | -297 | 2 | 34 (2/6) |
| merchant | 31000 | 9000 | -44 | -3439 | 2 | 48 (2/6) |

### Podle obtížnosti (výchozí volba bota)

| Obtížnost | Strategie | První loď (modus) | Příjem/den (medián) | Zničení lodi | Dny do +3000 kr |
|---|---|---|---:|---:|---:|
| easy | trader | merchant | 82 | 0 | 51 (5/6) |
| easy | miner | borer | 40 | 1 | 30 (3/6) |
| easy | explorer | scout | 111 | 0 | 30 (6/6) |
| normal | trader | merchant | -2 | 0 | 61 (3/6) |
| normal | miner | prospector | -38 | 1 | 68 (1/6) |
| normal | explorer | scout | 104 | 0 | 45 (6/6) |
| hard | trader | mule | -75 | 1 | 64 (1/6) |
| hard | miner | prospector | -87 | 2 | — (0/6) |
| hard | explorer | wayfarer | 65 | 0 | 58 (4/6) |

**Závěr k novému začátku.** Žádná první loď není jistá prohra pro všechny strategie: kurýr a kestrel jsou v normální obtížnosti kladné, průzkumník s lodí scout vydělává na všech obtížnostech. Nejdražší lodě (merchant) nechají málo na první náklad, těžařské trupy mají pomalý rozjezd (bot kupuje moduly až z výdělku) a na těžké obtížnosti jsou obchodník a těžař v prvních 90 dnech kolem nuly, což odpovídá záměru „těžká“. Žádná loď není triviálně nejlepší. Do ladění dál patří ceny těžařských trupů.

Doba běhu simulace: 126 s.
