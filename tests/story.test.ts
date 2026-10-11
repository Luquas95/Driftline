import { describe, expect, it } from 'vitest';
import { EVENT_TEXTS_CS, EVENTS_BY_ID } from '../src/content/events';
import { STORY_BEATS } from '../src/content/story';
import { ARTIFACT_EVENTS } from '../src/core/galaxy';
import { checkBuilding, commissionHull, foundBase, hangarSlots, startBuilding } from '../src/core/base';
import { addMerit, addRep, joinFaction, ownerOf } from '../src/core/factions';
import { choiceAvailable, evalCond, resolveEvent } from '../src/core/events';
import { learnWords, WORD_COUNT } from '../src/core/lang';
import { addResearchPoints, canResearch, hasTech, researchDaily, startResearch } from '../src/core/research';
import { rollStory } from '../src/core/story';
import { galaxyOf } from '../src/core/state';
import { passTime } from '../src/core/time';
import { exploreAnomaly, scanSurface } from '../src/core/exploration';
import { mk } from './helpers';
import type { GameState } from '../src/core/types';

const TECH_ORDER = [
  'deep_scan',
  'xeno_1',
  'xeno_2',
  'xeno_3',
  'resonance',
  'null_field',
  'fusion_2',
  'anchor_array',
  'jump_2',
  'mass_prod',
  'logistics',
  'exodus_drive',
  'accord_protocol',
  'grey_decode',
];

function research(s: GameState, ids: string[]): void {
  for (const id of ids) {
    if (hasTech(s, id)) continue;
    expect(canResearch(s, id)).toBe(true);
    expect(startResearch(s, id).ok).toBe(true);
    addResearchPoints(s, 2000);
    for (let i = 0; i < 80 && !hasTech(s, id); i++) researchDaily(s);
    expect(hasTech(s, id)).toBe(true);
  }
}

/** Walk to a state where a beat is pending and answer it with the first available choice (or `pick`). */
function beat(s: GameState, trigger: 'dock' | 'arrival', id: string, pick = 0): void {
  // other beats that are due first (e.g. the local faction's) are answered with their first available choice
  for (let guard = 0; guard < 12; guard++) {
    s.pendingEvent = null;
    const got = rollStory(s, trigger, { systemId: s.location.systemId });
    expect(got, `no beat for ${id}`).toBe(true);
    const cur = s.pendingEvent!.eventId;
    const ev = EVENTS_BY_ID[cur];
    if (cur === id) {
      expect(choiceAvailable(s, ev, pick)).toBe(true);
      expect(resolveEvent(s, pick).ok).toBe(true);
      return;
    }
    const first = ev.choices.findIndex((_, i) => choiceAvailable(s, ev, i));
    expect(resolveEvent(s, first).ok).toBe(true);
  }
  throw new Error(`beat ${id} never came`);
}

function place(s: GameState, systemId: number): void {
  s.location = { systemId, stationId: null, body: -1 };
}

function freshGame(seed: string): GameState {
  const s = mk(seed, 300);
  s.credits = 2_000_000;
  s.day = 40;
  s.lastEconDay = 40;
  return s;
}

/** The common opening of the main line, answered with sensible choices. */
function opening(s: GameState): void {
  const g = galaxyOf(s);
  const home = s.location.systemId;
  beat(s, 'dock', 'st_signal');
  expect(s.story.stage).toBe(1);
  // a gripped system for "Vybledlá hvězda"
  const gripped = g.systems.find((x) => x.id !== home)!;
  s.threat.grip[gripped.id] = 12;
  place(s, gripped.id);
  beat(s, 'arrival', 'st_pale');
  expect(s.story.stage).toBe(2);
  place(s, home);
  addRep(s, 'lumen', 12, false);
  beat(s, 'dock', 'st_lumen');
  expect(s.story.stage).toBe(3);
  // dead zone
  s.threat.grip[gripped.id] = 100;
  s.threat.consumed = 4;
  s.story.stage = 2;
  place(s, gripped.id);
  beat(s, 'arrival', 'st_dead', 2);
  expect(s.story.stage).toBe(3);
  s.story.stage = 3;
  learnWords(s, Math.ceil(WORD_COUNT * 0.5));
  place(s, home);
  beat(s, 'dock', 'st_sentence');
  expect(s.story.stage).toBe(4);
  s.story.artifacts = 1;
  beat(s, 'dock', 'st_paths');
  expect(s.story.stage).toBe(5);
}

