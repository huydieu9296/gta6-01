// Screenshot scenes behind ?shot=chase|street|mission|police. Each poses the real game
// (player, traffic, police, mission marker, time of day, weather) so the frame is what
// the game genuinely looks like, and the same seed always gives the same frame.
// stageShot sets the scene up; shotCamera frames it AFTER the settle steps, from the
// live car position — the camera sits ahead of the car, looking back, so the car, the
// road ahead and anything chasing it are all in frame. All shot cars drive on real
// streets (streets run at x/z = ±22, ±66, ±110, ±154); a car placed inside a block
// would crash into buildings and stop.

export const SHOT_NAMES = ['chase', 'street', 'mission', 'police'];

function carOnStreet(world, x, z, yaw, speed) {
  const car = world.vehicles.parked[0];
  const i = world.vehicles.parked.indexOf(car);
  if (i >= 0) world.vehicles.parked.splice(i, 1);
  car.mesh.position.set(x, 0, z);
  car.yaw = yaw;
  car.speed = speed;
  world.enterCar(car);
  return car;
}

export function stageShot(world, name, seed) {
  const { player, vehicles, police, missions } = world;
  const st = player.state;
  if (name === 'chase') {
    // Golden-hour getaway: Rook in a sports car eastbound on -22nd, Solmar PD closing in.
    world.setTimeOfDay(17.0);
    world.setWeather(false);
    const car = world.vehicles.parked.find((c) => c.sports) || world.vehicles.parked[0];
    const i = world.vehicles.parked.indexOf(car);
    if (i >= 0) world.vehicles.parked.splice(i, 1);
    car.mesh.position.set(-66, 0, -22);
    car.yaw = Math.PI / 2; // heading +x along the street
    car.speed = 24;
    world.enterCar(car);
    police.setHeat(55);
    police.step(0.01, -66, -22, true, 24);
    police.step(0.01, -66, -22, true, 24);
    st.camYaw = Math.PI / 2;
    return;
  }
  if (name === 'street') {
    // Midday on foot at a busy intersection: traffic, pedestrians, sun.
    world.setTimeOfDay(12.0);
    world.setWeather(false);
    player.reset(-22, 22, 100, 24);
    st.camYaw = Math.PI * 0.75;
    st.yaw = Math.PI * 0.75;
    return;
  }
  if (name === 'mission') {
    // Dusk courier run: Rook picks up Mara's package at the port gate (132,154 —
    // on the street, 4 units from the pickup, so the run starts the moment the
    // scene settles) and drives west down 154th to the drop-off.
    world.setTimeOfDay(18.6);
    world.setWeather(false);
    carOnStreet(world, 132, 154, -Math.PI / 2, 18); // heading -x along the street
    missions.startStory(0);
    st.camYaw = -Math.PI / 2;
    return;
  }
  // police: night roadblock in the rain — wanted level four, no way through.
  world.setTimeOfDay(21.5);
  world.setWeather(true);
  carOnStreet(world, -66, 22, Math.PI / 2, 14); // heading +x along the street
  police.setHeat(78);
  police.step(0.01, -66, 22, true, 14);
  police.step(0.01, -66, 22, true, 14);
  st.camYaw = Math.PI / 2;
}

// Camera for the shot, from the live game state after the settle steps.
export function shotCamera(world, name) {
  const { player } = world;
  const st = player.state;
  if (name === 'street') {
    return { pos: [-44, 9, 44], look: [-14, 1, 14] };
  }
  // Driving shots: camera ahead of the car, high enough that traffic ahead of the
  // player cannot fill the frame, looking back at it.
  const car = world.player.state.inCar;
  if (car) {
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    const cx = car.mesh.position.x, cz = car.mesh.position.z;
    return {
      pos: [cx + fx * 38, 15, cz + fz * 38],
      look: [cx + fx * 6, 1.5, cz + fz * 6],
    };
  }
  return { pos: [st.x - 20, 9, st.z - 20], look: [st.x, 1.5, st.z] };
}

export function shotInfo(name) {
  return {
    chase: 'Golden-hour chase — Rook in a sports car, Solmar PD closing in.',
    street: 'Midday on foot in downtown Solmar — traffic, pedestrians, sun.',
    mission: 'Dusk courier run for Mara — beacon lit, drop-off ahead.',
    police: 'Night roadblock in the rain — wanted level four, no way through.',
  }[name] || 'Solmar Heat';
}
