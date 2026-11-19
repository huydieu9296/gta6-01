// Solmar Heat — boot, fixed-step loop, state machine and all the wiring.
// ?seed=N fixes the city layout. ?shot=chase|street|mission|police stages that scene
// (with &seed=N), runs it forward a few seconds and sets window.__shotReady.
import * as THREE from 'three';
import { CITY, CAR, WANTED, MONEY, TIME } from './config.js';
import { makeRng, clamp, angleDiff, dist2 } from './rng.js';
import { createInput, ACT } from './input.js';
import { createAudio } from './audio.js';
import { createCity } from './city.js';
import { createVehicles } from './vehicles.js';
import { createPedestrians } from './pedestrians.js';
import { createPlayer } from './player.js';
import { createPolice } from './police.js';
import { createMissions } from './missions.js';
import { createHud } from './hud.js';
import { loadSave, writeSave, defaultSave } from './save.js';
import { stageShot, shotCamera } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;
const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 7;
const rng = makeRng(seed);

// --- Renderer / scene -------------------------------------------------------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b8e8);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
camera.position.set(0, 8, -12);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Systems ----------------------------------------------------------------
const city = createCity(scene, seed);
const vehicles = createVehicles(scene, city, rng);
const peds = createPedestrians(scene, city, rng);
const player = createPlayer(scene);
const police = createPolice(scene, city, vehicles, rng);
const missions = createMissions(scene, rng);
const audio = createAudio();
const input = createInput(canvas);
const hud = createHud(handleHudAction);

// --- Game state -------------------------------------------------------------
const G = {
  screen: 'title', // title | playing | paused | busted | wasted
  cash: MONEY.start,
  storyDone: 0,
  safehouses: ['apartment'],
  timeOfDay: TIME.start,
  raining: false,
  rainTimer: 90,
  weatherTimer: 60,
  car: null, // the car Rook is driving
  carHp: CAR.damage,
  crashTimer: 0, // seconds until crash damage can apply again
  saveTimer: 30,
  storyTimer: 0, // delay before the next story mission starts
  shotCam: null,
  shotSteps: 0,
};
const st = player.state;
let saved = loadSave();

// --- Stashes (cash / health / ammo pickups) ---------------------------------
const stashes = [];
function spawnStash(kind, x, z) {
  const colors = { cash: 0x4ade80, health: 0xf87171, ammo: 0xf2c94c };
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9),
    new THREE.MeshLambertMaterial({ color: colors[kind], emissive: colors[kind], emissiveIntensity: 0.5 }));
  mesh.position.set(x, 0.9, z);
  scene.add(mesh);
  stashes.push({ kind, x, z, mesh, taken: false, respawn: 0 });
}
for (let i = 0; i < 12; i++) {
  const kinds = ['cash', 'health', 'ammo'];
  spawnStash(kinds[i % 3], rng.range(-160, 160), rng.range(-160, 160));
}

