import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { url as wasmUrl, bytes as wasmBytes } from 'virtual:rapier-wasm';
import { download } from './download.js';

export { RAPIER };

// Grupos de colisión: (pertenencia << 16) | filtro
const G_WORLD = 0x0001;
const G_PLAYER = 0x0002;
const G_BULLET = 0x0004;
const G_ENEMY = 0x0010;
const ALL = 0xffff;
export const GROUPS = {
  player: (G_PLAYER << 16) | (ALL & ~G_BULLET),
  bullet: (G_BULLET << 16) | (ALL & ~(G_PLAYER | G_BULLET)),
  // Consultas (rayos de apuntado, golpes): todo menos jugador y balas.
  query: (0x0008 << 16) | G_WORLD | G_ENEMY,
  // Sondeo de coberturas: solo el escenario (ni jugador, ni balas, ni zombis).
  cover: (0x0008 << 16) | G_WORLD,
  // Zombis: chocan con todo (también reciben balas) salvo al calcular su propio movimiento.
  enemy: (G_ENEMY << 16) | (ALL & ~G_BULLET),
  enemyBody: (G_ENEMY << 16) | ALL,
  // Al moverse, un zombi ignora a los demás: se separan con un empuje suave (ver horde.js).
  // Trozos desprendidos de un zombi: solo chocan con el escenario.
  debris: (0x0020 << 16) | G_WORLD,
  enemyMove: (G_ENEMY << 16) | (ALL & ~(G_BULLET | G_ENEMY)),
};

export async function initPhysics() {
  // En la versión publicada el motor (wasm) va en un archivo aparte en vez de incrustado en el
  // script: pesa menos al descargar y se puede mostrar el progreso (ver vite.config.js).
  if (wasmUrl) globalThis.__rapierWasm = await download(wasmUrl, wasmBytes);
  await RAPIER.init();
  delete globalThis.__rapierWasm;
}

// Envuelve el mundo de Rapier y mantiene sincronizadas las mallas de Three.
export class Physics {
  constructor(scene) {
    this.scene = scene;
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.events = new RAPIER.EventQueue(true);
    this.objects = []; // { mesh, body, spawn }
    this.meta = new Map(); // handle de collider -> { mesh, body, isTarget, flash }
    this.flashing = new Set();
  }

  step(dt) {
    this.world.timestep = Math.min(Math.max(dt, 1 / 240), 1 / 30);
    this.world.step(this.events);
  }

  // Copia las transformaciones de los cuerpos dinámicos a sus mallas.
  sync(dt) {
    for (const o of this.objects) {
      if (o.body.isSleeping()) continue;
      const t = o.body.translation();
      const r = o.body.rotation();
      o.mesh.position.set(t.x, t.y, t.z);
      o.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
    for (const m of this.flashing) {
      m.flash -= dt;
      const k = Math.max(m.flash, 0) / 0.18;
      m.mesh.material.emissive.setRGB(k, k * 0.55, k * 0.1);
      if (m.flash <= 0) this.flashing.delete(m);
    }
  }

  flash(meta) {
    if (!meta?.mesh?.material?.emissive) return;
    meta.flash = 0.18;
    this.flashing.add(meta);
  }

  // Devuelve todos los cuerpos dinámicos a su posición inicial.
  reset() {
    for (const o of this.objects) {
      o.body.setTranslation(o.spawn.pos, true);
      o.body.setRotation(o.spawn.rot, true);
      o.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      o.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  }

  /**
   * Crea un cuerpo con malla.
   * shape: 'box' (size [x,y,z]) | 'ball' (radius) | 'cylinder' | 'capsule' (radius, height)
   */
  add({ shape = 'box', size = [1, 1, 1], radius = 0.5, height = 1, pos = [0, 0, 0], euler = [0, 0, 0],
        dynamic = false, mass = 5, color = 0x8899aa, material, friction = 0.8, restitution = 0.1,
        isTarget = false, damping = 0.05, angularDamping = 0.3, shadow = true, visible = true }) {
    let geometry, colliderDesc;
    if (shape === 'box') {
      geometry = new THREE.BoxGeometry(...size);
      colliderDesc = RAPIER.ColliderDesc.cuboid(size[0] / 2, size[1] / 2, size[2] / 2);
    } else if (shape === 'ball') {
      geometry = new THREE.SphereGeometry(radius, 24, 16);
      colliderDesc = RAPIER.ColliderDesc.ball(radius);
    } else if (shape === 'cylinder') {
      geometry = new THREE.CylinderGeometry(radius, radius, height, 20);
      colliderDesc = RAPIER.ColliderDesc.cylinder(height / 2, radius);
    } else if (shape === 'capsule') {
      geometry = new THREE.CapsuleGeometry(radius, height, 6, 16);
      colliderDesc = RAPIER.ColliderDesc.capsule(height / 2, radius);
    }
    const mesh = new THREE.Mesh(
      geometry,
      material ?? new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05 }),
    );
    mesh.visible = visible;
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    mesh.position.set(...pos);
    mesh.rotation.set(...euler);
    this.scene.add(mesh);

    const q = mesh.quaternion;
    const bodyDesc = (dynamic ? RAPIER.RigidBodyDesc.dynamic() : RAPIER.RigidBodyDesc.fixed())
      .setTranslation(...pos)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    if (dynamic) bodyDesc.setLinearDamping(damping).setAngularDamping(angularDamping);
    const body = this.world.createRigidBody(bodyDesc);
    colliderDesc.setFriction(friction).setRestitution(restitution);
    if (dynamic) colliderDesc.setMass(mass);
    const collider = this.world.createCollider(colliderDesc, body);

    const meta = { mesh, body, isTarget, flash: 0 };
    this.meta.set(collider.handle, meta);
    if (dynamic) {
      this.objects.push({
        mesh, body,
        spawn: { pos: { x: pos[0], y: pos[1], z: pos[2] }, rot: { x: q.x, y: q.y, z: q.z, w: q.w } },
      });
    }
    return { mesh, body, collider };
  }
}
