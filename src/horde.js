import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { SkeletonView } from './skeleton.js';
import { RAPIER, GROUPS } from './physics.js';

const RADIUS = 0.35;
const HALF = 0.5;
const FOOT = HALF + RADIUS;
const ARENA = 34; // los zombis aparecen dentro de ±ARENA m

// --- Sentidos ---
const VIEW_RANGE = 22; // alcance de la vista (m)
const VIEW_COS = Math.cos(THREE.MathUtils.degToRad(60)); // campo de visión de 120°
const SENSE_RANGE = 2.5; // a esta distancia te nota aunque esté de espaldas (m)
const NOISE_RANGE = 28; // distancia a la que oye un disparo (m)
const MEMORY = 6; // segundos que sigue buscando tras perderte de vista
const EYE = 1.55; // altura de los ojos (m)

// --- Movimiento y ataque ---
const WANDER_SPEED = 0.7;
const CHASE_SPEED = 2.8; // más rápido que caminar (2,2), más lento que correr (6)
const ATTACK_RANGE = 1.15; // distancia entre centros para empezar a morder (m)
const ATTACK_TIME = 1.0;
const ATTACK_HIT = 0.45; // fracción del ataque en la que muerde
const BITE_REACH = 1.5;
const BITE_DAMAGE = 15;
const HEALTH = 3; // una bala quita 1; un puñetazo, 1,5
const STAGGER = 0.35;
const CORPSE_TIME = 4;
const SPAWN_MIN = 14, SPAWN_MAX = 22; // distancia al jugador al aparecer (m)
const WAVE_DELAY = 2; // pausa entre oleadas (s)
const DETOUR_ANGLE = 1.45; // al rodear avanza casi paralelo al obstáculo (rad)
const DETOUR_PROBE = 1.6; // distancia libre hacia el objetivo para dar por terminado el rodeo (m)
const SEPARATION = 0.8; // distancia mínima entre zombis (m)
const SEPARATION_SPEED = 1.5; // velocidad máxima del empuje que los separa (m/s)

// Colores del modelo para convertirlo en zombi: piel verdosa y ropa sucia.

// Estado del zombi -> clip del modelo, y los valores que muestra el catálogo.
export const ZOMBIE_CLIPS = {
  Idle: 'Idle', Walk: 'Walk', Run: 'Run', Attack: 'Punch_Left', Hit: 'HitRecieve', Death: 'Death',
};
export const ZOMBIE_TUNING = {
  VIEW_RANGE, SENSE_RANGE, NOISE_RANGE, WANDER_SPEED, CHASE_SPEED, ATTACK_RANGE, ATTACK_TIME, ATTACK_HIT,
  BITE_DAMAGE, HEALTH, STAGGER, CORPSE_TIME, SPAWN_MIN, SPAWN_MAX, WAVE_DELAY,
};

const _to = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _pq = new THREE.Quaternion();
const _axis = new THREE.Vector3();

function dampAngle(a, b, lambda, dt) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * (1 - Math.exp(-lambda * dt));
}

