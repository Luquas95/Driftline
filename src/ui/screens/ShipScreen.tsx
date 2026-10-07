import { useEffect, useRef, useState } from 'preact/hooks';
import { MODULES_BY_ID, QUALITY } from '../../content/modules';
import { HULLS_BY_ID } from '../../content/hulls';
import { addGoods } from '../../core/cargo';
import { renewInsurance, setFullCoverage } from '../../core/game';
import { canJump, hullSlots, insuredValue, moduleFits, neighbours } from '../../core/ship';
import { analyze, premiumPerDay } from '../../core/state';
import {
  disassembleModule,
  installModule,
  removeModuleToInventory,
  sellModule,
  sellValue,
  toggleModule,
} from '../../core/shop';
import { createShipScene, type ShipScene } from '../../render/shipscene';
import { stage } from '../../render/instance';
import { sfx } from '../../audio/audio';
import { fmt, money, t } from '../../i18n';
import { Bar, Btn, Panel, QualityBadge, Stat } from '../components';
import { Icon } from '../Icon';
import { act, analysis, game, report, rev, toast } from '../store';
import { moduleName, moduleStat, modulePower } from '../moduleInfo';
import { useScene } from '../useScene';
import { StatDiff } from './ShipyardTab';
import { computeShipStats } from '../../core/ship';
import { cargoMass } from '../../core/cargo';

let sceneRef: ShipScene | null = null;

