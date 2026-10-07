import { signal } from '@preact/signals';
import { Stage } from './stage';

export const stage = new Stage();
export const stageReady = signal(false);
export const stageFailed = signal(false);
