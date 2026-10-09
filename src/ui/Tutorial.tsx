import { useEffect } from 'preact/hooks';
import { t } from '../i18n';
import { Btn } from './components';
import { game, rev, screen, go } from './store';
import { updateSettings } from './settings';

const STEPS = 6;

function satisfied(step: number, s: NonNullable<typeof game.value>): boolean {
  switch (step) {
    case 0:
      // the first outfit: any module beyond the basic five core ones, or the player moves on
      return s.ship.slots.filter(Boolean).length > 5 || !!s.flags['tut:shipok'];
    case 1:
      return !!s.flags['tut:bought'] || s.cargo.some((c) => !c.contractId);
    case 2:
      return s.stats.jumps >= 1;
    case 3:
      return !!s.flags['tut:sold'];
    case 4:
      return s.contracts.length > 0 || s.stats.contractsDone > 0;
    default:
      return false;
  }
}

/** Short contextual hints that advance by themselves when the player does the thing. */
export function Tutorial() {
  void rev.value;
  const s = game.value!;
  const step = s.tutorial.step;
  useEffect(() => {
    if (step < STEPS - 1 && satisfied(step, s)) {
      s.tutorial.step = step + 1;
      rev.value++;
    }
  });
  if (step >= STEPS) return null;
  const finish = () => {
    s.tutorial.done = true;
    rev.value++;
  };
  return (
    <aside class="hint-card" data-testid="tutorial" role="status">
      <div class="spread">
        <h3>
          {t('tut.title')} {step + 1}/{STEPS}
        </h3>
        <button class="btn small ghost" type="button" onClick={finish} data-testid="tutorial-skip">
          {t('tut.skip')}
        </button>
      </div>
      <p style={{ margin: '4px 0 8px' }}>{t(`tut.step${step}`)}</p>
      <div class="row wrap">
        {step === 0 && (
          <>
            <Btn small onClick={() => go('ship')}>
              {t('nav.ship')}
            </Btn>
            <Btn
              small
              kind="primary"
              testid="tutorial-next"
              onClick={() => {
                s.flags['tut:shipok'] = true;
                rev.value++;
              }}
            >
              {t('tut.next')}
            </Btn>
          </>
        )}
        {step === 1 && s.location.stationId && screen.value !== 'station' && (
          <Btn small onClick={() => go('station')}>
            {t('tut.openStation')}
          </Btn>
        )}
        {step === 2 && screen.value !== 'map' && (
          <Btn small onClick={() => go('map')}>
            {t('tut.openMap')}
          </Btn>
        )}
        {step === 5 && (
          <>
            <Btn small onClick={() => go('ship')}>
              {t('nav.ship')}
            </Btn>
            <Btn small onClick={() => go('cargo')}>
              {t('nav.cargo')}
            </Btn>
            <Btn
              small
              kind="primary"
              onClick={() => {
                finish();
                updateSettings({ tutorial: false });
              }}
              testid="tutorial-done"
            >
              {t('tut.done')}
            </Btn>
          </>
        )}
      </div>
    </aside>
  );
}
