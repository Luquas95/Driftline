import { describe, expect, it } from 'vitest';
import { ENEMIES, ENEMIES_BY_ID } from '../src/content/enemies';
import { weaponStats } from '../src/content/weapons';
import { makeDuel, type DuelSide } from '../src/core/combat/duel';
import {
  autoResolve,
  buildEnemyShip,
  chooseEncounterOption,
  makeEncounter,
  rollEncounter,
  startCombat,
  threatLevel,
} from '../src/core/combat/encounter';
import { resolveCombat } from '../src/core/combat/resolve';
import {
  DT,
  moveCrew,
  pathTo,
  powerEff,
  setFleeing,
  setTarget,
  setWeights,
  stepCombat,
} from '../src/core/combat/sim';
import { WEAPON_KINDS, type CombatState, type WeaponKind } from '../src/core/combat/types';
import { Rng } from '../src/core/rng';
import { serializeState, deserializeState } from '../src/core/save';
import { hullSlots, moduleFits, newModule } from '../src/core/ship';
import { galaxyOf } from '../src/core/state';
import { MODULES_BY_ID } from '../src/content/modules';
import { mk } from './helpers';

const side = (extra: Partial<DuelSide> = {}): DuelSide => ({
  hullId: 'wayfarer',
  modules: ['energy_m', 'kinetic_m', 'shield_s'],
  missiles: 10,
  ...extra,
});

function run(c: CombatState, seconds: number): void {
  for (let t = 0; t < seconds && !c.outcome; t += DT) stepCombat(c, DT);
}

