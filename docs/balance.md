# Balanční report

Vygenerováno příkazem `npm run balance` (10 semínek × 120 dní na strategii, galaxie 300 systémů, normální obtížnost, pojištění zapnuto).

| Strategie | Příjem/den (medián) | Příjem/den (průměr) | Čistá hodnota po 30 dnech | Dny do +3000 kr | První vylepšení (den) | Nehody/100 dnů | Zničení lodi | Zničení do dne 20 | Skoků |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| trader | 118 | 141 | 2881 | 40 (10/10) | 0 | 2.7 | 2 | 0/10 | 52 |
| hauler | 69 | 52 | 2787 | 34 (7/10) | 0 | 2.8 | 0 | 0/10 | 43 |
| miner | 170 | 151 | 2903 | 34 (10/10) | 0 | 3.0 | 1 | 0/10 | 50 |
| explorer | 97 | 69 | 206 | 61 (8/10) | 0 | 2.2 | 2 | 0/10 | 49 |
| oracle | 401 | 428 | 10446 | 14 (10/10) | 0 | 3.1 | 0 | 0/10 | 49 |
| loop | -41 | -21 | -1043 | 11 (1/10) | — | 2.8 | 0 | 0/10 | 21 |

## Test smyčky zisku (pevná trasa A↔B)

Bot opakuje jedinou nejlepší trasu tam a zpět (okruh = obě cesty). Zisk jednoho okruhu v čase (průměr přes semínka):

| Okruh | Průměrný zisk (kr) | Vzorků |
|---:|---:|---:|
| 1 | 870 | 10 |
| 2 | 422 | 10 |
| 3 | -38 | 10 |
| 4 | -151 | 10 |
| 5 | -226 | 10 |
| 6 | -351 | 10 |
| 7 | -263 | 9 |
| 8 | -270 | 7 |
| 9 | -228 | 6 |
| 10 | -183 | 6 |
| 11 | -138 | 6 |
| 12 | -111 | 6 |

Zisk raných okruhů ≈ 646 kr, pozdních ≈ 43 kr (poměr 0.07).

## Nejvýdělečnější trasy (součet přes všechny boty)

| Trasa (stanice>stanice:zboží) | Zisk |
|---|---:|
| 253:0>154:0:machinery | 29684 |
| 68:0>145:0:spare_parts | 21740 |
| 15:0>287:0:machinery | 20499 |
| 253:0>154:0:spare_parts | 18885 |
| 145:0>68:0:iron_ore | 14100 |
| 76:0>15:0:computers | 11990 |
| 272:1>272:0:machinery | 11407 |
| 3:0>113:2:machinery | 9940 |

## Čistě obchodní hra bez zbraní (střety se řeší únikem, úplatkem, vyhnutím)

Boti nemají zbraně a střetům se vyhýbají (vyhnout se > zaplatit > úplatek > útěk > vyjednávání > boj). Tabulka ukazuje, kolik střetů potkají a co je stojí.

| Strategie | Střety/100 dní | Boje/100 dní | Úplatky (kr/100 dní) | Zničení lodi | Příjem/den (medián) |
|---|---:|---:|---:|---:|---:|
| trader | 2.5 | 0.6 | 612 | 2 | 118 |
| hauler | 2.0 | 0.2 | 467 | 0 | 69 |
| miner | 2.4 | 0.6 | 714 | 1 | 170 |
| explorer | 2.8 | 0.7 | 165 | 2 | 97 |
| oracle | 2.9 | 0.9 | 1780 | 0 | 401 |
| loop | 1.8 | 0.7 | 46 | 0 | -41 |

## Boj: míra výher zbraní (AI proti AI)

Každá kombinace hraje 10 soubojů proti každé jiné na 5 trupech (wayfarer, kestrel, mule, swift, borer), obě lodě stejné třídy kvality C a stejné posádky, řídí je stejná AI. Řádek = výzbroj hráče, sloupec = protivník, hodnota = míra výher (remíza = 0,5).

