// Rook, the player character: on-foot movement, camera, shotgun combat, health.
import * as THREE from 'three';
import { PLAYER } from './config.js';
import { clamp, damp, angleDiff } from './rng.js';

export function createPlayer(scene) {
  const g = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0x27364a });
  const jeans = new THREE.MeshLambertMaterial({ color: 0x2e4a6b });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
  const hair = new THREE.MeshLambertMaterial({ color: 0x1a1210 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.75, 0.36), jacket);
  torso.position.y = 1.12; g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skin);
  head.position.y = 1.72; g.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.14, 0.44), hair);
  cap.position.y = 1.94; g.add(cap);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.8, 0.22), jeans);
  legL.position.set(-0.16, 0.4, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.16; g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.66, 0.18), jacket);
  armL.position.set(-0.42, 1.12, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.42; g.add(armR);
  // Shotgun held in the right hand.
  const gun = new THREE.Group();
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.85), new THREE.MeshLambertMaterial({ color: 0x1a1d22 }));
  barrel.position.z = 0.35; gun.add(barrel);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.35), new THREE.MeshLambertMaterial({ color: 0x5a3a22 }));
  stock.position.z = -0.15; gun.add(stock);
  gun.position.set(0.42, 1.05, 0.25);
  g.add(gun);
  scene.add(g);

  const state = {
    mesh: g, gun,
    x: 0, z: 44, y: 0, vy: 0, grounded: true,
    yaw: 0, // facing
    camYaw: 0, camPitch: 0.32, camDist: 7,
    health: PLAYER.health,
    ammo: 24, shells: 6, // reserve + loaded
    speed: 0,
    walkPhase: 0,
    hurtTimer: 0,
    inCar: null,
  };

  return {
    state,
    reset(x, z, health, ammo) {
      state.x = x; state.z = z; state.y = 0; state.vy = 0;
      state.health = health; state.ammo = ammo; state.shells = 6;
      state.inCar = null; state.hurtTimer = 0;
      g.position.set(x, 0, z);
      g.visible = true;
    },
    // On-foot step. Returns distance moved (for footstep/minimap use).
    stepFoot(input, dt, city, audio) {
      const axes = input.axes();
      const run = input.held.run;
      const top = run ? PLAYER.run : PLAYER.walk;
      // Camera-relative movement. Camera sits behind the player at
      // (x - sin(camYaw)*d, z - cos(camYaw)*d) looking at them, so screen-forward
      // is (sin, cos) and screen-right is (-cos, sin) in (x, z).
      const sin = Math.sin(state.camYaw), cos = Math.cos(state.camYaw);
      let mx = (axes.fwd * sin - axes.strafe * cos);
      let mz = (axes.fwd * cos + axes.strafe * sin);
      const len = Math.hypot(mx, mz);
      if (len > 1) { mx /= len; mz /= len; }
      const tx = mx * top, tz = mz * top;
      const vx = damp(state.vx || 0, tx, 10, dt);
      const vz = damp(state.vz || 0, tz, 10, dt);
      state.vx = vx; state.vz = vz;
      state.x += vx * dt;
      state.z += vz * dt;
      const res = city.resolveCircle(state.x, state.z, PLAYER.radius);
      state.x = clamp(res.x, -230, 178);
      state.z = clamp(res.z, -178, 178);
      // Jump / gravity.
      if (input.held.jump && state.grounded) { state.vy = PLAYER.jump; state.grounded = false; }
      state.vy -= 22 * dt;
      state.y += state.vy * dt;
      if (state.y <= 0) { state.y = 0; state.vy = 0; state.grounded = true; }
      state.speed = Math.hypot(vx, vz);
      if (state.speed > 0.5) {
        const target = Math.atan2(vx, vz);
        state.yaw += angleDiff(state.yaw, target) * Math.min(1, 12 * dt);
        state.walkPhase += dt * state.speed * 1.6;
      }
      const swing = Math.sin(state.walkPhase) * 0.55 * Math.min(1, state.speed / PLAYER.walk);
      legL.rotation.x = swing; legR.rotation.x = -swing;
      armL.rotation.x = -swing * 0.6; armR.rotation.x = swing * 0.6;
      gun.rotation.x = -0.25;
      g.position.set(state.x, state.y, state.z);
      g.rotation.y = state.yaw;
      if (state.hurtTimer > 0) state.hurtTimer -= dt;
      return state.speed;
    },
    // Camera: orbit with drag, wheel-free zoom via keys handled by main.
    updateCamera(camera, drag, dt, inCar) {
      state.camYaw -= drag.x * 0.005;
      state.camPitch = clamp(state.camPitch + drag.y * 0.004, -0.1, 1.1);
      const dist = inCar ? 10.5 : 7.5;
      state.camDist = damp(state.camDist, dist, 4, dt);
      const cx = state.x - Math.sin(state.camYaw) * Math.cos(state.camPitch) * state.camDist;
      const cz = state.z - Math.cos(state.camYaw) * Math.cos(state.camPitch) * state.camDist;
      const cy = state.y + 2.2 + Math.sin(state.camPitch) * state.camDist;
      camera.position.set(cx, Math.max(1.2, cy), cz);
      camera.lookAt(state.x, state.y + 1.6, state.z);
    },
    hurt(amount) {
      if (state.hurtTimer > 0) return;
      state.health -= amount;
      state.hurtTimer = 0.6;
    },
    heal(amount) { state.health = Math.min(PLAYER.health, state.health + amount); },
  };
}
