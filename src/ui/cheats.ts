import { addGoods } from '../core/cargo';
import { addRep } from '../core/factions';
import { triggerEnding } from '../core/endings';
import { learnWords } from '../core/lang';
import { addResearchPoints } from '../core/research';
import { passTime } from '../core/time';
import { analyze } from '../core/state';
import { rev } from './store';
import { galaxyOf } from '../core/state';
import { feesFor, quoteSell } from '../core/economy';
import { tariffMult } from '../core/territory';
import { GOOD_INDEX } from '../content/goods';
import type { FactionId } from '../core/worldTypes';
import { game } from './store';

/**
 * Developer cheats for the E2E tests. Compiled in only with `VITE_E2E=1` (or `npm run dev`); the production
 * build tree-shakes the whole module away (see the guard in `e2eHooks.ts`).
 */
export function cheatApi() {
  const s = () => game.value!;
  const bump = () => {
    rev.value++;
  };
  return {
    credits: (n: number) => {
      s().credits += n;
      bump();
    },
    goods: (goodId: string, qty: number) => {
      const st = s();
      const { dims, stats } = analyze(st);
      addGoods(
        st.cargo,
        dims,
        { chilledCells: stats.chilledCells, secureCells: stats.secureCells },
        goodId,
        qty,
        0,
        st.day,
      );
      bump();
    },
    baseGoods: (goodId: string, qty: number) => {
      const b = s().base;
      if (b) b.storage[goodId] = (b.storage[goodId] ?? 0) + qty;
      bump();
    },
    rep: (f: FactionId, n: number) => {
      addRep(s(), f, n, false);
      bump();
    },
    words: (n: number) => {
      learnWords(s(), n);
      bump();
    },
    research: (n: number) => {
      addResearchPoints(s(), n);
      bump();
    },
    /** Advance time day by day (so the daily simulation runs). */
    days: (n: number) => {
      const st = s();
      for (let i = 0; i < n && !st.dead; i++) {
        st.ship.supplies = Math.max(st.ship.supplies, 20);
        passTime(st, 1);
      }
      bump();
    },
    /** Reveal every body of the current system (as if scanned). */
    detectHere: () => {
      const st = s();
      const sys = galaxyOf(st).systems[st.location.systemId];
      st.detected[sys.id] = sys.bodies.map((b) => b.id);
      bump();
    },
    /** Proceeds of selling one unit of a good at the docked station (shows the tariff effect). */
    sellQuote: (goodId: string) => {
      const st = s();
      const stn = galaxyOf(st).stationsById[st.location.stationId ?? ''];
      if (!stn) return null;
      const fees = feesFor(stn, st.difficulty, false, tariffMult(st, stn));
      return quoteSell(stn, st.stations[stn.id].stock[GOOD_INDEX[goodId]], goodId, 1, fees).total;
    },
    tariff: () => {
      const st = s();
      const stn = galaxyOf(st).stationsById[st.location.stationId ?? ''];
      return stn ? tariffMult(st, stn) : null;
    },
    /** Finish all construction and orders now. */
    finishBuilds: () => {
      const b = s().base;
      if (b) {
        for (const q of b.queue) q.done = s().day;
        for (const o of b.orders) o.done = s().day;
      }
      bump();
    },
    ending: (id: string) => {
      triggerEnding(s(), id);
      bump();
    },
  };
}
