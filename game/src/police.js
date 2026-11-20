// Solmar Heat — the wanted system: heat builds from crimes, decays when
// Rook stays out of sight, and stars 1–5 bring more police cars, more officers
// on foot, and roadblocks. Get caught and it's busted: cash lost, back at a
// safehouse, heat cleared.
import * as THREE from 'three';
import { WANTED } from './config.js';
import { createCar } from './vehicles.js';
import { makeFigure } from './pedestrians.js';
import { range, chance } from './rng.js';

export function wantedStars(heat) {
  let stars = 0;
  for (let i = 0; i < WANTED.thresholds.length; i += 1) {
    if (heat >= WANTED.thresholds[i]) stars = i;
  }
  return stars;
}

export function createPolice(scene) {
  return {
    cars: [],
    officers: [],
    roadblock: null,
    roadblockTimer: 0,
    flash: 0,
  };
}

function spawnPoliceCar(scene, city, rng, near) {
  const pos = city.randomStreetPos(rng);
  // bias the spawn toward the player, but never on top of them
  const dx = near.x - pos.x;
  const dz = near.z - pos.z;
  const d = Math.hypot(dx, dz);
  const angle = Math.atan2(dx, dz);
  const car = createCar(scene, 'police', 0x1a1d24, pos.x, pos.z, angle);
  car.isPolice = true;
  car.speed = 10;
  car.ramCooldown = 0;
  return car;
}

function spawnOfficer(scene, near, rng) {
  const { group, parts } = makeFigure(0x1d2a4a, 0x1d2a4a, 0xe8b88a);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.36), new THREE.MeshLambertMaterial({ color: 0x10151f }));
  cap.position.y = 1.92;
  group.add(cap);
  // never spawn on top of the player — keep at least 8 m away
  let dx = range(rng, -30, 30);
  let dz = range(rng, -30, 30);
  const d = Math.hypot(dx, dz);
  if (d < 8) {
    const s = 8 / Math.max(0.01, d);
    dx *= s;
    dz *= s;
  }
  const x = near.x + dx;
  const z = near.z + dz;
  group.position.set(x, 0, z);
  scene.add(group);
  return { group, parts, pos: group.position, angle: 0, speed: 0, hold: 0, phase: range(rng, 0, 6) };
}

function removeAt(scene, list, item) {
  scene.remove(item.group);
  const i = list.indexOf(item);
  if (i >= 0) list.splice(i, 1);
}

/**
 * Police update. `state` is the shared game state ({heat, playerPos, inCar,
 * playerSpeed, ...}); `hooks` is { onBusted(), onRam(), addHeat(n) }.
 * Returns the current star count.
 */
