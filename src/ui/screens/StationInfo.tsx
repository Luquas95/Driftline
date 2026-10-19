/** Station screen, "cartography" and "news" tabs: selling scan data, buying price intel, market news. */
import { STATION_TYPES_BY_ID } from '../../content/stations';
import { sellDiscoveries } from '../../core/exploration';
import { buyIntel, intelPrice } from '../../core/game';
import { galaxyOf } from '../../core/state';
import { act, describeMessage, report, toast } from '../store';
import { sfx } from '../../audio/audio';
import { fmt, money, t } from '../../i18n';
import { Btn, Empty, Panel, Tag } from '../components';
import { Icon } from '../Icon';
import type { GameState, StationStatic } from '../../core/types';

/* ---------------------------- cartography ---------------------------- */

/** Sell unsold discoveries (cartography stations only) and buy price intel where offered. */
export function CartographyTab({ s, st }: { s: GameState; st: StationStatic }) {
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

/** Running market events and the latest messages. */
export function NewsTab({ s }: { s: GameState }) {
  const g = galaxyOf(s);
  // news only reaches the player from sectors they have visited
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
