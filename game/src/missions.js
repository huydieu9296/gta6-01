// Solmar Heat — missions: courier runs, taxi fares and a four-job story arc
// from Mara, Rook's contact. A marker on the street starts a job; a beacon
// and the minimap show where to go; the clock decides if the pay lands.
import * as THREE from 'three';
import { MONEY } from './config.js';
import { range, intRange, pick } from './rng.js';
import { makeFigure } from './pedestrians.js';

const STORY = [
  { name: 'First Run', kind: 'courier', desc: 'Mara: a package at the port, downtown by the clock. Don\'t open it.', reward: 300, time: 150 },
  { name: 'Cab Call', kind: 'taxi', desc: 'Mara: a fare at the beach wants uptown. Smooth ride, good tip.', reward: 450, time: 120 },
  { name: 'Hot Package', kind: 'courier', desc: 'Mara: this one is warm. Cops will be looking. Get it to Harbor House.', reward: 800, time: 180, wanted: 2 },
  { name: 'The Big Score', kind: 'courier', desc: 'Mara: the last one. Downtown to the port, and everyone will know. Make it count.', reward: 1500, time: 240, wanted: 3 },
];

export function createMissions(scene, city, rng) {
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.75 });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 30, 12, 1, true), beaconMat);
  beacon.visible = false;
  scene.add(beacon);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 3, 24), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  scene.add(ring);
  return {
    scene, city, rng,
    beacon, ring,
    storyIndex: 0,
    storyDone: false,
    active: null,
    side: [],
    sideCooldown: 0,
    storyCooldown: 8,
    passenger: null,
    completed: 0,
    earned: 0,
  };
}

function streetPoint(city, rng) {
  const p = city.randomStreetPos(rng);
  return new THREE.Vector3(p.x, 0, p.z);
}

function spawnSide(missions) {
  const { city, rng } = missions;
  const kind = pick(rng, ['courier', 'courier', 'taxi']);
  if (kind === 'courier') {
    missions.side.push({
      kind: 'courier',
      name: 'Courier Run',
      desc: 'Pick up the package, deliver it before the clock runs out.',
      pickup: streetPoint(city, rng),
      dropoff: streetPoint(city, rng),
      reward: intRange(rng, MONEY.courier[0], MONEY.courier[1]),
      time: 150,
    });
  } else {
    missions.side.push({
      kind: 'taxi',
      name: 'Taxi Fare',
      desc: 'Pick up the passenger and drive them to the marker.',
      pickup: streetPoint(city, rng),
      dropoff: streetPoint(city, rng),
      reward: intRange(rng, MONEY.taxi[0], MONEY.taxi[1]),
      time: 120,
    });
  }
}

function startMission(missions, def, isStory) {
  const m = {
    kind: def.kind,
    name: def.name,
    desc: def.desc,
    stage: 'pickup',
    pickup: def.pickup.clone(),
    dropoff: def.dropoff.clone(),
    target: def.pickup.clone(),
    timeLeft: def.time,
    reward: def.reward,
    story: !!isStory,
    wanted: def.wanted || 0,
    tip: 0,
  };
  missions.active = m;
  if (m.kind === 'taxi') {
    const { group, parts } = makeFigure(0xe0a92e, 0x2a2d34, 0xc98d5f);
    group.position.copy(m.pickup);
    missions.scene.add(group);
    missions.passenger = { group, parts, pos: group.position };
  }
  return m;
}

export function beginSideMission(missions, def) {
  const m = {
    kind: def.kind,
    name: def.name,
    desc: def.desc,
    stage: 'pickup',
    pickup: def.pickup.clone(),
    dropoff: def.dropoff.clone(),
    target: def.pickup.clone(),
    timeLeft: def.time,
    reward: def.reward,
    story: false,
    wanted: 0,
    tip: 0,
    sideDef: def,
  };
  missions.active = m;
  if (m.kind === 'taxi') {
    const { group } = makeFigure(0xe0a92e, 0x2a2d34, 0xc98d5f);
    group.position.copy(m.pickup);
    missions.scene.add(group);
    missions.passenger = { group, pos: group.position };
  }
  return m;
}

