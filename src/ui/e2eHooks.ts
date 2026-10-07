import { stage } from '../render/instance';
import { galaxyOf } from '../core/state';
import { game, rev, screen, selectedSystem, toasts } from './store';
import { updateSettings } from './settings';

/**
 * Test hooks, enabled only with `?e2e=1`. They never change game rules: they let Playwright select a system
 * without pixel-hunting on the canvas and freeze the animation clock for deterministic screenshots.
 */
export function installE2eHooks(): void {
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
