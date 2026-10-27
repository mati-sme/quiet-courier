/**
 * Quiet Courier — app bootstrap, lobby, host sim loop, client mirror.
 */
'use strict';

import { NetRoom } from './net.js';
import { createMatch, applyInput, step, serializeFor, applySnapshot, myRole, PKG_COLORS } from './game.js';
import { bindInput, getMove, consumeAction, queueAction, resetInput } from './input.js';
import { bindCanvas, draw } from './render.js';
import { unlockAudio, SFX } from './audio.js';

const $ = (id) => document.getElementById(id);

const screens = {
  home: $('screen-home'),
  join: $('screen-join'),
  lobby: $('screen-lobby'),
  play: $('screen-play'),
  win: $('screen-win'),
};

let room = null;
let match = null;
let raf = 0;
let lastTs = 0;
let toastTimer = 0;
let lastTimeBucket = -1;
let kidsMode = false;
let localRole = null; // remembered so clients keep their role across snapshots

function show(name) {
  for (const [k, el] of Object.entries(screens)) {
    el.classList.toggle('hidden', k !== name);
  }
}

function overlay(on, txt) {
  $('overlay').classList.toggle('hidden', !on);
  if (txt) $('overlayTxt').textContent = txt;
}

function loadName() {
  try { return localStorage.getItem('qc.name') || ''; } catch (_) { return ''; }
}
function saveName(n) {
  try { localStorage.setItem('qc.name', n); } catch (_) {}
}

function playerName() {
  const n = ($('nameInput').value || '').trim() || 'Player';
  saveName(n);
  return n.slice(0, 12);
}

function toast(html, cls, ms) {
  const el = $('toast');
  el.className = cls || '';
  el.innerHTML = html;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms || 1800);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

function colorLabel(id) {
  const c = PKG_COLORS.find((x) => x.id === id);
  return c ? c.label : id;
}

function renderLobby(players, isHost, code) {
  $('lobbyCode').textContent = code || '····';
  const ul = $('playerList');
  ul.innerHTML = '';
  const localId = room && room.localId;
  const colors = ['#5b8cff', '#5dff8a', '#ff6b9d', '#ffd84a', '#b07cff', '#5de0ff', '#ff9a5b', '#e0e0e0'];
  for (const p of players) {
    const li = document.createElement('li');
    if (p.id === localId) li.classList.add('you');
    const col = colors[players.indexOf(p) % colors.length];
    li.innerHTML =
      `<span class="dot" style="background:${col}"></span>` +
      `<span>${escapeHtml(p.name)}${p.id === localId ? ' (you)' : ''}</span>` +
      (p.isHost ? '<span class="host-tag">Host</span>' : '');
    ul.appendChild(li);
  }
  $('kidsWrap').classList.toggle('hidden', !isHost);
  $('btnStart').classList.toggle('hidden', !isHost);
  $('btnStart').disabled = players.length < 3;
  $('lobbyStatus').textContent = isHost
    ? (players.length < 3 ? 'Need at least 3 players (max 8)' : players.length > 8 ? 'Max 8 players' : 'Ready — hit Start!')
    : 'Waiting for host to start…';
  if (players.length > 8) $('btnStart').disabled = true;
}

