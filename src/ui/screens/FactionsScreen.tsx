import { FACTIONS, RANK_MERIT } from '../../content/factions';
import { activeWars, joinFaction, leaveFaction, rankName } from '../../core/factions';
import { repOf, territorySizes, tierOf } from '../../core/territory';
import { galaxyOf } from '../../core/state';
import { createBackdropScene } from '../../render/backdrop';
import { plural, t } from '../../i18n';
import { Btn, Empty, Panel, Tag } from '../components';
import { FactionCrest } from '../FactionCrest';
import { act, describeMessage, game, report, rev } from '../store';
import { useScene } from '../useScene';
import type { FactionId } from '../../core/worldTypes';

const TIER_TONE: Record<string, string> = {
  enemy: 'bad',
  hostile: 'warn',
  neutral: '',
  friendly: 'good',
  ally: 'good',
};

function RepBar({ rep }: { rep: number }) {
  const pos = (rep + 100) / 2;
  return (
    <div
      class="rep-bar"
      role="progressbar"
      aria-valuenow={Math.round(rep)}
      aria-valuemin={-100}
      aria-valuemax={100}
    >
      <div class="rep-mid" />
      <div class="rep-mark" style={{ left: `${pos}%` }} />
    </div>
  );
}

export function FactionsScreen() {
  void rev.value;
  useScene(() => createBackdropScene({ tint: 1 }), []);
  const s = game.value!;
  const sizes = territorySizes(s);
  const wars = activeWars(s);
  return (
    <div class="screen" data-testid="screen-factions">
      <div class="stack" style={{ maxWidth: 1000, margin: '0 auto' }}>
        <Panel title={t('fac.title')} icon="star">
          <p class="explain">{t('fac.help')}</p>
          <div class="fac-grid">
            {FACTIONS.map((f) => {
              const rep = repOf(s, f.id);
              const tier = tierOf(rep);
              const member = s.fac.member === f.id;
              return (
                <div key={f.id} class={`fac-card ${member ? 'member' : ''}`} data-testid={`fac-${f.id}`}>
                  <div class="row">
                    <FactionCrest id={f.id} size={56} />
                    <div class="grow">
                      <b>{t(`fac.${f.id}`)}</b>
                      <div class="dim" style={{ fontSize: 12.5 }}>
                        {t('fac.territory', {
                          n: `${sizes[f.id]} ${plural(sizes[f.id], 'systém', 'systémy', 'systémů')}`,
                        })}
                      </div>
                    </div>
                    <Tag tone={TIER_TONE[tier]}>{t(`fac.tier.${tier}`)}</Tag>
                  </div>
                  <p class="dim" style={{ fontSize: 13 }}>
                    {t(`fac.${f.id}.desc`)}
                  </p>
                  <RepBar rep={rep} />
                  <div class="spread faint" style={{ fontSize: 12 }}>
                    <span>{t('fac.standing')}</span>
                    <span class="mono">{Math.round(rep)}</span>
                  </div>
                  {member ? (
                    <div class="stack" style={{ gap: 4 }}>
                      <div>
                        <b>{t(rankName(f.id, s.fac.rank))}</b>{' '}
                        <span class="dim">
                          {s.fac.rank >= 5
                            ? t('fac.maxRank')
                            : t('fac.merit', { n: s.fac.merit, next: RANK_MERIT[s.fac.rank + 1] })}
                        </span>
                      </div>
                      <Btn
                        small
                        kind="danger"
                        testid={`fac-leave`}
                        onClick={() => report(act((x) => leaveFaction(x)))}
                      >
                        {t('fac.leave')}
                      </Btn>
                    </div>
                  ) : (
                    <Btn
                      small
                      testid={`fac-join-${f.id}`}
                      disabled={!!s.fac.member || rep < 15}
                      title={rep < 15 ? t('err.facRepLow') : undefined}
                      onClick={() => report(act((x) => joinFaction(x, f.id as FactionId)))}
                    >
                      {t('fac.join')}
                    </Btn>
                  )}
                  <div class="faint" style={{ fontSize: 12 }}>
                    {t('fac.hullHint', { hull: t(`hull.${f.exclusiveHull}`) })}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
        <Panel title={t('fac.wars')} icon="target">
          {wars.length === 0 && <Empty>{t('fac.noWars')}</Empty>}
          {wars.map((w) => (
            <div key={w.id} class="contract-card row">
              <FactionCrest id={w.a} size={32} />
              <span class="grow">
                {describeMessage('fac.warLine', { a: w.a, b: w.b, end: Math.ceil(w.end) })}
              </span>
              <FactionCrest id={w.b} size={32} />
            </div>
          ))}
        </Panel>
        <Panel title={t('fac.history')}>
          {s.fac.history.length === 0 && <Empty>{t('ui3.none')}</Empty>}
          <ul class="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 3 }}>
            {[...s.fac.history]
              .reverse()
              .slice(0, 14)
              .map((h, i) => (
                <li key={i} class="dim">
                  <span class="mono">{Math.floor(h.day)}</span> ·{' '}
                  {describeMessage(
                    `fac.hist.${h.key}`,
                    typeof h.params?.system === 'number'
                      ? { ...h.params, system: galaxyOf(s).systems[h.params.system]?.name ?? '?' }
                      : h.params,
                  )}
                </li>
              ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
