import { describe, expect, it } from 'vitest';
import { EVENTS } from '../src/content/events';
import { acceptContract } from '../src/core/contractOps';
import { makeContract } from '../src/core/contracts';
import {
  bodyDyn,
  depositDecay,
  exploreAnomaly,
  mine,
  mineMethodFor,
  salvage,
  scanSurface,
  scanSystem,
  sellDiscoveries,
  systemSurveyValue,
  travelToBody,
  bodyAu,
} from '../src/core/exploration';
import { Rng } from '../src/core/rng';
import { hullSlots, newModule } from '../src/core/ship';
import { analyze, galaxyOf } from '../src/core/state';
import { unitsOf } from '../src/core/cargo';
import type { BodyStatic, GameState } from '../src/core/types';
import { mk } from './helpers';

function equip(s: GameState, ...defs: string[]) {
  for (const d of defs) {
    const kind = d.split('_')[0];
    const size = d.split('_')[1].toUpperCase();
    const slot = hullSlots(s.ship.hullId).find(
      (x) =>
        !x.core &&
        !s.ship.slots[x.index] &&
        (x.size === size || (size === 'S' && x.size !== 'L') || (size === 'M' && x.size === 'L')),
    );
    if (!slot) throw new Error(`no slot for ${d}`);
    s.ship.slots[slot.index] = newModule(d, 'C', `eq-${kind}-${slot.index}`);
  }
}

function findBody(s: GameState, kinds: string[]): { sysId: number; body: BodyStatic } {
  const g = galaxyOf(s);
  for (const sys of g.systems)
    for (const b of sys.bodies)
      if (kinds.includes(b.kind) && b.deposits.length) return { sysId: sys.id, body: b };
  throw new Error('no body');
}

function goTo(s: GameState, sysId: number) {
  s.location = { systemId: sysId, stationId: null, body: -1 };
  if (!s.visited.includes(sysId)) s.visited.push(sysId);
}

