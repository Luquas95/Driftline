/** Base screen, "research" tab: tech tree from content/tech.ts, driven by core/research.ts. */
import { TECHS, type TechBranch } from '../../content/tech';
import { canResearch, hasTech, labRate, startResearch } from '../../core/research';
import { t, fmt } from '../../i18n';
import { Bar, Btn, Tag } from '../components';
import { act, game, report, rev } from '../store';

const BRANCHES: TechBranch[] = ['nav', 'power', 'industry', 'war', 'xeno'];

/** Technology tree: one column per branch, the dependency is shown by the "requires" line. */
export function BaseResearch() {
  void rev.value;
  const s = game.value!;
  const rs = s.research;
  const active = TECHS.find((x) => x.id === rs.active);
  return (
    <div class="stack" data-testid="base-research">
      <div class="spread">
        <span>
          {t('ui3.rp')}: <b class="mono">{fmt(rs.points, 0)}</b>{' '}
          <span class="dim">
            (+{fmt(labRate(s), 1)} {t('ui3.perDay')})
          </span>
        </span>
        {active ? (
          <span>
            {t(`tech.${active.id}`)}{' '}
            <span class="mono dim">
              {fmt(rs.progress, 0)}/{active.cost}
            </span>
          </span>
        ) : (
          <span class="dim">{t('ui3.noResearch')}</span>
        )}
      </div>
      {active && <Bar value={rs.progress} max={active.cost} />}
      {labRate(s) <= 0 && <p class="explain">{t('ui3.needLab')}</p>}
      <div class="tech-grid">
        {BRANCHES.map((br) => (
          <div key={br} class="tech-col">
            <h4>{t(`tech.branch.${br}`)}</h4>
            {TECHS.filter((x) => x.branch === br).map((x) => {
              const done = hasTech(s, x.id);
              const can = canResearch(s, x.id);
              const isActive = rs.active === x.id;
              return (
                <div
                  key={x.id}
                  class={`tech-node ${done ? 'done' : ''} ${isActive ? 'active' : ''} ${!done && !can ? 'locked' : ''}`}
                  data-testid={`tech-${x.id}`}
                >
                  <div class="spread">
                    <b>{t(`tech.${x.id}`)}</b>
                    {done ? <Tag tone="good">{t('ui3.done')}</Tag> : <span class="mono dim">{x.cost}</span>}
                  </div>
                  <div class="dim" style={{ fontSize: 12 }}>
                    {t(`tech.${x.id}.desc`)}
                  </div>
                  {x.requires.length > 0 && !done && (
                    <div class="faint" style={{ fontSize: 11.5 }}>
                      {t('ui3.requires')}: {x.requires.map((r) => t(`tech.${r}`)).join(', ')}
                    </div>
                  )}
                  {!done && (
                    <Btn
                      small
                      kind={isActive ? undefined : 'primary'}
                      // switching to another tech is allowed: startResearch refunds the progress
                      disabled={!can || isActive}
                      testid={`research-${x.id}`}
                      onClick={() => report(act((st) => startResearch(st, x.id)))}
                    >
                      {isActive ? t('ui3.researching') : t('ui3.research')}
                    </Btn>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
