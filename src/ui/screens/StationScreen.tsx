import { useEffect, useState } from 'preact/hooks';
import { GOODS_BY_ID } from '../../content/goods';
import { STATION_TYPES_BY_ID } from '../../content/stations';
import { createBackdropScene } from '../../render/backdrop';
import { bestKnownPrice } from '../../core/advisor';
import { freshness, loadableUnits, unitsOf, daysLeft } from '../../core/cargo';
import {
  buyFuel,
  buyGoods,
  buyIntel,
  buyProbes,
  buySupplies,
  hullRepairCost,
  intelPrice,
  maxBuy,
  moduleRepairCost,
  quoteFor,
  repairAll,
  repairHull,
  repairModuleAt,
  sellGoods,
  serviceCost,
  stockOf,
  undock,
} from '../../core/game';
import { sellDiscoveries } from '../../core/exploration';
import { midPrice, goodCap } from '../../core/economy';
import { analyze, galaxyOf } from '../../core/state';
import { T } from '../../core/tuning';
import { describeMessage } from '../store';
import { MODULES_BY_ID } from '../../content/modules';
import { sfx } from '../../audio/audio';
import { fmt, money, t } from '../../i18n';
import { Bar, Btn, Delta, Empty, Modal, Panel, QualityBadge, Stat, Tabs, Tag } from '../components';
import { CategoryIcon, Icon } from '../Icon';
import { act, analysis, galaxy, game, report, rev, screen, flag, toast } from '../store';
import { useScene } from '../useScene';
import { ShipyardTab } from './ShipyardTab';
import { ContractsTab } from './ContractsTab';
import type { GameState, StationStatic } from '../../core/types';

type TabId = 'market' | 'shipyard' | 'repairs' | 'contracts' | 'cartography' | 'news';
let lastTab: TabId = 'market';

export function StationScreen() {
  void rev.value;
  const s = game.value!;
  const g = galaxy.value!;
  const [tab, setTabRaw] = useState<TabId>(lastTab);
  const setTab = (x: TabId) => {
    lastTab = x;
    setTabRaw(x);
  };
  const st = s.location.stationId ? g.stationsById[s.location.stationId] : null;
  const sys = st ? g.systems[st.systemId] : null;
  const body = st && sys ? sys.bodies[st.bodyIndex] : undefined;
  useScene(
    () =>
      st && sys
        ? createBackdropScene({
            body,
            station: st,
            spectral: sys.spectral,
            starSeed: sys.starSeed,
            tint: st.type.length,
          })
        : null,
    [st?.id],
  );
  if (!st || !sys) {
    return (
      <div class="screen">
        <Empty>{t('station.notDocked')}</Empty>
        <Btn onClick={() => (screen.value = 'map')}>{t('nav.map')}</Btn>
      </div>
    );
  }
  const def = STATION_TYPES_BY_ID[st.type];
  const dyn = s.stations[st.id];
  const active = s.contracts.filter((c) => c.state === 'active' && c.dest === st.id).length;
  const tabs: { id: TabId; label: string; icon: string; badge?: number }[] = [
    { id: 'market', label: t('station.market'), icon: 'market' },
    ...(def.shipyard > 0 ? [{ id: 'shipyard' as TabId, label: t('station.shipyard'), icon: 'ship' }] : []),
    { id: 'repairs', label: t('station.repairs'), icon: 'repair' },
    { id: 'contracts', label: t('station.contracts'), icon: 'contract', badge: dyn.board.length + active },
    { id: 'cartography', label: t('station.cartography'), icon: 'scan' },
    { id: 'news', label: t('station.news'), icon: 'info' },
  ];
  const cur = tabs.some((x) => x.id === tab) ? tab : 'market';
  return (
    <div class="screen" data-testid="screen-station">
      <div class="stack" style={{ maxWidth: 1100, margin: '0 auto' }}>
        <Panel class="flush">
          <div class="spread" style={{ flexWrap: 'wrap', padding: 12 }}>
            <div>
              <h2 style={{ fontSize: 20 }} data-testid="station-name">
                {st.name}
              </h2>
              <div class="row wrap" style={{ marginTop: 4 }}>
                <Tag tone="accent">{t(`st.${st.type}`)}</Tag>
                <Tag>{t(`size.${st.size}`)}</Tag>
                {st.colony && <Tag>{t('sys.colony')}</Tag>}
                {st.blackMarket && <Tag tone="warn">{t('station.blackMarket')}</Tag>}
                {!def.lawful && <Tag tone="bad">{t('sys.unlawful')}</Tag>}
                <Tag>
                  {t('station.rep')} {dyn.rep > 0 ? '+' : ''}
                  {dyn.rep}
                </Tag>
              </div>
              <p class="faint" style={{ margin: '6px 0 0', fontSize: 12.5 }}>
                {sys.name} · {t(`region.${sys.region}`)}
              </p>
            </div>
            <div class="row wrap">
              <Btn
                icon="jump"
                onClick={() => {
                  act((x) => undock(x));
                  screen.value = 'map';
                }}
                testid="btn-undock"
              >
                {t('station.undock')}
              </Btn>
            </div>
          </div>
          <Tabs tabs={tabs} value={cur} onChange={setTab} />
        </Panel>
        {cur === 'market' && <MarketTab s={s} st={st} />}
        {cur === 'shipyard' && <ShipyardTab st={st} />}
        {cur === 'repairs' && <RepairsTab s={s} st={st} />}
        {cur === 'contracts' && <ContractsTab st={st} />}
        {cur === 'cartography' && <CartographyTab s={s} st={st} />}
        {cur === 'news' && <NewsTab s={s} />}
      </div>
    </div>
  );
}

