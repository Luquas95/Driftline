import { CHAINS_BY_ID } from '../../content/chains';
import { GOODS_BY_ID } from '../../content/goods';
import { abandonContract, acceptContract, isDeliverable, activePassengers } from '../../core/contractOps';
import { pathLength } from '../../core/contracts';
import { analyze, galaxyOf } from '../../core/state';
import { sfx } from '../../audio/audio';
import { fmt, money, t } from '../../i18n';
import { Btn, Empty, Panel, Tag } from '../components';
import { Icon } from '../Icon';
import { act, game, report, rev, selectedSystem, screen } from '../store';
import type { Contract, GameState, StationStatic } from '../../core/types';

const KIND_ICON: Record<string, string> = {
  freight: 'cargo',
  courier: 'jump',
  passenger: 'crew',
  survey: 'scan',
  supply: 'market',
  rescue: 'warning',
};

export function describeContract(c: Contract, s: GameState): string {
  const g = galaxyOf(s);
  const dest = g.stationsById[c.dest];
  const params: Record<string, string | number> = {
    dest: dest?.name ?? '?',
    destSystem: g.systems[c.destSystem]?.name ?? '?',
    good: c.goodId ? t(`good.${c.goodId}`) : '',
    qty: c.qty ?? 0,
    pax: c.passengers ?? 0,
    target: c.targetSystem !== undefined ? g.systems[c.targetSystem].name : '',
    body: c.targetBody
      ? (g.systems[c.targetSystem ?? 0].bodies.find((b) => b.id === c.targetBody)?.name ?? '')
      : '',
  };
  if (c.title) return t(c.title, params);
  return t(`contract.desc.${c.kind}${c.kind === 'survey' && c.targetBody ? 'Body' : ''}`, params);
}

export function ContractCard({
  c,
  s,
  onAccept,
  onAbandon,
  here,
}: {
  c: Contract;
  s: GameState;
  onAccept?: () => void;
  onAbandon?: () => void;
  here?: string;
}) {
  const g = galaxyOf(s);
  const dest = g.stationsById[c.dest];
  const originSys = g.stationsById[c.origin].systemId;
  const len = pathLength(g, originSys, c.destSystem);
  const days = c.deadline - s.day;
  const sameDest =
    s.contracts.some((x) => x.state === 'active' && x.dest === c.dest) && c.state === 'offered';
  const ready = c.state === 'active' && isDeliverable(s, c);
  const chain = c.chainId ? CHAINS_BY_ID[c.chainId] : null;
  return (
    <div
      class={`contract-card ${sameDest ? 'same-dest' : ''} ${chain ? 'chain' : ''}`}
      data-testid={`contract-${c.id}`}
    >
      <div class="spread">
        <b>
          <Icon name={KIND_ICON[c.kind]} /> {t(`contract.kind.${c.kind}`)}
          {chain && (
            <Tag tone="accent">
              {t(`chain.${c.chainId}.title`)} · {(c.chainStep ?? 0) + 1}/{chain.steps.length}
            </Tag>
          )}
        </b>
        <span class="mono pos">{money(c.reward)}</span>
      </div>
      <p style={{ margin: 0 }}>{describeContract(c, s)}</p>
      <div class="row wrap">
        <Tag>
          <Icon name="route" size={12} /> {dest?.name} · {g.systems[c.destSystem].name}
        </Tag>
        <Tag>{fmt(len, 0)} ly</Tag>
        <Tag tone={days < 4 ? 'bad' : days < 8 ? 'warn' : ''}>
          <Icon name="clock" size={12} /> {t('contract.deadlineIn', { n: fmt(days, 1) })}
        </Tag>
        {c.deposit > 0 && c.state === 'offered' && (
          <Tag tone="good">{t('contract.advance', { n: money(c.deposit) })}</Tag>
        )}
        <Tag tone="warn">{t('contract.penalty', { n: money(c.penalty + c.deposit) })}</Tag>
        {c.kind === 'passenger' && <Tag>{t('contract.comfort', { n: c.comfort ?? 1 })}</Tag>}
        {c.kind === 'supply' && c.goodId && (
          <Tag>
            {GOODS_BY_ID[c.goodId] ? t(`good.${c.goodId}`) : ''} ×{c.qty}
          </Tag>
        )}
        {sameDest && <Tag tone="accent">{t('contract.sameDest')}</Tag>}
        {ready && <Tag tone="good">{t('contract.ready')}</Tag>}
        {c.state === 'active' && c.kind === 'survey' && (
          <Tag tone={(c.progress ?? 0) >= 1 ? 'good' : ''}>
            {(c.progress ?? 0) >= 1 ? t('contract.surveyDone') : t('contract.surveyTodo')}
          </Tag>
        )}
        {c.state === 'active' && c.kind === 'rescue' && <Tag>{t(`contract.rescue${c.progress ?? 0}`)}</Tag>}
      </div>
      <div class="row wrap">
        {onAccept && (
          <Btn small kind="primary" onClick={onAccept} testid={`accept-${c.id}`}>
            {t('contract.accept')}
          </Btn>
        )}
        {c.state === 'active' && (
          <Btn
            small
            icon="map"
            onClick={() => {
              selectedSystem.value =
                c.targetSystem !== undefined && c.kind !== 'rescue' && (c.progress ?? 0) < 1
                  ? c.targetSystem
                  : c.destSystem;
              screen.value = 'map';
            }}
          >
            {t('contract.showOnMap')}
          </Btn>
        )}
        {onAbandon && (
          <Btn small kind="danger" onClick={onAbandon}>
            {t('contract.abandon')}
          </Btn>
        )}
        {here && <span class="faint">{here}</span>}
      </div>
    </div>
  );
}

export function ContractsTab({ st }: { st: StationStatic }) {
  void rev.value;
  const s = game.value!;
  const dyn = s.stations[st.id];
  const { stats } = analyze(s);
  const active = s.contracts.filter((c) => c.state === 'active');
  // group offers by destination so bundles are easy to spot
  const board = [...dyn.board].sort((a, b) => a.dest.localeCompare(b.dest) || b.reward - a.reward);
  const counts = new Map<string, number>();
  for (const c of board) counts.set(c.dest, (counts.get(c.dest) ?? 0) + 1);
  return (
    <div class="stack">
      <Panel title={t('contract.board')} icon="contract">
        <p class="explain">
          {t('contract.boardHelp', { max: 8, n: active.length })}{' '}
          {stats.beds > 0 &&
            t('contract.beds', { free: stats.beds - activePassengers(s), comfort: stats.comfort })}
        </p>
        {board.length === 0 && <Empty>{t('contract.none')}</Empty>}
        <div class="stack">
          {board.map((c) => (
            <ContractCard
              key={c.id}
              c={c}
              s={s}
              here={
                (counts.get(c.dest) ?? 0) > 1
                  ? t('contract.bundleHint', { n: counts.get(c.dest)! })
                  : undefined
              }
              onAccept={() => {
                const r = act((x) => acceptContract(x, st.id, c.id));
                if (report(r)) sfx('success');
              }}
            />
          ))}
        </div>
      </Panel>
      <Panel title={t('contract.active')} icon="check">
        {active.length === 0 && <Empty>{t('contract.noneActive')}</Empty>}
        <div class="stack">
          {active.map((c) => (
            <ContractCard key={c.id} c={c} s={s} onAbandon={() => act((x) => abandonContract(x, c.id))} />
          ))}
        </div>
      </Panel>
    </div>
  );
}
