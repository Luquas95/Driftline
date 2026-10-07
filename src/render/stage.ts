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
  /** Lower the render resolution when frames are slow (weak tablets); disabled in tests. */
  adaptive = true;
  private slowFrames = 0;
  private sampled = 0;

  async init(host: HTMLElement): Promise<void> {
    const app = new Application();
    await app.init({
      resizeTo: host,
      background: '#070b14',
      antialias: true,
      resolution: Math.min(
        window.devicePixelRatio || 1,
        window.matchMedia?.('(pointer: coarse)').matches ? 1.5 : 2,
      ),
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
      this.watchPerformance(tk.deltaMS);
      this.time += dt;
      try {
        this.scene?.update(dt, this.time);
      } catch (err) {
        // never let one broken scene stop the ticker (and with it the whole canvas)
        console.error('scene update failed', err);
        this.setScene(null);
      }
    });
    app.renderer.on('resize', () => this.scene?.resize(app.screen.width, app.screen.height));
  }

  /** If the last ~120 frames averaged over 26 ms, step the resolution down (never below 0.75). */
  private watchPerformance(ms: number): void {
    if (!this.adaptive || document.hidden) return;
    this.sampled++;
    if (ms > 26) this.slowFrames++;
    if (this.sampled < 120) return;
    const slow = this.slowFrames / this.sampled > 0.6;
    this.sampled = 0;
    this.slowFrames = 0;
    const r = this.app.renderer.resolution;
    if (slow && r > 0.75) this.app.renderer.resolution = Math.max(0.75, Math.round((r - 0.25) * 100) / 100);
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
