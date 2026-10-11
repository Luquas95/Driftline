import { describe, expect, it } from 'vitest';
import { TECHS, TECHS_BY_ID, MODULE_TECH } from '../src/content/tech';
import { MODULES_BY_ID } from '../src/content/modules';
import { HULLS_BY_ID } from '../src/content/hulls';
import {
  addResearchPoints,
  availableTechs,
  canResearch,
  hasTech,
  labRate,
  moduleUnlocked,
  researchDaily,
  startResearch,
} from '../src/core/research';
import { refreshShop } from '../src/core/shop';
import { galaxyOf } from '../src/core/state';
import { isKnown, learningOrder, understanding, WORD_COUNT } from '../src/core/lang';
import { passTime } from '../src/core/time';
import { mk } from './helpers';

describe('research: data', () => {
  it('has a consistent tree: known prerequisites, no cycles, valid gated modules and hulls', () => {
    for (const t of TECHS) {
      for (const r of t.requires) expect(TECHS_BY_ID[r]).toBeDefined();
      for (const m of t.modules ?? []) expect(MODULES_BY_ID[m]).toBeDefined();
    }
    // depth via DFS (cycle check)
    const depth = (id: string, seen: string[] = []): number => {
      expect(seen).not.toContain(id);
      const t = TECHS_BY_ID[id];
      return t.requires.length ? 1 + Math.max(...t.requires.map((r) => depth(r, [...seen, id]))) : 0;
    };
    for (const t of TECHS) depth(t.id);
    for (const h of Object.values(HULLS_BY_ID)) if (h.tech) expect(TECHS_BY_ID[h.tech]).toBeDefined();
    expect(Object.keys(MODULE_TECH).length).toBeGreaterThan(10);
    expect(TECHS.length).toBeGreaterThanOrEqual(24);
  });
});

describe('research: progress', () => {
  it('needs prerequisites, spends points on the active technology and completes it', () => {
    const s = mk('RES1');
    expect(startResearch(s, 'jump_2')).toMatchObject({ ok: false, error: 'err.techLocked' });
    expect(canResearch(s, 'fusion_2')).toBe(true);
    expect(startResearch(s, 'fusion_2').ok).toBe(true);
    addResearchPoints(s, 200);
    for (let i = 0; i < 20 && !hasTech(s, 'fusion_2'); i++) researchDaily(s);
    expect(hasTech(s, 'fusion_2')).toBe(true);
    expect(s.research.active).toBeNull();
    expect(canResearch(s, 'jump_2')).toBe(true);
    expect(availableTechs(s).some((t) => t.id === 'jump_2')).toBe(true);
    expect(startResearch(s, 'fusion_2')).toMatchObject({ ok: false, error: 'err.techDone' });
  });

  it('the lab produces points while time passes', () => {
    const s = mk('RES2');
    expect(labRate(s)).toBe(0);
    s.base = {
      systemId: 0,
      bodyIndex: 0,
      kind: 'station',
      name: 'B',
      founded: 0,
      buildings: { lab: 3 },
      queue: [],
      storage: {},
      treasury: 0,
      lines: [],
      orders: [],
      autoSell: {},
      hangar: [],
      attack: null,
      log: [],
      lastTick: 0,
      stats: { produced: 0, sold: 0, fleetIncome: 0, upkeep: 0, attacks: 0, repelled: 0 },
    };
    s.credits = 1e6;
    expect(labRate(s)).toBeGreaterThan(8);
    startResearch(s, 'deep_scan');
    for (let i = 0; i < 40; i++) {
      s.ship.supplies = 1000;
      passTime(s, 1);
    }
    expect(hasTech(s, 'deep_scan')).toBe(true);
  });

  it('completion effects: words, mitigation of the Grey', () => {
    const s = mk('RES3');
    s.research.done.push('deep_scan');
    startResearch(s, 'xeno_1');
    addResearchPoints(s, 500);
    for (let i = 0; i < 20; i++) researchDaily(s);
    expect(s.lang.learned).toBe(10);
    startResearch(s, 'xeno_2');
    addResearchPoints(s, 500);
    for (let i = 0; i < 30; i++) researchDaily(s);
    expect(s.lang.learned).toBe(24);
    expect(s.threat.mitigation).toBeCloseTo(0.04, 5);
  });

  it('gated modules appear in shops only after the research', () => {
    const s = mk('RES4', 300);
    const g = galaxyOf(s);
    const st = g.systems
      .flatMap((x) => x.stations)
      .find((x) => x.type === 'trade_hub' || x.type === 'industrial')!;
    expect(moduleUnlocked(s, 'kinetic_l')).toBe(false);
    const gated = new Set(Object.keys(MODULE_TECH));
    let seenGated = false;
    for (let e = 0; e < 40; e++) {
      s.day = e * 10;
      s.stations[st.id].shop.epoch = -1;
      refreshShop(s, st);
      if (s.stations[st.id].shop.modules.some((m) => gated.has(m.defId))) seenGated = true;
    }
    expect(seenGated).toBe(false);
    s.research.done.push('kinetics_2', 'energy_2', 'fusion_2');
    expect(moduleUnlocked(s, 'kinetic_l')).toBe(true);
  });
});

describe('language', () => {
  it('learns in a seeded order, deterministic per galaxy', () => {
    const a = mk('LANG1');
    const b = mk('LANG1');
    const c = mk('LANG2');
    expect(learningOrder(a.seed)).toEqual(learningOrder(b.seed));
    expect(learningOrder(a.seed)).not.toEqual(learningOrder(c.seed));
    expect(learningOrder(a.seed).length).toBe(WORD_COUNT);
    expect(isKnown(a, 'light')).toBe(false);
    expect(understanding(a)).toBe(0);
  });
});
