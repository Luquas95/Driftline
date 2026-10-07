import { useState } from 'preact/hooks';
import { OFFICERS_BY_ID, RACES_BY_ID, SKILLS, ROLE_SKILL } from '../../content/crew';
import {
  crewCapacity,
  crewSupplyPerDay,
  dismissCrew,
  hireCrew,
  maxHp,
  refreshRecruits,
} from '../../core/crew';
import { stationOf } from '../../core/state';
import type { CrewMember, Recruit } from '../../core/types';
import { fmt, money, t } from '../../i18n';
import { Bar, Btn, Empty, Panel, Stat, Tabs, Tag } from '../components';
import { Portrait } from '../Portrait';
import { act, game, report, rev } from '../store';
import { sfx } from '../../audio/audio';

type TabId = 'crew' | 'hire';

function moodTone(m: number): 'good' | 'warn' | 'bad' {
  return m >= 55 ? 'good' : m >= 25 ? 'warn' : 'bad';
}

function SkillRows({ c }: { c: Pick<CrewMember, 'skills' | 'role'> }) {
  return (
    <div class="skill-grid">
      {SKILLS.map((k) => (
        <div
          key={k}
          class={`skill ${ROLE_SKILL[c.role] === k ? 'is-main' : ''}`}
          title={t(`skill.${k}.desc`)}
        >
          <span>{t(`skill.${k}`)}</span>
          <Bar value={c.skills[k]} max={10} tone="accent" label={t(`skill.${k}`)} />
          <span class="mono">{fmt(c.skills[k], 1)}</span>
        </div>
      ))}
    </div>
  );
}

function RaceTraits({ race }: { race: keyof typeof RACES_BY_ID }) {
  const r = RACES_BY_ID[race];
  const items: [string, number][] = [
    ['trait.breath', r.breath],
    ['trait.fire', r.fire],
    ['trait.repair', r.repair],
    ['trait.melee', r.melee],
    ['trait.supply', r.supply],
    ['trait.social', r.social],
  ];
  return (
    <div class="row wrap" style={{ gap: 4 }}>
      {items
        .filter(([, v]) => Math.abs(v - 1) >= 0.15)
        .map(([k, v]) => {
          // breath/fire/supply: lower is better for the player; the others: higher is better
          const goodWhenLow = k === 'trait.breath' || k === 'trait.fire' || k === 'trait.supply';
          const good = goodWhenLow ? v < 1 : v > 1;
          return (
            <Tag key={k} tone={good ? 'good' : 'warn'} title={t(`${k}.desc`)}>
              {t(k)} {v > 1 ? '+' : ''}
              {Math.round((v - 1) * 100)} %
            </Tag>
          );
        })}
    </div>
  );
}

