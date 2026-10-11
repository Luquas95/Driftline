/**
 * Story events of the main line, "Dlouhá cesta" (the Grey). Beats are triggered by `content/story.ts`, artifacts by
 * exploration. Alien words are written as ⟦concept⟧ and translated by `translateAlien` as the player learns the language.
 */
import type { Effect } from '../core/eventTypes';
import type { FactionId } from '../core/worldTypes';
import { ch, cr, discover, ev, fight, goods, hurt, mod, morale, out, sup, wear } from './eventKit';

const fRep = (f: FactionId | 'here', n: number): Effect => ({ t: 'fRep', f, n });
const lang = (n: number): Effect => ({ t: 'langLearn', n });
const research = (n: number): Effect => ({ t: 'research', n });
const slow = (n: number): Effect => ({ t: 'slow', n });
const stage = (to: number): Effect => ({ t: 'story', to });
const decide = (key: string): Effect => ({ t: 'decide', key });
const ending = (id: string): Effect => ({ t: 'ending', id });

/* ------------------------------- the beats ------------------------------- */

ev(
  'st_signal',
  'story',
  0,
  [],
  'Šum na vlně',
  'Spojař stanice tě zastaví u přepážky. Prý zachytili něco, co nepatří žádnému vysílači: ticho, které se v pravidelných vzorcích opakuje. Na obrazovce svítí zápis: ⟦light⟧ ⟦path⟧ ⟦void⟧ ⟦we⟧ ⟦wait⟧. „Nikdo tomu nerozumí,“ říká. „Ale vypadá to, že se to blíží.“',
  [
    ch('Nechat si záznam zkopírovat', [
      out(
        'Spojař ti záznam zkopíruje na datový krystal. Večer ho prohlížíš: opakující se tvary se pomalu skládají do slov, byť zatím jen několika.',
        [lang(4), research(12), stage(1), decide('copied')],
      ),
    ]),
    ch('Nabídnout záznam Bratrstvu Lumen', [
      out(
        'Bratrstvo záznam vykoupí a pošle tě dál s poděkováním. Stopa je teď v rukou lidí, kteří ji dokážou pochopit.',
        [cr(800), fRep('lumen', 8), lang(2), stage(1), decide('sharedSignal')],
      ),
    ]),
    ch('Nevšímat si toho', [
      out('Pokrčíš rameny. Takových záhad je mezi hvězdami dost. Jenže signál se ozývá znovu a znovu.', [
        stage(1),
        decide('ignoredSignal'),
      ]),
    ]),
  ],
);

ev(
  'st_pale',
  'story',
  0,
  [],
  'Vybledlá hvězda',
  'Hvězda tohoto systému je jiná, než ji popisují mapy. Barvy z ní zmizely a světlo je šedé, jako by ho někdo naředil. Na palubě ztichnete. Senzory hlásí ⟦silence⟧ na všech pásmech, ale není to prázdný šum: je to ticho, které ti na něco odpovídá.',
  [
    ch('Změřit pole z odstupu', [
      out('Změříš a zaznamenáš. Hodnoty jsou nepříjemně hladké, jako by svět přestal mít hrany.', [
        research(18),
        lang(1),
        stage(2),
      ]),
    ]),
    ch('Zkusit naladit komunikaci', [
      out(
        'Ozve se krátká sekvence slov. Rozumíš jí zatím jen napůl, ale zapíšeš ji.',
        [lang(2), stage(2), hurt(6)],
        3,
      ),
      out(
        'Komunikace zhasne. Zůstane po ní jen tlak v uších a nepříjemný pocit, že tě někdo poslouchal.',
        [morale(-6), lang(1), stage(2)],
        2,
      ),
    ]),
    ch('Odletět ihned', [out('Změníš kurz. Bude to zřejmě jen náhoda, říkáš si.', [stage(2)])]),
  ],
);

