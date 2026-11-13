import * as THREE from 'three';
import { RAPIER, GROUPS } from './physics.js';
import { probeWall, COVER_BASE_Y, COVER_LOW_Y, COVER_HIGH_Y } from './cover.js';

// Piloto automático: juega solo usando los mismos controles que un jugador (movimiento,
// cámara y botones), para observar las mecánicas en tiempo real y cazar fallos.
const SHOOT_RANGE = 18; // dispara a los zombis que ve a menos de esta distancia (m)
const FLEE_START = 5; // huye si un zombi se acerca a menos de esto (m)
const FLEE_END = 10; // ...hasta alejarse esta distancia
const PUNCH_RANGE = 1.4;
const COVER_LEAVE = 4; // abandona la cobertura si un zombi llega tan cerca (m)
const ARENA_EDGE = 30; // cerca de los muros, la huida se curva hacia el centro
const COVER_SEEK = 7; // con los zombis más lejos que esto, busca una cobertura (m)
const COVER_SCAN = 16; // alcance de esa búsqueda (m)
const COVER_VARIETY = 6; // metros de más que acepta recorrer por un tipo de cobertura menos usado
const FRUSTRATION = 2.5; // segundos disparando sin hacer daño antes de recolocarse
export const AUTOPILOT_TUNING = { SHOOT_RANGE, FLEE_START }; // lo muestra el catálogo
const AIM_TOLERANCE = 0.05; // error de puntería admitido para apretar el gatillo (rad)

const _dir = new THREE.Vector3();
const _miss = new THREE.Vector3();

function dampAngle(a, b, lambda, dt) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * (1 - Math.exp(-lambda * dt));
}

export class Autopilot {
  constructor({ player, horde, cam, input, physics }) {
    Object.assign(this, { player, horde, cam, input, physics });
    this.active = false;
    this.time = 0;
    this.action = 'idle';
    this.log = []; // sucesos con marca de tiempo, para revisar la partida
    this.stats = { waves: 0, kills: 0, deaths: 0, shots: 0, covers: 0, stuck: 0, damage: 0, coverTypes: { alta: 0, baja: 0, 'muy baja': 0 } };
    this.shuffleT = 0;
    this.shuffleSide = 1;
    this.cooldown = {};
    this.fleeing = false;
    this.fleeTurn = 0;
    this.stuckT = 0;
    this.coverFireT = 0;
    this.noDamageT = 0; // tiempo disparando sin herir a nadie
    this.repositionT = 0;
    this.repositionSide = 1;
    this.coverSpot = null; // { x, z } punto de cobertura al que se dirige
    this.hpSum = 0;
    this.aimFix = new THREE.Vector3(); // corrección de puntería aprendida (se conserva al cambiar de objetivo)
    this.onHead = false;
    this.last = { wave: 0, kills: 0, health: 100, cover: false };
  }

  toggle() {
    this.active = !this.active;
    this.input.auto = null;
    this.input.buttons.delete(0);
    this.input.buttons.delete(2);
    this.fleeing = false;
    this.note(this.active ? 'piloto activado' : 'piloto desactivado');
  }

  note(text) {
    this.log.push(`${this.time.toFixed(1)}s ${text}`);
    if (this.log.length > 400) this.log.shift();
  }

  ready(name) {
    return (this.cooldown[name] ?? 0) <= 0;
  }

  press(code, name, wait) {
    this.input.pressed.add(code);
    this.cooldown[name] = wait;
  }

  /** ¿Hay línea de tiro despejada hasta el zombi? */
  clearShot(z) {
    const P = this.player.position;
    const from = { x: P.x, y: P.y + 1.4, z: P.z };
    _dir.set(z.position.x - P.x, z.position.y + z.aimY - from.y, z.position.z - P.z);
    const len = _dir.length();
    _dir.divideScalar(len);
    return !this.physics.world.castRay(
      new RAPIER.Ray(from, _dir), len, true, RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC, GROUPS.cover,
    );
  }

