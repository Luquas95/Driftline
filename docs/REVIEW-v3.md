# Revize v3 (koncová hra, verze 1.0.0)

Tři nezávislé revize (podagenti, každý četl kód a spouštěl skripty): **A. design, tempo, příběh a dosažitelnost konců**, **B. determinismus, výkon a migrace**, **C. UX**. Níže jsou nálezy a co se s nimi stalo. HIGH a MEDIUM jsou opravené, u LOW je uvedeno, co zůstává.

## A. Design, tempo, příběh

| Priorita | Nález | Stav |
|---|---|---|
| HIGH | Konec „nadvláda“ byl prakticky nedosažitelný (350 000 kr, i bot s +600 kr/den měl v době rozhodnutí desetkrát méně) | **Opraveno:** práh 150 000 kr (`content/story.ts`, bot, test, DESIGN) |
| HIGH | Podmínky konců nebyly nikde vidět; konce na základně se spouštěly jen příletem, ne přistáním | **Opraveno:** Deník → Příběh ukáže od stádia 5 odškrtávací seznam podmínek každého konce (`EndingGoals`), konce vědy a exodu se nabídnou při přistání i příletu (`trigger: 'both'`) |
| MEDIUM | Nadvláda zastavovala Šeď stejně jako věda, texty říkaly opak | **Opraveno:** nadvláda nastaví jen maximální zpomalení, Šeď roste dál pomalu (`endings.ts`, `threat.ts`) |
| MEDIUM | Budova Kotva nic nedělala, popis slibuje zpomalení | **Opraveno:** každá úroveň zpomalí Šeď o 4 % (`spreadSpeed`) |
| MEDIUM | Tlak mizí kolem dne 250 (součet zpomalení přesahuje strop), skutečné časy neodpovídají dokumentaci | **Opraveno:** artefakty dávají 0,02 místo 0,04, rychlost Šedi přeladěna (`T.threat.rate`), DESIGN a balanc uvádí změřené časy |
| MEDIUM | Skrytá brána `st_lumen` (reputace Lumen ≥ 5 od nuly), stádium 2 se zdrží | **Opraveno:** práh ≥ 0 |
| LOW | Exodus: objednávka archy chce 809 jednotek materiálu, sklad úrovně 1 pojme jen 600 | Zůstává: chyba `err.baseMaterials` se ukáže při objednávce, nabídka teď u budov ukazuje stav skladu |
| LOW | Úspěch `techs_all` chtěl 24 z 27 technologií | **Opraveno:** všechny technologie |
| LOW | Rozhodnutí jsou převážně kosmetická, překlep „Vyvrávíš“ | Překlep opraven, vliv rozhodnutí na konce je záměr pro další verzi |
| LOW | `docs/balance.md` bez koncové sekce | **Opraveno:** doplněna (rychlost Šedi, boti, pasivní příjem) |

## B. Determinismus, výkon, migrace

Ověřeno bez nálezu: žádné `Math.random`, `Date.now` ani DOM v jádru; čtecí funkce (`analyze`, plánovače, `check*`, `quote*`) nemění stav ani RNG (stejný stav po různém počtu volání, 5 strategií, 200 až 480 dní); `transferGoods` odmítá 0, záporné, NaN a řetězce; druhý konec ve volné hře se ignoruje; starý save se načte. Výkon: celý `passTime` 4,8 ms/den (300 systémů) až 7,3 ms/den (400), z toho nové části v3 dohromady asi 0,5 ms; save 190 až 222 kB, `JSON.stringify` 2,3 ms.

| Priorita | Nález | Stav |
|---|---|---|
| HIGH | Odtah a respawn mohly vysadit hráče v pohlceném systému (nic tam nefunguje, 40 odtahů za sebou nikam nevede) | **Opraveno:** `isDeadSystem`, odtah, nejbližší stanice a respawn přeskočí pohlcené systémy; odtah dá alespoň čtvrtinu nádrže |
| MEDIUM | Poškozená `state.base` (chybějící pole, neznámé budovy, systém mimo galaxii) shodí denní tik | **Opraveno:** `repairBase` v `save.ts` doplní nebo zahodí neplatné části, případně celou základnu |
| MEDIUM | `lastEconDay` se nevaliduje (smyčka dnů se mohla točit minuty, nebo se svět zastavil) | **Opraveno:** ořez na posledních 400 dní |
| MEDIUM | `threat.grip` s klíči „abc“, „-1“, „1.5“ shodí tik | **Opraveno:** jen celá čísla v rozsahu galaxie |
| LOW | Neplatná obtížnost (`risk`) způsobí NaN v Šedi | **Opraveno:** záloha `normal` |
| LOW | Neznámé `ending.id` shodí souhrn konce; neznámý majitel území | **Opraveno** (filtrace) |
| LOW | `transferGoods` s 0,5 vrací zavádějící chybu | **Opraveno:** `err.badAmount` |
| LOW | Globální čítač `cargoUid` je stav modulu (jiná `uid` ve dvou hrách téhož procesu, JSON jinak stejný) | Zůstává, dosavadní chování z v1 |
| LOW | `refreshRecruits` se volá z renderu (obsah nabídky závisí na otevření obrazovky) | Zůstává, dosavadní chování z v2 |
| LOW | Základna v pohlceném systému dál vyrábí a stojí údržbu; migrace 3→4 bere ohniska od aktuální polohy | Záměr (základna přežívá), zdokumentováno |

Pokrytí testy: `tests/saveRepair.test.ts` (poškozená základna, klíče `grip`, hodiny, obtížnost, konec, odtah, zlomek množství).

## C. UX

| Priorita | Nález | Stav |
|---|---|---|
| HIGH | Přepnutí výzkumu tiše zahodilo rozpracovaný postup | **Opraveno:** investované body se vrátí do zásoby (`startResearch`, test) |
| HIGH | Založení základny je nezjistitelné a nesrozumitelné (chybí čísla, odkud materiál) | **Opraveno:** kontrolní seznam s ✓/✗ (kredity, stavební materiál, stroje), nápověda o průmyslových stanicích, zmínka v nápovědě hry |
| MEDIUM | Mobilní navigace: 10 tlačítek s useknutými popisky, duplicitní ikony | **Opraveno:** pod 480 px jen ikony s `aria-label`, nové ikony pro frakce a základnu |
| MEDIUM | Záložky základny oříznuté na mobilu | **Opraveno:** záložky se zalamují |
| MEDIUM | Akce mimo systém základny jsou zakázané bez vysvětlení | **Opraveno:** upozornění nad všemi záložkami |
| MEDIUM | Chybí zpětná vazba u výběru pokladny a převodu zboží | **Opraveno:** potvrzení toastem |
| MEDIUM | Čip hrozby: vysvětlení jen v `title`, bez legendy filtrů | **Opraveno:** čip je tlačítko vedoucí do Deníku, `aria-label`, legenda u filtrů Frakce a Šeď |
| MEDIUM | Obrazovka konce: tlačítka na konci dlouhého obsahu, bez `aria-labelledby`, zkratky fungují pod ní | **Opraveno:** lepivá patička s tlačítky, `aria-labelledby`, zkratky zablokované |
| MEDIUM | Chybí množné číslo, materiály budov bez stavu skladu | **Opraveno** |
| LOW | Tlačítko „Nastavit trasu“ aktivní při neplatném plánu; přejmenování jen při opuštění pole; chybí upozornění „bez laboratoře“ | **Opraveno** |
| LOW | `aria-pressed` u rozkazů a filtrů, popisky šipek ve skladu, roving tabindex záložek, dotykové cíle polí | Zůstává (příští úprava přístupnosti) |
