import type { Cond, Effect, EventChoice, EventDef, EventTrigger } from '../core/eventTypes';
import type { OfficerId, RaceId, Role, Skill } from './crew';
import type { GoodTag, ModuleKind, Quality, Region } from '../core/types';

/**
 * Event authoring: structure and Czech text are written together, then split into the data-driven
 * definition (EVENTS, referencing i18n keys) and the dictionary entries (EVENT_TEXTS_CS).
 */
export const EVENT_TEXTS_CS: Record<string, string> = {};

interface OutIn {
  text: string;
  fx: Effect[];
  w: number;
}
interface ChIn {
  text: string;
  req?: Cond[];
  outs: OutIn[];
}

const out = (text: string, fx: Effect[] = [], w = 1): OutIn => ({ text, fx, w });
const ch = (text: string, outs: OutIn[], req?: Cond[]): ChIn => ({ text, outs, req });

export const EVENTS: EventDef[] = [];

function ev(
  id: string,
  trigger: EventTrigger,
  weight: number,
  conditions: Cond[],
  title: string,
  text: string,
  choices: ChIn[],
): void {
  EVENT_TEXTS_CS[`ev.${id}.title`] = title;
  EVENT_TEXTS_CS[`ev.${id}.text`] = text;
  const cs: EventChoice[] = choices.map((c, ci) => {
    EVENT_TEXTS_CS[`ev.${id}.c${ci}`] = c.text;
    return {
      textKey: `ev.${id}.c${ci}`,
      requires: c.req,
      outcomes: c.outs.map((o, oi) => {
        EVENT_TEXTS_CS[`ev.${id}.c${ci}.o${oi}`] = o.text;
        return { weight: o.w, effects: o.fx, textKey: `ev.${id}.c${ci}.o${oi}` };
      }),
    };
  });
  EVENTS.push({
    id,
    trigger,
    weight,
    conditions,
    titleKey: `ev.${id}.title`,
    textKey: `ev.${id}.text`,
    choices: cs,
  });
}

const cr = (n: number): Effect => ({ t: 'credits', n });
const hull = (n: number): Effect => ({ t: 'hull', n });
const fuel = (n: number): Effect => ({ t: 'fuel', n });
const sup = (n: number): Effect => ({ t: 'supplies', n });
const days = (n: number): Effect => ({ t: 'days', n });
const wear = (n: number, kind?: ModuleKind): Effect => ({ t: 'wear', n, kind });
const goods = (goodId: string, qty: number): Effect => ({ t: 'goods', goodId, qty });
const rep = (n: number): Effect => ({ t: 'rep', n });
const reveal = (radius: number): Effect => ({ t: 'reveal', radius });
const discover = (value: number): Effect => ({ t: 'discover', value });
const flag = (key: string, value: number | string | boolean = true): Effect => ({ t: 'flag', key, value });
const lose = (frac: number): Effect => ({ t: 'loseCargo', frac });
const mod = (quality?: Quality, kind?: ModuleKind): Effect => ({ t: 'module', quality, kind });
const probes = (n: number): Effect => ({ t: 'probes', n });
const regionIn = (...r: Region[]): Cond => ({ t: 'region', in: r });
const hasMod = (kind: ModuleKind): Cond => ({ t: 'hasModule', kind });
const tag = (t: GoodTag): Cond => ({ t: 'cargoTag', tag: t });
const dangerMin = (n: number): Cond => ({ t: 'dangerMin', n });

/* ------------------------------- jump -------------------------------- */

ev(
  'micrometeors',
  'jump',
  10,
  [],
  'Mikrometeoritový roj',
  'Senzory hlásí hustý roj úlomků přímo na trase skoku.',
  [
    ch('Zpomalit a proplout opatrně', [
      out('Proplouváš pomalu a bez škrábnutí. Ztratil jsi jen chvíli.', [days(0.4)]),
    ]),
    ch('Proletět plnou rychlostí', [
      out('Úlomky zarachotí o trup, ale vyvázneš s drobnými škrábanci.', [hull(-5)], 5),
      out('Hlavní roj zasáhne trup. Alarmy kvílí.', [hull(-14), wear(6)], 3),
      out('Prolétneš čistě, jako by tam nic nebylo.', [], 2),
    ]),
  ],
);

ev(
  'solar_flare',
  'jump',
  7,
  [regionIn('core', 'inner')],
  'Erupce hvězdy',
  'Blízká hvězda vyvrhla koronální výron. Fronta záření se blíží.',
  [
    ch('Přepnout energii do štítů a vyčkat', [
      out('Vyčkáš za štíty. Dlouhé hodiny, ale bezpečné.', [days(0.6), sup(-2)]),
    ]),
    ch('Pokračovat ve skoku', [
      out('Elektronika zaškobrtne, ale vydrží.', [wear(5)], 5),
      out('Přetížený okruh vypálí část senzorů.', [wear(14, 'sensors'), hull(-4)], 3),
    ]),
    ch(
      'Využít záření k dobití zásobníků',
      [
        out('Pohlcovače zachytí část energie a doplní palivové články.', [fuel(4)], 4),
        out('Pohlcovače se přetíží.', [wear(10)], 2),
      ],
      [hasMod('shield')],
    ),
  ],
);

ev(
  'distress_call',
  'jump',
  9,
  [],
  'Tísňové volání',
  'Slabý signál SOS: malá loď bez paliva čeká v mezihvězdném prostoru.',
  [
    ch('Darovat palivo', [
      out('Posádka děkuje a vrátí ti to dvojnásobkem v kreditech.', [fuel(-6), cr(180), rep(1)], 5),
      out('Vděčně přijmou palivo. Víc nemají, jen slova díků.', [fuel(-6), rep(1)], 4),
    ]),
    ch('Ignorovat signál', [out('Letíš dál. Signál slábne za zádí.', [])]),
    ch(
      'Prověřit past (pirátský trik)',
      [
        out('Past! Z úkrytu vyletí piráti, ale tys byl připravený a unikneš.', [days(0.3), wear(4)], 3),
        out('Byl to opravdu nešťastník. Jeho dík je upřímný.', [rep(1), cr(60)], 5),
      ],
      [hasMod('sensors')],
    ),
  ],
);

