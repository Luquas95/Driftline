import { Container } from 'pixi.js';
import { createNebula, createPlanet, createStar, createStarfield, planetParams } from './materials';
import type { Scene } from './stage';
import type { BodyKind, SpectralClass } from '../core/types';

/** Test scene showing every planet type, star classes and the background layers. Opened with ?gallery. */
export function createGalleryScene(): Scene {
  const container = new Container();
  const nebula = createNebula([0.12, 0.2, 0.45], [0.4, 0.15, 0.4], [0.1, 0.4, 0.5], 0.9);
  const stars = createStarfield();
  container.addChild(nebula.mesh, stars.mesh);
  const planets: ReturnType<typeof createPlanet>[] = [];
  const kinds: BodyKind[] = ['rocky', 'desert', 'ocean', 'ice', 'volcanic', 'gas', 'dead', 'moon'];
  const planetLayer = new Container();
  container.addChild(planetLayer);
  kinds.forEach((kind, i) => {
    const p = createPlanet(
      planetParams({
        kind,
        seed: 1000 + i * 77,
        atmosphere: kind !== 'dead' && kind !== 'moon',
        id: `g${i}`,
      }),
    );
    planetLayer.addChild(p.mesh);
    planets.push(p);
  });
  const starLayer = new Container();
  container.addChild(starLayer);
  const classes: SpectralClass[] = ['O', 'B', 'A', 'F', 'G', 'K', 'M'];
  const sMeshes = classes.map((c, i) => {
    const s = createStar(c, 500 + i);
    starLayer.addChild(s.mesh);
    return s;
  });
  let w = 800;
  let h = 600;
  return {
    container,
    resize(nw, nh) {
      w = nw;
      h = nh;
      nebula.mesh.position.set(w / 2, h / 2);
      nebula.mesh.scale.set(w / 2, h / 2);
      stars.mesh.position.set(w / 2, h / 2);
      stars.mesh.scale.set(w / 2, h / 2);
      const r = Math.min(w / 9, 90);
      planets.forEach((p, i) => {
        p.mesh.position.set(w * (0.1 + 0.8 * ((i % 4) / 3)), h * (0.18 + 0.2 * Math.floor(i / 4)));
        p.mesh.scale.set(r);
      });
      sMeshes.forEach((s, i) => {
        s.mesh.position.set(w * (0.08 + 0.84 * (i / 6)), h * 0.78);
        s.mesh.scale.set(Math.min(w / 8, 100));
      });
    },
    update(_dt, time) {
      nebula.set({ time, offX: 0, offY: 0, aspectX: w / h, aspectY: 1 });
      stars.set({ time, offX: 0, offY: 0, aspectX: w / h, aspectY: 1, twinkle: 1 });
      planets.forEach((p) => p.setTime(time));
      sMeshes.forEach((s) => s.setTime(time));
    },
    destroy() {
      container.destroy({ children: true });
    },
  };
}
