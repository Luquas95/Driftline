import { useState } from 'preact/hooks';
import { STATION_TYPES_BY_ID } from '../../content/stations';
import { createBackdropScene } from '../../render/backdrop';
import { undock } from '../../core/game';
import { act, galaxy, game, launchFlag, rev, screen } from '../store';
import { useScene } from '../useScene';
import { Btn, Empty, Panel, Tabs, Tag } from '../components';
import { t } from '../../i18n';
import { ShipyardTab } from './ShipyardTab';
import { ContractsTab } from './ContractsTab';
import { MarketTab } from './StationMarket';
import { RepairsTab } from './StationRepairs';
import { CartographyTab, NewsTab } from './StationInfo';

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
                  launchFlag.pending = true;
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