ev(
  'pirate_toll',
  'jump',
  8,
  [regionIn('outer', 'rim', 'core'), { t: 'cargoValueMin', n: 800 }],
  'Pirátský výběrčí',
  'Obrněná fregata se přiblíží k tvé lodi a požaduje „mýtné“.',
  [
    ch('Zaplatit', [
      out('Pirát se uctivě ukloní a pustí tě dál. Peněženka je lehčí.', [{ t: 'creditsPct', pct: -0.06 }]),
    ]),
    ch('Zkusit uniknout', [
      out('Ostrým manévrem se vyvlékneš z jejich dosahu.', [fuel(-3)], 4),
      out('Salva zasáhne trup, než se ti podaří skočit.', [hull(-18), wear(8)], 4),
      out('Doženou tě a vezmou si část nákladu.', [lose(0.2), hull(-8)], 2),
    ]),
    ch('Vyjednávat', [
      out('Přesvědčíš je, že za to nestojíš. Odlétají pryč.', [], 5),
      out('Neuspěješ a stejně zaplatíš.', [{ t: 'creditsPct', pct: -0.04 }], 3),
    ]),
  ],
);

ev(
  'derelict_beacon',
  'jump',
  7,
  [],
  'Opuštěný maják',
  'Na hranici skokového koridoru bliká starý navigační maják. Jeho data ještě fungují.',
  [
    ch('Stáhnout navigační data', [
      out('Získáš mapu okolí: zdejší systémy jsou teď na tvé mapě.', [reveal(14)], 6),
      out('Maják byl nastražený na viry, přijdeš o chvíli času.', [days(0.5), wear(3)], 2),
    ]),
    ch('Sebrat součástky z majáku', [
      out('Z majáku vymontuješ několik funkčních dílů.', [goods('spare_parts', 4)], 5),
      out('Maják exploduje.', [hull(-9)], 2),
    ]),
    ch('Nechat být', [out('Neriskuješ. Maják zůstane svítit do tmy.', [])]),
  ],
);

ev(
  'nav_glitch',
  'jump',
  6,
  [],
  'Navigační závada',
  'Skokový počítač hlásí neslučitelné souřadnice. Cíl se zdá být vzdálenější, než by měl.',
  [
    ch('Přepočítat ručně', [
      out('Po hodině práce přepočítáš křivku. Trvá to déle, ale vyjde to.', [days(0.7)], 6),
      out('Přepočet se povede a ušetří palivo.', [fuel(2)], 2),
    ]),
    ch('Důvěřovat počítači', [
      out('Počítač měl pravdu. Čistě.', [], 4),
      out('Skok skončí na nesprávném místě a spálíš palivo navíc.', [fuel(-4), days(0.5)], 3),
    ]),
  ],
);

ev(
  'ghost_signal',
  'jump',
  4,
  [regionIn('outer', 'rim')],
  'Signál duchů',
  'Na všech pásmech zní zrnitý hlas, který opakuje souřadnice. Nikdo neodpovídá.',
  [
    ch('Zapsat souřadnice', [
      out('Souřadnice ukazují k nepoznané soustavě. Přidáš ji do mapy.', [reveal(18), rep(0)], 5),
      out('Žádný smysl. Jen šum.', [], 3),
    ]),
    ch('Vypnout rádio', [out('Ticho. Je ti lépe.', [])]),
  ],
);

ev('gravity_eddy', 'jump', 6, [], 'Gravitační vír', 'Mezi hvězdami tě zachytí slabý gravitační vír.', [
  ch('Využít ho jako prak', [
    out('Vír tě vymrští. Ušetříš čas i palivo.', [days(-0.4), fuel(3)], 4),
    out('Vír tě rozkývá a něco praskne.', [wear(9), hull(-5)], 3),
  ]),
  ch('Vyvázat se', [out('Vykroužíš pryč. Trvá to déle, než jsi čekal.', [days(0.4), fuel(-1)])]),
]);

ev(
  'trader_convoy',
  'jump',
  8,
  [],
  'Obchodní konvoj',
  'Na trase míjíš konvoj nákladních lodí. Kapitán tě osloví rádiem.',
  [
    ch('Vyměnit zprávy', [
      out('Prozradí ti, co se dělo na trzích, kudy proletěl.', [reveal(12)], 6),
      out('Mluví jen o počasí a cenách paliva.', [], 2),
    ]),
    ch('Koupit zásoby', [
      out('Prodají ti dávku zásob za dobrou cenu.', [sup(15), cr(-70)], 5),
      out('Nemají nic, co bys potřeboval.', [], 2),
    ]),
    ch('Odmítnout a letět dál', [out('Mávneš a pokračuješ.', [])]),
  ],
);

ev(
  'fuel_leak_warning',
  'jump',
  5,
  [{ t: 'dayMin', n: 6 }],
  'Netěsná nádrž',
  'Palivový senzor ukazuje podezřelý pokles tlaku.',
  [
    ch('Okamžitě utěsnit', [
      out('Utěsníš to včas. Jen chvilka práce.', [days(0.3), sup(-3)], 6),
      out('Ztratíš trochu paliva, ale zachráníš zbytek.', [fuel(-3)], 3),
    ]),
    ch('Ignorovat', [out('Falešný poplach.', [], 3), out('Z nádrže uniká palivo!', [fuel(-9), wear(5)], 4)]),
    ch(
      'Použít opravárenský modul',
      [out('Oprava proběhne rychle a čistě.', [wear(-6)], 6)],
      [hasMod('repair')],
    ),
  ],
);

