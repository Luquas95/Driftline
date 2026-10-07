import { useEffect, useState } from 'preact/hooks';
import { createBackdropScene } from '../../render/backdrop';
import { useScene } from '../useScene';
import { fmt, t } from '../../i18n';
import { Btn, Panel } from '../components';
import { exportCurrent, game, importFromText, loadSlot, menuOpen, rev, saves, toast } from '../store';
import { settings, updateSettings } from '../settings';
import { sfx } from '../../audio/audio';
import type { SaveMeta } from '../../persist/store';

const SLOTS = ['slot1', 'slot2', 'slot3'];

export function SettingsScreen() {
  void rev.value;
  useScene(() => createBackdropScene({ tint: 5 }), []);
  const s = game.value!;
  const set = settings.value;
  const [list, setList] = useState<SaveMeta[]>([]);
  const refresh = () => void saves.list().then(setList);
  useEffect(refresh, []);

  const download = () => {
    const txt = exportCurrent();
    if (!txt) return;
    const blob = new Blob([txt], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `driftline-${s.seed}-den${Math.floor(s.day)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast(t('settings.exported'), 'good');
  };
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
  const slider = (key: 'master' | 'ambient' | 'sfx', label: string) => (
    <label class="field">
      <span class="spread">
        <span>{label}</span>
        <span class="mono">{Math.round(set[key] * 100)} %</span>
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={set[key]}
        onInput={(e) => updateSettings({ [key]: Number((e.target as HTMLInputElement).value) })}
        aria-label={label}
      />
    </label>
  );
  return (
    <div class="screen" data-testid="screen-settings">
      <div class="layout-2" style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div class="stack">
          <Panel title={t('settings.sound')} icon="sound">
            <div class="stack">
              <label class="row">
                <input
                  type="checkbox"
                  checked={set.muted}
                  onChange={(e) => updateSettings({ muted: (e.target as HTMLInputElement).checked })}
                  data-testid="mute"
                />
                <span>{t('settings.mute')}</span>
              </label>
              {slider('master', t('settings.master'))}
              {slider('ambient', t('settings.ambient'))}
              {slider('sfx', t('settings.sfx'))}
              <Btn small onClick={() => sfx('success')}>
                {t('settings.testSound')}
              </Btn>
            </div>
          </Panel>
          <Panel title={t('settings.display')} icon="settings">
            <div class="stack">
              <div class="field">
                {t('settings.motion')}
                <div class="seg">
                  {(['auto', 'reduced', 'full'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      class={set.motion === v ? 'active' : ''}
                      onClick={() => updateSettings({ motion: v })}
                      data-testid={`motion-${v}`}
                    >
                      {t(`settings.motion.${v}`)}
                    </button>
                  ))}
                </div>
              </div>
              <div class="field">
                {t('settings.contrast')}
                <div class="seg">
                  {(['normal', 'high'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      class={set.contrast === v ? 'active' : ''}
                      onClick={() => updateSettings({ contrast: v })}
                      data-testid={`contrast-${v}`}
                    >
                      {t(`settings.contrast.${v}`)}
                    </button>
                  ))}
                </div>
              </div>
              <label class="row">
                <input
                  type="checkbox"
                  checked={set.tutorial}
                  onChange={(e) => {
                    updateSettings({ tutorial: (e.target as HTMLInputElement).checked });
                    if ((e.target as HTMLInputElement).checked) {
                      s.tutorial = { step: 0, done: false };
                      rev.value++;
                    }
                  }}
                />
                <span>{t('settings.tutorial')}</span>
              </label>
            </div>
          </Panel>
          <Panel title={t('settings.galaxy')} icon="map">
            <dl class="kv">
              <dt>{t('settings.seed')}</dt>
              <dd class="mono" data-testid="seed-display">
                {s.seed}
              </dd>
              <dt>{t('settings.difficulty')}</dt>
              <dd>
                {t(`diff.prices.${s.difficulty.prices}`)} · {t(`diff.risk.${s.difficulty.risk}`)}
              </dd>
              <dt>{t('menu.insurance')}</dt>
              <dd>{s.difficulty.insurance ? t('ui.yes') : t('ui.no')}</dd>
              <dt>{t('menu.permadeath')}</dt>
              <dd>{s.difficulty.permadeath ? t('ui.yes') : t('ui.no')}</dd>
            </dl>
            <div class="row wrap" style={{ marginTop: 10 }}>
              <Btn
                small
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(s.seed);
                    toast(t('settings.seedCopied'), 'good');
                  } catch {
                    toast(s.seed, 'info');
                  }
                }}
              >
                {t('settings.copySeed')}
              </Btn>
            </div>
            <p class="explain">{t('settings.seedHelp')}</p>
          </Panel>
        </div>
        <div class="stack">
          <Panel title={t('settings.saves')} icon="save">
            <div class="stack">
              <label class="row">
                <input
                  type="checkbox"
                  checked={set.autosave}
                  onChange={(e) => updateSettings({ autosave: (e.target as HTMLInputElement).checked })}
                />
                <span>{t('settings.autosave')}</span>
              </label>
              {[...SLOTS].map((id, i) => {
                const m = list.find((x) => x.id === id);
                return (
                  <div class="spread" key={id}>
                    <span>
                      {t('settings.slot', { n: i + 1 })}{' '}
                      {m ? (
                        <span class="dim">
                          · {t('top.dayShort')} {m.day} · {fmt(m.credits)} kr
                        </span>
                      ) : (
                        <span class="faint">· {t('settings.empty')}</span>
                      )}
                    </span>
                    <span class="row">
                      <Btn
                        small
                        onClick={async () => {
                          await saves.put(id, s, t('settings.slot', { n: i + 1 }));
                          refresh();
                          toast(t('settings.saved'), 'good');
                        }}
                        testid={`save-${id}`}
                      >
                        {t('settings.save')}
                      </Btn>
                      <Btn
                        small
                        disabled={!m}
                        onClick={async () => {
                          await loadSlot(id);
                        }}
                        testid={`load-${id}`}
                      >
                        {t('settings.load')}
                      </Btn>
                    </span>
                  </div>
                );
              })}
              <div class="row wrap">
                <Btn small icon="save" onClick={download} testid="btn-export">
                  {t('settings.export')}
                </Btn>
                <Btn small onClick={importFile}>
                  {t('settings.import')}
                </Btn>
              </div>
              <p class="explain">{t('settings.savesHelp')}</p>
            </div>
          </Panel>
          <Panel title={t('settings.game')} icon="station">
            <div class="stack">
              <Btn onClick={() => (menuOpen.value = true)} testid="btn-menu">
                {t('settings.toMenu')}
              </Btn>
              <p class="faint">Driftline v1.0 · {t('settings.license')}</p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
