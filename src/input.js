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
    this.padMode = false; // se activa al pulsar algo en un mando
    this.padPrev = []; // botones del mando en el frame anterior
    this.padStick = { x: 0, y: 0 };
    this.padFire = false;
    this.padAim = false; // gatillo izquierdo del mando
    this.aimToggle = false; // botón táctil «Apuntar» (se alterna con un toque)
    this.onPadStart = null; // lo asigna main.js: arrancar desde la pantalla de inicio

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
    if (this.touchMode || this.padMode) return this.started;
    return document.pointerLockElement === this.element;
  }

  lock() {
    if (this.touchMode || this.padMode) this.started = true;
    else this.element.requestPointerLock?.();
  }

  /** Movimiento deseado: x (derecha), z (adelante) en [-1, 1] y si se quiere correr. */
  move() {
    if (this.auto) return this.auto;
    const px = this.padStick.x, py = this.padStick.y;
    if (Math.hypot(px, py) > 0.2) {
      return { x: px, z: py, run: Math.hypot(px, py) > RUN_THRESHOLD || this.padRun };
    }
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

  /**
   * Lee el mando (Xbox, PlayStation…) con la API Gamepad. Llamar al inicio de cada frame.
   * Distribución estándar: A saltar, X golpe, B cubrirse, Y correr rápido, LT apuntar, RT disparar,
   * LB/RB horda, Menú empezar, Vista reiniciar, stick izquierdo moverse (a fondo o pulsado
   * = correr), stick derecho cámara.
   */
  pollGamepad(dt) {
    const pads = navigator.getGamepads?.() ?? [];
    const pad = [...pads].find((p) => p && p.connected);
    if (!pad) { this.padStick.x = this.padStick.y = 0; this.padAim = false; this.releasePadFire(); return; }
    const btn = (i) => !!pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > 0.4);
    const now = pad.buttons.map((_, i) => btn(i));
    const prev = this.padPrev;
    const edge = (i) => now[i] && !prev[i];
    this.padPrev = now;

    // Cualquier uso del mando oculta los controles táctiles (touch.js los devuelve al tocar).
    if (now.some(Boolean) || pad.axes.some((v) => Math.abs(v) > 0.5)) {
      this.padMode = true;
      document.body.classList.add('gamepad');
    }
    if (!this.locked) {
      if (now.some((v, i) => v && edge(i))) this.onPadStart?.();
      return;
    }

    const dz = (v) => (Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85);
    const ax = pad.axes;
    this.padStick.x = dz(ax[0] ?? 0);
    this.padStick.y = -dz(ax[1] ?? 0);
    this.padRun = now[10];
    // Stick derecho: equivale a mover el ratón (curva cuadrática para apuntar fino).
    const lx = dz(ax[2] ?? 0), ly = dz(ax[3] ?? 0);
    const LOOK = 1100 * dt;
    this.mouseDX += Math.sign(lx) * lx * lx * LOOK;
    this.mouseDY += Math.sign(ly) * ly * ly * LOOK * 0.7;

    const map = { 0: 'Space', 2: 'KeyF', 1: 'KeyC', 3: 'KeyQ', 8: 'KeyR', 4: 'KeyH', 5: 'KeyH', 12: 'KeyP' };
    for (const i in map) if (edge(+i)) this.pressed.add(map[i]);

    this.padAim = now[6];
    const fire = now[7];
    if (fire) { this.buttons.add(0); this.padFire = true; } else this.releasePadFire();
  }

  releasePadFire() {
    if (this.padFire) { this.buttons.delete(0); this.padFire = false; }
  }

  down(code) { return this.keys.has(code); }
  justPressed(code) { return this.pressed.has(code); }
  mouseDown(button) { return this.buttons.has(button); }
  /** Apuntar sin disparar: clic derecho mantenido, LT del mando o el botón táctil. */
  aiming() { return this.buttons.has(2) || this.padAim || this.aimToggle; }

  // Llamar al final de cada frame.
  endFrame() {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }
}
