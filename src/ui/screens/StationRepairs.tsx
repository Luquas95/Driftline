import { analysis, act, report } from '../store';
import { hullRepairCost, moduleRepairCost, repairAll, repairHull, repairModuleAt } from '../../core/game';
import { MODULES_BY_ID } from '../../content/modules';
import { sfx } from '../../audio/audio';
import { money, t } from '../../i18n';
import { Bar, Btn, Panel, QualityBadge } from '../components';
import type { GameState, StationStatic } from '../../core/types';

export function RepairsTab({ s, st }: { s: GameState; st: StationStatic }) {
  const a = analysis.value!;
  const hullCost = hullRepairCost(s, st.id);
  let total = hullCost;
  s.ship.slots.forEach((_, i) => (total += moduleRepairCost(s, st.id, i)));
  return (
    <Panel title={t('station.repairs')} icon="repair">
      <div class="stack">
        <div class="spread">
          <div class="grow">
            <div class="spread">
              <b>{t('ship.hull')}</b>
              <span class="mono">
                {Math.round(s.ship.hp)}/{a.stats.hpMax}
              </span>
            </div>
            <Bar
              value={s.ship.hp}
              max={a.stats.hpMax}
              tone={s.ship.hp / a.stats.hpMax < 0.4 ? 'bad' : 'good'}
            />
          </div>
          <Btn
            small
            disabled={hullCost <= 0}
            onClick={() => {
              const r = act((x) => repairHull(x, st.id));
              if (report(r)) sfx('success');
            }}
            testid="btn-repair-hull"
          >
            {t('station.repair')} ({money(hullCost)})
          </Btn>
        </div>
        {s.ship.slots.map((m, i) => {
          if (!m) return null;
          const def = MODULES_BY_ID[m.defId];
          const cost = moduleRepairCost(s, st.id, i);
          return (
            <div class="spread" key={m.uid}>
              <div class="grow">
                <div class="spread">
                  <span>
                    {t(`mod.${def.kind}`)} {def.size} <QualityBadge q={m.quality} />
                  </span>
                  <span class={`mono ${m.condition < 40 ? 'neg' : ''}`}>{Math.round(m.condition)} %</span>
                </div>
                <Bar
                  value={m.condition}
                  max={100}
                  tone={m.condition < 40 ? 'bad' : m.condition < 70 ? 'warn' : 'good'}
                />
              </div>
              <Btn
                small
                disabled={cost <= 0}
                onClick={() => {
                  const r = act((x) => repairModuleAt(x, st.id, i));
                  if (report(r)) sfx('success');
                }}
              >
                {t('station.repair')} ({money(cost)})
              </Btn>
            </div>
          );
        })}
        <div class="row">
          <Btn
            kind="primary"
            disabled={total <= 0}
            onClick={() => {
              const r = act((x) => repairAll(x, st.id));
              if (report(r)) sfx('success');
            }}
            testid="btn-repair-all"
          >
            {t('station.repairAll')} ({money(total)})
          </Btn>
        </div>
        <p class="explain">{t('station.repairHelp')}</p>
      </div>
    </Panel>
  );
}