ev(
  'cosmic_whale',
  'jump',
  3,
  [],
  'Vesmírná velryba',
  'V hyperprostoru tě doprovází obrovský tvor z plazmatu, jaký jsi nikdy neviděl.',
  [
    ch('Pozorovat s úžasem', [
      out('Chvíli letí vedle tebe a odpluje. Posádka mlčí dojetím.', [days(0.3), discover(60)], 6),
    ]),
    ch(
      'Snažit se zaznamenat data',
      [
        out('Vědecká data ti jednou někdo zaplatí.', [discover(140), days(0.4)], 4),
        out('Záznam se poškodí. Zůstanou jen vzpomínky.', [], 3),
      ],
      [hasMod('sensors')],
    ),
  ],
);

ev(
  'stowaway',
  'jump',
  5,
  [],
  'Černý pasažér',
  'Při pravidelné obchůzce najdeš v nákladovém prostoru vyhublého člověka.',
  [
    ch('Vzít ho na palubu', [
      out('Je to opravář. Za cestu ti zaplatí prací.', [wear(-8), sup(-2)], 4),
      out('Chvíli předstíral, že pomáhá, a ukradl pár zásob.', [sup(-6), cr(-40)], 3),
    ]),
    ch('Vysadit ho ve stanici', [
      out('Vysadíš ho na nejbližším doku. Poděkuje ti pohledem.', [rep(1), days(0.3)]),
    ]),
  ],
);

ev(
  'radiation_belt',
  'jump',
  5,
  [regionIn('core')],
  'Radiační pás',
  'Trasa vede kolem pásu tvrdého záření okolo mladé hvězdy.',
  [
    ch('Obletět pás', [out('Oklika stojí palivo, ale je bezpečná.', [fuel(-4), days(0.3)])]),
    ch('Projít středem', [
      out('Štíty zaplesají a zadrží většinu záření.', [], 4),
      out('Radiace prorazí trup. Elektronika zlobí.', [hull(-10), wear(10)], 4),
    ]),
  ],
);

/* ------------------------------ arrival ------------------------------ */

ev(
  'customs_patrol',
  'arrival',
  8,
  [regionIn('inner', 'outer')],
  'Celní hlídka',
  'Hlídková loď tě vyzve k prohlídce dokladů.',
  [
    ch('Spolupracovat', [
      out('Doklady jsou v pořádku. Hlídka ti popřeje šťastnou cestu.', [rep(1)], 6),
      out('Prohlídka zabere zbytečně dlouho.', [days(0.3)], 3),
    ]),
    ch(
      'Podplatit důstojníka',
      [
        out('Důstojník se usměje a „zapomene“ tě.', [cr(-120)], 5),
        out('Důstojník se urazí.', [rep(-2), cr(-250)], 3),
      ],
      [{ t: 'creditsMin', n: 150 }],
    ),
  ],
);

ev(
  'drifting_cargo',
  'arrival',
  6,
  [],
  'Plovoucí náklad',
  'U vstupního bodu driftují kontejnery po opuštěné lodi.',
  [
    ch('Posbírat vše, co jde', [
      out('Kontejnery obsahují použitelné díly.', [goods('spare_parts', 5)], 4),
      out('Kontejnery obsahují pár bedýnek polymerů.', [goods('polymers', 8)], 3),
      out('Jsou prázdné a navíc poškozují trup.', [hull(-4)], 2),
    ]),
    ch('Nahlásit v nejbližší stanici', [out('Za hlášení dostaneš malou odměnu.', [cr(60), rep(1)])]),
  ],
);

ev(
  'local_trader',
  'arrival',
  7,
  [],
  'Místní obchodník',
  'Na doku tě zastaví hbitý obchodník s nabídkou „jen pro tebe“.',
  [
    ch('Poslechnout nabídku', [
      out('Prozradí ti, kde se právě platí nejlépe.', [reveal(10)], 4),
      out('Prodá ti vadnou součástku.', [cr(-80), wear(4)], 2),
      out('Úplně smyšlené. Odejdeš s prázdnou.', [], 2),
    ]),
    ch('Odmítnout', [out('Slušně odmítneš.', [])]),
  ],
);

ev(
  'port_festival',
  'arrival',
  4,
  [regionIn('inner', 'core')],
  'Přístavní slavnost',
  'Ve stanici slaví místní výročí. Dokaři rozdávají jídlo.',
  [
    ch('Zúčastnit se', [
      out('Naplníš si zásoby a získáš pár kontaktů.', [sup(10), rep(1)], 5),
      out('Zdržíš se o den a opíjíš se s dokaři.', [days(1), sup(8)], 2),
    ]),
    ch('Pokračovat v práci', [out('Obchod je obchod.', [])]),
  ],
);

ev(
  'data_broker',
  'arrival',
  5,
  [],
  'Obchodník s daty',
  'Anonymní nabídka na tvém terminálu: „Cenové listy z celého sektoru.“',
  [
    ch(
      'Koupit (150 kr)',
      [
        out('Seznam obsahuje data o desítkách okolních systémů.', [cr(-150), reveal(20)], 6),
        out('Data jsou zastaralá a skoro k ničemu.', [cr(-150), reveal(6)], 2),
      ],
      [{ t: 'creditsMin', n: 160 }],
    ),
    ch('Odmítnout', [out('Zavřeš okno.', [])]),
  ],
);

ev(
  'docking_accident',
  'arrival',
  4,
  [],
  'Nehoda v doku',
  'Navigační systém doku selže a tvá loď se ocitne na kolizním kurzu.',
  [
    ch('Převzít řízení ručně', [
      out('Zvládneš to na jednu. Dokaři tleskají.', [rep(1)], 5),
      out('Škrábneš o dok.', [hull(-7)], 3),
    ]),
    ch('Nechat to na automatice', [
      out('Automatika se vzpamatuje.', [], 3),
      out('Náraz!', [hull(-12), wear(6)], 3),
    ]),
  ],
);

