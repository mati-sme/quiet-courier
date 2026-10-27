/**
 * PartyKit host (no protocol). After `npx partykit deploy` in party-games-server,
 * set this to the printed host, e.g. "party-games.yourname.partykit.dev".
 * Override at runtime: ?pk=localhost:1999 or localStorage qc.pkHost
 */
'use strict';

export const PARTYKIT_HOST_DEFAULT = 'party-games.PLACEHOLDER.partykit.dev';

export function getPartyHost() {
  try {
    const q = new URLSearchParams(location.search).get('pk');
    if (q) return q.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const ls = localStorage.getItem('qc.pkHost');
    if (ls) return ls.replace(/^https?:\/\//, '').replace(/\/$/, '');
  } catch (_) {}
  return PARTYKIT_HOST_DEFAULT;
}

export const GAME_PREFIX = 'qc';
