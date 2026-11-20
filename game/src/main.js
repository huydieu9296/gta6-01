// Solmar Heat — boot, game loop and wiring. Builds the city once, then owns
// the state machine (menu / playing / paused / busted / game over), the camera,
// crimes and wanted heat, missions, saves, rain, and the ?shot= posing mode.
import * as THREE from 'three';
import { CITY, PLAYER, CAR, WANTED, MONEY, DAY, COLORS } from './config.js';
import { mulberry32, seedFromString } from './rng.js';
import { Input } from './input.js';
import { buildCity } from './city.js';
import { spawnTraffic, updateTraffic, drivePlayerCar, nearestCar, createCar } from './vehicles.js';
import { spawnPeds, updatePeds, nearestPed, witnessSaw, makeFigure as makeOfficerFigure } from './pedestrians.js';
import { createPlayer, updatePlayer, placePlayer } from './player.js';
import { createPolice, updatePolice, wantedStars } from './police.js';
import { createMissions, updateMissions, startStoryMission, beginSideMission, nearestMarker, idleMarker } from './missions.js';
import { createHud } from './hud.js';
import { saveGame, loadGame, clearSave, hasSave } from './save.js';
import { AudioEngine } from './audio.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);

const input = new Input(canvas);
const hud = createHud();
const audio = new AudioEngine();

const params = new URLSearchParams(window.location.search);
const seedParam = params.get('seed');
const shotParam = params.get('shot');
const baseSeed = seedParam ? seedFromString(seedParam) : 7;
let rng = mulberry32(baseSeed);

const city = buildCity(scene, mulberry32(baseSeed));
const player = createPlayer(scene);
const police = createPolice(scene);
const missions = createMissions(scene, city, mulberry32(baseSeed + 11));

let traffic = spawnTraffic(scene, city, mulberry32(baseSeed + 23), 14);
let peds = spawnPeds(scene, city, mulberry32(baseSeed + 37), 22);
let parked = [];
let playerCar = null;

// --- shared state (the HUD reads this every frame) ---------------------------
const state = {
  mode: 'menu',
  time: 0,
  hour: DAY.startHour,
  cash: MONEY.start,
  health: PLAYER.maxHealth,
  heat: 0,
  quietTime: 99,
  stars: 0,
  weapon: 'fists',
  ammo: PLAYER.startAmmo,
  inCar: false,
  speed: 0,
  playerPos: player.pos,
  playerAngle: 0,
  mission: null,
  missionTarget: null,
  storyHint: '',
  prompt: '',
  weather: 'clear',
  rainTimer: 90,
  storyIndex: 0,
  missionsDone: 0,
  earned: 0,
  streets: city.streets,
  cityHalf: CITY.half,
  safehouses: city.safehouses,
  pitstop: city.pitstop.pos,
  cars: traffic,
  officers: police.officers,
  bustedLoss: 0,
  autosaveTimer: 30,
};

// rain: a sheet of falling points that follows the player
const rainGeo = new THREE.BufferGeometry();
const rainCount = 700;
const rainPos = new Float32Array(rainCount * 3);
for (let i = 0; i < rainCount; i += 1) {
  rainPos[i * 3] = (Math.random() - 0.5) * 70;
  rainPos[i * 3 + 1] = Math.random() * 30;
  rainPos[i * 3 + 2] = (Math.random() - 0.5) * 70;
}
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: 0xaac4de, size: 0.12, transparent: true, opacity: 0.6 }));
rain.visible = false;
scene.add(rain);

