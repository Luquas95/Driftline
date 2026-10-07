import { Application, Container } from 'pixi.js';

export interface Scene {
  container: Container;
  update(dt: number, time: number): void;
  resize(w: number, h: number): void;
  destroy(): void;
}

/** Owns the single Pixi application and swaps scenes. DOM UI overlays the canvas. */
export class Stage {
  app!: Application;
  scene: Scene | null = null;
  time = 0;
  private ready = false;
  /** Frame limiter used for tests (deterministic snapshots) */
  frozen = false;

  async init(host: HTMLElement): Promise<void> {
    const app = new Application();
    await app.init({
      resizeTo: host,
      background: '#070b14',
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      preference: 'webgl',
      powerPreference: 'high-performance',
    });
    host.appendChild(app.canvas);
    app.canvas.style.display = 'block';
    app.canvas.setAttribute('aria-hidden', 'true');
    this.app = app;
    this.ready = true;
    app.ticker.add((tk) => {
      if (this.frozen) return;
      const dt = tk.deltaMS / 1000;
      this.time += dt;
      this.scene?.update(dt, this.time);
    });
    app.renderer.on('resize', () => this.scene?.resize(app.screen.width, app.screen.height));
  }

  get width(): number {
    return this.app.screen.width;
  }
  get height(): number {
    return this.app.screen.height;
  }

  setScene(scene: Scene | null): void {
    if (!this.ready) return;
    if (this.scene) {
      this.app.stage.removeChild(this.scene.container);
      this.scene.destroy();
    }
    this.scene = scene;
    if (scene) {
      this.app.stage.addChild(scene.container);
      scene.resize(this.app.screen.width, this.app.screen.height);
    }
  }

  /** Render a single frame at a fixed time (visual tests). */
  renderAt(time: number): void {
    this.time = time;
    this.scene?.update(0, time);
    this.app.render();
  }

  destroy(): void {
    this.setScene(null);
    this.app?.destroy(true, { children: true });
    this.ready = false;
  }
}