| Výzbroj | energy | kinetic | missile | ion | drones | mixed | Průměr proti poli |
|---|---:|---:|---:|---:|---:|---:|---:|
| **energy** | 50 % | 42 % | 43 % | 52 % | 55 % | 33 % | **45 %** |
| **kinetic** | 64 % | 50 % | 58 % | 37 % | 65 % | 43 % | **53 %** |
| **missile** | 59 % | 54 % | 50 % | 75 % | 9 % | 53 % | **50 %** |
| **ion** | 30 % | 66 % | 28 % | 50 % | 64 % | 34 % | **44 %** |
| **drones** | 32 % | 40 % | 88 % | 42 % | 50 % | 36 % | **48 %** |
| **mixed** | 75 % | 54 % | 47 % | 57 % | 68 % | 50 % | **60 %** |

Nejsilnější výzbroj: **mixed** (60 %), nejslabší: **ion** (44 %). Cíl je průměr proti poli v rozmezí 40–60 %.

### Míra výher proti vyrovnanému protivníkovi (smíšená výzbroj stejného trupu)

| Trup | energy | kinetic | missile | ion | drones |
|---|---:|---:|---:|---:|---:|
| wayfarer | 0 % | 30 % | 90 % | 0 % | 0 % |
| kestrel | 20 % | 30 % | 50 % | 40 % | 50 % |
| mule | 20 % | 40 % | 5 % | 20 % | 20 % |
| swift | 60 % | 30 % | 85 % | 60 % | 20 % |
| borer | 65 % | 85 % | 35 % | 50 % | 90 % |

Nejsilnější kombinace proti smíšenému protivníkovi: wayfarer + missile (90 %), borer + drones (90 %), swift + missile (85 %). Nejslabší: wayfarer + energy (0 %), wayfarer + ion (0 %), wayfarer + drones (0 %).

## Boj: kořist proti nákladům

Skutečné střety (loď třídy mule se smíšenou výzbrojí, auto-boj, 8 soubojů na protivníka a úroveň). Kořist = kredity + hodnota zboží ze zničeného vraku. Náklady = účet za opravu trupu a modulů ve stanici + spotřebované rakety (26 kr/ks). Zničení lodi se počítá jako spoluúčast pojištění (25 % ceny trupu).

### Obtížnost rizika: nízké

Míra výher 36 %, zničení vlastní lodi 52 %, průměrná kořist na souboj 364 kr, průměrné náklady 2057 kr, čistý výsledek na souboj -1692 kr.

### Obtížnost rizika: normální

Míra výher 36 %, zničení vlastní lodi 56 %, průměrná kořist na souboj 377 kr, průměrné náklady 2161 kr, čistý výsledek na souboj -1784 kr.

| Protivník | Úroveň | Výhry | Kořist/souboj | Náklady/souboj | Čisté |
|---|---:|---:|---:|---:|---:|
| scrapper | 1 | 100 % | 855 | 0 | 855 |
| scrapper | 2 | 100 % | 870 | 0 | 870 |
| raider | 1 | 100 % | 1284 | 623 | 661 |
| raider | 3 | 0 % | 0 | 253 | -253 |
| corsair | 2 | 0 % | 0 | 160 | -160 |
| corsair | 3 | 0 % | 0 | 0 | 0 |
| warlord | 3 | 0 % | 0 | 498 | -498 |
| hunter | 1 | 100 % | 1140 | 0 | 1140 |
| hunter | 3 | 0 % | 0 | 0 | 0 |
| tracker | 2 | 0 % | 0 | 0 | 0 |
| tracker | 3 | 0 % | 0 | 0 | 0 |

### Obtížnost rizika: vysoké

Míra výher 36 %, zničení vlastní lodi 56 %, průměrná kořist na souboj 394 kr, průměrné náklady 2160 kr, čistý výsledek na souboj -1766 kr.

### Míra výher podle výzbroje a obtížnosti (proti střetům)

| Výzbroj | nízké riziko | normální | vysoké |
|---|---:|---:|---:|
| energy | 36 % | 34 % | 36 % |
| kinetic | 36 % | 36 % | 36 % |
| missile | 48 % | 41 % | 41 % |
| ion | 32 % | 32 % | 27 % |
| drones | 36 % | 36 % | 36 % |
| mixed | 36 % | 36 % | 36 % |

Doba běhu simulace: 92 s.
