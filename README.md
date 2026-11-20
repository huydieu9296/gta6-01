# Solmar Heat

[![Solmar Heat](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/huydieu9296/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/huydieu9296/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

**Solmar Heat** is a 3D open-world crime game in the spirit of GTA 6 — built for the
[make.fun "Make GTA 6" competition](https://make.fun/bounty/gta6-01). Everything is
original: the coastal city of Solmar, its streets and skyline, the character Rook,
the contact Mara, the cars, the story and the sounds. Nothing is taken from any
commercial game.

Built with make.fun — referral code `n4ek0hab`.

## The game

You are **Rook**, new in Solmar with $250 and a phone that keeps ringing. Mara has
work: courier runs, taxi fares, and a four-job story arc that ends with the biggest
score in the city. Earn cash, buy the Uptown Loft safehouse, keep your car repaired
at the pit stop — and keep the Solmar PD off your tail.

- **Open city**: a 7×7 grid of streets with a downtown, suburbs, a beachfront and a
  working port. Day/night cycle, rain, traffic lights that change, traffic that
  stops for reds.
- **On foot and driving**: third-person movement, jump, fists and a shotgun;
  steal any parked or traffic car, arcade driving with handbrake, collisions and
  damage.
- **Wanted 0–5 stars**: stealing, shooting and hitting people raises the heat.
  Police cars pursue, officers chase on foot, roadblocks appear at 3+ stars. Get
  caught and you're busted — bail costs 20% of your cash.
- **Missions**: courier deliveries against the clock, taxi fares with tips, and
  Mara's four-job story arc (the last two run hot — the cops are already looking).
- **Living streets**: pedestrians stroll the sidewalks, flee from gunfire, and
  witnesses call it in. Stashes of cash, health and ammo hide around the city.
- **HUD + minimap**: health, wanted stars, cash, speed, clock, weapon, mission
  timer and a live minimap of Solmar.
- **Saves**: progress autosaves and at safehouses (localStorage).
- **Sound**: fully procedural WebAudio — engine hum, sirens, gunshots, chimes,
  rain. No audio files, no network requests at all.

## Controls

| Key | Action |
| --- | --- |
| WASD | Move / drive |
| Mouse | Look (click to lock, or drag) |
| Click / F | Punch / shoot |
| 1 / 2 | Fists / shotgun |
| E | Interact — start a job, enter a car, rest at a safehouse |
| Shift | Run |
| Space | Jump (on foot) / handbrake (driving) |
| P / Esc | Pause |
| M | Mute |

## Tips

- **First $1,500**: run courier jobs and taxi fares, then buy the Uptown Loft —
  resting there saves and refills health for free.
- **Wrecked your ride?** Drive into the orange pit stop by the port; repairs
  cost $2 per damage point.
- **Stay out of sight**: heat only decays after 4 quiet seconds, and witnesses
  call the cops — punch a witness and the whole block notices.
- **Stashes**: small glowing crates hide around the city with cash, health and
  shotgun shells. They refill after a minute.

## Run it

```sh
node serve.ts        # then open http://localhost:8080
```

No build step, no dependencies at runtime: the game is plain files under `game/`
(three.js is vendored as a minified module under `game/vendor/three/`), and it
makes zero network requests.

## Layout

- `game/index.html` — page, import map, HUD
- `game/src/main.js` — boot, loop, state machine, camera
- `game/src/city.js` — procedural Solmar (roads, buildings, beach, port)
- `game/src/vehicles.js` — cars, traffic AI, driving physics
- `game/src/pedestrians.js` — walkers, fleeing, witnesses
- `game/src/player.js` — Rook on foot, combat
- `game/src/police.js` — wanted heat, pursuit, roadblocks, busted
- `game/src/missions.js` — courier, taxi and Mara's story arc
- `game/src/hud.js` — HUD and minimap
- `game/src/save.js` — localStorage saves
- `game/src/audio.js` — procedural WebAudio
- `game/src/shots.js` — `?shot=chase|street|mission|police` screenshot scenes
- `main.ts` — builds the submission dossier (`out/`)

## Screenshots

1. `1-chase.jpg` — a high-speed chase down the avenue
2. `2-street.jpg` — Rook on a busy downtown crossing
3. `3-mission.jpg` — a courier pickup at dusk
4. `4-police.jpg` — three stars, rain, and the PD closing in