function updateHud() {
  if (!match) return;
  const pct = match.roundTime > 0 ? Math.max(0, match.timeLeft / match.roundTime) : 0;
  $('timeFill').style.width = (pct * 100) + '%';
  $('timeFill').classList.toggle('low', pct < 0.22 && match.phase === 'play');
  $('timeTxt').textContent = match.phase === 'play'
    ? Math.ceil(match.timeLeft) + 's'
    : '—';
  $('quotaTxt').textContent = `${match.delivered}/${match.quota}`;
  $('failTxt').textContent = `${match.failed}/${match.failLimit}`;

  const me = room && room.localId;
  const role = localRole || myRole(match, me);
  const isSab = role === 'saboteur';
  $('roleBadge').classList.toggle('hidden', !role || match.phase !== 'play');
  $('roleBadge').textContent = isSab ? '🤫 You are the Quiet Saboteur' : '📦 You are a Courier';
  $('roleBadge').classList.toggle('sab', isSab);

  // saboteur action pad
  const pad = $('sabPad');
  if (pad) {
    pad.classList.toggle('hidden', !isSab || match.phase !== 'play');
    const cd = (match.sabCooldown && match.sabCooldown[me]) || 0;
    const ready = cd <= 0;
    pad.querySelectorAll('[data-action]').forEach((btn) => {
      btn.disabled = !ready;
      btn.classList.toggle('cooling', !ready);
    });
    $('sabCd').textContent = ready ? 'Ready!' : cd.toFixed(1) + 's';
  }

  // carrying chip
  const p = match.players.find((pl) => pl.id === me);
  if (p && p.carrying) {
    const pkg = match.packages.find((k) => k.id === p.carrying);
    $('carryChip').classList.remove('hidden');
    $('carryChip').textContent = pkg ? `Holding ${colorLabel(pkg.colorId)}` : 'Holding…';
    if (pkg) $('carryChip').style.borderColor = (PKG_COLORS.find((c) => c.id === pkg.colorId) || {}).hex || '#fff';
  } else {
    $('carryChip').classList.add('hidden');
  }

  if (match.phase === 'play') {
    const urgency = 1 - pct;
    const bucket = Math.floor(match.timeLeft * (urgency > 0.7 ? 2 : 1));
    if (bucket !== lastTimeBucket) {
      lastTimeBucket = bucket;
      if (urgency > 0.55) SFX.tick(urgency);
    }
  }
}

function handleEvents(events) {
  for (const ev of events) {
    if (ev.type === 'pickup') {
      SFX.pickup();
      if (ev.id === (room && room.localId)) toast(`📦 Picked up ${colorLabel(ev.colorId)}`, '', 1200);
    } else if (ev.type === 'deliver') {
      SFX.deliver();
      toast(`✅ ${escapeHtml(ev.name)} delivered ${colorLabel(ev.colorId)}!`, 'ok', 1600);
    } else if (ev.type === 'wrong') {
      SFX.wrong();
      toast(`❌ Wrong drop!`, 'bad', 1600);
    } else if (ev.type === 'jammed') {
      toast(`🚫 Drop zone jammed — wait!`, 'bad', 1400);
    } else if (ev.type === 'jam') {
      SFX.jam();
      if (ev.tell) toast(`⚠️ ${colorLabel(ev.colorId)} drop flickers…`, '', 1600);
      else toast(`…something feels off at ${colorLabel(ev.colorId)}`, '', 1200);
    } else if (ev.type === 'swap') {
      SFX.swap();
      if (ev.tell) toast(`🎨 A package changed color!`, '', 1600);
    } else if (ev.type === 'misdirect') {
      SFX.misdirect();
      if (ev.targetId === (room && room.localId)) toast(`😵 Whoa — controls swirly!`, 'bad', 1800);
      else if (ev.tell) toast(`💫 ${escapeHtml(ev.targetName)} looks dizzy`, '', 1400);
    } else if (ev.type === 'win') {
      if (ev.side === 'couriers') SFX.win();
      else SFX.sabWin();
      endMatch();
    }
  }
}

function endMatch() {
  stopLoop();
  SFX.reveal();
  const side = match && match.winnerSide;
  $('winTitle').textContent = side === 'couriers' ? 'Couriers win!' : 'Saboteur wins!';
  const sabs = (match.players || []).filter((p) => p.role === 'saboteur' || (match.saboteurs || []).includes(p.id));
  // ensure roles visible
  for (const p of match.players) {
    if ((match.saboteurs || []).includes(p.id)) p.role = 'saboteur';
  }
  const names = sabs.map((p) => p.name).join(', ') || '???';
  $('winName').textContent = side === 'couriers'
    ? `Quota met! Quiet saboteur was: ${names}`
    : `Packages failed / time’s up. Quiet saboteur was: ${names}`;
  $('winReveal').textContent = '🤫 ' + names;
  show('win');
}

