import { Container, Graphics, Rectangle } from 'pixi.js';
import { HULLS_BY_ID } from '../content/hulls';
import { buildStarterShip } from '../core/ship';
import { drawShip } from './shipgen';
import { stage } from './instance';

const cache = new Map<string, Promise<string | null>>();
/** Extractions run one after another: parallel extracts on one renderer fail on weak GPUs. */
let queue: Promise<unknown> = Promise.resolve();

/**
 * A still picture (data URL) of a hull for the shipyard cards, rendered once through Pixi and cached.
 * Returns null when the renderer is not available (the card then shows no picture).
 */
export function hullThumb(hullId: string, seed = 'thumb'): Promise<string | null> {
  const key = `${hullId}:${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const job = async (): Promise<string | null> => {
    try {
      if (!HULLS_BY_ID[hullId] || !stage.app?.renderer) return null;
      let n = 0;
      const ship = buildStarterShip(hullId, 'x', () => `th${++n}`);
      const root = new Container();
      const g = new Graphics();
      root.addChild(g);
      drawShip(g, hullId, ship.slots, seed, null);
      const url = await stage.app.renderer.extract.base64({
        target: root,
        frame: new Rectangle(-215, -105, 430, 210),
        resolution: 0.75,
        antialias: true,
      });
      root.destroy({ children: true });
      return url;
    } catch {
      return null;
    }
  };
  const p = queue.then(job, job);
  queue = p.catch(() => undefined);
  cache.set(key, p);
  return p;
}