ev(
  'st_lumen',
  'story',
  0,
  [],
  'Pozvání do Archivu',
  'Na přepážce na tebe čeká obálka s pečetí Bratrstva Lumen. Uvnitř je pozvání do jejich archivu: prý sbírají záznamy o „šedém jevu“ a tvé jméno už zaznělo. Starý archivář mluví tiše: „Dostali jsme se k pár stránkám. Rádi se o ně podělíme, podělíte-li se i vy.“',
  [
    ch('Sdílet všechna svá pozorování', [
      out(
        'Archivář listuje tvými poznámkami a po dlouhé chvíli přikývne. Vrátí ti stránky nových překladů a slibuje, že se ozve.',
        [research(60), lang(3), fRep('lumen', 6), stage(3), decide('sharedAll')],
      ),
    ]),
    ch('Prodat pozorování za kredity', [
      out('Bratrstvo je zdvořilé a vyplatí tě. Bez nadšení, ale vyplatí.', [
        cr(1500),
        research(20),
        lang(1),
        fRep('lumen', 2),
        stage(3),
        decide('soldData'),
      ]),
    ]),
    ch('Zdvořile odmítnout', [
      out('Archivář se uklání. „Až budete chtít.“', [fRep('lumen', -2), stage(3), decide('refusedLumen')]),
    ]),
  ],
);

ev(
  'st_dead',
  'story',
  0,
  [],
  'Mrtvá zóna',
  'Systém je tichý. Stanice svítí nouzovými světly, ale nikdo se neozve. Hvězda je šedá a nehybná, trasy jsou prázdné. Palubní počítač hlásí trvalé zpoždění všech přístrojů, jako by tu sama doba zpomalila. V rádiu slyšíš dlouhé jednotvárné hlasy: ⟦we⟧ ⟦wait⟧ ⟦home⟧ ⟦sleep⟧.',
  [
    ch('Naslouchat', [
      out(
        'Zůstaneš a posloucháš. Hlasy se nezlobí a nestraší, jen opakují, co se naučily. Pak se ti zatmí před očima a ztratíš pojem o čase.',
        [lang(3), research(25), morale(-8), hurt(8), stage(3), decide('listenedDead')],
      ),
    ]),
    ch('Prohledat opuštěné doky', [
      out(
        'V dokách najdeš nepoškozené zásoby. Mrtví je už nepotřebují.',
        [goods('spare_parts', 6), sup(10), stage(3)],
        4,
      ),
      out('Doky nejsou prázdné. Něco se pohne ve tmě.', [fight('grey_wisp', 2), stage(3)], 2),
    ]),
    ch('Zmizet', [out('Zmizíš. Ten pocit ale nezmizí.', [stage(3), morale(-3)])]),
  ],
);

ev(
  'st_directorate',
  'story',
  0,
  [],
  'Karanténní příkaz',
  'Důstojník Direktorátu ti podává tablet s oficiálním příkazem k uzavření systémů zasažených Šedí. Pokyny jsou stručné: žádný obchod s ohroženými oblastmi, žádní uprchlíci bez povolení. „Potřebujeme každou loď, která poslechne,“ říká.',
  [
    ch('Podepsat a podpořit karanténu', [
      out('Podepíšeš. Direktorát tě zapíše mezi spolehlivé. Uprchlíci z okraje ti to nezapomenou.', [
        cr(1500),
        fRep('directorate', 10),
        fRep('freeholds', -8),
        decide('quarantine'),
      ]),
    ]),
    ch('Odmítnout', [
      out('Důstojník vychladne. „Pak tedy jedeš na vlastní nebezpečí.“', [
        fRep('directorate', -6),
        fRep('freeholds', 4),
        decide('refusedQuarantine'),
      ]),
    ]),
    ch(
      'Vyjednat výjimku pro zdravotnické konvoje',
      [
        out('Po dlouhém jednání dostaneš kompromis: zdravotnické konvoje smějí projet.', [
          fRep('directorate', 3),
          fRep('lumen', 3),
          decide('medicalException'),
        ]),
      ],
      [{ t: 'fRep', f: 'directorate', min: 10 }],
    ),
  ],
);