function startMatchFromLobby() {
  if (!room || room.role !== 'host') return;
  if (room.players.length < 3 || room.players.length > 8) return;
  kidsMode = $('kidsMode').checked;
  const roster = room.players.map((p) => ({ id: p.id, name: p.name }));
  match = createMatch(roster, kidsMode);
  localRole = myRole(match, room.localId);
  // send personalized start so each client learns only their role
  for (const [pid, c] of room.conns) {
    if (!c.open) continue;
    const player = room.players.find((p) => p.peerId === pid);
    const viewerId = player ? player.id : null;
    c.send({ type: 'start', kidsMode, snapshot: serializeFor(match, viewerId) });
  }
  enterPlay();
}

function enterPlay() {
  show('play');
  resetInput();
  lastTs = 0;
  lastTimeBucket = -1;
  if (match && room) localRole = localRole || myRole(match, room.localId);
  requestAnimationFrame(() => {
    window.dispatchEvent(new Event('resize'));
    startLoop();
    const role = localRole;
    toast(
      kidsMode
        ? (role === 'saboteur' ? 'Kids Mode — be sneaky (slow powers)!' : 'Kids Mode — deliver the packages!')
        : (role === 'saboteur' ? 'Shh… quietly mess with packages' : 'Deliver matching packages!'),
      role === 'saboteur' ? 'sab' : '',
      2200
    );
  });
}

function startLoop() {
  stopLoop();
  const tick = (ts) => {
    raf = requestAnimationFrame(tick);
    if (!lastTs) lastTs = ts;
    let dt = (ts - lastTs) / 1000;
    lastTs = ts;
    if (dt > 0.05) dt = 0.05;

    const move = getMove();
    const action = consumeAction();

    if (room && room.role === 'host' && match && match.phase === 'play') {
      applyInput(match, room.localId, move.dx, move.dy, action);
      const wasPlay = match.phase === 'play';
      const events = step(match, dt);
      handleEvents(events);
      if (!tick._acc) tick._acc = 0;
      tick._acc += dt;
      const phaseChanged = wasPlay && match.phase !== 'play';
      if (tick._acc >= 0.05 || phaseChanged) {
        tick._acc = 0;
        for (const [pid, c] of room.conns) {
          if (!c.open) continue;
          const player = room.players.find((p) => p.peerId === pid);
          const viewerId = player ? player.id : null;
          c.send({ type: 'state', snapshot: serializeFor(match, viewerId) });
        }
      }
    } else if (room && room.role === 'client') {
      room.sendToHost({ type: 'input', id: room.localId, dx: move.dx, dy: move.dy, action });
    }

    draw(match, room && room.localId, ts);
    updateHud();
  };
  raf = requestAnimationFrame(tick);
}

function stopLoop() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  lastTs = 0;
}

function onNetMessage(msg) {
  if (msg.type === 'input' && room.role === 'host' && match) {
    applyInput(match, msg.id, msg.dx || 0, msg.dy || 0, msg.action || null);
  } else if (msg.type === 'start' && room.role === 'client') {
    kidsMode = !!msg.kidsMode;
    match = applySnapshot(null, msg.snapshot);
    localRole = myRole(match, room.localId);
    enterPlay();
  } else if (msg.type === 'state' && room.role === 'client') {
    const prevDel = match && match.delivered;
    const prevFail = match && match.failed;
    const prevJam = match && JSON.stringify(match.jammed);
    const prevCarry = match && match.players.map((p) => p.id + ':' + p.carrying).join('|');
    match = applySnapshot(match, msg.snapshot);
    // keep local role sticky
    if (localRole && room) {
      const me = match.players.find((p) => p.id === room.localId);
      if (me && !me.role) me.role = localRole;
    }
    // infer events
    if (prevDel != null && match.delivered > prevDel) {
      handleEvents([{ type: 'deliver', id: '?', name: 'Someone', colorId: 'green' }]);
    }
    if (prevFail != null && match.failed > prevFail) {
      handleEvents([{ type: 'wrong', id: '?', name: '?' }]);
    }
    if (prevJam && JSON.stringify(match.jammed) !== prevJam) {
      for (const c of Object.keys(match.jammed)) {
        if (match.jammed[c] > 0) handleEvents([{ type: 'jam', colorId: c, tell: kidsMode }]);
      }
    }
    if (prevCarry && room) {
      const me = match.players.find((p) => p.id === room.localId);
      const prevMe = prevCarry.split('|').find((s) => s.startsWith(room.localId + ':'));
      const was = prevMe ? prevMe.split(':')[1] : '';
      if (me && me.carrying && me.carrying !== 'null' && was === 'null') {
        const pkg = match.packages.find((k) => k.id === me.carrying);
        handleEvents([{ type: 'pickup', id: me.id, name: me.name, colorId: pkg ? pkg.colorId : 'red' }]);
      }
      if (me && me.misdirectT > 2.5) {
        handleEvents([{ type: 'misdirect', targetId: me.id, targetName: me.name }]);
      }
    }
    if (match.phase === 'win') endMatch();
  } else if (msg.type === 'again' && room.role === 'client') {
    match = null;
    localRole = null;
    stopLoop();
    show('lobby');
  }
}