/* ------------------------------ market ------------------------------ */

function ServiceBlock({ s, st }: { s: GameState; st: StationStatic }) {
  const a = analysis.value!;
  const mult = serviceCost(s, st.id);
  const fuelPrice = T.fuelPrice * mult;
  const supPrice = T.suppliesPrice * mult;
  const probePrice = T.probePrice * mult;
  const room = Math.floor(a.stats.fuelCap - s.ship.fuel);
  return (
    <Panel title={t('station.services')} icon="fuel">
      <div class="service-row">
        <div class="service" data-testid="service-fuel">
          <div class="spread">
            <span class="dim">
              <Icon name="fuel" size={14} /> {t('top.fuel')}
            </span>
            <span class="mono">
              {fmt(s.ship.fuel, 0)}
              <span class="dim">/{fmt(a.stats.fuelCap, 0)}</span>
            </span>
          </div>
          <Bar
            value={s.ship.fuel}
            max={a.stats.fuelCap}
            tone={s.ship.fuel / a.stats.fuelCap < 0.25 ? 'bad' : 'accent'}
            label={t('top.fuel')}
          />
          <div class="row wrap">
            <Btn
              small
              disabled={room <= 0}
              testid="btn-refuel"
              onClick={() => {
                const r = act((x) => buyFuel(x, st.id, 9999));
                if (report(r) && r.ok) {
                  sfx('buy');
                  toast(t('station.bought', { n: r.units, what: t('top.fuel'), price: money(r.paid) }));
                }
              }}
            >
              {t('station.fillUp')} ({money(room * fuelPrice)})
            </Btn>
            <Btn
              small
              disabled={room <= 0}
              onClick={() => {
                const r = act((x) => buyFuel(x, st.id, 10));
                if (report(r)) sfx('buy');
              }}
            >
              +10
            </Btn>
            <span class="faint">
              {money(fuelPrice)}/{t('unit.unit')}
            </span>
          </div>
        </div>
        <div class="service">
          <div class="spread">
            <span class="dim">
              <Icon name="supplies" size={14} /> {t('top.supplies')}
            </span>
            <span class="mono">
              {fmt(s.ship.supplies, 0)}
              <span class="dim">/{fmt(a.stats.suppliesCap, 0)}</span>
            </span>
          </div>
          <Bar
            value={s.ship.supplies}
            max={a.stats.suppliesCap}
            tone={s.ship.supplies / a.stats.suppliesCap < 0.25 ? 'bad' : 'accent'}
            label={t('top.supplies')}
          />
          <div class="row wrap">
            <Btn
              small
              disabled={s.ship.supplies >= a.stats.suppliesCap - 1}
              onClick={() => {
                const r = act((x) => buySupplies(x, st.id, 9999));
                if (report(r)) sfx('buy');
              }}
            >
              {t('station.fillUp')}
            </Btn>
            <span class="faint">
              {money(supPrice)}/{t('unit.unit')} · {fmt(a.stats.suppliesPerDay, 1)}/{t('unit.day')}
            </span>
          </div>
        </div>
        <div class="service">
          <div class="spread">
            <span class="dim">
              <Icon name="probe" size={14} /> {t('top.probes')}
            </span>
            <span class="mono">{s.ship.probes}</span>
          </div>
          <div class="row wrap">
            <Btn
              small
              onClick={() => {
                const r = act((x) => buyProbes(x, st.id, 1));
                if (report(r)) sfx('buy');
              }}
            >
              +1
            </Btn>
            <Btn
              small
              onClick={() => {
                const r = act((x) => buyProbes(x, st.id, 5));
                if (report(r)) sfx('buy');
              }}
            >
              +5
            </Btn>
            <span class="faint">
              {money(probePrice)}/{t('unit.piece')}
            </span>
          </div>
        </div>
      </div>
    </Panel>
  );
}

