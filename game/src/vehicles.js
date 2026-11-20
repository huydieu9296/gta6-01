// Solmar Heat — cars: the factory builds every body style from boxes and
// cylinders, traffic AI drives the roads (lanes, red lights, car-following),
// and the player's car gets arcade physics with collisions and damage.
import * as THREE from 'three';
import { CAR, COLORS, TRAFFIC } from './config.js';
import { range, intRange, pick, chance } from './rng.js';

const STYLES = {
  sedan: { length: 4.4, width: 1.9, height: 0.75, cabin: 0.62, maxSpeed: CAR.maxSpeed },
  sports: { length: 4.2, width: 2.0, height: 0.6, cabin: 0.5, maxSpeed: CAR.sportsMaxSpeed },
  taxi: { length: 4.4, width: 1.9, height: 0.75, cabin: 0.62, maxSpeed: CAR.maxSpeed },
  truck: { length: 6.4, width: 2.2, height: 1.1, cabin: 0.8, maxSpeed: 28 },
  police: { length: 4.6, width: 2.0, height: 0.78, cabin: 0.62, maxSpeed: CAR.sportsMaxSpeed },
};

export function makeCarMesh(style, colorHex) {
  const spec = STYLES[style] || STYLES.sedan;
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: colorHex });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a2432 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(spec.width, spec.height, spec.length), bodyMat);
  body.position.y = 0.55;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.82, spec.cabin, spec.length * 0.5), glassMat);
  cabin.position.set(0, 0.55 + spec.height / 2 + spec.cabin / 2 - 0.05, -spec.length * 0.06);
  group.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
  const wheels = [];
  for (const [x, z] of [
    [-spec.width / 2, spec.length / 2 - 0.9],
    [spec.width / 2, spec.length / 2 - 0.9],
    [-spec.width / 2, -spec.length / 2 + 0.9],
    [spec.width / 2, -spec.length / 2 + 0.9],
  ]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.36, z);
    group.add(wheel);
    wheels.push(wheel);
  }
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
  for (const x of [-spec.width / 2 + 0.3, spec.width / 2 - 0.3]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.08), headMat);
    head.position.set(x, 0.6, spec.length / 2 + 0.02);
    group.add(head);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const x of [-spec.width / 2 + 0.3, spec.width / 2 - 0.3]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.16, 0.08), tailMat);
    tail.position.set(x, 0.62, -spec.length / 2 - 0.02);
    group.add(tail);
  }
  if (style === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.4), new THREE.MeshBasicMaterial({ color: 0xffe14d }));
    sign.position.set(0, 0.55 + spec.height / 2 + spec.cabin + 0.1, 0);
    group.add(sign);
  }
  if (style === 'police') {
    const barMat = new THREE.MeshBasicMaterial({ color: 0x2244ff });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 0.4), barMat);
    bar.position.set(0, 0.55 + spec.height / 2 + spec.cabin + 0.08, 0);
    group.add(bar);
    group.userData.lightBar = bar;
  }
  group.userData.spec = spec;
  return { group, wheels, spec };
}

export function createCar(scene, style, colorHex, x, z, angle) {
  const { group, wheels, spec } = makeCarMesh(style, colorHex);
  group.position.set(x, 0, z);
  group.rotation.y = angle;
  scene.add(group);
  return {
    group, wheels, spec, style,
    pos: group.position,
    angle,
    speed: 0,
    damage: 0,
    isPlayer: false,
    axis: 'x',
    dir: 1,
    street: 0,
    lastTurnKey: '',
  };
}

function laneOffset(axis, dir) {
  // Right-hand traffic: each direction gets its own lane, 2.5 m off centre.
  return dir * 2.5;
}

