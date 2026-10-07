import { useState } from 'preact/hooks';
import { HULLS_BY_ID } from '../../content/hulls';
import { MODULES_BY_ID } from '../../content/modules';
import { addGoods, cargoMass } from '../../core/cargo';
import { computeShipStats, hullSlots, moduleFits, modulePrice } from '../../core/ship';
import { analyze } from '../../core/state';
import {
  buyHull,
  buyModule,
  disassembleModule,
  hullPrice,
  hullTradeIn,
  installModule,
  previewHullSwap,
  sellModule,
  sellValue,
} from '../../core/shop';
import { sfx } from '../../audio/audio';
import { fmt, money, t } from '../../i18n';
import { Btn, Delta, Empty, Modal, Panel, QualityBadge, Tabs } from '../components';
import { act, game, report, rev, toast } from '../store';
import { moduleName, modulePower, moduleStat } from '../moduleInfo';
import type { ModuleInstance, ModuleKind, Ship, StationStatic } from '../../core/types';

type Sub = 'modules' | 'hulls' | 'inventory';

export function ShipyardTab({ st }: { st: StationStatic }) {
  void rev.value;
  const s = game.value!;
  const [sub, setSub] = useState<Sub>('modules');
  const [install, setInstall] = useState<ModuleInstance | null>(null);
  const [hullPreview, setHullPreview] = useState<string | null>(null);
  const [kind, setKind] = useState<'all' | ModuleKind>('all');
  const dyn = s.stations[st.id];
  const kinds = [...new Set(dyn.shop.modules.map((m) => MODULES_BY_ID[m.defId].kind))];
  const list = dyn.shop.modules
    .filter((m) => kind === 'all' || MODULES_BY_ID[m.defId].kind === kind)
    .sort(
      (a, b) => MODULES_BY_ID[a.defId].kind.localeCompare(MODULES_BY_ID[b.defId].kind) || a.price - b.price,
    );
  return (
    <Panel class="flush">
      <Tabs
        tabs={[
          { id: 'modules', label: t('yard.modules'), icon: 'wrench' },
          { id: 'hulls', label: t('yard.hulls'), icon: 'ship' },
          { id: 'inventory', label: t('yard.inventory'), icon: 'cargo', badge: s.inventory.length },
        ]}
        value={sub}
        onChange={setSub}
      />
      <div class="panel-body">
        {sub === 'modules' && (
          <div class="stack">
            <div class="row wrap">
              <select
                value={kind}
                onChange={(e) => setKind((e.target as HTMLSelectElement).value as 'all' | ModuleKind)}
                aria-label={t('yard.filter')}
              >
                <option value="all">{t('yard.all')}</option>
                {kinds.map((k) => (
                  <option key={k} value={k}>
                    {t(`mod.${k}`)}
                  </option>
                ))}
              </select>
              <span class="faint">{t('yard.qualityHelp')}</span>
            </div>
            <div class="table-wrap">
              <table class="data" data-testid="module-shop">
                <thead>
                  <tr>
                    <th>{t('yard.module')}</th>
                    <th>{t('yard.effect')}</th>
                    <th class="right">{t('yard.power')}</th>
                    <th class="right">{t('ship.mass')}</th>
                    <th class="right">{t('yard.price')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {list.map((m) => {
                    const def = MODULES_BY_ID[m.defId];
                    return (
                      <tr key={m.uid} data-testid={`shop-${m.defId}-${m.quality}`}>
                        <td>
                          {moduleName(m.defId)} <QualityBadge q={m.quality} />
                        </td>
                        <td class="dim">{moduleStat(m.defId, m.quality)}</td>
                        <td class="right mono">{modulePower(m) || '—'}</td>
                        <td class="right mono">{fmt(def.mass, 1)}</td>
                        <td class="right mono">{money(m.price)}</td>
                        <td class="right">
                          <Btn
                            small
                            kind="primary"
                            disabled={s.credits < m.price}
                            onClick={() => {
                              const r = act((x) => buyModule(x, st.id, m.uid));
                              if (report(r)) sfx('buy');
                            }}
                            testid={`buy-module-${m.uid}`}
                          >
                            {t('market.buy')}
                          </Btn>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {sub === 'hulls' && (
          <div class="stack">
            <p class="explain">{t('yard.hullHelp', { trade: money(hullTradeIn(s)) })}</p>
            <div class="layout-3">
              {dyn.shop.hulls.map((id) => {
                const h = HULLS_BY_ID[id];
                const price = hullPrice(s, st, id);
                const cur = id === s.ship.hullId;
                return (
                  <div class="contract-card" key={id} data-testid={`hull-${id}`}>
                    <div class="spread">
                      <b>{t(`hull.${id}`)}</b>
                      <span class="mono">{money(price)}</span>
                    </div>
                    <p class="dim" style={{ margin: 0, fontSize: 12.5 }}>
                      {t(`hull.${id}.desc`)}
                    </p>
                    <dl class="kv" style={{ fontSize: 12.5 }}>
                      <dt>{t('ship.mass')}</dt>
                      <dd class="mono">{h.mass} t</dd>
                      <dt>{t('ship.cargo')}</dt>
                      <dd class="mono">
                        {h.cargoCells} {t('unit.cells')}
                      </dd>
                      <dt>{t('top.fuel')}</dt>
                      <dd class="mono">{h.fuel}</dd>
                      <dt>{t('ship.hull')}</dt>
                      <dd class="mono">{h.hp}</dd>
                      <dt>{t('yard.slots')}</dt>
                      <dd class="mono">
                        {hullSlots(id)
                          .filter((x) => !x.core)
                          .map((x) => x.size)
                          .join(' ')}
                      </dd>
                    </dl>
                    <Btn
                      small
                      kind={cur ? undefined : 'primary'}
                      disabled={cur}
                      onClick={() => setHullPreview(id)}
                      testid={`btn-hull-${id}`}
                    >
                      {cur ? t('yard.current') : t('yard.compare')}
                    </Btn>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {sub === 'inventory' && (
          <div class="stack">
            {s.inventory.length === 0 && <Empty>{t('yard.inventoryEmpty')}</Empty>}
            {s.inventory.map((m) => (
              <div class="spread" key={m.uid} data-testid={`inv-${m.uid}`}>
                <div>
                  {moduleName(m.defId)} <QualityBadge q={m.quality} />
                  <div class="faint" style={{ fontSize: 12.5 }}>
                    {moduleStat(m.defId, m.quality)} · {Math.round(m.condition)} %
                  </div>
                </div>
                <div class="row wrap">
                  <Btn small kind="primary" onClick={() => setInstall(m)} testid={`btn-install-${m.uid}`}>
                    {t('yard.install')}
                  </Btn>
                  <Btn
                    small
                    onClick={() => {
                      const r = act((x) => sellModule(x, st.id, m.uid));
                      if (report(r) && r.ok) {
                        sfx('sell');
                        toast(t('yard.sold', { price: money(r.price) }), 'good');
                      }
                    }}
                  >
                    {t('market.sell')} ({money(sellValue(m))})
                  </Btn>
                  <Btn
                    small
                    kind="danger"
                    onClick={() => {
                      const r = act((x) =>
                        disassembleModule(x, m.uid, (g, q) => {
                          const { stats, dims } = analyze(x);
                          return addGoods(
                            x.cargo,
                            dims,
                            { chilledCells: stats.chilledCells, secureCells: stats.secureCells },
                            g,
                            q,
                            0,
                            x.day,
                          ).added;
                        }),
                      );
                      if (report(r) && r.ok)
                        toast(t('yard.disassembled', { metals: r.metals, parts: r.parts }), 'info');
                    }}
                  >
                    {t('yard.disassemble')}
                  </Btn>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {install && <InstallModal mod={install} onClose={() => setInstall(null)} />}
      {hullPreview && <HullModal st={st} hullId={hullPreview} onClose={() => setHullPreview(null)} />}
    </Panel>
  );
}

/** Pick a slot for a module and preview the effect on ship stats. Also reused by the ship screen. */
export function InstallModal({ mod, onClose }: { mod: ModuleInstance; onClose: () => void }) {
  const s = game.value!;
  const def = MODULES_BY_ID[mod.defId];
  const slots = hullSlots(s.ship.hullId);
  const [pick, setPick] = useState<number | null>(null);
  const cm = cargoMass(s.cargo);
  const before = computeShipStats(s.ship, cm);
  const trial: Ship | null =
    pick !== null ? { ...s.ship, slots: s.ship.slots.map((x, i) => (i === pick ? mod : x)) } : null;
  const after = trial ? computeShipStats(trial, cm) : null;
  const cols = Math.max(...slots.map((x) => x.x)) + 1;
  return (
    <Modal
      title={`${t('yard.install')}: ${moduleName(mod.defId)} ${mod.quality}`}
      onClose={onClose}
      wide
      testid="modal-install"
      footer={
        <>
          <Btn onClick={onClose}>{t('ui.cancel')}</Btn>
          <Btn
            kind="primary"
            disabled={pick === null}
            testid="btn-install-confirm"
            onClick={() => {
              const r = act((x) => installModule(x, mod.uid, pick!));
              if (report(r)) {
                sfx('success');
                onClose();
              }
            }}
          >
            {t('yard.install')}
          </Btn>
        </>
      }
    >
      <p class="explain">{t('yard.pickSlot')}</p>
      <div class="layout-2">
        <div class="slot-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(70px, 1fr))` }}>
          {slots.map((sl) => {
            const fits = moduleFits(sl, def);
            const cur = s.ship.slots[sl.index];
            return (
              <button
                key={sl.index}
                type="button"
                disabled={!fits}
                class={`slot ${sl.core ? 'core' : ''} ${fits ? 'fit' : 'empty'} ${pick === sl.index ? 'sel' : ''}`}
                style={{ gridColumn: sl.x + 1, gridRow: sl.y + 1, opacity: fits ? 1 : 0.4 }}
                onClick={() => setPick(sl.index)}
                data-testid={`slot-pick-${sl.index}`}
              >
                <span class="size">{sl.size}</span>
                <span class="name">{cur ? moduleName(cur.defId) : t('ship.emptySlot')}</span>
                {cur && <QualityBadge q={cur.quality} />}
              </button>
            );
          })}
        </div>
        <div>
          {after ? <StatDiff before={before} after={after} /> : <p class="faint">{t('yard.previewHint')}</p>}
        </div>
      </div>
    </Modal>
  );
}

export function StatDiff({
  before,
  after,
}: {
  before: ReturnType<typeof computeShipStats>;
  after: ReturnType<typeof computeShipStats>;
}) {
  const rows: [string, number, number, number, string, boolean?][] = [
    ['ship.powerOut', before.powerOut, after.powerOut, 1, ''],
    ['ship.powerIdle', before.idleDraw, after.idleDraw, 1, '', true],
    ['ship.powerJump', before.powerJump, after.powerJump, 1, ''],
    ['ship.mass', before.mass, after.mass, 1, ' t', true],
    ['ship.cargo', before.cargoCells, after.cargoCells, 0, ''],
    ['top.fuel', before.fuelCap, after.fuelCap, 0, ''],
    ['ship.rangeFull', before.rangeFull, after.rangeFull, 1, ' ly'],
    ['ship.hull', before.hpMax, after.hpMax, 0, ''],
    ['ship.sensorRange', before.sensorRange, after.sensorRange, 0, ' ly'],
    ['ship.shield', before.shieldCap, after.shieldCap, 0, ''],
    ['ship.chilled', before.chilledCells, after.chilledCells, 0, ''],
    ['ship.secure', before.secureCells, after.secureCells, 0, ''],
    ['ship.beds', before.beds, after.beds, 0, ''],
    ['ship.repairRate', before.repairRate, after.repairRate, 1, ''],
  ];
  return (
    <dl class="kv" data-testid="stat-diff">
      {rows
        .filter((r) => Math.abs(r[1]) > 1e-9 || Math.abs(r[2]) > 1e-9)
        .map(([k, b, a, d, u, inv]) => (
          <>
            <dt key={`${k}-t`}>{t(k)}</dt>
            <dd key={`${k}-v`}>
              <Delta before={b} after={a} digits={d} unit={u} invert={!!inv} />
            </dd>
          </>
        ))}
    </dl>
  );
}

function HullModal({ st, hullId, onClose }: { st: StationStatic; hullId: string; onClose: () => void }) {
  const s = game.value!;
  const p = previewHullSwap(s, st, hullId);
  const price = hullPrice(s, st, hullId);
  const canBuy = s.credits >= p.cost && p.cargoFits;
  return (
    <Modal
      title={`${t('yard.swapTo')} ${t(`hull.${hullId}`)}`}
      wide
      onClose={onClose}
      testid="modal-hull"
      footer={
        <>
          <Btn onClick={onClose}>{t('ui.cancel')}</Btn>
          <Btn
            kind="primary"
            disabled={!canBuy}
            testid="btn-hull-confirm"
            onClick={() => {
              const r = act((x) => buyHull(x, st.id, hullId));
              if (report(r)) {
                sfx('success');
                onClose();
              }
            }}
          >
            {t('yard.confirmSwap')} ({money(p.cost)})
          </Btn>
        </>
      }
    >
      <div class="layout-2">
        <div class="stack">
          <dl class="kv">
            <dt>{t('yard.newPrice')}</dt>
            <dd class="mono">{money(price)}</dd>
            <dt>{t('yard.tradeIn')}</dt>
            <dd class="mono">−{money(hullTradeIn(s))}</dd>
            <dt>{t('yard.toPay')}</dt>
            <dd class="mono">
              <b>{money(p.cost)}</b>
            </dd>
          </dl>
          {!p.cargoFits && <p class="neg">{t('err.cargoWontFit')}</p>}
          {s.credits < p.cost && <p class="neg">{t('err.noCredits')}</p>}
          <p class="explain">{t('yard.transferHelp')}</p>
          <div>
            <h3>{t('yard.transferred', { n: p.moved.length })}</h3>
          </div>
          {p.inventoryAdds.length > 0 && (
            <div>
              <h3>{t('yard.toInventory')}</h3>
              {p.inventoryAdds.map((m) => (
                <div key={m.uid} class="warn" style={{ fontSize: 13 }}>
                  {moduleName(m.defId)} {m.quality}
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <h3 style={{ marginBottom: 6 }}>{t('yard.changes')}</h3>
          <StatDiff before={p.before} after={p.after} />
        </div>
      </div>
    </Modal>
  );
}

void modulePrice;
