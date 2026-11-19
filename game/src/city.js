// Solmar — the procedural coastal city: streets, blocks, buildings, lights, beach,
// port, safehouses and props. Also owns the sun/moon, sky and rain.
import * as THREE from 'three';
import { CITY, COLORS, BUILDING } from './config.js';
import { clamp, lerp, makeRng } from './rng.js';

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Facade with lit and dark windows; reused as map and emissiveMap.
function facadeTexture(base, litRatio, rng) {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const cols = 6, rows = 12, cw = w / cols, ch = h / rows;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const lit = rng.next() < litRatio;
        g.fillStyle = lit ? '#ffd98a' : '#1d2733';
        g.fillRect(x * cw + 3, y * ch + 4, cw - 6, ch - 8);
      }
    }
  });
}

function roadTexture() {
  const t = canvasTexture(64, 256, (g, w, h) => {
    g.fillStyle = '#2e3138'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d8d8c8';
    g.fillRect(2, 0, 2, h); g.fillRect(w - 4, 0, 2, h);
    g.fillStyle = '#e8c85a';
    for (let y = 0; y < h; y += 64) g.fillRect(w / 2 - 2, y + 8, 4, 32);
  });
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function createCity(scene, seed) {
  const rng = makeRng(seed);
  const colliders = [];
  const group = new THREE.Group();
  scene.add(group);
  const S = CITY.streets;
  const span = S[S.length - 1] - S[0] + CITY.roadHalf * 2 + 8; // ~360

  // Ground, sand, sea.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(span + 180, span + 40),
    new THREE.MeshLambertMaterial({ color: 0x55684a }),
  );
  ground.rotation.x = -Math.PI / 2; ground.position.set(-30, -0.1, 0);
  group.add(ground);
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(36, span + 40),
    new THREE.MeshLambertMaterial({ color: COLORS.sand }),
  );
  sand.rotation.x = -Math.PI / 2; sand.position.set(CITY.beachX - 18 + 12, 0.02, 0);
  group.add(sand);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(90, span + 40),
    new THREE.MeshLambertMaterial({ color: COLORS.sea, transparent: true, opacity: 0.92 }),
  );
  sea.rotation.x = -Math.PI / 2; sea.position.set(CITY.seaX - 45, 0.05, 0);
  group.add(sea);

  // Roads + sidewalks.
  const roadTex = roadTexture();
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
  const walkMat = new THREE.MeshLambertMaterial({ color: COLORS.sidewalk });
  for (const s of S) {
    for (const horizontal of [false, true]) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(12, span), roadMat.clone());
      road.material.map = roadTex.clone();
      road.material.map.repeat.set(1, span / 16);
      road.material.map.needsUpdate = true;
      road.rotation.x = -Math.PI / 2;
      if (horizontal) road.rotation.z = Math.PI / 2;
      road.position.set(horizontal ? 0 : s, 0.01, horizontal ? s : 0);
      group.add(road);
      for (const side of [-1, 1]) {
        const walk = new THREE.Mesh(new THREE.PlaneGeometry(3, span), walkMat);
        walk.rotation.x = -Math.PI / 2;
        if (horizontal) walk.rotation.z = Math.PI / 2;
        walk.position.set(horizontal ? 0 : s + side * 7.5, 0.06, horizontal ? s + side * 7.5 : 0);
        group.add(walk);
      }
    }
  }

  // Buildings: one or two per block, taller downtown, windows lit at night.
  const facades = [
    facadeTexture('#5a6b7d', 0.35, rng),
    facadeTexture('#6d5a4a', 0.3, rng),
    facadeTexture('#4a5a6b', 0.42, rng),
  ];
  const mats = facades.map((t) => new THREE.MeshLambertMaterial({
    map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0,
  }));
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x3a3f47 });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const downtown = (x, z) => Math.abs(x) < 70 && Math.abs(z) < 70;
  const blocks = [];
  for (let i = 0; i < S.length - 1; i++) {
    for (let j = 0; j < S.length - 1; j++) {
      const cx = (S[i] + S[i + 1]) / 2, cz = (S[j] + S[j + 1]) / 2;
      blocks.push({ x: cx, z: cz });
    }
  }
  for (const b of blocks) {
    const n = rng.chance(0.45) ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const w = rng.range(9, 18), d = rng.range(9, 18);
      const ox = n === 2 ? (k === 0 ? -6 : 6) : 0;
      const oz = n === 2 ? (k === 0 ? -6 : 6) : 0;
      const h = downtown(b.x, b.z)
        ? rng.range(BUILDING.minH + 14, BUILDING.downtownH)
        : rng.range(BUILDING.minH, BUILDING.maxH);
      const m = new THREE.Mesh(boxGeo, mats[rng.int(0, 2)]);
      m.scale.set(w, h, d);
      m.position.set(b.x + ox, h / 2, b.z + oz);
      group.add(m);
      const roof = new THREE.Mesh(boxGeo, roofMat);
      roof.scale.set(w + 0.4, 0.5, d + 0.4);
      roof.position.set(b.x + ox, h + 0.25, b.z + oz);
      group.add(roof);
      colliders.push({
        minX: b.x + ox - w / 2, maxX: b.x + ox + w / 2,
        minZ: b.z + oz - d / 2, maxZ: b.z + oz + d / 2,
      });
    }
  }

  // Port containers, south-east corner.
  const contCols = [0xb8442e, 0x2e7ab8, 0x3a9e4d, 0xc8a02e];
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: contCols[i % 4] }));
    const x = 120 + (i % 5) * 13, z = 150 + Math.floor(i / 5) * 12;
    m.scale.set(11, 4, 5);
    m.position.set(x, 2, z);
    group.add(m);
    colliders.push({ minX: x - 5.5, maxX: x + 5.5, minZ: z - 2.5, maxZ: z + 2.5 });
  }

  // Streetlights at every other intersection corner.
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x22262c });
  const lampMat = new THREE.MeshLambertMaterial({ color: 0xfff2c8, emissive: 0xffe9a8, emissiveIntensity: 0 });
  const lampMeshes = [];
  for (let i = 0; i < S.length; i += 2) {
    for (let j = 0; j < S.length; j += 2) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 6), poleMat);
      pole.position.set(S[i] + 7.5, 3, S[j] + 7.5);
      group.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), lampMat);
      lamp.position.set(S[i] + 7.5, 6.1, S[j] + 7.5);
      group.add(lamp);
      lampMeshes.push(lamp);
    }
  }

  // Traffic lights: one per intersection, NS/EW cycle with a per-corner offset.
  const lightMatR = new THREE.MeshLambertMaterial({ color: 0x330000, emissive: 0xff2020, emissiveIntensity: 1 });
  const lightMatG = new THREE.MeshLambertMaterial({ color: 0x002200, emissive: 0x20ff40, emissiveIntensity: 1 });
  const lightMatY = new THREE.MeshLambertMaterial({ color: 0x332200, emissive: 0xffc020, emissiveIntensity: 1 });
  const lights = [];
  for (let i = 0; i < S.length; i++) {
    for (let j = 0; j < S.length; j++) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 5.4, 6), poleMat);
      pole.position.set(S[i] - 7.2, 2.7, S[j] - 7.2);
      group.add(pole);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.1, 0.5), poleMat);
      head.position.set(S[i] - 7.2, 5.6, S[j] - 7.2);
      group.add(head);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), lightMatR);
      lamp.position.set(S[i] - 7.2, 5.9, S[j] - 6.9);
      group.add(lamp);
      lights.push({ i, j, lamp, offset: (i + j) * 2.5 });
    }
  }
  function lightPhase(ix, iz, time) {
    const L = lights[ix * S.length + iz];
    const t = (time + L.offset) % 20;
    if (t < 8) return 'ns';
    if (t < 10) return 'nsY';
    if (t < 18) return 'ew';
    return 'ewY';
  }

  // Props: palms on the beach, benches and hydrants on sidewalks, trees in the park block.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2a });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e7a3a });
  for (let k = 0; k < 14; k++) {
    const x = -186 + rng.range(-6, 6), z = -160 + k * 24 + rng.range(-4, 4);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 7, 6), trunkMat);
    trunk.position.set(x, 3.5, z); group.add(trunk);
    const top = new THREE.Mesh(new THREE.ConeGeometry(3.2, 4.5, 7), leafMat);
    top.position.set(x, 8.5, z); group.add(top);
  }
  const benchMat = new THREE.MeshLambertMaterial({ color: 0x7a5a34 });
  for (let k = 0; k < 16; k++) {
    const s = S[rng.int(0, S.length - 1)];
    const along = rng.range(-150, 150);
    const bench = new THREE.Mesh(boxGeo, benchMat);
    bench.scale.set(2.4, 0.5, 0.8);
    bench.position.set(rng.chance(0.5) ? s + 7.5 : along, 0.35, rng.chance(0.5) ? along : s + 7.5);
    group.add(bench);
  }

  // Safehouses: apartment (start), beach house, downtown loft.
  const safehouses = [
    { id: 'apartment', name: 'Rook\'s Apartment', x: 8, z: 44, price: 0 },
    { id: 'beach', name: 'Beach House', x: -160, z: 110, price: 1500 },
    { id: 'loft', name: 'Downtown Loft', x: 66, z: -22, price: 3000 },
  ];
  const shMat = new THREE.MeshLambertMaterial({ color: 0x22d3ee, emissive: 0x0e7490, emissiveIntensity: 0.9 });
  for (const sh of safehouses) {
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 14, 8),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.16 }));
    beacon.position.set(sh.x, 7, sh.z);
    group.add(beacon);
    const mark = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 1.4), shMat);
    mark.position.set(sh.x, 0.3, sh.z);
    group.add(mark);
  }

  // Rain: points in a box around the camera, wrapped as they fall.
  const rainCount = 900;
  const rainPos = new Float32Array(rainCount * 3);
  for (let i = 0; i < rainCount; i++) {
    rainPos[i * 3] = rng.range(-30, 30);
    rainPos[i * 3 + 1] = rng.range(0, 30);
    rainPos[i * 3 + 2] = rng.range(-30, 30);
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: 0xaac4e0, size: 0.18, transparent: true, opacity: 0.7 }));
  rain.visible = false;
  scene.add(rain);

  // Lights and sky.
  const sun = new THREE.DirectionalLight(COLORS.sunDay, 2.4);
  scene.add(sun);
  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x3a3f2a, 0.9);
  scene.add(hemi);
  scene.fog = new THREE.Fog(COLORS.fogDay, 120, 420);

  const skyDay = new THREE.Color(COLORS.skyDay);
  const skyDusk = new THREE.Color(COLORS.skyDusk);
  const skyNight = new THREE.Color(COLORS.skyNight);
  const tmpColor = new THREE.Color();

  let clock = 0;

  function update(dt, timeOfDay, raining, camPos) {
    clock += dt;
    // Sun: rises 06:00, sets 18:00.
    const ang = ((timeOfDay - 6) / 12) * Math.PI;
    const elev = Math.sin(ang);
    sun.position.set(Math.cos(ang) * 160, Math.max(8, elev * 160), 60);
    sun.intensity = clamp(elev * 2.6, 0, 2.6);
    sun.color.setHex(elev > 0.25 ? COLORS.sunDay : COLORS.sunNight);
    hemi.intensity = clamp(0.25 + elev * 0.8, 0.25, 1.0);
    if (elev > 0.35) tmpColor.copy(skyDay);
    else if (elev > 0) tmpColor.copy(skyDay).lerp(skyDusk, 1 - elev / 0.35);
    else tmpColor.copy(skyNight).lerp(skyDusk, clamp(1 + elev * 4, 0, 0.4));
    scene.background = tmpColor;
    scene.fog.color.copy(tmpColor);
    scene.fog.near = raining ? 60 : 120;
    scene.fog.far = raining ? 220 : 420;
    const night = clamp(1 - elev * 3, 0, 1);
    lampMat.emissiveIntensity = night * 1.6;
    for (const m of mats) m.emissiveIntensity = night * 0.55;
    // Traffic light colours follow the shared clock.
    for (const L of lights) {
      const ph = lightPhase(L.i, L.j, clock);
      L.lamp.material = (ph === 'nsY' || ph === 'ewY') ? lightMatY
        : (ph === 'ns' ? lightMatG : lightMatR);
    }
    // Rain follows the camera.
    rain.visible = raining;
    if (raining) {
      rain.position.set(camPos.x, 0, camPos.z);
      const p = rainGeo.attributes.position;
      for (let i = 0; i < rainCount; i++) {
        let y = p.getY(i) - 26 * dt;
        if (y < 0) y = 30;
        p.setY(i, y);
      }
      p.needsUpdate = true;
    }
  }

  return {
    group, colliders, safehouses, lights, lightPhase,
    get clock() { return clock; },
    update,
    // Push a circle out of every building/port collider it overlaps.
    resolveCircle(x, z, r) {
      let px = x, pz = z;
      for (const c of colliders) {
        const nx = clamp(px, c.minX, c.maxX), nz = clamp(pz, c.minZ, c.maxZ);
        const dx = px - nx, dz = pz - nz;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          if (d2 < 1e-6) { px = c.maxX + r; continue; }
          const d = Math.sqrt(d2);
          px = nx + (dx / d) * r;
          pz = nz + (dz / d) * r;
        }
      }
      return { x: px, z: pz };
    },
    isRoad(x, z) {
      for (const s of S) {
        if (Math.abs(x - s) < CITY.roadHalf + 1 || Math.abs(z - s) < CITY.roadHalf + 1) return true;
      }
      return false;
    },
    nearestStreet(v) {
      let best = S[0], bd = 1e9;
      for (const s of S) { const d = Math.abs(v - s); if (d < bd) { bd = d; best = s; } }
      return best;
    },
    streetIndex(v) {
      let best = 0, bd = 1e9;
      for (let i = 0; i < S.length; i++) { const d = Math.abs(v - S[i]); if (d < bd) { bd = d; best = i; } }
      return best;
    },
  };
}
