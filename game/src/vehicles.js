// Cars: factory, traffic AI, player driving, damage and the pit stop.
import * as THREE from 'three';
import { CITY, CAR } from './config.js';
import { clamp, angleDiff, dist2, makeRng } from './rng.js';

const BODY_COLOURS = [0xc0392b, 0x2e6fb8, 0x2e9e5b, 0xd8c832, 0x8a8d94, 0x22262c, 0x7a4a9e, 0xe07b39, 0x3ab8b8];
const TAXI_COLOUR = 0xf2c230;

function makeCarMesh(color, sports, police) {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: police ? 0x1c4ed8 : color });
  const dark = new THREE.MeshLambertMaterial({ color: 0x14181d });
  const glass = new THREE.MeshLambertMaterial({ color: 0x9fc4d8 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, sports ? 4.4 : 4.0), paint);
  body.position.y = 0.55;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, sports ? 1.9 : 2.1), glass);
  cabin.position.set(0, 1.08, sports ? -0.2 : -0.1);
  g.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
    const w = new THREE.Mesh(wheelGeo, dark);
    w.position.set(wx, 0.36, wz);
    g.add(w);
    wheels.push(w);
  }
  if (police) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.16, 0.4),
      new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6 }));
    bar.position.set(0, 1.45, -0.1);
    g.add(bar);
    g.userData.lightBar = bar;
  }
  if (sports) {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.4), dark);
    spoiler.position.set(0, 1.0, -2.1);
    g.add(spoiler);
  }
  g.userData.wheels = wheels;
  return g;
}

// Lane offset for right-hand traffic on a street going `dir` along `axis`.
function laneOffset(axis, dir) {
  // +x travel -> right is +z; -x -> -z; +z -> -x; -z -> +x.
  if (axis === 'x') return { dx: 0, dz: dir * CITY.lane };
  return { dx: -dir * CITY.lane, dz: 0 };
}

