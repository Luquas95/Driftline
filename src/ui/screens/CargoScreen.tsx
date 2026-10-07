import { useEffect, useRef, useState } from 'preact/hooks';
import { GOODS_BY_ID } from '../../content/goods';
import { bestKnownPrice } from '../../core/advisor';
import { cargoMass, daysLeft, fitsAt, freshness, quotaUse, totalRows, type GridDims } from '../../core/cargo';
import { cargoAutoArrange, cargoMove, cargoRotate, jettison } from '../../core/game';
import { galaxyOf } from '../../core/state';
import { sfx } from '../../audio/audio';
import { createBackdropScene } from '../../render/backdrop';
import { useScene } from '../useScene';
import { fmt, money, t } from '../../i18n';
import { Bar, Btn, Empty, Panel, Stat, Tag } from '../components';
import { Icon } from '../Icon';
import { act, analysis, game, report, rev } from '../store';
import type { CargoItem } from '../../core/types';

const HUE: Record<string, number> = {
  raw: 35,
  food: 100,
  industry: 210,
  tech: 265,
  medical: 340,
  luxury: 48,
  illegal: 0,
  special: 175,
};
const colorFor = (goodId: string, contract: boolean) => {
  const cat = GOODS_BY_ID[goodId]?.category ?? 'raw';
  const l = cat === 'illegal' ? 48 : 68;
  return `hsl(${HUE[cat] ?? 35} ${contract ? 35 : 55}% ${l}%)`;
};