class Zombie {
  constructor(horde, x, z) {
    this.horde = horde;
    this.hp = HEALTH;
    this.state = 'wander'; // wander | chase | attack | stagger | dead
    this.facing = Math.random() * Math.PI * 2;
    this.position = new THREE.Vector3(x, 0, z);
    this.target = new THREE.Vector3(x, 0, z); // adónde se dirige
    this.sees = false;
    this.memory = 0;
    this.timer = 0;
    this.wanderT = 0;
    this.blockedT = 0;
    this.sidestep = 0; // desvío respecto al rumbo directo mientras rodea un obstáculo (rad)
    this.detour = 0; // lado por el que rodea: -1, 0 (sin rodeo) o 1
    this.detourT = 0;
    this.clearT = 0;
    this.probeT = 0;
    this.lastSide = 1;
    this.lastSideT = 0;
    this.vy = 0;
    this.pushX = 0; // empuje para separarse de otros zombis (m/s)
    this.pushZ = 0;
    this.bit = false;
    this.arms = 0; // 0 = brazos caídos, 1 = extendidos hacia la presa

    // --- Modelo y animaciones ---
    this.model = cloneSkinned(horde.template);
    this.model.position.copy(this.position);
    horde.scene.add(this.model);
    this.skel = new SkeletonView(this.model, horde.scene, 'zombie');
    this.mixer = new THREE.AnimationMixer(this.model);
    const action = (name) => this.mixer.clipAction(horde.clips[name]);
    this.actions = Object.fromEntries(Object.entries(ZOMBIE_CLIPS).map(([state, name]) => [state, action(name)]));
    for (const name of ['Attack', 'Hit', 'Death']) {
      this.actions[name].setLoop(THREE.LoopOnce);
      this.actions[name].clampWhenFinished = true;
    }
    this.actions.Attack.timeScale = this.actions.Attack.getClip().duration / ATTACK_TIME;
    this.current = this.actions.Idle;
    this.current.play();
    this.armBones = [];
    this.model.traverse((o) => {
      if (o.isBone && (o.name === 'UpperArmL' || o.name === 'UpperArmR')) {
        this.armBones.push({ bone: o, quat: new THREE.Quaternion() });
      }
    });
    this.posed = false;

    // --- Física: cápsula cinemática ---
    const world = horde.physics.world;
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, FOOT + 0.05, z),
    );
    this.collider = world.createCollider(
      RAPIER.ColliderDesc.capsule(HALF, RADIUS).setCollisionGroups(GROUPS.enemyBody), this.body,
    );
    horde.physics.meta.set(this.collider.handle, { body: this.body, zombie: this });
  }

  get alive() { return this.state !== 'dead'; }

  play(name, fade = 0.2) {
    const next = this.actions[name];
    if (next === this.current) return;
    next.reset();
    next.crossFadeFrom(this.current, fade, false).play();
    this.current = next;
  }

  /** ¿Ve al jugador? Dentro del cono de visión, a su alcance y sin muros de por medio. */
  canSee(player) {
    const dx = player.position.x - this.position.x, dz = player.position.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > VIEW_RANGE) return false;
    if (dist > SENSE_RANGE) {
      const facingDot = (dx * Math.sin(this.facing) + dz * Math.cos(this.facing)) / dist;
      if (facingDot < VIEW_COS) return false;
    }
    // Línea de visión de los ojos a la cabeza del jugador (más baja si está agachado o tumbado a cubierto).
    const eye = { x: this.position.x, y: this.position.y + EYE, z: this.position.z };
    const headY = player.position.y + player.headHeight;
    _to.set(dx, headY - eye.y, dz);
    const len = _to.length();
    _to.divideScalar(len);
    const hit = this.horde.physics.world.castRay(
      new RAPIER.Ray(eye, _to), len, true, RAPIER.QueryFilterFlags.ONLY_FIXED,
    );
    return !hit;
  }

  /** ¿Está libre el tramo inmediato hacia su objetivo? Sondea a la altura de las piernas y de la cabeza. */
  pathClear() {
    const dx = this.target.x - this.position.x, dz = this.target.z - this.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.3) return true;
    const dir = { x: dx / d, y: 0, z: dz / d };
    const world = this.horde.physics.world;
    for (const h of [0.5, 1.68]) {
      const origin = { x: this.position.x, y: this.position.y + h, z: this.position.z };
      const hit = world.castRay(
        new RAPIER.Ray(origin, dir), Math.min(d, DETOUR_PROBE), true,
        RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC, GROUPS.cover,
      );
      if (hit) return false;
    }
    return true;
  }

  /** Algo llamó su atención (un disparo, un golpe): va a investigar. */
  alert(point) {
    if (!this.alive) return;
    this.target.copy(point);
    this.memory = MEMORY;
    if (this.state === 'wander') this.state = 'chase';
  }

  damage(amount, player) {
    if (!this.alive) return;
    this.hp -= amount;
    this.alert(player.position);
    if (this.hp <= 0) return this.die();
    this.state = 'stagger';
    this.timer = STAGGER;
    this.play('Hit', 0.05);
  }

  die() {
    this.state = 'dead';
    this.timer = CORPSE_TIME;
    this.play('Death', 0.1);
    this.removeBody = true; // se retira en update(), fuera de los eventos de colisión
    this.horde.kills++;
    this.horde.onKill?.(this.position);
  }

  dispose() {
    this.horde.scene.remove(this.model);
    this.skel.dispose();
    this.mixer.stopAllAction();
    if (this.body) {
      this.horde.physics.meta.delete(this.collider.handle);
      this.horde.physics.world.removeRigidBody(this.body);
      this.body = null;
    }
  }

  pickWanderTarget(player) {
    this.wanderT = 3 + Math.random() * 4;
    // La mitad de las veces deambula hacia la zona del jugador: la horda acaba encontrándolo.
    const cx = Math.random() < 0.5 ? player.position.x : this.position.x;
    const cz = Math.random() < 0.5 ? player.position.z : this.position.z;
    const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 6;
    this.target.set(
      THREE.MathUtils.clamp(cx + Math.sin(a) * r, -ARENA, ARENA), 0,
      THREE.MathUtils.clamp(cz + Math.cos(a) * r, -ARENA, ARENA),
    );
  }

  /** Antes del paso de física: sentidos, decisión y movimiento. */
  update(dt, player) {
    this.mixerDt = dt;
    if (this.removeBody && this.body) {
      this.horde.physics.meta.delete(this.collider.handle);
      this.horde.physics.world.removeRigidBody(this.body);
      this.body = null;
    }
    if (this.state === 'dead') {
      this.timer -= dt;
      if (this.timer < 1) this.model.position.y -= dt * 0.6; // el cadáver se hunde
      return;
    }

    const dx = player.position.x - this.position.x, dz = player.position.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    this.sees = !player.dead && this.canSee(player);
    if (this.sees) {
      this.target.copy(player.position);
      this.memory = MEMORY;
      if (this.state === 'wander') this.state = 'chase';
    } else {
      this.memory -= dt;
    }

    let speed = 0;
    let wantFacing = null;
    if (this.state === 'stagger') {
      this.timer -= dt;
      if (this.timer <= 0) this.state = 'chase';
    } else if (this.state === 'attack') {
      this.timer += dt;
      wantFacing = Math.atan2(dx, dz);
      if (!this.bit && this.timer >= ATTACK_TIME * ATTACK_HIT) {
        this.bit = true;
        if (dist < BITE_REACH && Math.abs(player.position.y - this.position.y) < 1.2) player.damage(BITE_DAMAGE);
      }
      if (this.timer >= ATTACK_TIME) {
        if (this.sees && dist < ATTACK_RANGE) {
          // Sigue a tiro: encadena otra mordida sin pasar un fotograma por la carrera.
          this.timer = 0;
          this.bit = false;
          this.current.reset().play();
        } else {
          this.state = 'chase';
        }
      }
    } else if (this.state === 'chase') {
      const tx = this.target.x - this.position.x, tz = this.target.z - this.position.z;
      const td = Math.hypot(tx, tz);
      if (this.sees && dist < ATTACK_RANGE) {
        this.state = 'attack';
        this.timer = 0;
        this.bit = false;
        this.play('Attack', 0.1);
      } else if (!this.sees && (td < 0.7 || this.memory <= 0)) {
        this.state = 'wander'; // llegó al último lugar donde te vio y ya no estás
        this.wanderT = 0;
      } else {
        speed = CHASE_SPEED;
        wantFacing = Math.atan2(tx, tz) + this.sidestep;
      }
    } else {
      this.wanderT -= dt;
      const tx = this.target.x - this.position.x, tz = this.target.z - this.position.z;
      if (this.wanderT <= 0 || Math.hypot(tx, tz) < 0.6) {
        if (this.wanderT > 0) this.wanderT = Math.min(this.wanderT, 1.5); // se queda un momento quieto
        else this.pickWanderTarget(player);
      } else {
        speed = WANDER_SPEED;
        wantFacing = Math.atan2(tx, tz) + this.sidestep;
      }
    }
    if (wantFacing !== null) this.facing = dampAngle(this.facing, wantFacing, 6, dt);
    // Brazos al frente al perseguir; al morder bajan para que mande la animación de ataque.
    const armsTarget = this.state === 'chase' ? 1 : this.state === 'attack' ? 0.35 : 0;
    this.arms = THREE.MathUtils.damp(this.arms, armsTarget, 6, dt);

    // --- Movimiento con colisiones ---
    this.vy = this.grounded ? 0 : this.vy - 9.81 * dt;
    const delta = {
      x: (Math.sin(this.facing) * speed + this.pushX) * dt,
      y: this.grounded ? 0 : this.vy * dt,
      z: (Math.cos(this.facing) * speed + this.pushZ) * dt,
    };
    const cc = this.horde.controller;
    cc.computeColliderMovement(this.collider, delta, undefined, GROUPS.enemyMove);
    const m = cc.computedMovement();
    this.grounded = cc.computedGrounded();
    // Pegado a otro cuerpo cinemático, el controlador puede devolver más avance del pedido
    // (el zombi salía disparado): nunca se mueve más rápido de lo que quería.
    let mx = m.x, mz = m.z;
    const want = Math.hypot(delta.x, delta.z), got = Math.hypot(mx, mz);
    if (got > want) {
      const k = got > 1e-6 ? want / got : 0;
      mx *= k;
      mz *= k;
    }
    const t = this.body.translation();
    this.body.setNextKinematicTranslation({ x: t.x + mx, y: t.y + m.y, z: t.z + mz });
    this.moveSpeed = Math.hypot(mx, mz) / dt;

    // Rodeo de obstáculos: si algo le corta el paso, elige un lado y lo bordea hasta que el
    // camino hacia su objetivo vuelve a estar libre.
    this.lastSideT -= dt;
    const blocked = speed > 0 && this.moveSpeed < speed * 0.35;
    this.blockedT = blocked ? this.blockedT + dt : 0;
    if (this.detour) {
      this.detourT += dt;
      this.probeT -= dt;
      if (this.probeT <= 0) {
        this.probeT = 0.15;
        this.clearT = this.pathClear() ? this.clearT + 0.15 : 0;
      }
      if (this.clearT > 0.3) {
        this.lastSide = this.detour;
        this.lastSideT = 3;
        this.detour = 0;
      } else if (this.blockedT > 0.5 || this.detourT > 8) {
        this.detour = -this.detour; // rincón o rodeo demasiado largo: prueba por el otro lado
        this.detourT = 0;
        this.blockedT = 0;
      }
    } else if (this.blockedT > 0.4) {
      // Si acaba de rodear por un lado, insiste por el mismo (esquinas).
      this.detour = this.lastSideT > 0 ? this.lastSide : Math.random() < 0.5 ? -1 : 1;
      this.detourT = this.clearT = this.blockedT = 0;
      this.probeT = 0.3;
    }
    this.sidestep = this.detour * DETOUR_ANGLE;

    if (this.state === 'chase' || this.state === 'wander') {
      // Histéresis: una parada de un instante no corta la animación de caminar.
      this.stillT = this.moveSpeed > 0.15 ? 0 : (this.stillT ?? 0) + dt;
      if (this.stillT < 0.2) {
        // Al perseguir usa el clip de correr a ritmo lento (zancada larga y pesada); el de
        // caminar a esa velocidad hacía que los pies patinaran. Ritmos medidos con tools/watch.cjs.
        if (this.state === 'chase') {
          this.play('Run', 0.3);
          this.current.timeScale = THREE.MathUtils.clamp(this.moveSpeed / 3.1, 0.6, 1.2);
        } else {
          this.play('Walk', 0.3);
          this.current.timeScale = THREE.MathUtils.clamp(this.moveSpeed / 0.85, 0.6, 1.4);
        }
      } else {
        this.play('Idle');
      }
    }
    if (t.y < -20) this.die();
  }

  /** Después del paso de física: coloca el modelo y aplica la pose. */
  postPhysics() {
    if (this.posed) {
      for (const a of this.armBones) a.bone.quaternion.copy(a.quat);
      this.posed = false;
    }
    this.mixer.update(this.mixerDt ?? 0);
    if (!this.body) return;
    const t = this.body.translation();
    this.position.set(t.x, t.y - FOOT - 0.02, t.z);
    this.model.position.copy(this.position);
    this.model.rotation.y = this.facing;

    // Brazos extendidos hacia la presa mientras la persigue.
    if (this.arms > 0.02) {
      this.model.updateMatrixWorld(true);
      _axis.set(Math.cos(this.facing), 0, -Math.sin(this.facing));
      for (const a of this.armBones) {
        a.quat.copy(a.bone.quaternion);
        _q.setFromAxisAngle(_axis, -1.25 * this.arms);
        a.bone.getWorldQuaternion(_q2);
        _q.multiply(_q2);
        a.bone.parent.getWorldQuaternion(_pq);
        a.bone.quaternion.copy(_q.premultiply(_pq.invert()));
      }
      this.posed = true;
    }
  }
}

