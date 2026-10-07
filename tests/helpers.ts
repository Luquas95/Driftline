import { newGame } from '../src/core/start';
import type { GameState } from '../src/core/types';

export function mk(seed = 'T1', size = 120, extra: Parameters<typeof newGame>[0] = {}): GameState {
  return newGame({ seed, galaxySize: size, ...extra });
}
