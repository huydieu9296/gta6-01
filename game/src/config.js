// Solmar Heat — every tuning number lives here, so the whole game can be
// balanced from one file. All distances are metres, all speeds m/s.
export const CITY = {
  blocks: 7, // blocks per side of the grid
  block: 44, // building block edge
  road: 12, // road width
  get pitch() { return this.block + this.road; },
  get span() { return this.blocks * this.pitch; }, // 392 m across
  get half() { return this.span / 2; }, // city runs -half .. +half
};

export const PLAYER = {
  walkSpeed: 6,
  runSpeed: 9.5,
  accel: 40,
  jumpSpeed: 8,
  gravity: 22,
  radius: 0.6,
  height: 1.8,
  maxHealth: 100,
  punchDamage: 18,
  punchRange: 2.2,
  punchCooldown: 0.45,
  shotgunDamage: 55,
  shotgunRange: 26,
  shotgunCooldown: 0.9,
  shotgunSpread: 0.06,
  startAmmo: 12,
  maxAmmo: 60,
};

export const CAR = {
  accel: 16,
  brake: 30,
  reverseMax: 12,
  maxSpeed: 36,
  sportsMaxSpeed: 46,
  turnRate: 1.9, // rad/s at full lock, scaled by speed
  grip: 6, // lateral damping
  enterRadius: 3.2,
  damagePerHit: 8,
  maxDamage: 100,
  repairRate: 25, // damage points per second at the pit stop
  repairCostPerPoint: 2,
};

export const TRAFFIC = {
  count: 14,
  speed: 10, // city traffic cruises a little faster than a running Rook
  minGap: 7,
  spawnMargin: 20,
};

export const PEDS = {
  count: 22,
  walkSpeed: 1.6,
  fleeSpeed: 4.5,
  witnessRadius: 22,
  witnessCooldown: 6,
};

export const WANTED = {
  thresholds: [0, 15, 30, 50, 70, 90], // heat needed for stars 0..5
  decayPerSec: 1.4,
  decayDelay: 4, // seconds after last crime before decay starts
  stealCar: 12,
  shoot: 8,
  hitPed: 15,
  hitPolice: 25,
  killPed: 30,
  maxPoliceCars: [0, 1, 2, 3, 4, 5],
  maxOfficers: [0, 1, 2, 3, 4, 6],
  bustedHoldSec: 1.2,
  bustedCashLoss: 0.2,
};

export const MONEY = {
  start: 250,
  courier: [220, 380],
  taxi: [120, 220],
  taxiTip: 60,
  story: [300, 450, 800, 1500],
  safehousePrice: 1500,
  stashCash: [40, 120],
  stashHealth: 30,
  stashAmmo: 8,
};

export const DAY = {
  lengthSec: 480, // one full day/night cycle
  startHour: 9.5, // morning
  nightStart: 19,
  nightEnd: 6.5,
};

export const COLORS = {
  skyDay: 0x87b5e0,
  skyDusk: 0xe08a5a,
  skyNight: 0x0b1026,
  sunDay: 0xfff2d0,
  sunNight: 0x8fa3ff,
  road: 0x2e3138,
  sidewalk: 0x8a8d94,
  sand: 0xd9c08a,
  water: 0x2a6f8f,
  grass: 0x4d7a45,
  buildingPalette: [0x9a8f80, 0x7d8aa0, 0xa08a7d, 0x8a9a80, 0xb0a090, 0x6d7d8c],
  windowLit: 0xffd27a,
  windowDark: 0x2a3444,
  carPalette: [0xc23b2e, 0x2e6fc2, 0xe0a92e, 0x3aa655, 0x8a8d94, 0x222226, 0xe8e8e8, 0x7a3ec2],
  policeCar: 0x1a1d24,
  policeLight: 0x2244ff,
  taxiYellow: 0xf2c200,
  marker: 0xffe14d,
  safehouse: 0x3ec26a,
  pitstop: 0xff7a2e,
};

export const KEYS = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  run: 'ShiftLeft',
  jump: 'Space',
  attack: 'Mouse0',
  interact: 'KeyE',
  weapon1: 'Digit1',
  weapon2: 'Digit2',
  pause: 'KeyP',
  mute: 'KeyM',
  handbrake: 'Space',
};
