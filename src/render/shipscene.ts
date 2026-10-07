import { Container, Graphics } from 'pixi.js';
import { createNebula, createStarfield } from './materials';
import { drawShip, Exhaust, type ShipDrawing } from './shipgen';
import type { Scene } from './stage';
import type { Ship } from '../core/types';
import { prefersReducedMotion } from '../ui/settings';

export interface ShipScene extends Scene {
  setShip(ship: Ship): void;
  setHighlight(i: number | null): void;
  /** Region (in canvas pixels) where the ship is drawn; defaults to the whole canvas. */
  setRegion(x: number, y: number, w: number, h: number): void;
}

export function createShipScene(initial: Ship, seedStr: string, compact = false): ShipScene {
  const container = new Container();
  const nebula = createNebula([0.08, 0.14, 0.32], [0.28, 0.12, 0.3], [0.08, 0.26, 0.36], 0.7);
  const stars = createStarfield(0.5);
  container.addChild(nebula.mesh, stars.mesh);
  const shipLayer = new Container();
  const gfx = new Graphics();
  const exhaust = new Exhaust(48);
  shipLayer.addChild(exhaust.container, gfx);
  container.addChild(shipLayer);
  let ship = initial;
  let highlight: number | null = null;
  let drawing: ShipDrawing | null = null;
  let dirty = true;
  let W = 600;
  let H = 300;
  let region = { x: 0, y: 0, w: 0, h: 0 };
  let seed = 1;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  function applyRegion(): void {
    const r = region.w > 0 ? region : { x: 0, y: 0, w: W, h: H };
    const k = Math.min(r.w / (compact ? 420 : 400), r.h / 215);
    shipLayer.scale.set(k);
    shipLayer.position.set(r.x + r.w / 2, r.y + r.h / 2);
  }
  return {
    container,
    setRegion(x, y, w, h) {
      region = { x, y, w, h };
      applyRegion();
    },
    resize(w, h) {
      W = w;
      H = h;
      nebula.mesh.position.set(W / 2, H / 2);
      nebula.mesh.scale.set(W / 2, H / 2);
      stars.mesh.position.set(W / 2, H / 2);
      stars.mesh.scale.set(W / 2, H / 2);
      applyRegion();
    },
    update(dt, time) {
      if (dirty) {
        drawing = drawShip(gfx, ship.hullId, ship.slots, seedStr, highlight);
        dirty = false;
      }
      const reduced = prefersReducedMotion();
      const r = region.w > 0 ? region : { x: 0, y: 0, w: W, h: H };
      shipLayer.y = r.y + r.h / 2 + (reduced ? 0 : Math.sin(time * 0.9) * 4);
      if (drawing) exhaust.update(dt, drawing.nozzles, 1, reduced, rand);
      const aspect = W / H;
      nebula.set({ time, offX: 0.1, offY: 0.2, scale: 1.6, aspectX: aspect, aspectY: 1 });
      stars.set({
        time,
        offX: reduced ? 0 : time * 0.02,
        offY: 0,
        aspectX: aspect,
        aspectY: 1,
        twinkle: reduced ? 0 : 1,
      });
    },
    destroy() {
      container.destroy({ children: true });
    },
    setShip(s) {
      ship = s;
      dirty = true;
    },
    setHighlight(i) {
      highlight = i;
      dirty = true;
    },
  };
}