describe('exploration', () => {
  it('system scan reveals bodies by sensor power and creates a discovery', () => {
    const s = mk('EXP1');
    const { sysId } = findBody(s, ['belt', 'rocky', 'gas']);
    goTo(s, sysId);
    const r = scanSystem(s);
    expect(r.ok).toBe(true);
    expect(s.discoveries.some((d) => d.id === `sys:${sysId}`)).toBe(true);
    // second scan does not duplicate the discovery
    scanSystem(s);
    expect(s.discoveries.filter((d) => d.id === `sys:${sysId}`)).toHaveLength(1);
    expect(s.day).toBeGreaterThan(0);
  });

  it('better sensors reveal harder-to-find bodies', () => {
    const s = mk('EXP2');
    const g = galaxyOf(s);
    const sys = g.systems.find((x) => x.bodies.some((b) => b.scanDifficulty >= 2))!;
    goTo(s, sys.id);
    scanSystem(s);
    const weak = (s.detected[sys.id] ?? []).length;
    const sensors = s.ship.slots.findIndex((m) => m?.defId.startsWith('sensors'));
    s.ship.slots[sensors]!.quality = 'A';
    scanSystem(s);
    expect((s.detected[sys.id] ?? []).length).toBeGreaterThanOrEqual(weak);
  });

  it('surface scan needs a scanner, reveals deposits and consumes time', () => {
    const s = mk('EXP3');
    const { sysId, body } = findBody(s, ['rocky', 'desert', 'belt', 'dead', 'ice']);
    goTo(s, sysId);
    scanSystem(s);
    s.detected[sysId] = galaxyOf(s).systems[sysId].bodies.map((b) => b.id);
    expect(scanSurface(s, body.index).ok).toBe(false);
    equip(s, 'surface_m');
    const day = s.day;
    const r = scanSurface(s, body.index);
    expect(r.ok).toBe(true);
    expect(s.day).toBeGreaterThan(day);
    expect(bodyDyn(s, body.id).revealed.length).toBeGreaterThan(0);
    expect(scanSurface(s, 99).ok).toBe(false);
  });

  it('probes reveal everything and are consumed', () => {
    const s = mk('EXP4');
    const { sysId, body } = findBody(s, ['rocky', 'desert', 'dead', 'ice', 'volcanic', 'moon']);
    goTo(s, sysId);
    s.detected[sysId] = galaxyOf(s).systems[sysId].bodies.map((b) => b.id);
    equip(s, 'probe_s');
    expect(scanSurface(s, body.index, true).ok).toBe(false);
    s.ship.probes = 2;
    expect(scanSurface(s, body.index, true).ok).toBe(true);
    expect(s.ship.probes).toBe(1);
    expect(bodyDyn(s, body.id).revealed.length).toBe(body.deposits.length + body.anomalies.length);
  });

  it('mining yields shrink with repeated extraction and grow with intensity', () => {
    const s = mk('MINE1');
    const { sysId, body } = findBody(s, ['belt']);
    goTo(s, sysId);
    s.detected[sysId] = galaxyOf(s).systems[sysId].bodies.map((b) => b.id);
    equip(s, 'laser_m', 'probe_s');
    s.ship.probes = 3;
    expect(mineMethodFor(body)).toBe('laser');
    scanSurface(s, body.index, true);
    const dep = body.deposits[0];
    s.ship.fuel = 80;
    const first = mine(s, body.index, dep.id, 0);
    expect(first.ok).toBe(true);
    const u1 = first.ok ? first.out.units : 0;
    for (let i = 0; i < 4; i++) mine(s, body.index, dep.id, 0);
    const later = mine(s, body.index, dep.id, 0);
    expect(later.ok && later.out.units).toBeLessThan(u1);
    expect(depositDecay(bodyDyn(s, body.id), dep.id, s.day)).toBeLessThan(1);
    // after a long pause the deposit recovers
    const decayNow = depositDecay(bodyDyn(s, body.id), dep.id, s.day);
    expect(depositDecay(bodyDyn(s, body.id), dep.id, s.day + 90)).toBeGreaterThan(decayNow);
    // intensity
    const t = mk('MINE2');
    const f = findBody(t, ['belt']);
    goTo(t, f.sysId);
    t.detected[f.sysId] = galaxyOf(t).systems[f.sysId].bodies.map((b) => b.id);
    equip(t, 'laser_m', 'probe_s');
    t.ship.probes = 2;
    scanSurface(t, f.body.index, true);
    t.ship.fuel = 80;
    const lo = mine(t, f.body.index, f.body.deposits[0].id, 0);
    const t2 = structuredClone(t);
    t2.rng = structuredClone(t.rng);
    const hi = mine(t2, f.body.index, f.body.deposits[0].id, 2);
    expect(hi.ok && lo.ok && hi.out.units > lo.out.units).toBe(true);
  });

  it('higher intensity costs more fuel and carries more risk', () => {
    const run = (intensity: 0 | 1 | 2) => {
      let damage = 0;
      let fuelUsed = 0;
      for (let k = 0; k < 40; k++) {
        const s = mk(`RISK${k}`);
        const f = findBody(s, ['belt']);
        goTo(s, f.sysId);
        s.detected[f.sysId] = galaxyOf(s).systems[f.sysId].bodies.map((b) => b.id);
        equip(s, 'laser_m', 'probe_s');
        s.ship.probes = 2;
        scanSurface(s, f.body.index, true);
        s.ship.fuel = 80;
        const fuel0 = s.ship.fuel;
        const hp0 = s.ship.hp;
        const r = mine(s, f.body.index, f.body.deposits[0].id, intensity);
        if (r.ok) {
          damage += hp0 - s.ship.hp;
          fuelUsed += fuel0 - s.ship.fuel;
        }
      }
      return { damage, fuelUsed };
    };
    const low = run(0);
    const high = run(2);
    expect(high.fuelUsed).toBeGreaterThan(low.fuelUsed);
    expect(high.damage).toBeGreaterThanOrEqual(low.damage);
  });

  it('refinery turns ore into a denser, more valuable product', () => {
    const s = mk('REFINE');
    const g = galaxyOf(s);
    let found: { sysId: number; body: BodyStatic; depId: string } | null = null;
    for (const sys of g.systems)
      for (const b of sys.bodies)
        if (b.kind === 'belt')
          for (const d of b.deposits)
            if (d.goodId === 'iron_ore' && !found) found = { sysId: sys.id, body: b, depId: d.id };
    if (!found) return;
    goTo(s, found.sysId);
    s.detected[found.sysId] = g.systems[found.sysId].bodies.map((b) => b.id);
    equip(s, 'laser_m', 'probe_s', 'refinery_m');
    s.ship.slots[s.ship.slots.findIndex((m) => m?.defId.startsWith('reactor'))]!.quality = 'A';
    s.ship.probes = 2;
    s.ship.fuel = 80;
    scanSurface(s, found.body.index, true);
    const r = mine(s, found.body.index, found.depId, 1);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.out.refined).toBe(true);
      expect(r.out.goodId).toBe('metals');
      expect(unitsOf(s.cargo, 'metals')).toBeGreaterThan(0);
    }
  });

  it('mining validation errors', () => {
    const s = mk('MINEERR');
    const f = findBody(s, ['belt']);
    goTo(s, f.sysId);
    expect(mine(s, f.body.index, f.body.deposits[0].id, 0).ok).toBe(false); // unknown deposit
    bodyDyn(s, f.body.id).revealed.push(f.body.deposits[0].id);
    expect(mine(s, f.body.index, f.body.deposits[0].id, 0).ok).toBe(false); // no laser
    expect(mine(s, 99, 'x', 0).ok).toBe(false);
  });

  it('anomalies trigger data-driven events once', () => {
    const s = mk('ANOM');
    const g = galaxyOf(s);
    let found: { sysId: number; body: BodyStatic } | null = null;
    for (const sys of g.systems)
      for (const b of sys.bodies) if (b.anomalies.length && !found) found = { sysId: sys.id, body: b };
    expect(found).not.toBeNull();
    goTo(s, found!.sysId);
    s.detected[found!.sysId] = g.systems[found!.sysId].bodies.map((b) => b.id);
    const a = found!.body.anomalies[0];
    expect(exploreAnomaly(s, found!.body.index, a.id).ok).toBe(false);
    bodyDyn(s, found!.body.id).revealed.push(a.id);
    expect(exploreAnomaly(s, found!.body.index, a.id).ok).toBe(true);
    expect(s.pendingEvent?.eventId).toBe(a.eventId);
    s.pendingEvent = null;
    expect(exploreAnomaly(s, found!.body.index, a.id).ok).toBe(false);
  });

  it('survey and rescue contracts are completed by scanning and salvaging', () => {
    const s = mk('SURVEY', 150);
    const g = galaxyOf(s);
    const st = g.stationsById[s.location.stationId!];
    const sv = makeContract(g, s, st, Rng.fromSeed('sv'), { kind: 'survey' })!;
    const rs = makeContract(g, s, st, Rng.fromSeed('rs'), { kind: 'rescue' })!;
    for (const c of [sv, rs]) {
      s.stations[st.id].board.push(c);
      expect(acceptContract(s, st.id, c.id).ok).toBe(true);
    }
    goTo(s, sv.targetSystem!);
    scanSystem(s);
    if (!sv.targetBody) expect(s.contracts.find((c) => c.id === sv.id)!.progress).toBe(1);
    goTo(s, rs.targetSystem!);
    scanSystem(s);
    const rc = s.contracts.find((c) => c.id === rs.id)!;
    if ((rc.progress ?? 0) < 1) {
      s.detected[rs.targetSystem!] = g.systems[rs.targetSystem!].bodies.map((b) => b.id);
      equip(s, 'surface_s');
      scanSurface(s, g.systems[rs.targetSystem!].bodies.find((b) => b.id === rs.targetBody)!.index);
    }
    expect(rc.progress).toBeGreaterThanOrEqual(1);
    expect(salvage(s).ok).toBe(true);
    expect(rc.progress).toBe(2);
    expect(unitsOf(s.cargo, 'survivors', rc.id)).toBe(1);
  });

  it('selling survey data pays and cannot be repeated', () => {
    const s = mk('SELL');
    const f = findBody(s, ['belt', 'rocky']);
    goTo(s, f.sysId);
    scanSystem(s);
    const stn = Object.values(galaxyOf(s).stationsById)[0].id;
    const credits = s.credits;
    const r = sellDiscoveries(s, stn);
    expect(r.ok).toBe(true);
    expect(s.credits).toBeGreaterThan(credits);
    expect(sellDiscoveries(s, stn).ok).toBe(false);
    expect(sellDiscoveries(s, 'nope').ok).toBe(false);
    expect(systemSurveyValue(galaxyOf(s).systems[0])).toBeGreaterThan(0);
  });

  it('travel inside a system takes time that grows with mass', () => {
    const s = mk('TRAVEL');
    const g = galaxyOf(s);
    const sys = g.systems.find((x) => x.bodies.length >= 4)!;
    goTo(s, sys.id);
    const d0 = s.day;
    expect(travelToBody(s, 3).ok).toBe(true);
    const dt = s.day - d0;
    expect(dt).toBeGreaterThan(0);
    expect(bodyAu(sys, -1)).toBe(0.5);
    expect(bodyAu(sys, 3)).toBeGreaterThan(0);
    expect(analyze(s).stats.speedAuDay).toBeGreaterThan(0);
  });

  it('has at least 40 data-driven events with valid structure', () => {
    expect(EVENTS.length).toBeGreaterThanOrEqual(40);
    for (const e of EVENTS) {
      expect(e.choices.length).toBeGreaterThan(0);
      for (const c of e.choices) expect(c.outcomes.length).toBeGreaterThan(0);
    }
  });
});
