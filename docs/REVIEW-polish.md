# Revize v3 (oživení a nový start)

Dvě nezávislé revize větve: (A) vizuál a UX, (B) výkon, determinismus a migrace. Níže jsou nálezy a co se s nimi stalo. HIGH a MEDIUM jsou opravené, pokud není uvedeno jinak.

## A. Vizuál a UX

| Závažnost | Nález | Stav |
|---|---|---|
| HIGH | Bílý záblesk po příletu ignoroval sníženou animaci (fotosenzitivita). | Opraveno: záblesk jen při `full`, jinak slabý (alfa 0,1) bez pulzu. |
| HIGH | Mobil, výběr lodi: detail s tlačítkem Koupit je pod seznamem a po výběru není vidět. | Opraveno: po výběru karty se na úzké obrazovce posune na detail. |
| HIGH | Miniatury lodí v referenčním snímku prázdné (generují se postupně). | Opraveno: snímky i skript čekají na všechny miniatury. |
| MEDIUM | Přistávací let v systému nešel přeskočit klepnutím. | Opraveno. |
| MEDIUM | Skok na mapě nešel přeskočit dotykem. | Opraveno: klepnutí na mapu přeskočí skok. |
| MEDIUM | Zoom tlačítka na mobilu překrývala nápovědu. | Opraveno: posunuta níže. |
| MEDIUM | Cena v kartě se lámala na dva řádky. | Opraveno (`nowrap`). |
| MEDIUM | Spodní lišta přistání na mobilu schovaná pod panelem. | Neověřeno jako chyba: na snímku z 390×844 leží lišta pod panelem a je celá vidět (panel končí 64 px nad spodkem), beze změny. |
| LOW | Dotykové cíle `.btn.small` pod 44 px. | Opraveno pro `pointer: coarse`. |
| LOW | Mrtvý kód v `FirstShipScreen`. | Odstraněn. |
| LOW | Nesoulad CSS `data-motion` a nastavení `animations`. | Ponecháno, popsáno v nastavení. |
| LOW | Hráčova loď u stanice při zoomu 1 je malá. | Ponecháno (ikona + stopa). |

## B. Výkon, determinismus, migrace

Jádro (`src/core`, `src/content`) zůstává čisté (žádné `Math.random`, `Date.now`, DOM). Animace mění jen zobrazovací stav; NPC provoz je čistá funkce času a semínka. Nenalezeno nic, co by ztratilo data nebo rozbilo uložené hry (HIGH: žádné).

| Závažnost | Nález | Stav |
|---|---|---|
| MEDIUM | `passTime` při `noShip` padal na `TypeError` (placeholder loď). | Opraveno: čas při `noShip` neplyne; test. |
| MEDIUM | `hullThumb` navždy cachoval `null` a neuvolňoval kořen při chybě. | Opraveno (`finally`, `null` se z cache maže). |
| MEDIUM | `sceneRef` mapy zůstával ukazovat na zničenou scénu. | Opraveno: nulování při odchodu z obrazovky. |
| MEDIUM | Hashování řetězců v každém snímku (záblesk příletu). | Opraveno: předpočítáno. U provozu NPC (2–6 lodí) ponecháno, dopad je zanedbatelný. |
| LOW | Chyběl test migrace v2 → v3. | Přidán (`tests/migration.test.ts`). |
| LOW | Lint padal na skriptu snímků. | Opraveno. |
| LOW | `buyFirstShip` neodmítá `dead`; boti ignorují výsledek koupě. | Ponecháno (nedosažitelné stavy). |