function syncHudState() {
  state.health = player.health;
  state.weapon = player.weapon;
  state.ammo = player.ammo;
  state.stars = wantedStars(state.heat);
  state.playerAngle = player.angle;
  state.inCar = !!playerCar;
  state.speed = playerCar ? playerCar.speed : player.speed;
  state.mission = missions.active;
  state.missionTarget = missions.active
    ? missions.active.target
    : (idleMarker(missions, player.pos) || {}).pickup || null;
  state.cars = [...traffic, ...police.cars, ...(playerCar ? [playerCar] : [])];
  state.officers = police.officers;
  state.storyIndex = missions.storyIndex;
  state.missionsDone = missions.completed;
  state.earned = missions.earned;
  state.storyHint = missions.storyIndex < 4
    ? 'Mara has work for you — find a yellow marker.'
    : 'Story complete. Side jobs keep paying.';
}

// --- crimes ------------------------------------------------------------------
function addHeat(amount, pos) {
  state.heat = Math.min(100, state.heat + amount);
  state.quietTime = 0;
  if (pos) {
    let witnesses = 0;
    for (const ped of peds) {
      if (witnesses >= 2) break;
      if (witnessSaw(ped, pos)) {
        state.heat = Math.min(100, state.heat + 6);
        witnesses += 1;
      }
    }
  }
}

const world = {
  traffic,
  peds,
  officers: police.officers,
  onCrime(kind, pos) {
    if (kind === 'shoot') addHeat(WANTED.shoot, pos);
  },
  onShoot() { audio.gunshot(); },
  onPunch() { audio.punch(); },
  onHit(target, damage) {
    if (target.kind === 'car') {
      const car = target.ref;
      car.damage = Math.min(CAR.maxDamage, (car.damage || 0) + damage);
      if (car.damage >= CAR.maxDamage) {
        car.disabled = true;
        car.speed = 0;
        hud.toast('That car is wrecked.');
      }
      addHeat(4, player.pos);
    } else if (target.kind === 'ped') {
      const ped = target.ref;
      scene.remove(ped.group);
      peds = peds.filter((p) => p !== ped);
      world.peds = peds;
      addHeat(WANTED.killPed, ped.pos);
      hud.toast('A witness saw that — the heat is on.');
    } else if (target.kind === 'officer') {
      const off = target.ref;
      off.hp = (off.hp || 100) - damage;
      addHeat(WANTED.hitPolice, off.pos);
      if (off.hp <= 0) {
        scene.remove(off.group);
        police.officers = police.officers.filter((o) => o !== off);
        world.officers = police.officers;
      }
    }
  },
};

// --- cars ----------------------------------------------------------------------
function enterCar(car, stolen) {
  playerCar = car;
  car.isPlayer = true;
  traffic = traffic.filter((c) => c !== car);
  parked = parked.filter((c) => c !== car);
  world.traffic = traffic;
  player.inCar = true;
  player.group.visible = false;
  state.cars = traffic;
  if (stolen) {
    addHeat(WANTED.stealCar, car.pos);
    hud.toast('Stolen car — the heat is on.');
  }
  audio.ensure();
  audio.setEngine(0.05);
}

function exitCar() {
  if (!playerCar) return;
  const car = playerCar;
  playerCar = null;
  car.isPlayer = false;
  player.inCar = false;
  const side = Math.cos(car.angle) > 0 ? 1 : -1;
  placePlayer(player, car.pos.x + side * 2.4, car.pos.z + 2.4, car.angle, car.angle);
  parked.push(car);
  audio.setEngine(0);
}

// --- missions ------------------------------------------------------------------
function missionEvents(events) {
  for (const ev of events) {
    if (ev.type === 'complete') {
      state.cash += ev.reward;
      audio.chime();
      hud.toast(`${ev.mission.name} complete — +$${ev.reward}${ev.mission.tip ? ` (tip $${ev.mission.tip})` : ''}`);
      if (ev.mission.story) hud.toast('Mara: nice work, Rook. More coming.');
      saveGame(state);
    } else if (ev.type === 'fail') {
      audio.click();
      hud.toast(`${ev.mission.name} failed — ${ev.reason}`);
    } else if (ev.type === 'stage') {
      hud.toast(ev.text);
    }
  }
}