export function startStoryMission(missions) {
  const def = STORY[missions.storyIndex];
  if (!def) return null;
  const { city, rng } = missions;
  const pickup = def.name === 'Hot Package' ? new THREE.Vector3(-city.half + 40, 0, range(rng, -40, 40)) : streetPoint(city, rng);
  const dropoff = def.name === 'Hot Package'
    ? missions.city.safehouses[0].pos.clone()
    : def.name === 'The Big Score'
      ? new THREE.Vector3(city.half + 20, 0, 0)
      : streetPoint(city, rng);
  return startMission(missions, { ...def, pickup, dropoff }, true);
}

/** The nearest job marker the player can start, within radius. */
export function nearestMarker(missions, pos, radius) {
  let best = null;
  let bestD = radius;
  const consider = (m, isStory) => {
    const p = m.pickup || m.pos;
    const d = Math.hypot(p.x - pos.x, p.z - pos.z);
    if (d < bestD) {
      bestD = d;
      best = { def: m, story: isStory };
    }
  };
  for (const m of missions.side) consider(m, false);
  if (missions.storyIndex < STORY.length && missions.storyCooldown <= 0) {
    const def = STORY[missions.storyIndex];
    const pos0 = missions.storyPickup || null;
    if (pos0) consider({ ...def, pickup: pos0 }, true);
  }
  return best;
}

export function updateMissions(dt, missions, playerPos, hooks) {
  const events = [];
  missions.sideCooldown -= dt;
  missions.storyCooldown -= dt;
  if (missions.side.length < 2 && missions.sideCooldown <= 0) {
    spawnSide(missions);
    missions.sideCooldown = 25;
  }
  // story pickup point: fixed per story job, chosen once when it unlocks
  if (missions.storyIndex < STORY.length && missions.storyCooldown <= 0 && !missions.storyPickup) {
    missions.storyPickup = streetPoint(missions.city, missions.rng);
  }

  const m = missions.active;
  if (m) {
    m.timeLeft -= dt;
    if (m.timeLeft <= 0) {
      events.push({ type: 'fail', mission: m, reason: 'Out of time.' });
      missions.active = null;
      clearPassenger(missions);
    } else {
      const d = Math.hypot(m.target.x - playerPos.x, m.target.z - playerPos.z);
      if (d < 4) {
        if (m.stage === 'pickup') {
          m.stage = 'dropoff';
          m.target = m.dropoff.clone();
          m.timeLeft += 30;
          if (m.wanted > 0 && hooks.setWanted) hooks.setWanted(m.wanted);
          events.push({ type: 'stage', mission: m, text: m.kind === 'taxi' ? 'Passenger aboard — drive to the marker.' : 'Package collected — deliver it.' });
          if (m.kind === 'taxi' && missions.passenger) {
            missions.scene.remove(missions.passenger.group);
            missions.passenger = null;
          }
        } else {
          let reward = m.reward;
          if (m.kind === 'taxi' && m.timeLeft > 40) {
            m.tip = MONEY.taxiTip;
            reward += m.tip;
          }
          missions.completed += 1;
          missions.earned += reward;
          if (m.story) {
            missions.storyIndex += 1;
            missions.storyPickup = null;
            missions.storyCooldown = 10;
            if (missions.storyIndex >= STORY.length) missions.storyDone = true;
          } else {
            const i = missions.side.findIndex((s) => s === m.sideDef);
            if (i >= 0) missions.side.splice(i, 1);
          }
          events.push({ type: 'complete', mission: m, reward });
          missions.active = null;
        }
      }
    }
  }

  // beacon + ring follow the current objective
  const target = m ? m.target : null;
  if (target) {
    missions.beacon.visible = true;
    missions.ring.visible = true;
    missions.beacon.position.set(target.x, 15, target.z);
    missions.ring.position.set(target.x, 0.15, target.z);
    const s = 1 + Math.sin(performance.now() / 300) * 0.15;
    missions.ring.scale.set(s, s, 1);
  } else {
    missions.beacon.visible = false;
    missions.ring.visible = false;
  }
  return events;
}

function clearPassenger(missions) {
  if (missions.passenger) {
    missions.scene.remove(missions.passenger.group);
    missions.passenger = null;
  }
}

/** The marker the player should see when no job is active (nearest side job). */
export function idleMarker(missions, playerPos) {
  if (missions.active) return null;
  let best = null;
  let bestD = Infinity;
  for (const m of missions.side) {
    const d = Math.hypot(m.pickup.x - playerPos.x, m.pickup.z - playerPos.z);
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  return best;
}

export { STORY };
