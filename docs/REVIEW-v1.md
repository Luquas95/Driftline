# Revize v1

Před dokončením proběhly tři nezávislé revize (každou provedl samostatný agent bez znalosti ostatních). Všechny nálezy **HIGH** a **MEDIUM** jsou opraveny, pokud není uvedeno jinak. Zbytek je zapsán jako známé nedostatky.

## 1. Herní design a vyváženost

| Závažnost | Nález | Stav |
|---|---|---|
| HIGH | Laserová těžba krystalů a vzácné rudy vydělávala 1000–1600 kr/den, víc než cokoli jiného | Opraveno: výnos laseru a sběrače ×0,48, násobky intenzity 1/1,6/2,4, silnější vyčerpání (0,7^n) a pomalejší obnova (25 dní) |
| HIGH | Výměna trupu zahodila nové jádrové moduly a nechala malé staré | Opraveno: ponechá se větší nebo kvalitnější modul, zbylé jdou do skladu |
| HIGH | Žádné výdaje a cíl v pozdní hře (statisíce kreditů ležely ladem) | Částečně: palivo 8 kr, pojistné ×2,1; **cíl hry zůstává otevřený a patří do v3** (základna, konce) |
| MEDIUM | Smrt a pojištění bez následků | Opraveno: spoluúčast 25 %, při zničení platí pokuty za aktivní zakázky |
| MEDIUM | Zakázky na dodávku surovin příliš výhodné | Opraveno: násobek 1,1–1,3 a max. 4 buňky |
| MEDIUM | Moduly nákladu porážely trupy | Opraveno částečně: nákladový modul −25 % výnosu, +55 % ceny. Poštolka a Šipka mají stále slabé specializace (otevřené pro v2) |
| MEDIUM | Rozebírání modulů vracelo ~92 % ceny | Opraveno: ~46 % |
| MEDIUM | Černý trh záporný zisk | Otevřené: ladění cen nelegálního zboží, ponecháno pro v2 |
| LOW | Příběhové řetězce se po selhání ztratí | Opraveno: příznak se při smrti maže |

Žádná nekonečná smyčka zisku nenalezena (viz test smyčky v `docs/balance.md`).

## 2. Kvalita kódu, determinismus, ukládání

| Závažnost | Nález | Stav |
|---|---|---|
| HIGH | Dva ze tří příběhových řetězců nešlo dokončit | Opraveno + test projde všechny řetězce |
| HIGH | Neznámá událost v uložené hře zablokuje hru | Opraveno (`repair` po načtení) |
| HIGH | Pole zásob nesedí po přidání zboží | Opraveno: doplnění/oříznutí; **zboží se smí jen přidávat na konec seznamu** |
| HIGH | Mělká validace uložených her (pády, zamrznutí) | Opraveno: hloubková validace typů, rozsahů, ID, velikostí |
| HIGH | `NaN`/`Infinity` v akcích poškodí kredity | Opraveno |
| MEDIUM | Prodej/vypnutí modulu poruší mřížku nákladu a cestující | Opraveno (`refit`) + test |
| MEDIUM | Při výměně trupu zmizí sondy, špatná hmotnost v náhledu | Opraveno |
| MEDIUM | Smrt uvnitř `passTime` pokračuje v akci | Opraveno pro skok, přistání a pohyb mezi tělesy |
| MEDIUM | Zálohu zakázky lze zadržet, přijetí po termínu | Opraveno částečně (kontrola termínu a přistání); zálohu při chudobě stále nelze vymoci |
| MEDIUM | `nearbyCache` podle semínka bez velikosti | Opraveno |
| MEDIUM | Události typu „těžba“ se nikdy nespustí | Opraveno |
| MEDIUM | Lint a časové limity testů v CI | Opraveno |
| MEDIUM | Globální čítač ID nákladu, plovoucí čárka mezi enginy, pojistné závisí na dělení času | **Otevřené**, zdokumentováno: nemá vliv na hodnoty uložené hry, jen na ID |

## 3. UX na desktopu a mobilu

| Závažnost | Nález | Stav |
|---|---|---|
| HIGH | Plátno mapy a systému nepřijímalo myš ani dotyk (překrytí DOM vrstvami) | Opraveno + E2E s opravdovým kliknutím na hvězdu (desktop i mobil) |
| HIGH | Horní lišta na telefonu přetékala, chyběla nápověda | Opraveno |
| HIGH | První obchod naslepo, „Max“ utratí celou peněženku | Opraveno: start zná ceny sousedních stanic, „Max“ nechá 30 % |
| HIGH | Tabulky loděnice/obchodu na telefonu ztrácejí sloupce | Částečně: ukotvený první sloupec; karty místo tabulky zůstávají otevřené |
| MEDIUM | Řádky trhu bez klávesnice | Opraveno |
| MEDIUM | Zprávy překrývaly obsah, malá tlačítka na dotyku, nízký kontrast | Opraveno |
| MEDIUM | Tutoriál překrývá obsah, obchodní okno na celou obrazovku, focus trap v oknech, výkon na slabých tabletech | **Otevřené**: adaptivní rozlišení existuje, nastavení kvality grafiky patří do další verze |
