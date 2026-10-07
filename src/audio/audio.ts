import { effect } from '@preact/signals';
import { settings } from '../ui/settings';

/** Fully procedural audio (Web Audio): a slow generative ambient pad plus synthesized UI effects. No sound files. */
type Sfx = 'click' | 'buy' | 'sell' | 'jump' | 'error' | 'alert' | 'success' | 'scan' | 'mine' | 'dock';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let ambientGain: GainNode | null = null;
let sfxGain: GainNode | null = null;
let ambientStarted = false;
let chimeTimer: number | undefined;

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
  } catch {
    return null;
  }
  master = ctx.createGain();
  ambientGain = ctx.createGain();
  sfxGain = ctx.createGain();
  ambientGain.connect(master);
  sfxGain.connect(master);
  master.connect(ctx.destination);
  applyVolumes();
  return ctx;
}

function applyVolumes(): void {
  if (!ctx || !master || !ambientGain || !sfxGain) return;
  const s = settings.value;
  const m = s.muted ? 0 : s.master;
  master.gain.setTargetAtTime(m, ctx.currentTime, 0.05);
  ambientGain.gain.setTargetAtTime(s.ambient * 0.5, ctx.currentTime, 0.2);
  sfxGain.gain.setTargetAtTime(s.sfx, ctx.currentTime, 0.05);
}

effect(() => {
  void settings.value;
  applyVolumes();
});

/** Must be called from a user gesture to unlock audio. */
export function unlockAudio(): void {
  const c = ensure();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  if (!ambientStarted) startAmbient(c);
}

function startAmbient(c: AudioContext): void {
  ambientStarted = true;
  const base = [55, 82.41, 110, 164.81];
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 520;
  filter.Q.value = 0.7;
  filter.connect(ambientGain!);
  const lfo = c.createOscillator();
  const lfoGain = c.createGain();
  lfo.frequency.value = 0.05;
  lfoGain.gain.value = 260;
  lfo.connect(lfoGain).connect(filter.frequency);
  lfo.start();
  base.forEach((f, i) => {
    for (const detune of [-6, 5]) {
      const o = c.createOscillator();
      o.type = i % 2 ? 'sine' : 'triangle';
      o.frequency.value = f;
      o.detune.value = detune;
      const g = c.createGain();
      g.gain.value = 0.05 / (1 + i * 0.5);
      o.connect(g).connect(filter);
      o.start();
    }
  });
  const scale = [220, 247.5, 293.66, 329.63, 392, 440, 493.88, 587.33];
  const chime = () => {
    if (!ctx || ctx.state !== 'running') {
      chimeTimer = window.setTimeout(chime, 9000);
      return;
    }
    const f = scale[Math.floor(Math.random() * scale.length)]; // audio only, not simulation: Math.random is fine here
    tone(f, 0.0, 2.8, 0.05, 'sine', ambientGain!);
    tone(f * 2.0, 0.02, 2.2, 0.02, 'sine', ambientGain!);
    chimeTimer = window.setTimeout(chime, 7000 + Math.random() * 9000);
  };
  chimeTimer = window.setTimeout(chime, 4000);
}

function tone(freq: number, delay: number, dur: number, vol: number, type: OscillatorType, dest: AudioNode, slideTo?: number): void {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.02, dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(dest);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function noise(delay: number, dur: number, vol: number, freq: number, dest: AudioNode): void {
  if (!ctx) return;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(dest);
  src.start(ctx.currentTime + delay);
}

export function sfx(name: Sfx): void {
  const c = ensure();
  if (!c || !sfxGain || settings.value.muted) return;
  if (c.state === 'suspended') return;
  const d = sfxGain;
  switch (name) {
    case 'click':
      tone(880, 0, 0.06, 0.06, 'triangle', d);
      break;
    case 'buy':
      tone(520, 0, 0.1, 0.1, 'triangle', d);
      tone(780, 0.08, 0.14, 0.09, 'triangle', d);
      break;
    case 'sell':
      tone(780, 0, 0.1, 0.1, 'triangle', d);
      tone(1170, 0.08, 0.16, 0.09, 'triangle', d);
      break;
    case 'jump':
      tone(90, 0, 1.1, 0.14, 'sawtooth', d, 900);
      noise(0, 1.0, 0.12, 700, d);
      break;
    case 'error':
      tone(180, 0, 0.18, 0.12, 'square', d);
      tone(140, 0.12, 0.2, 0.1, 'square', d);
      break;
    case 'alert':
      tone(660, 0, 0.14, 0.1, 'sine', d);
      tone(660, 0.2, 0.14, 0.1, 'sine', d);
      break;
    case 'success':
      [523, 659, 784].forEach((f, i) => tone(f, i * 0.09, 0.25, 0.09, 'sine', d));
      break;
    case 'scan':
      tone(300, 0, 0.5, 0.07, 'sine', d, 1400);
      break;
    case 'mine':
      noise(0, 0.35, 0.18, 260, d);
      tone(110, 0, 0.3, 0.1, 'sawtooth', d);
      break;
    case 'dock':
      tone(260, 0, 0.5, 0.1, 'sine', d, 180);
      tone(390, 0.1, 0.4, 0.06, 'sine', d, 260);
      break;
  }
}

export function stopAudio(): void {
  if (chimeTimer) clearTimeout(chimeTimer);
  void ctx?.close();
  ctx = null;
  ambientStarted = false;
}
