import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { MARKET_GOODS } from '../../content/goods';
import { STATION_TYPES_BY_ID } from '../../content/stations';
import { recommendTrades, planRoute, type RoutePlan } from '../../core/advisor';
import { jump, planJump, undock } from '../../core/game';
import { createMapScene, type MapFilter, type MapScene } from '../../render/mapscene';
import { stage } from '../../render/instance';
import { fmt, money, t, plural } from '../../i18n';
import { sfx } from '../../audio/audio';
import { Btn, Modal, Tag, Bar, Delta } from '../components';
import { Icon } from '../Icon';
import { act, analysis, galaxy, game, report, rev, selectedSystem, screen, flag } from '../store';
import { useScene } from '../useScene';
import { dist } from '../../core/galaxy';
import type { GameState } from '../../core/types';

const FILTERS: { id: MapFilter; label: string; icon: string }[] = [
  { id: 'normal', label: 'map.filter.normal', icon: 'map' },
  { id: 'prices', label: 'map.filter.prices', icon: 'tag' },
  { id: 'contracts', label: 'map.filter.contracts', icon: 'contract' },
  { id: 'unexplored', label: 'map.filter.unexplored', icon: 'star' },
];

let sceneRef: (MapScene & { attach: (c: HTMLCanvasElement) => void }) | null = null;

