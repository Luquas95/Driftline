/**
 * Base screen, "production" tab: mine output, production lines, port auto-sell thresholds and
 * hull/module commissions (all actions from core/base.ts).
 */
import { useState } from 'preact/hooks';
import { HULLS } from '../../content/hulls';
import { MODULES } from '../../content/modules';
import {
  checkHullOrder,
  checkModuleOrder,
  commissionHull,
  commissionModule,
  levelOf,
  maxLines,
  mineOutput,
  producibleGoods,
  setAutoSell,
  setLine,
} from '../../core/base';
import { GOODS_BY_ID } from '../../content/goods';
import { t, fmt, money } from '../../i18n';
import { Bar, Btn, Empty } from '../components';
import { act, game, report, rev } from '../store';

/** Production tab body; the order buttons stay disabled until the core pre-check passes. */
export function BaseProduction() {
  void rev.value;
  const s = game.value!;
  const base = s.base!;
  const goods = producibleGoods(base);
  const mine = mineOutput(s);
  const [pick, setPick] = useState('');
  const [hullPick, setHullPick] = useState('');
  const [modPick, setModPick] = useState('');
  const hulls = HULLS.filter((h) => h.price > 0);
  const modules = MODULES.filter((m) => !m.core);
  const hullChk = hullPick ? checkHullOrder(s, hullPick) : null;
  const modChk = modPick ? checkModuleOrder(s, modPick) : null;
  const stored = Object.entries(base.storage).filter(([, n]) => n >= 0.5);
  return (
    <div class="stack" data-testid="base-production">
      <section class="stack">
        <h4>{t('ui3.mine')}</h4>
        {levelOf(base, 'mine') === 0 && <Empty>{t('ui3.noMine')}</Empty>}
        {levelOf(base, 'mine') > 0 && mine.length === 0 && <Empty>{t('ui3.noDeposits')}</Empty>}
        {mine.map((m) => (
          <div key={m.goodId} class="spread">
            <span>{t(`good.${m.goodId}`)}</span>
            <span class="mono">
              +{fmt(m.perDay, 1)} {t('ui3.perDay')}
            </span>
          </div>
        ))}
      </section>
      <section class="stack">
        <h4>
          {t('ui3.lines')}{' '}
          <span class="dim">
            ({base.lines.length}/{maxLines(base)})
          </span>
        </h4>
        {base.lines.length === 0 && <Empty>{t('ui3.noLines')}</Empty>}
        {base.lines.map((l) => (
          <div key={l.goodId} class="spread">
            <span>
              {t(`good.${l.goodId}`)}{' '}
              <span class="dim">
                (
                {Object.entries(GOODS_BY_ID[l.goodId].inputs ?? {})
                  .map(([i, n]) => `${n}× ${t(`good.${i}`)}`)
                  .join(', ')}
                )
              </span>
            </span>
            <Btn
              small
              kind="danger"
              icon="close"
              title={t('ui.delete')}
              onClick={() => report(act((st) => setLine(st, l.goodId, false)))}
            />
          </div>
        ))}
        <div class="row">
          <select
            value={pick}
            aria-label={t('ui3.addLine')}
            onChange={(e) => setPick((e.target as HTMLSelectElement).value)}
            data-testid="line-pick"
          >
            <option value="">{t('ui3.addLine')}</option>
            {goods
              .filter((id) => !base.lines.some((l) => l.goodId === id))
              .map((id) => (
                <option key={id} value={id}>
                  {t(`good.${id}`)}
                </option>
              ))}
          </select>
          <Btn
            small
            disabled={!pick}
            testid="line-add"
            // cap 0 = no stock limit; the line runs until inputs or storage run out
            onClick={() => report(act((st) => setLine(st, pick, true, 0)))}
          >
            {t('ui3.add')}
          </Btn>
        </div>
      </section>
      <section class="stack">
        <h4>{t('ui3.autoSell')}</h4>
        {levelOf(base, 'port') === 0 && <Empty>{t('err.needPort')}</Empty>}
        {levelOf(base, 'port') > 0 &&
          stored.map(([gid]) => (
            <div key={gid} class="spread">
              <span>{t(`good.${gid}`)}</span>
              <span class="row">
                <input
                  type="number"
                  min={0}
                  style={{ width: 80 }}
                  aria-label={t('ui3.keep')}
                  placeholder={t('ui3.keep')}
                  // value = units to keep in storage; the port sells the surplus. Empty clears the rule.
                  value={base.autoSell[gid] ?? ''}
                  onChange={(e) => {
                    const v = (e.target as HTMLInputElement).value;
                    report(act((st) => setAutoSell(st, gid, v === '' ? null : Number(v))));
                  }}
                />
              </span>
            </div>
          ))}
      </section>
      <section class="stack">
        <h4>{t('ui3.orders')}</h4>
        {base.orders.map((o) => (
          <div key={o.id}>
            <div class="spread">
              {/* module ids are `<kind>_<s|m|l>`: translate the kind, show the size letter */}
              <span>
                {o.kind === 'hull'
                  ? t(`hull.${o.item}`)
                  : t(`mod.${o.item.replace(/_[sml]$/, '')}`) + ' ' + o.item.slice(-1).toUpperCase()}
              </span>
              <span class="dim">{t('ui3.readyDay', { day: Math.ceil(o.done) })}</span>
            </div>
            <Bar value={s.day - o.start} max={Math.max(1, o.done - o.start)} />
          </div>
        ))}
        <div class="row">
          <select
            value={hullPick}
            aria-label={t('ui3.orderHull')}
            onChange={(e) => setHullPick((e.target as HTMLSelectElement).value)}
          >
            <option value="">{t('ui3.orderHull')}</option>
            {hulls.map((h) => (
              <option key={h.id} value={h.id}>
                {t(`hull.${h.id}`)} · {money(h.price)}
              </option>
            ))}
          </select>
          <Btn
            small
            disabled={!hullChk?.ok}
            testid="order-hull"
            onClick={() => report(act((st) => commissionHull(st, hullPick)))}
          >
            {t('ui3.order')}
          </Btn>
        </div>
        {hullChk && !hullChk.ok && (
          <div class="neg" style={{ fontSize: 12.5 }}>
            {t(hullChk.error!)}
          </div>
        )}
        {hullChk?.ok && (
          <div class="dim" style={{ fontSize: 12.5 }}>
            {costLine(hullChk)}
          </div>
        )}
        <div class="row">
          <select
            value={modPick}
            aria-label={t('ui3.orderModule')}
            onChange={(e) => setModPick((e.target as HTMLSelectElement).value)}
          >
            <option value="">{t('ui3.orderModule')}</option>
            {modules.map((m) => (
              <option key={m.id} value={m.id}>
                {t(`mod.${m.id.replace(/_[sml]$/, '')}`)} {m.id.slice(-1).toUpperCase()}
              </option>
            ))}
          </select>
          <Btn
            small
            disabled={!modChk?.ok}
            onClick={() => report(act((st) => commissionModule(st, modPick)))}
          >
            {t('ui3.order')}
          </Btn>
        </div>
        {modChk && !modChk.ok && (
          <div class="neg" style={{ fontSize: 12.5 }}>
            {t(modChk.error!)}
          </div>
        )}
        {modChk?.ok && (
          <div class="dim" style={{ fontSize: 12.5 }}>
            {costLine(modChk)}
          </div>
        )}
      </section>
    </div>
  );
}

function costLine(c: { credits: number; days: number; materials: Record<string, number> }): string {
  return `${money(c.credits)} · ${c.days} ${t('ui3.daysShort')} · ${Object.entries(c.materials)
    .map(([g, n]) => `${n}× ${t(`good.${g}`)}`)
    .join(', ')}`;
}