/** Remembered per station so that arriving somewhere new never starts with a stale selection. */
let selectedGood: { station: string; good: string } | null = null;

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 899px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 899px)');
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

function MarketTab({ s, st }: { s: GameState; st: StationStatic }) {
  const [sel, setSelRaw] = useState<string | null>(
    selectedGood?.station === st.id ? selectedGood.good : null,
  );
  const narrow = useNarrow();
  const setSel = (x: string | null) => {
    selectedGood = x ? { station: st.id, good: x } : null;
    setSelRaw(x);
  };
  const legal = st.goods.filter((x) => !GOODS_BY_ID[x].tags.includes('illegal'));
  const illegal = st.goods.filter((x) => GOODS_BY_ID[x].tags.includes('illegal'));
  const mine = (id: string) => unitsOf(s.cargo, id);
  const selGood = sel && st.goods.includes(sel) ? sel : null;
  return (
    <div class="stack">
      <ServiceBlock s={s} st={st} />
      <div class={narrow ? 'stack' : 'market-grid'}>
        <div class="stack">
          <Panel title={t('station.goods')} icon="market" class="flush">
            <div class="table-wrap">
              <GoodsTable s={s} st={st} goods={legal} sel={selGood} onSel={setSel} mine={mine} />
            </div>
          </Panel>
          {illegal.length > 0 && (
            <Panel title={t('station.blackMarketTitle')} icon="warning" class="flush">
              <div class="panel-body">
                <p class="explain">{t('station.blackMarketHelp')}</p>
              </div>
              <div class="table-wrap">
                <GoodsTable s={s} st={st} goods={illegal} sel={selGood} onSel={setSel} mine={mine} />
              </div>
            </Panel>
          )}
        </div>
        {!narrow && (
          <div class="market-side">
            {selGood ? (
              <TradePanel s={s} st={st} goodId={selGood} />
            ) : (
              <p class="empty panel">{t('market.pickGood')}</p>
            )}
          </div>
        )}
      </div>
      {narrow && selGood && (
        <Modal title={t(`good.${selGood}`)} onClose={() => setSel(null)} testid="modal-trade">
          <TradePanel s={s} st={st} goodId={selGood} bare />
        </Modal>
      )}
    </div>
  );
}

