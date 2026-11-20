// Solmar Heat — Rook, the player character: a low-poly figure built from
// boxes, with on-foot movement, jumping, fists and a shotgun, and a camera
// yaw/pitch that the mouse drives. When driving, the figure hides in the car.
import * as THREE from 'three';
import { PLAYER, KEYS } from './config.js';
import { makeFigure } from './pedestrians.js';

export function createPlayer(scene) {
  const { group, parts } = makeFigure(0x2a2d34, 0x3a4a6a, 0xe8b88a);
  // Rook's jacket: a darker torso and a cap
  parts.torso.material = new THREE.MeshLambertMaterial({ color: 0x1e2126 });
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.36), new THREE.MeshLambertMaterial({ color: 0xc23b2e }));
  cap.position.y = 1.92;
  group.add(cap);
  // shotgun, shown only when the shotgun is equipped
  const gun = new THREE.Group();
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.9), new THREE.MeshLambertMaterial({ color: 0x222226 }));
  barrel.position.z = 0.3;
  gun.add(barrel);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.35), new THREE.MeshLambertMaterial({ color: 0x6d4c2a }));
  stock.position.z = -0.2;
  gun.add(stock);
  gun.position.set(0.3, 1.25, 0.25);
  gun.visible = false;
  group.add(gun);
  scene.add(group);
  return {
    group, parts, gun,
    pos: group.position,
    angle: 0,
    camYaw: 0,
    camPitch: 0.35,
    vy: 0,
    onGround: true,
    health: PLAYER.maxHealth,
    weapon: 'fists',
    ammo: PLAYER.startAmmo,
    attackCooldown: 0,
    speed: 0,
    inCar: false,
  };
}