ev(
  'refugees',
  'arrival',
  4,
  [{ t: 'creditsMin', n: 100 }],
  'Uprchlíci',
  'Rodina uprchlíků prosí o pomoc s cestou.',
  [
    ch('Darovat zásoby', [out('Slzy vděčnosti. Pověst se šíří.', [sup(-8), rep(2)], 6)]),
    ch('Dát peníze', [out('Přijmou je s díky.', [cr(-100), rep(1)])]),
    ch('Odvrátit pohled', [out('Svědomí tě nebude hryzat dlouho.', [])]),
  ],
);

ev(
  'lonely_scientist',
  'arrival',
  4,
  [regionIn('outer', 'rim')],
  'Osamělý vědec',
  'V opuštěné stanici sedí vědec a zjevně nemá s kým mluvit.',
  [
    ch('Povídat si', [
      out('Dlouhá noc u kávy. Vdechne ti tipy na zajímavá místa.', [reveal(16), days(0.5)], 6),
      out('Dohodnete se, že ti pošle data později.', [rep(1)], 2),
    ]),
    ch('Nechat ho být', [out('Zdvořile se rozloučíš.', [])]),
  ],
);

/* ------------------------------ anomalies ---------------------------- */

ev(
  'ancient_relic',
  'anomaly',
  7,
  [],
  'Prastarý artefakt',
  'Na povrchu leží hladký předmět, jaký žádná lidská ruka nevyrobila.',
  [
    ch('Opatrně prozkoumat', [
      out('Artefakt tiše zazáří a odhalí tajné údaje o místě.', [discover(450), reveal(12)], 4),
      out('Artefakt vystřelí energetický výboj.', [hull(-12), wear(8)], 3),
      out('Rozpadne se na prach.', [], 2),
    ]),
    ch('Odvézt ho', [
      out('Artefakt ti vydělá, pokud najdeš sběratele.', [goods('art', 2)], 4),
      out('Poškodí ti náklad při převozu.', [lose(0.1)], 2),
    ]),
    ch('Nechat na místě', [out('Někdo jiný ať se zblázní.', [])]),
  ],
);

ev('crystal_cavern', 'anomaly', 7, [], 'Krystalová jeskyně', 'Pod povrchem září jeskyně plná krystalů.', [
  ch('Vytěžit opatrně', [
    out('Získáš čisté krystaly.', [goods('crystals', 12)], 5),
    out('Strop se zřítí, ale něco odneseš.', [goods('crystals', 5), hull(-6)], 3),
  ]),
  ch('Vytěžit hrubou silou', [
    out('Naložíš mnoho, ale část se roztříští.', [goods('crystals', 18), hull(-10), wear(8)], 4),
    out('Otřes zasype vchod.', [hull(-14)], 3),
  ]),
  ch('Jen nasnímat', [out('Zaznamenáš geologická data.', [discover(180)], 4)], [hasMod('surface')]),
]);

ev('derelict_ship', 'anomaly', 8, [], 'Vrak lodi', 'Skeletu staré nákladní lodi unikají zbytky kyslíku.', [
  ch('Prohledat nákladový prostor', [
    out('Najdeš nepoškozené bedny.', [goods('machinery', 6)], 3),
    out('Najdeš cennosti.', [cr(350)], 3),
    out('Past: vrak exploduje.', [hull(-22), wear(10)], 2),
  ]),
  ch('Prohledat můstek', [
    out('Letový deník ukazuje trasu k nové soustavě.', [reveal(16), discover(120)], 4),
    out('Najdeš moduly.', [mod('C')], 2),
    out('Prázdno.', [], 2),
  ]),
  ch('Odejít', [out('Duchové rádi zůstanou ve tmě.', [])]),
]);

ev(
  'strange_signal',
  'anomaly',
  6,
  [],
  'Podivný signál',
  'Z povrchu jde pravidelný signál, který nevypadá přirozeně.',
  [
    ch('Vysledovat zdroj', [
      out('Zdrojem je zapomenutá sonda. Data jsou k užitku.', [discover(260)], 4),
      out('Je to past na neopatrné.', [wear(10), hull(-6)], 2),
      out('Zdroj je jen odražený šum.', [], 3),
    ]),
    ch('Zaznamenat a odletět', [out('Záznam ti pomůže v budoucnu.', [discover(90)], 5)]),
  ],
);

ev(
  'alien_machine',
  'anomaly',
  3,
  [regionIn('outer', 'rim')],
  'Cizí stroj',
  'Z písku čnějí obrovské klouby stroje, který nepatří lidem.',
  [
    ch('Pokusit se aktivovat', [
      out('Stroj se probudí a obdaruje tě součástkou.', [mod('B')], 3),
      out('Stroj tě odmítne ostrým výbojem.', [hull(-16), wear(12)], 3),
      out('Stroj tě oskenuje a nechá být.', [discover(300)], 3),
    ]),
    ch('Odvézt kus', [
      out('Utrhneš kus a pospícháš pryč.', [goods('rare_metals', 6)], 5),
      out('Stroj se probudí vzteky.', [hull(-14)], 2),
    ]),
    ch('Raději odejít', [out('Nechceš vědět, co tu spí.', [])]),
  ],
);

ev('gas_pocket', 'anomaly', 5, [], 'Plynová kapsa', 'Pod povrchem leží kapsa vzácného plynu.', [
  ch('Využít k dotankování', [
    out('Doplníš palivové nádrže.', [fuel(12)], 5),
    out('Plyn exploduje při vrtání.', [hull(-14)], 2),
  ]),
  ch('Nechat být', [out('Plyn je plyn.', [])]),
]);

ev('buried_cache', 'anomaly', 6, [], 'Ukrytý sklad', 'Detektor registruje kovový sklad pod prachem.', [
  ch('Vykopat', [
    out('Sklad je plný zásob.', [sup(14), goods('metals', 6)], 4),
    out('Sklad je opuštěný a prázdný.', [], 2),
    out('Sklad je minovaný.', [hull(-16)], 2),
  ]),
  ch('Zanechat', [out('Ať si ho vyzvednou původní majitelé.', [])]),
]);