describe('story: data', () => {
  it('every beat and artifact has an event with text, and all endings are reachable beats', () => {
    for (const b of STORY_BEATS) {
      expect(EVENTS_BY_ID[b.id], b.id).toBeDefined();
      expect(EVENT_TEXTS_CS[`ev.${b.id}.title`]).toBeTruthy();
    }
    for (const id of ARTIFACT_EVENTS) expect(EVENTS_BY_ID[id]).toBeDefined();
    const endings = STORY_BEATS.filter((b) => b.id.startsWith('end_'));
    expect(endings.length).toBeGreaterThanOrEqual(4);
  });

  it('story events never appear in the random pool', () => {
    for (const b of STORY_BEATS) expect(EVENTS_BY_ID[b.id].weight).toBe(0);
    for (const id of ARTIFACT_EVENTS) expect(EVENTS_BY_ID[id].weight).toBe(0);
  });

  it('artifacts lie hidden on bodies and exploring them gives words, research and a slower Grey', () => {
    const s = freshGame('STORYA');
    const g = galaxyOf(s);
    const sys = g.systems.find((x) =>
      x.bodies.some((b) => b.anomalies.some((a) => ARTIFACT_EVENTS.includes(a.eventId))),
    )!;
    expect(sys).toBeDefined();
    const total = g.systems.reduce(
      (n, x) =>
        n +
        x.bodies.reduce(
          (m, b) => m + b.anomalies.filter((a) => ARTIFACT_EVENTS.includes(a.eventId)).length,
          0,
        ),
      0,
    );
    expect(total).toBeGreaterThanOrEqual(8);
    const body = sys.bodies.find((b) => b.anomalies.some((a) => ARTIFACT_EVENTS.includes(a.eventId)))!;
    const a = body.anomalies.find((x) => ARTIFACT_EVENTS.includes(x.eventId))!;
    place(s, sys.id);
    s.detected[sys.id] = sys.bodies.map((b) => b.id);
    s.bodies[body.id] = {
      surface: true,
      probed: false,
      mined: {},
      minedDay: {},
      revealed: [a.id],
      anomaliesDone: [],
    };
    expect(exploreAnomaly(s, body.index, a.id).ok).toBe(true);
    expect(s.pendingEvent?.eventId).toBe(a.eventId);
    const before = s.story.artifacts;
    const m0 = s.threat.mitigation;
    expect(resolveEvent(s, 0).ok).toBe(true);
    expect(s.story.artifacts).toBe(before + 1);
    expect(s.threat.mitigation).toBeGreaterThan(m0);
    void scanSurface;
  });
});