function nearestTargetInCone(targets, origin, dirX, dirZ, range, cosMin) {
  let best = null;
  let bestD = range;
  for (const t of targets) {
    const dx = t.pos.x - origin.x;
    const dz = t.pos.z - origin.z;
    const d = Math.hypot(dx, dz);
    if (d > range || d < 0.01) continue;
    const dot = (dx * dirX + dz * dirZ) / d;
    if (dot < cosMin) continue;
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}

/**
 * On-foot update. `world` gives the things Rook can hit and the crime hook:
 * { traffic, peds, officers, onCrime(kind, pos), onShoot(), onPunch() }.
 * Returns an event bag for the frame: { shot, hit, killed }.
 */
export function updatePlayer(dt, player, input, city, world) {
  const events = { shot: false, hit: false, killed: false };
  if (player.inCar) {
    player.group.visible = false;
    return events;
  }
  player.group.visible = true;
  player.attackCooldown = Math.max(0, player.attackCooldown - dt);

  // camera yaw from the mouse
  const mouse = input.takeMouse();
  player.camYaw -= mouse.dx * 0.0032;
  player.camPitch = Math.max(-0.15, Math.min(1.1, player.camPitch + mouse.dy * 0.0022));

  // movement relative to the camera
  const fwd = input.isDown(KEYS.forward) || input.isDown('ArrowUp');
  const back = input.isDown(KEYS.back) || input.isDown('ArrowDown');
  const left = input.isDown(KEYS.left) || input.isDown('ArrowLeft');
  const right = input.isDown(KEYS.right) || input.isDown('ArrowRight');
  const run = input.isDown(KEYS.run);
  const mx = (right ? 1 : 0) - (left ? 1 : 0);
  const mz = (fwd ? 1 : 0) - (back ? 1 : 0);
  const moving = mx !== 0 || mz !== 0;
  const speedTarget = moving ? (run ? PLAYER.runSpeed : PLAYER.walkSpeed) : 0;
  const sin = Math.sin(player.camYaw);
  const cos = Math.cos(player.camYaw);
  // forward is away from the camera: (-sin, -cos); right is (cos, -sin)
  const wishX = -sin * mz + cos * mx;
  const wishZ = -cos * mz - sin * mx;
  const wishLen = Math.hypot(wishX, wishZ) || 1;
  const tx = (wishX / wishLen) * speedTarget;
  const tz = (wishZ / wishLen) * speedTarget;
  const k = Math.min(1, dt * 10);
  const vx = player._vx === undefined ? 0 : player._vx;
  const vz = player._vz === undefined ? 0 : player._vz;
  player._vx = vx + (tx - vx) * k;
  player._vz = vz + (tz - vz) * k;
  player.pos.x += player._vx * dt;
  player.pos.z += player._vz * dt;
  city.resolveCircle(player.pos, PLAYER.radius);
  player.pos.x = Math.max(-city.half - 40, Math.min(city.half + 40, player.pos.x));
  player.pos.z = Math.max(-city.half - 40, Math.min(city.half + 130, player.pos.z));
  player.speed = Math.hypot(player._vx, player._vz);
  if (player.speed > 0.5) player.angle = Math.atan2(player._vx, player._vz);

  // jump
  if (input.wasPressed(KEYS.jump) && player.onGround) {
    player.vy = PLAYER.jumpSpeed;
    player.onGround = false;
  }
  if (!player.onGround) {
    player.vy -= PLAYER.gravity * dt;
    player.pos.y += player.vy * dt;
    if (player.pos.y <= 0) {
      player.pos.y = 0;
      player.vy = 0;
      player.onGround = true;
    }
  }

  // walk-cycle animation
  if (player.speed > 0.5) {
    const swing = Math.sin(performance.now() / 90) * Math.min(0.7, player.speed / 8);
    player.parts.legL.rotation.x = swing;
    player.parts.legR.rotation.x = -swing;
    player.parts.armL.rotation.x = -swing * 0.8;
    player.parts.armR.rotation.x = swing * 0.8;
  } else {
    player.parts.legL.rotation.x *= 0.85;
    player.parts.legR.rotation.x *= 0.85;
    player.parts.armL.rotation.x *= 0.85;
    player.parts.armR.rotation.x *= 0.85;
  }
  player.group.rotation.y = player.angle;

  // weapon switching
  if (input.wasPressed(KEYS.weapon1)) player.weapon = 'fists';
  if (input.wasPressed(KEYS.weapon2) && player.ammo > 0) player.weapon = 'shotgun';
  if (player.weapon === 'shotgun' && player.ammo <= 0) player.weapon = 'fists';
  player.gun.visible = player.weapon === 'shotgun';

  // attack: mouse click or F
  const attack = input.wasPressed(KEYS.attack) || input.wasPressed('KeyF');
  if (attack && player.attackCooldown <= 0) {
    const targets = [];
    for (const car of world.traffic) targets.push({ pos: car.pos, radius: 2.2, kind: 'car', ref: car });
    for (const ped of world.peds) targets.push({ pos: ped.pos, radius: 0.8, kind: 'ped', ref: ped });
    for (const off of world.officers) targets.push({ pos: off.pos, radius: 0.8, kind: 'officer', ref: off });
    const dirX = Math.sin(player.angle);
    const dirZ = Math.cos(player.angle);
    if (player.weapon === 'fists') {
      player.attackCooldown = PLAYER.punchCooldown;
      const hit = nearestTargetInCone(targets, player.pos, dirX, dirZ, PLAYER.punchRange, 0.5);
      if (hit) {
        events.hit = true;
        world.onHit(hit, PLAYER.punchDamage);
        if (world.onPunch) world.onPunch();
      }
    } else {
      player.attackCooldown = PLAYER.shotgunCooldown;
      player.ammo -= 1;
      events.shot = true;
      world.onCrime('shoot', player.pos);
      if (world.onShoot) world.onShoot();
      const spread = (Math.random() - 0.5) * PLAYER.shotgunSpread * 2;
      const a = player.angle + spread;
      const hit = nearestTargetInCone(targets, player.pos, Math.sin(a), Math.cos(a), PLAYER.shotgunRange, 0.9);
      if (hit) {
        events.hit = true;
        world.onHit(hit, PLAYER.shotgunDamage);
      }
    }
  }
  return events;
}

/** Put Rook at a position (used by spawns, respawns and screenshots). */
export function placePlayer(player, x, z, angle, camYaw) {
  player.pos.set(x, 0, z);
  player.angle = angle;
  player.camYaw = camYaw === undefined ? angle : camYaw;
  player._vx = 0;
  player._vz = 0;
  player.vy = 0;
  player.onGround = true;
}
