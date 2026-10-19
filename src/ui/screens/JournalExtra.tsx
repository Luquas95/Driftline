/** Journal screen tabs added in v4: story progress, alien language, the Grey threat and achievements. */
import { ACHIEVEMENTS } from '../../content/achievements';
import { dictionary, understanding } from '../../core/lang';
import { consumedShare, gripLevel, spreadSpeed } from '../../core/threat';
import { galaxyOf } from '../../core/state';
import { t, fmt } from '../../i18n';
import { Bar, Empty, Stat, Tag } from '../components';
import { Icon } from '../Icon';
import { STORY_BEATS } from '../../content/story';
import { evalCond } from '../../core/events';
import type { Cond } from '../../core/eventTypes';
import type { GameState } from '../../core/types';
import { game, profile, rev } from '../store';

/** Czech label of an ending condition (the stage condition is the gate itself, not listed). */
function condLabel(c: Cond): string | null {
  switch (c.t) {
    case 'story':
      return null;
    case 'atBase':
      return t('cond.atBase');
    case 'building':
      return t('cond.building', { b: t(`bld.${c.id}`), n: c.min });
    case 'tech':
      return t('cond.tech', { tech: t(`tech.${c.id}`) });
    case 'artifactsMin':
      return t('cond.artifacts', { n: c.n });
    case 'gripHere':
      return t('cond.grip', { n: c.min });
    case 'langMin':
      return t('cond.lang', { n: Math.round(c.frac * 100) });
    case 'hasHull':
      return t('cond.hull', { hull: t(`hull.${c.id}`) });
    case 'fleetMin':
      return t('cond.fleet', { n: c.n });
    case 'owner':
      return t('cond.owner', { f: t(`fac.${c.f}`) });
    case 'fMember':
      return t('cond.member', { f: c.f ? t(`fac.${c.f}`) : '' });
    case 'fRank':
      return t('cond.rank', { n: c.min });
    case 'creditsMin':
      return t('cond.credits', { n: fmt(c.n) });
    default:
      return null;
  }
}

/** Checklist of every ending's conditions, evaluated live with the same evalCond the story engine uses. */
function EndingGoals({ s }: { s: GameState }) {
  const ends = STORY_BEATS.filter((b) => b.id.startsWith('end_'));
  return (
    <div class="stack" data-testid="ending-goals">
      <h3>{t('journal.goals')}</h3>
      <p class="explain">{t('journal.goalsHelp')}</p>
      {ends.map((b) => (
        <div key={b.id} class="contract-card">
          <b>{t(`ending.${b.id.slice(4)}`)}</b>
          <ul class="checklist">
            {b.when.map((c, i) => {
              const label = condLabel(c);
              if (!label) return null;
              const ok = evalCond(s, c);
              return (
                <li key={i} class={ok ? 'pos' : 'dim'}>
                  <Icon name={ok ? 'check' : 'close'} size={14} /> {label}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Story tab: stage hint, ending goals (from stage 5 until an ending), decisions log. */
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
      {s.story.stage >= 5 && !s.ending && <EndingGoals s={s} />}
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

/** Language tab: dictionary of alien words; unknown meanings stay hidden. */
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

/** Threat tab: how far the Grey has spread and how fast (core/threat.ts). */
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

/** Achievements tab: union of the cross-run profile and this run's unlocks. */
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