function GoodsTable({
  s,
  st,
  goods,
  sel,
  onSel,
  mine,
}: {
  s: GameState;
  st: StationStatic;
  goods: string[];
  sel: string | null;
  onSel: (g: string | null) => void;
  mine: (id: string) => number;
}) {
  return (
    <table class="data" data-testid="goods-table">
      <thead>
        <tr>
          <th>{t('market.good')}</th>
          <th class="right">{t('market.buyPrice')}</th>
          <th class="right">{t('market.sellPrice')}</th>
          <th class="right">{t('market.stock')}</th>
          <th class="right">{t('market.owned')}</th>
          <th>{t('market.elsewhere')}</th>
        </tr>
      </thead>
      <tbody>
        {goods.map((id) => {
          const good = GOODS_BY_ID[id];
          const stock = stockOf(s, st.id, id);
          const buy = quoteFor(s, st.id, id, 'buy', 1).first;
          const sell = quoteFor(s, st.id, id, 'sell', 1).first;
          const mid = midPrice(st, id, stock);
          const trend = mid / good.basePrice - 1;
          const best = bestKnownPrice(s, id, 'sell');
          const g = galaxyOf(s);
          return (
            <tr
              key={id}
              class={`click ${sel === id ? 'sel' : ''}`}
              onClick={() => onSel(sel === id ? null : id)}
              tabIndex={0}
              role="button"
              aria-selected={sel === id}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSel(sel === id ? null : id);
                }
              }}
              data-testid={`good-${id}`}
            >
              <td>
                <div class="row">
                  <CategoryIcon cat={good.category} />
                  <div>
                    <div>{t(`good.${id}`)}</div>
                    <div class="row wrap" style={{ gap: 4 }}>
                      {good.tags.map((tg) => (
                        <Tag key={tg} tone={tg === 'illegal' || tg === 'hazardous' ? 'warn' : ''}>
                          {t(`tag.${tg}`)}
                        </Tag>
                      ))}
                    </div>
                  </div>
                </div>
              </td>
              <td class="right mono">
                {fmt(buy, 1)}
                <div
                  class={`faint ${trend > 0.1 ? 'neg' : trend < -0.1 ? 'pos' : ''}`}
                  style={{ fontSize: 11 }}
                >
                  {trend > 0 ? '▲' : '▼'} {Math.round(Math.abs(trend) * 100)} %
                </div>
              </td>
              <td class="right mono">{fmt(sell, 1)}</td>
              <td class="right mono">{fmt(stock)}</td>
              <td class="right mono">{mine(id) || '—'}</td>
              <td class="faint" style={{ fontSize: 12 }}>
                {best ? (
                  <span title={g.stationsById[best.stationId].name}>
                    {fmt(best.price, 0)} kr · {best.jumps}× · {t('map.dataAge', { n: Math.round(best.age) })}
                  </span>
                ) : (
                  '—'
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function TradePanel({
  s,
  st,
  goodId,
  bare,
}: {
  s: GameState;
  st: StationStatic;
  goodId: string;
  bare?: boolean;
}) {
  const good = GOODS_BY_ID[goodId];
  const { stats, dims, overload } = analyze(s);
  const [qty, setQty] = useState(10);
  const owned = unitsOf(s.cargo, goodId);
  const maxB = maxBuy(s, st.id, goodId);
  const q = Math.max(0, Math.floor(qty));
  const buyQ = quoteFor(s, st.id, goodId, 'buy', Math.max(1, Math.min(q, Math.max(1, maxB))));
  const sellQ = quoteFor(s, st.id, goodId, 'sell', Math.max(1, Math.min(q, Math.max(1, owned))));
  const items = s.cargo.filter((c) => c.goodId === goodId && !c.contractId);
  const costBasis = items.reduce((a, c) => a + c.cost, 0);
  const fresh = items.length ? freshness(good, s.day - Math.min(...items.map((c) => c.acquiredDay))) : 1;
  const oldest = items.length ? Math.min(...items.map((c) => c.acquiredDay)) : s.day;
  const left = daysLeft(good, s.day - oldest);
  const quotas = { chilledCells: stats.chilledCells, secureCells: stats.secureCells };
  const canLoad = loadableUnits(s.cargo, dims, quotas, goodId, 100000);
  const needsCooler = good.tags.includes('chilled') && stats.chilledCells <= 0;
  const needsVault = good.tags.includes('sensitive') && stats.secureCells <= 0;
  const buyN = Math.min(q, maxB);
  const massAfter = stats.mass + buyN * good.mass;
  const fuelPerLyAfter = (T.fuelK * massAfter) / Math.max(1e-6, stats.jumpEff);
  const rangeAfter = fuelPerLyAfter > 0 ? s.ship.fuel / fuelPerLyAfter : 0;
  const cellsUsed = s.cargo.reduce((a, c) => a + c.w * c.h, 0);
  const cellsAfter = cellsUsed + Math.ceil(buyN / good.unitsPerCell);
  const willOverload = cellsAfter > dims.cells;
  const priceImpact = buyN > 0 ? buyQ.endMid / midPrice(st, goodId, stockOf(s, st.id, goodId)) - 1 : 0;
  const sellImpact = sellQ.endMid / midPrice(st, goodId, stockOf(s, st.id, goodId)) - 1;
  const doBuy = (n: number) => {
    const r = act((x) => buyGoods(x, st.id, goodId, n));
    if (report(r) && r.ok) {
      sfx('buy');
      flag('tut:bought');
      toast(t('market.boughtMsg', { n: r.qty, good: t(`good.${goodId}`), price: money(r.paid) }), 'info');
    }
  };
  const doSell = (n: number) => {
    const r = act((x) => sellGoods(x, st.id, goodId, n));
    if (report(r) && r.ok) {
      sfx('sell');
      flag('tut:sold');
      toast(
        t('market.soldMsg', {
          n: r.qty,
          good: t(`good.${goodId}`),
          price: money(r.revenue),
          profit: (r.profit >= 0 ? '+' : '') + fmt(r.profit),
        }),
        r.profit >= 0 ? 'good' : 'warn',
      );
    }
  };
  const Wrap = bare ? 'div' : Panel;
  const wrapProps = bare
    ? { 'data-testid': 'trade-panel' }
    : { title: t(`good.${goodId}`), icon: 'tag', 'data-testid': 'trade-panel', id: 'trade-panel' };
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <Wrap {...(wrapProps as any)}>
      <div class="stack">
        <div class="stack">
          <div class="row wrap">
            <label class="field" style={{ width: 120 }}>
              {t('market.quantity')}
              <input
                type="number"
                min={0}
                value={qty}
                onInput={(e) => setQty(Number((e.target as HTMLInputElement).value) || 0)}
                data-testid="trade-qty"
              />
            </label>
            <div class="row wrap" style={{ alignSelf: 'flex-end' }}>
              {[1, 10, 50].map((n) => (
                <Btn key={n} small onClick={() => setQty(n)}>
                  {n}
                </Btn>
              ))}
              <Btn
                small
                onClick={() => {
                  // keep ~30 % of the wallet for fuel and supplies
                  const full = quoteFor(s, st.id, goodId, 'buy', Math.max(maxB, 1)).total;
                  const k = full > 0 ? Math.min(1, (s.credits * 0.7) / full) : 1;
                  setQty(Math.max(1, Math.floor(maxB * k)));
                }}
                testid="trade-max-buy"
              >
                {t('market.maxBuy')}
              </Btn>
              <Btn small onClick={() => setQty(Math.max(owned, 1))}>
                {t('market.allOwned')}
              </Btn>
            </div>
          </div>
          <div class="row wrap">
            <Btn kind="primary" disabled={maxB <= 0 || q <= 0} onClick={() => doBuy(q)} testid="btn-buy">
              {t('market.buy')} {Math.min(q, maxB) || ''}
            </Btn>
            <Btn kind="good" disabled={owned <= 0 || q <= 0} onClick={() => doSell(q)} testid="btn-sell">
              {t('market.sell')} {Math.min(q, owned) || ''}
            </Btn>
          </div>
          {needsCooler && <p class="explain warn">{t('market.needCooler')}</p>}
          {needsVault && <p class="explain warn">{t('market.needVault')}</p>}
          {maxB <= 0 && !needsCooler && !needsVault && stockOf(s, st.id, goodId) >= 1 && canLoad <= 0 && (
            <p class="explain warn">{t('market.noSpace')}</p>
          )}
          {willOverload && buyN > 0 && <p class="explain warn">{t('market.overloadWarn')}</p>}
          {good.tags.includes('illegal') && <p class="explain warn">{t('market.illegalWarn')}</p>}
          {good.tags.includes('hazardous') && <p class="explain">{t('market.hazardWarn')}</p>}
          {good.tags.includes('perishable') && (
            <p class="explain">{t('market.perishWarn', { d: good.shelfDays ?? 0 })}</p>
          )}
        </div>
        <div class="stack">
          <h3>{t('market.preview')}</h3>
          <dl class="kv" data-testid="trade-preview">
            <dt>{t('market.buyCost')}</dt>
            <dd class="mono">
              {buyN > 0 ? money(buyQ.total) : '—'}
              {buyN > 0 && (
                <span class="faint">
                  {' '}
                  ({fmt(buyQ.avg, 1)}/{t('unit.piece')})
                </span>
              )}
            </dd>
            <dt>{t('market.priceAfterBuy')}</dt>
            <dd class={`mono ${priceImpact > 0.05 ? 'warn' : ''}`}>
              {buyN > 0 ? `${priceImpact >= 0 ? '+' : ''}${(priceImpact * 100).toFixed(1)} %` : '—'}
            </dd>
            <dt>{t('market.sellRevenue')}</dt>
            <dd class="mono">
              {owned > 0
                ? money(
                    sellQ.total * (q > 0 ? Math.min(q, owned) / Math.max(1, Math.min(q, owned)) : 1) * fresh,
                  )
                : '—'}
              {owned > 0 && (
                <span class="faint">
                  {' '}
                  ({fmt(sellQ.avg * fresh, 1)}/{t('unit.piece')})
                </span>
              )}
            </dd>
            <dt>{t('market.priceAfterSell')}</dt>
            <dd class={`mono ${sellImpact < -0.05 ? 'warn' : ''}`}>
              {owned > 0 ? `${(sellImpact * 100).toFixed(1)} %` : '—'}
            </dd>
            <dt>{t('market.costBasis')}</dt>
            <dd class="mono">
              {owned > 0
                ? `${money(costBasis)} (${fmt(costBasis / Math.max(1, owned), 1)}/${t('unit.piece')})`
                : '—'}
            </dd>
            {good.tags.includes('perishable') && owned > 0 && (
              <>
                <dt>{t('market.fresh')}</dt>
                <dd class="mono">
                  {Math.round(fresh * 100)} % ·{' '}
                  {left !== null ? t('market.daysLeft', { n: Math.round(left) }) : ''}
                </dd>
              </>
            )}
            <dt>{t('market.cargoAfter')}</dt>
            <dd class={`mono ${willOverload ? 'warn' : ''}`}>
              {cellsUsed} → {cellsAfter} / {dims.cells}
            </dd>
            <dt>{t('ship.mass')}</dt>
            <dd>
              <Delta before={stats.mass} after={massAfter} digits={1} unit=" t" invert />
            </dd>
            <dt>{t('ship.range')}</dt>
            <dd>
              <Delta before={stats.range} after={rangeAfter} digits={1} unit=" ly" />
            </dd>
          </dl>
          {overload > 0 && <p class="explain warn">{t('market.currentOverload', { n: overload })}</p>}
          <p class="faint" style={{ fontSize: 12 }}>
            {t('market.feesNote', { s: Math.round(T.spread * 100), t: Math.round(T.tariff * 100) })} ·{' '}
            {t('market.capNote', { cap: fmt(goodCap(st, goodId)) })}
          </p>
        </div>
      </div>
    </Wrap>
  );
}

/* ------------------------------ repairs ------------------------------ */

function RepairsTab({ s, st }: { s: GameState; st: StationStatic }) {
  const a = analysis.value!;
  const hullCost = hullRepairCost(s, st.id);
  let total = hullCost;
  s.ship.slots.forEach((_, i) => (total += moduleRepairCost(s, st.id, i)));
  return (
    <Panel title={t('station.repairs')} icon="repair">
      <div class="stack">
        <div class="spread">
          <div class="grow">
            <div class="spread">
              <b>{t('ship.hull')}</b>
              <span class="mono">
                {Math.round(s.ship.hp)}/{a.stats.hpMax}
              </span>
            </div>
            <Bar
              value={s.ship.hp}
              max={a.stats.hpMax}
              tone={s.ship.hp / a.stats.hpMax < 0.4 ? 'bad' : 'good'}
            />
          </div>
          <Btn
            small
            disabled={hullCost <= 0}
            onClick={() => {
              const r = act((x) => repairHull(x, st.id));
              if (report(r)) sfx('success');
            }}
            testid="btn-repair-hull"
          >
            {t('station.repair')} ({money(hullCost)})
          </Btn>
        </div>
        {s.ship.slots.map((m, i) => {
          if (!m) return null;
          const def = MODULES_BY_ID[m.defId];
          const cost = moduleRepairCost(s, st.id, i);
          return (
            <div class="spread" key={m.uid}>
              <div class="grow">
                <div class="spread">
                  <span>
                    {t(`mod.${def.kind}`)} {def.size} <QualityBadge q={m.quality} />
                  </span>
                  <span class={`mono ${m.condition < 40 ? 'neg' : ''}`}>{Math.round(m.condition)} %</span>
                </div>
                <Bar
                  value={m.condition}
                  max={100}
                  tone={m.condition < 40 ? 'bad' : m.condition < 70 ? 'warn' : 'good'}
                />
              </div>
              <Btn
                small
                disabled={cost <= 0}
                onClick={() => {
                  const r = act((x) => repairModuleAt(x, st.id, i));
                  if (report(r)) sfx('success');
                }}
              >
                {t('station.repair')} ({money(cost)})
              </Btn>
            </div>
          );
        })}
        <div class="row">
          <Btn
            kind="primary"
            disabled={total <= 0}
            onClick={() => {
              const r = act((x) => repairAll(x, st.id));
              if (report(r)) sfx('success');
            }}
            testid="btn-repair-all"
          >
            {t('station.repairAll')} ({money(total)})
          </Btn>
        </div>
        <p class="explain">{t('station.repairHelp')}</p>
      </div>
    </Panel>
  );
}

/* ---------------------------- cartography ---------------------------- */

function CartographyTab({ s, st }: { s: GameState; st: StationStatic }) {
  const def = STATION_TYPES_BY_ID[st.type];
  const items = s.discoveries.filter((d) => !d.sold);
  const total = items.reduce((a, d) => a + d.value, 0);
  return (
    <div class="stack">
      <Panel title={t('station.cartography')} icon="scan">
        {def.cartography ? (
          <div class="stack">
            <p class="explain">{t('carto.help')}</p>
            {items.length === 0 && <Empty>{t('carto.nothing')}</Empty>}
            {items.map((d) => (
              <div key={d.id} class="spread">
                <span>
                  <Icon
                    name={d.id.startsWith('body') ? 'target' : d.id.startsWith('sys') ? 'star' : 'anomaly'}
                  />{' '}
                  {d.name}
                </span>
                <b class="mono pos">+{money(d.value)}</b>
              </div>
            ))}
            <Btn
              kind="primary"
              disabled={!items.length}
              onClick={() => {
                const r = act((x) => sellDiscoveries(x, st.id));
                if (report(r)) sfx('success');
              }}
              testid="btn-sell-data"
            >
              {t('carto.sellAll')} ({money(total)})
            </Btn>
          </div>
        ) : (
          <Empty>{t('carto.noService')}</Empty>
        )}
      </Panel>
      {def.intel && (
        <Panel title={t('carto.intelTitle')} icon="market">
          <p class="explain">{t('carto.intelHelp')}</p>
          <Btn
            kind="primary"
            disabled={s.credits < intelPrice()}
            onClick={() => {
              const r = act((x) => buyIntel(x, st.id));
              if (report(r) && r.ok) {
                sfx('success');
                toast(t('carto.intelDone', { n: r.stations }), 'good');
              }
            }}
            testid="btn-buy-intel"
          >
            {t('carto.buyIntel')} ({money(intelPrice())})
          </Btn>
        </Panel>
      )}
    </div>
  );
}

/* -------------------------------- news -------------------------------- */

function NewsTab({ s }: { s: GameState }) {
  const g = galaxyOf(s);
  const events = s.events.filter(
    (e) => e.end > s.day && s.visited.some((id) => g.systems[id].sector === e.sector),
  );
  return (
    <div class="layout-2">
      <Panel title={t('news.market')} icon="market">
        {events.length === 0 && <Empty>{t('news.none')}</Empty>}
        <div class="stack">
          {events.map((e) => (
            <div key={e.id} class="contract-card">
              <div class="spread">
                <b>{t(`msg.market.${e.kind}`, { sector: g.sectors[e.sector].name })}</b>
                <Tag>{t('news.daysLeft', { n: Math.max(0, Math.round(e.end - s.day)) })}</Tag>
              </div>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title={t('news.messages')} icon="info">
        <div class="stack" style={{ gap: 6 }}>
          {s.messages
            .slice(-25)
            .reverse()
            .map((m, i) => (
              <div
                key={i}
                class={`${m.tone === 'bad' ? 'neg' : m.tone === 'good' ? 'pos' : m.tone === 'warn' ? 'warn' : 'dim'}`}
                style={{ fontSize: 13.5 }}
              >
                <span class="mono faint">{fmt(m.day, 1)}</span> {describeMessage(m.key, m.params)}
              </div>
            ))}
        </div>
      </Panel>
    </div>
  );
}

void Stat;
