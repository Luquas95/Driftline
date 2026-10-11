import { useState } from 'preact/hooks';
import { BUILDINGS } from '../../content/buildings';
import {
  baseServiceCost,
  checkBuilding,
  collectTreasury,
  defendBase,
  defenseRating,
  hangarSlots,
  inBaseSystem,
  levelOf,
  refuelAtBase,
  repairAtBase,
  resupplyAtBase,
  startBuilding,
  storageCapacity,
  storageUsed,
  transferGoods,
  upkeepPerDay,
} from '../../core/base';
import { unitsOf } from '../../core/cargo';
import { galaxyOf } from '../../core/state';
import { createBackdropScene } from '../../render/backdrop';
import { t, fmt, money } from '../../i18n';
import { Bar, Btn, Empty, Panel, Stat, Tabs, Tag } from '../components';
import { act, describeMessage, game, report, rev, screen } from '../store';
import { useScene } from '../useScene';
import { BaseView } from './BaseView';
import { BaseFleet } from './BaseFleet';
import { BaseProduction } from './BaseProduction';
import { BaseResearch } from './BaseResearch';

type Tab = 'overview' | 'buildings' | 'production' | 'storage' | 'research' | 'fleet';

function Overview() {
  const s = game.value!;
  const base = s.base!;
  const here = inBaseSystem(s);
  const cost = baseServiceCost(s);
  return (
    <div class="stack">
      <BaseView base={base} seed={s.seed} />
      <div class="stats-row">
        <Stat label={t('ui3.treasury')} value={money(Math.round(base.treasury))} icon="credits" />
        <Stat label={t('ui3.upkeep')} value={`${money(upkeepPerDay(base))}/${t('top.dayShort')}`} />
        <Stat label={t('ui3.defense')} value={fmt(defenseRating(s), 1)} icon="shield" />
        <Stat
          label={t('ui3.storage')}
          value={`${fmt(storageUsed(base), 0)}/${fmt(storageCapacity(base), 0)}`}
        />
      </div>
      <div class="row wrap">
        <Btn
          small
          kind="good"
          disabled={!here || base.treasury < 1}
          testid="base-collect"
          onClick={() => report(act((st) => collectTreasury(st)))}
        >
          {t('ui3.collect')}
        </Btn>
        <Btn small disabled={!here || cost.fuel <= 0} onClick={() => report(act((st) => refuelAtBase(st)))}>
          {t('ui3.refuel')} · {money(cost.fuel)}
        </Btn>
        <Btn
          small
          disabled={!here || cost.supplies <= 0}
          onClick={() => report(act((st) => resupplyAtBase(st)))}
        >
          {t('ui3.resupply')} · {money(cost.supplies)}
        </Btn>
        <Btn
          small
          disabled={!here || levelOf(base, 'shipyard') < 1}
          onClick={() => report(act((st) => repairAtBase(st)))}
        >
          {t('ui3.repair')}
        </Btn>
      </div>
      {!here && <p class="explain">{t('ui3.notAtBase', { sys: galaxyOf(s).systems[base.systemId].name })}</p>}
      {base.attack && (
        <div class="contract-card" data-testid="base-attack">
          <b class="neg">
            {t('ui3.attack', { n: base.attack.strength, day: Math.ceil(base.attack.resolve) })}
          </b>
          <Btn small kind="danger" disabled={!here} onClick={() => report(act((st) => defendBase(st)))}>
            {t('ui3.defend')}
          </Btn>
        </div>
      )}
      <h4>{t('ui3.baseLog')}</h4>
      {base.log.length === 0 && <Empty>{t('ui3.none')}</Empty>}
      <ul class="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 3 }}>
        {[...base.log]
          .reverse()
          .slice(0, 8)
          .map((l, i) => (
            <li key={i} class="dim">
              <span class="mono">{Math.floor(l.day)}</span> · {describeMessage(`ui3.log.${l.key}`, l.params)}
            </li>
          ))}
      </ul>
    </div>
  );
}

