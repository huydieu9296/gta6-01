// Solmar Heat — the procedural city of Solmar: a road grid, blocks of
// buildings with lit windows, sidewalks, streetlights, working traffic lights,
// a beachfront, a port, safehouses and a pit stop. Everything is generated
// from the seeded RNG, so the same seed always builds the same city.
import * as THREE from 'three';
import { CITY, COLORS, DAY } from './config.js';
import { range, intRange, pick, chance } from './rng.js';

function makeWindowTexture(rng, baseColor, litRatio) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = baseColor;
  g.fillRect(0, 0, 64, 128);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(0, 0, 64, 6);
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const lit = rng() < litRatio;
      g.fillStyle = lit ? '#ffd27a' : '#202c3e';
      g.fillRect(6 + col * 14, 12 + row * 14, 9, 10);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function css(hex) {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

export function buildCity(scene, rng) {
  const pitch = CITY.pitch;
  const half = CITY.half;
  const streets = [];
  for (let i = 0; i <= CITY.blocks; i += 1) streets.push(-half + i * pitch);
  const group = new THREE.Group();
  scene.add(group);

  const colliders = [];
  const lamps = [];
  const trafficLights = [];
  const stashes = [];

  // --- ground, roads, sidewalks -------------------------------------------
  const groundMat = new THREE.MeshLambertMaterial({ color: COLORS.grass });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(CITY.span + 160, CITY.span + 160), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, 0);
  group.add(ground);

  const roadMat = new THREE.MeshLambertMaterial({ color: COLORS.road });
  const walkMat = new THREE.MeshLambertMaterial({ color: COLORS.sidewalk });
  for (const s of streets) {
    const roadX = new THREE.Mesh(new THREE.PlaneGeometry(CITY.span, CITY.road), roadMat);
    roadX.rotation.x = -Math.PI / 2;
    roadX.position.set(0, 0.01, s);
    group.add(roadX);
    const roadZ = new THREE.Mesh(new THREE.PlaneGeometry(CITY.road, CITY.span), roadMat);
    roadZ.rotation.x = -Math.PI / 2;
    roadZ.position.set(s, 0.01, 0);
    group.add(roadZ);
  }
  // dashed centre lines
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xd8d8d8 });
  const dashGeo = new THREE.BoxGeometry(3, 0.02, 0.3);
  for (const s of streets) {
    for (let d = -half + 8; d < half - 8; d += 12) {
      const dash = new THREE.Mesh(dashGeo, lineMat);
      dash.position.set(d, 0.02, s);
      group.add(dash);
    }
  }

  // --- buildings -----------------------------------------------------------
  const variants = COLORS.buildingPalette.map((color) => {
    const tex = makeWindowTexture(rng, css(color), 0.35);
    return new THREE.MeshLambertMaterial({ map: tex });
  });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x3a3d44 });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const downtown = 2; // blocks near the centre are the tall downtown
  for (let bx = 0; bx < CITY.blocks; bx += 1) {
    for (let bz = 0; bz < CITY.blocks; bz += 1) {
      const x0 = -half + bx * pitch + CITY.road / 2;
      const z0 = -half + bz * pitch + CITY.road / 2;
      const centreDist = Math.max(Math.abs(bx - 3), Math.abs(bz - 3));
      const plots = centreDist <= downtown ? 1 : intRange(rng, 1, 4);
      for (let p = 0; p < plots; p += 1) {
        const w = plots === 1 ? CITY.block - 8 : range(rng, 14, 20);
        const d = plots === 1 ? CITY.block - 8 : range(rng, 14, 20);
        const px = plots === 1 ? x0 + CITY.block / 2 : x0 + 8 + (p % 2) * (CITY.block / 2);
        const pz = plots === 1 ? z0 + CITY.block / 2 : z0 + 8 + Math.floor(p / 2) * (CITY.block / 2);
        const tall = centreDist <= downtown ? range(rng, 26, 46) : range(rng, 8, 22);
        const mat = pick(rng, variants);
        const mesh = new THREE.Mesh(boxGeo, mat);
        mesh.scale.set(w, tall, d);
        mesh.position.set(px, tall / 2, pz);
        group.add(mesh);
        const roof = new THREE.Mesh(boxGeo, roofMat);
        roof.scale.set(w * 0.7, 1.2, d * 0.7);
        roof.position.set(px, tall + 0.6, pz);
        group.add(roof);
        colliders.push({ minX: px - w / 2, maxX: px + w / 2, minZ: pz - d / 2, maxZ: pz + d / 2 });
      }
      // sidewalk slab for the block
      const walk = new THREE.Mesh(new THREE.BoxGeometry(CITY.block, 0.18, CITY.block), walkMat);
      walk.position.set(x0 + CITY.block / 2, 0.09, z0 + CITY.block / 2);
      group.add(walk);
    }
  }

  // --- streetlights ---------------------------------------------------------
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x30343c });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 5.4, 6);
  const headGeo = new THREE.SphereGeometry(0.32, 8, 6);
  for (const s of streets) {
    for (let d = -half + 14; d < half; d += 56) {
      for (const [x, z] of [[d, s + CITY.road / 2 + 0.6], [d + 28, s - CITY.road / 2 - 0.6]]) {
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(x, 2.7, z);
        group.add(pole);
        const head = new THREE.Mesh(headGeo, lampMat);
        head.position.set(x, 5.5, z);
        group.add(head);
        lamps.push(head);
      }
    }
  }

  // --- traffic lights at avenue intersections --------------------------------
  const lightMats = {
    red: new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
    yellow: new THREE.MeshBasicMaterial({ color: 0xffc21a }),
    green: new THREE.MeshBasicMaterial({ color: 0x2aff66 }),
    off: new THREE.MeshBasicMaterial({ color: 0x301414 }),
  };
  const poleGeo2 = new THREE.CylinderGeometry(0.14, 0.18, 6.4, 6);
  const boxGeo2 = new THREE.BoxGeometry(0.7, 1.9, 0.7);
  const bulbGeo = new THREE.SphereGeometry(0.2, 8, 6);
  for (let ix = 0; ix < streets.length; ix += 2) {
    for (let iz = 0; iz < streets.length; iz += 2) {
      const x = streets[ix] + CITY.road / 2 + 0.8;
      const z = streets[iz] + CITY.road / 2 + 0.8;
      const pole = new THREE.Mesh(poleGeo2, poleMat);
      pole.position.set(x, 3.2, z);
      group.add(pole);
      const box = new THREE.Mesh(boxGeo2, poleMat);
      box.position.set(x, 6.2, z);
      group.add(box);
      const bulbs = [];
      for (let b = 0; b < 3; b += 1) {
        const bulb = new THREE.Mesh(bulbGeo, lightMats.off);
        bulb.position.set(x, 6.85 - b * 0.55, z + 0.4);
        group.add(bulb);
        bulbs.push(bulb);
      }
      trafficLights.push({ x, z, bulbs, axis: 'ns' });
    }
  }

  // --- beach (south) and port (east) ----------------------------------------
  const sandMat = new THREE.MeshLambertMaterial({ color: COLORS.sand });
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(CITY.span + 160, 60), sandMat);
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.02, half + 30);
  group.add(sand);
  const waterMat = new THREE.MeshLambertMaterial({ color: COLORS.water, transparent: true, opacity: 0.9 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(CITY.span + 160, 120), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.0, half + 120);
  group.add(water);
  const palmMat = new THREE.MeshLambertMaterial({ color: 0x6d4c2a });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e7a3a });
  for (let i = 0; i < 10; i += 1) {
    const x = -half + 20 + i * 38 + range(rng, -6, 6);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 7, 6), palmMat);
    trunk.position.set(x, 3.5, half + 14 + range(rng, -4, 10));
    trunk.rotation.z = range(rng, -0.12, 0.12);
    group.add(trunk);
    const leaves = new THREE.Mesh(new THREE.ConeGeometry(2.6, 2.2, 6), leafMat);
    leaves.position.set(x, 7.6, trunk.position.z);
    group.add(leaves);
  }
  const concreteMat = new THREE.MeshLambertMaterial({ color: 0x7a7d84 });
  const concrete = new THREE.Mesh(new THREE.PlaneGeometry(70, CITY.span), concreteMat);
  concrete.rotation.x = -Math.PI / 2;
  concrete.position.set(half + 35, 0.02, 0);
  group.add(concrete);
  const containerColors = [0xc23b2e, 0x2e6fc2, 0xe0a92e, 0x3aa655, 0x8a5ec2];
  for (let i = 0; i < 16; i += 1) {
    const w = range(rng, 6, 10);
    const h = range(rng, 2.4, 5);
    const mat = new THREE.MeshLambertMaterial({ color: pick(rng, containerColors) });
    const box = new THREE.Mesh(boxGeo, mat);
    box.scale.set(w, h, 2.6);
    box.position.set(half + 14 + (i % 4) * 12, h / 2, -half + 30 + Math.floor(i / 4) * 90 + range(rng, -8, 8));
    group.add(box);
    colliders.push({ minX: box.position.x - w / 2, maxX: box.position.x + w / 2, minZ: box.position.z - 1.3, maxZ: box.position.z + 1.3 });
  }

  // --- safehouses and pit stop ----------------------------------------------
  const houseMat = new THREE.MeshLambertMaterial({ color: 0xd8cdb8 });
  const roofMat2 = new THREE.MeshLambertMaterial({ color: 0x8a3b2e });
  const safehouses = [
    { name: 'Harbor House', pos: new THREE.Vector3(-half + 26, 0, half - 26), owned: true, price: 0 },
    { name: 'Uptown Loft', pos: new THREE.Vector3(half - 26, 0, -half + 26), owned: false, price: 1500 },
  ];
  for (const house of safehouses) {
    const base = new THREE.Mesh(boxGeo, houseMat);
    base.scale.set(10, 5, 8);
    base.position.set(house.pos.x, 2.5, house.pos.z);
    group.add(base);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(7.5, 3, 4), roofMat2);
    roof.position.set(house.pos.x, 6.4, house.pos.z);
    roof.rotation.y = Math.PI / 4;
    group.add(roof);
    const doorMat = new THREE.MeshBasicMaterial({ color: COLORS.safehouse });
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.4, 0.2), doorMat);
    door.position.set(house.pos.x, 1.2, house.pos.z + 4.1);
    group.add(door);
    colliders.push({ minX: house.pos.x - 5, maxX: house.pos.x + 5, minZ: house.pos.z - 4, maxZ: house.pos.z + 4 });
  }
  const pitstop = { pos: new THREE.Vector3(half - 8, 0, 4), radius: 10 };
  const garageMat = new THREE.MeshLambertMaterial({ color: 0x3a3d44 });
  const garage = new THREE.Mesh(boxGeo, garageMat);
  garage.scale.set(14, 6, 10);
  garage.position.set(pitstop.pos.x + 16, 3, pitstop.pos.z);
  group.add(garage);
  const signMat = new THREE.MeshBasicMaterial({ color: COLORS.pitstop });
  const sign = new THREE.Mesh(new THREE.BoxGeometry(6, 1.4, 0.3), signMat);
  sign.position.set(pitstop.pos.x + 16, 6.8, pitstop.pos.z + 5.2);
  group.add(sign);
  colliders.push({ minX: pitstop.pos.x + 9, maxX: pitstop.pos.x + 23, minZ: pitstop.pos.z - 5, maxZ: pitstop.pos.z + 5 });

  // --- props: benches and hydrants ------------------------------------------
  const benchMat = new THREE.MeshLambertMaterial({ color: 0x6d4c2a });
  const hydrantMat = new THREE.MeshLambertMaterial({ color: 0xc23b2e });
  for (let i = 0; i < 26; i += 1) {
    const s = pick(rng, streets);
    const d = range(rng, -half + 10, half - 10);
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.7), benchMat);
    bench.position.set(d, 0.45, s + CITY.road / 2 + 1.2);
    group.add(bench);
  }
  for (let i = 0; i < 14; i += 1) {
    const s = pick(rng, streets);
    const d = range(rng, -half + 10, half - 10);
    const hydrant = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.9, 6), hydrantMat);
    hydrant.position.set(d, 0.45, s - CITY.road / 2 - 1.2);
    group.add(hydrant);
  }

  // --- stashes (cash / health / ammo pickups) --------------------------------
  const stashDefs = [
    { kind: 'cash', color: 0x2aff66 },
    { kind: 'health', color: 0xff4d6a },
    { kind: 'ammo', color: 0xffc21a },
  ];
  const stashGeo = new THREE.BoxGeometry(1.1, 1.1, 1.1);
  for (let i = 0; i < 9; i += 1) {
    const def = stashDefs[i % 3];
    const pos = randomStreetPos(rng, streets);
    const mat = new THREE.MeshBasicMaterial({ color: def.color });
    const mesh = new THREE.Mesh(stashGeo, mat);
    mesh.position.set(pos.x, 0.8, pos.z);
    group.add(mesh);
    stashes.push({ kind: def.kind, pos: new THREE.Vector3(pos.x, 0, pos.z), mesh, taken: false, timer: 0 });
  }

  // --- lights and sky ---------------------------------------------------------
  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x3a3230, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(COLORS.sunDay, 1.6);
  sun.position.set(80, 140, 40);
  scene.add(sun);
  scene.background = new THREE.Color(COLORS.skyDay);
  scene.fog = new THREE.Fog(COLORS.skyDay, 220, 520);

  let lightPhase = 0; // seconds into the 24s traffic-light cycle
  const CYCLE = 24;

  function isOnRoad(x, z) {
    for (const s of streets) {
      if (Math.abs(x - s) <= CITY.road / 2 || Math.abs(z - s) <= CITY.road / 2) return true;
    }
    return false;
  }

  function nearestStreetCoord(v) {
    let best = streets[0];
    for (const s of streets) if (Math.abs(v - s) < Math.abs(v - best)) best = s;
    return best;
  }

  function randomStreetPos(r, streetList) {
    const list = streetList || streets;
    if (chance(r, 0.5)) {
      return { x: range(r, -half + 10, half - 10), z: pick(r, list) + range(r, -3, 3) };
    }
    return { x: pick(r, list) + range(r, -3, 3), z: range(r, -half + 10, half - 10) };
  }

  function collides(x, z, radius) {
    for (const c of colliders) {
      if (x + radius > c.minX && x - radius < c.maxX && z + radius > c.minZ && z - radius < c.maxZ) return c;
    }
    return null;
  }

  function resolveCircle(pos, radius) {
    const c = collides(pos.x, pos.z, radius);
    if (!c) return;
    const pushLeft = pos.x + radius - c.minX;
    const pushRight = c.maxX - (pos.x - radius);
    const pushUp = pos.z + radius - c.minZ;
    const pushDown = c.maxZ - (pos.z - radius);
    const min = Math.min(pushLeft, pushRight, pushUp, pushDown);
    if (min === pushLeft) pos.x = c.minX - radius;
    else if (min === pushRight) pos.x = c.maxX + radius;
    else if (min === pushUp) pos.z = c.minZ - radius;
    else pos.z = c.maxZ + radius;
  }

  /** Green axis right now: 'ns' (z roads) or 'ew' (x roads). Yellow lasts 2s at each switch. */
  function lightState(axis) {
    const t = lightPhase % CYCLE;
    const nsGreen = t < 10;
    const nsYellow = t >= 10 && t < 12;
    const ewGreen = t >= 12 && t < 22;
    if (axis === 'ns') return nsGreen ? 'green' : nsYellow ? 'yellow' : 'red';
    return ewGreen ? 'green' : t >= 22 ? 'yellow' : 'red';
  }

  function update(dt, hour) {
    lightPhase += dt;
    // traffic light bulbs
    const ns = lightState('ns');
    const ew = lightState('ew');
    for (const light of trafficLights) {
      const state = light.axis === 'ns' ? ns : ew;
      light.bulbs[0].material = state === 'red' ? lightMats.red : lightMats.off;
      light.bulbs[1].material = state === 'yellow' ? lightMats.yellow : lightMats.off;
      light.bulbs[2].material = state === 'green' ? lightMats.green : lightMats.off;
    }
    // day / night
    const night = hour >= DAY.nightStart || hour < DAY.nightEnd;
    const dusk = (hour >= 17.5 && hour < DAY.nightStart) || (hour >= DAY.nightEnd && hour < 7.5);
    const sky = night ? COLORS.skyNight : dusk ? COLORS.skyDusk : COLORS.skyDay;
    scene.background.setHex(sky);
    scene.fog.color.setHex(sky);
    const sunAngle = ((hour - 6) / 12) * Math.PI;
    sun.position.set(Math.cos(sunAngle) * 160, Math.max(20, Math.sin(sunAngle) * 160), 60);
    sun.intensity = night ? 0.25 : dusk ? 0.9 : 1.6;
    sun.color.setHex(night ? COLORS.sunNight : COLORS.sunDay);
    hemi.intensity = night ? 0.35 : 0.9;
    for (const lamp of lamps) lamp.material.color.setHex(night || dusk ? 0xffe9a8 : 0x555044);
    // stashes bob and respawn
    for (const stash of stashes) {
      if (stash.taken) {
        stash.timer -= dt;
        if (stash.timer <= 0) {
          stash.taken = false;
          stash.mesh.visible = true;
        }
      } else {
        stash.mesh.rotation.y += dt * 1.5;
        stash.mesh.position.y = 0.8 + Math.sin(performance.now() / 400 + stash.pos.x) * 0.15;
      }
    }
  }

  return {
    group,
    half: CITY.half,
    span: CITY.span,
    colliders,
    streets,
    trafficLights,
    stashes,
    safehouses,
    pitstop,
    isOnRoad,
    nearestStreetCoord,
    randomStreetPos,
    collides,
    resolveCircle,
    lightState,
    update,
  };
}
