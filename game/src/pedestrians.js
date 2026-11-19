// Pedestrians: sidewalk walkers who flee danger; witnesses raise the wanted level.
import * as THREE from 'three';
import { CITY } from './config.js';
import { clamp, dist2, makeRng } from './rng.js';

const SHIRTS = [0xe07b39, 0x2e9e5b, 0xd8c832, 0x7a4a9e, 0x3ab8b8, 0xc0392b, 0xe8e8e8, 0x2e6fb8];
const PANTS = [0x22262c, 0x3a4a6b, 0x5a3a2e, 0x4a4a4a];

export function createPedestrians(scene, city, rng) {
  const S = CITY.streets;
  const group = new THREE.Group();
  scene.add(group);
  const peds = [];

  function makePedMesh(shirt, pants) {
    const g = new THREE.Group();
    const mShirt = new THREE.MeshLambertMaterial({ color: shirt });
    const mPants = new THREE.MeshLambertMaterial({ color: pants });
    const mSkin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.32), mShirt);
    torso.position.y = 1.15; g.add(torso);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.36), mSkin);
    head.position.y = 1.72; g.add(head);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.2), mPants);
    legL.position.set(-0.15, 0.4, 0); g.add(legL);
    const legR = legL.clone(); legR.position.x = 0.15; g.add(legR);
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.16), mShirt);
    armL.position.set(-0.38, 1.15, 0); g.add(armL);
    const armR = armL.clone(); armR.position.x = 0.38; g.add(armR);
    g.userData = { legL, legR, armL, armR };
    return g;
  }

  function spawnPed() {
    const axis = rng.chance(0.5) ? 'x' : 'z';
    const si = rng.int(0, S.length - 1);
    const dir = rng.chance(0.5) ? 1 : -1;
    const along = rng.range(-170, 170);
    const side = rng.chance(0.5) ? 7.5 : -7.5;
    const mesh = makePedMesh(rng.pick(SHIRTS), rng.pick(PANTS));
    group.add(mesh);
    peds.push({
      mesh, axis, si, dir, side,
      x: axis === 'x' ? along : S[si] + side,
      z: axis === 'x' ? S[si] + side : along,
      speed: rng.range(1.0, 1.8),
      flee: 0, // seconds of fleeing left
      dead: false,
      walkPhase: rng.range(0, 6),
    });
  }
  for (let i = 0; i < 24; i++) spawnPed();

  return {
    peds,
    // Returns the nearest living ped within maxD of (x, z), or null.
    nearest(x, z, maxD) {
      let best = null, bd = maxD * maxD;
      for (const p of peds) {
        if (p.dead) continue;
        const d = dist2(x, z, p.x, p.z);
        if (d < bd) { bd = d; best = p; }
      }
      return best;
    },
    scare(x, z, radius) {
      for (const p of peds) {
        if (p.dead) continue;
        if (dist2(x, z, p.x, p.z) < radius * radius) p.flee = 3;
      }
    },
    kill(ped) {
      ped.dead = true;
      ped.mesh.visible = false;
    },
    step(dt, danger) {
      // danger: {x, z} of the threat (player shooting / speeding car), or null.
      for (const p of peds) {
        if (p.dead) continue;
        if (danger && dist2(danger.x, danger.z, p.x, p.z) < 30 * 30) p.flee = Math.max(p.flee, 1.5);
        const speed = p.flee > 0 ? 4.2 : p.speed;
        if (p.flee > 0) p.flee -= dt;
        // Flee away from danger; otherwise walk along the sidewalk.
        let dx = 0, dz = 0;
        if (p.flee > 0 && danger) {
          const d = Math.hypot(p.x - danger.x, p.z - danger.z) || 1;
          dx = (p.x - danger.x) / d; dz = (p.z - danger.z) / d;
        } else if (p.axis === 'x') { dx = p.dir; }
        else { dz = p.dir; }
        p.x += dx * speed * dt;
        p.z += dz * speed * dt;
        // Keep on the sidewalk strip; turn around at the city edge.
        if (p.axis === 'x' && (p.x > 178 || p.x < -178)) { p.dir *= -1; p.x = clamp(p.x, -178, 178); }
        if (p.axis === 'z' && (p.z > 178 || p.z < -178)) { p.dir *= -1; p.z = clamp(p.z, -178, 178); }
        p.walkPhase += dt * speed * 2.2;
        const swing = Math.sin(p.walkPhase) * 0.5;
        p.mesh.userData.legL.rotation.x = swing;
        p.mesh.userData.legR.rotation.x = -swing;
        p.mesh.userData.armL.rotation.x = -swing * 0.7;
        p.mesh.userData.armR.rotation.x = swing * 0.7;
        p.mesh.position.set(p.x, 0, p.z);
        const yaw = p.flee > 0 && danger
          ? Math.atan2(p.x - danger.x, p.z - danger.z)
          : (p.axis === 'x' ? (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (p.dir > 0 ? 0 : Math.PI));
        p.mesh.rotation.y = yaw;
      }
    },
  };
}