// --- Helpers ----------------------------------------------------------------
function toast(t, ms) { hud.toast(t, ms); }
function playerPos() {
  return G.car ? { x: G.car.mesh.position.x, z: G.car.mesh.position.z } : { x: st.x, z: st.z };
}
function enterCar(car) {
  // Take the car out of traffic / parked so its AI stops driving it.
  let i = vehicles.traffic.indexOf(car);
  if (i >= 0) vehicles.traffic.splice(i, 1);
  i = vehicles.parked.indexOf(car);
  if (i >= 0) vehicles.parked.splice(i, 1);
  G.car = car;
  G.carHp = car.hp;
  st.inCar = car;
  player.state.mesh.visible = false;
  audio.setEngine(0, true);
}
function exitCar() {
  if (!G.car) return;
  const car = G.car;
  car.hp = G.carHp;
  G.car = null;
  st.inCar = null;
  st.x = car.mesh.position.x + Math.sin(car.yaw + Math.PI / 2) * 2.2;
  st.z = car.mesh.position.z + Math.cos(car.yaw + Math.PI / 2) * 2.2;
  st.y = 0; st.vy = 0;
  car.parked = true;
  vehicles.parked.push(car);
  player.state.mesh.visible = true;
  player.state.mesh.position.set(st.x, 0, st.z);
  audio.setEngine(0, false);
}
function nearestOwnedSafehouse(x, z) {
  let best = null, bd = 1e9;
  for (const sh of city.safehouses) {
    if (!G.safehouses.includes(sh.id)) continue;
    const d = dist2(x, z, sh.x, sh.z);
    if (d < bd) { bd = d; best = sh; }
  }
  return best;
}
function respawn(kind, fine) {
  const sh = nearestOwnedSafehouse(st.x, st.z) || city.safehouses[0];
  if (G.car) { exitCar(); }
  player.reset(sh.x + 2, sh.z + 2, 100, st.ammo);
  police.clear();
  if (missions.active) missions.fail('Busted.');
  G.cash = Math.max(0, G.cash - fine);
  G.timeOfDay = Math.max(8, G.timeOfDay);
  hud.showEnd(kind, kind === 'busted'
    ? `The Solmar PD caught you. Fine $${Math.round(fine)} — you wake up at ${sh.name}.`
    : `You were taken out. You wake up at ${sh.name}, patched up and broke even.`);
  G.screen = kind;
  saveGame();
}
function saveGame() {
  const p = playerPos();
  return writeSave({
    cash: G.cash, health: st.health, ammo: st.ammo, storyDone: G.storyDone,
    safehouses: G.safehouses, timeOfDay: G.timeOfDay, playerX: p.x, playerZ: p.z,
    bestCash: Math.max(saved?.bestCash || 0, G.cash),
  });
}
function startStoryNext() {
  if (G.storyDone >= missions.storyCount) return;
  const def = missions.storyDef(G.storyDone);
  missions.startStory(G.storyDone);
  if (def.kind === 'steal') vehicles.spawnParkedAt(def.pickup.x, def.pickup.z, true);
  toast(`MARA — ${def.name}: ${def.brief}`, 6000);
}
function startGame(fresh) {
  const s = fresh ? defaultSave() : saved;
  G.cash = s.cash;
  G.storyDone = s.storyDone;
  G.safehouses = s.safehouses.slice();
  G.timeOfDay = s.timeOfDay;
  player.reset(s.pos.x, s.pos.z, s.health, s.ammo);
  police.clear();
  hud.hideScreens();
  hud.hideEnd();
  G.screen = 'playing';
  audio.unlock();
  if (G.storyDone < missions.storyCount && !missions.active) {
    G.storyTimer = 2;
  }
  toast(fresh ? 'Welcome to Solmar. Mara has work for you — check your phone (M).' : 'Welcome back to Solmar.', 5000);
}

// --- Shooting ---------------------------------------------------------------
let tracer = null;
function shoot() {
  if (G.car) { toast('Get out of the car to shoot.'); return; }
  if (st.shells <= 0) {
    if (st.ammo > 0) { reload(); return; }
    toast('No shells — find an ammo stash (yellow).');
    return;
  }
  st.shells -= 1;
  audio.gunshot();
  police.addHeat(WANTED.shoot);
  peds.scare(st.x, st.z, 24);
  const fx = Math.sin(st.camYaw), fz = Math.cos(st.camYaw);
  // Nearest target inside the cone.
  let best = null, bd = 20;
  const consider = (x, z, kind, ref) => {
    const dx = x - st.x, dz = z - st.z;
    const d = Math.hypot(dx, dz);
    if (d > 20 || d < 0.5) return;
    const ang = Math.abs(angleDiff(Math.atan2(fx, fz), Math.atan2(dx, dz)));
    if (ang < 0.38 && d < bd) { bd = d; best = { kind, ref, x, z, d }; }
  };
  for (const p of peds.peds) if (!p.dead) consider(p.x, p.z, 'ped', p);
  for (const c of police.positions()) consider(c.x, c.z, 'cop', c);
  for (const c of [...vehicles.traffic, ...vehicles.parked]) {
    consider(c.mesh.position.x, c.mesh.position.z, 'car', c);
  }
  // Tracer line.
  const end = best ? { x: best.x, z: best.z } : { x: st.x + fx * 20, z: st.z + fz * 20 };
  if (!tracer) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    tracer = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 }));
    scene.add(tracer);
  }
  const pos = tracer.geometry.attributes.position;
  pos.setXYZ(0, st.x, 1.4, st.z);
  pos.setXYZ(1, end.x, 1.2, end.z);
  pos.needsUpdate = true;
  tracer.material.opacity = 0.9;
  tracer.userData.life = 0.09;
  if (best) {
    if (best.kind === 'ped') {
      peds.kill(best.ref);
      police.addHeat(WANTED.killPed);
      toast('A witness saw that. The heat just went up.');
    } else if (best.kind === 'cop') {
      const r = police.hitAt(best.x, best.z, 3);
      police.addHeat(WANTED.hitCop);
      if (r === 'down') toast('Officer down. That will not be forgotten.');
    } else if (best.kind === 'car') {
      best.ref.hp -= 30;
      if (best.ref.hp <= 0) {
        best.ref.speed = 0;
        toast('That car is wrecked.');
      }
    }
  }
}
function reload() {
  if (st.ammo <= 0 || st.shells >= 6) return;
  const need = 6 - st.shells;
  const take = Math.min(need, st.ammo);
  st.shells += take;
  st.ammo -= take;
  audio.click();
}