  /**
   * Busca alrededor una cobertura que quede entre el jugador y el zombi. Prefiere los tipos
   * (alta, baja, muy baja) que menos ha usado, para ir pasando por todos.
   */
  findCover(target) {
    const P = this.player.position, world = this.physics.world;
    let best = null;
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a);
      const hit = probeWall(world, P.x, P.y + COVER_BASE_Y, P.z, dx, dz, COVER_SCAN);
      if (!hit || hit.dist < 0.5) continue;
      const hx = P.x + dx * hit.dist, hz = P.z + dz * hit.dist;
      const zx = target.position.x - hx, zz = target.position.z - hz;
      const zd = Math.hypot(zx, zz);
      // La cara alcanzada debe dar la espalda al zombi, y este no estar ya encima.
      if (zd < 5 || (hit.nx * zx + hit.nz * zz) / zd > -0.4) continue;
      if (Math.max(Math.abs(hx), Math.abs(hz)) > 36) continue; // los muros del perímetro no
      // Tipo de cobertura, sondeando el objeto desde el punto donde se colocaría.
      const sx = hx + hit.nx * 0.6, sz = hz + hit.nz * 0.6;
      const at = (h) => probeWall(world, sx, P.y + h, sz, -hit.nx, -hit.nz, 1.2);
      const type = at(COVER_HIGH_Y) ? 'alta' : at(COVER_LOW_Y) ? 'baja' : 'muy baja';
      const score = hit.dist + COVER_VARIETY * this.stats.coverTypes[type];
      if (!best || score < best.score) best = { score, dist: hit.dist, x: sx, z: sz, type };
    }
    return best;
  }

  /** Gira la cámara hacia un punto; devuelve el error de puntería restante (rad). */
  aimAt(x, y, z, dt) {
    const cam = this.cam, P = this.player.position;
    let yaw = cam.yaw, pitch = cam.pitch;
    // El pivote de la cámara está desplazado al hombro: dos pasadas bastan para converger.
    for (let i = 0; i < 2; i++) {
      const px = P.x + Math.cos(yaw) * 0.5, pz = P.z - Math.sin(yaw) * 0.5;
      const dx = x - px, dy = y - (P.y + 1.55), dz = z - pz;
      yaw = Math.atan2(-dx, -dz);
      pitch = Math.asin(THREE.MathUtils.clamp(-dy / Math.hypot(dx, dy, dz), -1, 1));
    }
    cam.yaw = dampAngle(cam.yaw, yaw, 14, dt);
    cam.pitch = THREE.MathUtils.damp(cam.pitch, pitch, 14, dt);
    return Math.abs(Math.atan2(Math.sin(yaw - cam.yaw), Math.cos(yaw - cam.yaw))) + Math.abs(pitch - cam.pitch);
  }

  /**
   * Apunta a la cabeza de un zombi (lo único que lo mata). aimAt solo aproxima dónde está la
   * cámara, así que corrige con el rayo real de la mira y deja en `onHead` si está ya sobre
   * la cabeza.
   */
  aimZombie(z, dt) {
    const h = z.headPoint, F = this.aimFix;
    const err = this.aimAt(h.x + F.x, h.y + F.y, h.z + F.z, dt);
    // Desvío de la mira (el rayo del centro de la pantalla) respecto a la cabeza.
    const camera = this.cam.camera;
    camera.getWorldDirection(_dir);
    _miss.copy(camera.position).sub(h);
    _miss.addScaledVector(_dir, -_miss.dot(_dir));
    const miss = _miss.length();
    this.onHead = miss < 0.09;
    if (miss < 0.6) F.addScaledVector(_miss, -0.2).clampLength(0, 0.5);
    return err;
  }

  /** Mueve al personaje en una dirección del mundo (la entrada es relativa a la cámara). */
  moveWorld(wx, wz, run = false) {
    const len = Math.hypot(wx, wz);
    if (len < 1e-4) return;
    const sin = Math.sin(this.cam.yaw), cos = Math.cos(this.cam.yaw);
    wx /= len; wz /= len;
    this.input.auto = { x: cos * wx - sin * wz, z: -(sin * wx + cos * wz), run };
  }

  track(dt) {
    const { player, horde, last, stats } = this;
    if (horde.wave !== last.wave) {
      if (horde.wave > last.wave) { stats.waves = Math.max(stats.waves, horde.wave); this.note(`oleada ${horde.wave}`); }
      last.wave = horde.wave;
    }
    if (horde.kills > last.kills) { stats.kills += horde.kills - last.kills; this.note(`zombi abatido (${horde.alive} vivos)`); }
    last.kills = horde.kills;
    if (player.health < last.health - 0.5) { stats.damage += last.health - player.health; this.note(`mordido: vida ${Math.round(player.health)}`); }
    if (last.wasActive && !horde.active && last.health < 40) { stats.deaths++; this.note('muerto'); }
    last.health = player.health;
    last.wasActive = horde.active;
    const inCover = !!player.cover?.attached;
    if (inCover && !last.cover) {
      stats.covers++;
      const c = player.cover;
      const type = c.high ? 'alta' : c.veryLow ? 'muy baja' : 'baja';
      stats.coverTypes[type]++;
      this.note(`a cubierto (${type})`);
    }
    last.cover = inCover;
    stats.shots = player.shots;
  }

  /** Antes de player.update: decide la entrada de este fotograma. */
  update(dt) {
    if (!this.active) return;
    this.time += dt;
    for (const name in this.cooldown) this.cooldown[name] -= dt;
    this.track(dt);
    const { player: P, horde: H, input: I, cam } = this;
    I.auto = { x: 0, z: 0, run: false };
    // Si al pasar recogió el bate, vuelve a la pistola (tecla 3, como un jugador).
    if (P.weapon !== 'pistola' && P.has.pistola && this.ready('weapon', dt)) this.press('Digit3', 'weapon', 0.5);
    let fire = false;
    let aim = false; // mantiene el botón de apuntar aunque aún no dispare

    if (!H.active) {
      this.action = 'esperando';
      if (this.ready('horde', dt)) this.press('KeyH', 'horde', 2.5);
      I.buttons.delete(0); I.buttons.delete(2);
      return;
    }

    // Zombi más cercano y centro de la amenaza próxima.
    let target = null, best = Infinity, tx = 0, tz = 0, near = 0;
    for (const z of H.zombies) {
      if (!z.alive) continue;
      const d = Math.hypot(z.position.x - P.position.x, z.position.z - P.position.z);
      if (d < best) { best = d; target = z; }
      if (d < 12) { tx += z.position.x; tz += z.position.z; near++; }
    }
    if (!target) {
      this.action = 'entre oleadas';
      I.buttons.delete(0); I.buttons.delete(2);
      return; // si está a cubierto, espera ahí la siguiente oleada
    }
    const dx = target.position.x - P.position.x, dz = target.position.z - P.position.z;
    const los = this.clearShot(target);

    // Frustración: si lleva un rato disparando sin herir a nadie, se recoloca.
    // Daño hecho: bajas y piezas arrancadas (las balas no quitan vida; solo mata la cabeza).
    let hpSum = H.kills * 100;
    for (const z of H.zombies) if (z.alive) hpSum += z.lost.size;
    if (hpSum !== this.hpSum || !I.buttons.has(0)) this.noDamageT = 0;
    else this.noDamageT += dt;
    this.hpSum = hpSum;
    if (this.noDamageT > FRUSTRATION) {
      this.noDamageT = 0;
      this.repositionT = 1.6;
      this.repositionSide = Math.random() < 0.5 ? -1 : 1;
      this.stats.repositions = (this.stats.repositions ?? 0) + 1;
      this.note(`sin acertar a ${best.toFixed(0)} m: se recoloca`);
      if (P.cover) this.press('KeyC', 'cover', 4);
    }
    this.repositionT -= dt;

    if (P.cover) {
      const c = P.cover;
      const behind = (c.nx * dx + c.nz * dz) / best < -0.25; // el muro queda entre ambos
      if (!c.attached) {
        this.action = 'deslizándose a cubierto';
      } else if ((best < COVER_LEAVE || !behind) && this.ready('cover', dt)) {
        this.action = 'saliendo de cobertura';
        this.press('KeyC', 'cover', 3);
      } else {
        this.action = 'disparando a cubierto';
        const err = this.aimZombie(target, dt);
        fire = best < SHOOT_RANGE + 4 && err < 0.4;
        // Sin nadie a tiro, se desplaza a lo largo de la cobertura de un lado a otro.
        if (!fire) {
          this.shuffleT -= dt;
          if (this.shuffleT <= 0) { this.shuffleT = 1.2; this.shuffleSide = -this.shuffleSide; }
          this.moveWorld(c.nz * this.shuffleSide, -c.nx * this.shuffleSide);
        }
        // Si no consigue tiro (cobertura alta sin borde cerca), se desplaza por el muro.
        this.coverFireT = fire && !P.canFire ? this.coverFireT + dt : 0;
        if (this.coverFireT > 1.2) {
          fire = false;
          const side = Math.sign(c.nz * dx - c.nx * dz) || 1;
          this.moveWorld(c.nz * side, -c.nx * side);
          if (this.coverFireT > 2.4) this.coverFireT = 0;
        }
      }
    } else if (best < PUNCH_RANGE && this.ready('punch', dt)) {
      this.action = 'golpeando';
      this.aimZombie(target, dt);
      P.facing = Math.atan2(dx, dz);
      if (P.sprinting) this.press('KeyQ', 'sprint', 0.4);
      this.press('KeyF', 'punch', 0.8);
    } else if (best < FLEE_START || (this.fleeing && best < FLEE_END)) {
      // Huida: corre rápido alejándose del grupo, curvando hacia el centro cerca de los muros.
      this.action = 'huyendo';
      this.fleeing = true;
      let ax = P.position.x - (near ? tx / near : target.position.x);
      let az = P.position.z - (near ? tz / near : target.position.z);
      const al = Math.hypot(ax, az) || 1;
      ax /= al; az /= al;
      const edge = Math.max(Math.abs(P.position.x), Math.abs(P.position.z));
      if (edge > ARENA_EDGE - 8) {
        const k = THREE.MathUtils.clamp((edge - (ARENA_EDGE - 8)) / 8, 0, 1) * 1.6;
        const cl = Math.hypot(P.position.x, P.position.z) || 1;
        // Tangente al muro (para rodear) más un empuje hacia el centro.
        ax += (-P.position.z / cl) * k - (P.position.x / cl) * k;
        az += (P.position.x / cl) * k - (P.position.z / cl) * k;
      }
      const a = Math.atan2(ax, az) + this.fleeTurn;
      const fx = Math.sin(a), fz = Math.cos(a);
      cam.yaw = dampAngle(cam.yaw, Math.atan2(-fx, -fz), 8, dt);
      cam.pitch = THREE.MathUtils.damp(cam.pitch, 0.2, 6, dt);
      this.moveWorld(fx, fz, true);
      if (!P.sprinting && P.speed > 2 && this.ready('sprint', dt)) this.press('KeyQ', 'sprint', 0.6);
      // Atascado contra algo: salta y prueba otro rumbo.
      this.stuckT = P.speed < 1.5 ? this.stuckT + dt : 0;
      if (this.stuckT > 0.35) {
        this.stuckT = 0;
        this.stats.stuck++;
        this.fleeTurn += (Math.random() < 0.5 ? -1 : 1) * 1.1;
        this.input.pressed.add('Space');
        this.note('atascado al huir: cambia de rumbo');
      }
      this.fleeTurn *= Math.exp(-0.8 * dt);
    } else if (this.repositionT > 0) {
      // Rodea al objetivo para encontrar otro ángulo de tiro.
      this.action = 'recolocándose';
      this.fleeing = false;
      this.aimZombie(target, dt);
      const s = this.repositionSide;
      this.moveWorld(dz * s + dx * 0.3, -dx * s + dz * 0.3, true);
    } else {
      this.fleeing = false;
      this.stuckT = 0;
      // Con los zombis lejos, corre a una cobertura que quede entre medias.
      if (best > COVER_SEEK && this.ready('scan', dt)) {
        this.cooldown.scan = 1;
        this.coverSpot = this.findCover(target);
      }
      if (best <= COVER_SEEK - 2.5) this.coverSpot = null;
      const spot = this.coverSpot;
      if (spot) {
        const sx = spot.x - P.position.x, sz = spot.z - P.position.z;
        this.action = 'yendo a cubierto';
        this.aimAt(spot.x, P.position.y + 1.3, spot.z, dt);
        this.moveWorld(sx, sz, true);
        if (Math.hypot(sx, sz) < 1.4) {
          this.coverSpot = null;
          if (this.ready('cover', dt)) this.press('KeyC', 'cover', 3);
        }
      } else if (los && best < SHOOT_RANGE) {
        this.action = 'disparando';
        if (P.sprinting && this.ready('sprint', dt)) this.press('KeyQ', 'sprint', 0.4);
        const err = this.aimZombie(target, dt);
        // Apunta ya: al pulsar el botón la cámara pasa al hombro y la mira se mueve, así que
        // afina la puntería a la cabeza con la cámara de apuntar y solo entonces dispara.
        aim = true;
        fire = err < AIM_TOLERANCE && this.onHead;
      } else if (best < 9) {
        // Cerca pero sin tiro: espera a que asome en vez de ir a su encuentro.
        this.action = 'esperando tiro';
        this.aimZombie(target, dt);
      } else {
        this.action = 'buscando';
        this.aimZombie(target, dt);
        this.moveWorld(dx, dz, true);
        this.stuckT = P.speed < 1 ? this.stuckT + dt : 0;
        if (this.stuckT > 0.6) { this.stuckT = 0; this.stats.stuck++; this.input.pressed.add('Space'); }
      }
    }

    // Apunta siempre al disparar (levantarse o asomarse a cubierto, sin desvío).
    if (fire) I.buttons.add(0); else I.buttons.delete(0);
    if (fire || aim) I.buttons.add(2); else I.buttons.delete(2);
  }
}
