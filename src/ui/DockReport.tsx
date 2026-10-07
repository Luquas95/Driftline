import { signal } from '@preact/signals';
import type { DockReport } from '../core/game';
import { t, money } from '../i18n';
import { Btn, Modal } from './components';
import { Icon } from './Icon';

export const dockReport = signal<DockReport | null>(null);

export function DockReportModal() {
  const r = dockReport.value;
  if (!r) return null;
  if (!r.completed.length && !r.inspection) {
    dockReport.value = null;
    return null;
  }
  return (
    <Modal title={t('dock.reportTitle')} testid="modal-dockreport" footer={<Btn kind="primary" onClick={() => (dockReport.value = null)} testid="dockreport-ok">{t('ui.continue')}</Btn>}>
      {r.completed.length > 0 && (
        <div class="stack">
          <h3>{t('dock.completed')}</h3>
          {r.completed.map((c) => (
            <div key={c.contract.id} class="spread">
              <span>
                <Icon name="check" class="pos" /> {t(`contract.kind.${c.contract.kind}`)}
              </span>
              <b class="mono pos">+{money(c.payout)}</b>
            </div>
          ))}
          {r.completed.length > 1 && <p class="explain">{t('dock.bundleBonus')}</p>}
        </div>
      )}
      {r.inspection && (
        <div class="stack" style={{ marginTop: 12 }}>
          <h3 class="neg">{t('dock.inspection')}</h3>
          <p>{t('dock.inspectionText', { fine: money(r.inspection.fine), value: money(r.inspection.confiscated) })}</p>
        </div>
      )}
    </Modal>
  );
}