// --- busted / game over ----------------------------------------------------------
function doBusted() {
  if (state.mode !== 'playing') return;
  state.mode = 'busted';
  const loss = Math.floor(state.cash * WANTED.bustedCashLoss);
  state.bustedLoss = loss;
  state.cash -= loss;
  state.heat = 0;
  state.quietTime = 99;
  if (playerCar) {
    const car = playerCar;
    playerCar = null;
    car.isPlayer = false;
    parked.push(car);
    player.inCar = false;
  }
  const home = city.safehouses.find((s) => s.owned) || city.safehouses[0];
  placePlayer(player, home.pos.x, home.pos.z + 8, 0, 0);
  player.health = PLAYER.maxHealth;
  hud.hud.bustedCash.textContent = `$${loss.toLocaleString('en-US')}`;
  hud.setScreen('busted');
  input.enabled = false;
  saveGame(state);
}

function doGameOver() {
  if (state.mode !== 'playing') return;
  state.mode = 'gameover';
  hud.setScreen('gameover');
  input.enabled = false;
  audio.setEngine(0);
  audio.setSiren(false);
}

// --- interactions (E) -------------------------------------------------------------
function interact() {
  if (playerCar) {
    exitCar();
    return;
  }
  // mission marker
  const marker = nearestMarker(missions, player.pos, 5);
  if (marker) {
    const m = marker.story ? startStoryMission(missions) : startSideMission(marker.def);
    if (m) {
      hud.toast(`${m.name} started — ${m.desc}`);
      audio.click();
    }
    return;
  }
  // safehouse door
  for (const house of city.safehouses) {
    const d = Math.hypot(house.pos.x - player.pos.x, house.pos.z + 4 - player.pos.z);
    if (d < 4) {
      if (house.owned) {
        player.health = PLAYER.maxHealth;
        saveGame(state);
        hud.toast(`${house.name}: saved and rested. Health restored.`);
        audio.chime();
      } else if (state.cash >= house.price) {
        state.cash -= house.price;
        house.owned = true;
        saveGame(state);
        hud.toast(`${house.name} bought for $${house.price} — new spawn point.`);
        audio.chime();
      } else {
        hud.toast(`${house.name} costs $${house.price} — you have $${Math.floor(state.cash)}.`);
      }
      return;
    }
  }
  // enter a nearby car
  const car = nearestCar([...traffic, ...parked], player.pos, CAR.enterRadius);
  if (car) {
    const stolen = traffic.includes(car);
    enterCar(car, stolen);
  }
}

function startSideMission(def) {
  return beginSideMission(missions, def);
}

// --- per-frame update -------------------------------------------------------------
// A scripted input (used by ?shot= staging) answers the same questions the
// real Input does, but never reads the keyboard.
function scriptInput(script) {
  const s = script || {};
  const fwd = !!s.forward;
  const back = !!s.back;
  const left = !!s.left;
  const right = !!s.right;
  return {
    isDown(code) {
      if (code === 'KeyW' || code === 'ArrowUp') return fwd;
      if (code === 'KeyS' || code === 'ArrowDown') return back;
      if (code === 'KeyA' || code === 'ArrowLeft') return left;
      if (code === 'KeyD' || code === 'ArrowRight') return right;
      if (code === 'ShiftLeft') return !!s.run;
      return false;
    },
    wasPressed() { return false; },
    takeMouse() { return { dx: 0, dy: 0 }; },
    endFrame() {},
  };
}

