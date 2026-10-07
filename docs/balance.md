# Balanční report

Vygenerováno příkazem `npm run balance` (10 semínek × 120 dní na strategii, galaxie 300 systémů, normální obtížnost, pojištění zapnuto).

| Strategie | Příjem/den (medián) | Příjem/den (průměr) | Čistá hodnota po 30 dnech | Dny do +3000 kr | První vylepšení (den) | Nehody/100 dnů | Zničení lodi | Zničení do dne 20 | Skoků |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| trader | 100 | 75 | 2553 | 34 (7/10) | 0 | 2.6 | 15 | 1/10 | 52 |
| hauler | 67 | 39 | 2367 | 31 (5/10) | 0 | 2.2 | 3 | 0/10 | 40 |
| miner | 84 | 76 | 2786 | 34 (9/10) | 0 | 3.1 | 7 | 1/10 | 51 |
| explorer | 7 | 27 | -309 | 38 (5/10) | 0 | 2.3 | 10 | 1/10 | 45 |
| oracle | 175 | 181 | 9822 | 13 (9/10) | 0 | 2.7 | 11 | 1/10 | 45 |
| loop | -41 | -39 | -2227 | 11 (1/10) | — | 2.1 | 5 | 0/10 | 20 |

## Test smyčky zisku (pevná trasa A↔B)

Bot opakuje jedinou nejlepší trasu tam a zpět (okruh = obě cesty). Zisk jednoho okruhu v čase (průměr přes semínka):

| Okruh | Průměrný zisk (kr) | Vzorků |
|---:|---:|---:|
| 1 | 870 | 10 |
| 2 | 194 | 10 |
| 3 | -447 | 10 |
| 4 | -337 | 10 |
| 5 | -345 | 10 |
| 6 | -386 | 9 |
| 7 | -289 | 8 |
| 8 | -270 | 7 |
| 9 | -228 | 6 |
| 10 | -183 | 6 |
| 11 | -138 | 6 |
| 12 | -111 | 6 |

Zisk raných okruhů ≈ 532 kr, pozdních ≈ -143 kr (poměr -0.27).

## Nejvýdělečnější trasy (součet přes všechny boty)

| Trasa (stanice>stanice:zboží) | Zisk |
|---|---:|
| 253:0>154:0:machinery | 20624 |
| 145:0>68:0:iron_ore | 13063 |
| 272:1>272:0:machinery | 12983 |
| 253:0>154:0:spare_parts | 10421 |
| 3:0>113:2:machinery | 9940 |
| 83:0>83:2:machinery | 9935 |
| 185:1>38:0:spare_parts | 9909 |
| 279:1>279:0:machinery | 9612 |

## Čistě obchodní hra bez zbraní (střety se řeší únikem, úplatkem, vyhnutím)

Boti nemají zbraně a střetům se vyhýbají (vyhnout se > zaplatit > úplatek > útěk > vyjednávání > boj). Tabulka ukazuje, kolik střetů potkají a co je stojí.

| Strategie | Střety/100 dní | Boje/100 dní | Úplatky (kr/100 dní) | Zničení lodi | Příjem/den (medián) |
|---|---:|---:|---:|---:|---:|
| trader | 2.1 | 1.0 | 600 | 15 | 100 |
| hauler | 1.8 | 0.2 | 381 | 3 | 67 |
| miner | 2.4 | 0.7 | 604 | 7 | 84 |
| explorer | 2.3 | 0.9 | 150 | 10 | 7 |
| oracle | 2.8 | 1.0 | 1195 | 11 | 175 |
| loop | 1.9 | 1.0 | 69 | 5 | -41 |

## Boj: míra výher zbraní (AI proti AI)

Každá kombinace hraje 10 soubojů proti každé jiné na 5 trupech (wayfarer, kestrel, mule, swift, borer), obě lodě stejné třídy kvality C a stejné posádky, řídí je stejná AI. Řádek = výzbroj hráče, sloupec = protivník, hodnota = míra výher (remíza = 0,5).

