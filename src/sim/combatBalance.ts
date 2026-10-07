/**
 * Headless combat balance: AI-vs-AI duels over ship configurations, plus loot-versus-repair economics.
 * Used by `npm run balance` (section in docs/balance.md) and by tests.
 */
import { ENEMIES } from '../content/enemies';
import { GOODS_BY_ID } from '../content/goods';
import { defaultCrew } from '../core/crew';
import { MODULES_BY_ID } from '../content/modules';
import { WEAPON_SIZES } from '../content/weapons';
import { addGoods } from '../core/cargo';
import { autoResolve, makeEncounter, startCombat } from '../core/combat/encounter';
import { makeDuel, type DuelSide } from '../core/combat/duel';
import { resolveCombat } from '../core/combat/resolve';
import type { WeaponKind } from '../core/combat/types';
import { moduleRepairCost, hullRepairCost } from '../core/game';
import { Rng } from '../core/rng';
import { buildStarterShip, hullSlots, moduleFits, newModule } from '../core/ship';
import { newGame } from '../core/start';
import { analyze, newUid } from '../core/state';
import type { Size } from '../core/types';

export type Archetype = 'energy' | 'kinetic' | 'missile' | 'ion' | 'drones' | 'mixed';
export const ARCHETYPES: Archetype[] = ['energy', 'kinetic', 'missile', 'ion', 'drones', 'mixed'];
export const DUEL_HULLS = ['wayfarer', 'kestrel', 'mule', 'swift', 'borer'];

const RECIPES: Record<Archetype, WeaponKind[]> = {
  energy: ['energy'],
  kinetic: ['kinetic'],
  missile: ['missile', 'kinetic'],
  ion: ['ion', 'energy'],
  drones: ['drones', 'kinetic'],
  mixed: ['energy', 'kinetic', 'missile'],
};

const RANK: Record<Size, number> = { S: 1, M: 2, L: 3 };

/** Fill the free slots of a hull: one shield first, then weapons following the recipe. */
export function loadoutFor(hullId: string, arch: Archetype): string[] {
  const free = hullSlots(hullId).filter((s) => !s.core);
  const out: string[] = [];
  let shieldDone = false;
  let k = 0;
  const recipe = RECIPES[arch];
  for (const sl of [...free].sort((a, b) => RANK[a.size] - RANK[b.size])) {
    if (!shieldDone) {
      out.push(`shield_${sl.size.toLowerCase()}`);
      shieldDone = true;
      continue;
    }
    for (let tries = 0; tries < recipe.length; tries++) {
      const kind = recipe[(k + tries) % recipe.length];
      const sizes = WEAPON_SIZES[kind].filter((z) => RANK[z] <= RANK[sl.size]);
      if (!sizes.length) continue;
      const size = sizes[sizes.length - 1];
      out.push(`${kind}_${size.toLowerCase()}`);
      k += tries + 1;
      break;
    }
  }
  return out.filter((id) => MODULES_BY_ID[id]);
}

export function sideFor(hullId: string, arch: Archetype, extra: Partial<DuelSide> = {}): DuelSide {
  return {
    hullId,
    modules: loadoutFor(hullId, arch),
    missiles: 12,
    crew: ['pilot', 'engineer', 'gunner', 'medic'],
    skill: 3,
    ...extra,
  };
}

export interface DuelResult {
  win: number;
  loss: number;
  draw: number;
  meanTime: number;
  meanHullLeft: number;
}

/** Plays `n` duels of side A against side B (both AI driven) and counts the outcomes from A's view. */
export function duels(a: DuelSide, b: DuelSide[], n: number, tag: string): DuelResult {
  const r: DuelResult = { win: 0, loss: 0, draw: 0, meanTime: 0, meanHullLeft: 0 };
  for (let i = 0; i < n; i++) {
    const c = makeDuel(`${tag}:${i}`, a, b);
    autoResolve(c);
    // running away from a lost fight counts as a loss, an enemy that runs counts as a win
    if (c.outcome === 'victory' || c.outcome === 'surrender' || c.outcome === 'enemy-fled') {
      r.win++;
      r.meanHullLeft += c.player.hull / c.player.hullMax;
    } else if (c.outcome === 'defeat' || c.outcome === 'fled') r.loss++;
    else r.draw++;
    r.meanTime += c.time;
  }
  r.meanTime /= n;
  r.meanHullLeft = r.win ? r.meanHullLeft / r.win : 0;
  return r;
}

export const rate = (r: DuelResult): number => (r.win + 0.5 * r.draw) / Math.max(1, r.win + r.loss + r.draw);

export interface LootStats {
  enemy: string;
  tier: number;
  fights: number;
  wins: number;
  loot: number;
  repair: number;
  missiles: number;
}

export interface LootStats {
  enemy: string;
  tier: number;
  fights: number;
  wins: number;
  loot: number;
  repair: number;
  missiles: number;
  ownLosses: number;
}

const MISSILE_COST = 26;

