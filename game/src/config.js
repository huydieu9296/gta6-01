// Solmar Heat — every tuning number and colour in one place.
export const CITY = {
  pitch: 44, // distance between street centrelines
  streets: [-154, -110, -66, -22, 22, 66, 110, 154], // street centrelines, x and z
  roadHalf: 6, // half the road width
  lane: 3, // lane offset from centreline (right-hand traffic)
  blockHalf: 13, // half the buildable block width
  extent: 176, // playable half-extent; beach starts west of -176
  beachX: -196, // sand strip west edge
  seaX: -232, // sea plane west edge
};

export const PLAYER = {
  walk: 5.2,
  run: 9.5,
  accel: 42,
  jump: 8.5,
  radius: 0.7,
  height: 1.8,
  health: 100,
};

export const CAR = {
  accel: 16,
  brake: 34,
  reverseAccel: 10,
  maxSpeed: 36,
  sportsMax: 48,
  maxReverse: 11,
  steer: 0.62,
  wheelBase: 2.9,
  grip: 7.5,
  damage: 100, // hit points before it smokes and dies
};

export const WANTED = {
  steal: 25,
  shoot: 15, // one shotgun blast on a city street is a 1-star response
  hitPed: 20,
  hitCop: 30,
  killPed: 35,
  decay: 1.4, // heat lost per second while unseen
  stars: [0, 15, 35, 55, 75, 90], // heat thresholds for stars 0..5
};

export const MONEY = {
  start: 250,
  stashCash: 120,
  courier: 220,
  taxi: 160,
  repair: 80,
  safehouseBeach: 1500,
  safehouseLoft: 3000,
  bustedFine: 0.15, // fraction of cash lost when busted
};

export const TIME = {
  start: 10.0, // hours, 10:00 on a new game
  dayLength: 420, // real seconds per full 24h day
};

export const COLORS = {
  skyDay: 0x87b8e8,
  skyDusk: 0xe8965a,
  skyNight: 0x0b1226,
  fogDay: 0x9fc3e8,
  fogNight: 0x0b1226,
  sunDay: 0xfff2d8,
  sunNight: 0x8fa8ff,
  road: 0x2e3138,
  roadLine: 0xd8d8c8,
  sidewalk: 0x8a8d94,
  sand: 0xd9c28a,
  sea: 0x1e6f8e,
  grass: 0x4d7a3a,
  police: 0x1c4ed8,
};

export const PALETTE = {
  hudBg: 'rgba(10,14,22,0.72)',
  hudText: '#eef1f5',
  hudMuted: '#9aa3b2',
  hudGood: '#4ade80',
  hudBad: '#f87171',
  hudGold: '#f2c94c',
  hudBlue: '#60a5fa',
};

export const BUILDING = {
  minH: 8,
  maxH: 26,
  downtownH: 52,
};

export const SAVE_KEY = 'solmar-heat.save.v1';
