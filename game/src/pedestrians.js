// Solmar Heat — pedestrians: low-poly walkers who stroll the sidewalks, flee
// when a gun goes off nearby, and remember what they saw. A witness who saw a
// crime raises the wanted level — so think twice before shooting on a busy street.
import * as THREE from 'three';
import { PEDS } from './config.js';
import { range, pick, chance } from './rng.js';

/** A simple articulated figure: torso, head, arms and legs that swing while walking. */
export function makeFigure(shirtColor, pantsColor, skinColor) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const pants = new THREE.MeshLambertMaterial({ color: pantsColor });
  const skin = new THREE.MeshLambertMaterial({ color: skinColor });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.3), shirt);
  torso.position.y = 1.15;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), skin);
  head.position.y = 1.7;
  group.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.36), new THREE.MeshLambertMaterial({ color: 0x201812 }));
  hair.position.y = 1.9;
  group.add(hair);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.16), shirt);
  armL.position.set(-0.37, 1.2, 0);
  group.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.37;
  group.add(armR);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.2), pants);
  legL.position.set(-0.14, 0.4, 0);
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.14;
  group.add(legR);
  return { group, parts: { armL, armR, legL, legR, head, torso } };
}

const SHIRTS = [0xc23b2e, 0x2e6fc2, 0xe0a92e, 0x3aa655, 0x8a5ec2, 0xe8e8e8, 0x222226, 0xff7a2e];
const PANTS = [0x2a2d34, 0x3a4a6a, 0x5a4a3a, 0x222226];
const SKINS = [0xe8b88a, 0xc98d5f, 0x8a5a3a, 0xf0c8a0];

export function spawnPeds(scene, city, rng, count) {
  const peds = [];
  for (let i = 0; i < count; i += 1) {
    const { group, parts } = makeFigure(pick(rng, SHIRTS), pick(rng, PANTS), pick(rng, SKINS));
    const pos = city.randomStreetPos(rng);
    group.position.set(pos.x, 0, pos.z);
    scene.add(group);
    peds.push({
      group, parts,
      pos: group.position,
      angle: range(rng, 0, Math.PI * 2),
      speed: 0,
      walkSpeed: range(rng, 1.2, 2.0),
      state: 'walk',
      panic: 0,
      waypoint: null,
      phase: range(rng, 0, Math.PI * 2),
      witnessTimer: 0,
    });
  }
  return peds;
}

function pickWaypoint(city, rng, ped) {
  // walk the sidewalks: take a street point and push it to the sidewalk edge
  const p = city.randomStreetPos(rng);
  const off = 12 / 2 + 1.5;
  const nearZStreet = Math.abs(p.z - city.nearestStreetCoord(p.z)) < 4;
  if (nearZStreet) {
    return new THREE.Vector3(p.x, 0, city.nearestStreetCoord(p.z) + (chance(rng, 0.5) ? off : -off));
  }
  return new THREE.Vector3(city.nearestStreetCoord(p.x) + (chance(rng, 0.5) ? off : -off), 0, p.z);
}

export function updatePeds(dt, city, peds, rng, danger) {
  for (const ped of peds) {
    ped.witnessTimer = Math.max(0, ped.witnessTimer - dt);
    if (danger && danger.pos) {
      const d = Math.hypot(ped.pos.x - danger.pos.x, ped.pos.z - danger.pos.z);
      if (d < 14) {
        ped.state = 'flee';
        ped.panic = 3;
      }
    }
    if (ped.panic > 0) ped.panic -= dt;
    if (ped.state === 'flee' && ped.panic <= 0) ped.state = 'walk';
    let speed = 0;
    if (ped.state === 'flee') {
      speed = PEDS.fleeSpeed;
      if (danger && danger.pos) {
        const dx = ped.pos.x - danger.pos.x;
        const dz = ped.pos.z - danger.pos.z;
        ped.angle = Math.atan2(dx, dz);
      }
    } else {
      if (!ped.waypoint) ped.waypoint = pickWaypoint(city, rng, ped);
      const dx = ped.waypoint.x - ped.pos.x;
      const dz = ped.waypoint.z - ped.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.5) {
        ped.waypoint = null;
        speed = 0;
        if (chance(rng, 0.02)) ped.angle += range(rng, -1, 1);
      } else {
        ped.angle = Math.atan2(dx, dz);
        speed = ped.walkSpeed;
      }
    }
    ped.speed = speed;
    if (speed > 0) {
      ped.pos.x += Math.sin(ped.angle) * speed * dt;
      ped.pos.z += Math.cos(ped.angle) * speed * dt;
      city.resolveCircle(ped.pos, 0.5);
      ped.phase += dt * speed * 3.2;
      const swing = Math.sin(ped.phase) * 0.55;
      ped.parts.legL.rotation.x = swing;
      ped.parts.legR.rotation.x = -swing;
      ped.parts.armL.rotation.x = -swing * 0.8;
      ped.parts.armR.rotation.x = swing * 0.8;
    } else {
      ped.parts.legL.rotation.x *= 0.9;
      ped.parts.legR.rotation.x *= 0.9;
      ped.parts.armL.rotation.x *= 0.9;
      ped.parts.armR.rotation.x *= 0.9;
    }
    ped.group.rotation.y = ped.angle;
  }
}

/** The nearest pedestrian within radius, or null. */
export function nearestPed(peds, pos, radius) {
  let best = null;
  let bestD = radius;
  for (const ped of peds) {
    const d = Math.hypot(ped.pos.x - pos.x, ped.pos.z - pos.z);
    if (d < bestD) {
      bestD = d;
      best = ped;
    }
  }
  return best;
}

/** A witness saw a crime: returns true when this sighting should raise heat. */
export function witnessSaw(ped, crimePos) {
  if (ped.witnessTimer > 0) return false;
  const d = Math.hypot(ped.pos.x - crimePos.x, ped.pos.z - crimePos.z);
  if (d > PEDS.witnessRadius) return false;
  ped.witnessTimer = PEDS.witnessCooldown;
  ped.state = 'flee';
  ped.panic = 3;
  return true;
}
