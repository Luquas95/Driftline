# Changelog

Formát vychází z [Keep a Changelog](https://keepachangelog.com/cs/1.1.0/), verze podle [SemVer](https://semver.org/lang/cs/).

## [0.3.0] – živější svět a nový začátek

### Přidáno
- **Nový začátek hry:** kapitál podle obtížnosti (60 000 / 40 000 / 25 000 kr), začátek v doku bez lodi a obrazovka *Loděnice: tvoje první loď* s nabídkou od nejlevnější po nejdražší, kartami s náhledem, cenou, rolí a hodnotami, varováním o zbylých penězích a pojmenováním lodi. **14 trupů** (od ojetého raketoplánu za 4 200 kr po expediční loď za 110 000 kr), ojeté kusy s opotřebenými moduly. Tutoriál začíná první úpravou lodi.
- **Scéna systému:** skutečná loď hráče z generátoru lodí s výtryskem, lety po křivce s rozjezdem a brzděním, přistání a odlet, vektorové stanice na orbitě, 2–6 lodí provozu, **zoom (kolečko, pinch, tlačítka, klávesy) a posun s setrvačností**, dvojklik na detail tělesa, paměť kamery, vyšší detail planet při přiblížení.
- **Animace:** skok na mapě (nabití, rozmazaná stopa, záblesk), příjezd z hyperprostoru, sken, těžba, sonda, potvrzení nákupu a prodeje s odpočtem kreditů a letícími ikonami, přechody obrazovek, probliknutí změněných hodnot, paralaxa pozadí, zvuky. Nastavení animací *plné / omezené / vypnuté*, měřič FPS (`?fps=1`).
- Rychlé tlačítko **Přistát** v zobrazení systému.

### Opraveno
- Planety se pohybují podle třetího Keplerova zákona (vnitřní rychle, vnější pomalu), issue #4.
- Mapa jde po zoomu posouvat i dvěma prsty, po pinchi nepřeskočí (issue #3).
- Nákup ukáže viditelné potvrzení (issue #2); přistání je vidět a jde z obrazovky systému jedním tlačítkem (issue #6); lety a skoky mají animaci přiměřené délky (issue #5).

### Změněno
- `SAVE_VERSION` 3 (`noShip`, `captain`); uložené hry se migrují beze změny hry. Čtyři nové testovací háčky pro E2E (`setAnim`, `sys`, `map`).

## [0.2.0] – v2: boj a posádka

### Přidáno
- **Posádka:** 6 originálních ras s vlastnostmi a SVG portréty ze semínka, 6 rolí, dovednosti rostoucí používáním, zdraví, únava a morálka, najímání podle oblasti a reputace, denní mzdy a zásoby, odchod a vzpoura při nízké morálce, ubikace jako měkký limit, 6 důstojníků se schopností a příběhovou událostí.
- **Boj** v reálném čase s pauzou: interiér lodi z rozložení slotů, živé rozdělení energie, 6 druhů zbraní (energetické, kinetické, rakety s municí v nákladu, iontové, dronové hangáry, teleportér), vrstvené štíty, přehřívání, požáry se šířením, průrazy a kyslík, posádka hasí, opravuje, léčí a bojuje při abordáži, útěk za palivo.
- **Protivníci:** piráti, lovci odměn, celní hlídky, vraky s obranou a fauna; 3 úrovně hrozby, osobnosti AI (opatrný, agresivní, chamtivý s požadavkem na náklad), auto-boj z téže simulace.
- Střety po skoku, hrozba na mapě (systém i trasa), dialog (bojovat, utéct, zaplatit, vyjednávat, vyhnout se), kořist, rozebrání vraku, reputace.
- Služba *Rakety* ve stanici, nastavení boje (auto-boj, chvění, pauza při výběru).
- Události s podmínkami (role, rasa, dovednost, důstojník) a výsledky (zranění, zkušenost, morálka, odchod, nový člen, spuštění boje); 15 nových událostí.
- Vizuál boje: místnosti, štíty jako bubliny, projektily s glow, výbuchy, kouř a jiskry, chvění; procedurální zvuk.
- Balanční simulátor rozšířen o souboje AI proti AI, kořist proti nákladům a obchodní hru bez boje.

### Změněno
- `SAVE_VERSION` 2. Uložené hry z v1 se při načtení migrují (výchozí posádka podle trupu, žádné zbraně).
- Zásoby na den se počítají z reálné posádky, zničení lodi se týká i posádky.

## [1.0.0] – v1: loď, náklad, obchod, průzkum

### Přidáno
- Procedurální galaxie ze semínka (300 systémů, spirální ramena, hyperprostorové trasy, oblasti jádro až okraj, mlha neprozkoumaného prostoru).
- Loď: 6 trupů, 19 druhů modulů ve velikostech S/M/L a třídách kvality E–A, energetická bilance, sousednost slotů, opotřebení a opravy, náhled změn v loděnici.
- Mřížka nákladu (kontejnery 1×1, 2×1, 2×2, otáčení, tažení, automatické uspořádání), typy zboží (chlazené, nebezpečné, nelegální, zkazitelné, citlivé), přetížení.
- Živá ekonomika: 32 druhů zboží, výrobní řetězce, 7 typů stanic, skluz cen, události na trzích, stárnutí informací, clo a černý trh s celní kontrolou.
- Zakázky (6 druhů), zálohy, pokuty, bonus za společný cíl, 3 příběhové řetězce.
- Průzkum a těžba: skenery, sondy, odstupňované riziko, klesající výnos, rafinerie, anomálie a vraky, odměny za první objev.
- 50 datově řízených textových událostí s podmínkami a volbami.
- Pojištění a trvalá smrt, nouzový odtah, volby obtížnosti, semínko galaxie.
- Rendering v PixiJS: shadery planet (7 typů), hvězdy podle spektrální třídy, mlhoviny, hvězdné pole, generované lodě.
- UI česky (i18n slovník), dotyk/myš/klávesnice, rozložení pro mobil, tablet i PC, tutoriál, procedurální zvuk.
- PWA: instalace a plný offline provoz; ukládání do IndexedDB, export a import.
- Testy: Vitest (jádro), Playwright (E2E, vizuální snapshoty), balanční simulátor s boty.
