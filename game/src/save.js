// Solmar Heat — save games in localStorage: cash, health, position, story
// progress, owned safehouses and the clock. Nothing leaves the browser.
const KEY = 'solmar-heat-save-v1';
const SAVE_VERSION = 1;

export function saveGame(state) {
  try {
    const data = {
      version: SAVE_VERSION,
      cash: Math.floor(state.cash),
      health: Math.round(state.health),
      ammo: state.ammo,
      weapon: state.weapon,
      x: Math.round(state.playerPos.x * 10) / 10,
      z: Math.round(state.playerPos.z * 10) / 10,
      angle: Math.round(state.playerAngle * 100) / 100,
      hour: Math.round(state.hour * 100) / 100,
      storyIndex: state.storyIndex,
      missionsDone: state.missionsDone,
      earned: state.earned,
      safehouses: state.safehouses.map((s) => s.owned),
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== SAVE_VERSION) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch { /* private mode */ }
}

export function hasSave() {
  return loadGame() !== null;
}
