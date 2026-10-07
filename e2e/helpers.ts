import { expect, type Page } from '@playwright/test';

export interface DL {
  state: () => any; // eslint-disable-line @typescript-eslint/no-explicit-any
  screen: () => string;
  select: (id: number | null) => void;
  freeze: (t?: number) => void;
  neighborWithStation: () => number | null;
  delta: (id: number) => { dx: number; dy: number };
  loadout: (defs: string[], missiles?: number) => void;
  encounter: (enemy: string, tier?: number) => void;
  fightStep: (seconds: number) => void;
  fightAuto: () => void;
  roomPos: (side: 'player' | 'enemy', ship: number, room: number) => { x: number; y: number } | null;
}

declare global {
  interface Window {
    __dl: DL;
  }
}

export async function startGame(
  page: Page,
  opts: { seed?: string; tutorial?: boolean; quick?: boolean } = {},
) {
  await page.addInitScript((tutorial) => {
    try {
      localStorage.setItem(
        'driftline.settings',
        JSON.stringify({ tutorial, motion: 'reduced', muted: true }),
      );
    } catch {
      /* ignore */
    }
  }, opts.tutorial ?? false);
  await page.goto(opts.quick === false ? '/?e2e=1' : '/?e2e=1&quick=1');
  await page.getByTestId('menu-new').click();
  await page.getByTestId('new-seed').fill(opts.seed ?? 'E2E1');
  await page.getByTestId('menu-start').click();
  await expect(page.getByTestId('screen-station')).toBeVisible();
  await page.waitForFunction(() => !!window.__dl?.state());
}

export const state = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__dl.state())));

/** Resolve any modal that may appear after an action (events, dock reports). */
export async function clearModals(page: Page) {
  for (let i = 0; i < 6; i++) {
    const ev = page.getByTestId('modal-event');
    if (await ev.isVisible().catch(() => false)) {
      await page.getByTestId('event-choice-0').click();
      continue;
    }
    const res = page.getByTestId('modal-event-result');
    if (await res.isVisible().catch(() => false)) {
      await page.getByTestId('event-ok').click();
      continue;
    }
    const dock = page.getByTestId('modal-dockreport');
    if (await dock.isVisible().catch(() => false)) {
      await page.getByTestId('dockreport-ok').click();
      continue;
    }
    const resp = page.getByTestId('modal-respawn');
    if (await resp.isVisible().catch(() => false)) {
      await resp.getByRole('button').click();
      continue;
    }
    break;
  }
}

export async function openScreen(page: Page, id: string) {
  await page.getByTestId(`nav-${id}`).click();
  await expect(page.getByTestId(`screen-${id}`)).toBeVisible();
}

/** On narrow screens the trade panel is a modal: close it so navigation is reachable. */
export async function closeTrade(page: Page) {
  const m = page.getByTestId('modal-trade');
  if (await m.isVisible().catch(() => false)) await page.keyboard.press('Escape');
}
