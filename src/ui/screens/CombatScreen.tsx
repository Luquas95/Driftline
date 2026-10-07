import { ENEMIES_BY_ID } from '../../content/enemies';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  answerDemand,
  moveCrew,
  sendBoarders,
  setFleeing,
  setTarget,
  setWeights,
  powerEff,
} from '../../core/combat/sim';
import { POWER_GROUPS, type CCrew, type CShip, type CWeapon, type PowerGroup } from '../../core/combat/types';
import { createCombatScene, type CombatScene } from '../../render/combatscene';
import { prefersReducedMotion, settings } from '../settings';
import { fmt, t } from '../../i18n';
import { Bar, Btn, Tabs } from '../components';
import { Portrait } from '../Portrait';
import { game, toast } from '../store';
import {
  combatRev,
  combatSpeed,
  pauseForSelection,
  selCrew,
  selWeapon,
  togglePause,
  driveCombat,
} from '../combatCtl';
import { useScene } from '../useScene';
import { sfx } from '../../audio/audio';

const KIND_ICON_COLOR: Record<string, string> = {
  energy: '#ff5d73',
  kinetic: '#ffb454',
  missile: '#ff8a3d',
  ion: '#5ec8ff',
  drones: '#b58cff',
  teleporter: '#6dffd6',
};
const GROUP_KEYS: Record<PowerGroup, string> = {
  weapons: 'q',
  shields: 'w',
  engines: 'e',
  life: 'r',
  other: 't',
};

let scene: CombatScene | null = null;

/** Screen position of a room (used by the test hooks to click on the canvas). */
export function combatRoomPos(
  side: 'player' | 'enemy',
  ship: number,
  room: number,
): { x: number; y: number } | null {
  return scene?.roomScreenPos(side, ship, room) ?? null;
}

function logParams(p?: Record<string, string | number>): Record<string, string | number> | undefined {
  if (p && typeof p.ship === 'string' && ENEMIES_BY_ID[p.ship]) return { ...p, ship: t(`enemy.${p.ship}`) };
  return p;
}

function weaponLabel(w: CWeapon): string {
  return `${t(`mod.${w.kind}`)} ${w.size}`;
}

function powerLevel(s: CShip, g: PowerGroup): number {
  return s.need[g] > 0 ? Math.round((s.weights[g] / s.need[g]) * 2) : 0;
}

function shipBars(s: CShip) {
  return (
    <div class="enemy-bars" data-testid={`enemy-${s.index}`}>
      <b>{t(`enemy.${s.lootId || s.name}`)}</b>
      <Bar
        value={s.hull}
        max={s.hullMax}
        tone={s.hull / s.hullMax > 0.4 ? 'good' : 'bad'}
        label={t('combat.hull')}
      />
      <Bar value={s.shield} max={Math.max(1, s.shieldMax)} tone="accent" label={t('combat.shield')} />
      {s.out && <span class="tag">{t(`combat.out.${s.out}`)}</span>}
    </div>
  );
}

