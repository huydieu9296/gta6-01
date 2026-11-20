// Solmar Heat — keyboard + mouse state. WASD moves, mouse steers the camera
// (pointer lock when available, click-drag as a fallback), and every action key
// reports a one-frame "just pressed" edge so menus and prompts feel instant.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.dragging = false;
    this.locked = false;
    this.enabled = true;
    this._onKeyDown = (event) => {
      if (!this.enabled) return;
      if (event.code === 'Space') event.preventDefault();
      if (!this.keys.has(event.code)) this.pressed.add(event.code);
      this.keys.add(event.code);
    };
    this._onKeyUp = (event) => {
      this.keys.delete(event.code);
    };
    this._onMouseDown = (event) => {
      if (!this.enabled) return;
      this.mouseDown = true;
      if (event.button === 0) this.pressed.add('Mouse0');
      if (this.canvas.requestPointerLock && !this.locked) {
        try { this.canvas.requestPointerLock(); } catch { /* drag fallback */ }
      }
    };
    this._onMouseUp = () => {
      this.mouseDown = false;
      this.dragging = false;
    };
    this._onMouseMove = (event) => {
      if (!this.enabled) return;
      if (this.locked) {
        this.mouseDX += event.movementX || 0;
        this.mouseDY += event.movementY || 0;
      } else if (this.mouseDown) {
        this.dragging = true;
        this.mouseDX += event.movementX || 0;
        this.mouseDY += event.movementY || 0;
      }
    };
    this._onLockChange = () => {
      this.locked = document.pointerLockElement === this.canvas;
    };
    this._onBlur = () => {
      // alt-tab must never leave a key or a "just pressed" edge stuck on
      this.keys.clear();
      this.pressed.clear();
      this.mouseDX = 0;
      this.mouseDY = 0;
      this.mouseDown = false;
    };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    canvas.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('pointerlockchange', this._onLockChange);
  }

  isDown(code) {
    return this.keys.has(code);
  }

  /** True only on the frame the key went down (consumed by endFrame). */
  wasPressed(code) {
    return this.pressed.has(code);
  }

  /** Mouse look delta since last frame, then cleared by endFrame. */
  takeMouse() {
    const dx = this.mouseDX;
    const dy = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx, dy };
  }

  endFrame() {
    this.pressed.clear();
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    this.canvas.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('pointerlockchange', this._onLockChange);
  }
}
