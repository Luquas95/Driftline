import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { stage, stageFailed, stageReady } from '../render/instance';
import { unlockAudio, sfx } from '../audio/audio';
import { t, fmt, money, plural } from '../i18n';
import { Icon } from './Icon';
import { Modal, Btn } from './components';
import {
  act,
  analysis,
  game,
  go,
  menuOpen,
  rev,
  screen,
  showHelp,
  toasts,
  type ScreenId,
  galaxy,
} from './store';
import { settings, updateSettings } from './settings';
import { MenuScreen } from './screens/MenuScreen';
import { MapScreen } from './screens/MapScreen';
import { SystemScreen } from './screens/SystemScreen';
import { StationScreen } from './screens/StationScreen';
import { ShipScreen } from './screens/ShipScreen';
import { CargoScreen } from './screens/CargoScreen';
import { CombatScreen } from './screens/CombatScreen';
import { CombatResultModal, EncounterModal } from './CombatModals';
import { combatSummary } from './combatCtl';
import { CrewScreen } from './screens/CrewScreen';
import { JournalScreen } from './screens/JournalScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { EventModal, eventResult } from './EventModal';
import { DockReportModal, dockReport } from './DockReport';
import { Tutorial } from './Tutorial';
import { HelpModal } from './HelpModal';
import { undock } from '../core/game';

const lastDeaths = signal(0);

