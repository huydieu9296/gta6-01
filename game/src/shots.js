// Solmar Heat — screenshot scenes behind ?shot=chase|street|mission|police.
// Each scene resets the world from the seed, poses Rook, cars and police
// where the shot needs them, then plays the real systems forward a fixed
// number of steps, so the frame is a genuine moment of the game and the same
// seed always gives the same frame.
const STEP = 1 / 30;

export function stageShot(name, game) {
  game.resetWorld(7);
  game.shotMode = true;
  const s = game.state;
  const p = game.player;

  if (name === 'chase') {
    s.hour = 14;
    s.weather = 'clear';
    // Rook in a sports car tearing down the main avenue, two police cars behind
    const car = game.spawnPlayerCar('sports', -28, -40, Math.PI);
    game.enterCar(car, false);
    car.speed = 30;
    game.spawnTrafficNear(3, 60);
    for (let i = 0; i < 45; i += 1) game.update(STEP, { forward: true });
    // heat only NOW: during the drive updatePolice would have spawned random
    // pursuit cars and then trimmed the array from the end — removing the two
    // staged cars. Setting it here keeps the staged pair and adds one more.
    s.heat = 55; // three stars
    game.spawnPoliceBehind(2, 8, 20);
    for (let i = 0; i < 6; i += 1) game.update(STEP, {});
    // camera ahead of the car, looking back at it — the police cars behind
    // Rook stay in frame, so the shot reads as a chase
    game.setShotCamera(
      { x: p.pos.x + 7, y: 4.5, z: p.pos.z - 20 },
      { x: p.pos.x, y: 1.5, z: p.pos.z + 10 },
    );
    return { scene: 'chase' };
  }

  if (name === 'mission') {
    s.hour = 18.4;
    s.weather = 'clear';
    // Rook on foot at a courier pickup, beacon lit, a taxi waiting nearby
    const marker = game.startSideCourier();
    game.placePlayerAt(marker.pickup.x + 3, marker.pickup.z + 4, 0.4);
    game.spawnTaxiNear(marker.pickup, 8);
    game.spawnTrafficNear(2, 40);
    for (let i = 0; i < 30; i += 1) game.update(STEP, {});
    game.setShotCamera(
      { x: marker.pickup.x - 10, y: 6, z: marker.pickup.z - 12 },
      { x: marker.pickup.x, y: 1.5, z: marker.pickup.z },
    );
    return { scene: 'mission' };
  }

  if (name === 'police') {
    s.hour = 21.5;
    s.weather = 'rain';
    s.heat = 55; // three stars
    game.placePlayerAt(0, 28, Math.PI);
    game.spawnPoliceAround(3, 2, 25);
    game.spawnTrafficNear(2, 50);
    for (let i = 0; i < 45; i += 1) game.update(STEP, {});
    game.setShotCamera({ x: -9, y: 5.5, z: 14 }, { x: 0, y: 1.5, z: 28 });
    return { scene: 'police' };
  }

  // street (default): Rook walking a busy downtown crossing in the morning
  s.hour = 10;
  s.weather = 'clear';
  game.placePlayerAt(24, 28, -0.6);
  game.spawnTrafficNear(4, 45);
  for (let i = 0; i < 30; i += 1) game.update(STEP, { forward: true });
  game.setShotCamera(
    { x: p.pos.x - 9, y: 4.5, z: p.pos.z - 10 },
    { x: p.pos.x, y: 1.5, z: p.pos.z + 2 },
  );
  return { scene: 'street' };
}
