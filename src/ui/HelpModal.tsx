import { t } from '../i18n';
import { Btn, Modal } from './components';
import { showHelp } from './store';

const KEYS: [string, string][] = [
  ['M', 'help.map'],
  ['Y', 'help.system'],
  ['S', 'help.station'],
  ['L', 'help.ship'],
  ['C', 'help.cargo'],
  ['J', 'help.journal'],
  ['O', 'help.settings'],
  ['Esc', 'help.esc'],
  ['Space', 'help.space'],
  ['R', 'help.rotate'],
  ['+ / −', 'help.zoom'],
  ['?', 'help.help'],
];

export function HelpModal() {
  return (
    <Modal title={t('help.title')} onClose={() => (showHelp.value = false)} testid="modal-help" footer={<Btn kind="primary" onClick={() => (showHelp.value = false)}>{t('ui.close')}</Btn>}>
      <div class="help-keys">
        {KEYS.map(([k, d]) => (
          <>
            <span key={`${k}-k`}><kbd>{k}</kbd></span>
            <span key={`${k}-d`}>{t(d)}</span>
          </>
        ))}
      </div>
      <h3 style={{ margin: '14px 0 6px' }}>{t('help.touch')}</h3>
      <p class="dim">{t('help.touchText')}</p>
      <h3 style={{ margin: '14px 0 6px' }}>{t('help.basics')}</h3>
      <p class="dim">{t('help.basicsText')}</p>
    </Modal>
  );
}