export function ShipScreen() {
  void rev.value;
  const s = game.value!;
  const a = analysis.value!;
  const slots = hullSlots(s.ship.hullId);
  const [sel, setSel] = useState<number | null>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const docked = !!s.location.stationId;

  useScene(() => {
    const sc = createShipScene(s.ship, s.ship.name);
    sceneRef = sc;
    return sc;
  }, [s.ship.hullId]);

  useEffect(() => {
    sceneRef?.setShip(s.ship);
    sceneRef?.setHighlight(sel);
  });

  useEffect(() => {
    const place = () => {
      const el = viewRef.current;
      if (!el || !sceneRef) return;
      const r = el.getBoundingClientRect();
      const c = stage.app.canvas.getBoundingClientRect();
      sceneRef.setRegion(r.left - c.left, r.top - c.top, r.width, r.height);
    };
    place();
    const ro = new ResizeObserver(place);
    if (viewRef.current) ro.observe(viewRef.current);
    window.addEventListener('resize', place);
    const t1 = setTimeout(place, 120);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', place);
      clearTimeout(t1);
    };
  }, [s.ship.hullId]);

  const cols = Math.max(...slots.map((x) => x.x)) + 1;
  const selSlot = sel !== null ? slots[sel] : null;
  const selMod = sel !== null ? s.ship.slots[sel] : null;
  const hull = HULLS_BY_ID[s.ship.hullId];
  const st = a.stats;
  const j = canJump(st);
  const power = [
    { key: 'idle', label: t('ship.actIdle'), draw: st.idleDraw, ok: st.powerFree >= -0.001 },
    { key: 'jump', label: t('ship.actJump'), draw: st.idleDraw + st.jumpDraw, ok: st.powerJump >= -0.001 },
    {
      key: 'mine',
      label: t('ship.actMine'),
      draw: st.idleDraw + st.mineDraw,
      ok: st.mineDraw === 0 || st.powerMine >= -0.001,
    },
    {
      key: 'scan',
      label: t('ship.actScan'),
      draw: st.idleDraw + st.scanDraw,
      ok: st.scanDraw === 0 || st.powerScan >= -0.001,
    },
  ];

  return (
    <div class="screen overlay" data-testid="screen-ship">
      <div class="ship-layout">
        <div class="ship-left">
          <div ref={viewRef} class="ship-view-slot" aria-hidden="true" />
          <div class="ship-title">
            <div>
              <b style={{ fontSize: 18 }}>{s.ship.name}</b>{' '}
              <span class="dim">· {t(`hull.${s.ship.hullId}`)}</span>
            </div>
            <div class="mono dim">
              {t('ship.value')}: {money(insuredValue(s.ship, true))}
            </div>
          </div>
        </div>
        <div class="ship-right">
          <Panel title={t('ship.slots')} icon="ship">
            <div
              class="slot-grid"
              style={{ gridTemplateColumns: `repeat(${cols}, minmax(80px, 1fr))` }}
              data-testid="slot-grid"
            >
              {slots.map((sl) => {
                const m = s.ship.slots[sl.index];
                const def = m ? MODULES_BY_ID[m.defId] : null;
                const nb = sel !== null && neighbours(s.ship.hullId, sel).includes(sl.index);
                return (
                  <button
                    key={sl.index}
                    type="button"
                    class={`slot ${sl.core ? 'core' : ''} ${m ? '' : 'empty'} ${m && !m.enabled ? 'off' : ''} ${sel === sl.index ? 'sel' : ''}`}
                    style={{
                      gridColumn: sl.x + 1,
                      gridRow: sl.y + 1,
                      boxShadow: nb ? '0 0 0 1px rgba(110,231,160,.6) inset' : undefined,
                    }}
                    onClick={() => {
                      sfx('click');
                      setSel(sel === sl.index ? null : sl.index);
                    }}
                    data-testid={`slot-${sl.index}`}
                    aria-label={
                      m ? `${moduleName(m.defId)} ${m.quality}` : `${t('ship.emptySlot')} ${sl.size}`
                    }
                  >
                    <span class="size">{sl.size}</span>
                    {m && def ? (
                      <>
                        <span class="name">{t(`mod.${def.kind}`)}</span>
                        <span class="row" style={{ gap: 4 }}>
                          <QualityBadge q={m.quality} />
                          {def.adjacency && <Icon name="route" size={12} title={t('ship.adjacent')} />}
                        </span>
                        <span class="cond">
                          <Bar
                            value={m.condition}
                            max={100}
                            tone={m.condition < 35 ? 'bad' : m.condition < 70 ? 'warn' : 'good'}
                            label={t('ship.condition')}
                          />
                        </span>
                      </>
                    ) : (
                      <span class="name faint">{sl.core ? t(`mod.${sl.core}`) : t('ship.emptySlot')}</span>
                    )}
                  </button>
                );
              })}
            </div>
            {selSlot && (
              <div class="stack" style={{ marginTop: 12 }} data-testid="slot-detail">
                {selMod ? (
                  <>
                    <div class="spread">
                      <b>
                        {moduleName(selMod.defId)} <QualityBadge q={selMod.quality} />
                      </b>
                      <span class="mono">{Math.round(selMod.condition)} %</span>
                    </div>
                    <div class="dim">
                      {moduleStat(selMod.defId, selMod.quality)} · {modulePower(selMod) || t('ship.noDraw')} ·{' '}
                      {fmt(MODULES_BY_ID[selMod.defId].mass * QUALITY[selMod.quality].mass, 1)} t
                    </div>
                    {MODULES_BY_ID[selMod.defId].adjacency && (
                      <p class="explain">{t('ship.adjacencyHelp')}</p>
                    )}
                    <div class="row wrap">
                      {!['reactor', 'life'].includes(MODULES_BY_ID[selMod.defId].kind) && (
                        <Btn
                          small
                          onClick={() => {
                            const r = act((x) => toggleModule(x, sel!));
                            report(r);
                          }}
                          testid="btn-toggle-module"
                        >
                          {selMod.enabled ? t('ship.switchOff') : t('ship.switchOn')}
                        </Btn>
                      )}
                      {docked && !MODULES_BY_ID[selMod.defId].core && (
                        <>
                          <Btn
                            small
                            onClick={() => {
                              const r = act((x) => removeModuleToInventory(x, sel!));
                              if (report(r)) toast(t('ship.removed'), 'info');
                            }}
                          >
                            {t('ship.remove')}
                          </Btn>
                        </>
                      )}
                      {!MODULES_BY_ID[selMod.defId].core && (
                        <Btn
                          small
                          kind="danger"
                          onClick={() => {
                            const r = act((x) =>
                              disassembleModule(x, selMod.uid, (g, q) => {
                                const an = analyze(x);
                                return addGoods(
                                  x.cargo,
                                  an.dims,
                                  { chilledCells: an.stats.chilledCells, secureCells: an.stats.secureCells },
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
                      )}
                      {docked && !MODULES_BY_ID[selMod.defId].core && (
                        <Btn
                          small
                          onClick={() => {
                            const r = act((x) => sellModule(x, s.location.stationId!, selMod.uid));
                            report(r);
                          }}
                        >
                          {t('market.sell')} ({money(sellValue(selMod))})
                        </Btn>
                      )}
                    </div>
                    {s.inventory.some((m) => moduleFits(selSlot, MODULES_BY_ID[m.defId])) && docked && (
                      <InventoryInstall slot={sel!} />
                    )}
                  </>
                ) : (
                  <>
                    <p class="dim">{t('ship.emptyHelp', { size: selSlot.size })}</p>
                    {docked ? (
                      <InventoryInstall slot={sel!} />
                    ) : (
                      <p class="faint">{t('ship.installDocked')}</p>
                    )}
                  </>
                )}
              </div>
            )}
          </Panel>
          <Panel title={t('ship.power')} icon="power">
            <div class="stack" data-testid="power-panel">
              <div class="spread">
                <span class="dim">{t('ship.powerOut')}</span>
                <b class="mono">{fmt(st.powerOut, 1)}</b>
              </div>
              <Bar
                value={st.idleDraw}
                max={Math.max(st.powerOut, st.idleDraw, 1)}
                tone={st.powerFree < 0 ? 'bad' : 'accent'}
                label={t('ship.powerIdle')}
              />
              {power.map((p) => (
                <div class="spread" key={p.key}>
                  <span>{p.label}</span>
                  <span class="mono">
                    {fmt(p.draw, 1)} / {fmt(st.powerOut, 1)}{' '}
                    {p.ok ? (
                      <Icon name="check" size={14} class="pos" />
                    ) : (
                      <Icon name="warning" size={14} class="neg" />
                    )}
                  </span>
                </div>
              ))}
              <p class="explain">{t('ship.powerHelp')}</p>
              {!j.ok && <p class="neg">{t(`err.${j.reason}`)}</p>}
            </div>
          </Panel>
          <Panel title={t('ship.stats')} icon="info">
            <div class="stats-grid" data-testid="ship-stats">
              <Stat
                label={t('ship.mass')}
                value={`${fmt(st.mass, 1)} t`}
                sub={`${t('ship.hullMass')} ${fmt(st.hullMass, 0)}`}
              />
              <Stat
                label={t('ship.range')}
                value={`${fmt(st.range, 1)} ly`}
                sub={`${t('ship.rangeFull')} ${fmt(st.rangeFull, 1)}`}
              />
              <Stat label={t('ship.fuelPerLy')} value={fmt(st.fuelPerLy, 2)} />
              <Stat label={t('ship.jumpSpeed')} value={`${fmt(st.jumpSpeed, 1)} ly/${t('unit.day')}`} />
              <Stat label={t('ship.sublight')} value={`${fmt(st.speedAuDay, 1)} AU/${t('unit.day')}`} />
              <Stat
                label={t('ship.cargo')}
                value={`${st.cargoCells} ${t('unit.cells')}`}
                sub={`${st.chilledCells} ${t('ship.chilled')} · ${st.secureCells} ${t('ship.secure')}`}
              />
              <Stat
                label={t('ship.sensors')}
                value={fmt(st.scanPower, 1)}
                sub={`${fmt(st.sensorRange, 0)} ly`}
              />
              <Stat label={t('ship.shield')} value={fmt(st.shieldCap, 0)} />
              <Stat label={t('ship.hull')} value={`${Math.round(s.ship.hp)}/${st.hpMax}`} />
              <Stat
                label={t('ship.crew')}
                value={`${st.crew}`}
                sub={`${t('ship.lifeFor', { n: st.lifeCrew })}`}
                tone={st.lifeCrew < st.crew ? 'bad' : ''}
              />
              <Stat
                label={t('top.supplies')}
                value={`${fmt(s.ship.supplies, 0)}/${st.suppliesCap}`}
                sub={`${fmt(st.suppliesPerDay, 1)}/${t('unit.day')}`}
              />
              <Stat label={t('ship.beds')} value={`${st.beds}`} sub={`${t('ship.comfort')} ${st.comfort}`} />
            </div>
            <p class="faint" style={{ fontSize: 12, marginTop: 8 }}>
              {t('ship.hullName')}: {t(`hull.${s.ship.hullId}`)} · {hull.crew} {t('ship.crewShort')}
            </p>
          </Panel>
          <Panel title={t('ship.insurance')} icon="shield">
            <div class="stack" data-testid="insurance-panel">
              {!s.difficulty.insurance && <p class="dim">{t('ship.insuranceOff')}</p>}
              {s.difficulty.insurance && (
                <>
                  <div class="row wrap">
                    <span class={s.insurance.active ? 'pos' : 'neg'}>
                      {s.insurance.active ? t('ship.insuranceActive') : t('ship.insuranceLapsed')}
                    </span>
                    <span class="mono dim">{t('ship.premium', { n: money(premiumPerDay(s)) })}</span>
                  </div>
                  <p class="explain">{t('ship.insuranceHelp')}</p>
                  {s.insurance.active ? (
                    <label class="row">
                      <input
                        type="checkbox"
                        checked={s.insurance.full}
                        disabled={!docked}
                        onChange={(e) =>
                          act((x) => setFullCoverage(x, (e.target as HTMLInputElement).checked))
                        }
                      />
                      <span>{t('ship.fullCover')}</span>
                    </label>
                  ) : (
                    <Btn
                      kind="primary"
                      disabled={!docked}
                      onClick={() => {
                        const r = act((x) => renewInsurance(x));
                        report(r);
                      }}
                    >
                      {t('ship.renew')}
                    </Btn>
                  )}
                  {!docked && <p class="faint">{t('ship.insuranceDocked')}</p>}
                </>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function InventoryInstall({ slot }: { slot: number }) {
  const s = game.value!;
  const sl = hullSlots(s.ship.hullId)[slot];
  const fit = s.inventory.filter((m) => moduleFits(sl, MODULES_BY_ID[m.defId]));
  const cm = cargoMass(s.cargo);
  if (!fit.length) return <p class="faint">{t('ship.noFitting')}</p>;
  return (
    <div class="stack" style={{ gap: 8 }}>
      <h3>{t('ship.fromInventory')}</h3>
      {fit.map((m) => {
        const trial = { ...s.ship, slots: s.ship.slots.map((x, i) => (i === slot ? m : x)) };
        return (
          <div class="contract-card" key={m.uid}>
            <div class="spread">
              <span>
                {moduleName(m.defId)} <QualityBadge q={m.quality} />
              </span>
              <Btn
                small
                kind="primary"
                onClick={() => {
                  const r = act((x) => installModule(x, m.uid, slot));
                  if (report(r)) sfx('success');
                }}
              >
                {t('yard.install')}
              </Btn>
            </div>
            <StatDiff before={computeShipStats(s.ship, cm)} after={computeShipStats(trial, cm)} />
          </div>
        );
      })}
    </div>
  );
}
