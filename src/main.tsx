import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { App } from './ui/App';
import { Stage } from './render/stage';
import { createGalleryScene } from './render/gallery';
import './ui/styles.css';

async function boot() {
  const params = new URLSearchParams(location.search);
  if (params.has('gallery')) {
    const host = document.getElementById('app')!;
    host.style.cssText = 'position:fixed;inset:0';
    const stage = new Stage();
    await stage.init(host);
    stage.setScene(createGalleryScene());
    (window as unknown as { __stage: Stage }).__stage = stage;
    return;
  }
  render(<App />, document.getElementById('app')!);
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    registerSW({ immediate: true });
  }
}
void boot();
