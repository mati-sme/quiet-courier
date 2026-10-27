/**
 * PeerJS / WebRTC networking scaffold.
 * Host peer id = "qc-" + roomCode (custom id on the free PeerServer).
 * Host is authoritative for match state; peers send input only.
 *
 * CDN: peerjs@1.5.4 from unpkg (loaded in index.html).
 * Signaling: default PeerJS cloud (0.peerjs.com). If that is down,
 * point Peer options at another free PeerServer — see README.
 */
'use strict';

const PREFIX = 'qc-';

function codeFromPeerId(id) {
  if (!id || !id.startsWith(PREFIX)) return null;
  return id.slice(PREFIX.length).toUpperCase();
}

function peerIdFromCode(code) {
  return PREFIX + String(code).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
}

export function randomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1
  let s = '';
  for (let i = 0; i < 4; i++) s += alphabet[(Math.random() * alphabet.length) | 0];
  return s;
}

function peerOpts() {
  return {
    host: '0.peerjs.com',
    port: 443,
    path: '/',
    secure: true,
    debug: 1,
  };
}

export class NetRoom {
  constructor() {
    this.peer = null;
    this.role = null; // 'host' | 'client'
    this.code = null;
    this.localId = null;
    this.conns = new Map();
    this.players = [];
    this.onLobby = null;
    this.onMessage = null;
    this.onStatus = null;
    this.onFatal = null;
    this._name = 'Player';
  }

  _status(msg) { if (this.onStatus) this.onStatus(msg); }

  _emitLobby() {
    if (this.onLobby) this.onLobby(this.players.slice(), this.role === 'host', this.code);
  }

  _addPlayer(p) {
    if (this.players.some((x) => x.id === p.id)) return;
    this.players.push(p);
    this._emitLobby();
  }

  _removeByPeer(peerId) {
    const before = this.players.length;
    this.players = this.players.filter((p) => p.peerId !== peerId);
    this.conns.delete(peerId);
    if (this.players.length !== before) this._emitLobby();
  }

  _wire(conn, remoteIsHost) {
    conn.on('data', (raw) => {
      let msg = raw;
      try { if (typeof raw === 'string') msg = JSON.parse(raw); } catch (_) { return; }
      if (!msg || !msg.type) return;
      this._handle(msg, conn);
    });
    conn.on('close', () => {
      this._removeByPeer(conn.peer);
      if (this.role === 'client' && remoteIsHost) {
        if (this.onFatal) this.onFatal('Host disconnected');
      }
    });
    conn.on('error', (err) => {
      console.warn('conn error', err);
    });
  }

  _handle(msg, conn) {
    if (this.role === 'host') {
      if (msg.type === 'hello') {
        const id = msg.id || ('p_' + Math.random().toString(36).slice(2, 8));
        const name = (msg.name || 'Player').slice(0, 12);
        let finalName = name;
        let n = 2;
        while (this.players.some((p) => p.name === finalName && p.id !== id)) {
          finalName = name.slice(0, 10) + n;
          n++;
        }
        this._addPlayer({ id, name: finalName, peerId: conn.peer, isHost: false });
        conn.send({ type: 'welcome', id, name: finalName, players: this.players, code: this.code });
        this.broadcast({ type: 'lobby', players: this.players }, conn.peer);
        return;
      }
    }
    if (this.role === 'client') {
      if (msg.type === 'welcome') {
        this.localId = msg.id;
        this.players = msg.players || [];
        this._emitLobby();
        return;
      }
      if (msg.type === 'lobby') {
        this.players = msg.players || [];
        this._emitLobby();
        return;
      }
    }
    if (this.onMessage) this.onMessage(msg, conn);
  }

  broadcast(msg, exceptPeer) {
    for (const [pid, c] of this.conns) {
      if (pid === exceptPeer) continue;
      if (c.open) c.send(msg);
    }
  }

  sendToHost(msg) {
    if (this.role !== 'client') return;
    for (const c of this.conns.values()) {
      if (c.open) { c.send(msg); return; }
    }
  }

  async create(name) {
    this._name = (name || 'Host').slice(0, 12);
    this.role = 'host';
    this.code = randomCode();
    this.localId = 'host_' + Math.random().toString(36).slice(2, 7);
    const id = peerIdFromCode(this.code);
    this._status('Opening room…');

    await this._openPeer(id);
    this.peer.on('connection', (conn) => {
      this.conns.set(conn.peer, conn);
      this._wire(conn, false);
    });

    this.players = [{
      id: this.localId, name: this._name, peerId: this.peer.id, isHost: true,
    }];
    this._emitLobby();
    this._status('Room ready');
    return this.code;
  }

  async join(code, name) {
    this._name = (name || 'Player').slice(0, 12);
    this.role = 'client';
    this.code = String(code).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    if (this.code.length !== 4) throw new Error('Enter a 4-character room code');
    this.localId = 'p_' + Math.random().toString(36).slice(2, 8);
    const hostId = peerIdFromCode(this.code);
    this._status('Connecting…');

    await this._openPeer();
    const conn = this.peer.connect(hostId, { reliable: true });
    if (!conn) throw new Error('Could not start connection');

    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Could not reach host. Check the code and that the host stays on this page.')), 12000);
      conn.on('open', () => { clearTimeout(t); resolve(); });
      conn.on('error', (e) => { clearTimeout(t); reject(e); });
    });

    this.conns.set(conn.peer, conn);
    this._wire(conn, true);
    conn.send({ type: 'hello', id: this.localId, name: this._name });
    this._status('Joined');
  }

  _openPeer(fixedId) {
    return new Promise((resolve, reject) => {
      if (typeof Peer === 'undefined') {
        reject(new Error('PeerJS failed to load. Check your network / CDN.'));
        return;
      }
      const peer = fixedId ? new Peer(fixedId, peerOpts()) : new Peer(peerOpts());
      this.peer = peer;
      const t = setTimeout(() => reject(new Error('Signaling timeout. The free PeerServer may be busy — retry or see README.')), 15000);
      peer.on('open', (id) => {
        clearTimeout(t);
        if (fixedId && codeFromPeerId(id)) this.code = codeFromPeerId(id);
        resolve(id);
      });
      peer.on('error', (err) => {
        clearTimeout(t);
        const msg = (err && err.type === 'unavailable-id')
          ? 'That room code is busy — try Create again.'
          : (err && err.message) || String(err);
        reject(new Error(msg));
      });
    });
  }

  destroy() {
    for (const c of this.conns.values()) { try { c.close(); } catch (_) {} }
    this.conns.clear();
    if (this.peer) { try { this.peer.destroy(); } catch (_) {} }
    this.peer = null;
    this.players = [];
    this.role = null;
  }
}
