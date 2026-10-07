import { ENEMIES_BY_ID } from '../content/enemies';
import type { EncounterOption } from '../core/combat/types';
import { fmt, money, t } from '../i18n';
import { Btn, Modal, Tag } from './components';
import { combatSummary, pickEncounterOption } from './combatCtl';
import { game, rev } from './store';

const OPT_ICON: Record<string, string> = {
  fight: 'power',
  flee: 'jump',
  bribe: 'credits',
  negotiate: 'contract',
  pay: 'credits',
  evade: 'jump',
};

/** The dialogue shown when something hostile shows up: fight, run, pay or talk. */
export function EncounterModal() {
  void rev.value;
  const s = game.value!;
  const enc = s.encounter!;
  const def = ENEMIES_BY_ID[enc.enemyDefs[0]];
  const names = enc.enemyDefs.map((id) => t(`enemy.${id}`)).join(', ');
  return (
    <Modal title={t(`enc.${enc.kind}.title`)} testid="modal-encounter">
      <p>{t(`enc.${enc.kind}.text`, { ship: names })}</p>
      <div class="row wrap" style={{ marginBottom: 8 }}>
        <Tag tone="bad">{t('enc.tier', { n: enc.tier })}</Tag>
        {def && <Tag>{t(`combat.pers.${def.personality}`)}</Tag>}
        {enc.enemyDefs.length > 1 && <Tag tone="warn">{t('enc.multi', { n: enc.enemyDefs.length })}</Tag>}
      </div>
      <div class="enc-options">
        {enc.options.map((o: EncounterOption) => (
          <Btn
            key={o.id}
            icon={OPT_ICON[o.id]}
            kind={o.id === 'fight' ? 'danger' : undefined}
            disabled={!!o.cost && s.credits < o.cost}
            testid={`enc-${o.id}`}
            onClick={() => pickEncounterOption(o.id)}
          >
            <span>
              {t(`enc.opt.${o.id}`)}
              {o.cost ? ` (${money(o.cost)})` : ''}
              {o.chance !== undefined && o.id !== 'fight' ? (
                <small class="dim"> · {t('enc.chance', { pct: Math.round(o.chance * 100) })}</small>
              ) : null}
            </span>
          </Btn>
        ))}
      </div>
    </Modal>
  );
}

/** Result of a fight: loot, repairs needed, losses. */
export function CombatResultModal() {
  const r = combatSummary.value;
  if (!r) return null;
  const good = r.outcome === 'victory' || r.outcome === 'surrender';
  return (
    <Modal
      title={t(`combat.result.${r.outcome}`)}
      testid="modal-combat-result"
      footer={
        <Btn kind="primary" testid="btn-result-ok" onClick={() => (combatSummary.value = null)}>
          {t('ui.continue')}
        </Btn>
      }
    >
      <p>{t(`combat.result.${r.outcome}.text`)}</p>
      <dl class="kv">
        {good && (
          <>
            <dt>{t('combat.loot.credits')}</dt>
            <dd class="mono">{money(r.credits)}</dd>
            {r.fuel > 0 && (
              <>
                <dt>{t('combat.loot.fuel')}</dt>
                <dd class="mono">+{fmt(r.fuel)}</dd>
              </>
            )}
            {r.goods.length > 0 && (
              <>
                <dt>{t('combat.loot.goods')}</dt>
                <dd>{r.goods.map((g) => `${t(`good.${g.goodId}`)} ×${g.qty}`).join(', ')}</dd>
              </>
            )}
            {r.modules.length > 0 && (
              <>
                <dt>{t('combat.loot.modules')}</dt>
                <dd>
                  {r.modules
                    .map((m) => `${t(`mod.${m.replace(/_[sml]$/, '')}`)} ${m.slice(-1).toUpperCase()}`)
                    .join(', ')}
                </dd>
              </>
            )}
          </>
        )}
        {r.tribute > 0 && (
          <>
            <dt>{t('combat.loot.tribute')}</dt>
            <dd class="mono neg">−{money(r.tribute)}</dd>
          </>
        )}
        <dt>{t('combat.loot.hull')}</dt>
        <dd class="mono">−{fmt(r.hullLost)}</dd>
        {r.missilesUsed > 0 && (
          <>
            <dt>{t('combat.loot.missiles')}</dt>
            <dd class="mono">−{r.missilesUsed}</dd>
          </>
        )}
        {r.crewLost.length > 0 && (
          <>
            <dt>{t('combat.loot.crewLost')}</dt>
            <dd class="neg">{r.crewLost.join(', ')}</dd>
          </>
        )}
      </dl>
    </Modal>
  );
}
