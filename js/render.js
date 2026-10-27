/** Canvas renderer for Quiet Courier arena. */
'use strict';

import { MAP_W, MAP_H, PLAYER_R, PKG_R, OBSTACLES, DROPS, PICKUPS, PKG_COLORS } from './game.js';

let cv, ctx, dpr = 1;

export function bindCanvas(el) {
  cv = el;
  ctx = el.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
}

function resize() {
  if (!cv) return;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = cv.clientWidth || cv.parentElement.clientWidth;
  const h = cv.clientHeight || cv.parentElement.clientHeight;
  cv.width = Math.max(1, Math.floor(w * dpr));
  cv.height = Math.max(1, Math.floor(h * dpr));
}

function worldToScreen() {
  const sw = cv.width / dpr, sh = cv.height / dpr;
  const scale = Math.min(sw / MAP_W, sh / MAP_H);
  const ox = (sw - MAP_W * scale) / 2;
  const oy = (sh - MAP_H * scale) / 2;
  return { scale, ox, oy, sw, sh };
}

function hexFor(colorId) {
  const c = PKG_COLORS.find((x) => x.id === colorId);
  return c ? c.hex : '#fff';
}

export function draw(match, localId, now) {
  if (!ctx || !cv) return;
  const { scale, ox, oy, sw, sh } = worldToScreen();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, sw, sh);

  ctx.fillStyle = '#1a2438';
  ctx.fillRect(0, 0, sw, sh);

  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);

  // floor
  ctx.fillStyle = '#24344c';
  roundRect(ctx, 0, 0, MAP_W, MAP_H, 24);
  ctx.fill();

  // soft grid
  ctx.strokeStyle = 'rgba(255,255,255,.04)';
  ctx.lineWidth = 2;
  for (let x = 40; x < MAP_W; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, MAP_H); ctx.stroke();
  }
  for (let y = 40; y < MAP_H; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(MAP_W, y); ctx.stroke();
  }

  ctx.strokeStyle = '#0a1220';
  ctx.lineWidth = 6;
  roundRect(ctx, 3, 3, MAP_W - 6, MAP_H - 6, 22);
  ctx.stroke();

  // pickup pads
  for (const pad of PICKUPS) {
    ctx.fillStyle = 'rgba(255,220,120,.12)';
    ctx.strokeStyle = 'rgba(255,220,120,.35)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(pad.x, pad.y, 22, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,220,120,.5)';
    ctx.font = 'bold 14px Trebuchet MS, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('📦', pad.x, pad.y);
  }

  // drop zones
  for (const d of DROPS) {
    const jammed = match && match.jammed && match.jammed[d.colorId] > 0;
    const hex = hexFor(d.colorId);
    ctx.fillStyle = jammed ? 'rgba(80,80,80,.45)' : hex + '55';
    ctx.strokeStyle = jammed ? '#666' : hex;
    ctx.lineWidth = 4;
    roundRect(ctx, d.x, d.y, d.w, d.h, 12);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = jammed ? '#aaa' : '#fff';
    ctx.font = 'bold 16px Trebuchet MS, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const label = jammed ? '🚫' : '⬇';
    ctx.fillText(label, d.x + d.w / 2, d.y + d.h / 2 - 8);
    ctx.font = 'bold 13px Trebuchet MS, sans-serif';
    ctx.fillText((PKG_COLORS.find((c) => c.id === d.colorId) || {}).label || '', d.x + d.w / 2, d.y + d.h / 2 + 12);

    if (jammed) {
      // sparkle tell in kids mode / always subtle hatch
      ctx.strokeStyle = 'rgba(255,255,255,.25)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(d.x + 8 + i * 22, d.y + 6);
        ctx.lineTo(d.x + 8 + i * 22 + 14, d.y + d.h - 6);
        ctx.stroke();
      }
    }
  }

  // obstacles (walls / crates)
  for (const o of OBSTACLES) {
    ctx.fillStyle = '#121c2a';
    ctx.strokeStyle = '#0a1018';
    ctx.lineWidth = 4;
    roundRect(ctx, o.x, o.y, o.w, o.h, 6);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.06)';
    ctx.fillRect(o.x + 3, o.y + 3, Math.max(0, o.w - 6), Math.min(8, o.h - 4));
  }

  if (!match) { ctx.restore(); return; }

  // free packages
  for (const pkg of match.packages) {
    if (pkg.carriedBy) continue;
    drawPackage(ctx, pkg.x, pkg.y, pkg.colorId, now);
  }

  // pets (wander — behind players)
  for (const pet of match.pets || []) {
    drawPet(ctx, pet, now);
  }

  // players
  for (const p of match.players) {
    drawPlayer(ctx, p, p.id === localId, now, match);
  }

  ctx.restore();
}

