import { useState } from 'preact/hooks';
import { planTrip, protectionOf, renameFleetShip, setFleetOrder, switchShip } from '../../core/fleet';
import { galaxyOf } from '../../core/state';
import { t, fmt, money } from '../../i18n';
import { Btn, Empty, Tag } from '../components';
import { act, game, report, rev } from '../store';
import type { FleetShip } from '../../core/worldTypes';
import { MARKET_GOODS } from '../../content/goods';

const ORDERS: FleetShip['order'][] = ['idle', 'trade', 'escort', 'guard'];

function ShipCard({ fs }: { fs: FleetShip }) {
  const s = game.value!;
  const g = galaxyOf(s);
  const stations = Object.keys(s.prices)
    .map((id) => g.stationsById[id])
    .filter((x) => x && x.type !== 'pirate');
  const [from, setFrom] = useState(fs.route?.from ?? stations[0]?.id ?? '');
  const [to, setTo] = useState(fs.route?.to ?? stations[1]?.id ?? '');
  const [good, setGood] = useState<string>(fs.route?.goodId ?? '');
  const [name, setName] = useState(fs.name);
  const route = { from, to, goodId: good || null };
  const plan = from && to && from !== to ? planTrip(s, fs, route, Math.max(0, s.base!.treasury)) : null;
  return (
    <div class="contract-card stack" data-testid={`fleet-${fs.id}`}>
      <div class="spread">
        <b>
          {fs.name} <span class="dim">· {t(`hull.${fs.ship.hullId}`)}</span>
        </b>
        <span class="dim">
          {t('ui3.protection')} {Math.round(protectionOf(fs) * 100)} %
        </span>
      </div>
      <div class="seg">
        {ORDERS.map((o) => (
          <button
            key={o}
            type="button"
            class={fs.order === o ? 'active' : ''}
            data-testid={`fleet-order-${o}`}
            onClick={() =>
              report(act((st) => setFleetOrder(st, fs.id, o, o === 'trade' ? route : undefined)))
            }
          >
            {t(`ui3.order.${o}`)}
          </button>
        ))}
      </div>
      <div class="faint" style={{ fontSize: 12.5 }}>
        {t(`ui3.order.${fs.order}.desc`)}
      </div>
      <div class="route-builder">
        <select
          value={from}
          aria-label={t('ui3.from')}
          onChange={(e) => setFrom((e.target as HTMLSelectElement).value)}
          data-testid="route-from"
        >
          {stations.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <select
          value={to}
          aria-label={t('ui3.to')}
          onChange={(e) => setTo((e.target as HTMLSelectElement).value)}
          data-testid="route-to"
        >
          {stations.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <select
          value={good}
          aria-label={t('market.good')}
          onChange={(e) => setGood((e.target as HTMLSelectElement).value)}
        >
          <option value="">{t('ui3.bestGood')}</option>
          {MARKET_GOODS.map((x) => (
            <option key={x.id} value={x.id}>
              {t(`good.${x.id}`)}
            </option>
          ))}
        </select>
      </div>
      {plan && (
        <div class={plan.ok ? 'dim' : 'neg'} data-testid="route-plan" style={{ fontSize: 13 }}>
          {plan.ok
            ? t('ui3.planLine', {
                good: t(`good.${plan.goodId}`),
                units: plan.units,
                net: money(Math.round(plan.net)),
                days: Math.ceil(plan.days),
                risk: Math.round(plan.risk * (1 - plan.protection) * 100),
              })
            : t(plan.error ?? 'err.badRoute')}
        </div>
      )}
      {fs.trip && (
        <Tag>
          {t('ui3.onTrip', { day: Math.ceil(fs.trip.end), profit: money(fs.trip.profit - fs.trip.cost) })}
        </Tag>
      )}
      <div class="dim" style={{ fontSize: 12.5 }}>
        {t('ui3.fleetEarned', { n: money(Math.round(fs.earned)), trips: fs.trips })}
      </div>
      <div class="row">
        <Btn
          small
          testid="fleet-set-route"
          disabled={!plan}
          onClick={() => report(act((st) => setFleetOrder(st, fs.id, 'trade', route)))}
        >
          {t('ui3.setRoute')}
        </Btn>
        <Btn small testid="fleet-switch" onClick={() => report(act((st) => switchShip(st, fs.id)))}>
          {t('ui3.switchShip')}
        </Btn>
        <input
          type="text"
          value={name}
          maxLength={24}
          style={{ maxWidth: 150 }}
          aria-label={t('menu.shipName')}
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
          onBlur={() => name !== fs.name && report(act((st) => renameFleetShip(st, fs.id, name)))}
        />
      </div>
    </div>
  );
}

export function BaseFleet() {
  void rev.value;
  const base = game.value!.base!;
  return (
    <div class="stack" data-testid="base-fleet">
      <p class="explain">{t('ui3.fleetHelp')}</p>
      {base.hangar.length === 0 && <Empty>{t('ui3.noFleet')}</Empty>}
      {base.hangar.map((fs) => (
        <ShipCard key={fs.id} fs={fs} />
      ))}
      <p class="faint">
        {t('ui3.fleetIncome', { n: money(Math.round(base.stats.fleetIncome)) })} · {fmt(base.hangar.length)}
      </p>
    </div>
  );
}
