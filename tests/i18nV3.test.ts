import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/content/buildings';
import { EVENT_TEXTS_CS, EVENTS } from '../src/content/events';
import { FACTIONS, STANDING_TIERS } from '../src/content/factions';
import { HULLS } from '../src/content/hulls';
import { TECHS } from '../src/content/tech';
import { ENDINGS } from '../src/core/endings';
import { cs } from '../src/i18n/cs';

const has = (k: string) => k in cs || k in EVENT_TEXTS_CS;

describe('v3 dictionary', () => {
  it('has texts for factions, ranks, tiers, buildings, technologies, hulls and endings', () => {
    const need: string[] = [];
    for (const f of FACTIONS) {
      need.push(`fac.${f.id}`, `fac.${f.id}.desc`);
      for (let r = 0; r <= 5; r++) need.push(`fac.${f.id}.rank.${r}`);
    }
    for (const t of STANDING_TIERS) need.push(`fac.tier.${t.id}`);
    for (const b of BUILDINGS) need.push(`bld.${b.id}`, `bld.${b.id}.desc`);
    for (const t of TECHS) need.push(`tech.${t.id}`, `tech.${t.id}.desc`, `tech.branch.${t.branch}`);
    for (const h of HULLS) need.push(`hull.${h.id}`, `hull.${h.id}.desc`, `hull.role.${h.role}`);
    for (const e of ENDINGS) {
      need.push(`ending.${e.id}`, `ending.${e.id}.text`);
      for (let i = 0; i < 3; i++) need.push(`fate.${e.id}.${i}`);
    }
    expect(need.filter((k) => !has(k))).toEqual([]);
  });

  it('has a text for every decision the story can log and for every event text', () => {
    const keys = new Set<string>();
    for (const e of EVENTS)
      for (const c of e.choices)
        for (const o of c.outcomes) for (const fx of o.effects) if (fx.t === 'decide') keys.add(fx.key);
    expect(keys.size).toBeGreaterThanOrEqual(15);
    expect([...keys].filter((k) => !has(`story.dec.${k}`))).toEqual([]);
    const need: string[] = [];
    for (const e of EVENTS) {
      need.push(e.titleKey, e.textKey);
      for (const c of e.choices) {
        need.push(c.textKey);
        for (const o of c.outcomes) need.push(o.textKey);
      }
    }
    expect(need.filter((k) => !has(k))).toEqual([]);
  });

  it('has an ending stat label for every summary row', () => {
    for (const k of [
      'days',
      'jumps',
      'visited',
      'galaxy',
      'profit',
      'contracts',
      'discoveries',
      'fights',
      'victories',
      'deaths',
      'buildings',
      'fleet',
      'techs',
      'language',
      'artifacts',
      'consumed',
      'credits',
    ])
      expect(has(`ending.stat.${k}`), k).toBe(true);
  });
});