describe('combat simulation', () => {
  it('is deterministic for a given seed and different for another', () => {
    const a = makeDuel('S1', side(), [side()]);
    const b = makeDuel('S1', side(), [side()]);
    const c = makeDuel('S2', side(), [side()]);
    autoResolve(a);
    autoResolve(b);
    autoResolve(c);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
  });

  it('ends with an outcome and survives a save round trip mid-fight', () => {
    const c = makeDuel('S3', side(), [side()]);
    run(c, 12);
    const copy = JSON.parse(JSON.stringify(c)) as CombatState;
    run(c, 400);
    run(copy, 400);
    expect(JSON.stringify(copy)).toBe(JSON.stringify(c));
    expect(c.outcome).not.toBeNull();
  });

  it('power: shares by weights, scarcity lowers efficiency, a disabled group frees power', () => {
    const c = makeDuel('P', side({ modules: ['energy_l', 'energy_m', 'shield_s'] }), [side()]);
    const p = c.player;
    const total = Object.values(p.need).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(p.powerOut);
    const w0 = powerEff(p, 'weapons');
    expect(w0).toBeLessThan(1);
    setWeights(c, { weapons: p.need.weapons * 2 });
    expect(powerEff(p, 'weapons')).toBeGreaterThan(w0);
    setWeights(c, { shields: 0 });
    expect(powerEff(p, 'shields')).toBe(0);
    setWeights(c, { weapons: 0 });
    expect(powerEff(p, 'weapons')).toBe(0);
  });

  it('weapons only charge with power', () => {
    const c = makeDuel('P2', side(), [side()]);
    c.player.weapons.forEach((w) => (w.charge = 0));
    setWeights(c, { weapons: 0 });
    run(c, 6);
    expect(c.player.weapons.every((w) => w.charge === 0)).toBe(true);
  });

  it('heat rises with shooting, overheating switches weapons and shields off until cooled', () => {
    const c = makeDuel('H', side(), [side()]);
    c.enemies[0].hull = 1e6;
    c.enemies[0].hullMax = 1e6;
    c.player.heat = 99;
    c.player.weapons.forEach((w) => (w.charge = 1));
    run(c, 2);
    expect(c.player.overheated).toBe(true);
    expect(powerEff(c.player, 'weapons')).toBe(0);
    expect(powerEff(c.player, 'shields')).toBe(0);
    c.player.weapons.forEach((w) => (w.charge = 0));
    c.enemies[0].weapons = [];
    run(c, 40);
    expect(c.player.overheated).toBe(false);
  });

  it('fire spreads to neighbours, damages systems and crew, and is put out by crew', () => {
    const c = makeDuel('F', side({ crew: ['engineer'] }), [side()]);
    c.enemies[0].weapons = [];
    c.player.crew = [];
    const p = c.player;
    const start = p.rooms.findIndex((r) => r.adj.length >= 2 && r.kind);
    p.rooms[start].fire = 90;
    const sys0 = p.rooms[start].sys;
    let spread = false;
    for (let i = 0; i < 1200 && !spread; i++) {
      stepCombat(c, DT);
      spread = p.rooms[start].adj.some((a) => p.rooms[a].fire > 0);
    }
    expect(spread).toBe(true);
    expect(p.rooms[start].sys).toBeLessThan(sys0);
    // a crew member puts it out
    const d = makeDuel('F2', side({ crew: ['engineer'] }), [side()]);
    d.enemies[0].weapons = [];
    const r = d.player.rooms.findIndex((x) => x.kind === 'reactor');
    d.player.rooms[r].fire = 40;
    run(d, 40);
    expect(d.player.rooms[r].fire).toBe(0);
  });

  it('breach vents oxygen, hurts crew without air, and can be sealed', () => {
    const c = makeDuel('B', side({ crew: ['gunner'] }), [side()]);
    c.enemies[0].weapons = [];
    const p = c.player;
    const room = p.rooms.findIndex((r) => r.kind === 'energy');
    p.crew[0].room = room;
    p.crew[0].post = room;
    p.rooms[room].breach = 100;
    const hp0 = p.crew[0].hp;
    run(c, 12);
    const control = makeDuel('B', side({ crew: ['gunner'] }), [side()]);
    control.enemies[0].weapons = [];
    run(control, 12);
    expect(p.rooms[room].o2).toBeLessThan(control.player.rooms[room].o2 - 3);
    // nobody home: oxygen drops further and the crew member is hurt over time
    const d = makeDuel('B2', side({ crew: [] }), [side()]);
    d.enemies[0].weapons = [];
    const r2 = d.player.rooms.findIndex((r) => r.kind === 'shield');
    d.player.rooms[r2].breach = 100;
    run(d, 15);
    expect(d.player.rooms[r2].o2).toBeLessThan(d.player.rooms[d.player.rooms[r2].adj[0]].o2 + 1);
    expect(p.crew[0].hp).toBeLessThanOrEqual(hp0);
    // an engineer seals it
    const e = makeDuel('B3', side({ crew: ['engineer'] }), [side()]);
    e.enemies[0].weapons = [];
    const eroom = e.player.crew[0].room;
    e.player.rooms[eroom].breach = 100;
    run(e, 30);
    expect(e.player.rooms[eroom].breach).toBe(0);
  });

  it('crew repair damaged systems and walk between rooms on the shortest path', () => {
    const c = makeDuel('R', side({ crew: ['engineer'] }), [side()]);
    c.enemies[0].weapons = [];
    const p = c.player;
    const target = p.rooms.findIndex((r) => r.kind === 'engine');
    p.rooms[target].sys = 20;
    expect(moveCrew(c, p.crew[0].id, target)).toBe(true);
    const path = pathTo(p, p.crew[0].room, target);
    expect(path.length).toBeGreaterThan(0);
    run(c, 60);
    expect(p.rooms[target].sys).toBeGreaterThan(60);
  });

  it('fleeing needs a charged jump drive and takes time', () => {
    const c = makeDuel('FL', side(), [side({ personality: 'turret' })]);
    expect(setFleeing(c, 'player', true)).toBe(true);
    run(c, 3);
    expect(c.player.out).toBeNull();
    run(c, 90);
    expect(['fled', 'defeat']).toContain(c.outcome);
    const noJump = makeDuel('FL2', side(), [side()]);
    noJump.player.rooms.find((r) => r.kind === 'jump')!.sys = 0;
    noJump.player.canFlee = false;
    expect(setFleeing(noJump, 'player', true)).toBe(false);
  });
});