describe('story: every ending can be reached', () => {
  it('Kotva (science): research, anchor on the base, artifacts, language', () => {
    const s = freshGame('STORYS');
    const g = galaxyOf(s);
    opening(s);
    // a base in a free system
    const sys = g.systems.find((x) => ownerOf(s, x.id) === null && x.bodies.length >= 3)!;
    place(s, sys.id);
    s.detected[sys.id] = sys.bodies.map((b) => b.id);
    s.cargo.push({
      uid: 'c1',
      goodId: 'construction',
      qty: 40,
      w: 2,
      h: 2,
      x: 0,
      y: 0,
      cost: 0,
      acquiredDay: 0,
    });
    s.cargo.push({
      uid: 'c2',
      goodId: 'machinery',
      qty: 12,
      w: 2,
      h: 2,
      x: 2,
      y: 0,
      cost: 0,
      acquiredDay: 0,
    });
    expect(foundBase(s, 0, 'Maják').ok).toBe(true);
    Object.assign(s.base!.storage, {
      construction: 2000,
      machinery: 800,
      electronics: 400,
      computers: 200,
      alloys: 300,
    });
    research(
      s,
      TECH_ORDER.filter((x) => x !== 'exodus_drive'),
    );
    s.base!.buildings.lab = 2;
    expect(checkBuilding(s, 'anchor').ok).toBe(true);
    expect(startBuilding(s, 'anchor').ok).toBe(true);
    for (let i = 0; i < 80; i++) {
      s.ship.supplies = 1000;
      passTime(s, 1);
    }
    expect(s.base!.buildings.anchor).toBeGreaterThanOrEqual(1);
    s.story.artifacts = 3;
    learnWords(s, WORD_COUNT);
    s.pendingEvent = null;
    // "Zapnout Kotvu"
    beat(s, 'arrival', 'end_science', 0);
    expect(s.ending).toMatchObject({ id: 'science', freePlay: true });
    expect(s.threat.stopped).toBe(true);
    expect(s.threat.mitigation).toBeGreaterThan(0.5);
  });

  it('Dohoda (accord): the language, the protocol and a gripped system', () => {
    const s = freshGame('STORYC');
    opening(s);
    research(s, ['deep_scan', 'xeno_1', 'xeno_2', 'xeno_3', 'accord_protocol']);
    learnWords(s, WORD_COUNT);
    s.story.artifacts = 2;
    const g = galaxyOf(s);
    const sys = g.systems[(s.location.systemId + 3) % g.systems.length];
    s.threat.grip[sys.id] = 50;
    place(s, sys.id);
    beat(s, 'arrival', 'end_accord', 0);
    expect(s.ending).toMatchObject({ id: 'accord', freePlay: true });
  });

  it('Exodus: the ark, a fleet of three and the drive', () => {
    const s = freshGame('STORYE');
    const g = galaxyOf(s);
    opening(s);
    const sys = g.systems.find((x) => ownerOf(s, x.id) === null && x.bodies.length >= 3)!;
    place(s, sys.id);
    s.detected[sys.id] = sys.bodies.map((b) => b.id);
    s.cargo.push({
      uid: 'c1',
      goodId: 'construction',
      qty: 40,
      w: 2,
      h: 2,
      x: 0,
      y: 0,
      cost: 0,
      acquiredDay: 0,
    });
    s.cargo.push({
      uid: 'c2',
      goodId: 'machinery',
      qty: 12,
      w: 2,
      h: 2,
      x: 2,
      y: 0,
      cost: 0,
      acquiredDay: 0,
    });
    foundBase(s, 0, 'Archa');
    research(s, ['deep_scan', 'fusion_2', 'jump_2', 'mass_prod', 'logistics', 'exodus_drive']);
    Object.assign(s.base!.buildings, { shipyard: 3, hangar: 4, warehouse: 3 });
    expect(hangarSlots(s.base!)).toBe(5);
    Object.assign(s.base!.storage, { construction: 3000, machinery: 1500, electronics: 600, alloys: 900 });
    s.credits = 5_000_000;
    for (const hull of ['ark', 'mule', 'mule', 'mule']) {
      expect(commissionHull(s, hull).ok).toBe(true);
      for (let i = 0; i < 90 && s.base!.orders.length; i++) {
        s.ship.supplies = 1000;
        passTime(s, 1);
      }
    }
    expect(s.base!.hangar.length).toBe(4);
    beat(s, 'arrival', 'end_exodus', 0);
    expect(s.ending).toMatchObject({ id: 'exodus', freePlay: false });
  });

  it('Pax Halcyon (dominion): rank 5 in the consortium, wealth and a port', () => {
    const s = freshGame('STORYD');
    const g = galaxyOf(s);
    opening(s);
    addRep(s, 'consortium', 60, false);
    expect(joinFaction(s, 'consortium').ok).toBe(true);
    addMerit(s, 'consortium', 5000);
    expect(s.fac.rank).toBe(5);
    s.base = {
      systemId: 0,
      bodyIndex: 0,
      kind: 'station',
      name: 'B',
      founded: 0,
      buildings: { port: 3, warehouse: 1 },
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
    const sysC = g.systems.find((x) => ownerOf(s, x.id) === 'consortium')!;
    place(s, sysC.id);
    expect(evalCond(s, { t: 'creditsMin', n: 350000 })).toBe(true);
    beat(s, 'dock', 'end_dominion', 0);
    expect(s.ending).toMatchObject({ id: 'dominion', freePlay: true });
  });

  it('declining an ending brings it back later; endings stop after one has happened', () => {
    const s = freshGame('STORYX');
    opening(s);
    research(s, ['deep_scan', 'xeno_1', 'xeno_2', 'xeno_3', 'accord_protocol']);
    learnWords(s, WORD_COUNT);
    s.story.artifacts = 2;
    const sys = galaxyOf(s).systems[(s.location.systemId + 5) % 300];
    s.threat.grip[sys.id] = 50;
    place(s, sys.id);
    beat(s, 'arrival', 'end_accord', 2); // "Mlčet"
    expect(s.ending).toBeNull();
    expect(rollStory(s, 'arrival', { systemId: sys.id })).toBe(false);
    s.day += 30;
    expect(rollStory(s, 'arrival', { systemId: sys.id })).toBe(true);
  });
});