export function updatePolice(dt, police, scene, city, rng, state, hooks) {
  const stars = wantedStars(state.heat);
  police.flash += dt;
  const playerPos = state.playerPos;

  // --- decay: heat cools off only after a few quiet seconds -----------------
  state.quietTime += dt;
  if (state.quietTime > WANTED.decayDelay && state.heat > 0) {
    state.heat = Math.max(0, state.heat - WANTED.decayPerSec * dt);
  }

  // --- spawn / despawn police cars -------------------------------------------
  const wantCars = WANTED.maxPoliceCars[stars];
  while (police.cars.length < wantCars) {
    const car = spawnPoliceCar(scene, city, rng, playerPos);
    police.cars.push(car);
  }
  while (police.cars.length > wantCars) {
    removeAt(scene, police.cars, police.cars[police.cars.length - 1]);
  }
  const wantOfficers = WANTED.maxOfficers[stars];
  while (police.officers.length < wantOfficers) {
    police.officers.push(spawnOfficer(scene, playerPos, rng));
  }
  while (police.officers.length > wantOfficers) {
    removeAt(scene, police.officers, police.officers[police.officers.length - 1]);
  }

  // --- pursuit cars -----------------------------------------------------------
  for (const car of police.cars) {
    car.ramCooldown = Math.max(0, (car.ramCooldown || 0) - dt);
    const dx = playerPos.x - car.pos.x;
    const dz = playerPos.z - car.pos.z;
    const dist = Math.hypot(dx, dz);
    const wantAngle = Math.atan2(dx, dz);
    let diff = wantAngle - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
    const targetSpeed = dist > 60 ? 34 : dist > 12 ? 30 : 16;
    car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 1.2);
    car.pos.x += Math.sin(car.angle) * car.speed * dt;
    car.pos.z += Math.cos(car.angle) * car.speed * dt;
    city.resolveCircle(car.pos, 1.7);
    car.group.rotation.y = car.angle;
    for (const wheel of car.wheels) wheel.rotation.x += car.speed * dt * 2;
    // light bar flash
    if (car.group.userData.lightBar) {
      const on = Math.floor(police.flash * 6) % 2 === 0;
      car.group.userData.lightBar.material.color.setHex(on ? 0x2244ff : 0xff2a2a);
    }
    // ramming the player's car
    if (state.inCar && dist < 4.5 && car.ramCooldown <= 0) {
      car.ramCooldown = 1.2;
      if (hooks.onRam) hooks.onRam();
    }
    // too far away: teleport closer so the chase never dies out
    if (dist > 150) {
      const p = city.randomStreetPos(rng);
      car.pos.set(p.x, 0, p.z);
      car.angle = Math.atan2(playerPos.x - p.x, playerPos.z - p.z);
    }
  }

  // --- officers on foot -------------------------------------------------------
  let busted = false;
  for (const off of police.officers) {
    const dx = playerPos.x - off.pos.x;
    const dz = playerPos.z - off.pos.z;
    const dist = Math.hypot(dx, dz);
    const chaseSpeed = state.inCar ? 0 : 6.5;
    if (!state.inCar && dist > 1.5) {
      off.angle = Math.atan2(dx, dz);
      off.speed = chaseSpeed;
      off.pos.x += Math.sin(off.angle) * off.speed * dt;
      off.pos.z += Math.cos(off.angle) * off.speed * dt;
      city.resolveCircle(off.pos, 0.5);
      off.phase += dt * off.speed * 3;
      const swing = Math.sin(off.phase) * 0.6;
      off.parts.legL.rotation.x = swing;
      off.parts.legR.rotation.x = -swing;
      off.parts.armL.rotation.x = -swing;
      off.parts.armR.rotation.x = swing;
    } else {
      off.speed = 0;
      off.parts.legL.rotation.x *= 0.9;
      off.parts.legR.rotation.x *= 0.9;
    }
    off.group.rotation.y = off.angle;
    // busted: an officer holds Rook for a moment
    if (!state.inCar && dist < 2.2) {
      off.hold += dt;
      if (off.hold >= WANTED.bustedHoldSec) busted = true;
    } else {
      off.hold = 0;
    }
  }

  // --- roadblocks at 3+ stars ---------------------------------------------------
  police.roadblockTimer -= dt;
  if (stars >= 3 && police.roadblockTimer <= 0) {
    police.roadblockTimer = 18;
    if (!police.roadblock) {
      const cars = [];
      for (let i = 0; i < 2; i += 1) {
        const p = city.randomStreetPos(rng);
        const car = createCar(scene, 'police', 0x1a1d24, p.x, p.z, range(rng, 0, Math.PI * 2));
        car.isPolice = true;
        car.speed = 0;
        cars.push(car);
      }
      police.roadblock = { cars };
    }
    // reposition the block ahead of the player
    const ahead = 40;
    const px = playerPos.x + Math.sin(state.playerAngle || 0) * ahead;
    const pz = playerPos.z + Math.cos(state.playerAngle || 0) * ahead;
    const streetX = city.nearestStreetCoord(px);
    const streetZ = city.nearestStreetCoord(pz);
    const useX = Math.abs(px - streetX) < Math.abs(pz - streetZ);
    police.roadblock.cars.forEach((car, i) => {
      if (useX) car.pos.set(streetX + (i === 0 ? -4 : 4), 0, streetZ);
      else car.pos.set(streetX, 0, streetZ + (i === 0 ? -4 : 4));
      car.angle = useX ? 0 : Math.PI / 2;
      car.group.rotation.y = car.angle;
    });
  }
  if (stars < 3 && police.roadblock) {
    for (const car of police.roadblock.cars) scene.remove(car.group);
    police.roadblock = null;
  }

  if (busted && hooks.onBusted) hooks.onBusted();
  return stars;
}