function update(dt, scripted) {
  const inputLike = scripted ? scriptInput(scripted) : input;
  state.time += dt;
  state.hour = (state.hour + (dt * 24) / DAY.lengthSec) % 24;

  // weather
  state.rainTimer -= dt;
  if (state.rainTimer <= 0) {
    state.weather = state.weather === 'clear' && Math.random() < 0.3 ? 'rain' : 'clear';
    state.rainTimer = 60 + Math.random() * 90;
    rain.visible = state.weather === 'rain';
    audio.setRain(state.weather === 'rain');
  }
  if (rain.visible) {
    const arr = rainGeo.attributes.position.array;
    for (let i = 0; i < rainCount; i += 1) {
      arr[i * 3 + 1] -= 26 * dt;
      if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] = 30;
    }
    rainGeo.attributes.position.needsUpdate = true;
    rain.position.set(player.pos.x, 0, player.pos.z);
  }

  city.update(dt, state.hour);
  updateTraffic(dt, city, traffic, rng, playerCar ? null : player.pos);
  updatePeds(dt, city, peds, rng, state.heat > 0 ? { pos: player.pos } : null);
  const stars = updatePolice(dt, police, scene, city, rng, state, {
    onBusted: doBusted,
    onRam: () => {
      if (playerCar) {
        playerCar.damage = Math.min(CAR.maxDamage, playerCar.damage + CAR.damagePerHit);
        audio.crash();
        hud.damageFlash();
      }
    },
  });

  // player: drive or walk
  if (playerCar) {
    const mouse = inputLike.takeMouse();
    player.camYaw -= mouse.dx * 0.0032;
    player.camPitch = Math.max(-0.15, Math.min(1.1, player.camPitch + mouse.dy * 0.0022));
    const crashed = drivePlayerCar(dt, playerCar, inputLike, city, traffic);
    if (crashed) {
      audio.crash();
      hud.damageFlash();
      addHeat(2, playerCar.pos);
    }
    player.pos.copy(playerCar.pos);
    player.angle = playerCar.angle;
    if (playerCar.damage >= CAR.maxDamage && !playerCar._wreckToasted) {
      playerCar._wreckToasted = true;
      hud.toast('Your car is wrecked — get out (E).');
      playerCar.speed = 0;
    }
    // pit stop repair
    const pit = city.pitstop;
    const dPit = Math.hypot(playerCar.pos.x - pit.pos.x, playerCar.pos.z - pit.pos.z);
    if (dPit < pit.radius && Math.abs(playerCar.speed) < 2 && playerCar.damage > 0) {
      const fix = Math.min(playerCar.damage, CAR.repairRate * dt);
      const cost = fix * CAR.repairCostPerPoint;
      if (state.cash >= cost) {
        state.cash -= cost;
        playerCar.damage -= fix;
        state.prompt = `Repairing… $${Math.floor(cost)}`;
      } else {
        state.prompt = 'Pit stop: not enough cash for repairs.';
      }
    }
    audio.setEngine(Math.abs(playerCar.speed) / CAR.sportsMaxSpeed);
  } else {
    const events = updatePlayer(dt, player, inputLike, city, world);
    if (events.shot) state.prompt = '';
    audio.setEngine(0);
  }

  // mission events
  const events = updateMissions(dt, missions, player.pos, {
    setWanted: (stars2) => {
      state.heat = Math.max(state.heat, WANTED.thresholds[stars2]);
      state.quietTime = 0;
    },
  });
  missionEvents(events);

  // story unlock toast
  if (missions.storyIndex < 4 && missions.storyCooldown <= 0 && !state._storyToasted) {
    state._storyToasted = true;
    hud.toast('Mara: got work for you, Rook. Find the yellow marker.');
  }
  if (missions.storyCooldown > 0) state._storyToasted = false;

  // stashes
  for (const stash of city.stashes) {
    if (stash.taken) continue;
    const d = Math.hypot(stash.pos.x - player.pos.x, stash.pos.z - player.pos.z);
    if (d < 2) {
      stash.taken = true;
      stash.timer = 60;
      stash.mesh.visible = false;
      if (stash.kind === 'cash') {
        const amount = Math.floor(40 + Math.random() * 80);
        state.cash += amount;
        hud.toast(`Stash found: +$${amount}`);
      } else if (stash.kind === 'health') {
        player.health = Math.min(PLAYER.maxHealth, player.health + 30);
        hud.toast('Stash found: +30 health');
      } else {
        player.ammo = Math.min(PLAYER.maxAmmo, player.ammo + 8);
        hud.toast('Stash found: +8 shells');
      }
      audio.chime();
    }
  }

  // prompts (E) — only when on foot and not driving
  if (!playerCar && state.mode === 'playing') {
    const marker = nearestMarker(missions, player.pos, 5);
    if (marker) {
      state.prompt = `[E] Start: ${marker.def.name}`;
    } else {
      let housePrompt = '';
      for (const house of city.safehouses) {
        const d = Math.hypot(house.pos.x - player.pos.x, house.pos.z + 4 - player.pos.z);
        if (d < 4) {
          housePrompt = house.owned ? `[E] Rest & save at ${house.name}` : `[E] Buy ${house.name} — $${house.price}`;
          break;
        }
      }
      if (housePrompt) state.prompt = housePrompt;
      else {
        const car = nearestCar([...traffic, ...parked], player.pos, CAR.enterRadius);
        state.prompt = car ? '[E] Enter car' : '';
      }
    }
    if (inputLike.wasPressed('KeyE')) interact();
  } else if (playerCar && state.mode === 'playing') {
    state.prompt = '[E] Exit car';
    if (inputLike.wasPressed('KeyE')) interact();
  }

  // audio + sirens
  audio.update(dt);
  audio.setSiren(stars > 0);

  // health / death
  if (player.health <= 0 && state.mode === 'playing') doGameOver();

  // autosave
  state.autosaveTimer -= dt;
  if (state.autosaveTimer <= 0) {
    state.autosaveTimer = 30;
    if (state.mode === 'playing') saveGame(state);
  }

  syncHudState();
  hud.update(state);
  input.endFrame();
}