function drawPackage(ctx, x, y, colorId, now) {
  const bob = Math.sin(now * 0.006 + x * 0.01) * 3;
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.beginPath(); ctx.ellipse(0, PKG_R * 0.7, PKG_R * 0.8, PKG_R * 0.3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = hexFor(colorId);
  ctx.strokeStyle = '#0a1220';
  ctx.lineWidth = 3;
  roundRect(ctx, -PKG_R, -PKG_R, PKG_R * 2, PKG_R * 2, 5);
  ctx.fill(); ctx.stroke();
  // ribbon
  ctx.strokeStyle = '#fff8';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, -PKG_R); ctx.lineTo(0, PKG_R); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-PKG_R, 0); ctx.lineTo(PKG_R, 0); ctx.stroke();
  ctx.restore();
}

function drawPet(ctx, pet, now) {
  const bob = Math.sin(now * 0.005 + pet.x) * 2;
  ctx.save();
  ctx.translate(pet.x, pet.y + bob);
  ctx.font = '28px serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.globalAlpha = 0.9;
  ctx.fillText(pet.emoji || '🐱', 0, 0);
  ctx.restore();
}

function drawPlayer(ctx, p, isLocal, now, match) {
  const r = PLAYER_R;
  ctx.save();
  ctx.translate(p.x, p.y);

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath(); ctx.ellipse(0, r * 0.7, r * 0.85, r * 0.35, 0, 0, Math.PI * 2); ctx.fill();

  // body
  ctx.fillStyle = p.color;
  ctx.strokeStyle = '#0a1220';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  // courier hat / saboteur scarf (only self or reveal)
  if (p.role === 'saboteur' && (isLocal || match.reveal)) {
    // quiet scarf
    ctx.strokeStyle = '#2a2a3a';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(0, 4, r - 6, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    if (match.reveal) {
      // funny reveal: little horns / mischievous ears
      ctx.fillStyle = '#2a2a3a';
      ctx.beginPath(); ctx.moveTo(-14, -r + 4); ctx.lineTo(-6, -r - 12); ctx.lineTo(-2, -r + 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(14, -r + 4); ctx.lineTo(6, -r - 12); ctx.lineTo(2, -r + 2); ctx.fill();
    }
  } else if (p.role === 'courier' || !p.role) {
    // tiny cap
    ctx.fillStyle = '#fff8e8';
    ctx.beginPath(); ctx.ellipse(0, -r + 4, 14, 7, 0, 0, Math.PI * 2); ctx.fill();
  }

  // face
  ctx.fillStyle = '#0a1220';
  ctx.beginPath(); ctx.arc(-8, -4, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(8, -4, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#0a1220';
  ctx.lineWidth = 2.5;
  if (p.misdirectT > 0) {
    // dizzy swirl
    ctx.beginPath(); ctx.arc(0, 8, 6, 0, Math.PI * 1.5); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(0, 6, 7, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  }

  if (isLocal) {
    ctx.strokeStyle = 'rgba(255,255,255,.75)';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.arc(0, 0, r + 8, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }

  // carried package above head
  if (p.carrying) {
    const pkg = (match.packages || []).find((k) => k.id === p.carrying);
    if (pkg) {
      ctx.save();
      ctx.translate(0, -r - 20);
      ctx.fillStyle = hexFor(pkg.colorId);
      ctx.strokeStyle = '#0a1220';
      ctx.lineWidth = 2.5;
      roundRect(ctx, -12, -12, 24, 24, 4);
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#fff8';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(0, 12); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(12, 0); ctx.stroke();
      ctx.restore();
    }
  }

  // nameplate
  ctx.fillStyle = 'rgba(0,0,0,.55)';
  const label = p.name || '?';
  ctx.font = 'bold 14px Trebuchet MS, sans-serif';
  ctx.textAlign = 'center';
  const tw = ctx.measureText(label).width;
  roundRect(ctx, -tw / 2 - 8, r + 6, tw + 16, 22, 8);
  ctx.fill();
  ctx.fillStyle = '#eef4ff';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 0, r + 17);

  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
