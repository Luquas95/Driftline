# Balanční report

Vygenerováno příkazem `npm run balance` (10 semínek × 120 dní na strategii, galaxie 300 systémů, normální obtížnost, pojištění zapnuto).

| Strategie | Příjem/den (medián) | Příjem/den (průměr) | Čistá hodnota po 30 dnech | Dny do +3000 kr | První vylepšení (den) | Nehody/100 dnů | Zničení lodi | Zničení do dne 20 | Skoků |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| trader | 161 | 180 | 2884 | 33 (9/10) | 0 | 3.3 | 0 | 0/10 | 54 |
| hauler | 109 | 82 | 3860 | 27 (8/10) | 0 | 3.2 | 0 | 0/10 | 45 |
| miner | 202 | 223 | 4954 | 21 (9/10) | 0 | 2.8 | 0 | 0/10 | 55 |
| explorer | 86 | 91 | 446 | 51 (10/10) | 0 | 3.1 | 0 | 0/10 | 44 |
| oracle | 510 | 470 | 8943 | 17 (10/10) | 0 | 2.1 | 0 | 0/10 | 49 |
| loop | -32 | -12 | -628 | 27 (2/10) | — | 2.1 | 0 | 0/10 | 21 |

## Test smyčky zisku (pevná trasa A↔B)

Bot opakuje jedinou nejlepší trasu tam a zpět (okruh = obě cesty). Zisk jednoho okruhu v čase (průměr přes semínka):

| Okruh | Průměrný zisk (kr) | Vzorků |
|---:|---:|---:|
| 1 | 884 | 10 |
| 2 | 585 | 10 |
| 3 | 207 | 10 |
| 4 | -139 | 10 |
| 5 | -236 | 10 |
| 6 | -442 | 10 |
| 7 | -302 | 9 |
| 8 | -269 | 7 |
| 9 | -223 | 6 |
| 10 | -174 | 6 |
| 11 | -104 | 6 |
| 12 | -81 | 6 |

Zisk raných okruhů ≈ 734 kr, pozdních ≈ -23 kr (poměr -0.03).

## Nejvýdělečnější trasy (součet přes všechny boty)

| Trasa (stanice>stanice:zboží) | Zisk |
|---|---:|
| 253:0>154:0:machinery | 27410 |
| 68:0>145:0:spare_parts | 26001 |
| 253:0>154:0:spare_parts | 21928 |
| 145:0>68:0:iron_ore | 19337 |
| 114:2>114:1:spare_parts | 17630 |
| 68:0>145:0:machinery | 13411 |
| 47:0>286:0:computers | 12323 |
| 40:0>253:0:computers | 11530 |

Doba běhu simulace: 39 s.
