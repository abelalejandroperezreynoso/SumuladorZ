import * as THREE from 'three';
import { initPhysics, Physics } from './physics.js';
import { buildWorld } from './world.js';
import { Input } from './input.js';
import { ThirdPersonCamera } from './camera.js';
import { Player, preloadModel } from './player.js';
import { onDownloadProgress } from './download.js';
import { Combat } from './combat.js';
import { Horde } from './horde.js';
import { Autopilot } from './autopilot.js';
import { Catalog } from './catalog.js';
import { setupTouch } from './touch.js';
import { setupPWA, setupUpdateButton, cacheLoadedFiles } from './pwa.js';

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

  // El motor de físicas y el modelo son casi todo el peso: se bajan a la vez y con porcentaje.
  status('Descargando el juego…');
  onDownloadProgress((f) => status(`Descargando el juego… ${Math.round(f * 100)} %`));
  if (!globalThis.__MODEL_GLB_B64) preloadModel().catch(() => {}); // el error sale en Player.load
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
  setupUpdateButton(document.getElementById('update-btn'), showToast);
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

  let catalog = null; // catálogo de mecánicas (se crea al final, cuando existe tick)
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
    // Con el catálogo abierto se dibuja desde su cámara lateral (la del juego sigue apuntando).
    const viewing = catalog?.active;
    if (viewing) catalog.beforeRender();
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

    if (!catalog?.skipRender) renderer.render(scene, viewing ? catalog.camera : camera);
    input.endFrame();

    // Interfaz: botón de horda, barra de vida y borde rojo al recibir daño.
    const alive = horde.alive;
    const key = `${horde.active}|${horde.wave}|${alive}|${autopilot.active}`;
    if (key !== hudKey) {
      hudKey = key;
      hordeBtn.textContent = !horde.active ? '▶ Iniciar horda'
        : horde.wave ? `■ Detener horda · Oleada ${horde.wave} · ${alive} ${alive === 1 ? 'zombi' : 'zombis'}`
        : '■ Detener horda';
      hordeBtn.classList.toggle('active', horde.active);
      autoBtn.classList.toggle('active', autopilot.active);
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
  // Para depuración desde la consola (y para el catálogo y las herramientas de tools/).
  const game = { scene, physics, player, combat, horde, autopilot, cam, input, renderer, tick };
  catalog = new Catalog(game, { toggleSkeleton });
  game.catalog = catalog;
  // El catálogo se abre con su botón, con G, desde la pantalla de inicio o con #catalogo en la dirección.
  const openCatalog = (e) => {
    e.preventDefault();
    e.stopPropagation();
    catalog.toggle();
  };
  for (const id of ['cat-btn', 'overlay-cat']) {
    const button = document.getElementById(id);
    button.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    button.addEventListener('touchend', openCatalog, { passive: false });
    button.addEventListener('click', (e) => { openCatalog(e); button.blur(); });
  }
  addEventListener('keydown', (e) => { if (e.code === 'KeyG' && !e.repeat) catalog.toggle(); });
  if (location.hash === '#catalogo') catalog.open();

  renderer.setAnimationLoop(() => {
    timer.update();
    const dt = Math.min(timer.getDelta(), 1 / 20);
    if (catalog.active) catalog.frame(dt); else tick(dt);
  });

  try { sessionStorage.removeItem('bootRetry'); } catch { /* sin almacenamiento */ }
  window.__game = game;
  cacheLoadedFiles();
}

start().catch((err) => {
  console.error(err);
  if (window.__bootError) window.__bootError(err.stack || err.message);
  else overlayMsg.textContent = 'Error al iniciar: ' + err.message;
});
