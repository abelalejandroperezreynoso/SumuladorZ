import { RUN_THRESHOLD } from './touch.js';

// Teclado + ratón con bloqueo de puntero (y joystick táctil en móviles).
export class Input {
  constructor(element) {
    this.element = element;
    this.keys = new Set();
    this.pressed = new Set(); // teclas/botones pulsados en este frame
    this.buttons = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.touchMode = false; // se activa al primer toque (ver touch.js)
    this.started = false;
    this.stick = { x: 0, y: 0 }; // joystick táctil
    this.auto = null; // movimiento dictado por el piloto automático ({ x, z, run })

    addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.buttons.clear(); });

    addEventListener('mousemove', (e) => {
      if (!this.locked || this.touchMode) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    addEventListener('mousedown', (e) => {
      if (!this.locked || this.touchMode) return;
      this.buttons.add(e.button);
      this.pressed.add('Mouse' + e.button);
    });
    addEventListener('mouseup', (e) => this.buttons.delete(e.button));
    addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get locked() {
    if (this.touchMode) return this.started;
    return document.pointerLockElement === this.element;
  }

  lock() {
    if (this.touchMode) this.started = true;
    else this.element.requestPointerLock?.();
  }

  /** Movimiento deseado: x (derecha), z (adelante) en [-1, 1] y si se quiere correr. */
  move() {
    if (this.auto) return this.auto;
    const sx = this.stick.x, sy = this.stick.y;
    if (Math.hypot(sx, sy) > 0.15) {
      return { x: sx, z: sy, run: Math.hypot(sx, sy) > RUN_THRESHOLD };
    }
    return {
      x: (this.down('KeyD') ? 1 : 0) - (this.down('KeyA') ? 1 : 0),
      z: (this.down('KeyW') ? 1 : 0) - (this.down('KeyS') ? 1 : 0),
      run: this.down('ShiftLeft') || this.down('ShiftRight'),
    };
  }

  down(code) { return this.keys.has(code); }
  justPressed(code) { return this.pressed.has(code); }
  mouseDown(button) { return this.buttons.has(button); }

  // Llamar al final de cada frame.
  endFrame() {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }
}
