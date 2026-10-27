/**
 * Invisible floating joystick — appears where you drag.
 * Action buttons sit bottom-right, so the natural thumb zone is bottom-left.
 * Desktop: WASD / arrows. Saboteur: 1/2/3 or J/K/L.
 */
'use strict';

const JOY_DEAD = 12;
const JOY_MAX = 56;

let joy = null;
let keys = Object.create(null);
let target = null;
let pendingAction = null;

export function bindInput(el) {
  target = el;
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('lostpointercapture', onUp);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
}

function onKeyDown(e) {
  keys[e.code] = true;
  if (e.code === 'Digit1' || e.code === 'KeyJ') queueAction('jam');
  if (e.code === 'Digit2' || e.code === 'KeyK') queueAction('swap');
  if (e.code === 'Digit3' || e.code === 'KeyL') queueAction('misdirect');
}

function onDown(e) {
  if (e.target && e.target.closest && e.target.closest('[data-action]')) return;
  if (joy) return;
  e.preventDefault();
  try { target.setPointerCapture(e.pointerId); } catch (_) {}
  // Prefer bottom-left: if the touch starts in the upper/right half,
  // still use the actual touch point (true floating stick) — HUD actions
  // are bottom-right so thumbs naturally land bottom-left on phones.
  joy = {
    id: e.pointerId,
    x0: e.clientX, y0: e.clientY,
    x: e.clientX, y: e.clientY,
    active: false,
  };
}

function onMove(e) {
  if (!joy || e.pointerId !== joy.id) return;
  joy.x = e.clientX; joy.y = e.clientY;
  if (!joy.active && Math.hypot(joy.x - joy.x0, joy.y - joy.y0) > JOY_DEAD) {
    joy.active = true;
    showJoy();
  }
  if (joy.active) showJoy();
}

function onUp(e) {
  if (!joy || (e && e.pointerId !== joy.id)) return;
  joy = null;
  const j = document.getElementById('joy');
  if (j) j.classList.add('hidden');
}

function showJoy() {
  const el = document.getElementById('joy');
  if (!el || !joy) return;
  const ar = target.getBoundingClientRect();
  el.classList.remove('hidden');
  el.style.left = (joy.x0 - ar.left) + 'px';
  el.style.top = (joy.y0 - ar.top) + 'px';
  let dx = joy.x - joy.x0, dy = joy.y - joy.y0;
  const d = Math.hypot(dx, dy);
  if (d > JOY_MAX) { dx = dx / d * JOY_MAX; dy = dy / d * JOY_MAX; }
  const knob = el.querySelector('.knob');
  if (knob) { knob.style.left = dx + 'px'; knob.style.top = dy + 'px'; }
}

export function getMove() {
  let dx = 0, dy = 0;
  if (joy && joy.active) {
    dx = joy.x - joy.x0;
    dy = joy.y - joy.y0;
    const d = Math.hypot(dx, dy);
    if (d > 1) { dx /= d; dy /= d; } else { dx = dy = 0; }
  } else {
    if (keys.ArrowLeft || keys.KeyA) dx -= 1;
    if (keys.ArrowRight || keys.KeyD) dx += 1;
    if (keys.ArrowUp || keys.KeyW) dy -= 1;
    if (keys.ArrowDown || keys.KeyS) dy += 1;
    const d = Math.hypot(dx, dy);
    if (d > 1) { dx /= d; dy /= d; }
  }
  return { dx, dy };
}

export function queueAction(name) {
  pendingAction = name;
}

export function consumeAction() {
  const a = pendingAction;
  pendingAction = null;
  return a;
}

export function resetInput() {
  joy = null;
  keys = Object.create(null);
  pendingAction = null;
  const j = document.getElementById('joy');
  if (j) j.classList.add('hidden');
}