ev(
  'lost_probe',
  'anomaly',
  5,
  [],
  'Ztracená sonda',
  'Vznášející se sonda stále vysílá. Patří vědecké společnosti.',
  [
    ch('Vzít ji na palubu', [
      out(
        'Vrátíš ji majitelům a dostaneš dobrou odměnu a pár náhradních sond.',
        [cr(220), rep(1), probes(2)],
        4,
      ),
      out('Sonda se spálí při zásahu.', [], 2),
    ]),
    ch('Vyčíst data na místě', [out('Získáš data o soustavě.', [discover(200)], 4)]),
  ],
);

ev(
  'volcanic_vent',
  'anomaly',
  5,
  [],
  'Sopečný průduch',
  'V trhlině povrchu vře láva a odhaluje vzácné prvky.',
  [
    ch('Sebrat vzorky', [
      out('Získáš radioaktivní horniny.', [goods('radioactives', 5), hull(-5)], 4),
      out('Vzorky jsou bezcenné.', [], 2),
    ]),
    ch('Provést měření ze vzduchu', [out('Měření je podrobné a cenné.', [discover(140)], 5)]),
  ],
);

ev(
  'living_ice',
  'anomaly',
  3,
  [regionIn('outer', 'rim')],
  'Živý led',
  'Ledová pláň pulzuje slabou bioluminiscencí.',
  [
    ch('Odebrat vzorek', [
      out('Vzorek obsahuje neznámý organismus.', [goods('biosamples', 6)], 4),
      out('Vzorek se roztaví.', [], 3),
    ]),
    ch('Vyvrtat hlouběji', [
      out('Odhalíš celý ekosystém. Je to vědecká senzace.', [discover(500), days(0.8)], 3),
      out('Něco ti zkousne vrták.', [wear(14, 'laser')], 3),
    ]),
  ],
);

ev(
  'crashed_survey',
  'anomaly',
  5,
  [],
  'Havarovaná průzkumná loď',
  'Zbytky průzkumné lodi leží rozlétlé po svahu.',
  [
    ch('Hledat přeživší', [
      out('Zachráníš jednoho člena posádky, který ti dá odměnu.', [cr(300), rep(2)], 3),
      out('Nikdo nepřežil. Dohledáš aspoň záznamy.', [discover(160)], 4),
    ]),
    ch('Rozebrat vrak', [out('Seženeš použitelné díly.', [goods('spare_parts', 8)], 5)]),
  ],
);

/* ------------------------------- dock -------------------------------- */

ev('bar_rumor', 'dock', 9, [], 'Drby v baru', 'U baru si naslouchá pár těžařů a vyprávějí o nálezech.', [
  ch(
    'Koupit rundu',
    [out('Rozpovídají se o výhodné trase.', [cr(-40), reveal(14)], 6), out('Nic nového.', [cr(-40)], 2)],
    [{ t: 'creditsMin', n: 60 }],
  ),
  ch('Poslouchat zpovzdálí', [out('Zaslechneš pár střípků.', [reveal(6)], 4)]),
]);

ev(
  'shady_dealer',
  'dock',
  6,
  [regionIn('outer', 'rim', 'core')],
  'Podezřelý překupník',
  'Postarší muž tě oslovuje s nabídkou „nevyhnutelně výhodného obchodu“.',
  [
    ch(
      'Koupit od něj bednu',
      [
        out(
          'Bedna obsahuje drahé zboží, očividně z nelegálních zdrojů.',
          [goods('electronics', 6), cr(-300)],
          4,
        ),
        out('Bedna je plná kamení.', [cr(-300)], 3),
      ],
      [{ t: 'creditsMin', n: 320 }],
    ),
    ch('Odmítnout', [out('Zavrtíš hlavou.', [])]),
    ch('Nahlásit ho', [out('Dostaneš malou odměnu od ochranky.', [cr(90), rep(2)], 4)]),
  ],
);

ev(
  'mechanic_offer',
  'dock',
  7,
  [{ t: 'creditsMin', n: 100 }],
  'Mechanik na doku',
  'Mladý mechanik nabízí rychlou prohlídku tvé lodi za malý peníz.',
  [
    ch('Přijmout', [
      out('Našel pár drobností a opravil je.', [cr(-80), wear(-10)], 5),
      out('Nic neopravil, ale vzal si peníze.', [cr(-80)], 2),
    ]),
    ch('Odmítnout', [out('Díky, ne.', [])]),
  ],
);

ev('lost_luggage', 'dock', 4, [], 'Ztracená zavazadla', 'Na doku ti někdo omylem pošle cizí kufry.', [
  ch('Vrátit majiteli', [out('Majitel je rád a odmění tě.', [cr(120), rep(1)], 5)]),
  ch('Podívat se dovnitř', [
    out('Pár použitelných věcí.', [sup(6), cr(70)], 3),
    out('Majitel tě prohlásí za zloděje.', [rep(-2), cr(-100)], 3),
  ]),
]);

ev(
  'station_blackout',
  'dock',
  4,
  [],
  'Výpadek proudu',
  'Stanice zažije krátký výpadek. Nouzová světla zbarví vše do červena.',
  [
    ch('Pomoci s opravou', [out('Dokaři ocení tvou pomoc.', [rep(2), days(0.4)], 6)], [hasMod('repair')]),
    ch('Vyčkat', [out('Světla se vrátí.', [days(0.2)])]),
  ],
);

ev(
  'tip_on_cargo',
  'dock',
  6,
  [{ t: 'dayMin', n: 4 }],
  'Tip na náklad',
  'Dispečer ti napíše: „Tohle byste mohl chtít vědět.“',
  [
    ch('Poslechnout', [
      out('Dozvíš se o místním nedostatku zboží.', [reveal(10)], 6),
      out('Tip se nepotvrdí.', [], 2),
    ]),
    ch('Ignorovat', [out('Dispečer pokrčí rameny.', [])]),
  ],
);

