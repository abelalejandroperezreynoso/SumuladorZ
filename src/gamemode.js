import * as THREE from 'three';
import { MOODS } from './horde.js';
import { zombieGlow } from './skeleton.js';
import { CITY } from './city.js';

// Modo juego: sobrevivir en la ciudad. No hay oleadas: los zombis pueblan las calles y su
// carácter cambia con la hora. De día son mansos (solo atacan si te acercas demasiado o les
// haces daño); de noche son muchos más, te huelen, corren y van a por ti.
export const GAME = {
  // Población alrededor del jugador: `base` zombis el día 1 y `crece` más cada día, hasta
  // `tope`; a qué distancia aparecen (m) y a cuál se retiran.
  dia: { base: 12, crece: 3, tope: 28, min: 24, max: 60, far: 90 },
  noche: { base: 20, crece: 4, tope: 38, min: 20, max: 46, far: 80 },
  // Personas que huyen: solo los primeros `dias`. Entre una persecución y la siguiente pasan
  // `cada[0]` s el día 1 y `cada[1]` s más cada día; `aLaVez` como mucho; de 1 a `cazadores` zombis detrás.
  civiles: { dias: 5, cada: [16, 11], aLaVez: 2, cazadores: 3 },
  // Límite de la ciudad: no hay muro, pero al cruzarlo llega una horda (MOODS.horda) por el
  // lado hacia el que se sale: `base` zombis más `porMetro` por cada metro que te alejes, hasta
  // `tope`, uno cada `cada` s. Vuelve la calma al regresar `vuelta` m dentro; los que quedan
  // siguen furiosos `furia` s.
  limite: { base: 24, porMetro: 1.2, tope: 56, cada: 0.12, min: 14, max: 32, far: 85, vuelta: 5, furia: 20 },
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
    this.outside = false; // el jugador ha cruzado el límite de la ciudad
    this.civT = 0; // segundos hasta la próxima persona que huye
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
    this.outside = false;
    this.civT = 5;
    horde.setMood(MOODS.dia);
    horde.setAmbient(this.population(), player, true);
    pickups.reset();
    this.onRestart?.();
    if (!quiet) this.toast('Día 1 · De día no atacan si no te acercas');
  }

  /** Población que toca ahora: crece cada día que pasa. */
  population() {
    const { sky } = this, P = sky.night ? GAME.noche : GAME.dia;
    return { count: Math.min(P.tope, P.base + P.crece * (sky.day - 1)), min: P.min, max: P.max, far: P.far };
  }

  /** Carácter y población según la hora (salvo con la horda del límite encima). */
  settle() {
    if (this.outside) return;
    this.horde.setMood(this.sky.night ? MOODS.noche : MOODS.dia);
    this.horde.setAmbient(this.population(), this.player);
  }

  /** El reloj cambia de fase: de día a atardecer, a noche y de vuelta al día. */
  phase(phase, day) {
    if (phase === 'atardecer') return this.toast('Está anocheciendo…');
    this.settle();
    if (phase === 'noche') this.toast(`Noche ${day} · ¡Ahora van a por ti!`);
    else {
      this.best = Math.max(this.best, day - 1);
      this.toast(`Amanece · Día ${day}`);
    }
  }

  /** Límite de la ciudad: al cruzarlo llega una horda que no deja salir; al volver, se calma. */
  border() {
    const { city, horde, player } = this, B = city.limit, P = player.position, K = GAME.limite;
    const out = Math.max(B.x0 - P.x, P.x - B.x1, B.z0 - P.z, P.z - B.z1); // metros fuera (negativo: dentro)
    if (!this.outside) {
      if (out <= 0) return;
      this.outside = true;
      this.toast('¡Vuelve a la ciudad! Viene la horda');
      horde.setMood(MOODS.horda);
      horde.setAmbient(this.siege = { count: K.base, min: K.min, max: K.max, far: K.far, every: K.cada, seen: true, toward: { x: 0, z: 0 } }, player);
    }
    if (out < -K.vuelta) {
      this.outside = false;
      for (const z of horde.zombies) z.rage = K.furia;
      return this.settle();
    }
    // Salen por delante, del lado hacia el que se aleja de la ciudad.
    this.siege.count = Math.min(K.tope, Math.round(K.base + Math.max(0, out) * K.porMetro));
    this.siege.toward.x = P.x - city.center.x;
    this.siege.toward.z = P.z - city.center.z;
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
    const { sky, city, player, cam, torch, horde } = this;
    sky.update(dt);
    this.border();
    // Los primeros días aún queda gente viva: de vez en cuando pasa alguien huyendo.
    const C = GAME.civiles;
    if (sky.day <= C.dias && !this.outside && !player.dead) {
      this.civT -= dt;
      if (this.civT <= 0) {
        this.civT = (C.cada[0] + C.cada[1] * (sky.day - 1)) * (0.7 + 0.6 * Math.random());
        if (horde.civilians.filter((c) => !c.dead).length < C.aLaVez && horde.alive < horde.ambient.count + 6) horde.spawnChase(player, 1 + Math.floor(Math.random() * C.cazadores));
      }
    }
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
