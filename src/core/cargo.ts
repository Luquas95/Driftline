import { GOODS_BY_ID } from '../content/goods';
import type { CargoItem, GoodDef } from './types';
import type { ShipStats } from './ship';
import { T } from './tuning';

export interface GridDims {
  cols: number;
  /** Nominal rows (inside the hull). */
  rows: number;
  /** Extra rows outside the hull: usable but dangerous. */
  overflowRows: number;
  /** Nominal cells available (rest of the last row is blocked). */
  cells: number;
}

export function gridDims(stats: Pick<ShipStats, 'cargoCells' | 'cargoCols'>): GridDims {
  const cols = Math.max(1, stats.cargoCols);
  const cells = Math.max(0, stats.cargoCells);
  return { cols, rows: Math.max(1, Math.ceil(cells / cols)), overflowRows: T.overloadRow, cells };
}

export function totalRows(d: GridDims): number {
  return d.rows + d.overflowRows;
}

function blocked(d: GridDims, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= d.cols || y >= totalRows(d)) return true;
  if (y < d.rows) return y * d.cols + x >= d.cells;
  return false;
}

export function occupancyGrid(d: GridDims, items: CargoItem[], ignoreUid?: string): (string | null)[][] {
  const g: (string | null)[][] = Array.from({ length: totalRows(d) }, () => Array<string | null>(d.cols).fill(null));
  for (const it of items) {
    if (it.uid === ignoreUid) continue;
    for (let dy = 0; dy < it.h; dy++)
      for (let dx = 0; dx < it.w; dx++) {
        const y = it.y + dy;
        const x = it.x + dx;
        if (y >= 0 && y < g.length && x >= 0 && x < d.cols) g[y][x] = it.uid;
      }
  }
  return g;
}

export function fitsAt(d: GridDims, items: CargoItem[], w: number, h: number, x: number, y: number, ignoreUid?: string): boolean {
  const g = occupancyGrid(d, items, ignoreUid);
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++) {
      if (blocked(d, x + dx, y + dy) || g[y + dy][x + dx] !== null) return false;
    }
  return true;
}

/** First-fit scan: nominal rows first, overflow rows last. Tries rotation. */
export function findSpot(d: GridDims, items: CargoItem[], w: number, h: number, allowOverflow = true): { x: number; y: number; w: number; h: number } | null {
  const g = occupancyGrid(d, items);
  const rows = allowOverflow ? totalRows(d) : d.rows;
  const orientations = w === h ? [[w, h]] : [[w, h], [h, w]];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < d.cols; x++) {
      for (const [ow, oh] of orientations) {
        let ok = true;
        for (let dy = 0; dy < oh && ok; dy++)
          for (let dx = 0; dx < ow; dx++) {
            const yy = y + dy;
            const xx = x + dx;
            if (yy >= rows || blocked(d, xx, yy) || g[yy][xx] !== null) {
              ok = false;
              break;
            }
          }
        if (ok) return { x, y, w: ow, h: oh };
      }
    }
  }
  return null;
}

export function overloadCells(d: GridDims, items: CargoItem[]): number {
  let n = 0;
  for (const it of items)
    for (let dy = 0; dy < it.h; dy++) if (it.y + dy >= d.rows) n += it.w;
  return n;
}

export function usedCells(items: CargoItem[]): number {
  return items.reduce((s, i) => s + i.w * i.h, 0);
}

export function cargoMass(items: CargoItem[]): number {
  let m = 0;
  for (const it of items) m += it.qty * (GOODS_BY_ID[it.goodId]?.mass ?? 0.2);
  return m;
}

export function capacityOf(good: GoodDef, w: number, h: number): number {
  return good.unitsPerCell * w * h;
}

/** Container shapes needed to hold `qty` units: greedy 2x2, 2x1, 1x1. */
export function shapesFor(good: GoodDef, qty: number): { w: number; h: number; qty: number }[] {
  const out: { w: number; h: number; qty: number }[] = [];
  let left = qty;
  for (const [w, h] of [[2, 2], [2, 1], [1, 1]] as const) {
    const cap = capacityOf(good, w, h);
    while (left >= cap || (left > 0 && w === 1)) {
      const q = Math.min(left, cap);
      out.push({ w, h, qty: q });
      left -= q;
      if (left <= 0) break;
    }
  }
  return out;
}

