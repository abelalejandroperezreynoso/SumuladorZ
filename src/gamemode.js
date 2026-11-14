import * as THREE from 'three';
import { MOODS } from './horde.js';
import { zombieGlow } from './skeleton.js';
import { CITY } from './city.js';

// Modo juego: sobrevivir en la ciudad. No hay oleadas: los zombis pueblan las calles y su
// carácter cambia con la hora. De día son mansos (solo atacan si te acercas demasiado o les
// haces daño); de noche son muchos más, te huelen, corren y van a por ti.
export const GAME = {
  // Población alrededor del jugador: cuántos, a qué distancia aparecen (m) y a cuál se retiran.
  dia: { count: 14, min: 24, max: 60, far: 90 },
  noche: { count: 24, min: 20, max: 46, far: 80 },
  balas: 120, // segundos hasta que una caja de balas del escenario reaparece
  // Linterna del jugador: se enciende sola al oscurecer y alumbra hacia donde mira la cámara.
  linterna: { fuerza: 85, alcance: 34, angulo: 0.6, borde: 0.6 },
};

const _f = new THREE.Vector3();

export class GameMode {
  constructor({ scene, city, sky, horde, player, pickups, cam, toast }) {
    Object.assign(this, { city, sky, horde, player, pickups, cam, toast });
    this.active = false;
    this.best = 0; // noches superadas en la mejor partida de esta sesión
    const L = GAME.linterna;
    this.torch = new THREE.SpotLight(0xfff0d0, 0, L.alcance, L.angulo, L.borde, 1.2);
    this.torch.visible = false;
    scene.add(this.torch, this.torch.target);
    // Valores del mundo de simulación, para volver a él.
    this.sim = { bounds: horde.bounds, layout: pickups.layout, respawn: pickups.respawn };
    sky.onPhase = (phase, day) => this.phase(phase, day);
  }

  /** Entra en la ciudad y empieza una partida. */
  enter(quiet = false) {
    const { city, sky, horde, player, pickups } = this;
    this.active = true;
    horde.stop();
    city.setActive(true);
    sky.setActive(true);
    this.torch.visible = true;
    horde.bounds = city.bounds;
    player.spawn = { x: city.spawn.x, y: CITY.bordillo + 0.06, z: city.spawn.z };
    pickups.layout = city.pickups;
    pickups.respawn = GAME.balas;
    pickups.baseY = CITY.bordillo;
    this.restart(quiet);
  }

  /** Vuelve al mundo de simulación. */
  leave() {
    const { city, sky, horde, player, pickups } = this;
    this.active = false;
    horde.setAmbient(null);
    horde.stop();
    horde.setMood(MOODS.normal);
    horde.bounds = this.sim.bounds;
    city.setActive(false);
    city.setNight(0);
    sky.setActive(false);
    zombieGlow(0);
    this.torch.visible = false;
    player.spawn = { x: 0, y: 0, z: 0 };
    player.respawn();
    pickups.layout = this.sim.layout;
    pickups.respawn = this.sim.respawn;
    pickups.baseY = 0;
    pickups.reset();
    this.cam.yaw = 0;
  }

  /** Partida nueva: amanecer del día 1 en la plaza, sin armas y con las calles pobladas. */
  restart(quiet = false) {
    const { city, sky, horde, player, pickups, cam } = this;
    horde.stop();
    horde.kills = 0;
    sky.reset();
    player.respawn();
    cam.yaw = city.spawn.yaw;
    cam.pitch = 0.16;
    horde.setMood(MOODS.dia);
    horde.setAmbient(GAME.dia, player, true);
    pickups.reset();
    if (!quiet) this.toast('Día 1 · De día no atacan si no te acercas');
  }

  /** El reloj cambia de fase: de día a atardecer, a noche y de vuelta al día. */
  phase(phase, day) {
    const { horde, player } = this;
    if (phase === 'noche') {
      horde.setMood(MOODS.noche);
      horde.setAmbient(GAME.noche, player);
      this.toast(`Noche ${day} · ¡Ahora van a por ti!`);
    } else if (phase === 'atardecer') {
      this.toast('Está anocheciendo…');
    } else {
      horde.setMood(MOODS.dia);
      horde.setAmbient(GAME.dia, player);
      this.best = Math.max(this.best, day - 1);
      this.toast(`Amanece · Día ${day}`);
    }
  }

  /** El jugador ha muerto: lo dice y empieza otra partida. */
  died() {
    const { sky, horde } = this;
    const when = sky.night ? `la noche ${sky.day}` : `el día ${sky.day}`;
    this.toast(`Te comieron ${when} · ${horde.kills} ${horde.kills === 1 ? 'baja' : 'bajas'}`);
    this.restart(true);
  }

  update(dt) {
    if (!this.active) return;
    const { sky, city, player, cam, torch } = this;
    sky.update(dt);
    const dark = 1 - sky.light;
    city.setNight(dark);
    city.update(dt, player.position);
    zombieGlow(dark);
    // Linterna: sale del pecho y apunta adonde mira la cámara.
    torch.intensity = GAME.linterna.fuerza * THREE.MathUtils.smoothstep(dark, 0.45, 0.9);
    _f.copy(cam.forward);
    _f.y = Math.max(_f.y, -0.45);
    _f.normalize();
    torch.position.copy(player.position).addScaledVector(_f, 0.3);
    torch.position.y += 1.35;
    torch.target.position.copy(torch.position).addScaledVector(_f, 10);
  }
}
