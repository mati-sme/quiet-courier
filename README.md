# Quiet Courier

A mobile-first **family party game** with an Among Us *feel* — but **not** an Among Us clone. Players deliver color-matched packages around a small map. One player is a **silent saboteur** who quietly messes with packages (jam a drop zone, swap a color, briefly dizzy someone). No gore, no flashy kills, no voting meetings in v1.

**Crew wins** by hitting the delivery quota before time runs out. **Saboteur wins** if time expires or too many wrong drops pile up. Then everyone sees who the quiet troublemaker was.

Play: https://mati-sme.github.io/quiet-courier/

## How to play

1. Open the game on 3–8 phones (or browser tabs). One person taps **Create room** → shares the **4-letter room code**.
2. Others tap **Join room**, enter the code and their name. Host may enable **Kids Mode**, then **Start match**.
3. Roles are secret: most players are **Couriers**; 1 saboteur (or 2 if 6+ players).
4. Couriers walk to 📦 pads, pick up packages, and deliver them to the **matching color** drop zone.
5. The saboteur uses **Jam / Swap / Dizzy** (bottom-right buttons, or keys `1`/`2`/`3`) on cooldown. Drag anywhere for an **invisible floating joystick** (prefers bottom-left). Desktop: WASD / arrows.

Ages: mixed groups (~4–6 + adults). Big UI, clear icons, Kids Mode (longer round, slower saboteur powers, clearer tells). Cute companion pets wander the map for fun.

## Run locally

```bash
cd /workspace/projects/quiet-courier
python3 -m http.server 8080
```

Override PartyKit host: `?pk=localhost:1999` when running `party-games-server` locally.

## Publish to GitHub Pages

Push to `mati-sme/quiet-courier` main. Bump `CACHE` in `sw.js` (currently `quiet-courier-v2`).

Live URL: `https://mati-sme.github.io/quiet-courier/`

## Networking (v2 — PartyKit)

| Piece | Choice |
| --- | --- |
| Transport | WebSocket to PartyKit |
| Authority | **Server** runs packages / saboteur / win at ~20 Hz |
| Client feel | Local movement prediction + soft reconcile |
| Room codes | 4 letters; room id `qc-XXXX` |
| Roles | Server sends personalized snapshots (hide other roles until reveal) |

Shared server: `/workspace/projects/party-games-server/`. Set host in `js/config.js` after deploy.

### Deploy server (one-time)

```bash
cd ../party-games-server
npm install && npx partykit login && npx partykit deploy
```

## Files

- `js/config.js` — PartyKit host
- `js/net.js` — WebSocket create/join
- `js/main.js` — lobby + prediction loop
- `js/game.js` — sim + serializeFor / predict
- `sw.js` — `quiet-courier-v2`

## License

Made for Matias’s party-game shelf. Hand-written; no paid APIs.
