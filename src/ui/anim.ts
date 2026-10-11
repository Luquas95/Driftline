import { signal, type Signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { animLevel } from './settings';

/** Shown values that glide towards the real ones (day counter, credits): purely cosmetic. */
export const dayShown = signal<number | null>(null);
export const creditsShown = signal<number | null>(null);

const running = new WeakMap<Signal<number | null>, number>();

/** Glide a display signal from `from` to `to`; with animations off it never shows the intermediate values. */
export function tweenSignal(sig: Signal<number | null>, from: number, to: number, ms = 900): void {
  const prev = running.get(sig);
  if (prev) cancelAnimationFrame(prev);
  const lvl = animLevel();
  if (lvl === 'off' || from === to || typeof requestAnimationFrame === 'undefined') {
    sig.value = null;
    return;
  }
  const dur = lvl === 'reduced' ? Math.min(250, ms) : ms;
  const t0 = performance.now();
  const step = (now: number) => {
    const u = Math.min(1, (now - t0) / dur);
    const e = u * u * (3 - 2 * u);
    sig.value = from + (to - from) * e;
    if (u < 1) running.set(sig, requestAnimationFrame(step));
    else {
      sig.value = null;
      running.delete(sig);
    }
  };
  running.set(sig, requestAnimationFrame(step));
}

/** Class name that flashes green or red for a moment when a number goes up or down. */
export function useFlash(value: number, goodWhenUp = true): string {
  const prev = useRef(value);
  const [cls, setCls] = useState('');
  useEffect(() => {
    if (prev.current === value) return;
    const up = value > prev.current;
    prev.current = value;
    if (animLevel() === 'off') return;
    setCls(up === goodWhenUp ? 'flash-good' : 'flash-bad');
    const id = window.setTimeout(() => setCls(''), 700);
    return () => window.clearTimeout(id);
  }, [value]);
  return cls;
}

/**
 * A small icon that flies from one element to another (goods into the cargo hold, credits to the purse).
 * Selectors or elements; silently does nothing when an element is missing or animations are off.
 */
export function flyIcon(
  from: Element | string | null,
  to: Element | string | null,
  text = '▣',
  color = '#8fe3ff',
): void {
  if (typeof document === 'undefined' || animLevel() === 'off') return;
  const a = typeof from === 'string' ? document.querySelector(from) : from;
  const b = typeof to === 'string' ? document.querySelector(to) : to;
  if (!a || !b) return;
  const ra = a.getBoundingClientRect();
  const rb = b.getBoundingClientRect();
  const n = animLevel() === 'full' ? 4 : 1;
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div');
    el.className = 'fly-icon';
    el.textContent = text;
    el.style.color = color;
    el.setAttribute('aria-hidden', 'true');
    const x0 = ra.left + ra.width / 2 + (i - 1.5) * 10;
    const y0 = ra.top + ra.height / 2;
    el.style.left = `${x0}px`;
    el.style.top = `${y0}px`;
    document.body.appendChild(el);
    const dx = rb.left + rb.width / 2 - x0;
    const dy = rb.top + rb.height / 2 - y0;
    const dur = animLevel() === 'full' ? 650 + i * 70 : 300;
    const anim = el.animate(
      [
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 40}px) scale(1.25)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.5)`, opacity: 0.1 },
      ],
      { duration: dur, easing: 'cubic-bezier(.4,.1,.3,1)', fill: 'forwards' },
    );
    anim.onfinish = () => el.remove();
    window.setTimeout(() => el.remove(), dur + 400);
  }
}
