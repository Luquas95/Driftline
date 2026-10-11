import { Fragment } from 'preact';
import { endingSummary, markEndingSeen } from '../core/endings';
import { t, fmt } from '../i18n';
import { Btn } from './components';
import { FactionCrest } from './FactionCrest';
import { game, menuOpen, rev, scheduleAutosave } from './store';
import type { FactionId } from '../core/worldTypes';

/** Final summary: shown once per saving ending (and always for a lost galaxy), then the player may go on. */
export function EndingScreen() {
  void rev.value;
  const s = game.value!;
  const sum = endingSummary(s);
  if (!sum) return null;
  return (
    <div
      class={`ending-screen ${sum.tone}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ending-title"
      data-testid="ending-screen"
    >
      <div class="ending-card stack">
        <h1 id="ending-title" data-testid="ending-title">
          {t(`ending.${sum.id}`)}
        </h1>
        <p class="ending-text">{t(`ending.${sum.id}.text`)}</p>
        <h3>{t('ending.stats')}</h3>
        <dl class="kv ending-stats">
          {sum.stats.map((x) => (
            <Fragment key={x.key}>
              <dt>{t(`ending.stat.${x.key}`)}</dt>
              <dd class="mono">{fmt(x.value)}</dd>
            </Fragment>
          ))}
        </dl>
        <h3>{t('ending.decisions')}</h3>
        {sum.decisions.length === 0 && <p class="dim">{t('ending.noDecisions')}</p>}
        <ul class="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 3 }}>
          {sum.decisions.map((d, i) => (
            <li key={i} class="dim">
              {t(d)}
            </li>
          ))}
        </ul>
        <h3>{t('ending.crew')}</h3>
        <ul class="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 3 }}>
          {sum.crew.map((c, i) => (
            <li key={i}>
              <b>{c.name}</b>{' '}
              <span class="dim">
                · {t(`role.${c.role}`)} · {t(c.fate)}
              </span>
            </li>
          ))}
        </ul>
        <h3>{t('ending.factions')}</h3>
        <div class="row wrap">
          {sum.factions.map((f) => (
            <span key={f.faction} class="row" title={t(`fac.${f.faction}`)}>
              <FactionCrest id={f.faction as FactionId} size={28} />
              <span class="mono dim">{f.rep}</span>
            </span>
          ))}
        </div>
        <div class="ending-footer">
          <p class="explain">{sum.freePlay ? t('ending.freePlayHelp') : t('ending.noFreePlay')}</p>
          <div class="row ending-actions">
            {sum.freePlay && (
              <Btn
                kind="primary"
                testid="ending-continue"
                onClick={() => {
                  markEndingSeen(s);
                  rev.value++;
                  scheduleAutosave(s);
                }}
              >
                {t('ending.continue')}
              </Btn>
            )}
            <Btn
              kind={sum.freePlay ? undefined : 'primary'}
              testid="ending-new"
              onClick={() => (menuOpen.value = true)}
            >
              {t('ending.newGame')}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
