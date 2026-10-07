/**
 * Headless combat balance: AI-vs-AI duels over ship configurations, plus loot-versus-repair economics.
 * Used by `npm run balance` (section in docs/balance.md) and by tests.
 */
import { ENEMIES } from '../content/enemies';
import { MODULES_BY_ID } from '../content/modules';
import { WEAPON_SIZES } from '../content/weapons';
import { autoResolve, makeEncounter, startCombat } from '../core/combat/encounter';
import { makeDuel, type DuelSide } from '../core/combat/duel';
import { resolveCombat } from '../core/combat/resolve';
import type { WeaponKind } from '../core/combat/types';
import { moduleRepairCost, hullRepairCost } from '../core/game';
import { Rng } from '../core/rng';
import { hullSlots, newModule } from '../core/ship';
import { newGame } from '../core/start';
import { newUid, stationOf } from '../core/state';
import type { Size } from '../core/types';
import { analyze } from '../core/state';

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
    if (c.outcome === 'victory' || c.outcome === 'surrender') {
      r.win++;
      r.meanHullLeft += c.player.hull / c.player.hullMax;
    } else if (c.outcome === 'defeat') r.loss++;
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

/** Real game fights: the starter-class player ship with a given loadout against encounter enemies, then the bill. */
export function lootEconomics(arch: Archetype, risk: 'low' | 'normal' | 'high', n: number): LootStats[] {
  const out: LootStats[] = [];
  const pool = ENEMIES.filter((e) => e.kind === 'pirate' || e.kind === 'hunter');
  for (const def of pool) {
    for (const tier of [def.tiers[0], def.tiers[1]].filter((t, i, a) => a.indexOf(t) === i)) {
      const st: LootStats = { enemy: def.id, tier, fights: 0, wins: 0, loot: 0, repair: 0, missiles: 0 };
      for (let i = 0; i < n; i++) {
        const s = newGame({ seed: `LOOT-${def.id}-${tier}-${i}`, galaxySize: 60, difficulty: { risk } });
        s.ship.hullId = 'mule';
        s.ship.slots = hullSlots('mule').map(() => null);
        for (const sl of hullSlots('mule'))
          if (sl.core)
            s.ship.slots[sl.index] = newModule(
              `${{ r: 'reactor', e: 'engine', j: 'jump', l: 'life', n: 'sensors' }[sl.core[0]] ?? sl.core}_s`,
              'C',
              newUid(s, 'm'),
            );
        void analyze;
        for (const id of loadoutFor('mule', arch)) {
          const sl = hullSlots('mule').find(
            (x) => !s.ship.slots[x.index] && !x.core && RANK[MODULES_BY_ID[id].size] <= RANK[x.size],
          );
          if (sl) s.ship.slots[sl.index] = newModule(id, 'C', newUid(s, 'm'));
        }
        s.ship.hp = analyze(s).stats.hpMax;
        const rng = Rng.fromSeed(`enc:${def.id}:${tier}:${i}`);
        const enc = makeEncounter(s, def.kind, s.location.systemId, rng, tier);
        if (!enc) continue;
        enc.enemyDefs = [def.id];
        const c = startCombat(s, enc);
        autoResolve(c);
        const credits0 = s.credits;
        const sum = resolveCombat(s, c);
        st.fights++;
        if (sum.outcome === 'victory' || sum.outcome === 'surrender') st.wins++;
        st.loot += s.credits - credits0 + sum.goods.reduce((a, g) => a + g.qty * 8, 0);
        const sid = s.location.stationId;
        if (sid) {
          let bill = hullRepairCost(s, sid);
          s.ship.slots.forEach((_, k) => (bill += moduleRepairCost(s, sid, k)));
          st.repair += bill;
        }
        st.missiles += sum.missilesUsed;
        void stationOf;
      }
      out.push(st);
    }
  }
  return out;
}
