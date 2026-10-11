import { ACHIEVEMENTS } from '../../content/achievements';
import { dictionary, understanding } from '../../core/lang';
import { consumedShare, gripLevel, spreadSpeed } from '../../core/threat';
import { galaxyOf } from '../../core/state';
import { t, fmt } from '../../i18n';
import { Bar, Empty, Stat, Tag } from '../components';
import { game, profile, rev } from '../store';

export function StoryTab() {
  void rev.value;
  const s = game.value!;
  const log = s.story.log.filter((x) => !x.key.startsWith('ending.'));
  return (
    <div class="stack" data-testid="journal-story">
      <div class="contract-card">
        <b>{t('journal.hintTitle')}</b>
        <p style={{ margin: '4px 0 0' }}>{t(`journal.hint.${Math.min(5, s.story.stage)}`)}</p>
      </div>
      <h3>{t('ending.decisions')}</h3>
      {log.length === 0 && <Empty>{t('ending.noDecisions')}</Empty>}
      {log.map((x, i) => (
        <div key={i} class="dim">
          <span class="mono faint">{Math.floor(x.day)}</span> · {t(x.key)}
        </div>
      ))}
      <p class="faint">{t('journal.artifacts', { n: s.story.artifacts })}</p>
    </div>
  );
}

export function LanguageTab() {
  void rev.value;
  const s = game.value!;
  const rows = dictionary(s);
  const pct = Math.round(understanding(s) * 100);
  return (
    <div class="stack" data-testid="journal-lang">
      <p class="explain">{t('journal.langHelp')}</p>
      <div class="spread">
        <span>{t('journal.langKnown', { n: rows.filter((r) => r.known).length, max: rows.length })}</span>
        <b class="mono">{pct} %</b>
      </div>
      <Bar value={pct} max={100} />
      <div class="dict-grid">
        {rows.map((r) => (
          <div key={r.id} class={`dict-row ${r.known ? 'known' : ''}`}>
            <span class="alien" aria-label={r.latin}>
              {r.glyphs}
            </span>
            <span class="faint mono">{r.latin}</span>
            <span>{r.known ? r.cs : '???'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ThreatTab() {
  void rev.value;
  const s = game.value!;
  const g = galaxyOf(s);
  const share = consumedShare(s);
  const here = s.threat.grip[s.location.systemId] ?? 0;
  const touched = Object.keys(s.threat.grip).length;
  const started = s.day >= s.threat.start;
  return (
    <div class="stack" data-testid="journal-threat">
      <p class="explain">{t('threat.help')}</p>
      <div class="stats-grid">
        <Stat
          label={t('threat.consumed')}
          value={`${Math.round(share * 100)} %`}
          tone={share > 0.4 ? 'neg' : ''}
        />
        <Stat label={t('threat.touched')} value={`${touched}/${g.systems.length}`} />
        <Stat
          label={t('threat.speed')}
          value={started ? `×${fmt(spreadSpeed(s, s.day), 2)}` : t('threat.sleeping')}
        />
        <Stat
          label={t('threat.mitigation')}
          value={`${Math.round(s.threat.mitigation * 100)} %`}
          tone="pos"
        />
        <Stat label={t('threat.here')} value={t(`threat.level.${gripLevel(here)}`)} />
      </div>
      <Bar value={share * 100} max={100} tone={share > 0.5 ? 'bad' : 'warn'} />
      {s.threat.stopped && <Tag tone="good">{t('threat.stopped')}</Tag>}
    </div>
  );
}

export function AchievementsTab() {
  void rev.value;
  const p = profile.value;
  const s = game.value!;
  const have = (id: string) => !!p.ach[id] || s.ach[id] !== undefined;
  const n = ACHIEVEMENTS.filter((a) => have(a.id)).length;
  return (
    <div class="stack" data-testid="journal-ach">
      <div class="spread">
        <b>{t('ach.title')}</b>
        <span class="mono">
          {n}/{ACHIEVEMENTS.length}
        </span>
      </div>
      <div class="ach-grid">
        {ACHIEVEMENTS.map((a) => {
          const ok = have(a.id);
          return (
            <div key={a.id} class={`ach ${ok ? 'on' : ''}`} data-testid={`ach-${a.id}`}>
              <b>{t(`ach.${a.id}`)}</b>
              <div class="dim" style={{ fontSize: 12.5 }}>
                {t(`ach.${a.id}.desc`)}
              </div>
              <span class="faint" style={{ fontSize: 11.5 }}>
                {ok ? t('ach.unlocked') : t('ach.locked')} · {t(`ach.cat.${a.cat}`)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
