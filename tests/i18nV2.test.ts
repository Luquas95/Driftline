import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../src/content/enemies';
import { EVENT_TEXTS_CS, EVENTS } from '../src/content/events';
import { OFFICERS, RACES, ROLES, SKILLS } from '../src/content/crew';
import { cs } from '../src/i18n/cs';

describe('v2 dictionary', () => {
  it('has texts for races, roles, skills, officers, enemies and every event text', () => {
    const need: string[] = [];
    for (const r of RACES) need.push(`race.${r.id}`);
    for (const r of ROLES) need.push(`role.${r}`);
    for (const k of SKILLS) need.push(`skill.${k}`, `skill.${k}.desc`);
    for (const o of OFFICERS) need.push(`officer.${o.id}.desc`);
    for (const e of ENEMIES) need.push(`enemy.${e.id}`, `combat.pers.${e.personality}`);
    for (const e of EVENTS) {
      need.push(e.titleKey, e.textKey);
      for (const c of e.choices) {
        need.push(c.textKey);
        for (const o of c.outcomes) need.push(o.textKey);
      }
    }
    expect(need.filter((k) => !(k in cs) && !(k in EVENT_TEXTS_CS))).toEqual([]);
  });

  it('has every combat log, encounter and result key used in code', () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d, { withFileTypes: true })) {
        const p = `${d}/${f.name}`;
        if (f.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(f.name)) files.push(p);
      }
    };
    walk('src/core/combat');
    walk('src/ui');
    const keys = new Set<string>();
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      for (const m of text.matchAll(/'((?:combat|enc)\.[A-Za-z0-9_.-]+)'/g)) keys.add(m[1]);
    }
    for (const o of ['fight', 'flee', 'bribe', 'negotiate', 'pay', 'evade']) keys.add(`enc.opt.${o}`);
    for (const k of ['pirate', 'hunter', 'customs', 'wreck', 'fauna'])
      keys.add(`enc.${k}.title`).add(`enc.${k}.text`);
    for (const o of ['victory', 'defeat', 'fled', 'surrender', 'tribute', 'enemy-fled']) {
      keys.add(`combat.outcome.${o}`);
      keys.add(`combat.result.${o}`);
      keys.add(`combat.result.${o}.text`);
    }
    for (const r of [
      'fight',
      'fled',
      'fleeFailed',
      'bribed',
      'bribeFailed',
      'negotiated',
      'negotiateFailed',
      'paid',
      'evaded',
      'evadeFailed',
    ])
      keys.add(`enc.result.${r}`);
    for (const g of ['weapons', 'shields', 'engines', 'life', 'other']) keys.add(`combat.pg.${g}`);
    for (const t of ['idle', 'repair', 'fire', 'breach', 'heal', 'fight', 'man'])
      keys.add(`combat.task.${t}`);
    for (const o of ['destroyed', 'fled', 'surrendered']) keys.add(`combat.out.${o}`);
    const missing = [...keys].filter((k) => !(k in cs) && !/[.-]$/.test(k));
    expect(missing).toEqual([]);
  });
});
