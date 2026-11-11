import * as THREE from 'three';
import { initPhysics, Physics } from './physics.js';
import { buildWorld } from './world.js';
import { Input } from './input.js';
import { ThirdPersonCamera } from './camera.js';
import { Player } from './player.js';
import { Combat } from './combat.js';
import { setupTouch } from './touch.js';

const overlay = document.getElementById('overlay');
const overlayMsg = document.getElementById('overlay-msg');
const stats = document.getElementById('stats');

const STATE_LABEL = { Idle: 'Quieto', Walking: 'Caminando', Running: 'Corriendo', Jump: 'En el aire', Punch: 'Golpeando' };

async function start() {
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

  await initPhysics();
  const physics = new Physics(scene);
  const { sun } = buildWorld(scene, physics);
  const player = await Player.load(scene, physics);
  const combat = new Combat(scene, physics);
  const input = new Input(renderer.domElement);
  const cam = new ThirdPersonCamera(camera);

  setupTouch(input);
  overlayMsg.textContent = 'Haz clic o toca para jugar';
  overlay.addEventListener('click', () => {
    input.lock();
    if (input.touchMode) overlay.classList.add('hidden');
  });
  document.addEventListener('pointerlockchange', () => {
    overlay.classList.toggle('hidden', input.locked);
  });

  const sunOffset = new THREE.Vector3(18, 30, 12);
  const timer = new THREE.Timer();
  let fps = 60, statsT = 0;

  function tick(dt) {
    if (input.justPressed('KeyR') || player.position.y < -20) {
      physics.reset();
      player.respawn();
      combat.targetHits = combat.punchHits = 0;
    }

    player.update(dt, input, cam, combat);
    physics.step(dt);
    physics.sync(dt);
    combat.update(dt);
    // La cámara se actualiza antes de apuntar para que mira y disparo coincidan.
    const t = player.body.translation();
    cam.update(dt, input, { x: t.x, y: t.y - 0.87, z: t.z }, physics);
    camera.updateMatrixWorld(true);
    player.postPhysics(dt, cam, combat);

    // La sombra del sol sigue al jugador.
    sun.target.position.copy(player.position);
    sun.position.copy(player.position).add(sunOffset);

    renderer.render(scene, camera);
    input.endFrame();

    fps += (1 / Math.max(dt, 1e-4) - fps) * 0.05;
    statsT -= dt;
    if (statsT <= 0) {
      statsT = 0.15;
      stats.innerHTML =
        `${STATE_LABEL[player.state] ?? player.state} · ${player.speed.toFixed(1)} m/s<br>` +
        `Dianas alcanzadas: <b>${combat.targetHits}</b> · Golpes: <b>${combat.punchHits}</b><br>` +
        `Disparos: ${player.shots} · ${fps.toFixed(0)} FPS`;
    }
  }
  renderer.setAnimationLoop(() => {
    timer.update();
    tick(Math.min(timer.getDelta(), 1 / 20));
  });

  // Para depuración desde la consola.
  window.__game = { scene, physics, player, combat, cam, input, renderer, tick };
}

start().catch((err) => {
  console.error(err);
  overlayMsg.textContent = 'Error al iniciar: ' + err.message;
});