// --- HUD actions ------------------------------------------------------------
function handleHudAction(action) {
  audio.unlock();
  audio.click();
  if (action === 'new') { saved = null; startGame(true); }
  else if (action === 'continue') { startGame(false); }
  else if (action === 'resume') { G.screen = 'playing'; hud.hidePause(); }
  else if (action === 'save') { saveGame(); toast('Game saved.'); }
  else if (action === 'quit') { saveGame(); G.screen = 'title'; hud.showStart(!!loadSave()); }
  else if (action === 'respawn') { hud.hideEnd(); G.screen = 'playing'; }
  else if (action === 'phone') { hud.togglePhone(!hud.phoneVisible()); }
}

// --- World object handed to shots.js ----------------------------------------
const world = {
  player, vehicles, police, missions, city, peds,
  setTimeOfDay(t) { G.timeOfDay = t; },
  setWeather(r) { G.raining = r; audio.setRain(r); },
  enterCar,
};

// Read-only probe for automated play-testing; invisible in normal play.
window.__solmar = {
  get pos() { const p = playerPos(); return { x: +p.x.toFixed(2), z: +p.z.toFixed(2) }; },
  get camYaw() { return +st.camYaw.toFixed(3); },
  get inCar() { return !!G.car; },
  get speed() { return G.car ? +G.car.speed.toFixed(1) : 0; },
  get stars() { return police.stars; },
  get heat() { return +police.heat.toFixed(1); },
  get cash() { return G.cash; },
  get shells() { return st.shells; },
  get ammo() { return st.ammo; },
  get health() { return Math.round(st.health); },
  get screen() { return G.screen; },
  get mission() { const m = missions.active; return m ? { name: m.def.name, stage: m.stage, timer: Math.round(m.timer) } : null; },
  get parked() { return vehicles.parked.map((c) => ({ x: +c.mesh.position.x.toFixed(1), z: +c.mesh.position.z.toFixed(1) })); },
};

// --- Shot mode --------------------------------------------------------------
if (shotName) {
  G.screen = 'playing';
  hud.hideScreens();
  stageShot(world, shotName, seed);
  // Settle the scene with fixed steps, then frame it from the live state.
  for (let i = 0; i < 150; i++) stepWorld(STEP);
  city.update(0, G.timeOfDay, G.raining, camera.position);
  G.shotCam = shotCamera(world, shotName);
  if (G.shotCam) {
    camera.position.set(...G.shotCam.pos);
    camera.lookAt(...G.shotCam.look);
  } else {
    player.updateCamera(camera, { x: 0, y: 0 }, 0, !!G.car);
  }
  renderer.render(scene, camera);
  hud.update(hudState());
  renderer.render(scene, camera);
  window.__shotReady = true;
  document.title = 'SOLMAR-SHOT-READY';
}

