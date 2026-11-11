// Teclado + ratón con bloqueo de puntero.
export class Input {
  constructor(element) {
    this.element = element;
    this.keys = new Set();
    this.pressed = new Set(); // teclas/botones pulsados en este frame
    this.buttons = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;

    addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.buttons.clear(); });

    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      this.buttons.add(e.button);
      this.pressed.add('Mouse' + e.button);
    });
    addEventListener('mouseup', (e) => this.buttons.delete(e.button));
    addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get locked() {
    return document.pointerLockElement === this.element;
  }

  lock() {
    this.element.requestPointerLock?.();
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
