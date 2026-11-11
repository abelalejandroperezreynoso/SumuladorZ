import * as THREE from 'three';
import { RAPIER, GROUPS } from './physics.js';

const BULLET_SPEED = 70;
const BULLET_LIFE = 2.5;
const BULLET_RADIUS = 0.05;
const BULLET_MASS = 0.12;
const MAX_RANGE = 120;

const _dir = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _point = new THREE.Vector3();
const Z = new THREE.Vector3(0, 0, 1);

// Proyectiles físicos, chispas de impacto y contador de aciertos.
export class Combat {
  constructor(scene, physics) {
    this.scene = scene;
    this.physics = physics;
    this.bullets = new Map(); // handle de collider -> bala
    this.sparks = [];
    this.player = null; // lo asigna main.js (a quién persigue un zombi herido)
    this.targetHits = 0;
    this.punchHits = 0;

    this.bulletGeo = new THREE.CapsuleGeometry(0.03, 0.5, 4, 8).rotateX(Math.PI / 2);
    this.bulletMat = new THREE.MeshBasicMaterial({ color: 0xffd98a });
    this.sparkGeo = new THREE.SphereGeometry(1, 10, 8);
  }

  // Punto del mundo al que apunta la mira (centro de la pantalla).
  aimPoint(cam) {
    const camera = cam.camera;
    camera.getWorldDirection(_dir);
    // El rayo empieza a la altura del personaje para no dar a lo que hay entre él y la cámara.
    const skip = cam.current + 0.6;
    _origin.copy(camera.position).addScaledVector(_dir, skip);
    const hit = this.physics.world.castRay(
      new RAPIER.Ray(_origin, _dir), MAX_RANGE, true, undefined, GROUPS.query,
    );
    return _point.copy(_origin).addScaledVector(_dir, hit ? hit.timeOfImpact : MAX_RANGE);
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
    this.bullets.set(collider.handle, { body, mesh, life: BULLET_LIFE, dead: false });
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
      if (meta?.zombie) meta.zombie.damage(1, this.player);
      else if (meta?.body.isDynamic()) this.physics.flash(meta);
      this.registerHit(meta, 'bullet');
      const p = bullet.body.translation();
      this.spark(_point.set(p.x, p.y, p.z));
    });

    for (const [handle, b] of this.bullets) {
      b.life -= dt;
      if (b.dead || b.life <= 0) { this.removeBullet(handle, b); continue; }
      const p = b.body.translation();
      const v = b.body.linvel();
      b.mesh.position.set(p.x, p.y, p.z);
      b.mesh.quaternion.setFromUnitVectors(Z, _dir.set(v.x, v.y, v.z).normalize());
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