ev(
  'st_consortium',
  'story',
  0,
  [],
  'Obchod s ústupem',
  'Zástupce Konsorcia nabízí smlouvu: za zlomek ceny vykoupí majetek lidí, kteří utíkají před Šedí, a ty bys vozil nákupy a bral si provizi. „Nikdo nic neztrácí,“ tvrdí. „Majetek by jinak pohltila tma.“',
  [
    ch('Přijmout smlouvu', [
      out('Vyděláš dobře. Za pár týdnů se na tebe uprchlíci budou dívat jinak.', [
        cr(4500),
        fRep('consortium', 10),
        fRep('freeholds', -8),
        decide('profit'),
      ]),
    ]),
    ch('Odmítnout', [
      out('Zástupce pokrčí rameny. „Obchod je obchod. Najdeme někoho jiného.“', [
        fRep('consortium', -3),
        fRep('freeholds', 4),
        fRep('lumen', 2),
        decide('refusedProfit'),
      ]),
    ]),
    ch('Nabídnout férovější ceny', [
      out(
        'Po delším smlouvání ustoupí: ceny budou férové a ty z toho máš malý podíl.',
        [cr(1500), fRep('consortium', 4), fRep('freeholds', 3), decide('fairDeal')],
        3,
      ),
      out('Zástupce se jen usměje: „Příště.“', [fRep('consortium', -1)], 2),
    ]),
  ],
);

ev(
  'st_freeholds',
  'story',
  0,
  [],
  'Lodě bez domova',
  'U doku stojí fronta rodin. Pod pláštěm drží děti a na zádech nesou vše, co se vešlo. Starší osady ti říká: „Nemáme nic než prosbu. Vezmeš nás někam, kde je ještě světlo?“',
  [
    ch('Slíbit pomoc', [
      out('Starší ti stiskne ruku. V příštích dnech se na nástěnkách začnou objevovat žádosti o evakuaci.', [
        fRep('freeholds', 8),
        morale(6),
        decide('pledgedHelp'),
      ]),
    ]),
    ch('Darovat zásoby', [
      out('Vyložíš část zásob. Není to řešení, ale na několik dní to pomůže.', [
        sup(-20),
        fRep('freeholds', 6),
        decide('gaveSupplies'),
      ]),
    ]),
    ch('Odejít', [
      out('Nechceš být zodpovědný za všechny. Jdeš dál, ale něco tě tlačí na dně žaludku.', [
        morale(-6),
        fRep('freeholds', -4),
        decide('turnedAway'),
      ]),
    ]),
  ],
);

ev(
  'st_corsairs',
  'story',
  0,
  [],
  'Pirátský pakt',
  'Kapitán klanu tě zve ke stolu. Kromě pachu kovu a rumu je v místnosti i strach: Šeď se blíží k jejich skrýším a klany nemají kam utéct. „Pomož nám a nepoznáš pirátskou dýku v zádech,“ říká. „Ber to jako pojistku.“',
  [
    ch(
      'Zaplatit za ochranu (3 000 kr)',
      [
        out('Poplatek zmizí v kapse a kapitán ti podá ruku. Na trasách tě klany nechají na pokoji.', [
          cr(-3000),
          fRep('corsairs', 15),
          fRep('directorate', -4),
          decide('pact'),
        ]),
      ],
      [{ t: 'creditsMin', n: 3000 }],
    ),
    ch('Nabídnout informace o Šedi', [
      out('Kapitán poslouchá. Jeho oči se rozšíří. „Takže tohle je to, čemu říkáte Šeď.“', [
        fRep('corsairs', 8),
        lang(1),
        decide('toldCorsairs'),
      ]),
    ]),
    ch('Odmítnout', [
      out('Kapitán vstane. „Dobrá.“ Jeho muži tě vyprovodí k dokům.', [
        fRep('corsairs', -3),
        decide('refusedPact'),
      ]),
    ]),
  ],
);

ev(
  'st_sentence',
  'story',
  0,
  [],
  'První věta',
  'Archivář Bratrstva ti podává list papíru. Poprvé se podařilo přeložit celou větu, kterou se Šeď ozývá znovu a znovu: ⟦we⟧ ⟦give⟧ ⟦you⟧ ⟦peace⟧. ⟦you⟧ ⟦wait⟧. ⟦we⟧ ⟦sleep⟧ ⟦together⟧. Česky: „Dáváme vám mír. Čekejte. Spíme společně.“ Podle archiváře to není výhrůžka. Je to ukolébavka, kterou nikdo nevypnul.',
  [
    ch('„Je to hrozba.“', [
      out('Archivář zavrtí hlavou, ale nevyvrací to. Důkaz žádný nemá, jen pocit.', [
        stage(4),
        decide('callThreat'),
      ]),
    ]),
    ch('„Je to prosba.“', [
      out('Archivář se na tebe dlouze dívá. „Možná. A pokud ano, měl by někdo odpovědět.“', [
        stage(4),
        lang(2),
        decide('callPlea'),
      ]),
    ]),
    ch('„Je to poslední zpráva někoho, kdo už tu není.“', [
      out('Archivář se tiše usměje. „To je přesně ta věta, kterou jsme se báli napsat.“', [
        stage(4),
        research(15),
        decide('callEcho'),
      ]),
    ]),
  ],
);