export function MapScreen() {
  void rev.value;
  const s = game.value!;
  const g = galaxy.value!;
  const [filter, setFilter] = useState<MapFilter>('normal');
  const [good, setGood] = useState('iron_ore');
  const [showTips, setShowTips] = useState(false);
  const [route, setRoute] = useState<RoutePlan | null>(null);
  const [autopilot, setAutopilot] = useState<{ running: boolean; step: number } | null>(null);
  const [hover, setHover] = useState<{ id: number; x: number; y: number } | null>(null);
  const timer = useRef<number>();
  const sel = selectedSystem.value;

  useScene(() => {
    const sc = createMapScene({
      galaxy: g,
      onSelect: (id) => {
        selectedSystem.value = id;
        sfx('click');
      },
      onHover: (id, x, y) => setHover(id === null ? null : { id, x, y }),
    }) as MapScene & { attach: (c: HTMLCanvasElement) => void };
    sc.attach(stage.app.canvas);
    sc.refresh(s);
    sc.centerOn(s.location.systemId, 11);
    sceneRef = sc;
    return sc;
  }, [g.seed]);

  useEffect(() => {
    const sc = sceneRef;
    if (!sc) return;
    sc.refresh(s);
    sc.setFilter(filter, good);
    sc.setSelected(sel);
    sc.setRoute(route?.path ?? null);
  });

  // recompute the route whenever the selection or ship state changes
  useEffect(() => {
    if (sel === null || sel === s.location.systemId) setRoute(null);
    else setRoute(planRoute(s, sel));
  }, [sel, s.location.systemId, Math.floor(s.ship.fuel), s.cargo.length]);

  // autopilot: one jump at a time with a short animation, Space pauses
  useEffect(() => {
    if (!autopilot?.running || !route) return;
    const sc = sceneRef;
    const path = route.path;
    const here = path.indexOf(s.location.systemId);
    if (here < 0 || here >= path.length - 1) {
      sc?.setMarker(null, null, 0);
      setAutopilot(null);
      return;
    }
    const from = path[here];
    const to = path[here + 1];
    let p = 0;
    const tick = window.setInterval(() => {
      p += 0.12;
      sc?.setMarker(from, to, Math.min(1, p));
      if (p >= 1) {
        clearInterval(tick);
        sc?.setMarker(null, null, 0);
        const r = act((st) => jump(st, to));
        if (!report(r) || game.value!.pendingEvent || game.value!.dead) {
          setAutopilot(null);
          return;
        }
        sfx('jump');
        flag('tut:jumped');
        const st2 = game.value!;
        if (st2.location.systemId === path[path.length - 1]) {
          setAutopilot(null);
          selectedSystem.value = null;
        } else setAutopilot({ running: true, step: here + 1 });
      }
    }, 70);
    timer.current = tick;
    return () => clearInterval(tick);
  }, [autopilot, route]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA')) return;
      if (e.code === 'Space' && autopilot) {
        e.preventDefault();
        setAutopilot({ ...autopilot, running: !autopilot.running });
      }
      if (e.key === '+' || e.key === '=') sceneRef?.zoomBy(1.3);
      if (e.key === '-') sceneRef?.zoomBy(1 / 1.3);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [autopilot]);

  const tips = useMemo(() => (showTips ? recommendTrades(s, 6) : []), [showTips, rev.value]);
  const here = g.systems[s.location.systemId];
  const selSys = sel !== null ? g.systems[sel] : null;

  return (
    <div class="screen overlay" data-testid="screen-map">
      <div class="map-overlay">
        <div class="map-tools" role="toolbar" aria-label={t('map.filters')}>
          {FILTERS.map((f) => (
            <Btn key={f.id} small icon={f.icon} active={filter === f.id} onClick={() => setFilter(f.id)} testid={`filter-${f.id}`}>
              {t(f.label)}
            </Btn>
          ))}
          {filter === 'prices' && (
            <select value={good} onChange={(e) => setGood((e.target as HTMLSelectElement).value)} aria-label={t('map.filter.good')} data-testid="filter-good">
              {MARKET_GOODS.map((x) => (
                <option key={x.id} value={x.id}>
                  {t(`good.${x.id}`)}
                </option>
              ))}
            </select>
          )}
          <Btn small icon="route" onClick={() => setShowTips(true)} testid="btn-recommend">
            {t('map.recommend')}
          </Btn>
        </div>
        <div class="map-zoom">
          <Btn icon="plus" title={t('map.zoomIn')} onClick={() => sceneRef?.zoomBy(1.4)} />
          <Btn icon="minus" title={t('map.zoomOut')} onClick={() => sceneRef?.zoomBy(1 / 1.4)} />
          <Btn icon="target" title={t('map.center')} onClick={() => sceneRef?.centerOn(s.location.systemId)} />
        </div>
        {hover && hover.id !== sel && <HoverTip id={hover.id} x={hover.x} y={hover.y} filter={filter} good={good} />}
        {selSys && (
          <aside class="side-panel panel" data-testid="map-panel">
            <SystemPanel
              s={s}
              sysId={selSys.id}
              route={route}
              autopilot={autopilot}
              onAutopilot={(running) => setAutopilot({ running, step: 0 })}
              onClose={() => (selectedSystem.value = null)}
            />
          </aside>
        )}
        {!selSys && (
          <aside class="side-panel panel" style={{ bottom: 'auto' }} data-testid="map-panel-empty">
            <header class="panel-head">
              <h2>
                <Icon name="map" /> {here.name}
              </h2>
            </header>
            <div class="panel-body stack">
              <p class="dim">{t('map.hint')}</p>
              <RangeInfo />
              <Btn small icon="system" onClick={() => (screen.value = 'system')}>
                {t('map.toSystem')}
              </Btn>
            </div>
          </aside>
        )}
      </div>
      {showTips && (
        <Modal title={t('map.recommendTitle')} wide onClose={() => setShowTips(false)} testid="modal-tips">
          <p class="explain">{t('map.recommendHelp')}</p>
          {tips.length === 0 && <p class="empty">{t('map.noTips')}</p>}
          <div class="stack">
            {tips.map((tip, i) => (
              <div class="contract-card" key={i}>
                <div class="spread">
                  <b>
                    {t(`good.${tip.goodId}`)} · {tip.qty}×
                  </b>
                  <span class="mono pos">+{money(tip.profit)}</span>
                </div>
                <div class="dim">
                  {tip.from.name} <Icon name="arrow" size={12} /> {tip.dest.name} · {tip.jumps} {plural(tip.jumps, t('unit.jump1'), t('unit.jump2'), t('unit.jump5'))} · {fmt(tip.days, 1)} {t('unit.days')}
                </div>
                <div class="row wrap">
                  <Tag tone={tip.age > 12 ? 'warn' : ''}>{t('map.dataAge', { n: Math.round(tip.age) })}</Tag>
                  <Tag>{money(tip.perDay)}/{t('unit.day')}</Tag>
                  <span class="grow" />
                  <Btn
                    small
                    onClick={() => {
                      selectedSystem.value = tip.dest.systemId;
                      sceneRef?.centerOn(tip.dest.systemId);
                      setShowTips(false);
                    }}
                  >
                    {t('map.showOnMap')}
                  </Btn>
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

function RangeInfo() {
  const a = analysis.value!;
  const s = game.value!;
  return (
    <div class="stack" style={{ gap: 6 }}>
      <div class="spread">
        <span class="dim">{t('ship.range')}</span>
        <span class="mono">{fmt(a.stats.range, 1)} ly</span>
      </div>
      <Bar value={s.ship.fuel} max={a.stats.fuelCap} tone={s.ship.fuel / a.stats.fuelCap < 0.2 ? 'bad' : 'accent'} label={t('top.fuel')} />
      <p class="faint" style={{ fontSize: 12.5 }}>{t('map.rangeHelp')}</p>
    </div>
  );
}

function HoverTip({ id, x, y, filter, good }: { id: number; x: number; y: number; filter: MapFilter; good: string }) {
  const s = game.value!;
  const g = galaxy.value!;
  const sys = g.systems[id];
  const visited = s.visited.includes(id);
  const prices = filter === 'prices' ? sys.stations.map((st) => s.prices[st.id]?.[good]).filter(Boolean) : [];
  return (
    <div class="panel" style={{ position: 'absolute', left: x + 14, top: y + 10, padding: '6px 10px', pointerEvents: 'none', fontSize: 12.5 }}>
      <b>{sys.name}</b> {visited ? '' : <span class="faint">({t('map.unexplored')})</span>}
      <div class="dim">{t(`region.${sys.region}`)} · {sys.spectral}</div>
      {prices.map((p, i) => (
        <div key={i} class="mono">
          {t('map.buyShort')} {fmt(p!.buy)} / {t('map.sellShort')} {fmt(p!.sell)} <span class="faint">({t('map.dataAge', { n: Math.round(s.day - p!.day) })})</span>
        </div>
      ))}
    </div>
  );
}

function SystemPanel({ s, sysId, route, autopilot, onAutopilot, onClose }: { s: GameState; sysId: number; route: RoutePlan | null; autopilot: { running: boolean } | null; onAutopilot: (r: boolean) => void; onClose: () => void }) {
  const g = galaxy.value!;
  const a = analysis.value!;
  const sys = g.systems[sysId];
  const visited = s.visited.includes(sysId);
  const here = sysId === s.location.systemId;
  const adjacent = g.systems[s.location.systemId].neighbors.includes(sysId);
  const detected = (s.detected[sysId] ?? []).length;
  const note = s.notes[`sys:${sysId}`] ?? '';
  const plan = adjacent ? planJump(s, sysId) : null;
  const contractsHere = s.contracts.filter((c) => c.state === 'active' && (c.destSystem === sysId || c.targetSystem === sysId));
  const riskLabel = route ? (route.risk < 0.3 ? 'low' : route.risk < 0.55 ? 'mid' : 'high') : 'low';
  return (
    <>
      <header class="panel-head">
        <h2>
          <Icon name="star" /> {sys.name}
        </h2>
        <button class="icon-btn" type="button" onClick={onClose} aria-label={t('ui.close')}>
          <Icon name="close" />
        </button>
      </header>
      <div class="panel-body stack">
        <div class="row wrap">
          <Tag tone="accent">{t(`region.${sys.region}`)}</Tag>
          <Tag>{t('map.starClass', { c: sys.spectral })}</Tag>
          {visited ? <Tag tone="good">{t('map.visited')}</Tag> : <Tag tone="warn">{t('map.unexplored')}</Tag>}
          {here && <Tag tone="accent">{t('map.youAreHere')}</Tag>}
        </div>
        {visited ? (
          <dl class="kv">
            <dt>{t('map.bodies')}</dt>
            <dd class="mono">{detected}/{sys.bodies.length}</dd>
            <dt>{t('map.stations')}</dt>
            <dd>{sys.stations.length ? sys.stations.map((st) => `${st.name} (${t(`st.${st.type}`)})`).join(', ') : '—'}</dd>
            <dt>{t('map.danger')}</dt>
            <dd class="mono">{Math.round(sys.danger * 100)} %</dd>
          </dl>
        ) : (
          <p class="dim">{t('map.unexploredHelp')}</p>
        )}
        {visited && sys.stations.some((st) => STATION_TYPES_BY_ID[st.type].cartography) && <Tag>{t('map.cartography')}</Tag>}
        {contractsHere.length > 0 && (
          <div class="explain">
            {contractsHere.map((c) => (
              <div key={c.id}>
                <Icon name="contract" size={14} /> {t(`contract.kind.${c.kind}`)} · {t('contract.deadline')} {fmt(c.deadline - s.day, 1)} {t('unit.days')}
              </div>
            ))}
          </div>
        )}
        {!here && route && (
          <section class="stack" style={{ gap: 6 }} data-testid="route-plan">
            <h3>
              <Icon name="route" size={14} /> {t('map.route')}
            </h3>
            <dl class="kv">
              <dt>{t('map.routeJumps')}</dt>
              <dd class="mono">{route.steps.length}</dd>
              <dt>{t('map.routeDistance')}</dt>
              <dd class="mono">{fmt(route.ly, 1)} ly</dd>
              <dt>{t('map.routeFuel')}</dt>
              <dd class="mono">
                <Delta before={s.ship.fuel} after={s.ship.fuel - route.fuel} digits={1} />
              </dd>
              <dt>{t('map.routeTime')}</dt>
              <dd class="mono">{fmt(route.days, 1)} {t('unit.days')}</dd>
              <dt>{t('map.routeRisk')}</dt>
              <dd class={riskLabel === 'high' ? 'neg' : riskLabel === 'mid' ? 'warn' : 'pos'}>{t(`map.risk.${riskLabel}`)}</dd>
            </dl>
            {route.refuelAt.length > 0 && (
              <p class="faint" style={{ fontSize: 12.5 }}>
                {t('map.refuelStops', { n: route.refuelAt.length })}
              </p>
            )}
            {!route.reachable && route.feasibleWithStops && <p class="warn">{t('map.needRefuel')}</p>}
            {!route.feasibleWithStops && <p class="neg">{t('map.tooFar')}</p>}
            <div class="row wrap">
              {adjacent && (
                <Btn
                  kind="primary"
                  disabled={!plan?.ok}
                  testid="btn-jump"
                  onClick={() => {
                    undock(s);
                    const r = act((st) => jump(st, sysId));
                    if (report(r)) {
                      sfx('jump');
                      flag('tut:jumped');
                      selectedSystem.value = null;
                    }
                  }}
                >
                  <Icon name="jump" /> {t('map.jump')}
                </Btn>
              )}
              {route.steps.length > 1 && (
                <Btn
                  kind={adjacent ? undefined : 'primary'}
                  disabled={!route.feasibleWithStops || !route.reachable}
                  onClick={() => onAutopilot(true)}
                  testid="btn-autopilot"
                >
                  <Icon name="route" /> {t('map.autopilot')}
                </Btn>
              )}
            </div>
            {adjacent && plan && !plan.ok && <p class="neg">{t(plan.reason ?? 'err.noRoute')}</p>}
            {autopilot && (
              <div class="row">
                <Btn small icon={autopilot.running ? 'pause' : 'play'} onClick={() => onAutopilot(!autopilot.running)}>
                  {autopilot.running ? t('map.pause') : t('map.resume')}
                </Btn>
                <span class="faint">{t('map.spaceHint')}</span>
              </div>
            )}
          </section>
        )}
        {!here && !route && <p class="warn">{t('map.noRoute')}</p>}
        {here && (
          <Btn icon="system" onClick={() => (screen.value = 'system')}>
            {t('map.toSystem')}
          </Btn>
        )}
        {visited && (
          <label class="field">
            {t('journal.note')}
            <textarea
              rows={2}
              value={note}
              onInput={(e) => {
                s.notes[`sys:${sysId}`] = (e.target as HTMLTextAreaElement).value;
              }}
              data-testid="system-note"
            />
          </label>
        )}
        <p class="faint" style={{ fontSize: 12 }}>
          {t('map.distance', { d: fmt(dist(g.systems[s.location.systemId], sys), 1) })} · {t('ship.range')}: {fmt(a.stats.range, 1)} ly
        </p>
      </div>
    </>
  );
}
