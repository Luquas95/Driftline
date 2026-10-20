import { expect, type Page } from '@playwright/test';

export interface DL {
  state: () => any; // eslint-disable-line @typescript-eslint/no-explicit-any
  screen: () => string;
  select: (id: number | null) => void;
  freeze: (t?: number) => void;
  bump: () => void;
  neighborWithStation: () => number | null;
  delta: (id: number) => { dx: number; dy: number };
  loadout: (defs: string[], missiles?: number) => void;
  encounter: (enemy: string, tier?: number) => void;
  fightStep: (seconds: number) => void;
  fightAuto: () => void;
  setAnim: (a: 'full' | 'reduced' | 'off') => void;
  sys: () => {
    zoom: number;
    cam: { zoom: number; x: number; y: number };
    flying: boolean;
    ship: { x: number; y: number };
    body: (i: number) => { x: number; y: number; r: number } | null;
    station: (id: string) => { x: number; y: number } | null;
  } | null;
  map: () => {
    cam: { x: number; y: number; zoom: number };
    jumping: boolean;
    seek: (u: number) => void;
    pos: (id: number) => { x: number; y: number };
  } | null;
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
  await expect(page.getByTestId(opts.quick === false ? 'screen-firstship' : 'screen-station')).toBeVisible();
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

/** Cheats exist only in builds made with VITE_E2E=1 (the playwright web server does that). */
export const cheat = <T = unknown>(page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(
    ({ fn, args }) => {
      const c = (window as any).__dl.cheat; // eslint-disable-line @typescript-eslint/no-explicit-any
      return c[fn](...args) as T;
    },
    { fn, args },
  );

/** Cheats credits and founding goods, detects the current system and founds a base on body-0 from the system screen. */
export async function foundBaseHere(page: Page, credits: number) {
  await cheat(page, 'credits', credits);
  await cheat(page, 'goods', 'construction', 40);
  await cheat(page, 'goods', 'machinery', 12);
  await cheat(page, 'detectHere');
  await openScreen(page, 'system');
  await page.getByTestId('body-0').click();
  await expect(page.getByTestId('btn-found-base')).toBeEnabled();
  await page.getByTestId('btn-found-base').click();
  await expect(page.getByTestId('screen-base')).toBeVisible();
}

/** On narrow screens the trade panel is a modal: close it so navigation is reachable. */
export async function closeTrade(page: Page) {
  const m = page.getByTestId('modal-trade');
  if (await m.isVisible().catch(() => false)) await page.keyboard.press('Escape');
}
