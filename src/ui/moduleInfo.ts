import { MODULES_BY_ID, QUALITY } from '../content/modules';
import type { ModuleInstance, Quality } from '../core/types';
import { fmt, t } from '../i18n';

export function moduleName(defId: string): string {
  const d = MODULES_BY_ID[defId];
  return `${t(`mod.${d.kind}`)} ${d.size}`;
}

/** One-line primary stat of a module, quality included. */
export function moduleStat(defId: string, q: Quality): string {
  const d = MODULES_BY_ID[defId];
  const v = d.value * QUALITY[q].value;
  switch (d.kind) {
    case 'reactor':
      return `${fmt(v, 1)} ${t('unit.power')}`;
    case 'engine':
      return `${t('modstat.thrust')} ${fmt(v, 1)}`;
    case 'jump':
      return `${t('modstat.jumpEff')} ${fmt(v, 2)} · ${fmt((d.aux ?? 4) * (0.6 + 0.4 * QUALITY[q].value), 1)} ly/${t('unit.day')}`;
    case 'life':
      return `${Math.floor(v)} ${t('modstat.crew')}`;
    case 'sensors':
      return `${t('modstat.scan')} ${fmt(v, 1)} · ${fmt(5 + v * 2.2, 0)} ly`;
    case 'cargo':
      return `+${Math.round(v)} ${t('unit.cells')}`;
    case 'fuel':
      return `+${fmt(v, 0)} ${t('top.fuel').toLowerCase()}`;
    case 'cooler':
      return `${Math.round(v)} ${t('modstat.chilled')}`;
    case 'vault':
      return `${Math.round(v)} ${t('modstat.secure')}`;
    case 'laser':
      return `${fmt(v, 1)} ${t('unit.units')}/${t('unit.day')}`;
    case 'scoop':
      return `${fmt(v, 1)} ${t('unit.units')}/${t('unit.day')}`;
    case 'refinery':
      return `${fmt(v, 0)} ${t('unit.units')}/${t('unit.day')}`;
    case 'surface':
      return `${t('modstat.scan')} ${fmt(v, 1)}`;
    case 'probe':
      return `${t('modstat.drill')} ${fmt(v, 1)}`;
    case 'repair':
      return `${fmt(v, 1)} ${t('modstat.repairRate')}`;
    case 'shield':
      return `${fmt(v, 0)} ${t('modstat.shield')}`;
    case 'amplifier':
      return `+${Math.round(18 * QUALITY[q].value)} % ${t('modstat.neighbours')}`;
    case 'radiator':
      return `−${Math.round(25 * QUALITY[q].value)} % ${t('modstat.wearNeighbours')}`;
    case 'quarters':
      return `${Math.round(v)} ${t('modstat.beds')} · ${t('modstat.comfort')} ${d.aux}`;
  }
  return '';
}

export function modulePower(m: { defId: string; quality: Quality }): string {
  const d = MODULES_BY_ID[m.defId];
  if (d.kind === 'reactor') return '';
  const p = d.power * QUALITY[m.quality].power;
  return `${fmt(p, 1)} ${t('unit.power')}${d.powerMode === 'active' ? ` (${t('ship.whenUsed')})` : ''}`;
}

export function instanceLabel(m: ModuleInstance): string {
  return `${moduleName(m.defId)} ${m.quality}`;
}