/* -------------------------------- mine ------------------------------- */

ev('rich_vein', 'mine', 8, [], 'Bohatá žíla', 'Laser narazí na neobvykle bohatou žílu.', [
  ch('Vytěžit rychle', [
    out('Naložíš mnoho cenné rudy.', [goods('rare_ore', 6)], 4),
    out('Žíla se zhroutí.', [hull(-9)], 3),
  ]),
  ch('Vyčkat a vytěžit opatrně', [
    out('Opatrná práce přinese čistý výnos.', [goods('rare_ore', 4), days(0.5)], 6),
  ]),
]);

ev('pressure_pocket', 'mine', 6, [], 'Tlaková kapsa', 'Při těžbě se pod tebou rozevře tlaková kapsa.', [
  ch('Uskočit', [out('Unikneš včas.', [], 5), out('Úlomky tě zasáhnou.', [hull(-10)], 3)]),
  ch('Využít uvolněný plyn', [
    out('Naplníš nádrže.', [fuel(6)], 4),
    out('Plyn vzplane.', [hull(-14), wear(8)], 3),
  ]),
]);

ev(
  'equipment_fault',
  'mine',
  7,
  [{ t: 'dayMin', n: 5 }],
  'Porucha vybavení',
  'Těžební vybavení začne zlobit.',
  [
    ch('Vypnout a opravit', [out('Opravíš to za pár hodin.', [days(0.4), wear(-6)], 6)]),
    ch('Pokračovat', [out('Vydrží.', [], 3), out('Přehřátí poškodí laser.', [wear(15, 'laser')], 4)]),
  ],
);

ev(
  'hidden_nest',
  'mine',
  4,
  [regionIn('outer', 'rim')],
  'Skryté hnízdo',
  'Pod povrchem se hýbe něco malého a živého.',
  [
    ch('Pozorovat', [out('Zachytíš zajímavá data.', [discover(120)], 5)]),
    ch('Zničit hnízdo', [
      out('Rozdrtíš ho a vytěžíš pod ním bohaté ložisko.', [goods('crystals', 6)], 3),
      out('Hnízdo se brání.', [hull(-12)], 3),
    ]),
  ],
);

/* ---------- conditional events (cargo, shield, reputation, ...) ------ */

ev(
  'hazmat_leak',
  'jump',
  6,
  [tag('hazardous')],
  'Únik z nebezpečného nákladu',
  'Alarm! Senzory zachytily únik z kontejneru s nebezpečným zbožím.',
  [
    ch('Vyhodit kontejner', [out('Odhodíš kontejner. Škoda, ale loď je v bezpečí.', [lose(0.15)])]),
    ch('Utěsnit únik', [
      out('Utěsníš ho včas.', [days(0.3)], 5),
      out('Únik poškodí trup.', [hull(-14), wear(8)], 3),
    ]),
  ],
);

ev(
  'perishable_spoil',
  'jump',
  5,
  [tag('perishable')],
  'Selhání chlazení',
  'Chladicí okruh se zasekl. Zboží se začne kazit.',
  [
    ch('Nouzově opravit', [
      out('Podaří se to včas.', [days(0.2)], 5),
      out('Část zboží se zkazí.', [lose(0.12)], 3),
    ]),
    ch('Nechat být', [out('Ztráta je citelná.', [lose(0.2)])]),
  ],
);

ev(
  'smugglers_offer',
  'arrival',
  5,
  [regionIn('outer', 'rim'), { t: 'creditsMin', n: 300 }],
  'Nabídka pašeráků',
  'Pašeráci tě oslovují: „Převezeš pro nás malou zásilku?“',
  [
    ch('Přijmout', [
      out('Zásilku doručíš bez problémů. Tučná odměna.', [cr(420), rep(-1), flag('smuggler_contact')], 4),
      out('Hlídka tě zastaví.', [cr(-300), rep(-3)], 3),
    ]),
    ch('Odmítnout', [out('Pokrčí rameny a zmizí.', [])]),
  ],
);

ev(
  'rival_trader',
  'arrival',
  4,
  [{ t: 'cargoValueMin', n: 1500 }],
  'Rivalský obchodník',
  'Konkurent ti nabízí slušnou sumu za vykoupení celého nákladu.',
  [
    ch('Přijmout nabídku (+8 %)', [
      out('Obchod se uskuteční, náklad je pryč.', [{ t: 'ext', key: 'sellAllPremium', args: { pct: 0.08 } }]),
    ]),
    ch('Odmítnout', [out('Odejde pohoršen.', [])]),
  ],
);

ev(
  'shield_test',
  'jump',
  4,
  [hasMod('shield')],
  'Zkouška štítů',
  'Sousední loď ti nabídne společný test štítů: bezplatně a bezpečně.',
  [
    ch('Souhlasit', [
      out('Štíty vydrží. Dostaneš kalibrační data.', [wear(-8, 'shield')], 5),
      out('Test štíty přetíží.', [wear(10, 'shield')], 2),
    ]),
    ch('Odmítnout', [out('Raději ne.', [])]),
  ],
);

ev(
  'repair_tutorial',
  'dock',
  4,
  [hasMod('repair')],
  'Kurz oprav',
  'Dokaři pořádají kurz oprav za symbolický poplatek.',
  [
    ch('Zúčastnit se', [
      out('Naučíš se pár triků: opravárenský modul funguje lépe.', [wear(-6), cr(-30)], 5),
    ]),
    ch('Vynechat', [out('Raději práce.', [])]),
  ],
);

