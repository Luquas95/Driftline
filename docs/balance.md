# Balanční report

Vygenerováno příkazem `npm run balance` (10 semínek × 120 dní na strategii, galaxie 300 systémů, normální obtížnost, pojištění zapnuto).

| Strategie | Příjem/den (medián) | Příjem/den (průměr) | Čistá hodnota po 30 dnech | Dny do +3000 kr | První vylepšení (den) | Nehody/100 dnů | Zničení lodi | Zničení do dne 20 | Skoků |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| trader | 132 | 113 | 2498 | 41 (8/10) | 0 | 2.5 | 2 | 1/10 | 52 |
| hauler | 66 | 52 | 2367 | 41 (7/10) | 0 | 3.3 | 0 | 0/10 | 45 |
| miner | 157 | 114 | 2290 | 34 (9/10) | 0 | 2.6 | 1 | 0/10 | 52 |
| explorer | 96 | 78 | 206 | 61 (9/10) | 0 | 2.1 | 0 | 0/10 | 50 |
| oracle | 371 | 336 | 9903 | 17 (10/10) | 0 | 2.5 | 1 | 0/10 | 49 |
| loop | -41 | -18 | -1043 | 11 (1/10) | — | 3.7 | 0 | 0/10 | 21 |

## Test smyčky zisku (pevná trasa A↔B)

Bot opakuje jedinou nejlepší trasu tam a zpět (okruh = obě cesty). Zisk jednoho okruhu v čase (průměr přes semínka):

| Okruh | Průměrný zisk (kr) | Vzorků |
|---:|---:|---:|
| 1 | 862 | 10 |
| 2 | 467 | 10 |
| 3 | 74 | 10 |
| 4 | -160 | 10 |
| 5 | -235 | 10 |
| 6 | -303 | 10 |
| 7 | -272 | 9 |
| 8 | -294 | 7 |
| 9 | -226 | 6 |
| 10 | -162 | 6 |
| 11 | -139 | 6 |
| 12 | -16 | 6 |

Zisk raných okruhů ≈ 664 kr, pozdních ≈ 45 kr (poměr 0.07).

## Nejvýdělečnější trasy (součet přes všechny boty)

| Trasa (stanice>stanice:zboží) | Zisk |
|---|---:|
| 68:0>145:0:spare_parts | 21378 |
| 15:0>287:0:machinery | 20958 |
| 272:1>272:0:machinery | 14218 |
| 145:0>68:0:iron_ore | 14210 |
| 76:0>15:0:computers | 12702 |
| 76:1>250:0:iron_ore | 11319 |
| 64:0>5:0:machinery | 10939 |
| 83:0>83:2:machinery | 9643 |

## Čistě obchodní hra bez zbraní (střety se řeší únikem, úplatkem, vyhnutím)

Boti nemají zbraně a střetům se vyhýbají (vyhnout se > zaplatit > úplatek > útěk > vyjednávání > boj). Tabulka ukazuje, kolik střetů potkají a co je stojí.

| Strategie | Střety/100 dní | Boje/100 dní | Úplatky (kr/100 dní) | Zničení lodi | Příjem/den (medián) |
|---|---:|---:|---:|---:|---:|
| trader | 3.9 | 1.6 | 1282 | 2 | 132 |
| hauler | 3.5 | 0.6 | 1100 | 0 | 66 |
| miner | 3.6 | 1.2 | 1009 | 1 | 157 |
| explorer | 3.9 | 1.1 | 266 | 0 | 96 |
| oracle | 5.2 | 1.8 | 3356 | 1 | 371 |
| loop | 2.3 | 0.5 | 38 | 0 | -41 |

## Boj: míra výher zbraní (AI proti AI)

Každá kombinace hraje 10 soubojů proti každé jiné na 5 trupech (wayfarer, kestrel, mule, swift, borer), obě lodě stejné třídy kvality C a stejné posádky, řídí je stejná AI. Řádek = výzbroj hráče, sloupec = protivník, hodnota = míra výher (remíza = 0,5).