export function CombatScreen() {
  void combatRev.value;
  const s = game.value!;
  const c = s.combat!;
  const p = c.player;
  const hudRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<'weapons' | 'power' | 'crew' | 'actions'>('weapons');
  const reduced = prefersReducedMotion();

  useScene(() => {
    const sc = createCombatScene(c, driveCombat, c.seed.length * 977 + 13);
    scene = sc;
    sc.setEffects({ shake: settings.value.shake, reduced });
    sc.handlers.room = (side, ship, room) => {
      const cc = game.value?.combat;
      if (!cc || cc.outcome) return;
      if (side === 'player') {
        if (selCrew.value && moveCrew(cc, selCrew.value, room)) {
          pauseForSelection();
          sfx('click');
        }
        return;
      }
      const wid = selWeapon.value;
      const w = cc.player.weapons.find((x) => x.id === wid);
      if (!w) {
        toast(t('combat.pickWeapon'), 'warn');
        return;
      }
      if (w.kind === 'teleporter') {
        if (!selCrew.value) {
          toast(t('combat.pickCrew'), 'warn');
          return;
        }
        if (!sendBoarders(cc, [selCrew.value], ship, room)) toast(t('combat.cannotBoard'), 'warn');
        else {
          selCrew.value = null;
          sfx('success');
        }
        pauseForSelection();
        return;
      }
      if (setTarget(cc, w.id, ship, room)) {
        sfx('click');
        pauseForSelection();
      }
    };
    sc.handlers.crew = (id) => {
      selCrew.value = selCrew.value === id ? null : id;
      pauseForSelection();
    };
    sc.handlers.move = (id, room) => {
      const cc = game.value?.combat;
      if (!cc) return;
      const m = cc.player.crew.find((x) => x.id === id);
      if (m && m.room !== room && moveCrew(cc, id, room)) {
        sfx('click');
        pauseForSelection();
      }
    };
    return sc;
  }, [c.seed]);

  scene?.setSelection({ crewId: selCrew.value, weaponId: selWeapon.value });
  scene?.setEffects({ shake: settings.value.shake, reduced });

  useEffect(() => {
    const measure = () => {
      const top = topRef.current?.getBoundingClientRect().height ?? 0;
      const hud = hudRef.current?.getBoundingClientRect().height ?? 0;
      scene?.setInsets(top + 6, hud + 6);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (hudRef.current) ro.observe(hudRef.current);
    if (topRef.current) ro.observe(topRef.current);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [tab, c.enemies.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const cc = game.value?.combat;
      if (!cc || cc.outcome) return;
      const k = e.key.toLowerCase();
      if (e.key === ' ') {
        e.preventDefault();
        togglePause();
      } else if (/^[1-9]$/.test(e.key)) {
        const w = cc.player.weapons[Number(e.key) - 1];
        if (w) {
          selWeapon.value = selWeapon.value === w.id ? null : w.id;
          pauseForSelection();
        }
      } else if (k === 'f') {
        toggleFlee();
      } else if (k === 'a') {
        cc.auto = !cc.auto;
        combatRev.value++;
      } else {
        const g = POWER_GROUPS.find((x) => GROUP_KEYS[x] === k);
        if (g) {
          adjustPower(g, e.shiftKey ? -1 : 1);
          e.preventDefault();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function adjustPower(g: PowerGroup, d: number): void {
    const cc = game.value!.combat!;
    const sh = cc.player;
    if (sh.need[g] <= 0) return;
    const lvl = Math.max(0, Math.min(4, powerLevel(sh, g) + d));
    setWeights(cc, { [g]: (sh.need[g] * lvl) / 2 });
    sfx('click');
    pauseForSelection();
    combatRev.value++;
  }
  function toggleFlee(): void {
    const cc = game.value!.combat!;
    if (!setFleeing(cc, 'player', !cc.player.fleeing)) toast(t('combat.cannotFlee'), 'warn');
    else sfx('jump');
    combatRev.value++;
  }

  const pwrUse = POWER_GROUPS.reduce((a, g) => a + (p.need[g] > 0 ? p.weights[g] : 0), 0);
  const crewSel = p.crew.find((m) => m.id === selCrew.value);
  const hasTele = p.weapons.some((w) => w.kind === 'teleporter');
  const boarders = c.enemies.some((e) => e.crew.some((m) => m.boardedOn >= 0));

  const weaponsSec = (
    <div class="sec" data-testid="sec-weapons">
      {p.weapons.length === 0 && <p class="dim">{t('combat.noWeapons')}</p>}
      {p.weapons.map((w, i) => {
        const tgt = w.target ? c.enemies[w.target.ship] : null;
        const r = tgt && w.target ? tgt.rooms[w.target.room] : null;
        const sys = p.rooms[w.room];
        return (
          <button
            key={w.id}
            type="button"
            class={`wbtn ${selWeapon.value === w.id ? 'active' : ''} ${sys.sys <= 0 || sys.ion > 0 ? 'down' : ''}`}
            data-testid={`weapon-${i + 1}`}
            style={{ '--wc': KIND_ICON_COLOR[w.kind] }}
            onClick={() => {
              selWeapon.value = selWeapon.value === w.id ? null : w.id;
              pauseForSelection();
              sfx('click');
            }}
          >
            <span class="wnum">{i + 1}</span>
            <span class="wmain">
              <b>{weaponLabel(w)}</b>
              <small>
                {sys.sys <= 0
                  ? t('combat.wrecked')
                  : sys.ion > 0
                    ? t('combat.ionLock')
                    : w.kind === 'teleporter'
                      ? t('combat.teleHint')
                      : r
                        ? t('combat.targetRoom', {
                            room: r.kind ? t(`mod.${r.kind}`) : t('combat.emptyRoom'),
                          })
                        : t('combat.noTarget')}
              </small>
              <Bar
                value={w.charge}
                max={1}
                tone={w.charge >= 1 ? 'good' : 'accent'}
                label={t('combat.charge')}
              />
            </span>
          </button>
        );
      })}
      {p.weapons.some((w) => w.kind === 'missile') && (
        <p class="dim small">{t('combat.missiles', { n: p.missiles })}</p>
      )}
    </div>
  );

  const powerSec = (
    <div class="sec" data-testid="sec-power">
      {POWER_GROUPS.filter((g) => p.need[g] > 0).map((g) => {
        const lvl = powerLevel(p, g);
        const eff = Math.round(powerEff(p, g) * 100);
        return (
          <div key={g} class="pwr" data-testid={`power-${g}`}>
            <span class="pname">
              {t(`combat.pg.${g}`)} <kbd>{GROUP_KEYS[g].toUpperCase()}</kbd>
            </span>
            <button
              type="button"
              class="pbtn"
              aria-label={`${t(`combat.pg.${g}`)} −`}
              onClick={() => adjustPower(g, -1)}
            >
              −
            </button>
            <span class="pips" aria-hidden="true">
              {[1, 2, 3, 4].map((i) => (
                <i key={i} class={i <= lvl ? 'on' : ''} />
              ))}
            </span>
            <button
              type="button"
              class="pbtn"
              aria-label={`${t(`combat.pg.${g}`)} +`}
              onClick={() => adjustPower(g, 1)}
            >
              +
            </button>
            <span class={`mono eff ${eff < 60 ? 'neg' : ''}`}>{eff} %</span>
          </div>
        );
      })}
      <div class="pwr-foot dim small">
        {t('combat.reactor', { out: fmt(p.powerOut, 1), use: fmt(pwrUse, 1) })}
      </div>
      <label class="heat">
        {t('combat.heat')}
        <Bar
          value={p.heat}
          max={100}
          tone={p.heat > 80 ? 'bad' : p.heat > 50 ? 'warn' : 'good'}
          label={t('combat.heat')}
        />
      </label>
    </div>
  );

  const crewSec = (
    <div class="sec" data-testid="sec-crew">
      {p.crew.map((m: CCrew) => (
        <button
          key={m.id}
          type="button"
          class={`cchip ${selCrew.value === m.id ? 'active' : ''}`}
          data-testid={`crewchip-${m.id}`}
          onClick={() => {
            selCrew.value = selCrew.value === m.id ? null : m.id;
            pauseForSelection();
            sfx('click');
          }}
        >
          <Portrait race={m.race} look={m.look} size={34} />
          <span>
            <b>{m.name}</b>
            <small>
              {m.boardedOn >= 0 ? t('combat.boarding') : t(`combat.task.${m.task}`)} · {Math.round(m.hp)}/
              {m.maxHp}
            </small>
          </span>
        </button>
      ))}
      <p class="dim small">{crewSel ? t('combat.crewHintSel') : t('combat.crewHint')}</p>
    </div>
  );

  const actionsSec = (
    <div class="sec actions" data-testid="sec-actions">
      <Btn
        kind={c.paused ? 'primary' : undefined}
        testid="btn-pause"
        onClick={togglePause}
        icon={c.paused ? 'jump' : 'clock'}
      >
        {c.paused ? t('combat.resume') : t('combat.pause')} <kbd>␣</kbd>
      </Btn>
      <div class="row">
        {[1, 2].map((v) => (
          <Btn
            key={v}
            small
            active={combatSpeed.value === v}
            onClick={() => (combatSpeed.value = v)}
            testid={`speed-${v}`}
          >
            ×{v}
          </Btn>
        ))}
        <Btn
          small
          active={c.auto}
          testid="btn-auto"
          onClick={() => {
            c.auto = !c.auto;
            combatRev.value++;
          }}
        >
          {t('combat.auto')} <kbd>A</kbd>
        </Btn>
      </div>
      <Btn
        kind={p.fleeing ? 'danger' : undefined}
        disabled={!p.canFlee}
        testid="btn-flee"
        onClick={toggleFlee}
        icon="jump"
      >
        {p.fleeing ? t('combat.fleeCancel') : t('combat.flee')} <kbd>F</kbd>
      </Btn>
      <Bar value={p.jumpCharge} max={1} tone="accent" label={t('combat.jumpCharge')} />
      {hasTele && boarders && <p class="dim small">{t('combat.boarders')}</p>}
    </div>
  );

  return (
    <div class="combat" data-testid="screen-combat">
      <div class="combat-top" ref={topRef}>
        <div class="enemy-list">{c.enemies.map((e) => shipBars(e))}</div>
        <div class="combat-self" data-testid="player-bars">
          <b>{p.name}</b>
          <Bar
            value={p.hull}
            max={p.hullMax}
            tone={p.hull / p.hullMax > 0.4 ? 'good' : 'bad'}
            label={t('combat.hull')}
          />
          <Bar value={p.shield} max={Math.max(1, p.shieldMax)} tone="accent" label={t('combat.shield')} />
        </div>
        {c.paused && !c.outcome && (
          <div class="pause-badge" data-testid="paused">
            {t('combat.paused')}
          </div>
        )}
        {c.outcome && <div class="pause-badge">{t(`combat.outcome.${c.outcome}`)}</div>}
      </div>

      {c.demand !== null && !c.outcome && (
        <div class="demand" data-testid="demand" role="alertdialog">
          <p>{t('combat.demandText', { pct: Math.round(c.demand * 100) })}</p>
          <div class="row">
            <Btn kind="danger" testid="demand-pay" onClick={() => answerDemand(c, true)}>
              {t('combat.demandPay')}
            </Btn>
            <Btn testid="demand-refuse" onClick={() => answerDemand(c, false)}>
              {t('combat.demandRefuse')}
            </Btn>
          </div>
        </div>
      )}

      <div class="combat-hud" ref={hudRef}>
        <div class="hud-tabs">
          <Tabs
            tabs={[
              { id: 'weapons' as const, label: t('combat.tabWeapons'), icon: 'power' },
              { id: 'power' as const, label: t('combat.tabPower'), icon: 'shield' },
              { id: 'crew' as const, label: t('combat.tabCrew'), icon: 'crew' },
              { id: 'actions' as const, label: t('combat.tabActions'), icon: 'jump' },
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>
        <div class="hud-body" data-tab={tab}>
          <div class={`hud-sec ${tab === 'weapons' ? 'show' : ''}`}>{weaponsSec}</div>
          <div class={`hud-sec ${tab === 'power' ? 'show' : ''}`}>{powerSec}</div>
          <div class={`hud-sec ${tab === 'crew' ? 'show' : ''}`}>{crewSec}</div>
          <div class={`hud-sec ${tab === 'actions' ? 'show' : ''}`}>{actionsSec}</div>
        </div>
        <ol class="combat-log" aria-live="polite" data-testid="combat-log">
          {c.log.slice(-3).map((l, i) => (
            <li key={`${l.time}-${i}`}>{t(l.key, logParams(l.params))}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}