// --- Per-frame update -------------------------------------------------------
function hudState() {
  const p = playerPos();
  const m = missions.active;
  return {
    health: st.health, cash: G.cash, stars: police.stars,
    timeOfDay: G.timeOfDay, raining: G.raining,
    mission: m ? {
      name: m.def.name,
      text: m.stage === 'pickup' ? 'Go to the marker' : (m.def.kind === 'chase' && m.cpIndex < m.def.checkpoints.length ? `Checkpoint ${m.cpIndex + 1} of ${m.def.checkpoints.length}` : 'Deliver to the marker'),
      timer: m.timer,
    } : null,
    shells: st.shells, ammo: st.ammo,
    speed: G.car ? G.car.speed : 0, inCar: !!G.car,
    px: p.x, pz: p.z, yaw: st.camYaw,
    traffic: vehicles.traffic.map((c) => ({ x: c.mesh.position.x, z: c.mesh.position.z })),
    police: police.positions(),
    safehouses: city.safehouses.filter((s) => G.safehouses.includes(s.id)),
    missionMarker: missions.markerPos(),
  };
}

function stepWorld(dt) {
  // Clock and weather.
  G.timeOfDay = (G.timeOfDay + (dt / TIME.dayLength) * 24) % 24;
  G.weatherTimer -= dt;
  if (G.weatherTimer <= 0) {
    G.weatherTimer = 70 + rng.next() * 80;
    G.raining = !G.raining && rng.next() < 0.45;
    audio.setRain(G.raining);
  }
  const p = playerPos();
  const clock = city.clock;
  vehicles.stepTraffic(dt, clock);
  peds.step(dt, police.stars > 0 ? { x: p.x, z: p.z } : null);

  // Player: on foot or driving.
  if (G.crashTimer > 0) G.crashTimer -= dt;
  if (G.car) {
    // In shot mode there is no driver input: hold the throttle so the car keeps
    // moving while the scene settles for the screenshot.
    const fwd = shotName ? 1 : input.axes().fwd;
    const res = vehicles.drive(G.car, { fwd, strafe: shotName ? 0 : input.axes().strafe, jump: input.held.jump }, dt);
    if (res.crashed && G.crashTimer <= 0) {
      G.carHp -= 8;
      G.crashTimer = 0.5;
      audio.crash();
      if (G.carHp <= 0) {
        toast('Your car is wrecked — get out.');
        G.carHp = 0;
        G.car.speed = 0;
      }
    }
    st.x = G.car.mesh.position.x;
    st.z = G.car.mesh.position.z;
    // Car-car bumps.
    for (const c of vehicles.traffic) {
      const d = dist2(G.car.mesh.position.x, G.car.mesh.position.z, c.mesh.position.x, c.mesh.position.z);
      if (d < 12) {
        const push = 1.2;
        c.mesh.position.x += (c.mesh.position.x - G.car.mesh.position.x) * 0.02 * push;
        c.mesh.position.z += (c.mesh.position.z - G.car.mesh.position.z) * 0.02 * push;
        if (Math.abs(G.car.speed) > 8 && G.crashTimer <= 0) { G.carHp -= 4; G.crashTimer = 0.5; audio.crash(); }
      }
    }
    // Pit stop repairs.
    const pit = vehicles.pit;
    if (dist2(p.x, p.z, pit.x, pit.z) < pit.r * pit.r && G.carHp < CAR.damage) {
      if (G.cash >= MONEY.repair) {
        G.cash -= MONEY.repair;
        G.carHp = CAR.damage;
        toast('Pit stop — car repaired, $80.');
        audio.missionOk();
      } else toast('Pit stop — you need $80 for repairs.');
    }
    audio.setEngine(Math.abs(G.car.speed) / CAR.maxSpeed, true);
  } else {
    player.stepFoot(input, dt, city, audio);
    audio.setEngine(0, false);
  }

  // Police pursuit.
  const busted = police.step(dt, p.x, p.z, !!G.car, G.car ? G.car.speed : 0);
  if (busted === 'busted') {
    const fine = Math.round(G.cash * MONEY.bustedFine);
    respawn('busted', fine);
    return;
  }
  audio.setSiren(police.stars > 0, dt);

  // Traffic cars can hurt an on-foot player.
  if (!G.car && st.health > 0) {
    for (const c of vehicles.traffic) {
      if (c.speed < 2) continue;
      const d = dist2(p.x, p.z, c.mesh.position.x, c.mesh.position.z);
      if (d < 4.5) {
        player.hurt(12);
        st.x += (p.x - c.mesh.position.x) * 0.4;
        st.z += (p.z - c.mesh.position.z) * 0.4;
        audio.crash();
      }
    }
    // Police foot cops close in and hit.
    for (const c of police.positions()) {
      if (dist2(p.x, p.z, c.x, c.z) < 5) player.hurt(6);
    }
  }
  if (st.health <= 0) { respawn('wasted', 0); return; }

  // Missions.
  if (G.storyTimer > 0) {
    G.storyTimer -= dt;
    if (G.storyTimer <= 0) startStoryNext();
  }
  const ev = missions.step(dt, p.x, p.z, !!G.car, false);
  if (ev) {
    if (ev.type === 'pickedUp') { toast(ev.text); audio.click(); }
    else if (ev.type === 'checkpoint') { toast(ev.text); audio.click(); }
    else if (ev.type === 'checkpointsDone') { toast(ev.text); }
    else if (ev.type === 'done') {
      G.cash += ev.pay;
      if (G.storyDone < missions.storyCount && ev.name === missions.storyDef(G.storyDone).name) {
        G.storyDone += 1;
        G.storyTimer = 5;
      }
      toast(`${ev.name} complete — $${ev.pay}.`);
      audio.missionOk();
      saveGame();
    } else if (ev.type === 'failed') {
      toast(`Mission failed: ${ev.reason}`);
      audio.missionFail();
    }
  }

  // Stashes.
  for (const s of stashes) {
    if (s.taken) {
      s.respawn -= dt;
      if (s.respawn <= 0) { s.taken = false; s.mesh.visible = true; }
      continue;
    }
    if (dist2(p.x, p.z, s.x, s.z) < 3.2) {
      s.taken = true; s.mesh.visible = false; s.respawn = 60;
      if (s.kind === 'cash') { G.cash += MONEY.stashCash; toast(`Stash — +$${MONEY.stashCash}.`); }
      else if (s.kind === 'health') { player.heal(30); toast('Stash — health +30.'); }
      else { st.ammo += 12; toast('Stash — shotgun shells +12.'); }
      audio.pickup();
    }
    s.mesh.rotation.y += dt;
    s.mesh.position.y = 0.9 + Math.sin(performance.now() / 400 + s.x) * 0.15;
  }

  // Safehouse: standing in an owned one clears heat fast.
  const owned = nearestOwnedSafehouse(p.x, p.z);
  if (owned && dist2(p.x, p.z, owned.x, owned.z) < 100) {
    police.setHeat(Math.max(0, police.heat - 12 * dt));
    if (police.heat === 0 && police.stars > 0) police.clear();
  }

  // Autosave.
  G.saveTimer -= dt;
  if (G.saveTimer <= 0) { G.saveTimer = 30; saveGame(); }

  // Tracer fade.
  if (tracer && tracer.userData.life > 0) {
    tracer.userData.life -= dt;
    if (tracer.userData.life <= 0) tracer.material.opacity = 0;
  }

  // City sky / lights / rain.
  city.update(dt, G.timeOfDay, G.raining, camera.position);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(MAX_FRAME, (now - (frame.last || now)) / 1000 || 0.016);
  frame.last = now;
  const acts = input.takeActions();
  const drag = input.takeDrag();

  if (G.screen === 'title') {
    city.update(dt, G.timeOfDay, G.raining, camera.position);
    camera.position.set(Math.sin(now / 9000) * 60, 26, Math.cos(now / 9000) * 60);
    camera.lookAt(0, 4, 0);
    renderer.render(scene, camera);
    return;
  }
  if (G.screen === 'paused') {
    renderer.render(scene, camera);
    return;
  }
  if (G.screen === 'busted' || G.screen === 'wasted') {
    renderer.render(scene, camera);
    return;
  }
  // Playing (or shot mode).
  if (acts & ACT.PAUSE && !shotName) {
    G.screen = 'paused';
    hud.showPause();
    return;
  }
  if (acts & ACT.PHONE && !shotName) {
    const show = !hud.phoneVisible();
    hud.togglePhone(show);
    if (show) {
      hud.renderPhone(G.storyDone, [0, 1, 2, 3].map((i) => missions.storyDef(i)), G.cash,
        city.safehouses.map((s) => ({ ...s, owned: G.safehouses.includes(s.id) })),
        (id) => {
          const sh = city.safehouses.find((s) => s.id === id);
          if (sh && G.cash >= sh.price) {
            G.cash -= sh.price;
            G.safehouses.push(id);
            toast(`${sh.name} bought — new respawn point.`);
            audio.missionOk();
            saveGame();
          }
        },
        (kind) => {
          const p = playerPos();
          missions.startSide(kind, p.x + 12, p.z + 8);
          hud.togglePhone(false);
          toast(kind === 'taxi' ? 'Taxi fare accepted — pick up the passenger.' : 'Courier run accepted — pick up the package.');
        });
    }
  }
  if ((acts & ACT.INTERACT) && !shotName) {
    const p = playerPos();
    if (G.car) exitCar();
    else {
      const car = vehicles.nearestCar(p.x, p.z, 4.5, false);
      if (car) {
        const wasParked = car.parked === true;
        const occupied = !wasParked && vehicles.traffic.includes(car);
        enterCar(car);
        if (occupied) {
          police.addHeat(WANTED.steal);
          toast('You stole the car — the heat is on.');
        }
        if (missions.active && missions.active.def.kind === 'steal' && car.sports) {
          missions.markStolen();
          police.addHeat(35);
          toast('That\'s the Comet GT — get it to the garage!');
        }
      } else {
        const sh = city.safehouses.find((s) => !G.safehouses.includes(s.id) && dist2(p.x, p.z, s.x, s.z) < 36);
        if (sh) {
          if (G.cash >= sh.price) {
            G.cash -= sh.price;
            G.safehouses.push(sh.id);
            toast(`${sh.name} bought — new respawn point.`);
            audio.missionOk();
            saveGame();
          } else toast(`You need $${sh.price} for ${sh.name}.`);
        }
      }
    }
  }
  if ((acts & ACT.SHOOT) && !shotName) shoot();
  if (acts & ACT.RELOAD) reload();
  if (acts & ACT.HORN && G.car) audio.click();

  // Interact prompt.
  if (!shotName) {
    const p = playerPos();
    let prompt = '';
    if (!G.car) {
      if (vehicles.nearestCar(p.x, p.z, 4.5, false)) prompt = 'E — Enter car';
      else {
        const sh = city.safehouses.find((s) => !G.safehouses.includes(s.id) && dist2(p.x, p.z, s.x, s.z) < 36);
        if (sh) prompt = `E — Buy ${sh.name} ($${sh.price})`;
      }
    } else prompt = 'E — Exit car';
    hud.setPrompt(prompt);
  }

  stepWorld(dt);
  if (shotName) {
    // Shot mode: re-frame from the live car every frame, so the framing stays
    // right even if the screenshot comes seconds after __shotReady.
    const cam = shotCamera(world, shotName);
    camera.position.set(...cam.pos);
    camera.lookAt(...cam.look);
  } else if (G.shotCam) {
    camera.position.set(...G.shotCam.pos);
    camera.lookAt(...G.shotCam.look);
  } else {
    player.updateCamera(camera, drag, dt, !!G.car);
  }
  hud.update(hudState());
  renderer.render(scene, camera);
}

// --- Boot -------------------------------------------------------------------
if (!shotName) {
  hud.showStart(!!saved);
  player.reset(saved ? saved.pos.x : 0, saved ? saved.pos.z : 44, 100, 24);
  camera.position.set(40, 26, 80);
  camera.lookAt(0, 4, 0);
}
requestAnimationFrame(frame);
