import * as THREE from 'three';
import { RAPIER, GROUPS } from './physics.js';

const BULLET_SPEED = 70;
const BULLET_LIFE = 2.5;
const BULLET_RADIUS = 0.05;
const BULLET_MASS = 0.12;
const MAX_RANGE = 120;
// Golpe contra el suelo: trozos que saltan y onda a ras de suelo.
const CHUNK_LIFE = 0.7; // s
const CHUNK_SPEED = 3.2; // m/s
const CHUNK_GRAVITY = 14;
const RING_SIZE = 1.1; // radio final de la onda (m)
export const COMBAT_TUNING = { BULLET_SPEED }; // lo muestra el catálogo

const _dir = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _point = new THREE.Vector3();
const _seg = new THREE.Vector3();
const Z = new THREE.Vector3(0, 0, 1);

// Proyectiles físicos, chispas de impacto y contador de aciertos.
export class Combat {
  constructor(scene, physics) {
    this.scene = scene;
    this.physics = physics;
    this.bullets = new Map(); // handle de collider -> bala
    this.sparks = [];
    this.player = null; // lo asigna main.js (a quién persigue un zombi herido)
    this.horde = null; // lo asigna main.js: las balas se comprueban contra el esqueleto de cada zombi
    this.targetHits = 0;
    this.punchHits = 0;

    this.bulletGeo = new THREE.CapsuleGeometry(0.03, 0.5, 4, 8).rotateX(Math.PI / 2);
    this.bulletMat = new THREE.MeshBasicMaterial({ color: 0xffd98a });
    this.sparkGeo = new THREE.SphereGeometry(1, 10, 8);
    this.chunks = []; // trozos que saltan de un golpe contra el suelo
    this.chunkGeo = new THREE.TetrahedronGeometry(0.035);
    this.chunkMat = new THREE.MeshLambertMaterial({ color: 0xa3c27a, flatShading: true });
    this.ringGeo = new THREE.RingGeometry(0.72, 1, 24).rotateX(-Math.PI / 2);
    this.jolt = 0; // sacudida pendiente para la cámara (m); la recoge main.js
    this.freeze = 0; // pausa del impacto que queda (s de tiempo real); la aplica main.js
    this.impacts = 0;
  }

  // Punto del mundo al que apunta la mira (centro de la pantalla).
  aimPoint(cam) {
    const camera = cam.camera;
    camera.getWorldDirection(_dir);
    // El rayo empieza a la altura del personaje para no dar a lo que hay entre él y la cámara.
    const skip = cam.current + 0.6;
    _origin.copy(camera.position).addScaledVector(_dir, skip);
    // Primero el escenario; después, el esqueleto de cada zombi (no su cápsula): la mira
    // marca exactamente la articulación o el hueso que tiene delante.
    const hit = this.physics.world.castRay(
      new RAPIER.Ray(_origin, _dir), MAX_RANGE, true, undefined, GROUPS.cover,
    );
    let dist = hit ? hit.timeOfImpact : MAX_RANGE;
    for (const z of this.horde?.zombies ?? []) {
      if (z.alive && z.trace(_origin, _dir, dist)) dist = z.hitAt;
    }
    return _point.copy(_origin).addScaledVector(_dir, dist);
  }

