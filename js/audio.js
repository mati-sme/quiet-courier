/** Soft WebAudio SFX — no external assets. */
'use strict';

let ac = null;
let muted = false;
const last = Object.create(null);

function ensure() {
  if (ac) return ac;
  const A = window.AudioContext || window.webkitAudioContext;
  if (!A) return null;
  ac = new A();
  return ac;
}

export function unlockAudio() {
  const a = ensure();
  if (a && a.state === 'suspended') a.resume();
}

export function setMuted(m) { muted = !!m; }

function rate(key, ms) {
  const now = performance.now();
  if (last[key] && now - last[key] < ms) return false;
  last[key] = now;
  return true;
}

function tone(freq, dur, type, vol, delay) {
  const a = ensure();
  if (!a || muted) return;
  const t0 = a.currentTime + (delay || 0);
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(a.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

export const SFX = {
  pickup() {
    if (!rate('pickup', 120)) return;
    tone(520, 0.07, 'triangle', 0.07);
    tone(780, 0.09, 'triangle', 0.05, 0.05);
  },
  deliver() {
    tone(523, 0.1, 'sine', 0.08);
    tone(659, 0.12, 'sine', 0.07, 0.08);
    tone(784, 0.14, 'sine', 0.06, 0.16);
  },
  wrong() {
    tone(280, 0.12, 'square', 0.06);
    tone(200, 0.16, 'square', 0.05, 0.1);
  },
  jam() {
    tone(180, 0.2, 'sawtooth', 0.04);
    tone(140, 0.25, 'sine', 0.05, 0.05);
  },
  swap() {
    tone(440, 0.06, 'triangle', 0.05);
    tone(330, 0.08, 'triangle', 0.05, 0.07);
    tone(550, 0.08, 'triangle', 0.04, 0.14);
  },
  misdirect() {
    tone(360, 0.1, 'sine', 0.05);
    tone(300, 0.12, 'sine', 0.04, 0.08);
  },
  tick(urgency) {
    if (!rate('tick', urgency > 0.7 ? 400 : 900)) return;
    tone(700 + urgency * 200, 0.03, 'triangle', 0.03 + urgency * 0.03);
  },
  win() {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, 'triangle', 0.09, i * 0.12));
  },
  sabWin() {
    [392, 330, 262, 196].forEach((f, i) => tone(f, 0.2, 'triangle', 0.08, i * 0.14));
  },
  reveal() {
    tone(220, 0.15, 'sine', 0.07);
    tone(440, 0.2, 'triangle', 0.08, 0.12);
    tone(880, 0.15, 'sine', 0.05, 0.28);
  },
  join() { tone(440, 0.08, 'sine', 0.06); tone(660, 0.1, 'sine', 0.05, 0.07); },
  click() { tone(600, 0.04, 'square', 0.04); },
};