/** A new game whose ship is fitted with the archetype's loadout (hull: mule, the cargo hauler most players start from). */
function armedGame(seed: string, arch: Archetype, risk: 'low' | 'normal' | 'high') {
  const s = newGame({ seed, galaxySize: 60, difficulty: { risk } });
  s.ship = buildStarterShip('mule', 'Test', () => newUid(s, 'm'));
  for (const id of loadoutFor('mule', arch)) {
    const def = MODULES_BY_ID[id];
    const sl = hullSlots('mule').find((x) => !s.ship.slots[x.index] && moduleFits(x, def));
    if (sl) s.ship.slots[sl.index] = newModule(id, 'C', newUid(s, 'm'));
  }
  s.ship.hp = analyze(s).stats.hpMax;
  s.crew = defaultCrew(seed, 'mule', 0, () => newUid(s, 'w'));
  const { dims, stats } = analyze(s);
  addGoods(
    s.cargo,
    dims,
    { chilledCells: stats.chilledCells, secureCells: stats.secureCells },
    'missiles',
    10,
    0,
    0,
  );
  return s;
}

/** Real fights against encounter enemies of a given kind, then the repair bill at the home station. */
export function lootEconomics(arch: Archetype, risk: 'low' | 'normal' | 'high', n: number): LootStats[] {
  const out: LootStats[] = [];
  const pool = ENEMIES.filter((e) => e.kind === 'pirate' || e.kind === 'hunter');
  for (const def of pool) {
    for (const tier of [...new Set([def.tiers[0], def.tiers[1]])]) {
      const st: LootStats = {
        enemy: def.id,
        tier,
        fights: 0,
        wins: 0,
        loot: 0,
        repair: 0,
        missiles: 0,
        ownLosses: 0,
      };
      for (let i = 0; i < n; i++) {
        const s = armedGame(`LOOT-${def.id}-${tier}-${i}`, arch, risk);
        const enc = makeEncounter(
          s,
          def.kind,
          s.location.systemId,
          Rng.fromSeed(`enc:${def.id}:${tier}:${i}`),
          tier,
        );
        if (!enc) continue;
        enc.enemyDefs = [def.id];
        s.encounter = enc;
        const c = startCombat(s, enc);
        autoResolve(c);
        const credits0 = s.credits;
        const goodsBefore = s.cargo.reduce((a, g) => a + g.qty, 0);
        const sum = resolveCombat(s, c);
        st.fights++;
        if (sum.outcome === 'victory' || sum.outcome === 'surrender') {
          st.wins++;
          const goodsValue = sum.goods.reduce(
            (a, g) => a + g.qty * (GOODS_BY_ID[g.goodId]?.basePrice || 0),
            0,
          );
          st.loot += s.credits - credits0 + goodsValue;
        }
        void goodsBefore;
        if (sum.outcome === 'defeat') st.ownLosses++;
        else {
          const sid = s.location.stationId!;
          let bill = hullRepairCost(s, sid);
          s.ship.slots.forEach((_, k) => (bill += moduleRepairCost(s, sid, k)));
          st.repair += bill;
        }
        st.missiles += sum.missilesUsed;
      }
      out.push(st);
    }
  }
  return out;
}

const pct = (x: number) => `${(x * 100).toFixed(0)} %`;
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

export interface CombatReportOpts {
  /** Duels per pairing and hull. */
  duelsPer: number;
  /** Fights per enemy for the loot table. */
  lootFights: number;
  /** Bot games for the trade-only check. */
  tradeSeeds: number;
  tradeDays: number;
}