| Výzbroj | energy | kinetic | missile | ion | drones | mixed | Průměr proti poli |
|---|---:|---:|---:|---:|---:|---:|---:|
| **energy** | 50 % | 30 % | 34 % | 68 % | 62 % | 20 % | **43 %** |
| **kinetic** | 68 % | 50 % | 30 % | 42 % | 70 % | 34 % | **49 %** |
| **missile** | 72 % | 70 % | 50 % | 74 % | 12 % | 58 % | **57 %** |
| **ion** | 34 % | 74 % | 32 % | 50 % | 62 % | 58 % | **52 %** |
| **drones** | 32 % | 22 % | 84 % | 34 % | 50 % | 28 % | **40 %** |
| **mixed** | 64 % | 56 % | 44 % | 50 % | 62 % | 50 % | **55 %** |

Nejsilnější výzbroj: **missile** (57 %), nejslabší: **drones** (40 %). Cíl je průměr proti poli v rozmezí 40–60 %.

### Míra výher proti vyrovnanému protivníkovi (smíšená výzbroj stejného trupu)

| Trup | energy | kinetic | missile | ion | drones |
|---|---:|---:|---:|---:|---:|
| wayfarer | 0 % | 50 % | 100 % | 0 % | 0 % |
| kestrel | 20 % | 10 % | 80 % | 60 % | 10 % |
| mule | 20 % | 10 % | 20 % | 70 % | 20 % |
| swift | 30 % | 0 % | 90 % | 70 % | 10 % |
| borer | 30 % | 100 % | 0 % | 90 % | 100 % |

Nejsilnější kombinace proti smíšenému protivníkovi: wayfarer + missile (100 %), borer + kinetic (100 %), borer + drones (100 %). Nejslabší: wayfarer + drones (0 %), swift + kinetic (0 %), borer + missile (0 %).

## Boj: kořist proti nákladům

Skutečné střety (loď třídy mule se smíšenou výzbrojí, auto-boj, 8 soubojů na protivníka a úroveň). Kořist = kredity + hodnota zboží ze zničeného vraku. Náklady = účet za opravu trupu a modulů ve stanici + spotřebované rakety (26 kr/ks). Zničení lodi se do nákladů nepočítá, ale je uvedeno zvlášť.

### Obtížnost rizika: nízké

Míra výher 36 %, zničení vlastní lodi 39 %, průměrná kořist na souboj 419 kr, průměrné náklady 326 kr, čistý výsledek na souboj 93 kr.

### Obtížnost rizika: normální

Míra výher 35 %, zničení vlastní lodi 39 %, průměrná kořist na souboj 423 kr, průměrné náklady 354 kr, čistý výsledek na souboj 69 kr.

| Protivník | Úroveň | Výhry | Kořist/souboj | Náklady/souboj | Čisté |
|---|---:|---:|---:|---:|---:|
| scrapper | 1 | 100 % | 855 | 0 | 855 |
| scrapper | 2 | 100 % | 870 | 2 | 868 |
| raider | 1 | 88 % | 1347 | 438 | 909 |
| raider | 3 | 0 % | 0 | 0 | 0 |
| corsair | 2 | 0 % | 0 | 1457 | -1457 |
| corsair | 3 | 0 % | 0 | 0 | 0 |
| warlord | 3 | 0 % | 0 | 764 | -764 |
| hunter | 1 | 100 % | 1582 | 0 | 1582 |
| hunter | 3 | 0 % | 0 | 1233 | -1233 |
| tracker | 2 | 0 % | 0 | 0 | 0 |
| tracker | 3 | 0 % | 0 | 0 | 0 |

### Obtížnost rizika: vysoké

Míra výher 36 %, zničení vlastní lodi 38 %, průměrná kořist na souboj 449 kr, průměrné náklady 342 kr, čistý výsledek na souboj 106 kr.

### Míra výher podle výzbroje a obtížnosti (proti střetům)

| Výzbroj | nízké riziko | normální | vysoké |
|---|---:|---:|---:|
| energy | 30 % | 30 % | 30 % |
| kinetic | 36 % | 36 % | 34 % |
| missile | 41 % | 41 % | 36 % |
| ion | 27 % | 23 % | 25 % |
| drones | 36 % | 36 % | 36 % |
| mixed | 36 % | 34 % | 36 % |

Doba běhu simulace: 92 s.