| Výzbroj | energy | kinetic | missile | ion | drones | mixed | Průměr proti poli |
|---|---:|---:|---:|---:|---:|---:|---:|
| **energy** | 50 % | 42 % | 45 % | 53 % | 55 % | 30 % | **45 %** |
| **kinetic** | 64 % | 50 % | 58 % | 37 % | 66 % | 46 % | **54 %** |
| **missile** | 57 % | 50 % | 50 % | 74 % | 4 % | 48 % | **47 %** |
| **ion** | 26 % | 67 % | 32 % | 50 % | 66 % | 36 % | **45 %** |
| **drones** | 32 % | 40 % | 94 % | 40 % | 50 % | 36 % | **48 %** |
| **mixed** | 73 % | 54 % | 56 % | 55 % | 65 % | 50 % | **61 %** |

Nejsilnější výzbroj: **mixed** (61 %), nejslabší: **energy** (45 %). Cíl je průměr proti poli v rozmezí 40–60 %.

### Míra výher proti vyrovnanému protivníkovi (smíšená výzbroj stejného trupu)

| Trup | energy | kinetic | missile | ion | drones |
|---|---:|---:|---:|---:|---:|
| wayfarer | 0 % | 30 % | 90 % | 0 % | 0 % |
| kestrel | 20 % | 30 % | 50 % | 40 % | 50 % |
| mule | 20 % | 40 % | 0 % | 20 % | 20 % |
| swift | 60 % | 30 % | 80 % | 60 % | 20 % |
| borer | 50 % | 100 % | 20 % | 60 % | 90 % |

Nejsilnější kombinace proti smíšenému protivníkovi: borer + kinetic (100 %), wayfarer + missile (90 %), borer + drones (90 %). Nejslabší: wayfarer + ion (0 %), wayfarer + drones (0 %), mule + missile (0 %).

## Boj: kořist proti nákladům

Skutečné střety (loď třídy mule se smíšenou výzbrojí, auto-boj, 8 soubojů na protivníka a úroveň). Kořist = kredity + hodnota zboží ze zničeného vraku. Náklady = účet za opravu trupu a modulů ve stanici + spotřebované rakety (26 kr/ks). Zničení lodi se počítá jako spoluúčast pojištění (25 % ceny trupu).

### Obtížnost rizika: nízké

Míra výher 36 %, zničení vlastní lodi 52 %, průměrná kořist na souboj 364 kr, průměrné náklady 2057 kr, čistý výsledek na souboj -1692 kr.

### Obtížnost rizika: normální

Míra výher 36 %, zničení vlastní lodi 57 %, průměrná kořist na souboj 377 kr, průměrné náklady 2187 kr, čistý výsledek na souboj -1810 kr.

| Protivník | Úroveň | Výhry | Kořist/souboj | Náklady/souboj | Čisté |
|---|---:|---:|---:|---:|---:|
| scrapper | 1 | 100 % | 855 | 0 | 855 |
| scrapper | 2 | 100 % | 870 | 0 | 870 |
| raider | 1 | 100 % | 1284 | 623 | 661 |
| raider | 3 | 0 % | 0 | 253 | -253 |
| corsair | 2 | 0 % | 0 | 0 | 0 |
| corsair | 3 | 0 % | 0 | 0 | 0 |
| warlord | 3 | 0 % | 0 | 498 | -498 |
| hunter | 1 | 100 % | 1140 | 0 | 1140 |
| hunter | 3 | 0 % | 0 | 0 | 0 |
| tracker | 2 | 0 % | 0 | 0 | 0 |
| tracker | 3 | 0 % | 0 | 0 | 0 |

### Obtížnost rizika: vysoké

Míra výher 36 %, zničení vlastní lodi 57 %, průměrná kořist na souboj 394 kr, průměrné náklady 2185 kr, čistý výsledek na souboj -1791 kr.

### Míra výher podle výzbroje a obtížnosti (proti střetům)

| Výzbroj | nízké riziko | normální | vysoké |
|---|---:|---:|---:|
| energy | 36 % | 36 % | 36 % |
| kinetic | 36 % | 36 % | 36 % |
| missile | 48 % | 41 % | 41 % |
| ion | 36 % | 36 % | 34 % |
| drones | 36 % | 36 % | 36 % |
| mixed | 36 % | 36 % | 36 % |

Doba běhu simulace: 87 s.