function wireRoom(r) {
  room = r;
  r.onLobby = (players, isHost, code) => {
    renderLobby(players, isHost, code);
    SFX.join();
  };
  r.onMessage = onNetMessage;
  r.onStatus = (s) => { console.log('[net]', s); };
  r.onFatal = (err) => {
    overlay(false);
    alert(err);
    leaveToHome();
  };
}

async function createRoom() {
  unlockAudio(); SFX.click();
  overlay(true, 'Creating room…');
  try {
    const r = new NetRoom();
    wireRoom(r);
    await r.create(playerName());
    overlay(false);
    show('lobby');
  } catch (e) {
    overlay(false);
    alert(e.message || String(e));
    if (room) { room.destroy(); room = null; }
  }
}

async function joinRoom() {
  unlockAudio(); SFX.click();
  const code = ($('codeInput').value || '').trim();
  $('joinErr').hidden = true;
  overlay(true, 'Joining…');
  try {
    const r = new NetRoom();
    wireRoom(r);
    await r.join(code, playerName());
    overlay(false);
    show('lobby');
  } catch (e) {
    overlay(false);
    $('joinErr').hidden = false;
    $('joinErr').textContent = e.message || String(e);
    if (room) { room.destroy(); room = null; }
  }
}

function leaveToHome() {
  stopLoop();
  match = null;
  localRole = null;
  if (room) { room.destroy(); room = null; }
  resetInput();
  show('home');
}

function playAgain() {
  unlockAudio(); SFX.click();
  if (!room) { leaveToHome(); return; }
  match = null;
  localRole = null;
  stopLoop();
  if (room.role === 'host') {
    room.broadcast({ type: 'again' });
    show('lobby');
    renderLobby(room.players, true, room.code);
  } else {
    show('lobby');
  }
}

function boot() {
  $('nameInput').value = loadName();
  bindCanvas($('cv'));
  bindInput($('cv'));

  $('btnCreate').onclick = createRoom;
  $('btnJoinShow').onclick = () => { SFX.click(); show('join'); $('codeInput').focus(); };
  $('btnJoinBack').onclick = () => { show('home'); };
  $('btnJoin').onclick = joinRoom;
  $('codeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom(); });
  $('btnStart').onclick = () => { unlockAudio(); SFX.click(); startMatchFromLobby(); };
  $('btnLeave').onclick = () => { SFX.click(); leaveToHome(); };
  $('btnAgain').onclick = playAgain;
  $('btnHome').onclick = () => { SFX.click(); leaveToHome(); };
  $('kidsMode').onchange = () => { kidsMode = $('kidsMode').checked; };

  // saboteur action buttons
  document.querySelectorAll('#sabPad [data-action]').forEach((btn) => {
    btn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      unlockAudio();
      SFX.click();
      queueAction(btn.getAttribute('data-action'));
    });
  });

  const unlock = () => { unlockAudio(); window.removeEventListener('pointerdown', unlock); };
  window.addEventListener('pointerdown', unlock);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  show('home');
}

boot();
