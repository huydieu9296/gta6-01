// Wanted level, police pursuit, roadblocks and getting busted.
import * as THREE from 'three';
import { WANTED } from './config.js';
import { clamp, dist2, makeRng } from './rng.js';

export function createPolice(scene, city, vehicles, rng) {
  const group = new THREE.Group();
  scene.add(group);
  const cops = []; // {mesh, car|null, x, z, yaw, speed, bustTimer}
  const roadblocks = [];
  let heat = 0;
  let stars = 0;
  let unseenTimer = 0;

  function copMesh() {
    const g = new THREE.Group();
    const uni = new THREE.MeshLambertMaterial({ color: 0x1c2f6b });
    const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.72, 0.34), uni);
    torso.position.y = 1.14; g.add(torso);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.38), skin);
    head.position.y = 1.7; g.add(head);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.42), uni);
    cap.position.y = 1.92; g.add(cap);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.78, 0.2), uni);
    legL.position.set(-0.15, 0.4, 0); g.add(legL);
    const legR = legL.clone(); legR.position.x = 0.15; g.add(legR);
    g.userData = { legL, legR };
    return g;
  }

  function spawnFootCop(x, z) {
    const mesh = copMesh();
    mesh.position.set(x, 0, z);
    group.add(mesh);
    cops.push({ mesh, car: null, x, z, yaw: 0, speed: 0, bustTimer: 0, phase: rng.next() * 6 });
  }
  function spawnCarCop(x, z) {
    const car = vehicles.spawnPoliceCar(x, z);
    cops.push({ mesh: car.mesh, car, x, z, yaw: 0, speed: 0, bustTimer: 0, phase: 0 });
  }

  function desiredUnits() {
    if (stars <= 0) return { cars: 0, foot: 0, block: false };
    return {
      cars: Math.min(stars, 5),
      foot: stars >= 2 ? stars - 1 : 0,
      block: stars >= 4,
    };
  }

  function ensureUnits(px, pz) {
    const want = desiredUnits();
    let cars = cops.filter((c) => c.car).length;
    let foot = cops.filter((c) => !c.car).length;
    while (cars < want.cars) {
      const a = rng.next() * Math.PI * 2;
      spawnCarCop(px + Math.cos(a) * 90, pz + Math.sin(a) * 90);
      cars++;
    }
    while (foot < want.foot) {
      const a = rng.next() * Math.PI * 2;
      spawnFootCop(px + Math.cos(a) * 26, pz + Math.sin(a) * 26);
      foot++;
    }
    if (want.block && roadblocks.length === 0) {
      // Roadblock on the nearest street ahead of the player.
      const sx = city.nearestStreet(px), sz = city.nearestStreet(pz);
      for (const [bx, bz] of [[sx + 40, sz], [sx - 40, sz]]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(9, 1.1, 0.8),
          new THREE.MeshLambertMaterial({ color: 0xd8d8c8 }));
        bar.position.set(bx, 0.55, bz);
        group.add(bar);
        roadblocks.push(bar);
      }
    }
    if (!want.block && roadblocks.length > 0) {
      for (const b of roadblocks) group.remove(b);
      roadblocks.length = 0;
    }
    // Cull extras when the heat drops.
    while (cops.length > want.cars + want.foot) {
      const c = cops.pop();
      if (c.car) vehicles.removeCar(c.car); else group.remove(c.mesh);
    }
  }

  return {
    get heat() { return heat; },
    get stars() { return stars; },
    addHeat(amount) { heat = clamp(heat + amount, 0, 100); },
    setHeat(v) { heat = clamp(v, 0, 100); },
    clear() {
      heat = 0; stars = 0; unseenTimer = 0;
      for (const c of cops) { if (c.car) vehicles.removeCar(c.car); else group.remove(c.mesh); }
      cops.length = 0;
      for (const b of roadblocks) group.remove(b);
      roadblocks.length = 0;
    },
    // Shotgun hit on a foot cop within maxD of (x, z): returns 'down' | 'hit' | null.
    hitAt(x, z, maxD) {
      let best = null, bd = maxD * maxD;
      for (const c of cops) {
        if (c.car) continue;
        const d = dist2(x, z, c.x, c.z);
        if (d < bd) { bd = d; best = c; }
      }
      if (!best) return null;
      best.hp = (best.hp ?? 2) - 1;
      if (best.hp <= 0) {
        group.remove(best.mesh);
        cops.splice(cops.indexOf(best), 1);
        return 'down';
      }
      return 'hit';
    },
    positions() { return cops.map((c) => ({ x: c.x, z: c.z })); },
    // Step the pursuit. Returns 'busted' when the player is caught, else null.
    step(dt, px, pz, playerInCar, playerSpeed) {
      const prevStars = stars;
      stars = WANTED.stars.findIndex((t, i) => heat < (WANTED.stars[i + 1] ?? 101) && heat >= t);
      if (stars < 0) stars = 0;
      if (stars !== prevStars) {
        // New star level: fresh siren blip handled by main via audio.
      }
      // Heat decay while no cop is close.
      const anyClose = cops.some((c) => dist2(c.x, c.z, px, pz) < 45 * 45);
      if (!anyClose) unseenTimer += dt; else unseenTimer = 0;
      if (unseenTimer > 8) heat = Math.max(0, heat - WANTED.decay * dt);
      if (stars === 0) { this.clear(); return null; }
      ensureUnits(px, pz);
      for (const c of cops) {
        if (c.car) {
          // Greedy road chase: steer along the axis with the bigger delta.
          const car = c.car;
          const dx = px - car.mesh.position.x, dz = pz - car.mesh.position.z;
          const d = Math.hypot(dx, dz) || 1;
          const wantYaw = Math.atan2(dx, dz);
          let dy = wantYaw - car.yaw;
          while (dy > Math.PI) dy -= Math.PI * 2;
          while (dy < -Math.PI) dy += Math.PI * 2;
          car.yaw += clamp(dy, -1.9 * dt, 1.9 * dt);
          const target = d > 60 ? 30 : d > 14 ? 20 : 8;
          car.speed += clamp(target - car.speed, -20 * dt, 12 * dt);
          const nx = car.mesh.position.x + Math.sin(car.yaw) * car.speed * dt;
          const nz = car.mesh.position.z + Math.cos(car.yaw) * car.speed * dt;
          const res = city.resolveCircle(nx, nz, 1.6);
          car.mesh.position.set(res.x, 0, res.z);
          car.mesh.rotation.y = car.yaw;
          c.x = res.x; c.z = res.z;
          // Light bar flash.
          const bar = car.mesh.userData.lightBar;
          if (bar) bar.material.emissive.setHex(Math.floor(performance.now() / 350) % 2 ? 0xff2020 : 0x2040ff);
          // Ram the player's car to a stop, then bust.
          if (playerInCar && d < 3.2 && Math.abs(playerSpeed) < 2) {
            c.bustTimer += dt;
            if (c.bustTimer > 2) return 'busted';
          } else c.bustTimer = 0;
        } else {
          // Foot cop runs at the player.
          const dx = px - c.x, dz = pz - c.z;
          const d = Math.hypot(dx, dz) || 1;
          const sp = 7.2;
          c.x += (dx / d) * sp * dt;
          c.z += (dz / d) * sp * dt;
          c.phase += dt * 9;
          c.mesh.userData.legL.rotation.x = Math.sin(c.phase) * 0.6;
          c.mesh.userData.legR.rotation.x = -Math.sin(c.phase) * 0.6;
          c.mesh.position.set(c.x, 0, c.z);
          c.mesh.rotation.y = Math.atan2(dx, dz);
          if (!playerInCar && d < 2.6) {
            c.bustTimer += dt;
            if (c.bustTimer > 1.2) return 'busted';
          } else c.bustTimer = 0;
        }
      }
      return null;
    },
  };
}
