import { useState } from 'preact/hooks';
import { GOODS, MARKET_GOODS } from '../../content/goods';
import { galaxyOf } from '../../core/state';
import { fmt, money, t } from '../../i18n';
import { Btn, Empty, Panel, Stat, Tabs, Tag } from '../components';
import { game, rev, selectedSystem, screen, describeMessage } from '../store';
import { ContractCard } from './ContractsTab';
import { abandonContract } from '../../core/contractOps';
import { act } from '../store';
import { Icon } from '../Icon';

type Tab = 'contracts' | 'notes' | 'prices' | 'discoveries' | 'stats';

export function JournalScreen() {
  void rev.value;
  const s = game.value!;
  const g = galaxyOf(s);
  const [tab, setTab] = useState<Tab>('contracts');
  const [good, setGood] = useState('iron_ore');
  const active = s.contracts.filter((c) => c.state === 'active');
  const visitedStations = Object.keys(s.prices);
  const priceRows = visitedStations
    .map((sid) => ({ st: g.stationsById[sid], p: s.prices[sid][good] }))
    .filter((x) => x.p)
    .sort((a, b) => b.p.sell - a.p.sell);
  return (
    <div class="screen" data-testid="screen-journal">
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <Panel class="flush">
          <Tabs
            tabs={[
              { id: 'contracts', label: t('journal.contracts'), icon: 'contract', badge: active.length },
              { id: 'notes', label: t('journal.notes'), icon: 'journal' },
              { id: 'prices', label: t('journal.prices'), icon: 'tag' },
              { id: 'discoveries', label: t('journal.discoveries'), icon: 'scan', badge: s.discoveries.filter((d) => !d.sold).length },
              { id: 'stats', label: t('journal.stats'), icon: 'info' },
            ]}
            value={tab}
            onChange={setTab}
          />
          <div class="panel-body">
            {tab === 'contracts' && (
              <div class="stack">
                {active.length === 0 && <Empty>{t('contract.noneActive')}</Empty>}
                {active.map((c) => (
                  <ContractCard key={c.id} c={c} s={s} onAbandon={() => act((x) => abandonContract(x, c.id))} />
                ))}
                <p class="faint">{t('journal.contractsDone', { done: s.stats.contractsDone, failed: s.stats.contractsFailed })}</p>
              </div>
            )}
            {tab === 'notes' && (
              <div class="stack">
                <p class="explain">{t('journal.notesHelp')}</p>
                {s.visited.length === 0 && <Empty>{t('journal.noNotes')}</Empty>}
                {s.visited.map((id) => {
                  const sys = g.systems[id];
                  return (
                    <div key={id} class="contract-card">
                      <div class="spread">
                        <b>{sys.name}</b>
                        <Btn small icon="map" onClick={() => { selectedSystem.value = id; screen.value = 'map'; }}>{t('contract.showOnMap')}</Btn>
                      </div>
                      <div class="dim" style={{ fontSize: 12.5 }}>{sys.stations.map((x) => `${x.name} (${t(`st.${x.type}`)})`).join(', ') || t('journal.noStations')}</div>
                      <textarea
                        rows={2}
                        value={s.notes[`sys:${id}`] ?? ''}
                        placeholder={t('journal.note')}
                        onInput={(e) => {
                          s.notes[`sys:${id}`] = (e.target as HTMLTextAreaElement).value;
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            )}
            {tab === 'prices' && (
              <div class="stack">
                <select value={good} onChange={(e) => setGood((e.target as HTMLSelectElement).value)} aria-label={t('market.good')} data-testid="journal-good">
                  {MARKET_GOODS.map((x) => (
                    <option key={x.id} value={x.id}>{t(`good.${x.id}`)}</option>
                  ))}
                </select>
                <p class="explain">{t('journal.pricesHelp')}</p>
                {priceRows.length === 0 && <Empty>{t('journal.noPrices')}</Empty>}
                {priceRows.length > 0 && (
                  <div class="table-wrap">
                    <table class="data">
                      <thead>
                        <tr><th>{t('journal.station')}</th><th class="right">{t('market.buyPrice')}</th><th class="right">{t('market.sellPrice')}</th><th class="right">{t('market.stock')}</th><th class="right">{t('journal.age')}</th></tr>
                      </thead>
                      <tbody>
                        {priceRows.map(({ st, p }) => (
                          <tr key={st.id}>
                            <td>{st.name} <span class="faint">· {g.systems[st.systemId].name}</span></td>
                            <td class="right mono">{fmt(p.buy, 1)}</td>
                            <td class="right mono">{fmt(p.sell, 1)}</td>
                            <td class="right mono">{fmt(p.stock)}</td>
                            <td class={`right mono ${s.day - p.day > 15 ? 'warn' : ''}`}>{fmt(s.day - p.day, 0)} {t('unit.d')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
            {tab === 'discoveries' && (
              <div class="stack">
                <p class="explain">{t('journal.discoveriesHelp')}</p>
                {s.discoveries.length === 0 && <Empty>{t('carto.nothing')}</Empty>}
                {s.discoveries.slice().reverse().map((d) => (
                  <div class="spread" key={d.id}>
                    <span><Icon name={d.id.startsWith('body') ? 'target' : 'star'} /> {d.name} <span class="faint">· {t('top.dayShort')} {fmt(d.day, 1)}</span></span>
                    {d.sold ? <Tag tone="good">{t('journal.sold')}</Tag> : <b class="mono">{money(d.value)}</b>}
                  </div>
                ))}
              </div>
            )}
            {tab === 'stats' && (
              <div class="stack">
                <div class="stats-grid" data-testid="stats-grid">
                  <Stat label={t('stats.days')} value={fmt(s.day, 1)} />
                  <Stat label={t('stats.jumps')} value={s.stats.jumps} />
                  <Stat label={t('stats.profit')} value={money(s.stats.tradesProfit)} />
                  <Stat label={t('stats.contracts')} value={`${s.stats.contractsDone} / ${s.stats.contractsFailed}`} sub={t('stats.doneFailed')} />
                  <Stat label={t('stats.discoveries')} value={s.stats.discoveries} />
                  <Stat label={t('stats.mined')} value={s.stats.unitsMined} />
                  <Stat label={t('stats.accidents')} value={s.stats.accidents} />
                  <Stat label={t('stats.fines')} value={s.stats.fines} />
                  <Stat label={t('stats.deaths')} value={s.stats.deaths} />
                  <Stat label={t('stats.explored')} value={`${s.visited.length}/${g.systems.length}`} />
                </div>
                <h3>{t('journal.log')}</h3>
                <div class="stack" style={{ gap: 4 }}>
                  {s.messages.slice(-30).reverse().map((m, i) => (
                    <div key={i} class={m.tone === 'bad' ? 'neg' : m.tone === 'good' ? 'pos' : m.tone === 'warn' ? 'warn' : 'dim'} style={{ fontSize: 13 }}>
                      <span class="mono faint">{fmt(m.day, 1)}</span> {describeMessage(m.key, m.params)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

void GOODS;
