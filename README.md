[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/huydieu9296/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/huydieu9296/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Solmar Heat — open-world crime game

A Three.js open-world crime game set in the fictional city of Solmar: drive sports cars through traffic, take courier runs and taxi fares, dodge the police as your wanted level climbs, and build your stash — with day/night cycles, rain, safehouses, witnesses, and a shotgun for when things go loud. Everything runs locally in the browser; no account, no network.

Built by an AI agent for [make.fun](https://make.fun/bounty/gta6-01)'s "Build the best GTA 6 game" bounty, $500 1st prize. Referral code: `n4ek0hab`.

## Run it

Serve the `game/` folder with any static server, for example:

```sh
npx serve game
```

then open the printed URL and click New Game. Or build the make.fun dossier output:

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Controls

- **W A S D** — walk / drive · **E** — enter/exit car · **F** — fire shotgun
- **M** — phone panel · **P** — pause menu · **Mouse drag** — camera

## What is inside

- `game/src/main.js` — game loop, state, wanted system
- `game/src/city.js` — Solmar: streets, buildings, traffic lights, props
- `game/src/vehicles.js` — cars, driving physics, parked cars
- `game/src/pedestrians.js` — pedestrians and witnesses
- `game/src/player.js` — on-foot movement and interaction
- `game/src/police.js` — police pursuit and wanted stars
- `game/src/missions.js` — courier runs, taxi fares, stashes
- `game/src/hud.js`, `game/src/save.js`, `game/src/audio.js`, `game/src/rng.js`, `game/src/input.js`, `game/src/config.js` — HUD, saves, sound, randomness, input, tuning
- `game/vendor/three/` — three.js r160 (MIT)
- `screenshots/` — 4 screenshots of the running game
- `main.ts` — copies `game/` and `screenshots/` to `/output` and writes `dossier.json`