// --- camera ----------------------------------------------------------------------
let shotCam = null;
function setShotCamera(pos, target) {
  shotCam = { pos: new THREE.Vector3(pos.x, pos.y, pos.z), target: new THREE.Vector3(target.x, target.y, target.z) };
}

function updateCamera(dt) {
  if (shotCam) {
    camera.position.copy(shotCam.pos);
    camera.lookAt(shotCam.target);
    return;
  }
  const dist = playerCar ? 11 : 8;
  const height = playerCar ? 4.2 : 3.4;
  const fx = -Math.sin(player.camYaw);
  const fz = -Math.cos(player.camYaw);
  const want = new THREE.Vector3(
    player.pos.x - fx * dist,
    player.pos.y + height + player.camPitch * 3,
    player.pos.z - fz * dist,
  );
  camera.position.lerp(want, Math.min(1, dt * 6));
  camera.lookAt(player.pos.x + fx * 5, player.pos.y + 1.4, player.pos.z + fz * 5);
}

// --- world reset / shot helpers ------------------------------------------------------
function clearDynamic() {
  for (const car of traffic) scene.remove(car.group);
  for (const car of parked) scene.remove(car.group);
  for (const ped of peds) scene.remove(ped.group);
  for (const car of police.cars) scene.remove(car.group);
  for (const off of police.officers) scene.remove(off.group);
  if (police.roadblock) {
    for (const car of police.roadblock.cars) scene.remove(car.group);
    police.roadblock = null;
  }
  traffic = [];
  parked = [];
  peds = [];
  police.cars = [];
  police.officers = [];
  playerCar = null;
  player.inCar = false;
  player.group.visible = true;
}

function resetWorld(seed) {
  rng = mulberry32(seed);
  clearDynamic();
  traffic = spawnTraffic(scene, city, mulberry32(seed + 23), 14);
  peds = spawnPeds(scene, city, mulberry32(seed + 37), 22);
  world.traffic = traffic;
  world.peds = peds;
  world.officers = police.officers;
  missions.active = null;
  missions.side = [];
  missions.sideCooldown = 0;
  missions.storyIndex = 0;
  missions.storyDone = false;
  missions.storyPickup = null;
  missions.storyCooldown = 8;
  missions.completed = 0;
  missions.earned = 0;
  state.heat = 0;
  state.quietTime = 99;
  state.hour = DAY.startHour;
  state.weather = 'clear';
  rain.visible = false;
  audio.setRain(false);
  state.cash = MONEY.start;
  player.health = PLAYER.maxHealth;
  player.ammo = PLAYER.startAmmo;
  player.weapon = 'fists';
  placePlayer(player, 0, 30, 0, 0);
}

