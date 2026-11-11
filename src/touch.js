// Controles táctiles: joystick a la izquierda, arrastrar a la derecha para la cámara
// y botones de acción. Se activan solos al primer toque en pantalla.
const LOOK_SCALE = 2.4; // píxeles de ratón equivalentes por píxel de dedo
const STICK_RADIUS = 56;
const RUN_THRESHOLD = 0.8; // empujar el joystick casi hasta el borde = correr

export function setupTouch(input) {
  const ui = document.createElement('div');
  ui.id = 'touch-ui';
  ui.innerHTML = `
    <div id="stick"><div id="stick-knob"></div></div>
    <button id="t-reset" data-key="KeyR">↺</button>
    <button id="t-jump" data-key="Space">Saltar</button>
    <button id="t-punch" data-key="KeyF">Golpe</button>
    <button id="t-fire">Disparo</button>`;
  document.body.append(ui);
  const stick = ui.querySelector('#stick');
  const knob = ui.querySelector('#stick-knob');
  const fire = ui.querySelector('#t-fire');

  let stickTouch = null; // { id, x, y }
  const lookTouches = new Map(); // id -> { x, y }
  let fireId = null;

  const releaseStick = () => {
    stickTouch = null;
    input.stick.x = input.stick.y = 0;
    stick.classList.remove('active');
    knob.style.transform = '';
  };

  addEventListener('touchstart', (e) => {
    if (!input.touchMode) {
      input.touchMode = true;
      document.body.classList.add('touch');
    }
    if (!input.locked) return; // el toque sobre la pantalla de inicio lo gestiona el clic
    e.preventDefault();
    for (const t of e.changedTouches) {
      const button = t.target.closest?.('#touch-ui button');
      if (button?.dataset.key) {
        input.pressed.add(button.dataset.key);
      } else if (button === fire) {
        fireId = t.identifier;
        input.buttons.add(0);
        fire.classList.add('held');
        lookTouches.set(t.identifier, { x: t.clientX, y: t.clientY }); // se puede apuntar mientras se dispara
      } else if (!stickTouch && t.clientX < innerWidth * 0.42) {
        stickTouch = { id: t.identifier, x: t.clientX, y: t.clientY };
        stick.style.left = t.clientX + 'px';
        stick.style.top = t.clientY + 'px';
        knob.style.transform = '';
        stick.classList.add('active');
      } else {
        lookTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
      }
    }
  }, { passive: false });

  addEventListener('touchmove', (e) => {
    if (!input.locked) return;
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (stickTouch?.id === t.identifier) {
        let dx = t.clientX - stickTouch.x, dy = t.clientY - stickTouch.y;
        const len = Math.hypot(dx, dy);
        if (len > STICK_RADIUS) { dx *= STICK_RADIUS / len; dy *= STICK_RADIUS / len; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        input.stick.x = dx / STICK_RADIUS;
        input.stick.y = -dy / STICK_RADIUS; // arriba = avanzar
      }
      const look = lookTouches.get(t.identifier);
      if (look) {
        input.mouseDX += (t.clientX - look.x) * LOOK_SCALE;
        input.mouseDY += (t.clientY - look.y) * LOOK_SCALE;
        look.x = t.clientX;
        look.y = t.clientY;
      }
    }
  }, { passive: false });

  const end = (e) => {
    for (const t of e.changedTouches) {
      if (stickTouch?.id === t.identifier) releaseStick();
      lookTouches.delete(t.identifier);
      if (fireId === t.identifier) {
        fireId = null;
        input.buttons.delete(0);
        fire.classList.remove('held');
      }
    }
  };
  addEventListener('touchend', end);
  addEventListener('touchcancel', end);
}

export { RUN_THRESHOLD };