export interface QuotaInfo {
  chilledCells: number;
  secureCells: number;
}

export function quotaUse(items: CargoItem[]): { chilled: number; secure: number } {
  let chilled = 0;
  let secure = 0;
  for (const it of items) {
    const g = GOODS_BY_ID[it.goodId];
    if (!g) continue;
    if (g.tags.includes('chilled')) chilled += it.w * it.h;
    if (g.tags.includes('sensitive')) secure += it.w * it.h;
  }
  return { chilled, secure };
}

export interface AddResult {
  added: number;
  items: CargoItem[];
  reason?: 'full' | 'chilled' | 'secure';
}

let cargoUid = 0;
export function nextCargoUid(): string {
  return `c${++cargoUid}`;
}
/** Seed the uid counter so loaded saves never collide. */
export function syncCargoUid(items: CargoItem[]): void {
  for (const i of items) {
    const n = Number(i.uid.slice(1));
    if (n > cargoUid) cargoUid = n;
  }
}

/**
 * Adds goods to the grid. Mutates and returns the new item list. Partially added when space or quota runs out.
 * Containers of the same good are topped up first.
 */
export function addGoods(
  items: CargoItem[],
  d: GridDims,
  quotas: QuotaInfo,
  goodId: string,
  qty: number,
  totalCost: number,
  day: number,
  contractId?: string,
  allowOverflow = true,
): AddResult {
  const good = GOODS_BY_ID[goodId];
  const unitCost = qty > 0 ? totalCost / qty : 0;
  let remaining = qty;
  let added = 0;
  let reason: AddResult['reason'];
  // top up partial containers (never those bound to a contract)
  if (!contractId) {
    for (const it of items) {
      if (remaining <= 0) break;
      if (it.goodId !== goodId || it.contractId) continue;
      const room = capacityOf(good, it.w, it.h) - it.qty;
      if (room <= 0) continue;
      const take = Math.min(room, remaining);
      it.acquiredDay = (it.acquiredDay * it.qty + day * take) / (it.qty + take);
      it.qty += take;
      it.cost += take * unitCost;
      remaining -= take;
      added += take;
    }
  }
  const use = quotaUse(items);
  const shapes = remaining > 0 ? shapesFor(good, remaining) : [];
  for (const sh of shapes) {
    const cells = sh.w * sh.h;
    if (good.tags.includes('chilled') && use.chilled + cells > quotas.chilledCells) {
      reason = 'chilled';
      break;
    }
    if (good.tags.includes('sensitive') && use.secure + cells > quotas.secureCells) {
      reason = 'secure';
      break;
    }
    const spot = findSpot(d, items, sh.w, sh.h, allowOverflow);
    if (!spot) {
      reason = 'full';
      // fall back to 1x1 pieces
      let left = sh.qty;
      const cap1 = capacityOf(good, 1, 1);
      while (left > 0) {
        const s1 = findSpot(d, items, 1, 1, allowOverflow);
        if (!s1) break;
        if (good.tags.includes('chilled') && use.chilled + 1 > quotas.chilledCells) {
          reason = 'chilled';
          break;
        }
        if (good.tags.includes('sensitive') && use.secure + 1 > quotas.secureCells) {
          reason = 'secure';
          break;
        }
        const q = Math.min(left, cap1);
        items.push({ uid: nextCargoUid(), goodId, qty: q, w: 1, h: 1, x: s1.x, y: s1.y, cost: q * unitCost, acquiredDay: day, contractId });
        if (good.tags.includes('chilled')) use.chilled++;
        if (good.tags.includes('sensitive')) use.secure++;
        left -= q;
        added += q;
        remaining -= q;
      }
      break;
    }
    items.push({ uid: nextCargoUid(), goodId, qty: sh.qty, w: spot.w, h: spot.h, x: spot.x, y: spot.y, cost: sh.qty * unitCost, acquiredDay: day, contractId });
    use.chilled += good.tags.includes('chilled') ? cells : 0;
    use.secure += good.tags.includes('sensitive') ? cells : 0;
    added += sh.qty;
    remaining -= sh.qty;
  }
  return { added, items, reason: added < qty ? reason ?? 'full' : undefined };
}

