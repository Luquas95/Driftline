import { deserializeState, serializeState } from '../core/save';
import type { GameState } from '../core/types';

export interface SaveMeta {
  id: string;
  name: string;
  savedAt: number;
  day: number;
  credits: number;
  seed: string;
  ship: string;
}

interface Row extends SaveMeta {
  json: string;
}

const STORE = 'saves';

/** IndexedDB-backed save slots. Falls back to an in-memory map when IndexedDB is unavailable (private mode). */
export class SaveStore {
  private dbp: Promise<IDBDatabase | null> | null = null;
  private mem = new Map<string, Row>();

  constructor(private name = 'driftline') {}

  private open(): Promise<IDBDatabase | null> {
    if (this.dbp) return this.dbp;
    this.dbp = new Promise((resolve) => {
      try {
        const req = indexedDB.open(this.name, 1);
        req.onupgradeneeded = () => {
          req.result.createObjectStore(STORE, { keyPath: 'id' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return this.dbp;
  }

  private async tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
    const db = await this.open();
    if (!db) return null;
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async put(id: string, state: GameState, name?: string, now = 0): Promise<void> {
    const row: Row = {
      id,
      name: name ?? id,
      savedAt: now || Date.now(),
      day: Math.floor(state.day),
      credits: Math.round(state.credits),
      seed: state.seed,
      ship: state.ship.name,
      json: serializeState(state),
    };
    const r = await this.tx('readwrite', (s) => s.put(row));
    if (r === null) this.mem.set(id, row);
  }

  async get(id: string): Promise<GameState | null> {
    const db = await this.open();
    const row = db
      ? await this.tx<Row | undefined>('readonly', (s) => s.get(id) as IDBRequest<Row | undefined>)
      : this.mem.get(id);
    return row ? deserializeState(row.json) : null;
  }

  async list(): Promise<SaveMeta[]> {
    const db = await this.open();
    const rows = db
      ? ((await this.tx<Row[]>('readonly', (s) => s.getAll() as IDBRequest<Row[]>)) ?? [])
      : [...this.mem.values()];
    return rows.map(({ json: _json, ...meta }) => meta).sort((a, b) => b.savedAt - a.savedAt);
  }

  async remove(id: string): Promise<void> {
    const db = await this.open();
    if (db) await this.tx('readwrite', (s) => s.delete(id));
    else this.mem.delete(id);
  }
}