ev(
  'st_paths',
  'story',
  0,
  [],
  'Čtyři cesty',
  'Archivář před tebou rozloží mapu. Jsou na ní zakreslené čtyři cesty, kterými se podle Bratrstva dá Šeď zastavit nebo přežít. Pochopit její podstatu a postavit na základně Kotvu. Odpovědět jí a dohodnout se. Odejít Archou a celou flotilou. Nebo si podmanit hospodářství galaxie tak, aby bylo schopné odolat. „Žádná cesta není lehká,“ říká, „a žádná není zadarmo.“',
  [
    ch('Zapsat si podmínky všech čtyř cest', [
      out('Do deníku si zapíšeš podmínky: Kotva, Dohoda, Exodus, Správní rada. Teď víš, co chybí.', [
        stage(5),
        decide('knowPaths'),
      ]),
    ]),
  ],
);

/* ------------------------------- the endings ------------------------------- */

ev(
  'end_science',
  'story',
  0,
  [],
  'Kotva',
  'Kotva stojí na orbitě nad tvou základnou, hotová. Je tichá tak, jak je ticho před stisknutím tlačítka. Podle výpočtů přeruší vlákno, které Šeď spojuje s jejím zdrojem. Šeď přestane růst a pomalu se rozplyne. Zároveň ale nenávratně zmizí něco jiného: ⟦voice⟧, ⟦memory⟧, ⟦name⟧. Rozhodnutí je na tobě.',
  [
    ch('Zapnout Kotvu', [
      out(
        'Kotva se rozsvítí. Nejdřív se nic nestane. Pak se hvězdy na obloze o půl tónu zahřejí a ticho v rádiu se rozpadne na obyčejný šum.',
        [slow(0.5), ending('science')],
      ),
    ]),
    ch('Ještě ne', [out('Odložíš to. Zbývá čas, ale nepromarni ho.', [])]),
  ],
);

ev(
  'end_accord',
  'story',
  0,
  [],
  'Rozhovor',
  'Šeď je tu hustá. Stará věta, kterou už umíš číst, se rozeznívá na všech frekvencích: ⟦we⟧ ⟦give⟧ ⟦you⟧ ⟦peace⟧. Tentokrát máš co odpovědět. Protokol dohody je připravený a slova, která potřebuješ, znáš: ⟦we⟧ ⟦see⟧ ⟦you⟧. ⟦we⟧ ⟦give⟧ ⟦you⟧ ⟦memory⟧.',
  [
    ch('Odpovědět slibem', [
      out(
        'Odešleš slib: že si budete pamatovat. Ticho se na dlouhou chvíli zadrží. Pak se z něj ozve jediné slovo, které už znáš: ⟦enough⟧.',
        [slow(0.5), ending('accord')],
      ),
    ]),
    ch('Odpovědět silou', [
      out('Odpověď přijde okamžitě. Něco se zvedá z hloubky tmy a míří k tobě.', [fight('grey_herald', 3)]),
    ]),
    ch('Mlčet', [out('Mlčíš a necháváš ticho, ať si dá práci samo.', [])]),
  ],
);

ev(
  'end_exodus',
  'story',
  0,
  [],
  'Odlet',
  'Archa stojí v hangáru a okolo ní flotila, kterou jsi vybudoval. Na palubách čekají rodiny, zásoby, semena a data. Skokové pohony se nabíjejí. Za nimi leží temnota, kde nikdo nikdy nebyl. Tady za zády zůstane vše, co jsi znal. Je to útěk, nebo začátek?',
  [
    ch('Odletět', [
      out(
        'Flotila vyskočí v jediném záblesku. Na obrazovkách za zádí se galaxie zmenšuje na tlukot jediné hvězdy. Pak zhasne.',
        [ending('exodus')],
      ),
    ]),
    ch('Zůstat ještě chvíli', [out('Odložíš odlet. Zbývá čas, ale ne mnoho.', [])]),
  ],
);