export function CargoScreen() {
  void rev.value;
  useScene(() => createBackdropScene({ tint: 3 }), []);
  const s = game.value!;
  const a = analysis.value!;
  const dims: GridDims = a.dims;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [cell, setCell] = useState(52);
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<{
    uid: string;
    dx: number;
    dy: number;
    ox: number;
    oy: number;
    valid: boolean;
    gx: number;
    gy: number;
  } | null>(null);
  const rows = totalRows(dims);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const calc = () => {
      const w = el.clientWidth - 8;
      setCell(Math.max(34, Math.min(58, Math.floor(w / dims.cols))));
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [dims.cols]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'r' && selected) {
        const r = act((x) => cargoRotate(x, selected));
        if (r.ok) sfx('click');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  const onDown = (e: PointerEvent, it: CargoItem) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setSelected(it.uid);
    setDrag({ uid: it.uid, dx: 0, dy: 0, ox: e.clientX, oy: e.clientY, valid: true, gx: it.x, gy: it.y });
  };
  const onMove = (e: PointerEvent, it: CargoItem) => {
    if (!drag || drag.uid !== it.uid) return;
    const dx = e.clientX - drag.ox;
    const dy = e.clientY - drag.oy;
    const gx = Math.round(it.x + dx / cell);
    const gy = Math.round(it.y + dy / cell);
    const valid = fitsAt(dims, s.cargo, it.w, it.h, gx, gy, it.uid);
    setDrag({ ...drag, dx, dy, gx, gy, valid });
  };
  const onUp = (_e: PointerEvent, it: CargoItem) => {
    if (!drag || drag.uid !== it.uid) return;
    const moved = Math.hypot(drag.dx, drag.dy) > 6;
    if (moved && drag.valid && (drag.gx !== it.x || drag.gy !== it.y)) {
      const r = act((x) => cargoMove(x, it.uid, drag.gx, drag.gy));
      if (r.ok) sfx('click');
    } else if (!moved) {
      // tap / click selects; a second tap on a selected item rotates it
      if (selected === it.uid && it.w !== it.h) {
        const r = act((x) => cargoRotate(x, it.uid));
        if (r.ok) sfx('click');
      }
    }
    setDrag(null);
  };

  // aggregate by good
  const byGood = new Map<string, { qty: number; cost: number; contract: number; oldest: number }>();
  for (const it of s.cargo) {
    const e = byGood.get(it.goodId) ?? { qty: 0, cost: 0, contract: 0, oldest: it.acquiredDay };
    if (it.contractId) e.contract += it.qty;
    else {
      e.qty += it.qty;
      e.cost += it.cost;
    }
    e.oldest = Math.min(e.oldest, it.acquiredDay);
    byGood.set(it.goodId, e);
  }
  const used = s.cargo.reduce((x, c) => x + c.w * c.h, 0);
  const mass = cargoMass(s.cargo);
  const quotas = quotaUse(s.cargo);
  const selItem = s.cargo.find((c) => c.uid === selected);
  const g = galaxyOf(s);
  const value = [...byGood.entries()].reduce(
    (v, [id, e]) => v + e.qty * (bestKnownPrice(s, id, 'sell')?.price ?? GOODS_BY_ID[id].basePrice * 0.8),
    0,
  );

  return (
    <div class="screen" data-testid="screen-cargo">
      <div class="layout-2" style={{ maxWidth: 1100, margin: '0 auto' }}>
        <Panel
          title={t('cargo.hold')}
          icon="cargo"
          actions={
            <div class="row wrap">
              <Btn
                small
                icon="auto"
                onClick={() => {
                  const r = act((x) => cargoAutoArrange(x));
                  if (report(r)) sfx('success');
                }}
                testid="btn-autoarrange"
              >
                {t('cargo.auto')}
              </Btn>
              <Btn
                small
                icon="rotate"
                disabled={!selItem || selItem.w === selItem.h}
                onClick={() => {
                  const r = act((x) => cargoRotate(x, selected!));
                  report(r);
                }}
                testid="btn-rotate"
              >
                {t('cargo.rotate')} (R)
              </Btn>
              <Btn
                small
                kind="danger"
                disabled={!selItem || !!selItem.contractId}
                onClick={() => {
                  const r = act((x) => jettison(x, selected!));
                  if (report(r)) setSelected(null);
                }}
              >
                {t('cargo.jettison')}
              </Btn>
            </div>
          }
        >
          <div ref={wrapRef}>
            <div
              class="cargo-board"
              style={{ width: dims.cols * cell, height: rows * cell }}
              data-testid="cargo-board"
              onPointerDown={(e) => e.target === e.currentTarget && setSelected(null)}
            >
              {Array.from({ length: rows * dims.cols }, (_, i) => {
                const x = i % dims.cols;
                const y = Math.floor(i / dims.cols);
                const blocked = y < dims.rows && y * dims.cols + x >= dims.cells;
                const over = y >= dims.rows;
                return (
                  <div
                    key={i}
                    class={`cargo-cell ${blocked ? 'blocked' : ''} ${over ? 'over' : ''}`}
                    style={{ left: x * cell, top: y * cell, width: cell - 2, height: cell - 2 }}
                  />
                );
              })}
              {s.cargo.map((it) => {
                const dragging = drag?.uid === it.uid;
                const left = it.x * cell + (dragging ? drag!.dx : 0);
                const top = it.y * cell + (dragging ? drag!.dy : 0);
                const good = GOODS_BY_ID[it.goodId];
                const fr = freshness(good, s.day - it.acquiredDay);
                return (
                  <div
                    key={it.uid}
                    class={`cargo-item ${dragging ? 'dragging' : ''} ${selected === it.uid ? 'selected' : ''} ${it.contractId ? 'contract' : ''} ${dragging ? (drag!.valid ? 'drop-ok' : '') : ''}`}
                    style={{
                      left,
                      top,
                      width: it.w * cell - 2,
                      height: it.h * cell - 2,
                      background: colorFor(it.goodId, !!it.contractId),
                      opacity: dragging && !drag!.valid ? 0.6 : 1,
                      transition: dragging ? 'none' : 'left .12s, top .12s',
                    }}
                    onPointerDown={(e) => onDown(e, it)}
                    onPointerMove={(e) => onMove(e, it)}
                    onPointerUp={(e) => onUp(e, it)}
                    onPointerCancel={() => setDrag(null)}
                    data-testid={`cargo-item-${it.goodId}`}
                    title={`${t(`good.${it.goodId}`)} ×${it.qty}`}
                  >
                    <span style={{ fontSize: it.w * it.h === 1 ? 10 : 12 }}>{t(`good.${it.goodId}`)}</span>
                    <span class="qty">{it.qty}</span>
                    {good.shelfDays && fr < 1 && (
                      <span style={{ fontSize: 10 }}>{Math.round(fr * 100)}%</span>
                    )}
                  </div>
                );
              })}
            </div>
            <div class="row wrap" style={{ marginTop: 8, justifyContent: 'center' }}>
              <Tag>{t('cargo.nominal')}</Tag>
              <Tag tone="warn">{t('cargo.overflowRow')}</Tag>
            </div>
          </div>
          <p class="explain">{t('cargo.help')}</p>
          {a.overload > 0 && (
            <p class="explain warn" data-testid="overload-warning">
              <Icon name="warning" size={14} />{' '}
              {t('cargo.overloadWarn', { n: a.overload, supplies: fmt(a.stats.suppliesPerDay, 1) })}
            </p>
          )}
        </Panel>
        <div class="stack">
          <Panel title={t('cargo.summary')} icon="info">
            <div class="stats-grid">
              <Stat
                label={t('cargo.occupancy')}
                value={`${used}/${dims.cells}`}
                sub={a.overload > 0 ? `${t('cargo.overloadShort', { n: a.overload })}` : undefined}
                tone={a.overload > 0 ? 'warn' : ''}
              />
              <Stat
                label={t('ship.mass')}
                value={`${fmt(mass, 1)} t`}
                sub={`${t('ship.range')} ${fmt(a.stats.range, 1)} ly`}
              />
              <Stat label={t('cargo.value')} value={money(value)} sub={t('cargo.valueHelp')} />
            </div>
            <div class="stack" style={{ marginTop: 10 }}>
              <Bar
                value={used}
                max={dims.cells}
                tone={used > dims.cells ? 'bad' : used > dims.cells * 0.9 ? 'warn' : 'accent'}
                label={t('cargo.occupancy')}
              />
              {a.stats.chilledCells > 0 && (
                <div class="spread">
                  <span class="dim">{t('ship.chilled')}</span>
                  <span class="mono">
                    {quotas.chilled}/{a.stats.chilledCells}
                  </span>
                </div>
              )}
              {a.stats.secureCells > 0 && (
                <div class="spread">
                  <span class="dim">{t('ship.secure')}</span>
                  <span class="mono">
                    {quotas.secure}/{a.stats.secureCells}
                  </span>
                </div>
              )}
            </div>
          </Panel>
          <Panel title={t('cargo.list')} icon="cargo" class="flush">
            {byGood.size === 0 && <Empty>{t('cargo.empty')}</Empty>}
            <div class="table-wrap">
              {byGood.size > 0 && (
                <table class="data">
                  <thead>
                    <tr>
                      <th>{t('market.good')}</th>
                      <th class="right">{t('market.owned')}</th>
                      <th class="right">{t('cargo.paid')}</th>
                      <th class="right">{t('cargo.bestKnown')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...byGood.entries()].map(([id, e]) => {
                      const good = GOODS_BY_ID[id];
                      const best = bestKnownPrice(s, id, 'sell');
                      const left = daysLeft(good, s.day - e.oldest);
                      return (
                        <tr key={id}>
                          <td>
                            {t(`good.${id}`)}
                            <div class="row wrap" style={{ gap: 4 }}>
                              {e.contract > 0 && (
                                <Tag tone="accent">{t('cargo.contractQty', { n: e.contract })}</Tag>
                              )}
                              {left !== null && (
                                <Tag tone={left < 8 ? 'bad' : 'warn'}>
                                  {t('market.daysLeft', { n: Math.round(left) })}
                                </Tag>
                              )}
                            </div>
                          </td>
                          <td class="right mono">{e.qty + e.contract}</td>
                          <td class="right mono">{e.qty > 0 ? `${fmt(e.cost / e.qty, 1)}` : '—'}</td>
                          <td class="right mono" title={best ? g.stationsById[best.stationId].name : ''}>
                            {best && e.qty > 0 ? (
                              <>
                                {fmt(best.price, 1)}
                                <div
                                  class={`${best.price * e.qty > e.cost ? 'pos' : 'neg'}`}
                                  style={{ fontSize: 11 }}
                                >
                                  {best.price * e.qty - e.cost >= 0 ? '+' : ''}
                                  {fmt(best.price * e.qty - e.cost, 0)}
                                </div>
                              </>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