/** Horda por oleadas: la oleada N suelta N zombis y la siguiente llega al matarlos a todos. */
export class Horde {
  constructor(scene, physics, assets) {
    this.scene = scene;
    this.physics = physics;
    this.zombies = [];
    this.active = false;
    this.wave = 0;
    this.kills = 0;
    this.waveT = 0;
    this.onWave = null; // (número de oleada) => void

    // Plantilla del zombi: el mismo esqueleto del personaje (ya escalado y sin mallas).
    const template = assets.scene;
    this.template = template;
    this.clips = Object.fromEntries(assets.animations.map((c) => [c.name, c]));

    const cc = physics.world.createCharacterController(0.02);
    cc.setUp({ x: 0, y: 1, z: 0 });
    cc.enableAutostep(0.35, 0.2, false);
    cc.enableSnapToGround(0.3);
    cc.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(45));
    cc.setApplyImpulsesToDynamicBodies(true);
    cc.setCharacterMass(60);
    this.controller = cc;
  }

  get alive() {
    let n = 0;
    for (const z of this.zombies) if (z.alive) n++;
    return n;
  }

  start() {
    this.clear();
    this.active = true;
    this.wave = 0;
    this.kills = 0;
    this.waveT = 0.5;
  }

  stop() {
    this.active = false;
    this.clear();
  }

  clear() {
    for (const z of this.zombies) z.dispose();
    this.zombies.length = 0;
  }

  // Un punto libre alrededor del jugador, lejos de él y fuera de los obstáculos.
  spawnPoint(player) {
    const shape = new RAPIER.Capsule(HALF, RADIUS + 0.15);
    const rot = { x: 0, y: 0, z: 0, w: 1 };
    let x = 0, z = 0;
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
      x = THREE.MathUtils.clamp(player.position.x + Math.sin(a) * r, -ARENA, ARENA);
      z = THREE.MathUtils.clamp(player.position.z + Math.cos(a) * r, -ARENA, ARENA);
      if (Math.hypot(x - player.position.x, z - player.position.z) < SPAWN_MIN * 0.7) continue;
      const blocked = this.physics.world.intersectionWithShape({ x, y: FOOT + 0.3, z }, rot, shape);
      if (!blocked) break;
    }
    return { x, z };
  }

  /** El ruido (un disparo) atrae a los zombis cercanos. */
  noise(point, range = NOISE_RANGE) {
    for (const z of this.zombies) {
      if (z.position.distanceTo(point) < range) z.alert(point);
    }
  }

  update(dt, player) {
    if (this.active && this.alive === 0) {
      this.waveT -= dt;
      if (this.waveT <= 0) {
        this.wave++;
        this.waveT = WAVE_DELAY;
        for (let i = 0; i < this.wave; i++) {
          const p = this.spawnPoint(player);
          this.zombies.push(new Zombie(this, p.x, p.z));
        }
        this.onWave?.(this.wave);
      }
    }
    // Los zombis no chocan entre sí: un empuje suave evita que se amontonen.
    const zs = this.zombies;
    for (const z of zs) z.pushX = z.pushZ = 0;
    for (let i = 0; i < zs.length; i++) {
      if (!zs[i].alive) continue;
      for (let j = i + 1; j < zs.length; j++) {
        if (!zs[j].alive) continue;
        let dx = zs[i].position.x - zs[j].position.x, dz = zs[i].position.z - zs[j].position.z;
        let d = Math.hypot(dx, dz);
        if (d >= SEPARATION) continue;
        if (d < 1e-3) { dx = Math.random() - 0.5; dz = Math.random() - 0.5; d = Math.hypot(dx, dz); }
        const push = Math.min((SEPARATION - d) * 6, SEPARATION_SPEED) / d;
        zs[i].pushX += dx * push; zs[i].pushZ += dz * push;
        zs[j].pushX -= dx * push; zs[j].pushZ -= dz * push;
      }
    }
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i];
      z.update(dt, player);
      if (z.state === 'dead' && z.timer <= 0) {
        z.dispose();
        this.zombies.splice(i, 1);
      }
    }
  }

  postPhysics() {
    for (const z of this.zombies) {
      z.postPhysics();
      if (z.alive) z.skel.straightenFeet();
      z.skel.update();
    }
  }

}