const game = {
  state, player, city, police, missions,
  // live views: resetWorld / enterCar reassign the module arrays, so expose
  // them through getters instead of capturing the boot-time arrays
  get traffic() { return traffic; },
  get peds() { return peds; },
  get parked() { return parked; },
  get playerCar() { return playerCar; },
  shotMode: false,
  resetWorld,
  setShotCamera,
  update,
  spawnPlayerCar(style, x, z, angle) {
    const car = createCar(scene, style, style === 'sports' ? 0xc23b2e : 0x2e6fc2, x, z, angle);
    return car;
  },
  enterCar(car, stolen) { enterCar(car, stolen); },
  placePlayerAt(x, z, angle) { placePlayer(player, x, z, angle, angle); },
  spawnPoliceBehind(n, minD, maxD) {
    for (let i = 0; i < n; i += 1) {
      const d = minD + i * 12;
      // behind the player means opposite the car's forward direction
      const car = createCar(scene, 'police', 0x1a1d24, player.pos.x, player.pos.z + d, Math.PI);
      car.isPolice = true;
      car.speed = 12;
      police.cars.push(car);
    }
  },
  spawnPoliceAround(nCars, nOfficers, radius) {
    for (let i = 0; i < nCars; i += 1) {
      const a = (i / nCars) * Math.PI * 2;
      const car = createCar(scene, 'police', 0x1a1d24, player.pos.x + Math.sin(a) * radius, player.pos.z + Math.cos(a) * radius, a);
      car.isPolice = true;
      car.speed = 8;
      police.cars.push(car);
    }
    for (let i = 0; i < nOfficers; i += 1) {
      const a = (i / Math.max(1, nOfficers)) * Math.PI * 2 + 0.5;
      const off = spawnOfficerFigure(player.pos.x + Math.sin(a) * (radius * 0.6), player.pos.z + Math.cos(a) * (radius * 0.6));
      police.officers.push(off);
    }
  },
  spawnTrafficNear(n, radius) {
    for (let i = 0; i < n; i += 1) {
      const p = city.randomStreetPos(rng);
      const car = createCar(scene, 'sedan', 0x2e6fc2, p.x, p.z, 0);
      car.axis = 'x';
      car.dir = 1;
      car.street = city.nearestStreetCoord(p.z);
      car.speed = 8;
      traffic.push(car);
    }
  },
  spawnTaxiNear(pos, dist) {
    const car = createCar(scene, 'taxi', COLORS.taxiYellow, pos.x + dist, pos.z, 0);
    car.speed = 0;
    traffic.push(car);
  },
  startSideCourier() {
    // pickup and dropoff both sit on real streets, so the beacon is reachable
    const pickup = { x: 28, z: 40 };
    const def = {
      kind: 'courier',
      name: 'Courier Run',
      desc: 'Pick up the package, deliver it before the clock runs out.',
      pickup: new THREE.Vector3(pickup.x, 0, pickup.z),
      dropoff: new THREE.Vector3(-28, 0, -60),
      reward: 300,
      time: 150,
    };
    const m = {
      kind: 'courier', name: def.name, desc: def.desc, stage: 'pickup',
      pickup: def.pickup.clone(), dropoff: def.dropoff.clone(), target: def.pickup.clone(),
      timeLeft: def.time, reward: def.reward, story: false, wanted: 0, tip: 0, sideDef: def,
    };
    missions.active = m;
    return def;
  },
};

