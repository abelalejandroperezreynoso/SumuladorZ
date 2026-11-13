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
import { Menu } from './menu.js';
import { Pickups } from './pickups.js';
import { WEAPON_NAMES } from './player.js';

setupPWA();

const overlayMsg = document.getElementById('overlay-msg');
const hudStatus = document.getElementById('hud-status');
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
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  document.body.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 300);
  // El lienzo ocupa toda la pantalla por CSS (position: fixed) y el dibujo se ajusta a su
  // tamaño real. No se usa innerHeight: en iOS, al girar el móvil o como app instalada,
  // tarda en actualizarse o se queda corto y dejaba una franja negra abajo.
  let viewW = 0, viewH = 0;
  const fit = () => {
    const r = renderer.domElement.getBoundingClientRect();
    const w = Math.round(r.width), h = Math.round(r.height);
    if (!w || !h || (w === viewW && h === viewH)) return;
    viewW = w; viewH = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    dispatchEvent(new Event('viewfit')); // el catálogo recoloca su cámara
  };
  fit();
  new ResizeObserver(fit).observe(renderer.domElement);
  // iOS avisa del giro antes de recolocar la página: se vuelve a medir un poco después.
  const refit = () => { fit(); setTimeout(fit, 120); setTimeout(fit, 500); };
  for (const ev of ['resize', 'orientationchange', 'pageshow']) addEventListener(ev, refit);
  window.visualViewport?.addEventListener('resize', refit);
  document.addEventListener('fullscreenchange', refit);

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
  combat.horde = horde;
  horde.onWave = (n) => showToast(`Oleada ${n}`);
  let shotsHeard = 0, hudKey = '', sprintShown = false, weaponKey = '', aimShown = false;
  const weaponBtn = document.getElementById('weapon-btn');
  // Tocar (o pulsar) el arma de la esquina cambia a la siguiente.
  weaponBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    e.stopPropagation();
    input.pressed.add('NextWeapon');
  }, { passive: false });
  weaponBtn.addEventListener('click', () => { input.pressed.add('NextWeapon'); weaponBtn.blur(); });
  const input = new Input(renderer.domElement);
  const cam = new ThirdPersonCamera(camera);
  const autopilot = new Autopilot({ player, horde, cam, input, physics });
  const pickups = new Pickups(scene, player, (text) => showToast(text));
  horde.onKill = (position) => pickups.zombieDied(position);
  let catalog = null; // catálogo de mecánicas (se crea al final, cuando existe tick)

  const toggleHorde = () => {
    if (horde.active) { horde.stop(); showToast('Horda detenida'); } else horde.start();
  };
  const toggleAuto = (quiet) => {
    autopilot.toggle();
    // El piloto juega con la pistola y munición infinita (para comparar partidas entre sí).
    player.infiniteAmmo = autopilot.active;
    if (autopilot.active) player.pickUp('pistola', 0);
    if (!quiet) showToast(autopilot.active ? 'Piloto automático' : 'Control manual'); // desde el menú ya lo dice el interruptor
  };
  const resetWorld = () => {
    physics.reset();
    player.respawn();
    pickups.reset();
    combat.targetHits = combat.punchHits = 0;
    if (horde.active) horde.stop();
  };

  // --- Menú de inicio y pausa ---
  // Con ratón, jugar es tener el puntero bloqueado: al soltarlo (Esc) se abre la pausa.
  const resume = (e) => {
    if (e?.type === 'touchend') { // jugar con los dedos
      input.touchMode = true;
      document.body.classList.add('touch');
    }
    input.lock();
    if (input.touchMode || input.padMode) menu.setOpen(false);
  };
  const pause = () => {
    if (menu.open) return; // (si el catálogo está abierto, la pausa queda debajo y se ve al cerrarlo)
    input.unlock();
    input.keys.clear();
    input.buttons.clear();
    input.aimToggle = false;
    document.getElementById('t-aim')?.classList.remove('held');
    menu.setOpen(true);
  };
  const menu = new Menu({
    play: resume,
    pause,
    toggleHorde,
    reset: resetWorld,
    catalog: () => catalog.open(),
    toggleAuto,
    hordeActive: () => horde.active,
    autoActive: () => autopilot.active,
    applySettings: (s) => { cam.sensitivity = s.sens; cam.invertY = s.invert; },
  });
  input.onPadStart = () => { if (!catalog?.active) resume(); };
  input.onPadMenu = pause;
  document.addEventListener('pointerlockchange', () => {
    if (input.touchMode || input.padMode) return;
    if (input.locked) menu.setOpen(false);
    else pause();
  });

  setupTouch(input);
  const fireBtn = document.getElementById('t-fire');
  setupUpdateButton(document.getElementById('m-update'), showToast);
  document.getElementById('m-version').textContent = `${__BUILD__.id} · ${__BUILD__.date.slice(0, 10)}`;

  const sunOffset = new THREE.Vector3(18, 30, 12);
  const timer = new THREE.Timer();

  function tick(dt) {
    input.pollGamepad(dt);
    if (input.justPressed('KeyR') || player.position.y < -20) resetWorld();
    if (input.justPressed('KeyP')) toggleAuto();
    autopilot.update(dt);
    if (input.justPressed('KeyH')) toggleHorde();
    if (player.dead) {
      showToast(horde.active ? `Te comieron en la oleada ${horde.wave}` : 'Te comieron');
      horde.stop();
      player.respawn();
      pickups.reset(); // se pierden las armas: vuelven a su sitio
    }

    player.update(dt, input, cam, combat);
    pickups.update(dt);
    horde.update(dt, player);
    physics.step(dt);
    physics.sync(dt);
    combat.update(dt);
    // La cámara se actualiza antes de apuntar para que mira y disparo coincidan.
    const t = player.body.translation();
    cam.update(dt, input, { x: t.x, y: t.y - 0.87, z: t.z }, physics, player.view);
    camera.updateMatrixWorld(true);
    player.postPhysics(dt, cam, combat);
    // Si un obstáculo empuja la cámara hasta la cabeza, se oculta el modelo para no taparlo todo.
    player.model.visible = cam.current > 0.75;
    player.skeleton.visible = player.model.visible;
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

    // Interfaz: oleada y piloto (solo si están activos), barra de vida y borde rojo al recibir daño.
    const alive = horde.alive;
    const key = `${horde.active}|${horde.wave}|${alive}|${autopilot.active}`;
    if (key !== hudKey) {
      hudKey = key;
      hudStatus.innerHTML = (horde.active
        ? `<span class="horde">${horde.wave ? `Oleada ${horde.wave} · ${alive} ${alive === 1 ? 'zombi' : 'zombis'}` : 'Horda'}</span>` : '')
        + (autopilot.active ? '<span class="auto">Piloto automático</span>' : '');
    }
    // Carrera rápida: el botón queda marcado y la cámara abre un poco el campo de visión.
    // La mira solo aparece al apuntar; disparar sin apuntar no la muestra.
    if (player.aiming !== aimShown) {
      aimShown = player.aiming;
      document.getElementById('crosshair')?.classList.toggle('off', !aimShown);
    }
    if (player.sprinting !== sprintShown) {
      sprintShown = player.sprinting;
      document.getElementById('t-sprint')?.classList.toggle('held', sprintShown);
    }
    // ...y al apuntar lo cierra (la cámara ya suaviza ese cambio).
    const fov = player.sprinting ? THREE.MathUtils.damp(camera.fov, 67, 6, dt)
      : THREE.MathUtils.damp(camera.fov, cam.fov(60), 14, dt);
    if (Math.abs(fov - camera.fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    // Arma en la mano y balas (arriba a la derecha); avisa si se aprieta el gatillo sin balas.
    const wKey = `${player.weapon}|${player.ammo}|${player.infiniteAmmo}|${player.dryFire > 0}`;
    if (wKey !== weaponKey) {
      weaponKey = wKey;
      const gun = player.weapon === 'pistola';
      weaponBtn.textContent = gun ? (player.dryFire > 0 ? 'Sin balas' : `Pistola · ${player.infiniteAmmo ? '∞' : player.ammo}`) : WEAPON_NAMES[player.weapon];
      weaponBtn.classList.toggle('empty', gun && (player.dryFire > 0 || !player.loaded));
      document.body.classList.toggle('no-gun', !gun);
      if (fireBtn) fireBtn.textContent = gun ? 'Disparo' : player.weapon === 'bate' ? 'Batazo' : 'Puño';
      if (!gun) input.aimToggle = false;
    }
    healthFill.style.transform = `scaleX(${player.healthFraction})`;
    hurt.style.opacity = Math.max(0, 0.75 - player.hurtT * 0.9) * (player.healthFraction < 1 ? 1 : 0);
  }
  // Para depuración desde la consola (y para el catálogo y las herramientas de tools/).
  const game = { scene, physics, player, combat, horde, autopilot, cam, input, renderer, tick, pickups };
  catalog = new Catalog(game);
  game.catalog = catalog;
  // El catálogo se abre desde el menú, con G o con #catalogo en la dirección.
  addEventListener('keydown', (e) => { if (e.code === 'KeyG' && !e.repeat) catalog.toggle(); });
  if (location.hash === '#catalogo') catalog.open();

  renderer.setAnimationLoop(() => {
    timer.update();
    const dt = Math.min(timer.getDelta(), 1 / 20);
    if (catalog.active) catalog.frame(dt);
    else if (menu.paused) {
      // En pausa el mundo queda congelado; solo se atiende al mando (para continuar).
      input.pollGamepad(dt);
      renderer.render(scene, camera);
      input.endFrame();
    } else tick(dt);
  });

  menu.ready();
  try { sessionStorage.removeItem('bootRetry'); } catch { /* sin almacenamiento */ }
  window.__game = game;
  cacheLoadedFiles();
}

start().catch((err) => {
  console.error(err);
  if (window.__bootError) window.__bootError(err.stack || err.message);
  else overlayMsg.textContent = 'Error al iniciar: ' + err.message;
});
