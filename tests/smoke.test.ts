import { describe, expect, it } from 'vitest';
import { newGame, analyze, galaxyOf } from '../src/core/state';
import { buyGoods, sellGoods, dockAt, jump, maxBuy } from '../src/core/game';

describe('smoke', () => {
  it('creates a game and trades', () => {
    const s = newGame({ seed: 'TEST1', galaxySize: 150 });
    const g = galaxyOf(s);
    expect(g.systems.length).toBe(150);
    const { stats } = analyze(s);
    console.log(stats.powerOut, stats.idleDraw, stats.jumpDraw, stats.rangeFull, stats.cargoCells, stats.jumpSpeed);
    const st = s.location.stationId!;
    const stn = g.stationsById[st];
    console.log(stn.type, stn.size, stn.goods.length);
    const good = stn.goods.find((x) => (stn.role[x] ?? 0) > 0) ?? stn.goods[0];
    console.log(good, maxBuy(s, st, good));
    const r = buyGoods(s, st, good, 50);
    console.log(r, s.credits);
    const sys = g.systems[s.location.systemId];
    const to = sys.neighbors[0];
    const j = jump(s, to);
    console.log(j.ok, s.day, s.ship.fuel, s.pendingEvent);
    void dockAt; void sellGoods;
  });
});
