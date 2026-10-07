import { useEffect, useState } from 'preact/hooks';
import { createSystemScene, type SystemScene } from '../../render/systemscene';
import { stage } from '../../render/instance';
import { dockAt, inSystemTravelDays } from '../../core/game';
import {
  bodyDyn,
  estimateMine,
  exploreAnomaly,
  mine,
  mineMethodFor,
  salvage,
  scanSurface,
  scanSystem,
  travelToBody,
  depositDecay,
} from '../../core/exploration';
import { STATION_TYPES_BY_ID } from '../../content/stations';
import { fmt, t } from '../../i18n';
import { sfx } from '../../audio/audio';
import { Btn, Panel, Tag, Bar } from '../components';
import { Icon } from '../Icon';
import { act, analysis, galaxy, game, report, rev, screen, selectedBody, flag, toast } from '../store';
import { dockReport } from '../DockReport';
import { useScene } from '../useScene';
import type { BodyStatic } from '../../core/types';

let sceneRef: SystemScene | null = null;

export function SystemScreen() {
  void rev.value;
  const s = game.value!;
  const g = galaxy.value!;
  const a = analysis.value!;
  const sys = g.systems[s.location.systemId];
  const detected = new Set(s.detected[sys.id] ?? []);
  const [intensity, setIntensity] = useState<0 | 1 | 2>(0);
  const selIdx = selectedBody.value;
  const body: BodyStatic | null = selIdx !== null ? (sys.bodies[selIdx] ?? null) : null;

  useScene(() => {
    const sc = createSystemScene({
      system: sys,
      detected: [...detected],
      stationBodies: new Set(sys.stations.map((st) => st.bodyIndex)),
      shipBody: s.location.body,
      onSelectBody: (i) => {
        selectedBody.value = i;
        sfx('click');
      },
    });
    sc.attach(stage.app.canvas);
    sceneRef = sc;
    return sc;
  }, [sys.id]);

  useEffect(() => {
    sceneRef?.setDetected([...detected]);
    sceneRef?.setSelected(selIdx);
    sceneRef?.setShipBody(s.location.body);
  });
  useEffect(() => {
    selectedBody.value = null;
  }, [sys.id]);

  const doDock = (id: string) => {
    const r = act((st) => dockAt(st, id));
    if (report(r) && r.ok) {
      sfx('dock');
      dockReport.value = r.report;
      screen.value = 'station';
    }
  };

  return (
    <div class="screen overlay" data-testid="screen-system">
      <div class="map-overlay">
        <aside
          class="side-panel panel"
          style={{ left: 10, right: 'auto', width: 330 }}
          data-testid="system-bodies"
        >
          <header class="panel-head">
            <h2>
              <Icon name="system" /> {sys.name}
            </h2>
            <Tag tone="accent">
              {t(`region.${sys.region}`)} · {sys.spectral}
            </Tag>
          </header>
          <div class="panel-body stack">
            <div class="row wrap">
              <Btn
                small
                icon="scan"
                disabled={a.stats.scanPower <= 0}
                testid="btn-scan-system"
                onClick={() => {
                  const r = act((st) => scanSystem(st));
                  if (report(r) && r.ok) {
                    sfx('scan');
                    toast(t('sys.scanned', { n: r.found, total: r.total }), 'good');
                  }
                }}
              >
                {t('sys.scan')}
              </Btn>
              <span class="faint" style={{ fontSize: 12.5 }}>
                {t('sys.sensors', { p: fmt(a.stats.scanPower, 1) })}
              </span>
            </div>
            {sys.stations.length > 0 && (
              <section class="stack" style={{ gap: 6 }}>
                <h3>{t('sys.stations')}</h3>
                {sys.stations.map((st) => (
                  <div key={st.id} class="spread" data-testid={`station-${st.id}`}>
                    <span>
                      {st.name}{' '}
                      <span class="faint">
                        · {t(`st.${st.type}`)}
                        {st.colony ? ` · ${t('sys.colony')}` : ''}
                      </span>
                    </span>
                    <Btn small kind="primary" onClick={() => doDock(st.id)} testid={`btn-dock-${st.id}`}>
                      {s.location.stationId === st.id ? t('sys.enter') : t('sys.dock')}
                    </Btn>
                  </div>
                ))}
              </section>
            )}
            <section class="stack" style={{ gap: 4 }}>
              <h3>{t('sys.bodies')}</h3>
              {sys.bodies.map((b) => {
                const known = detected.has(b.id);
                return (
                  <button
                    key={b.id}
                    type="button"
                    class={`btn small ${selIdx === b.index ? 'active' : ''}`}
                    style={{ justifyContent: 'space-between' }}
                    onClick={() => (selectedBody.value = b.index)}
                    data-testid={`body-${b.index}`}
                  >
                    <span>{known ? b.name : `${t('sys.unknownBody')} ${b.index + 1}`}</span>
                    <span class="faint">{known ? t(`body.${b.kind}`) : '?'}</span>
                  </button>
                );
              })}
            </section>
          </div>
        </aside>
        {body && detected.has(body.id) && (
          <BodyPanel body={body} intensity={intensity} setIntensity={setIntensity} />
        )}
        {!body && (
          <aside class="side-panel panel" style={{ bottom: 'auto' }}>
            <div class="panel-body">
              <p class="dim">{t('sys.hint')}</p>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function BodyPanel({
  body,
  intensity,
  setIntensity,
}: {
  body: BodyStatic;
  intensity: 0 | 1 | 2;
  setIntensity: (n: 0 | 1 | 2) => void;
}) {
  const s = game.value!;
  const a = analysis.value!;
  const dyn = bodyDyn(s, body.id);
  const method = mineMethodFor(body);
  const sys = galaxy.value!.systems[s.location.systemId];
  const stationHere = sys.stations.filter((st) => st.bodyIndex === body.index);
  const days = inSystemTravelDays(s, body.index);
  const hasRescue = s.contracts.some(
    (c) => c.state === 'active' && c.kind === 'rescue' && c.targetBody === body.id && (c.progress ?? 0) === 1,
  );
  const revealedDeposits = body.deposits.filter((d) => dyn.revealed.includes(d.id));
  const revealedAnomalies = body.anomalies.filter((x) => dyn.revealed.includes(x.id));
  return (
    <aside class="side-panel panel" data-testid="body-panel">
      <header class="panel-head">
        <h2>{body.name}</h2>
        <Tag>{t(`body.${body.kind}`)}</Tag>
      </header>
      <div class="panel-body stack">
        <dl class="kv">
          <dt>{t('sys.orbit')}</dt>
          <dd class="mono">{fmt(body.orbit, 2)} AU</dd>
          <dt>{t('sys.travel')}</dt>
          <dd class="mono">
            {fmt(days, 2)} {t('unit.days')}
          </dd>
          <dt>{t('sys.hazard')}</dt>
          <dd class="mono">×{fmt(body.hazard, 1)}</dd>
          <dt>{t('sys.surfaceScan')}</dt>
          <dd>{dyn.surface ? t('sys.scannedYes') : t('sys.scannedNo')}</dd>
        </dl>
        <div class="row wrap">
          <Btn
            small
            icon="scan"
            disabled={a.stats.surfacePower <= 0}
            testid="btn-scan-surface"
            onClick={() => {
              const r = act((st) => scanSurface(st, body.index, false));
              if (report(r) && r.ok) {
                sfx('scan');
                toast(t('sys.surfaceResult', { d: r.deposits, a: r.anomalies }), 'good');
              }
            }}
          >
            {t('sys.scanSurface')}
          </Btn>
          <Btn
            small
            icon="probe"
            disabled={!a.stats.hasProbe || s.ship.probes < 1}
            testid="btn-probe"
            onClick={() => {
              const r = act((st) => scanSurface(st, body.index, true));
              if (report(r) && r.ok) {
                sfx('scan');
                toast(t('sys.surfaceResult', { d: r.deposits, a: r.anomalies }), 'good');
              }
            }}
          >
            {t('sys.probe')} ({s.ship.probes})
          </Btn>
          <Btn
            small
            icon="arrow"
            onClick={() => {
              const r = act((st) => travelToBody(st, body.index));
              report(r);
            }}
          >
            {t('sys.flyTo')}
          </Btn>
        </div>
        {a.stats.surfacePower <= 0 && (
          <p class="faint" style={{ fontSize: 12.5 }}>
            {t('sys.needScanner')}
          </p>
        )}
        {stationHere.map((st) => (
          <Btn
            key={st.id}
            kind="primary"
            testid={`btn-dock-body-${st.id}`}
            onClick={() => {
              const r = act((x) => dockAt(x, st.id));
              if (report(r) && r.ok) {
                sfx('dock');
                dockReport.value = r.report;
                screen.value = 'station';
              }
            }}
          >
            {t('sys.dockAt', { name: st.name })}{' '}
            <span class="faint">
              ({t(`st.${st.type}`)}
              {STATION_TYPES_BY_ID[st.type].lawful ? '' : ` · ${t('sys.unlawful')}`})
            </span>
          </Btn>
        ))}
        {hasRescue && (
          <Btn
            kind="good"
            onClick={() => {
              const r = act((st) => salvage(st));
              report(r);
            }}
            testid="btn-salvage"
          >
            {t('sys.salvage')}
          </Btn>
        )}
        <section class="stack" style={{ gap: 6 }}>
          <h3>{t('sys.deposits')}</h3>
          {revealedDeposits.length === 0 && <p class="faint">{t('sys.noDeposits')}</p>}
          {revealedDeposits.map((d) => {
            const decay = depositDecay(dyn, d.id, s.day);
            const est = estimateMine(s, body.index, d.id, intensity);
            return (
              <div key={d.id} class="contract-card" data-testid={`deposit-${d.id}`}>
                <div class="spread">
                  <b>{t(`good.${d.goodId}`)}</b>
                  <span class="mono dim">
                    {t('sys.richness')} {Math.round(d.richness * 100)} %
                  </span>
                </div>
                <Bar
                  value={d.richness * decay}
                  max={1}
                  tone={decay < 0.5 ? 'warn' : 'good'}
                  label={t('sys.richness')}
                />
                {decay < 0.95 && (
                  <span class="faint" style={{ fontSize: 12 }}>
                    {t('sys.depleted', { n: Math.round((1 - decay) * 100) })}
                  </span>
                )}
                <div class="row wrap">
                  <div class="seg" role="radiogroup" aria-label={t('sys.intensity')}>
                    {[0, 1, 2].map((i) => (
                      <button
                        key={i}
                        type="button"
                        class={intensity === i ? 'active' : ''}
                        onClick={() => setIntensity(i as 0 | 1 | 2)}
                        data-testid={`intensity-${i}`}
                      >
                        {t(`sys.int${i}`)}
                      </button>
                    ))}
                  </div>
                </div>
                {est && (
                  <div class="dim" style={{ fontSize: 12.5 }}>
                    {t(`sys.method.${est.method}`)} · ≈ <b class="mono">{est.units}</b> {t('unit.units')}
                    {est.refined ? ` (${t('sys.refined')})` : ''} · {t('top.fuel')} −{fmt(est.fuel, 1)} ·{' '}
                    {t('sys.risk')} {Math.round(est.risk * 100)} %
                  </div>
                )}
                {est?.blocked && (
                  <p class="neg" style={{ margin: 0, fontSize: 12.5 }}>
                    {t(est.blocked)}
                  </p>
                )}
                <Btn
                  small
                  kind="primary"
                  icon="mine"
                  disabled={!!est?.blocked}
                  testid={`btn-mine-${d.id}`}
                  onClick={() => {
                    const r = act((st) => mine(st, body.index, d.id, intensity));
                    if (report(r) && r.ok) {
                      sfx('mine');
                      flag('tut:mined');
                      toast(
                        t('sys.mined', { n: r.out.units, good: t(`good.${r.out.goodId}`) }) +
                          (r.out.lost > 0 ? ` ${t('sys.minedLost', { n: r.out.lost })}` : '') +
                          (r.out.hullDamage ? ` ${t('sys.minedDamage', { n: r.out.hullDamage })}` : ''),
                        r.out.hullDamage ? 'warn' : 'good',
                      );
                    }
                  }}
                >
                  {t('sys.mine')} ({method === 'drill' ? t('sys.usesProbe') : t(`sys.method.${method}`)})
                </Btn>
              </div>
            );
          })}
        </section>
        {revealedAnomalies.length > 0 && (
          <section class="stack" style={{ gap: 6 }}>
            <h3>{t('sys.anomalies')}</h3>
            {revealedAnomalies.map((an) => (
              <div key={an.id} class="spread">
                <span>
                  <Icon name="anomaly" /> {t('sys.anomaly')}
                </span>
                <Btn
                  small
                  kind="primary"
                  disabled={dyn.anomaliesDone.includes(an.id)}
                  testid="btn-anomaly"
                  onClick={() => {
                    const r = act((st) => exploreAnomaly(st, body.index, an.id));
                    report(r);
                  }}
                >
                  {dyn.anomaliesDone.includes(an.id) ? t('sys.anomalyDone') : t('sys.explore')}
                </Btn>
              </div>
            ))}
          </section>
        )}
      </div>
    </aside>
  );
}

void Panel;
