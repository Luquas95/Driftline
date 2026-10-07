# Balanční report

Vygenerováno příkazem `npm run balance` (10 semínek × 120 dní na strategii, galaxie 300 systémů, normální obtížnost, pojištění zapnuto).

| Strategie | Příjem/den (medián) | Příjem/den (průměr) | Čistá hodnota po 30 dnech | Dny do +3000 kr | První vylepšení (den) | Nehody/100 dnů | Zničení lodi | Zničení do dne 20 | Skoků |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| trader | 110 | 79 | 2255 | 40 (6/10) | 0 | 3.0 | 4 | 1/10 | 51 |
| hauler | 46 | 34 | 1775 | 46 (7/10) | 0 | 3.5 | 1 | 0/10 | 45 |
| miner | 190 | 137 | 2262 | 33 (9/10) | 0 | 2.5 | 1 | 0/10 | 49 |
| explorer | 50 | 61 | -121 | 66 (8/10) | 0 | 2.4 | 1 | 0/10 | 49 |
| oracle | 322 | 345 | 9794 | 17 (9/10) | 0 | 1.9 | 1 | 0/10 | 46 |
| loop | -40 | -21 | -1267 | 11 (1/10) | — | 3.2 | 0 | 0/10 | 21 |

## Test smyčky zisku (pevná trasa A↔B)

Bot opakuje jedinou nejlepší trasu tam a zpět (okruh = obě cesty). Zisk jednoho okruhu v čase (průměr přes semínka):

| Okruh | Průměrný zisk (kr) | Vzorků |
|---:|---:|---:|
| 1 | 818 | 10 |
| 2 | 416 | 10 |
| 3 | 25 | 10 |
| 4 | -191 | 10 |
| 5 | -259 | 10 |
| 6 | -311 | 10 |
| 7 | -266 | 9 |
| 8 | -297 | 7 |
| 9 | -232 | 6 |
| 10 | -164 | 6 |
| 11 | -126 | 6 |
| 12 | -4 | 6 |

Zisk raných okruhů ≈ 617 kr, pozdních ≈ 33 kr (poměr 0.05).

## Nejvýdělečnější trasy (součet přes všechny boty)

| Trasa (stanice>stanice:zboží) | Zisk |
|---|---:|
| 15:0>287:0:machinery | 18249 |
| 279:1>279:0:machinery | 17394 |
| 68:0>145:0:spare_parts | 14309 |
| 272:1>272:0:machinery | 13191 |
| 64:0>5:0:machinery | 12242 |
| 230:1>145:0:spare_parts | 11924 |
| 145:0>68:0:iron_ore | 11550 |
| 230:1>145:0:machinery | 9127 |

## Čistě obchodní hra bez zbraní (střety se řeší únikem, úplatkem, vyhnutím)

Boti nemají zbraně a střetům se vyhýbají (vyhnout se > zaplatit > úplatek > útěk > vyjednávání > boj). Tabulka ukazuje, kolik střetů potkají a co je stojí.

| Strategie | Střety/100 dní | Boje/100 dní | Úplatky (kr/100 dní) | Zničení lodi | Příjem/den (medián) |
|---|---:|---:|---:|---:|---:|
| trader | 3.6 | 1.4 | 729 | 4 | 110 |
| hauler | 4.3 | 0.8 | 1243 | 1 | 46 |
| miner | 4.4 | 1.5 | 1262 | 1 | 190 |
| explorer | 3.6 | 1.2 | 218 | 1 | 50 |
| oracle | 6.3 | 2.2 | 3338 | 1 | 322 |
| loop | 2.6 | 0.6 | 37 | 0 | -40 |

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

Doba běhu simulace: 104 s.
