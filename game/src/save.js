// Save / load for Solmar Heat (localStorage, this browser only).
import { SAVE_KEY, MONEY, TIME } from './config.js';

export function defaultSave() {
  return {
    cash: MONEY.start,
    health: 100,
    ammo: 24,
    storyDone: 0, // story missions completed (0..4)
    safehouses: ['apartment'], // owned safehouse ids
    timeOfDay: TIME.start,
    pos: { x: 0, z: 44 },
    bestCash: MONEY.start,
  };
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.cash !== 'number') return null;
    return { ...defaultSave(), ...data };
  } catch { return null; }
}

export function writeSave(state) {
  try {
    const data = {
      cash: Math.round(state.cash),
      health: Math.round(state.health),
      ammo: state.ammo,
      storyDone: state.storyDone,
      safehouses: state.safehouses.slice(),
      timeOfDay: state.timeOfDay,
      pos: { x: Math.round(state.playerX * 10) / 10, z: Math.round(state.playerZ * 10) / 10 },
      bestCash: Math.max(state.bestCash || 0, Math.round(state.cash)),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch { return false; }
}

export function clearSave() {
  try { window.localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}