function Buildings() {
  const s = game.value!;
  const base = s.base!;
  const here = inBaseSystem(s);
  return (
    <div class="stack" data-testid="base-buildings">
      <p class="faint">
        {t('ui3.hangarSlots', { n: hangarSlots(base) })} · {t('ui3.queue', { n: base.queue.length })}
      </p>
      {BUILDINGS.map((b) => {
        const lvl = levelOf(base, b.id);
        const q = base.queue.find((x) => x.id === b.id);
        const chk = checkBuilding(s, b.id);
        return (
          <div key={b.id} class="contract-card" data-testid={`bld-${b.id}`}>
            <div class="spread">
              <b>
                {t(`bld.${b.id}`)} <span class="dim">· {t('ui3.level', { n: lvl, max: b.maxLevel })}</span>
              </b>
              {q ? (
                <Tag>{t('ui3.building', { day: Math.ceil(q.done) })}</Tag>
              ) : (
                <Btn
                  small
                  kind="primary"
                  testid={`build-${b.id}`}
                  disabled={!here || !chk.ok}
                  onClick={() => report(act((st) => startBuilding(st, b.id)))}
                >
                  {lvl === 0 ? t('ui3.build') : t('ui3.upgrade')}
                </Btn>
              )}
            </div>
            <div class="dim" style={{ fontSize: 12.5 }}>
              {t(`bld.${b.id}.desc`)}
            </div>
            {q && <Bar value={s.day - q.start} max={Math.max(1, q.done - q.start)} />}
            {!q && lvl < b.maxLevel && (
              <div class="faint" style={{ fontSize: 12 }}>
                {money(chk.credits)} · {chk.days} {t('ui3.daysShort')} ·{' '}
                {Object.entries(chk.materials)
                  .map(([g, n]) => `${n}× ${t(`good.${g}`)}`)
                  .join(', ')}
                {!chk.ok && chk.error && <span class="neg"> · {t(chk.error)}</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Storage() {
  const s = game.value!;
  const base = s.base!;
  const here = inBaseSystem(s);
  const inShip = [...new Set(s.cargo.map((c) => c.goodId))].filter((g) => unitsOf(s.cargo, g) > 0);
  const stored = Object.entries(base.storage).filter(([, n]) => n >= 0.5);
  const [qty, setQty] = useState(10);
  return (
    <div class="stack" data-testid="base-storage">
      <Bar value={storageUsed(base)} max={storageCapacity(base)} />
      <label class="field">
        {t('ui3.amount')}
        <input
          type="number"
          min={1}
          value={qty}
          onInput={(e) => setQty(Math.max(1, Number((e.target as HTMLInputElement).value) || 1))}
          style={{ maxWidth: 100 }}
        />
      </label>
      <div class="two-col">
        <div class="stack">
          <h4>{t('ui3.inShip')}</h4>
          {inShip.length === 0 && <Empty>{t('ui3.none')}</Empty>}
          {inShip.map((g) => (
            <div key={g} class="spread">
              <span>
                {t(`good.${g}`)} <span class="mono dim">{unitsOf(s.cargo, g)}</span>
              </span>
              <Btn
                small
                disabled={!here}
                testid={`to-base-${g}`}
                onClick={() => report(act((st) => transferGoods(st, g, qty, 'toBase')))}
              >
                →
              </Btn>
            </div>
          ))}
        </div>
        <div class="stack">
          <h4>{t('ui3.inBase')}</h4>
          {stored.length === 0 && <Empty>{t('ui3.none')}</Empty>}
          {stored.map(([g, n]) => (
            <div key={g} class="spread">
              <Btn
                small
                disabled={!here}
                onClick={() => report(act((st) => transferGoods(st, g, qty, 'toShip')))}
              >
                ←
              </Btn>
              <span>
                {t(`good.${g}`)} <span class="mono dim">{fmt(n, 0)}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function BaseScreen() {
  void rev.value;
  useScene(() => createBackdropScene({ tint: 3 }), []);
  const s = game.value!;
  const base = s.base;
  const [tab, setTab] = useState<Tab>('overview');
  if (!base) {
    return (
      <div class="screen" data-testid="screen-base">
        <Panel title={t('ui3.baseTitle')} icon="station">
          <p class="explain">{t('ui3.noBaseHelp')}</p>
          <Btn onClick={() => (screen.value = 'system')}>{t('nav.system')}</Btn>
        </Panel>
      </div>
    );
  }
  return (
    <div class="screen" data-testid="screen-base">
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <Panel title={base.name} icon="station" class="flush">
          <Tabs
            tabs={[
              { id: 'overview', label: t('ui3.tab.overview'), icon: 'info' },
              { id: 'buildings', label: t('ui3.tab.buildings'), icon: 'wrench', badge: base.queue.length },
              { id: 'production', label: t('ui3.tab.production'), icon: 'cargo', badge: base.orders.length },
              { id: 'storage', label: t('ui3.tab.storage'), icon: 'cargo' },
              { id: 'research', label: t('ui3.tab.research'), icon: 'scan' },
              { id: 'fleet', label: t('ui3.tab.fleet'), icon: 'ship', badge: base.hangar.length },
            ]}
            value={tab}
            onChange={setTab}
          />
          <div class="panel-body">
            {tab === 'overview' && <Overview />}
            {tab === 'buildings' && <Buildings />}
            {tab === 'production' && <BaseProduction />}
            {tab === 'storage' && <Storage />}
            {tab === 'research' && <BaseResearch />}
            {tab === 'fleet' && <BaseFleet />}
          </div>
        </Panel>
      </div>
    </div>
  );
}