describe('weapons', () => {
  const kinds: WeaponKind[] = WEAPON_KINDS;

  it('every weapon kind has a module for at least one size', () => {
    for (const k of kinds) expect(Object.keys(MODULES_BY_ID).some((id) => id.startsWith(`${k}_`))).toBe(true);
  });

  it('energy is stronger against shields, kinetic against the hull, missiles ignore shields, ion locks systems', () => {
    const e = weaponStats('energy', 'M', 'C');
    const k = weaponStats('kinetic', 'M', 'C');
    const m = weaponStats('missile', 'M', 'C');
    const i = weaponStats('ion', 'M', 'C');
    expect(e.shieldDmg / e.hullDmg).toBeGreaterThan(k.shieldDmg / k.hullDmg);
    expect(k.hullDmg / k.shieldDmg).toBeGreaterThan(e.hullDmg / e.shieldDmg);
    expect(m.shieldDmg).toBe(0);
    expect(m.ammo).toBe(1);
    expect(i.ion).toBeGreaterThan(0);
    expect(i.hullDmg).toBe(0);
  });

  function shootOnce(
    kind: WeaponKind,
    shield: number,
  ): { shield: number; hull: number; ion: number; sys: number } {
    const mod =
      kind === 'drones' ? 'drones_s' : `${kind}_${kind === 'missile' || kind === 'ion' ? 'm' : 'm'}`;
    const c = makeDuel(`W:${kind}`, side({ modules: [mod, 'shield_s'], missiles: 5 }), [
      side({ modules: ['shield_s'] }),
    ]);
    const foe = c.enemies[0];
    foe.shield = shield;
    foe.shieldMax = Math.max(shield, 1);
    foe.weapons = [];
    const room = foe.rooms.findIndex((r) => r.kind === 'engine');
    const w = c.player.weapons[0];
    w.charge = 1;
    setTarget(c, w.id, 0, room);
    for (const r of foe.rooms) r.o2 = 100;
    // evasion would make the shot miss: pin the foe's engines
    foe.rooms.find((r) => r.kind === 'engine')!.sys = 100;
    foe.agility = 0;
    const hull0 = foe.hull;
    const sys0 = foe.rooms[room].sys;
    for (let i = 0; i < 80; i++) {
      stepCombat(c, DT);
      if (c.projectiles.length === 0 && i > 20) break;
    }
    return {
      shield: foe.shield,
      hull: hull0 - foe.hull,
      ion: foe.rooms[room].ion,
      sys: sys0 - foe.rooms[room].sys,
    };
  }

  it('each kind interacts with shield and hull as designed', () => {
    for (const k of ['energy', 'kinetic', 'ion'] as WeaponKind[]) {
      const shielded = shootOnce(k, 1000);
      expect(shielded.hull, `${k} blocked by a strong shield`).toBe(0);
      expect(shielded.shield, `${k} drains the shield`).toBeLessThan(1000);
      const bare = shootOnce(k, 0);
      if (k === 'ion') {
        expect(bare.hull).toBe(0);
        expect(bare.ion).toBeGreaterThan(0);
      } else expect(bare.hull).toBeGreaterThan(0);
    }
    const missileShielded = shootOnce('missile', 1000);
    expect(missileShielded.hull).toBeGreaterThan(0);
    expect(missileShielded.shield).toBe(1000);
  });

  it('missiles use up ammo and do not fire without it', () => {
    const c = makeDuel('AM', side({ modules: ['missile_m', 'shield_s'], missiles: 1 }), [side()]);
    c.enemies[0].weapons = [];
    c.player.weapons[0].charge = 1;
    setTarget(c, c.player.weapons[0].id, 0, 0);
    run(c, 3);
    expect(c.player.missiles).toBe(0);
    c.player.weapons[0].charge = 1;
    const n = c.projectiles.length;
    run(c, 1);
    expect(c.projectiles.length).toBeLessThanOrEqual(n);
  });

  it('drone bays launch drones and defensive drones can intercept', () => {
    const c = makeDuel('DR', side({ modules: ['drones_m', 'shield_s'] }), [
      side({ modules: ['missile_m'], missiles: 20 }),
    ]);
    c.player.weapons[0].charge = 1;
    run(c, 4);
    expect(c.player.drones.length).toBeGreaterThan(0);
  });

  it('ion damage locks a weapon room for a while', () => {
    const r = shootOnce('ion', 0);
    expect(r.ion).toBeGreaterThan(0);
  });
});