function StageHost() {
  useEffect(() => {
    const host = document.getElementById('stage-host')!;
    let cancelled = false;
    stage
      .init(host)
      .then(() => {
        if (!cancelled) stageReady.value = true;
      })
      .catch(() => {
        stageFailed.value = true;
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return <div id="stage-host" class="stage-host" />;
}

const NAV: { id: ScreenId; icon: string; label: string; key: string }[] = [
  { id: 'map', icon: 'map', label: 'nav.map', key: 'M' },
  { id: 'system', icon: 'system', label: 'nav.system', key: 'Y' },
  { id: 'station', icon: 'station', label: 'nav.station', key: 'S' },
  { id: 'ship', icon: 'ship', label: 'nav.ship', key: 'L' },
  { id: 'cargo', icon: 'cargo', label: 'nav.cargo', key: 'C' },
  { id: 'crew', icon: 'crew', label: 'nav.crew', key: 'P' },
  { id: 'journal', icon: 'journal', label: 'nav.journal', key: 'J' },
  { id: 'settings', icon: 'settings', label: 'nav.settings', key: 'O' },
];

function TopBar() {
  void rev.value;
  const s = game.value!;
  const a = analysis.value!;
  const g = galaxy.value!;
  const sys = g.systems[s.location.systemId];
  const st = s.location.stationId ? g.stationsById[s.location.stationId] : null;
  const fuelPct = a.stats.fuelCap > 0 ? s.ship.fuel / a.stats.fuelCap : 0;
  const lowFuel = fuelPct < 0.2;
  const hullPct = s.ship.hp / a.stats.hpMax;
  const noPower = a.stats.powerFree < -0.001;
  return (
    <header class="topbar">
      <span class="brand">Driftline</span>
      <div class="top-loc" data-testid="top-location">
        <b>{sys.name}</b>
        <span>{st ? t('top.docked', { station: st.name }) : t('top.inSystem')}</span>
      </div>
      <div class="top-stats">
        <span class="top-stat" title={t('top.day')} data-testid="top-day">
          <Icon name="clock" />
          <span class="mono">{fmt(s.day, 1)}</span>
          <span class="lbl dim">{t('top.dayShort')}</span>
        </span>
        <span class="top-stat" title={t('top.credits')} data-testid="top-credits">
          <Icon name="credits" />
          <span class="mono">{fmt(Math.round(s.credits))}</span>
        </span>
        <span class={`top-stat ${lowFuel ? 'neg' : ''}`} title={t('top.fuel')} data-testid="top-fuel">
          <Icon name="fuel" />
          <span class="mono">
            {fmt(s.ship.fuel, 0)}
            <span class="dim">/{fmt(a.stats.fuelCap, 0)}</span>
          </span>
        </span>
        <span class={`top-stat hull ${hullPct < 0.4 ? 'neg' : ''}`} title={t('top.hull')}>
          <Icon name="shield" />
          <span class="mono">{Math.round(hullPct * 100)}%</span>
        </span>
        {noPower && (
          <span class="top-stat neg" title={t('top.noPower')}>
            <Icon name="power" />
          </span>
        )}
        <button
          class="icon-btn"
          type="button"
          aria-label={t('ui.help')}
          onClick={() => (showHelp.value = true)}
          data-testid="btn-help"
        >
          <Icon name="help" />
        </button>
      </div>
    </header>
  );
}

function Nav() {
  void rev.value;
  const s = game.value!;
  const docked = !!s.location.stationId;
  return (
    <nav class="nav" aria-label={t('nav.label')}>
      {NAV.map((n) => {
        const disabled = (n.id === 'station' && !docked) || !!s.combat;
        return (
          <button
            key={n.id}
            type="button"
            class={screen.value === n.id ? 'active' : ''}
            disabled={disabled}
            style={disabled ? { opacity: 0.35 } : undefined}
            title={`${t(n.label)} (${n.key})`}
            data-testid={`nav-${n.id}`}
            onClick={() => {
              unlockAudio();
              go(n.id);
            }}
          >
            <Icon name={n.icon} size={20} />
            <span>{t(n.label)}</span>
          </button>
        );
      })}
      <span class="spacer" />
    </nav>
  );
}

function Toasts() {
  return (
    <div class="toasts" aria-live="polite" data-testid="toasts">
      {toasts.value.map((x) => (
        <div key={x.id} class={`toast ${x.tone}`}>
          {x.text}
        </div>
      ))}
    </div>
  );
}

function DeathModal() {
  const s = game.value!;
  if (s.dead) {
    return (
      <Modal
        title={t('death.permaTitle')}
        testid="modal-death"
        footer={
          <Btn kind="primary" onClick={() => (menuOpen.value = true)}>
            {t('death.toMenu')}
          </Btn>
        }
      >
        <p>{t('death.permaText')}</p>
        <dl class="kv">
          <dt>{t('stats.days')}</dt>
          <dd class="mono">{fmt(s.day, 1)}</dd>
          <dt>{t('stats.jumps')}</dt>
          <dd class="mono">{s.stats.jumps}</dd>
          <dt>{t('stats.credits')}</dt>
          <dd class="mono">{money(s.credits)}</dd>
        </dl>
      </Modal>
    );
  }
  if (s.stats.deaths > lastDeaths.value) {
    return (
      <Modal
        title={t('death.title')}
        testid="modal-respawn"
        footer={
          <Btn kind="primary" onClick={() => (lastDeaths.value = s.stats.deaths)}>
            {t('ui.continue')}
          </Btn>
        }
      >
        <p>{s.insurance.active ? t('death.insured') : t('death.uninsured')}</p>
      </Modal>
    );
  }
  return null;
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.tagName === 'SELECT' ||
          el.isContentEditable)
      )
        return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (menuOpen.value) return;
      const s = game.value;
      if (!s) return;
      const k = e.key;
      if (k === '?' || (k === '/' && e.shiftKey)) {
        showHelp.value = !showHelp.value;
        return;
      }
      if (k === 'Escape') {
        if (showHelp.value) showHelp.value = false;
        else if (dockReport.value) dockReport.value = null;
        else if (screen.value !== 'map') go(s.location.stationId ? 'station' : 'map');
        return;
      }
      if (s.pendingEvent || s.combat || s.encounter) return;
      const nav = NAV.find((n) => n.key.toLowerCase() === k.toLowerCase());
      if (nav) {
        if (nav.id === 'station' && !s.location.stationId) return;
        go(nav.id);
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function App() {
  useShortcuts();
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }, []);
  void rev.value;
  const s = game.value;
  void settings.value;
  // the station screen only makes sense while docked (e.g. after an undock, a tow or a loaded save)
  if (s && screen.value === 'station' && !s.location.stationId) screen.value = 'system';
  const scr = screen.value;
  return (
    <>
      <StageHost />
      {stageFailed.value && (
        <div class="toasts">
          <div class="toast bad">{t('err.webgl')}</div>
        </div>
      )}
      {s && !menuOpen.value && (
        <div class={`shell ${s.combat ? 'in-combat' : ''}`}>
          <TopBar />
          <div class="main">
            <Nav />
            <div class="content" data-screen={s.combat ? 'combat' : scr}>
              {s.combat && <CombatScreen />}
              {!s.combat && scr === 'map' && <MapScreen />}
              {!s.combat && scr === 'system' && <SystemScreen />}
              {!s.combat && scr === 'station' && <StationScreen />}
              {!s.combat && scr === 'ship' && <ShipScreen />}
              {!s.combat && scr === 'cargo' && <CargoScreen />}
              {!s.combat && scr === 'crew' && <CrewScreen />}
              {!s.combat && scr === 'journal' && <JournalScreen />}
              {!s.combat && scr === 'settings' && <SettingsScreen />}
              {!s.combat &&
                !s.tutorial.done &&
                settings.value.tutorial &&
                !s.pendingEvent &&
                !eventResult.value && <Tutorial />}
            </div>
          </div>
          {s.encounter && !s.combat && !s.pendingEvent && <EncounterModal />}
          {combatSummary.value && <CombatResultModal />}
          {(s.pendingEvent || eventResult.value) && <EventModal />}
          {!s.pendingEvent && !eventResult.value && !s.encounter && !s.combat && <DockReportModal />}
          {!s.pendingEvent && !eventResult.value && !combatSummary.value && !s.combat && <DeathModal />}
          {showHelp.value && <HelpModal />}
        </div>
      )}
      {menuOpen.value && <MenuScreen />}
      <Toasts />
    </>
  );
}

void act;
void undock;
void sfx;
void plural;
void updateSettings;