/** Markdown lines of the combat section of docs/balance.md. */
export function combatReport(o: CombatReportOpts): string[] {
  const L: string[] = [];
  const hulls = DUEL_HULLS;
  // matrix over all hulls
  const cell: Record<string, Record<string, number>> = {};
  const byHull: Record<string, Record<Archetype, number>> = {};
  for (const h of hulls) byHull[h] = {} as Record<Archetype, number>;
  for (const a of ARCHETYPES) {
    cell[a] = {};
    for (const b of ARCHETYPES) {
      if (a === b) {
        cell[a][b] = 0.5;
        continue;
      }
      const per = hulls.map((h) =>
        rate(
          duels(
            sideFor(h, a, { missiles: 8 }),
            [sideFor(h, b, { missiles: 8 })],
            o.duelsPer,
            `${h}:${a}:${b}`,
          ),
        ),
      );
      cell[a][b] = mean(per);
      if (b === 'mixed') hulls.forEach((h, i) => (byHull[h][a] = per[i]));
    }
  }
  const field = (a: Archetype) => mean(ARCHETYPES.filter((b) => b !== a).map((b) => cell[a][b]));
  L.push('## Boj: míra výher zbraní (AI proti AI)', '');
  L.push(
    `Každá kombinace hraje ${o.duelsPer} soubojů proti každé jiné na ${hulls.length} trupech (${hulls.join(', ')}), obě lodě stejné třídy kvality C a stejné posádky, řídí je stejná AI. Řádek = výzbroj hráče, sloupec = protivník, hodnota = míra výher (remíza = 0,5).`,
    '',
  );
  L.push(
    `| Výzbroj | ${ARCHETYPES.join(' | ')} | Průměr proti poli |`,
    `|---|${ARCHETYPES.map(() => '---:').join('|')}|---:|`,
  );
  for (const a of ARCHETYPES)
    L.push(`| **${a}** | ${ARCHETYPES.map((b) => pct(cell[a][b])).join(' | ')} | **${pct(field(a))}** |`);
  L.push('');
  const fields = ARCHETYPES.map((a) => [a, field(a)] as const).sort((x, y) => y[1] - x[1]);
  L.push(
    `Nejsilnější výzbroj: **${fields[0][0]}** (${pct(fields[0][1])}), nejslabší: **${fields[fields.length - 1][0]}** (${pct(fields[fields.length - 1][1])}). Cíl je průměr proti poli v rozmezí 40–60 %.`,
    '',
  );
  L.push('### Míra výher proti vyrovnanému protivníkovi (smíšená výzbroj stejného trupu)', '');
  L.push(
    `| Trup | ${ARCHETYPES.filter((a) => a !== 'mixed').join(' | ')} |`,
    `|---|${ARCHETYPES.filter((a) => a !== 'mixed')
      .map(() => '---:')
      .join('|')}|`,
  );
  for (const h of hulls)
    L.push(
      `| ${h} | ${ARCHETYPES.filter((a) => a !== 'mixed')
        .map((a) => pct(byHull[h][a]))
        .join(' | ')} |`,
    );
  L.push('');
  const combos: { name: string; r: number }[] = [];
  for (const h of hulls)
    for (const a of ARCHETYPES.filter((x) => x !== 'mixed'))
      combos.push({ name: `${h} + ${a}`, r: byHull[h][a] });
  combos.sort((x, y) => y.r - x.r);
  L.push(
    `Nejsilnější kombinace proti smíšenému protivníkovi: ${combos
      .slice(0, 3)
      .map((c) => `${c.name} (${pct(c.r)})`)
      .join(', ')}. Nejslabší: ${combos
      .slice(-3)
      .map((c) => `${c.name} (${pct(c.r)})`)
      .join(', ')}.`,
    '',
  );
  // loot economics by difficulty
  L.push('## Boj: kořist proti nákladům', '');
  L.push(
    `Skutečné střety (loď třídy mule se smíšenou výzbrojí, auto-boj, ${o.lootFights} soubojů na protivníka a úroveň). Kořist = kredity + hodnota zboží ze zničeného vraku. Náklady = účet za opravu trupu a modulů ve stanici + spotřebované rakety (${MISSILE_COST} kr/ks). Zničení lodi se do nákladů nepočítá, ale je uvedeno zvlášť.`,
    '',
  );
  for (const risk of ['low', 'normal', 'high'] as const) {
    const rows = lootEconomics('mixed', risk, o.lootFights);
    const wins = rows.reduce((a, r) => a + r.wins, 0);
    const fights = rows.reduce((a, r) => a + r.fights, 0);
    const loot = rows.reduce((a, r) => a + r.loot, 0);
    const bills = rows.reduce((a, r) => a + r.repair + r.missiles * MISSILE_COST, 0);
    const lost = rows.reduce((a, r) => a + r.ownLosses, 0);
    L.push(
      `### Obtížnost rizika: ${risk === 'low' ? 'nízké' : risk === 'normal' ? 'normální' : 'vysoké'}`,
      '',
      `Míra výher ${pct(wins / Math.max(1, fights))}, zničení vlastní lodi ${pct(lost / Math.max(1, fights))}, průměrná kořist na souboj ${(loot / Math.max(1, fights)).toFixed(0)} kr, průměrné náklady ${(bills / Math.max(1, fights)).toFixed(0)} kr, čistý výsledek na souboj ${((loot - bills) / Math.max(1, fights)).toFixed(0)} kr.`,
      '',
    );
    if (risk === 'normal') {
      L.push(
        '| Protivník | Úroveň | Výhry | Kořist/souboj | Náklady/souboj | Čisté |',
        '|---|---:|---:|---:|---:|---:|',
      );
      for (const r of rows) {
        const f = Math.max(1, r.fights);
        const bill = (r.repair + r.missiles * MISSILE_COST) / f;
        L.push(
          `| ${r.enemy} | ${r.tier} | ${pct(r.wins / f)} | ${(r.loot / f).toFixed(0)} | ${bill.toFixed(0)} | ${(r.loot / f - bill).toFixed(0)} |`,
        );
      }
      L.push('');
    }
  }
  // weapon by difficulty
  L.push('### Míra výher podle výzbroje a obtížnosti (proti střetům)', '');
  L.push('| Výzbroj | nízké riziko | normální | vysoké |', '|---|---:|---:|---:|');
  for (const a of ARCHETYPES) {
    const cells = (['low', 'normal', 'high'] as const).map((risk) => {
      const rows = lootEconomics(a, risk, Math.max(2, Math.floor(o.lootFights / 2)));
      return (
        rows.reduce((x, r) => x + r.wins, 0) /
        Math.max(
          1,
          rows.reduce((x, r) => x + r.fights, 0),
        )
      );
    });
    L.push(`| ${a} | ${cells.map(pct).join(' | ')} |`);
  }
  L.push('');
  return L;
}