function spawnOfficerFigure(x, z) {
  const { group, parts } = makeOfficerFigure(0x1d2a4a, 0x1d2a4a, 0xe8b88a);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.36), new THREE.MeshLambertMaterial({ color: 0x10151f }));
  cap.position.y = 1.92;
  group.add(cap);
  group.position.set(x, 0, z);
  scene.add(group);
  return { group, parts, pos: group.position, angle: 0, speed: 0, hold: 0, phase: 0 };
}

// --- menus -------------------------------------------------------------------------
function bindButton(id, fn) {
  const b = document.getElementById(id);
  if (b) b.addEventListener('click', () => { audio.ensure(); audio.click(); fn(); });
}

function showMenu() {
  state.mode = 'menu';
  hud.setScreen('menu');
  input.enabled = false;
  document.getElementById('btn-continue').classList.toggle('hidden', !hasSave());
}

function startNewGame() {
  clearSave();
  resetWorld(Date.now() % 100000);
  state.mode = 'playing';
  hud.setScreen(null);
  input.enabled = true;
  hud.toast('Welcome to Solmar, Rook. Mara will call soon.');
  setTimeout(() => hud.toast('Mara: first job is on the board — find the yellow marker.'), 5000);
}

function startContinue() {
  const data = loadGame();
  resetWorld(Date.now() % 100000);
  if (data) {
    state.cash = data.cash;
    player.health = data.health;
    player.ammo = data.ammo;
    player.weapon = data.weapon;
    state.hour = data.hour;
    missions.storyIndex = data.storyIndex;
    missions.completed = data.missionsDone;
    missions.earned = data.earned;
    data.safehouses.forEach((owned, i) => { if (city.safehouses[i]) city.safehouses[i].owned = owned; });
    placePlayer(player, data.x, data.z, data.angle, data.angle);
  }
  state.mode = 'playing';
  hud.setScreen(null);
  input.enabled = true;
  hud.toast('Welcome back, Rook.');
}

bindButton('btn-new', startNewGame);
bindButton('btn-continue', startContinue);
bindButton('btn-resume', () => {
  state.mode = 'playing';
  hud.setScreen(null);
  input.enabled = true;
});
bindButton('btn-quit', () => { saveGame(state); showMenu(); });
bindButton('btn-busted-ok', () => {
  state.mode = 'playing';
  hud.setScreen(null);
  input.enabled = true;
  hud.toast('Busted. Mara got you out — don\'t make it a habit.');
});
bindButton('btn-over-retry', () => {
  const data = loadGame();
  if (data) startContinue();
  else startNewGame();
});
bindButton('btn-over-new', startNewGame);

window.addEventListener('keydown', (event) => {
  if (event.code === 'Escape' || event.code === 'KeyP') {
    if (state.mode === 'playing') {
      state.mode = 'paused';
      hud.setScreen('pause');
      input.enabled = false;
      audio.setEngine(0);
    } else if (state.mode === 'paused') {
      state.mode = 'playing';
      hud.setScreen(null);
      input.enabled = true;
    }
  }
  if (event.code === 'KeyM') {
    audio.ensure();
    const muted = audio.toggleMute();
    hud.toast(muted ? 'Sound off' : 'Sound on');
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- boot -----------------------------------------------------------------------------
placePlayer(player, 0, 30, 0, 0);
syncHudState();
hud.update(state);
window.__game = game;

if (shotParam) {
  // Screenshot mode: pose the scene, render one frame, signal readiness.
  game.shotMode = true;
  state.mode = 'playing';
  input.enabled = false;
  hud.setScreen(null);
  stageShot(shotParam, game);
  syncHudState();
  hud.update(state);
  updateCamera(0.016);
  renderer.render(scene, camera);
  window.__shotReady = true;
} else {
  showMenu();
  let last = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (state.mode === 'playing') {
      update(dt);
      updateCamera(dt);
    }
    renderer.render(scene, camera);
  }
  requestAnimationFrame(loop);
}