ev(
  'legendary_ore',
  'anomaly',
  2,
  [regionIn('core')],
  'Legendární ložisko',
  'Detektory zbělají: pod tebou leží ložisko extrémní čistoty.',
  [
    ch('Vytěžit vše', [
      out('Jackpot!', [goods('rare_metals', 14)], 4),
      out('Ložisko je nestabilní.', [hull(-20), goods('rare_metals', 5)], 3),
    ]),
    ch('Označit na mapě', [out('Prodáš souřadnice kartografům.', [discover(700)], 5)]),
  ],
);

ev('quiet_space', 'jump', 12, [], 'Klidný skok', 'Skok proběhne bez komplikací. Máš čas přemýšlet.', [
  ch('Pokračovat', [out('Další etapa je za tebou.', [])]),
]);

/* ------------------------------- crew (v2) ------------------------------- */

const hurt = (n: number, all = false): Effect => ({ t: 'crewHurt', n, all });
const xp = (skill: Skill, n: number): Effect => ({ t: 'crewXp', skill, n });
const morale = (n: number): Effect => ({ t: 'crewMorale', n });
const leave = (role?: Role): Effect => ({ t: 'crewLeave', role });
const join = (level: number, role?: Role, race?: RaceId): Effect => ({ t: 'crewJoin', level, role, race });
const fight = (enemy: string, tier: number): Effect => ({ t: 'fight', enemy, tier });
const hasRole = (role: Role): Cond => ({ t: 'crewRole', role });
const hasRace = (race: RaceId): Cond => ({ t: 'crewRace', race });
const skillMin = (skill: Skill, min: number): Cond => ({ t: 'crewSkill', skill, min });
const hasOfficer = (id: OfficerId): Cond => ({ t: 'officer', id });
const never: Cond = { t: 'flag', key: '__never__' };

// triggered directly by the crew model (morale), never rolled
ev(
  'mutiny',
  'jump',
  1,
  [never],
  'Vzpoura na palubě',
  'Hladová a neplacená posádka se shromáždila v jídelně. Chtějí slyšet, jak je to s výplatami, a nevypadají trpělivě.',
  [
    ch('Vyplatit dlužné mzdy', [
      out('Výplata uklidní hlavy. Morálka se zvedá, kasa řídne.', [cr(-120), morale(25)], 6),
      out('Nemáš dost. Dva lidé se rozhodnou odejít.', [leave(), leave(), morale(8)], 3),
    ]),
    ch('Zasáhnout silou', [
      out('Vůdce vzpoury se vzdá, ostatní ztichnou.', [morale(-10), hurt(15)], 4),
      out('Dojde k potyčce. Několik zraněných.', [hurt(30, true), morale(-15), leave()], 4),
    ]),
    ch(
      'Brom Tark zavede pořádek',
      [out('Starý předák zařve jednou a všichni se vrátí k práci.', [morale(22)])],
      [hasOfficer('taskmaster')],
    ),
    ch(
      'Vyjednávat',
      [
        out('Obchodník najde slova, která zaberou.', [morale(18)], 7),
        out('Nikdo neposlouchá, ale nevybuchne to.', [morale(5)], 3),
      ],
      [hasRole('trader')],
    ),
  ],
);

ev(
  'officer_haggler',
  'dock',
  1,
  [never],
  'Ilvaria Dun nastupuje',
  'Ilvaria Dun, bývalá makléřka z Tessari, přistoupí k přepážce a řekne: „Znám ceny na stovce stanic. Ukážu ti, jak z nich vytáhnout víc.“',
  [ch('Uvítat ji na palubě', [out('Obchody půjdou lépe: skluz cen ti bude hrát do karet.', [morale(5)])])],
);
ev(
  'officer_ghost',
  'dock',
  1,
  [never],
  'Kesh Oru nastupuje',
  'Kesh Oru je pilot, o kterém se říká, že se dokáže ztratit i uprostřed bitvy. Na každou cestu zvládne jeden únik bez spotřeby paliva.',
  [ch('Přijmout', [out('Kesh si prohlédne kokpit a kývne.', [morale(5)])])],
);
ev(
  'officer_taskmaster',
  'dock',
  1,
  [never],
  'Brom Tark nastupuje',
  'Brom Tark je starý předák z doků. Pod jeho dohledem posádka pracuje tvrději a stěžuje si méně.',
  [ch('Přijmout', [out('Brom si zkontroluje nářadí a vyhlásí nový rozpis služeb.', [morale(8)])])],
);
ev(
  'officer_sharpshooter',
  'dock',
  1,
  [never],
  'Zhe Nuvai nastupuje',
  'Zhe Nuvai z Nyxulů míří třemi očima a nemine. Zbraně pod jeho rukama nabíjejí rychleji.',
  [ch('Přijmout', [out('Zhe si pohladí hlaveň děla jako starého přítele.', [morale(5)])])],
);
ev(
  'officer_mender',
  'dock',
  1,
  [never],
  'Orsa Vell nastupuje',
  'Orsa Vell je lékařka z rodu Veth, která ošetří i to, co ostatní zavrhnou. Zranění se u ní hojí rychleji.',
  [ch('Přijmout', [out('Orsa rozloží lékárničku a hned začne třídit zásoby.', [morale(5)])])],
);
ev(
  'officer_navigator',
  'dock',
  1,
  [never],
  'Teq Ahlun nastupuje',
  'Teq Ahlun čte hvězdné mapy jako jiní čtou jídelníček. Na dlouhých skocích ušetří palivo.',
  [ch('Přijmout', [out('Teq rozloží mapy a okamžitě opraví tvou trasu.', [morale(5)])])],
);

ev(
  'crew_brawl',
  'jump',
  4,
  [{ t: 'crewMoraleBelow', n: 40 }],
  'Rvačka v jídelně',
  'Mezi dvěma členy posádky se strhla hádka kvůli porcím. Než se nadáš, létají talíře.',
  [
    ch('Rozdělit je', [
      out('Rozhodneš to rázně a oba si odnesou jen modřiny.', [hurt(8), morale(-2)], 6),
      out('Dostaneš to taky.', [hurt(18), morale(-4)], 2),
    ]),
    ch('Nechat to být', [
      out('Vybijí si to a utichnou.', [morale(-6), hurt(12)], 5),
      out('Jeden z nich odejde.', [leave()], 2),
    ]),
    ch('Poslat obě na přídavnou službu', [out('Potrestaní, ale srovnaní.', [morale(-3)])]),
  ],
);

