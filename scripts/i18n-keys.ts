/* Lists every i18n key the code can request. Used by tests/i18n.test.ts and to bootstrap the dictionary. */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { GOODS } from '../src/content/goods';
import { HULLS } from '../src/content/hulls';
import { MODULES } from '../src/content/modules';
import { STATION_TYPES } from '../src/content/stations';
import { CHAINS } from '../src/content/chains';
import { MARKET_EVENTS } from '../src/content/marketEvents';

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(f)) out.push(p);
  }
  return out;
}

export function requiredKeys(): Map<string, string> {
  const keys = new Map<string, string>();
  const add = (k: string, from: string) => {
    if (!keys.has(k)) keys.set(k, from);
  };
  for (const file of walk('src')) {
    if (
      file.includes('i18n/') ||
      file.includes('/content/') ||
      file.includes('/sim/') ||
      file.includes('render/gallery')
    )
      continue;
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) add(m[1], file);
    if (file.includes('src/core/') || file.includes('src/ui/')) {
      for (const m of text.matchAll(/'((?:err|msg)\.[A-Za-z0-9_.]+)'/g)) add(m[1], file);
    }
    for (const m of text.matchAll(/`((?:err|msg)\.[A-Za-z0-9_.]+)`/g)) add(m[1], file);
    for (const m of text.matchAll(/label: '([a-z]+\.[a-zA-Z0-9_.]+)'/g)) add(m[1], file);
  }
  for (const g of GOODS) add(`good.${g.id}`, 'goods');
  for (const h of HULLS) {
    add(`hull.${h.id}`, 'hulls');
    add(`hull.${h.id}.desc`, 'hulls');
  }
  for (const k of new Set(MODULES.map((m) => m.kind))) add(`mod.${k}`, 'modules');
  for (const st of STATION_TYPES) add(`st.${st.id}`, 'stations');
  for (const c of CHAINS) {
    add(`chain.${c.id}.title`, 'chains');
    c.steps.forEach((_, i) => add(`chain.${c.id}.${i}.text`, 'chains'));
  }
  for (const e of MARKET_EVENTS) add(`msg.market.${e.kind}`, 'marketEvents');
  for (const r of ['core', 'inner', 'outer', 'rim']) add(`region.${r}`, 'region');
  for (const z of ['small', 'medium', 'large']) add(`size.${z}`, 'size');
  for (const b of ['rocky', 'desert', 'ocean', 'ice', 'volcanic', 'gas', 'dead', 'belt', 'moon'])
    add(`body.${b}`, 'body');
  for (const tg of ['chilled', 'hazardous', 'illegal', 'perishable', 'sensitive']) add(`tag.${tg}`, 'tag');
  for (const k of ['freight', 'courier', 'passenger', 'survey', 'supply', 'rescue']) {
    add(`contract.kind.${k}`, 'contract');
    add(`contract.desc.${k}`, 'contract');
  }
  add('contract.desc.surveyBody', 'contract');
  for (const v of ['easy', 'normal', 'hard']) add(`diff.prices.${v}`, 'diff');
  for (const v of ['low', 'normal', 'high']) add(`diff.risk.${v}`, 'diff');
  for (const v of ['auto', 'reduced', 'full']) add(`settings.motion.${v}`, 'settings');
  for (const v of ['normal', 'high']) add(`settings.contrast.${v}`, 'settings');
  for (const v of ['low', 'mid', 'high']) add(`map.risk.${v}`, 'map');
  for (const i of [0, 1, 2]) add(`sys.int${i}`, 'sys');
  for (const m of ['laser', 'scoop', 'drill']) add(`sys.method.${m}`, 'sys');
  for (const i of [0, 1, 2]) add(`contract.rescue${i}`, 'contract');
  for (let i = 0; i < 5; i++) add(`tut.step${i}`, 'tutorial');
  for (const m of ['jumpMissing', 'reactorMissing', 'engineMissing', 'power']) add(`err.${m}`, 'ship');
  for (const ignore of ['msg.contract', 'msg.market']) keys.delete(ignore);
  return keys;
}
