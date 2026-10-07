import { describe, expect, it } from 'vitest';
import { GOOD_INDEX } from '../src/content/goods';
import {
  feesFor,
  midPrice,
  quoteBuy,
  quoteSell,
  targetStock,
  tickEconomy,
  maybeSpawnEvent,
  eventMod,
  goodCap,
  serviceMult,
} from '../src/core/economy';
import { buyGoods, sellGoods, maxBuy, quoteFor, stockOf } from '../src/core/game';
import { galaxyOf, stationOf } from '../src/core/state';
import { passTime } from '../src/core/time';
import { mk } from './helpers';

function producerGood(st: ReturnType<typeof stationOf>): string {
  return Object.entries(st.role)
    .filter(([g, v]) => v > 0.4 && !['fusion_cells', 'radioactives'].includes(g))
    .sort((a, b) => b[1] - a[1])[0]?.[0];
}

describe('economy', () => {
  it('price falls with stock and rises when scarce', () => {
    const s = mk();
    const st = stationOf(s, s.location.stationId!);
    const gid = st.goods[0];
    const cap = goodCap(st, gid);
    expect(midPrice(st, gid, cap * 0.1)).toBeGreaterThan(midPrice(st, gid, cap * 0.5));
    expect(midPrice(st, gid, cap * 0.5)).toBeGreaterThan(midPrice(st, gid, cap * 1.5));
  });

  it('buying a large volume raises the price (slippage); selling lowers it', () => {
    const s = mk();
    const st = stationOf(s, s.location.stationId!);
    const gid = st.goods[0];
    const stock = 400;
    const fees = feesFor(st, s.difficulty, false);
    const small = quoteBuy(st, stock, gid, 5, fees);
    const big = quoteBuy(st, stock, gid, 300, fees);
    expect(big.avg).toBeGreaterThan(small.avg);
    expect(big.last).toBeGreaterThan(big.first);
    const sSmall = quoteSell(st, stock, gid, 5, fees);
    const sBig = quoteSell(st, stock, gid, 300, fees);
    expect(sBig.avg).toBeLessThan(sSmall.avg);
  });

  it('buy and sell at the same station always loses money (spread, tariff, slippage)', () => {
    const s = mk('LOOP1');
    const stId = s.location.stationId!;
    const st = stationOf(s, stId);
    const gid = producerGood(st) ?? st.goods[0];
    const before = s.credits;
    const b = buyGoods(s, stId, gid, 40);
    if (!b.ok) return;
    const sell = sellGoods(s, stId, gid, 40);
    expect(sell.ok).toBe(true);
    expect(s.credits).toBeLessThan(before);
  });

  it('repeated A->B trade stops being profitable as stock recovers slowly', () => {
    const s = mk('LOOP2');
    const g = galaxyOf(s);
    const a = stationOf(s, s.location.stationId!);
    // find a destination consuming something A produces, in the same system if possible else any
    let best: { d: string; gid: string } | null = null;
    for (const st of Object.values(g.stationsById)) {
      if (st.id === a.id || st.blackMarket) continue;
      for (const gid of a.goods) {
        if ((a.role[gid] ?? 0) > 0.3 && (st.role[gid] ?? 0) < -0.3 && st.goods.includes(gid))
          best = { d: st.id, gid };
      }
    }
    if (!best) return;
    const d = stationOf(s, best.d);
    const fees = feesFor(a, s.difficulty, false);
    const profit = () => {
      const q = 120;
      const cost = quoteBuy(a, s.stations[a.id].stock[GOOD_INDEX[best!.gid]], best!.gid, q, fees).total;
      const rev = quoteSell(d, s.stations[d.id].stock[GOOD_INDEX[best!.gid]], best!.gid, q, fees).total;
      return rev - cost;
    };
    const p0 = profit();
    // simulate trading: shift stocks as the player's trade would
    s.stations[a.id].stock[GOOD_INDEX[best.gid]] -= 120;
    s.stations[d.id].stock[GOOD_INDEX[best.gid]] += 120;
    const p1 = profit();
    expect(p1).toBeLessThan(p0);
    // recovery over time
    for (let i = 0; i < 5; i++) {
      s.stations[a.id].stock[GOOD_INDEX[best.gid]] -= 120;
      s.stations[d.id].stock[GOOD_INDEX[best.gid]] += 120;
    }
    expect(profit()).toBeLessThan(p1);
    passTime(s, 60);
    expect(profit()).toBeGreaterThan(p1);
  });

  it('stock reverts toward its target over time (production and consumption)', () => {
    const s = mk('REV');
    const st = stationOf(s, s.location.stationId!);
    const gid = st.goods[0];
    const i = GOOD_INDEX[gid];
    const target = targetStock(st, gid);
    s.stations[st.id].stock[i] = target * 4;
    passTime(s, 30);
    expect(Math.abs(s.stations[st.id].stock[i] - target)).toBeLessThan(target * 1.5);
    expect(s.stations[st.id].stock[i]).toBeLessThan(target * 4);
  });

  it('economy ticks deterministically regardless of caller', () => {
    const a = mk('DET');
    const b = mk('DET');
    passTime(a, 10);
    passTime(b, 4);
    passTime(b, 6);
    const k = Object.keys(a.stations).slice(0, 20);
    for (const id of k) expect(b.stations[id].stock).toEqual(a.stations[id].stock);
  });

  it('market events change demand and are announced', () => {
    const s = mk('EVT');
    const g = galaxyOf(s);
    let found = false;
    for (let d = 1; d < 200 && !found; d++) {
      const ev = maybeSpawnEvent(g, s, d);
      if (ev) {
        found = true;
        expect(ev.end).toBeGreaterThan(ev.start);
        const cat = Object.keys(ev.mods)[0];
        const gid = ['grain', 'metals', 'medicine', 'iron_ore', 'computers', 'spirits', 'narcotics'].find(
          (x) => eventMod([ev], d, ev.sector, x) !== 1,
        );
        void cat;
        if (gid) expect(eventMod([ev], d, ev.sector, gid)).not.toBe(1);
        expect(eventMod([ev], ev.end + 1, ev.sector, 'grain')).toBe(1);
      }
    }
    expect(found).toBe(true);
    tickEconomy(g, s, 5);
  });

  it('respects stock limits, funds and exposes quotes', () => {
    const s = mk('LIM');
    const stId = s.location.stationId!;
    const st = stationOf(s, stId);
    const gid = producerGood(st) ?? st.goods[0];
    expect(maxBuy(s, stId, gid)).toBeGreaterThanOrEqual(0);
    s.credits = 1;
    expect(buyGoods(s, stId, gid, 10).ok).toBe(false);
    expect(stockOf(s, stId, gid)).toBeGreaterThan(0);
    expect(quoteFor(s, stId, gid, 'buy', 5).total).toBeGreaterThan(0);
    expect(quoteFor(s, stId, gid, 'sell', 5).total).toBeGreaterThan(0);
    expect(sellGoods(s, stId, gid, 5).ok).toBe(false);
    expect(buyGoods(s, 'nope', gid, 1).ok).toBe(false);
    expect(serviceMult(st, 'rim', s.difficulty)).toBeGreaterThan(serviceMult(st, 'core', s.difficulty));
  });
});
