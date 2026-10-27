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

Static files only — no build step.

```bash
cd /workspace/projects/quiet-courier
python3 -m http.server 8080
```

Open `http://localhost:8080` in multiple tabs. (ES modules need a real origin — don’t open as `file://`.)

## Publish to GitHub Pages

```bash
git init
git add .
git commit -m "Initial Quiet Courier"
git branch -M main
git remote add origin https://github.com/mati-sme/quiet-courier.git
git push -u origin main
# Settings → Pages → Deploy from branch → main / (root)
```

Live URL: `https://mati-sme.github.io/quiet-courier/`

After each content change, bump `CACHE` in `sw.js` (e.g. `quiet-courier-v2`) so phones pick up the new files.

## Networking (v1)

| Piece | Choice |
| --- | --- |
| Transport | **WebRTC data channels** via [PeerJS](https://peerjs.com/) |
| CDN | `https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js` |
| Signaling | Free public PeerServer `0.peerjs.com` |
| Authority | **Host phone** owns sim + broadcasts snapshots ~20 Hz |
| Room codes | Host registers Peer id `qc-XXXX`. Joiners connect to that id. |

### Caveats

- Free PeerJS cloud can be rate-limited or briefly down. Some strict carrier NATs may fail WebRTC.
- Host must **keep the tab open** — if the host leaves, the room dies.
- No accounts, no paid APIs, no backend of our own for v1.

## Files

- `index.html` — screens (home, join, lobby, play, win/reveal)
- `style.css` — mobile-first UI
- `js/main.js` — lobby + loop glue
- `js/net.js` — PeerJS room create/join (`qc-` prefix)
- `js/game.js` — authoritative sim (packages, saboteur, pets, win)
- `js/input.js` — floating joystick (bottom-left preference) + keyboard
- `js/render.js` — canvas arena
- `js/audio.js` — WebAudio SFX (no audio files)
- `sw.js` — cache-first PWA shell (`quiet-courier-v1`)
- `manifest.webmanifest` — installable shortcut

## License

Made for Matias’s party-game shelf. Hand-written scaffold; no paid APIs, no generated image assets.
