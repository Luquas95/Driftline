import { useEffect, useState } from 'preact/hooks';
import { createBackdropScene } from '../../render/backdrop';
import { t, fmt } from '../../i18n';
import { Btn, Panel } from '../components';
import { exportCurrent, game, importFromText, loadSlot, menuOpen, saves, startNewGame, toast } from '../store';
import { settings, updateSettings } from '../settings';
import { unlockAudio, sfx } from '../../audio/audio';
import { useScene } from '../useScene';
import type { SaveMeta } from '../../persist/store';
import type { Difficulty } from '../../core/types';

type View = 'main' | 'new' | 'load';

export function MenuScreen() {
  const [view, setView] = useState<View>('main');
  const [list, setList] = useState<SaveMeta[]>([]);
  const [seed, setSeed] = useState('');
  const [name, setName] = useState(t('menu.defaultShip'));
  const [diff, setDiff] = useState<Difficulty>({ prices: 'normal', risk: 'normal', insurance: true, permadeath: false });
  useScene(() => createBackdropScene({ spectral: 'G', starSeed: 7, tint: 2 }), []);
  useEffect(() => {
    void saves.list().then(setList);
  }, [view]);
  const auto = list.find((x) => x.id === 'autosave');

  const importFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (f) importFromText(await f.text());
    };
    input.click();
  };

  return (
    <div class="menu-screen" data-testid="menu">
      <div class="menu-card stack">
        <div>
          <h1>Driftline</h1>
          <p class="tagline">{t('menu.tagline')}</p>
        </div>
        {view === 'main' && (
          <Panel>
            <div class="stack">
              {game.value && !game.value.dead && (
                <Btn kind="primary" onClick={() => (menuOpen.value = false)} testid="menu-resume">
                  {t('menu.resume')}
                </Btn>
              )}
              {auto && (
                <Btn
                  kind={game.value ? undefined : 'primary'}
                  testid="menu-continue"
                  onClick={async () => {
                    unlockAudio();
                    await loadSlot('autosave');
                  }}
                >
                  {t('menu.continue')} <span class="dim">· {t('top.dayShort')} {auto.day}, {fmt(auto.credits)} kr</span>
                </Btn>
              )}
              <Btn kind={auto || game.value ? undefined : 'primary'} onClick={() => setView('new')} testid="menu-new">
                {t('menu.new')}
              </Btn>
              <Btn onClick={() => setView('load')} testid="menu-load">
                {t('menu.load')}
              </Btn>
              <Btn onClick={importFile}>{t('menu.import')}</Btn>
              <p class="faint right" style={{ marginTop: 6 }}>
                {t('menu.offline')}
              </p>
            </div>
          </Panel>
        )}
        {view === 'new' && (
          <Panel title={t('menu.new')}>
            <div class="stack">
              <label class="field">
                {t('menu.shipName')}
                <input type="text" value={name} maxLength={24} onInput={(e) => setName((e.target as HTMLInputElement).value)} data-testid="new-ship-name" />
              </label>
              <label class="field">
                {t('menu.seed')}
                <input type="text" value={seed} placeholder={t('menu.seedPlaceholder')} onInput={(e) => setSeed((e.target as HTMLInputElement).value)} data-testid="new-seed" />
              </label>
              <div class="field">
                {t('menu.prices')}
                <div class="seg">
                  {(['easy', 'normal', 'hard'] as const).map((v) => (
                    <button key={v} type="button" class={diff.prices === v ? 'active' : ''} onClick={() => setDiff({ ...diff, prices: v })}>
                      {t(`diff.prices.${v}`)}
                    </button>
                  ))}
                </div>
              </div>
              <div class="field">
                {t('menu.risk')}
                <div class="seg">
                  {(['low', 'normal', 'high'] as const).map((v) => (
                    <button key={v} type="button" class={diff.risk === v ? 'active' : ''} onClick={() => setDiff({ ...diff, risk: v })}>
                      {t(`diff.risk.${v}`)}
                    </button>
                  ))}
                </div>
              </div>
              <label class="row">
                <input type="checkbox" checked={diff.insurance} onChange={(e) => setDiff({ ...diff, insurance: (e.target as HTMLInputElement).checked })} />
                <span>{t('menu.insurance')}</span>
              </label>
              <label class="row">
                <input type="checkbox" checked={diff.permadeath} onChange={(e) => setDiff({ ...diff, permadeath: (e.target as HTMLInputElement).checked })} data-testid="new-permadeath" />
                <span>{t('menu.permadeath')}</span>
              </label>
              {diff.permadeath && <p class="explain neg">{t('menu.permadeathWarn')}</p>}
              <label class="row">
                <input type="checkbox" checked={settings.value.tutorial} onChange={(e) => updateSettings({ tutorial: (e.target as HTMLInputElement).checked })} />
                <span>{t('menu.tutorial')}</span>
              </label>
              <div class="row">
                <Btn onClick={() => setView('main')}>{t('ui.back')}</Btn>
                <Btn
                  kind="primary"
                  class="grow"
                  testid="menu-start"
                  onClick={() => {
                    unlockAudio();
                    sfx('success');
                    startNewGame({ seed: seed.trim() || undefined, difficulty: diff, shipName: name.trim() || t('menu.defaultShip') });
                  }}
                >
                  {t('menu.start')}
                </Btn>
              </div>
            </div>
          </Panel>
        )}
        {view === 'load' && (
          <Panel title={t('menu.load')}>
            <div class="stack">
              {list.length === 0 && <p class="empty">{t('menu.noSaves')}</p>}
              {list.map((m) => (
                <div class="row" key={m.id}>
                  <Btn class="grow" onClick={async () => (await loadSlot(m.id)) || toast(t('err.badSave'), 'bad')}>
                    <span class="grow" style={{ textAlign: 'left' }}>
                      {m.name} <span class="dim">· {m.ship} · {t('top.dayShort')} {m.day} · {fmt(m.credits)} kr · {m.seed}</span>
                    </span>
                  </Btn>
                  <Btn kind="danger" icon="close" title={t('ui.delete')} onClick={async () => { await saves.remove(m.id); setList(await saves.list()); }} />
                </div>
              ))}
              <Btn onClick={() => setView('main')}>{t('ui.back')}</Btn>
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}

void exportCurrent;