/** How many units can still be loaded (simulation on a copy). */
export function loadableUnits(items: CargoItem[], d: GridDims, quotas: QuotaInfo, goodId: string, want: number, allowOverflow = true): number {
  const copy = items.map((i) => ({ ...i }));
  return addGoods(copy, d, quotas, goodId, want, 0, 0, undefined, allowOverflow).added;
}

/** Removes `qty` units of a good, FIFO by acquisition day. Returns {removed, cost}. */
export function removeGoods(items: CargoItem[], goodId: string, qty: number): { removed: number; cost: number } {
  let left = qty;
  let cost = 0;
  const own = items.filter((i) => i.goodId === goodId && !i.contractId).sort((a, b) => a.acquiredDay - b.acquiredDay);
  for (const it of own) {
    if (left <= 0) break;
    const take = Math.min(it.qty, left);
    const c = it.qty > 0 ? (it.cost * take) / it.qty : 0;
    it.qty -= take;
    it.cost -= c;
    cost += c;
    left -= take;
  }
  for (let i = items.length - 1; i >= 0; i--) if (items[i].qty <= 0) items.splice(i, 1);
  return { removed: qty - left, cost };
}

export function unitsOf(items: CargoItem[], goodId: string, contractId?: string): number {
  let n = 0;
  for (const i of items) if (i.goodId === goodId && (contractId ? i.contractId === contractId : !i.contractId)) n += i.qty;
  return n;
}

export function rotateItem(items: CargoItem[], d: GridDims, uid: string): boolean {
  const it = items.find((i) => i.uid === uid);
  if (!it || it.w === it.h) return false;
  if (!fitsAt(d, items, it.h, it.w, it.x, it.y, uid)) {
    // try to find another spot for the rotated shape
    const others = items.filter((i) => i.uid !== uid);
    const spot = findSpot(d, others, it.h, it.w);
    if (!spot || spot.w !== it.h) return false;
    it.x = spot.x;
    it.y = spot.y;
  }
  [it.w, it.h] = [it.h, it.w];
  return true;
}

export function moveItem(items: CargoItem[], d: GridDims, uid: string, x: number, y: number): boolean {
  const it = items.find((i) => i.uid === uid);
  if (!it) return false;
  if (!fitsAt(d, items, it.w, it.h, x, y, uid)) return false;
  it.x = x;
  it.y = y;
  return true;
}

/** Repack everything first-fit-decreasing, nominal rows preferred. Leaves items untouched on failure. */
export function autoArrange(items: CargoItem[], d: GridDims): boolean {
  const order = [...items].sort((a, b) => b.w * b.h - a.w * a.h || Math.max(b.w, b.h) - Math.max(a.w, a.h));
  const placed: CargoItem[] = [];
  const next: Record<string, { x: number; y: number; w: number; h: number }> = {};
  for (const it of order) {
    const spot = findSpot(d, placed, it.w, it.h);
    if (!spot) return false;
    next[it.uid] = spot;
    placed.push({ ...it, ...spot });
  }
  for (const it of items) Object.assign(it, next[it.uid]);
  return true;
}

/** Perishable value factor by age. 1 = fresh. */
export function freshness(good: GoodDef, ageDays: number): number {
  if (!good.shelfDays) return 1;
  const S = good.shelfDays;
  if (ageDays <= 0.3 * S) return 1;
  return Math.max(0.2, 1 - ((ageDays - 0.3 * S) / (0.7 * S)) * 0.8);
}

export function isSpoiled(good: GoodDef, ageDays: number): boolean {
  return !!good.shelfDays && ageDays > good.shelfDays * 1.4;
}

export function daysLeft(good: GoodDef, ageDays: number): number | null {
  return good.shelfDays ? Math.max(0, good.shelfDays * 1.4 - ageDays) : null;
}