function CrewCard({ c, docked }: { c: CrewMember; docked: boolean }) {
  const [confirm, setConfirm] = useState(false);
  const off = c.officer ? OFFICERS_BY_ID[c.officer] : null;
  return (
    <div class="crew-card" data-testid={`crew-${c.id}`}>
      <Portrait race={c.race} look={c.look} size={64} title={c.name} />
      <div class="crew-main">
        <div class="spread" style={{ flexWrap: 'wrap' }}>
          <div>
            <b>{c.name}</b>{' '}
            <span class="dim">
              {t(`race.${c.race}`)} · {t(`role.${c.role}`)}
            </span>{' '}
            {off && <Tag tone="accent">{t('crew.officer')}</Tag>}
          </div>
          <span class="mono dim">{t('crew.wage', { n: c.wage })}</span>
        </div>
        {off && <p class="faint small">{t(`officer.${off.id}.desc`)}</p>}
        <div class="vitals">
          <label>
            {t('crew.hp')}
            <Bar
              value={c.hp}
              max={maxHp(c)}
              tone={c.hp < maxHp(c) * 0.4 ? 'bad' : 'good'}
              label={t('crew.hp')}
            />
          </label>
          <label>
            {t('crew.morale')}
            <Bar value={c.morale} max={100} tone={moodTone(c.morale)} label={t('crew.morale')} />
          </label>
          <label>
            {t('crew.fatigue')}
            <Bar
              value={c.fatigue}
              max={100}
              tone={c.fatigue > 70 ? 'bad' : 'warn'}
              label={t('crew.fatigue')}
            />
          </label>
        </div>
        <SkillRows c={c} />
        <RaceTraits race={c.race} />
        {docked && (
          <div class="row" style={{ marginTop: 6 }}>
            <Btn
              small
              kind="danger"
              testid={`dismiss-${c.id}`}
              onClick={() => {
                if (!confirm) {
                  setConfirm(true);
                  return;
                }
                report(act((s) => dismissCrew(s, c.id)));
              }}
            >
              {confirm ? t('crew.dismissSure') : t('crew.dismiss')}
            </Btn>
            {confirm && (
              <Btn small onClick={() => setConfirm(false)}>
                {t('ui.cancel')}
              </Btn>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function RecruitCard({ r, stationId }: { r: Recruit; stationId: string }) {
  const s = game.value!;
  const off = r.officer ? OFFICERS_BY_ID[r.officer] : null;
  const can = s.credits >= r.fee;
  return (
    <div class="crew-card" data-testid={`recruit-${r.id}`}>
      <Portrait race={r.race} look={r.look} size={64} title={r.name} />
      <div class="crew-main">
        <div class="spread" style={{ flexWrap: 'wrap' }}>
          <div>
            <b>{r.name}</b>{' '}
            <span class="dim">
              {t(`race.${r.race}`)} · {t(`role.${r.role}`)}
            </span>{' '}
            {off && <Tag tone="accent">{t('crew.officer')}</Tag>}
          </div>
          <span class="mono dim">{t('crew.wage', { n: r.wage })}</span>
        </div>
        {off && <p class="faint small">{t(`officer.${off.id}.desc`)}</p>}
        <SkillRows c={r} />
        <RaceTraits race={r.race} />
        <div class="row" style={{ marginTop: 6 }}>
          <Btn
            kind="primary"
            small
            disabled={!can}
            testid={`hire-${r.id}`}
            onClick={() => {
              if (report(act((st) => hireCrew(st, stationId, r.id)))) sfx('success');
            }}
          >
            {t('crew.hire', { fee: money(r.fee) })}
          </Btn>
        </div>
      </div>
    </div>
  );
}

export function CrewScreen() {
  void rev.value;
  const s = game.value!;
  const [tab, setTab] = useState<TabId>('crew');
  const docked = !!s.location.stationId;
  const cap = crewCapacity(s);
  const wages = s.crew.reduce((a, c) => a + c.wage, 0);
  const st = docked ? stationOf(s, s.location.stationId!) : null;
  const recruits = st ? refreshRecruits(s, st) : [];
  const cur: TabId = tab === 'hire' && !docked ? 'crew' : tab;
  return (
    <div class="screen" data-testid="screen-crew">
      <div class="stack" style={{ maxWidth: 1100, margin: '0 auto' }}>
        <Panel title={t('crew.title')} icon="crew">
          <div class="stats-grid">
            <Stat
              label={t('crew.count')}
              value={`${s.crew.length}/${cap}`}
              tone={s.crew.length > cap ? 'neg' : ''}
              testid="crew-count"
            />
            <Stat label={t('crew.wages')} value={`${fmt(wages)} kr`} sub={t('crew.perDay')} />
            <Stat label={t('crew.supplies')} value={fmt(crewSupplyPerDay(s), 1)} sub={t('crew.perDay')} />
            <Stat
              label={t('crew.owed')}
              value={`${fmt(Math.round(s.wagesDue))} kr`}
              tone={s.wagesDue > 0 ? 'neg' : ''}
            />
          </div>
          {s.crew.length > cap && <p class="neg small">{t('crew.overcrowded')}</p>}
          <Tabs
            tabs={[
              { id: 'crew' as TabId, label: t('crew.tabCrew'), icon: 'crew' },
              ...(docked
                ? [{ id: 'hire' as TabId, label: t('crew.tabHire'), icon: 'plus', badge: recruits.length }]
                : []),
            ]}
            value={cur}
            onChange={setTab}
          />
        </Panel>
        {cur === 'crew' && (
          <div class="crew-list">
            {s.crew.map((c) => (
              <CrewCard key={c.id} c={c} docked={docked} />
            ))}
          </div>
        )}
        {cur === 'hire' && st && (
          <div class="crew-list">
            {recruits.length === 0 && <Empty>{t('crew.noRecruits')}</Empty>}
            {recruits.map((r) => (
              <RecruitCard key={r.id} r={r} stationId={st.id} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