export function spawnTraffic(scene, city, rng, count) {
  const cars = [];
  const styles = ['sedan', 'sedan', 'sports', 'taxi', 'truck'];
  for (let i = 0; i < count; i += 1) {
    const axis = chance(rng, 0.5) ? 'x' : 'z';
    const dir = chance(rng, 0.5) ? 1 : -1;
    const street = pick(rng, city.streets);
    const along = range(rng, -city.half + 20, city.half - 20);
    const x = axis === 'x' ? along : street + laneOffset(axis, dir);
    const z = axis === 'x' ? street - laneOffset(axis, dir) : along;
    const angle = axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : dir > 0 ? 0 : Math.PI;
    const car = createCar(scene, pick(rng, styles), pick(rng, COLORS.carPalette), x, z, angle);
    car.axis = axis;
    car.dir = dir;
    car.street = street;
    car.speed = range(rng, 6, TRAFFIC.speed);
    cars.push(car);
  }
  return cars;
}

function carAhead(cars, self) {
  let best = null;
  let bestDist = TRAFFIC.minGap + 6;
  for (const other of cars) {
    if (other === self || other.axis !== self.axis || other.dir !== self.dir) continue;
    const sameLane = Math.abs(other.street - self.street) < 1;
    if (!sameLane) continue;
    const along = self.axis === 'x' ? (other.pos.x - self.pos.x) * self.dir : (other.pos.z - self.pos.z) * self.dir;
    if (along > 0 && along < bestDist) {
      bestDist = along;
      best = other;
    }
  }
  return best;
}

function nextIntersection(city, car) {
  // Distance along the car's travel to the next crossing street.
  const along = car.axis === 'x' ? car.pos.x : car.pos.z;
  const step = car.dir;
  let best = Infinity;
  for (const s of city.streets) {
    const d = (s - along) * step;
    if (d > 1 && d < best) best = d;
  }
  return best;
}

export function updateTraffic(dt, city, cars, rng, playerPos) {
  for (const car of cars) {
    if (car.disabled) continue;
    let target = TRAFFIC.speed;
    // red / yellow light ahead: stop at the line
    const light = city.lightState(car.axis === 'x' ? 'ew' : 'ns');
    const distToCross = nextIntersection(city, car);
    if (light !== 'green' && distToCross < 14) {
      target = distToCross < 9 ? 0 : 3;
    }
    const ahead = carAhead(cars, car);
    if (ahead) target = Math.min(target, ahead.speed * 0.85);
    // brake for a pedestrian (the player on foot) right ahead — cars in Solmar
    // stop for people in the road, which also makes carjacking a moving car fair
    let brakeForPlayer = false;
    if (playerPos) {
      const aheadDist = car.axis === 'x' ? (playerPos.x - car.pos.x) * car.dir : (playerPos.z - car.pos.z) * car.dir;
      const lateral = car.axis === 'x' ? Math.abs(playerPos.z - car.pos.z) : Math.abs(playerPos.x - car.pos.x);
      if (aheadDist > 0 && aheadDist < 7 && lateral < 3) {
        target = 0;
        brakeForPlayer = true;
      }
    }
    car.speed += (target - car.speed) * Math.min(1, dt * 1.6);
    if (brakeForPlayer) car.speed = Math.max(0, car.speed - 25 * dt);
    if (car.speed < 0.05) car.speed = 0;
    const move = car.speed * dt * car.dir;
    if (car.axis === 'x') car.pos.x += move;
    else car.pos.z += move;
    // turn at an intersection, occasionally
    if (distToCross < 2.5) {
      const key = `${car.axis}:${Math.round(car.axis === 'x' ? car.pos.x : car.pos.z)}`;
      if (key !== car.lastTurnKey) {
        car.lastTurnKey = key;
        if (chance(rng, 0.35)) {
          const cross = city.nearestStreetCoord(car.axis === 'x' ? car.pos.x : car.pos.z);
          const newAxis = car.axis === 'x' ? 'z' : 'x';
          const newDir = chance(rng, 0.5) ? 1 : -1;
          if (newAxis === 'x') {
            car.pos.z = cross - laneOffset('x', newDir);
            car.pos.x = city.nearestStreetCoord(car.pos.x);
          } else {
            car.pos.x = cross + laneOffset('z', newDir);
            car.pos.z = city.nearestStreetCoord(car.pos.z);
          }
          car.axis = newAxis;
          car.dir = newDir;
          car.street = cross;
          car.angle = newAxis === 'x' ? (newDir > 0 ? Math.PI / 2 : -Math.PI / 2) : newDir > 0 ? 0 : Math.PI;
        }
      }
    }
    // wrap around at the city edge
    const along = car.axis === 'x' ? car.pos.x : car.pos.z;
    if (Math.abs(along) > city.half + 30) {
      if (car.axis === 'x') car.pos.x = -car.dir * (city.half + 20);
      else car.pos.z = -car.dir * (city.half + 20);
    }
    car.group.rotation.y = car.angle;
    for (const wheel of car.wheels) wheel.rotation.x += car.speed * dt * 2;
  }
}