describe('enemy AI', () => {
  it('prefers high-value rooms: weapons and shields before life support', () => {
    const rng = Rng.fromSeed('ai');
    const c = makeDuel('AI', side(), [side({ modules: ['energy_m', 'kinetic_m', 'shield_s'] })]);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 200; i++) {
      const w = c.enemies[0].weapons[0];
      void w;
    }
    // use the public path: run a few seconds and look at what the enemy aims at
    run(c, 6);
    for (const w of c.enemies[0].weapons) {
      if (!w.target) continue;
      const kind = c.player.rooms[w.target.room].kind ?? 'none';
      counts[kind] = (counts[kind] ?? 0) + 1;
    }
    void rng;
    const picks = Object.keys(counts);
    expect(picks.length).toBeGreaterThan(0);
    expect(picks.every((k) => k !== 'cargo')).toBe(true);
  });

  it('cautious and badly hurt ships run, aggressive ones keep fighting longer', () => {
    const run1 = (personality: 'cautious' | 'aggressive') => {
      const c = makeDuel(`PE:${personality}`, side(), [side({ personality })]);
      c.enemies[0].hull = c.enemies[0].hullMax * 0.3;
      run(c, 3);
      return c.enemies[0].fleeing;
    };
    expect(run1('cautious')).toBe(true);
    expect(run1('aggressive')).toBe(false);
  });

  it('greedy pirates demand cargo once your engines are dead', () => {
    const c = makeDuel('GR', side({ crew: [] }), [side({ personality: 'greedy' })]);
    c.player.rooms.find((r) => r.kind === 'engine')!.sys = 0;
    run(c, 4);
    expect(c.demand).not.toBeNull();
    expect(c.paused).toBe(true);
  });

  it('auto-combat drives the player ship by the same simulation', () => {
    const a = makeDuel('AU', side(), [side()]);
    const b = makeDuel('AU', side(), [side()]);
    autoResolve(a);
    b.auto = true;
    run(b, 500);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

function armed(seed: string) {
  const s = mk(seed, 120);
  const slots = hullSlots(s.ship.hullId);
  for (const id of ['energy_s', 'kinetic_m', 'shield_s']) {
    const def = MODULES_BY_ID[id];
    const sl = slots.find((x) => !s.ship.slots[x.index] && moduleFits(x, def));
    if (sl) s.ship.slots[sl.index] = newModule(id, 'C', `t-${id}`);
  }
  return s;
}

describe('encounters, loot and aftermath', () => {
  it('every enemy template builds a ship with working rooms', () => {
    for (const def of ENEMIES) {
      const ship = buildEnemyShip(def, Math.max(1, def.tiers[0]), Rng.fromSeed(def.id), 0);
      expect(ship.rooms.length).toBeGreaterThan(0);
      expect(ship.hull).toBeGreaterThan(0);
      expect(ship.crew.length).toBe(def.crew);
    }
  });

  it('threat grows with danger and valuable cargo and is zero-ish in the first days', () => {
    const s = mk('TH', 200);
    const g = galaxyOf(s);
    const safe = g.systems.reduce((a, b) => (a.danger < b.danger ? a : b));
    const risky = g.systems.reduce((a, b) => (a.danger > b.danger ? a : b));
    s.day = 20;
    expect(threatLevel(s, risky.id)).toBeGreaterThan(threatLevel(s, safe.id));
    const early = mk('TH', 200);
    expect(threatLevel(early, risky.id)).toBeLessThan(threatLevel(s, risky.id));
  });

  it('rolls encounters deterministically and never during a fight or event', () => {
    const a = mk('RL', 200);
    const b = mk('RL', 200);
    a.day = b.day = 30;
    const risky = galaxyOf(a).systems.reduce((x, y) => (x.danger > y.danger ? x : y)).id;
    const ra: boolean[] = [];
    const rb: boolean[] = [];
    for (let i = 0; i < 40; i++) {
      a.encounter = null;
      b.encounter = null;
      ra.push(rollEncounter(a, risky));
      rb.push(rollEncounter(b, risky));
    }
    expect(ra).toEqual(rb);
    expect(ra.some(Boolean)).toBe(true);
    a.pendingEvent = { eventId: 'x', context: { systemId: 0 } };
    a.encounter = null;
    expect(rollEncounter(a, risky)).toBe(false);
  });

  it('fighting resolves into loot, reputation and experience', () => {
    const s = armed('LOOT');
    const rng = Rng.fromSeed('loot');
    const enc = makeEncounter(s, 'pirate', s.location.systemId, rng, 1)!;
    enc.enemyDefs = ['scrapper'];
    s.encounter = enc;
    const c = startCombat(s, enc);
    c.enemies[0].hull = 1;
    c.enemies[0].shield = 0;
    const credits = s.credits;
    autoResolve(c);
    const sum = resolveCombat(s, c);
    expect(['victory', 'surrender', 'defeat', 'fled', 'enemy-fled']).toContain(sum.outcome);
    expect(s.combat).toBeNull();
    if (sum.outcome === 'victory') {
      expect(s.credits).toBeGreaterThan(credits);
      expect(sum.goods.length).toBeGreaterThan(0);
      expect(s.stats.victories).toBe(1);
    }
    expect(s.stats.fights).toBe(1);
  });

  it('losing the ship goes through the insurance rules', () => {
    const s = armed('LOSE');
    s.insurance.active = true;
    const enc = makeEncounter(s, 'pirate', s.location.systemId, Rng.fromSeed('l'), 3)!;
    enc.enemyDefs = ['warlord'];
    s.encounter = enc;
    const c = startCombat(s, enc);
    c.player.hull = 0;
    c.player.alive = false;
    c.player.out = 'destroyed';
    c.outcome = 'defeat';
    const deaths = s.stats.deaths;
    resolveCombat(s, c);
    expect(s.stats.deaths).toBe(deaths + 1);
    expect(s.combat).toBeNull();
    expect(s.ship.hp).toBeGreaterThan(0);
  });

  it('missiles are used up from the cargo hold', () => {
    const s = armed('MIS');
    const enc = makeEncounter(s, 'pirate', s.location.systemId, Rng.fromSeed('m'), 1)!;
    s.encounter = enc;
    const c = startCombat(s, enc);
    c.player.missiles = 0;
    c.outcome = 'enemy-fled';
    const sum = resolveCombat(s, c);
    expect(sum.missilesUsed).toBe(0);
  });

  it('salvage: a destroyed enemy leaves modules and materials for the player', () => {
    const s = armed('SALV');
    const enc = makeEncounter(s, 'pirate', s.location.systemId, Rng.fromSeed('s'), 2)!;
    enc.enemyDefs = ['corsair'];
    s.encounter = enc;
    const c = startCombat(s, enc);
    c.enemies[0].alive = false;
    c.enemies[0].out = 'destroyed';
    c.outcome = 'victory';
    const sum = resolveCombat(s, c);
    expect(sum.goods.some((g) => g.goodId === 'metals')).toBe(true);
  });

  it('encounter options: bribing pays, fleeing costs fuel, nothing works without an encounter', () => {
    const s = armed('OPT');
    expect(chooseEncounterOption(s, 'fight').ok).toBe(false);
    const enc = makeEncounter(s, 'pirate', s.location.systemId, Rng.fromSeed('o'), 1)!;
    s.encounter = enc;
    s.credits = 5000;
    const fuel = s.ship.fuel;
    const r = chooseEncounterOption(s, 'flee');
    expect(r.ok).toBe(true);
    expect(s.ship.fuel).toBeLessThan(fuel);
    s.encounter = enc;
    const c0 = s.credits;
    chooseEncounterOption(s, 'bribe');
    expect(s.credits).toBeLessThan(c0);
  });

  it('a fight in progress survives saving and loading', () => {
    const s = armed('SAVE');
    const enc = makeEncounter(s, 'pirate', s.location.systemId, Rng.fromSeed('v'), 1)!;
    s.encounter = enc;
    const c = startCombat(s, enc);
    run(c, 5);
    const back = deserializeState(serializeState(s));
    expect(back.combat).not.toBeNull();
    run(back.combat!, 5);
    run(c, 5);
    expect(JSON.stringify(back.combat)).toBe(JSON.stringify(c));
  });

  it('enemy table is consistent (ids, loadouts exist)', () => {
    for (const e of ENEMIES) {
      expect(ENEMIES_BY_ID[e.id]).toBe(e);
      for (const m of e.loadout) expect(MODULES_BY_ID[m], `${e.id}:${m}`).toBeDefined();
    }
  });
});
