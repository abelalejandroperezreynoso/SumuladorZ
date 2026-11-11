import * as THREE from 'three';
import { initPhysics, Physics } from './physics.js';
import { buildWorld } from './world.js';
import { Input } from './input.js';
import { ThirdPersonCamera } from './camera.js';
import { Player } from './player.js';
import { Combat } from './combat.js';
import { Horde } from './horde.js';
import { Autopilot } from './autopilot.js';
import { setupTouch } from './touch.js';
import { setupPWA } from './pwa.js';

setupPWA();

const overlay = document.getElementById('overlay');
const overlayMsg = document.getElementById('overlay-msg');
const hordeBtn = document.getElementById('horde-btn');
const healthFill = document.getElementById('health-fill');
const hurt = document.getElementById('hurt');
const toast = document.getElementById('toast');

let toastTimer = 0;
function showToast(text) {
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

const status = (text) => window.__bootStatus?.(text);

async function start() {
  status('Iniciando gráficos…');
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  document.body.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 300);
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  status('Cargando físicas…');
  await initPhysics();
  const physics = new Physics(scene);
  const { sun } = buildWorld(scene, physics);
  status('Cargando personaje…');
  const player = await Player.load(scene, physics);
  const combat = new Combat(scene, physics);
  combat.player = player;
  const horde = new Horde(scene, physics, player.assets);
  horde.onWave = (n) => showToast(`Oleada ${n}`);
  const boneBtn = document.getElementById('bone-btn');
  const toggleSkeleton = () => boneBtn.classList.toggle('active', player.toggleSkeleton());
  boneBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    e.stopPropagation();
    input.pressed.add('KeyK');
  }, { passive: false });
  boneBtn.addEventListener('click', () => { toggleSkeleton(); boneBtn.blur(); });
  let shotsHeard = 0, hudKey = '', sprintShown = false;
  const toggleHorde = () => {
    if (horde.active) { horde.stop(); showToast('Horda detenida'); } else horde.start();
  };
  // En táctil el botón se pulsa directamente; con teclado se usa H.
  hordeBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    e.stopPropagation();
    input.pressed.add('KeyH');
  }, { passive: false });
  hordeBtn.addEventListener('click', () => { toggleHorde(); hordeBtn.blur(); });
  const input = new Input(renderer.domElement);
  const cam = new ThirdPersonCamera(camera);
  const autopilot = new Autopilot({ player, horde, cam, input, physics });
  const autoBtn = document.getElementById('auto-btn');
  const toggleAuto = () => {
    autopilot.toggle();
    autoBtn.classList.toggle('active', autopilot.active);
    showToast(autopilot.active ? 'Piloto automático' : 'Control manual');
  };
  autoBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    e.stopPropagation();
    input.pressed.add('KeyP');
  }, { passive: false });
  autoBtn.addEventListener('click', () => { toggleAuto(); autoBtn.blur(); });

  setupTouch(input);
  overlayMsg.textContent = 'Haz clic o toca para jugar';
  // En móviles se arranca con el propio toque (iOS no siempre genera "click" en un div).
  const begin = (e) => {
    if (e.type === 'touchend') {
      e.preventDefault();
      input.touchMode = true;
      document.body.classList.add('touch');
    }
    input.lock();
    if (input.touchMode) overlay.classList.add('hidden');
  };
  input.onPadStart = () => { input.lock(); overlay.classList.add('hidden'); };
  overlay.addEventListener('click', begin);
  overlay.addEventListener('touchend', begin, { passive: false });
  document.addEventListener('pointerlockchange', () => {
    overlay.classList.toggle('hidden', input.locked);
  });

  const sunOffset = new THREE.Vector3(18, 30, 12);
  const timer = new THREE.Timer();

  function tick(dt) {
    input.pollGamepad(dt);
    if (input.justPressed('KeyR') || player.position.y < -20) {
      physics.reset();
      player.respawn();
      combat.targetHits = combat.punchHits = 0;
      if (horde.active) horde.stop();
    }
    if (input.justPressed('KeyP')) toggleAuto();
    if (input.justPressed('KeyK')) toggleSkeleton();
    autopilot.update(dt);
    if (input.justPressed('KeyH')) toggleHorde();
    if (player.dead) {
      showToast(horde.active ? `Te comieron en la oleada ${horde.wave}` : 'Te comieron');
      horde.stop();
      player.respawn();
    }

    player.update(dt, input, cam, combat);
    horde.update(dt, player);
    physics.step(dt);
    physics.sync(dt);
    combat.update(dt);
    // La cámara se actualiza antes de apuntar para que mira y disparo coincidan.
    const t = player.body.translation();
    cam.update(dt, input, { x: t.x, y: t.y - 0.87, z: t.z }, physics);
    camera.updateMatrixWorld(true);
    player.postPhysics(dt, cam, combat);
    // Si un obstáculo empuja la cámara hasta la cabeza, se oculta el modelo para no taparlo todo.
    player.model.visible = cam.current > 0.75;
    player.updateSkeleton();
    horde.postPhysics();
    // Los disparos hacen ruido y atraen a los zombis cercanos.
    if (player.shots !== shotsHeard) {
      shotsHeard = player.shots;
      horde.noise(player.position);
    }

    // La sombra del sol sigue al jugador.
    sun.target.position.copy(player.position);
    sun.position.copy(player.position).add(sunOffset);

    renderer.render(scene, camera);
    input.endFrame();

    // Interfaz: botón de horda, barra de vida y borde rojo al recibir daño.
    const alive = horde.alive;
    const key = `${horde.active}|${horde.wave}|${alive}`;
    if (key !== hudKey) {
      hudKey = key;
      hordeBtn.textContent = !horde.active ? '▶ Iniciar horda'
        : horde.wave ? `■ Detener horda · Oleada ${horde.wave} · ${alive} ${alive === 1 ? 'zombi' : 'zombis'}`
        : '■ Detener horda';
      hordeBtn.classList.toggle('active', horde.active);
    }
    // Carrera rápida: el botón queda marcado y la cámara abre un poco el campo de visión.
    if (player.sprinting !== sprintShown) {
      sprintShown = player.sprinting;
      document.getElementById('t-sprint')?.classList.toggle('held', sprintShown);
    }
    const fov = THREE.MathUtils.damp(camera.fov, player.sprinting ? 67 : 60, 6, dt);
    if (Math.abs(fov - camera.fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    healthFill.style.transform = `scaleX(${player.healthFraction})`;
    hurt.style.opacity = Math.max(0, 0.75 - player.hurtT * 0.9) * (player.healthFraction < 1 ? 1 : 0);
  }
  renderer.setAnimationLoop(() => {
    timer.update();
    tick(Math.min(timer.getDelta(), 1 / 20));
  });

  // Para depuración desde la consola.
  window.__game = { scene, physics, player, combat, horde, autopilot, cam, input, renderer, tick };
}

start().catch((err) => {
  console.error(err);
  if (window.__bootError) window.__bootError(err.stack || err.message);
  else overlayMsg.textContent = 'Error al iniciar: ' + err.message;
});
