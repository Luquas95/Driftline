import { signal } from '@preact/signals';
import { EVENTS_BY_ID } from '../content/events';
import { choiceAvailable, resolveEvent } from '../core/events';
import type { Effect } from '../core/eventTypes';
import { t, fmt } from '../i18n';
import { Btn, Modal } from './components';
import { act, game, report, rev } from './store';
import { sfx } from '../audio/audio';
import { Icon } from './Icon';

function effectLine(e: Effect): { text: string; tone: 'pos' | 'neg' | '' } | null {
  const sign = (n: number) => (n > 0 ? '+' : '') + fmt(n);
  switch (e.t) {
    case 'credits':
      return { text: `${t('fx.credits')} ${sign(e.n)} kr`, tone: e.n >= 0 ? 'pos' : 'neg' };
    case 'creditsPct':
      return {
        text: `${t('fx.credits')} ${sign(Math.round(e.pct * 100))} %`,
        tone: e.pct >= 0 ? 'pos' : 'neg',
      };
    case 'fuel':
      return { text: `${t('fx.fuel')} ${sign(e.n)}`, tone: e.n >= 0 ? 'pos' : 'neg' };
    case 'supplies':
      return { text: `${t('fx.supplies')} ${sign(e.n)}`, tone: e.n >= 0 ? 'pos' : 'neg' };
    case 'hull':
      return { text: `${t('fx.hull')} ${sign(e.n)}`, tone: e.n >= 0 ? 'pos' : 'neg' };
    case 'wear':
      return { text: e.n > 0 ? t('fx.wearDown') : t('fx.wearUp'), tone: e.n > 0 ? 'neg' : 'pos' };
    case 'goods':
      return { text: `${t(`good.${e.goodId}`)} ${sign(e.qty)}`, tone: e.qty >= 0 ? 'pos' : 'neg' };
    case 'loseCargo':
      return { text: t('fx.loseCargo', { pct: Math.round(e.frac * 100) }), tone: 'neg' };
    case 'module':
      return { text: t('fx.module'), tone: 'pos' };
    case 'reveal':
      return { text: t('fx.reveal'), tone: 'pos' };
    case 'days':
      return { text: `${t('fx.days')} ${e.n > 0 ? '+' : ''}${fmt(e.n, 1)}`, tone: e.n > 0 ? 'neg' : 'pos' };
    case 'rep':
      return { text: `${t('fx.rep')} ${sign(e.n)}`, tone: e.n >= 0 ? 'pos' : 'neg' };
    case 'probes':
      return { text: `${t('fx.probes')} ${sign(e.n)}`, tone: e.n >= 0 ? 'pos' : 'neg' };
    case 'discover':
      return { text: t('fx.discover'), tone: 'pos' };
    case 'crewHurt':
      return { text: t('fx.crewHurt', { n: e.n }), tone: 'neg' };
    case 'crewXp':
      return { text: t('fx.crewXp'), tone: 'pos' };
    case 'crewMorale':
      return { text: `${t('fx.morale')} ${sign(e.n)}`, tone: e.n >= 0 ? 'pos' : 'neg' };
    case 'crewLeave':
      return { text: t('fx.crewLeave'), tone: 'neg' };
    case 'crewJoin':
      return { text: t('fx.crewJoin'), tone: 'pos' };
    case 'fight':
      return { text: t('fx.fight'), tone: 'neg' };
    case 'death':
      return { text: t('fx.death'), tone: 'neg' };
    default:
      return null;
  }
}

export const eventResult = signal<{ eventId: string; textKey: string; effects: Effect[] } | null>(null);

export function EventModal() {
  void rev.value;
  const s = game.value!;
  const res = eventResult.value;
  const pe = s.pendingEvent;
  const ev = EVENTS_BY_ID[res?.eventId ?? pe?.eventId ?? ''];
  if (!ev) {
    eventResult.value = null;
    return null;
  }
  if (res) {
    const lines = res.effects.map(effectLine).filter((x): x is NonNullable<typeof x> => !!x);
    return (
      <Modal
        title={t(ev.titleKey)}
        testid="modal-event-result"
        footer={
          <Btn kind="primary" onClick={() => (eventResult.value = null)} testid="event-ok">
            {t('ui.continue')}
          </Btn>
        }
      >
        <p>{t(res.textKey)}</p>
        {lines.length > 0 && (
          <ul class="stack" style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', gap: 4 }}>
            {lines.map((l, i) => (
              <li key={i} class={l.tone}>
                <Icon name={l.tone === 'neg' ? 'warning' : 'check'} size={14} /> {l.text}
              </li>
            ))}
          </ul>
        )}
      </Modal>
    );
  }
  return (
    <Modal title={t(ev.titleKey)} testid="modal-event">
      <p>{t(ev.textKey)}</p>
      <div style={{ marginTop: 12 }}>
        {ev.choices.map((c, i) => {
          const avail = choiceAvailable(s, ev, i);
          return (
            <Btn
              key={i}
              class="choice"
              disabled={!avail}
              testid={`event-choice-${i}`}
              onClick={() => {
                const r = act((st) => resolveEvent(st, i));
                if (report(r) && r.ok) {
                  sfx('alert');
                  eventResult.value = {
                    eventId: ev.id,
                    textKey: r.outcome.textKey,
                    effects: r.outcome.summary,
                  };
                }
              }}
            >
              {t(c.textKey)}
              {!avail && <span class="faint"> · {t('event.locked')}</span>}
            </Btn>
          );
        })}
      </div>
    </Modal>
  );
}
