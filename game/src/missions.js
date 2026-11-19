// Missions: Mara's 4-part story arc plus repeatable courier and taxi side jobs.
// Markers are 3D beacons; the phone (M) lists jobs and story progress.
import * as THREE from 'three';
import { MONEY } from './config.js';
import { dist2, makeRng } from './rng.js';

const STORY = [
  {
    id: 's1', name: 'First Run', kind: 'courier',
    brief: 'Mara: "Rook, package at the port. Take it to the hotel on Marina Ave. 100 seconds. Don\'t dawdle."',
    pickup: { x: 132, z: 150 }, drop: { x: -22, z: -110 }, time: 100, pay: 300,
  },
  {
    id: 's2', name: 'Cab Call', kind: 'taxi',
    brief: 'Mara: "A fare\'s waiting by the park. Pick them up, drop them at the beach house. 90 seconds."',
    pickup: { x: 22, z: 66 }, drop: { x: -160, z: 110 }, time: 90, pay: 250,
  },
  {
    id: 's3', name: 'Hot Wheels', kind: 'steal',
    brief: 'Mara: "A Comet GT is parked by the plaza. Bring it to the garage — and expect heat. $500 when it\'s mine."',
    pickup: { x: 66, z: 22 }, drop: { x: 110, z: 66 }, time: 150, pay: 500,
  },
  {
    id: 's4', name: 'Heat Wave', kind: 'chase',
    brief: 'Mara: "Last one. Hit the three checkpoints across town, then lose the tail at the loft. 150 seconds."',
    pickup: { x: 0, z: 0 },
    checkpoints: [{ x: -110, z: -66 }, { x: 110, z: -110 }, { x: -66, z: 110 }],
    drop: { x: 66, z: -22 }, time: 150, pay: 800,
  },
];

export function createMissions(scene, rng) {
  const group = new THREE.Group();
  scene.add(group);
  let active = null; // {def, stage, timer, cpIndex, marker}
  let sideCooldown = 0;
  const beacons = [];

  function makeBeacon(x, z, color) {
    const geo = new THREE.CylinderGeometry(1.6, 1.6, 26, 10, 1, true);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
    const cyl = new THREE.Mesh(geo, mat);
    cyl.position.set(x, 13, z);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.9),
      new THREE.MeshBasicMaterial({ color }));
    gem.position.set(x, 4.5, z);
    group.add(cyl); group.add(gem);
    const b = { cyl, gem, x, z };
    beacons.push(b);
    return b;
  }
  function clearBeacons() {
    for (const b of beacons) { group.remove(b.cyl); group.remove(b.gem); }
    beacons.length = 0;
  }
  function setMarker(x, z, color = 0x4ade80) {
    clearBeacons();
    return makeBeacon(x, z, color);
  }

  function startStory(index, onEvent) {
    const def = STORY[index];
    if (!def) return null;
    active = { def, stage: 'pickup', timer: def.time, cpIndex: 0, onEvent };
    setMarker(def.pickup.x, def.pickup.z, 0x4ade80);
    return active;
  }

  function startSide(kind, px, pz) {
    // Repeatable job: pickup near the player, drop across town.
    const S = [-154, -110, -66, -22, 22, 66, 110, 154];
    const drop = { x: S[rng.int(0, 7)], z: S[rng.int(0, 7)] };
    const def = {
      id: 'side-' + kind, name: kind === 'taxi' ? 'Taxi Fare' : 'Courier Run', kind,
      brief: kind === 'taxi' ? 'Fare waiting nearby — take them across town.' : 'Package waiting nearby — deliver it across town.',
      pickup: { x: px, z: pz }, drop,
      time: 120, pay: kind === 'taxi' ? MONEY.taxi : MONEY.courier,
    };
    active = { def, stage: 'pickup', timer: def.time, cpIndex: 0 };
    setMarker(def.pickup.x, def.pickup.z, 0xf2c94c);
    return active;
  }

  function fail(reason) {
    const a = active;
    active = null;
    clearBeacons();
    return a ? { ...a, reason } : null;
  }
  function complete() {
    const a = active;
    active = null;
    clearBeacons();
    return a;
  }

  return {
    get active() { return active; },
    get storyCount() { return STORY.length; },
    storyDef(i) { return STORY[i]; },
    startStory,
    startSide,
    fail,
    complete,
    // Offer a side job near the player (called when idle, throttled).
    offerSide(px, pz) {
      if (active || sideCooldown > 0) return null;
      sideCooldown = 25;
      return startSide(rng.chance(0.5) ? 'taxi' : 'courier', px + 12, pz + 8);
    },
    // Advance the active mission. Returns an event object when something happens.
    step(dt, px, pz, inCar, hasPackage) {
      if (sideCooldown > 0) sideCooldown -= dt;
      if (!active) return null;
      active.timer -= dt;
      if (active.timer <= 0) return { type: 'failed', reason: 'Out of time.' };
      const def = active.def;
      const gem = beacons[0] && beacons[0].gem;
      if (gem) { gem.rotation.y += dt * 2; gem.position.y = 4.5 + Math.sin(performance.now() / 300) * 0.4; }
      if (active.stage === 'pickup') {
        if (dist2(px, pz, def.pickup.x, def.pickup.z) < 49) {
          if (def.kind === 'steal') {
            // The sports car must be entered; main.js flips stage to 'deliver' on entry.
            return { type: 'atPickup' };
          }
          active.stage = 'deliver';
          setMarker(def.drop.x, def.drop.z, 0x4ade80);
          return { type: 'pickedUp', text: def.kind === 'taxi' ? 'Passenger aboard — drive to the marker.' : 'Package collected — deliver it to the marker.' };
        }
        return null;
      }
      if (def.kind === 'chase' && active.stage === 'deliver') {
        const cp = def.checkpoints[active.cpIndex];
        if (cp && dist2(px, pz, cp.x, cp.z) < 64) {
          active.cpIndex++;
          if (active.cpIndex >= def.checkpoints.length) {
            setMarker(def.drop.x, def.drop.z, 0x4ade80);
            return { type: 'checkpointsDone', text: 'All checkpoints hit — lose the tail at the loft.' };
          }
          const next = def.checkpoints[active.cpIndex];
          setMarker(next.x, next.z, 0x4ade80);
          return { type: 'checkpoint', text: `Checkpoint ${active.cpIndex + 1} of ${def.checkpoints.length}` };
        }
        return null;
      }
      if (active.stage === 'deliver') {
        if (dist2(px, pz, def.drop.x, def.drop.z) < 64) {
          const done = complete();
          return { type: 'done', pay: done.def.pay, name: done.def.name };
        }
      }
      return null;
    },
    // For the steal mission: called when the player enters the target car.
    markStolen() {
      if (active && active.def.kind === 'steal' && active.stage === 'pickup') {
        active.stage = 'deliver';
        setMarker(active.def.drop.x, active.def.drop.z, 0x4ade80);
        return true;
      }
      return false;
    },
    markerPos() {
      if (!active) return null;
      const def = active.def;
      if (active.stage === 'pickup') return def.pickup;
      if (def.kind === 'chase' && active.cpIndex < def.checkpoints.length) return def.checkpoints[active.cpIndex];
      return def.drop;
    },
  };
}