ev(
  'crew_medic_lesson',
  'jump',
  3,
  [hasRole('medic')],
  'Nácvik první pomoci',
  'Lékař navrhne, že by posádku naučil pár fíglů. Zabere to den, ale lidé se budou umět postarat o sebe i bez něj.',
  [
    ch('Souhlasit', [
      out('Posádka se naučí obvazovat a lékař získá zkušenosti učením.', [
        days(1),
        xp('medicine', 0.3),
        morale(4),
      ]),
    ]),
    ch('Odložit', [out('Možná příště.', [])]),
  ],
);

ev(
  'crew_gunnery_drill',
  'jump',
  3,
  [hasRole('gunner')],
  'Střelecké cvičení',
  'Střelec chce vyzkoušet děla na odpadky z poslední kolonie. Spotřebuje se trochu energie, ale trefí se líp.',
  [
    ch('Povolit cvičení', [
      out('Odpadky padnou do jednoho. Střelec je spokojený.', [xp('gunnery', 0.35), wear(2)], 6),
      out('Cvičení dopadne dobře, jen přehřeje zbraně.', [xp('gunnery', 0.2), wear(6)], 3),
    ]),
    ch('Šetřit zdroje', [out('Střelec si vzdychne.', [morale(-2)])]),
  ],
);

ev(
  'crew_sylk_shortcut',
  'jump',
  3,
  [hasRace('sylk'), dangerMin(0.2)],
  'Zkratka od Sylků',
  'Sylk u kormidla navrhne obejít nebezpečný pás: „Znám tu cestu z doby, kdy jsem lítal pro kurýry.“',
  [
    ch('Zkusit zkratku', [
      out('Zkratka vyjde a ušetříš čas.', [days(-0.5), xp('piloting', 0.25)], 5),
      out('Na konci čeká patrola pirátů.', [fight('scrapper', 1)], 3),
    ]),
    ch('Držet se trasy', [out('Bezpečně, ale pomalu.', [])]),
  ],
);

ev(
  'crew_trader_tip',
  'arrival',
  4,
  [hasRole('trader')],
  'Tip od obchodníka',
  'Obchodník na palubě zaslechl v přístavu pomluvu o místním přebytku. Nejspíš má pravdu.',
  [
    ch('Poslechnout', [
      out('Tip se vyplatí a trochu si přivyděláš.', [cr(90), xp('trade', 0.3)], 5),
      out('Byla to jen drbna.', [xp('trade', 0.1)], 3),
    ]),
    ch('Ignorovat', [out('Přeci jen nevíš, komu věřit.', [])]),
  ],
);

ev(
  'crew_science_scan',
  'jump',
  3,
  [hasRole('scientist')],
  'Anomálie na senzorech',
  'Vědec zbledne: senzory zachytily slabý signál z blízkého prachového oblaku. Chce ho prozkoumat.',
  [
    ch('Prozkoumat', [
      out('Našli jste starý datový maják. Prodáš data.', [discover(220), xp('science', 0.4)], 5),
      out('Signál byl past mikrometeorů.', [hull(-14), xp('science', 0.15)], 3),
    ]),
    ch('Letět dál', [out('Vědec je zklamaný.', [morale(-3)])]),
  ],
);

ev(
  'crew_stowaway',
  'dock',
  2,
  [{ t: 'dayMin', n: 6 }],
  'Černý pasažér',
  'V nákladovém prostoru najdeš ukrytého mladíka. Tvrdí, že umí opravovat motory a že už nemá kam jít.',
  [
    ch('Vzít do posádky', [
      out('Chlapec se vyklube jako šikovný mechanik.', [join(1.8, 'engineer'), morale(2)], 5),
      out('Moc toho neumí, ale je pilný.', [join(0.8), morale(1)], 3),
    ]),
    ch('Vyhodit', [out('Odejde bez řečí.', [morale(-3)])]),
  ],
);

ev(
  'pirate_ambush',
  'jump',
  5,
  [dangerMin(0.3)],
  'Přepadení',
  'Z prachového oblaku vyrazí malá loď bez označení a míří přímo na tebe. Rádio mlčí.',
  [
    ch('Přijmout boj', [out('Piráti zahájí palbu.', [fight('scrapper', 1)])]),
    ch(
      'Pilot převezme řízení',
      [out('Zkušený pilot ti vytočí loď z palebné linie a unikneš bez škrábnutí.', [xp('piloting', 0.3)])],
      [skillMin('piloting', 4)],
    ),
    ch('Zkusit uniknout', [
      out('Pilot loď vytočí a odskočíš.', [fuel(-3)], 5),
      out('Nestíháš, piráti jsou rychlejší.', [fight('scrapper', 1)], 4),
    ]),
  ],
);

ev(
  'derelict_turret',
  'jump',
  3,
  [dangerMin(0.2)],
  'Vrak se zbraněmi',
  'Skenery ukazují vrak zdánlivě bez života. V jeho trupu ale pořád svítí nabíjecí kontrolky střílen.',
  [
    ch('Přiblížit se', [
      out('Střílny ožijí. Čeká tě boj.', [fight('autoturret', 1)], 6),
      out('Systémy jsou mrtvé. Vybereš z vraku zásoby.', [sup(4), goods('spare_parts', 3)], 3),
    ]),
    ch('Vyhnout se', [out('Obletíš ho ve slušné vzdálenosti.', [])]),
  ],
);

export const EVENTS_BY_ID: Record<string, EventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
export const ANOMALY_EVENT_IDS: string[] = EVENTS.filter((e) => e.trigger === 'anomaly').map((e) => e.id);
