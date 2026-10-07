import { useEffect } from 'preact/hooks';
import { stage, stageReady } from '../render/instance';
import type { Scene } from '../render/stage';

/** Install a Pixi scene for the lifetime of a component. `deps` re-create the scene. */
export function useScene(factory: () => Scene | null, deps: unknown[]): void {
  const ready = stageReady.value;
  useEffect(() => {
    if (!ready) return;
    const sc = factory();
    stage.setScene(sc);
    return () => {
      stage.setScene(null);
    };
  }, [ready, ...deps]);
}