export function createVehicles(scene, city, rng) {
  const S = CITY.streets;
  const traffic = [];
  const parked = [];
  const group = new THREE.Group();
  scene.add(group);

  function spawnTrafficCar() {
    const axis = rng.chance(0.5) ? 'x' : 'z';
    const si = rng.int(0, S.length - 1);
    const dir = rng.chance(0.5) ? 1 : -1;
    const along = rng.range(-170, 170);
    const mesh = makeCarMesh(rng.pick(BODY_COLOURS), rng.chance(0.14), false);
    group.add(mesh);
    const car = {
      mesh, axis, si, dir, speed: rng.range(6, 10), maxSpeed: rng.range(8, 12),
      taxi: rng.chance(0.1), sports: false, police: false, hp: CAR.damage,
      x: axis === 'x' ? along : S[si],
      z: axis === 'x' ? S[si] : along,
      yaw: axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI),
      stuck: 0,
    };
    if (car.taxi) {
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 0.4),
        new THREE.MeshLambertMaterial({ color: TAXI_COLOUR }));
      sign.position.set(0, 1.5, -0.1);
      mesh.add(sign);
    }
    traffic.push(car);
    return car;
  }

  function spawnParked() {
    for (let i = 0; i < 10; i++) {
      const axis = rng.chance(0.5) ? 'x' : 'z';
      const si = rng.int(0, S.length - 1);
      const dir = rng.chance(0.5) ? 1 : -1;
      const along = rng.range(-160, 160);
      const off = laneOffset(axis, dir);
      const mesh = makeCarMesh(rng.pick(BODY_COLOURS), rng.chance(0.2), false);
      group.add(mesh);
      const car = {
        mesh, axis, si, dir, speed: 0, maxSpeed: 0, sports: rng.chance(0.2),
        police: false, hp: CAR.damage, parked: true,
        x: (axis === 'x' ? along : S[si]) + off.dx * 1.4,
        z: (axis === 'x' ? S[si] : along) + off.dz * 1.4,
        yaw: axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI),
      };
      // Parked cars never move, so nothing else positions their mesh: do it here.
      mesh.position.set(car.x, 0, car.z);
      mesh.rotation.y = car.yaw;
      parked.push(car);
    }
  }
  spawnParked();
  for (let i = 0; i < 14; i++) spawnTrafficCar();

  // Pit stop: garage block near (110, 66); driving in repairs the car.
  const pit = { x: 110, z: 66, r: 9 };
  const pitMesh = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 8),
    new THREE.MeshLambertMaterial({ color: 0x2e9e5b }));
  pitMesh.position.set(pit.x, 2.5, pit.z);
  group.add(pitMesh);
  const pitSign = new THREE.Mesh(new THREE.BoxGeometry(10.4, 1.2, 0.4),
    new THREE.MeshLambertMaterial({ color: 0xf2c230 }));
  pitSign.position.set(pit.x, 5.4, pit.z - 4.1);
  group.add(pitSign);

  function carPos(car) {
    const off = laneOffset(car.axis, car.dir);
    const base = car.axis === 'x' ? { x: car.x, z: S[car.si] } : { x: S[car.si], z: car.z };
    return { x: base.x + off.dx, z: base.z + off.dz };
  }

  function stepTraffic(dt, clock) {
    for (const car of traffic) {
      if (car.police) continue; // police cars are driven by police.js, not traffic AI.
      // Advance along its street.
      const ahead = car.speed * dt;
      if (car.axis === 'x') car.x += car.dir * ahead; else car.z += car.dir * ahead;
      const pos = carPos(car);
      // Next intersection ahead.
      const coord = car.axis === 'x' ? car.x : car.z;
      let nextI = -1, nextDist = 1e9;
      for (let i = 0; i < S.length; i++) {
        const d = (S[i] - coord) * car.dir;
        if (d > 0 && d < nextDist) { nextDist = d; nextI = i; }
      }
      let want = car.maxSpeed;
      if (nextI >= 0 && nextDist < 12) {
        const ix = car.axis === 'x' ? nextI : city.streetIndex(pos.z);
        const iz = car.axis === 'x' ? city.streetIndex(pos.x) : nextI;
        const ph = city.lightPhase(ix, iz, clock);
        const redForMe = car.axis === 'x' ? (ph === 'ew' || ph === 'ewY') : (ph === 'ns' || ph === 'nsY');
        if (redForMe && nextDist < 10) want = 0;
      }
      // Car ahead in the same lane?
      for (const other of traffic) {
        if (other === car || other.axis !== car.axis || other.si !== car.si || other.dir !== car.dir) continue;
        const gap = ((car.axis === 'x' ? other.x - car.x : other.z - car.z)) * car.dir;
        if (gap > 0 && gap < 9) { want = Math.min(want, Math.max(0, other.speed - 1)); }
      }
      car.speed += clamp(want - car.speed, -14 * dt, 8 * dt);
      if (car.speed < 0.05) car.speed = 0;
      // Turn at an intersection sometimes.
      if (nextI >= 0 && nextDist < 1.5 && rng.chance(0.3)) {
        const turn = rng.pick(['left', 'right', 'straight']);
        if (turn !== 'straight') {
          car.axis = car.axis === 'x' ? 'z' : 'x';
          car.si = city.streetIndex(car.axis === 'x' ? car.z : car.x);
          car.dir = rng.chance(0.5) ? 1 : -1;
        }
      }
      // Wrap around the city edge.
      if (car.axis === 'x' && (car.x > 178 || car.x < -178)) { car.x = -car.dir * 178; }
      if (car.axis === 'z' && (car.z > 178 || car.z < -178)) { car.z = -car.dir * 178; }
      const p = carPos(car);
      car.mesh.position.set(p.x, 0, p.z);
      const targetYaw = car.axis === 'x' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? 0 : Math.PI);
      car.mesh.rotation.y = targetYaw;
      // Wheel spin.
      for (const w of car.mesh.userData.wheels) w.rotation.x += car.speed * dt * 0.9;
    }
  }

  function nearestCar(x, z, maxD, onlyParked) {
    let best = null, bd = maxD * maxD;
    const list = onlyParked ? parked : [...traffic, ...parked];
    for (const c of list) {
      const d = dist2(x, z, c.mesh.position.x, c.mesh.position.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  return {
    traffic, parked, pit,
    stepTraffic,
    nearestCar,
    spawnParkedAt(x, z, sports) {
      const mesh = makeCarMesh(rng.pick(BODY_COLOURS), sports, false);
      group.add(mesh);
      const car = {
        mesh, axis: 'x', si: 0, dir: 1, speed: 0, maxSpeed: 0, sports,
        police: false, hp: CAR.damage, parked: true, x, z, yaw: rng.next() * Math.PI * 2,
      };
      mesh.position.set(x, 0, z);
      mesh.rotation.y = car.yaw;
      parked.push(car);
      return car;
    },
    // Arcade drive step for the player's car. Returns {speed, crashed}.
    drive(car, input, dt) {
      const top = car.sports ? CAR.sportsMax : CAR.maxSpeed;
      const fwd = input.fwd;
      if (fwd > 0) car.speed += CAR.accel * fwd * dt;
      else if (fwd < 0) {
        if (car.speed > 0.5) car.speed -= CAR.brake * dt;
        else car.speed -= CAR.reverseAccel * dt;
      } else {
        car.speed -= Math.sign(car.speed) * 8 * dt;
        if (Math.abs(car.speed) < 0.3) car.speed = 0;
      }
      car.speed = clamp(car.speed, -CAR.maxReverse, top);
      const steer = input.strafe * CAR.steer * (1 - Math.min(Math.abs(car.speed) / top, 1) * 0.55);
      const handbrake = input.jump;
      const rate = (car.speed / CAR.wheelBase) * Math.tan(steer) * (handbrake ? 1.7 : 1);
      car.yaw += rate * dt;
      if (handbrake) car.speed *= Math.max(0, 1 - 0.9 * dt);
      const nx = car.mesh.position.x + Math.sin(car.yaw) * car.speed * dt;
      const nz = car.mesh.position.z + Math.cos(car.yaw) * car.speed * dt;
      const res = city.resolveCircle(nx, nz, 1.6);
      let crashed = false;
      if (res.x !== nx || res.z !== nz) {
        crashed = Math.abs(car.speed) > 6;
        car.speed *= 0.4;
      }
      // Bounds.
      const bx = clamp(res.x, -230, 178), bz = clamp(res.z, -178, 178);
      if (bx !== res.x || bz !== res.z) { car.speed *= 0.5; }
      car.mesh.position.set(bx, 0, bz);
      car.mesh.rotation.y = car.yaw;
      for (const w of car.mesh.userData.wheels) w.rotation.x += car.speed * dt * 0.9;
      car.mesh.rotation.z = -steer * 0.08 * Math.sign(car.speed);
      return { speed: car.speed, crashed };
    },
    spawnPoliceCar(x, z) {
      const mesh = makeCarMesh(0, false, true);
      group.add(mesh);
      const car = {
        mesh, axis: 'x', si: 0, dir: 1, speed: 0, maxSpeed: 30, sports: false,
        police: true, hp: CAR.damage, x, z, yaw: 0, chase: true,
      };
      traffic.push(car);
      return car;
    },
    removeCar(car) {
      group.remove(car.mesh);
      const i = traffic.indexOf(car);
      if (i >= 0) traffic.splice(i, 1);
      const j = parked.indexOf(car);
      if (j >= 0) parked.splice(j, 1);
    },
    makeCarMesh,
  };
}
