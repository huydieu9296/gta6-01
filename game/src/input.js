// Keyboard + mouse input for Solmar Heat. Held keys are read every frame; one-shot
// presses (interact, shoot, reload, phone, pause) are queued as flags and taken once.
export const ACT = {
  INTERACT: 1, // E
  SHOOT: 2, // F or mouse click
  RELOAD: 4, // R
  PHONE: 8, // M
  PAUSE: 16, // P or Escape
  HORN: 32, // H
};

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run',
  Space: 'jump',
  KeyE: 'interact',
  KeyF: 'shoot',
  KeyR: 'reload',
  KeyM: 'phone',
  KeyP: 'pause', Escape: 'pause',
  KeyH: 'horn',
};

export function createInput(canvas) {
  const held = { up: false, down: false, left: false, right: false, run: false, jump: false };
  let actions = 0;
  // Mouse-drag camera orbit: accumulated deltas, consumed by the camera each frame.
  let dragX = 0, dragY = 0, dragging = false, lastX = 0, lastY = 0;
  // A click only counts as a shot when the pointer barely moved: ending a camera
  // drag must not fire the shotgun.
  let downX = 0, downY = 0, moved = 0;

  window.addEventListener('keydown', (e) => {
    const name = KEYMAP[e.code];
    if (!name) return;
    if (name === 'interact' && !e.repeat) actions |= ACT.INTERACT;
    else if (name === 'shoot' && !e.repeat) actions |= ACT.SHOOT;
    else if (name === 'reload' && !e.repeat) actions |= ACT.RELOAD;
    else if (name === 'phone' && !e.repeat) actions |= ACT.PHONE;
    else if (name === 'pause' && !e.repeat) actions |= ACT.PAUSE;
    else if (name === 'horn' && !e.repeat) actions |= ACT.HORN;
    else if (held[name] !== undefined) held[name] = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    const name = KEYMAP[e.code];
    if (name && held[name] !== undefined) held[name] = false;
  });
  window.addEventListener('blur', () => {
    for (const k of Object.keys(held)) held[k] = false;
    dragging = false;
  });
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    downX = e.clientX; downY = e.clientY; moved = 0;
  });
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    dragX += e.clientX - lastX; dragY += e.clientY - lastY;
    moved = Math.max(moved, Math.hypot(e.clientX - downX, e.clientY - downY));
    lastX = e.clientX; lastY = e.clientY;
  });
  window.addEventListener('pointerup', () => { dragging = false; });
  canvas.addEventListener('click', () => { if (moved < 8) actions |= ACT.SHOOT; });

  return {
    held,
    takeActions() { const a = actions; actions = 0; return a; },
    takeDrag() { const d = { x: dragX, y: dragY }; dragX = 0; dragY = 0; return d; },
    // -1..1 steering / throttle axes for driving and walking.
    axes() {
      return {
        fwd: (held.up ? 1 : 0) - (held.down ? 1 : 0),
        strafe: (held.right ? 1 : 0) - (held.left ? 1 : 0),
      };
    },
  };
}
