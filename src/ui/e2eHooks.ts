import { stage } from '../render/instance';
import { galaxyOf } from '../core/state';
import { e2eFlags, game, rev, screen, selectedSystem, toasts } from './store';
import { updateSettings } from './settings';
import { mapScene } from './screens/MapScreen';
import { systemScene } from './screens/SystemScreen';
import { combatRoomPos } from './screens/CombatScreen';
import { DT, drainEvents, stepCombat } from '../core/combat/sim';
import { combatRev } from './combatCtl';
import { spawnEncounter } from '../core/combat/encounter';
import { MODULES_BY_ID } from '../content/modules';
import { hullSlots, moduleFits, newModule } from '../core/ship';
import { addGoods } from '../core/cargo';
import { analyze, newUid } from '../core/state';

/**
 * Test hooks, enabled only with `?e2e=1`. They never change game rules: they let Playwright select a system
 * without pixel-hunting on the canvas and freeze the animation clock for deterministic screenshots.
 */
export function installE2eHooks(): void {
  e2eFlags.quick = new URLSearchParams(window.location.search).get('quick') === '1';
  const hooks = {
    state: () => game.value,
    screen: () => screen.value,
    select: (id: number | null) => {
      selectedSystem.value = id;
    },
    freeze: (t = 3) => {
      stage.frozen = true;
      stage.renderAt(t);
      requestAnimationFrame(() => stage.renderAt(t));
    },
    unfreeze: () => {
      stage.frozen = false;
    },
    bump: () => {
      rev.value++;
    },
    /** Offset in light-years from the current system (for real-pointer map tests). */
    delta: (id: number) => {
      const s = game.value!;
      const g = galaxyOf(s);
      const a = g.systems[s.location.systemId];
      const b = g.systems[id];
      return { dx: b.x - a.x, dy: b.y - a.y };
    },
    /** Fit the given modules (def ids) into free slots; optionally stock missiles. */
    loadout: (defs: string[], missiles = 0) => {
      const s = game.value!;
      const slots = hullSlots(s.ship.hullId);
      for (const id of defs) {
        const def = MODULES_BY_ID[id];
        const slot = slots.find((sl) => !s.ship.slots[sl.index] && moduleFits(sl, def));
        if (slot) s.ship.slots[slot.index] = newModule(id, 'C', newUid(s, 'm'));
      }
      if (missiles > 0) {
        const { dims, stats } = analyze(s);
        addGoods(
          s.cargo,
          dims,
          { chilledCells: stats.chilledCells, secureCells: stats.secureCells },
          'missiles',
          missiles,
          0,
          s.day,
        );
      }
      rev.value++;
    },
    /** Put an encounter on screen (the player still chooses what to do). */
    encounter: (enemy: string, tier = 1) => {
      const s = game.value!;
      s.location.stationId = null;
      spawnEncounter(s, enemy, tier);
      rev.value++;
    },
    /** Advance the running fight by `seconds` of game time without waiting for real time. */
    fightStep: (seconds: number) => {
      const c = game.value?.combat;
      if (!c) return;
      for (let t = 0; t < seconds && !c.outcome && c.demand === null; t += DT) stepCombat(c, DT);
      drainEvents(c);
      combatRev.value++;
    },
    fightAuto: () => {
      const c = game.value?.combat;
      if (c) c.auto = true;
    },
    roomPos: (side: 'player' | 'enemy', ship: number, room: number) => combatRoomPos(side, ship, room),
    /** Animation level for tests: `full` also lifts the reduced-motion default of the hooks. */
    setAnim: (a: 'full' | 'reduced' | 'off') => {
      updateSettings(
        a === 'full' ? { animations: 'full', motion: 'full' } : { animations: a, motion: 'reduced' },
      );
    },
    map: () => {
      const sc = mapScene();
      return sc ? { cam: sc.getCam(), pos: (id: number) => sc.systemScreenPos(id) } : null;
    },
    sys: () => {
      const sc = systemScene();
      if (!sc) return null;
      return {
        zoom: sc.getZoom(),
        cam: sc.getCam(),
        flying: sc.isFlying(),
        ship: sc.shipScreenPos(),
        body: (i: number) => sc.bodyScreenPos(i),
        station: (id: string) => sc.stationScreenPos(id),
      };
    },
    toasts: () => toasts.value.map((x) => x.text),
    /** Let a headless bot play for a while (used to produce realistic README screenshots). */
    autoplay: async (strategy: 'trader' | 'explorer' | 'miner' | 'hauler', days: number) => {
      const { Bot } = await import('../sim/bots');
      const s = game.value!;
      const bot = new Bot(s, strategy);
      bot.play(days);
      s.pendingEvent = null;
      const home = galaxyOf(s).stationsById[s.home];
      if (home && !s.dead) {
        bot.travelTo(home.systemId);
        s.pendingEvent = null;
        bot.dockSomewhere();
        s.pendingEvent = null;
      }
      rev.value++;
    },
    /** First neighbouring system that has a station (for scripted trade routes). */
    neighborWithStation: () => {
      const s = game.value!;
      const g = galaxyOf(s);
      const n = g.systems[s.location.systemId].neighbors.find((id) =>
        g.systems[id].stations.some((st) => st.type !== 'pirate'),
      );
      return n ?? null;
    },
  };
  (window as unknown as { __dl: typeof hooks }).__dl = hooks;
  stage.adaptive = false;
  updateSettings({ motion: 'reduced' });
}
