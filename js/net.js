/**
 * PartyKit WebSocket networking — server is authoritative.
 * Room id = "qc-" + 4-letter code. No PeerJS / no phone-as-host-brain.
 */
'use strict';

import { getPartyHost, GAME_PREFIX } from './config.js';

export function randomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += alphabet[(Math.random() * alphabet.length) | 0];
  return s;
}

function roomIdFromCode(code) {
  return GAME_PREFIX + '-' + String(code).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
}

function wsUrl(host, roomId) {
  const secure = !/^localhost(:\d+)?$/i.test(host) && !/^127\.0\.0\.1/.test(host);
  const proto = secure ? 'wss' : 'ws';
  return `${proto}://${host}/parties/main/${encodeURIComponent(roomId)}`;
}

export class NetRoom {
  constructor() {
    this.ws = null;
    this.role = null; // 'host' | 'client' (lobby leader only — sim is on server)
    this.code = null;
    this.localId = null;
    this.players = [];
    this.kidsMode = false;
    this.onLobby = null;
    this.onMessage = null;
    this.onStatus = null;
    this.onFatal = null;
    this._name = 'Player';
    this._closed = false;
    this._openPromise = null;
  }

  get isHost() { return this.role === 'host'; }

  _status(msg) { if (this.onStatus) this.onStatus(msg); }

  _emitLobby() {
    if (this.onLobby) this.onLobby(this.players.slice(), this.role === 'host', this.code);
  }

  _send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  /** All clients send to server (not "host phone"). */
  send(msg) { this._send(msg); }

  /** @deprecated use send — kept so older call sites compile during migrate */
  sendToHost(msg) { this._send(msg); }

  /** Host-only lobby actions still go to server; broadcast is a no-op locally. */
  broadcast(msg) {
    // Server fans out; host UI may call this for start/again — forward instead.
    if (msg && (msg.type === 'start' || msg.type === 'again' || msg.type === 'kids')) {
      this._send(msg);
    }
  }

  async create(name) {
    this._name = (name || 'Host').slice(0, 12);
    this.role = 'host';
    this.code = randomCode();
    this._status('Opening room…');
    await this._connect(roomIdFromCode(this.code), 'create');
    this._status('Room ready');
    return this.code;
  }

  async join(code, name) {
    this._name = (name || 'Player').slice(0, 12);
    this.role = 'client';
    this.code = String(code).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    if (this.code.length !== 4) throw new Error('Enter a 4-character room code');
    this._status('Connecting…');
    await this._connect(roomIdFromCode(this.code), 'join');
    this._status('Joined');
  }

  _connect(roomId, intent) {
    this._closed = false;
    const host = getPartyHost();
    if (!host || host.includes('PLACEHOLDER')) {
      return Promise.reject(new Error(
        'Multiplayer server not deployed yet. Set PartyKit host in js/config.js (see README).'
      ));
    }
    const url = wsUrl(host, roomId);
    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (err) => {
        if (settled) return;
        settled = true;
        reject(err instanceof Error ? err : new Error(String(err)));
      };
      const ok = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      let ws;
      try {
        ws = new WebSocket(url);
      } catch (e) {
        fail(e);
        return;
      }
      this.ws = ws;
      const t = setTimeout(() => {
        fail(new Error('Could not reach game server. Check the code / network, or PartyKit deploy.'));
        try { ws.close(); } catch (_) {}
      }, 12000);

      ws.onopen = () => {
        this._send({ type: 'hello', intent, name: this._name });
      };

      ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch (_) { return; }
        if (!msg || !msg.type) return;

        if (msg.type === 'error') {
          clearTimeout(t);
          fail(new Error(msg.message || 'Server error'));
          try { ws.close(); } catch (_) {}
          return;
        }
        if (msg.type === 'welcome') {
          clearTimeout(t);
          this.localId = msg.id;
          this.code = msg.code || this.code;
          this.players = msg.players || [];
          this.kidsMode = !!msg.kidsMode;
          this.role = msg.isHost ? 'host' : 'client';
          this._emitLobby();
          ok();
          return;
        }
        if (msg.type === 'lobby') {
          this.players = msg.players || [];
          this.kidsMode = !!msg.kidsMode;
          const me = this.players.find((p) => p.id === this.localId);
          if (me) this.role = me.isHost ? 'host' : 'client';
          this._emitLobby();
          return;
        }
        if (this.onMessage) this.onMessage(msg);
      };

      ws.onerror = () => {
        clearTimeout(t);
        fail(new Error('WebSocket error talking to PartyKit host "' + host + '"'));
      };

      ws.onclose = () => {
        clearTimeout(t);
        if (!settled) {
          fail(new Error('Connection closed before join completed'));
          return;
        }
        if (!this._closed && this.onFatal) {
          this.onFatal('Disconnected from server');
        }
      };
    });
  }

  destroy() {
    this._closed = true;
    if (this.ws) {
      try { this.ws.close(); } catch (_) {}
    }
    this.ws = null;
    this.players = [];
    this.role = null;
  }
}