/** Arcade driving for the player's car. Returns true if it crashed this frame. */
export function drivePlayerCar(dt, car, input, city, traffic) {
  const spec = car.spec;
  if (car.damage >= CAR.maxDamage) {
    car.speed = 0;
    car.group.rotation.y = car.angle;
    return false;
  }
  const forward = input.isDown('KeyW') || input.isDown('ArrowUp');
  const back = input.isDown('KeyS') || input.isDown('ArrowDown');
  const left = input.isDown('KeyA') || input.isDown('ArrowLeft');
  const right = input.isDown('KeyD') || input.isDown('ArrowRight');
  const handbrake = input.isDown('Space');
  if (forward) car.speed += CAR.accel * dt;
  else if (back) car.speed -= (car.speed > 0.5 ? CAR.brake : CAR.accel * 0.6) * dt;
  else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 8 * dt);
  const max = spec.maxSpeed;
  car.speed = Math.max(-CAR.reverseMax, Math.min(max, car.speed));
  const steer = (left ? 1 : 0) - (right ? 1 : 0);
  const turnScale = Math.min(1, Math.abs(car.speed) / 10);
  car.angle += steer * CAR.turnRate * turnScale * dt * Math.sign(car.speed || 1) * (handbrake ? 1.5 : 1);
  const fx = Math.sin(car.angle);
  const fz = Math.cos(car.angle);
  car.pos.x += fx * car.speed * dt;
  car.pos.z += fz * car.speed * dt;
  // buildings
  const before = { x: car.pos.x, z: car.pos.z };
  city.resolveCircle(car.pos, 1.7);
  let crashed = false;
  if (car.pos.x !== before.x || car.pos.z !== before.z) {
    if (Math.abs(car.speed) > 6) {
      car.damage = Math.min(CAR.maxDamage, car.damage + CAR.damagePerHit);
      crashed = true;
    }
    car.speed *= 0.4;
  }
  // other cars
  for (const other of traffic) {
    if (other === car) continue;
    const dx = other.pos.x - car.pos.x;
    const dz = other.pos.z - car.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 3.4 && d > 0.01) {
      const push = (3.4 - d) / 2;
      const nx = dx / d;
      const nz = dz / d;
      car.pos.x -= nx * push;
      car.pos.z -= nz * push;
      if (Math.abs(car.speed) > 8 || Math.abs(other.speed) > 8) {
        car.damage = Math.min(CAR.maxDamage, car.damage + CAR.damagePerHit);
        crashed = true;
      }
      car.speed *= 0.7;
    }
  }
  // stay in the world
  car.pos.x = Math.max(-city.half - 40, Math.min(city.half + 40, car.pos.x));
  car.pos.z = Math.max(-city.half - 40, Math.min(city.half + 130, car.pos.z));
  car.group.rotation.y = car.angle;
  for (const wheel of car.wheels) wheel.rotation.x += car.speed * dt * 2;
  return crashed;
}

export function nearestCar(cars, pos, radius) {
  let best = null;
  let bestD = radius;
  for (const car of cars) {
    const d = Math.hypot(car.pos.x - pos.x, car.pos.z - pos.z);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}
