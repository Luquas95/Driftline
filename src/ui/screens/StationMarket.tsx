/**
 * Station screen, "market" tab: station services, the goods table (legal and black market) and a
 * trade panel with a live preview. Prices and limits come from core/game.ts and core/economy.ts.
 */
import { useEffect, useState } from 'preact/hooks';
import { GOODS_BY_ID } from '../../content/goods';
import { bestKnownPrice } from '../../core/advisor';
import { freshness, loadableUnits, unitsOf, daysLeft } from '../../core/cargo';
import { buyGoods, maxBuy, quoteFor, sellGoods, stockOf } from '../../core/game';
import { midPrice, goodCap } from '../../core/economy';
import { analyze, galaxyOf } from '../../core/state';
import { T } from '../../core/tuning';
import { act, flag, game, report, toast } from '../store';
import { sfx } from '../../audio/audio';
import { fmt, money, t } from '../../i18n';
import { Btn, Delta, Modal, Panel, Tag } from '../components';
import { CategoryIcon } from '../Icon';
import { creditsShown, flyIcon, tweenSignal } from '../anim';
import { ServiceBlock } from './StationServices';
import type { GameState, StationStatic } from '../../core/types';

/** Remembered per station so that arriving somewhere new never starts with a stale selection. */
let selectedGood: { station: string; good: string } | null = null;

/** Matches the CSS mobile breakpoint; below it the trade panel opens as a modal instead of a side column. */
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

/** Market tab body. */
export function MarketTab({ s, st }: { s: GameState; st: StationStatic }) {
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

/** Goods table with buy/sell quotes for one unit, trend vs. base price and the best known price elsewhere. */
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
          // trend: current mid price against the base price (red = expensive to buy here)
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

/** Quantity picker, buy/sell buttons, warnings and a preview of cost, price impact, cargo, mass and range. */
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
  const [done, setDone] = useState<{ text: string; tone: 'good' | 'warn' } | null>(null);
  const owned = unitsOf(s.cargo, goodId);
  const maxB = maxBuy(s, st.id, goodId);
  const q = Math.max(0, Math.floor(qty));
  // quote at least one unit so the preview still shows a price when nothing can be bought or sold
  const buyQ = quoteFor(s, st.id, goodId, 'buy', Math.max(1, Math.min(q, Math.max(1, maxB))));
  const sellQ = quoteFor(s, st.id, goodId, 'sell', Math.max(1, Math.min(q, Math.max(1, owned))));
  const items = s.cargo.filter((c) => c.goodId === goodId && !c.contractId);
  const costBasis = items.reduce((a, c) => a + c.cost, 0);
  const fresh = items.length ? freshness(good, s.day - Math.min(...items.map((c) => c.acquiredDay))) : 1;
  const oldest = items.length ? Math.min(...items.map((c) => c.acquiredDay)) : s.day;
  const left = daysLeft(good, s.day - oldest);
  const canLoad = loadableUnits(s.cargo, dims, stats, goodId, 100000);
  const needsCooler = good.tags.includes('chilled') && stats.chilledCells <= 0;
  const needsVault = good.tags.includes('sensitive') && stats.secureCells <= 0;
  const buyN = Math.min(q, maxB);
  const massAfter = stats.mass + buyN * good.mass;
  // same formula as computeShipStats (core/ship.ts), applied to the mass after the purchase
  const fuelPerLyAfter = (T.fuelK * massAfter) / Math.max(1e-6, stats.jumpEff);
  const rangeAfter = fuelPerLyAfter > 0 ? s.ship.fuel / fuelPerLyAfter : 0;
  const cellsUsed = s.cargo.reduce((a, c) => a + c.w * c.h, 0);
  const cellsAfter = cellsUsed + Math.ceil(buyN / good.unitsPerCell);
  const willOverload = cellsAfter > dims.cells;
  const priceImpact = buyN > 0 ? buyQ.endMid / midPrice(st, goodId, stockOf(s, st.id, goodId)) - 1 : 0;
  const sellImpact = sellQ.endMid / midPrice(st, goodId, stockOf(s, st.id, goodId)) - 1;
  // inline confirmation next to the buttons, plus the top-bar credits gliding to the new value
  const confirmTrade = (text: string, tone: 'good' | 'warn', before: number) => {
    setDone({ text, tone });
    window.setTimeout(() => setDone(null), 4200);
    tweenSignal(creditsShown, before, game.value!.credits, 800);
  };
  const doBuy = (n: number) => {
    const before = game.value!.credits;
    const r = act((x) => buyGoods(x, st.id, goodId, n));
    if (report(r) && r.ok) {
      sfx('buy');
      flag('tut:bought');
      const text = t('market.boughtMsg', { n: r.qty, good: t(`good.${goodId}`), price: money(r.paid) });
      toast(text, 'good');
      confirmTrade(text, 'good', before);
      flyIcon('[data-testid="btn-buy"]', '[data-testid="nav-cargo"]', '▣');
    }
  };
  const doSell = (n: number) => {
    const before = game.value!.credits;
    const r = act((x) => sellGoods(x, st.id, goodId, n));
    if (report(r) && r.ok) {
      sfx('sell');
      flag('tut:sold');
      const text = t('market.soldMsg', {
        n: r.qty,
        good: t(`good.${goodId}`),
        price: money(r.revenue),
        profit: (r.profit >= 0 ? '+' : '') + fmt(r.profit),
      });
      toast(text, r.profit >= 0 ? 'good' : 'warn');
      confirmTrade(text, r.profit >= 0 ? 'good' : 'warn', before);
      flyIcon('[data-testid="nav-cargo"]', '[data-testid="top-credits"]', '¤', '#ffd36b');
    }
  };
  // inside the mobile modal the panel chrome would be doubled, so render a bare div there
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
          <div class="trade-confirm-slot" aria-live="polite">
            {done && (
              <div class={`trade-confirm ${done.tone}`} data-testid="trade-confirm" role="status">
                <span class="tick" aria-hidden="true">
                  ✓
                </span>
                {done.text}
              </div>
            )}
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