ev(
  'end_dominion',
  'story',
  0,
  [],
  'Správní rada',
  'V jednací síni Konsorcia sedí pět lidí, kteří rozhodují, co se za co koupí. Ty jsi šestý. Nabídka je prostá: celé hospodářství galaxie pod jedním podpisem. Šeď nebude zastavena, ale její okraje se budou splácet postupně, jak se bude platit, a pravidla budou tvoje.',
  [
    ch('Převzít kontrolu nad hospodářstvím', [
      out(
        'Podepíšeš. Té noci zhasne polovina okrajových stanic a rozsvítí se všechna světla v jádru. Ceny rostou a klesají tak, jak je určíš.',
        [slow(0.3), ending('dominion')],
      ),
    ]),
    ch('Odmítnout', [out('Odmítneš a odejdeš. Za zády slyšíš, jak se kroutí dveře.', [])]),
  ],
);

/* ------------------------------- artifacts ------------------------------- */

ev(
  'artifact_mirror',
  'artifact',
  0,
  [],
  'Zrcadlo',
  'Na povrchu leží hladká plocha, která odráží nebe jinak, než by měla. V ní vidíš sebe, ale na pozadí hvězdy, které tu nejsou: ⟦mirror⟧ ⟦memory⟧.',
  [
    ch('Dotknout se', [
      out(
        'Plocha se rozvlní a v hlavě se ti ozve slovo. Pak je pryč, ale ve tvých poznámkách zůstalo.',
        [{ t: 'artifact' }, lang(3), discover(900)],
        3,
      ),
      out(
        'Plocha tě vtáhne dovnitř, jen na chvíli. Vyvrávíš zpět s krvácejícím nosem a novým slovem v hlavě.',
        [{ t: 'artifact' }, lang(2), hurt(10), discover(900)],
        2,
      ),
    ]),
    ch('Změřit z odstupu', [
      out('Přístroje změří, co se změřit dá. Zrcadlo s tebou nemluví, ale data jsou úplná.', [
        { t: 'artifact' },
        research(30),
        lang(1),
        discover(700),
      ]),
    ]),
  ],
);

ev(
  'artifact_thread',
  'artifact',
  0,
  [],
  'Struna',
  'Z balvanu vychází tenká nit, jemnější než vlas, a táhne se směrem do hlubin. Když ji senzory zachytí, rozezní se jako struna: ⟦thread⟧ ⟦string⟧ ⟦echo⟧.',
  [
    ch('Naladit senzory', [
      out('Senzory se přizpůsobí a struna ztichne. Je to něco jako souhlas.', [
        { t: 'artifact' },
        slow(0.03),
        lang(2),
        discover(800),
      ]),
    ]),
    ch('Odříznout kousek', [
      out(
        'Odřízneš kousek vlákna. Hmota je lehká, chladná a překvapivě pevná. Z vlákna se dá vyrobit modul.',
        [{ t: 'artifact' }, mod('B'), discover(600), wear(8)],
        3,
      ),
      out(
        'Struna zakvílí a přístroje se rozladí. Vlákno ti ale zůstane v ruce.',
        [{ t: 'artifact' }, wear(18), discover(600)],
        2,
      ),
    ]),
  ],
);

ev(
  'artifact_echo',
  'artifact',
  0,
  [],
  'Ozvěna',
  'Mezi balvany leží válec, který opakuje poslední zvuk, jaký slyšel. Přehrává ti slova, která jsi řekl na doku, jen o oktávu níž: ⟦echo⟧ ⟦voice⟧ ⟦we⟧.',
  [
    ch('Zaznamenat vše', [
      out('Zaznamenáš celou smyčku. Večer ji budeš číst jako knihu.', [
        { t: 'artifact' },
        lang(4),
        discover(750),
      ]),
    ]),
    ch('Odpovědět', [
      out(
        'Odpovíš a válec zazní jinak. Z ozvěny se stane rozhovor, byť krátký.',
        [{ t: 'artifact' }, lang(3), research(25), discover(750)],
        3,
      ),
      out(
        'Válec se rozezní a z tmy vyplave siluetka. Čeká tě boj.',
        [{ t: 'artifact' }, fight('grey_wisp', 2), lang(2)],
        2,
      ),
    ]),
  ],
);