  fire(from, to) {
    _dir.copy(to).sub(from).normalize();
    const world = this.physics.world;
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(from.x, from.y, from.z)
        .setLinvel(_dir.x * BULLET_SPEED, _dir.y * BULLET_SPEED, _dir.z * BULLET_SPEED)
        .setGravityScale(0.3)
        .setCcdEnabled(true),
    );
    const collider = world.createCollider(
      RAPIER.ColliderDesc.ball(BULLET_RADIUS)
        .setMass(BULLET_MASS)
        .setRestitution(0)
        .setCollisionGroups(GROUPS.bullet)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body,
    );
    const mesh = new THREE.Mesh(this.bulletGeo, this.bulletMat);
    mesh.position.copy(from);
    mesh.quaternion.setFromUnitVectors(Z, _dir);
    this.scene.add(mesh);
    this.bullets.set(collider.handle, { body, mesh, life: BULLET_LIFE, dead: false, dir: _dir.clone(), from: from.clone() });
  }

  registerHit(meta, kind) {
    if (kind === 'punch') this.punchHits++;
    else if (meta?.isTarget) this.targetHits++;
  }

  spark(position, size = 0.25, color = 0xffc35a) {
    const mesh = new THREE.Mesh(
      this.sparkGeo,
      new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false }),
    );
    mesh.position.copy(position);
    this.scene.add(mesh);
    this.sparks.push({ mesh, t: 0, size });
  }

  /**
   * Golpe contra el suelo en `point` (a ras de suelo): onda, `chunks` trozos que saltan,
   * sacudida de cámara (`jolt`, m) y pausa del impacto (`freeze`, s).
   */
  impact(point, jolt, freeze = 0, chunks = 0) {
    this.impacts++;
    this.jolt = Math.max(this.jolt, jolt);
    this.freeze = Math.max(this.freeze, freeze);
    const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }));
    ring.position.copy(point).y += 0.03;
    this.scene.add(ring);
    this.sparks.push({ mesh: ring, t: 0, size: RING_SIZE * (freeze ? 1 : 0.5) });
    for (let i = 0; i < chunks; i++) {
      const mesh = new THREE.Mesh(this.chunkGeo, this.chunkMat);
      const a = (i / chunks) * Math.PI * 2 + Math.random(), out = CHUNK_SPEED * (0.35 + 0.65 * Math.random());
      mesh.position.copy(point).y += 0.15;
      mesh.rotation.set(Math.random() * 6, Math.random() * 6, 0);
      this.scene.add(mesh);
      this.chunks.push({ mesh, vx: Math.cos(a) * out, vy: CHUNK_SPEED * (0.6 + 0.8 * Math.random()), vz: Math.sin(a) * out, t: 0, floor: point.y + 0.03 });
    }
  }

  removeBullet(handle, bullet) {
    this.scene.remove(bullet.mesh);
    this.physics.world.removeRigidBody(bullet.body);
    this.bullets.delete(handle);
  }

  /** Después del paso de física. */
  update(dt) {
    // Impactos de bala
    this.physics.events.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      const b1 = this.bullets.get(h1), b2 = this.bullets.get(h2);
      const bullet = b1 ?? b2;
      if (!bullet || bullet.dead) return;
      bullet.dead = true;
      const meta = this.physics.meta.get(b1 ? h2 : h1);
      const p = bullet.body.translation();
      _point.set(p.x, p.y, p.z);
      if (meta?.body.isDynamic()) this.physics.flash(meta);
      this.registerHit(meta, 'bullet');
      this.spark(_point);
    });

    for (const [handle, b] of this.bullets) {
      b.life -= dt;
      if (b.dead || b.life <= 0) { this.removeBullet(handle, b); continue; }
      const p = b.body.translation();
      const v = b.body.linvel();
      // Zombis: la bala no choca con su cápsula; se comprueba el tramo recorrido en este
      // fotograma contra su esqueleto, articulación por articulación.
      const len = _seg.set(p.x, p.y, p.z).sub(b.from).length();
      if (len > 1e-4) {
        _seg.divideScalar(len);
        let struck = null, zone = null, at = len;
        for (const z of this.horde?.zombies ?? []) {
          if (!z.alive) continue;
          const found = z.trace(b.from, _seg, at);
          if (found) { struck = z; zone = found; at = z.hitAt; }
        }
        if (struck) {
          struck.shoot(zone, _seg, this.player);
          this.spark(_point.copy(b.from).addScaledVector(_seg, at));
          this.removeBullet(handle, b);
          continue;
        }
      }
      b.mesh.position.set(p.x, p.y, p.z);
      b.from.set(p.x, p.y, p.z);
      b.mesh.quaternion.setFromUnitVectors(Z, b.dir.set(v.x, v.y, v.z).normalize());
    }

    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const c = this.chunks[i], m = c.mesh;
      c.t += dt / CHUNK_LIFE;
      if (c.t >= 1) { this.scene.remove(m); this.chunks.splice(i, 1); continue; }
      c.vy -= CHUNK_GRAVITY * dt;
      m.position.x += c.vx * dt; m.position.y += c.vy * dt; m.position.z += c.vz * dt;
      if (m.position.y < c.floor && c.vy < 0) { m.position.y = c.floor; c.vy *= -0.35; c.vx *= 0.5; c.vz *= 0.5; }
      m.rotation.x += 9 * dt; m.rotation.z += 7 * dt;
      m.scale.setScalar(1 - c.t ** 3);
    }

    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.t += dt / 0.18;
      if (s.t >= 1) {
        this.scene.remove(s.mesh);
        s.mesh.material.dispose();
        this.sparks.splice(i, 1);
        continue;
      }
      s.mesh.scale.setScalar(s.size * (0.3 + s.t));
      s.mesh.material.opacity = 1 - s.t;
    }
  }
}
