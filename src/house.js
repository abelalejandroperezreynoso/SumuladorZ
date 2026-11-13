import * as THREE from 'three';
import { RAPIER } from './physics.js';

// Casa de una planta: cuatro muros con huecos de puerta y ventanas, suelo y techo plano.
// Medidas en metros. Por las ventanas se pasa como por una barda
// (su alféizar queda a la altura del paso con apoyo de mano), una vez roto su cristal.
const HOUSE = {
  x: -16, z: 2, // centro
  ancho: 8, fondo: 6, // en X y en Z
  alto: 2.7, muro: 0.2, techo: 0.2,
  puerta: { ancho: 1.1, alto: 2.1 },
  ventana: { ancho: 1.3, bajo: 1.0, alto: 2.05 }, // alféizar y dintel sobre el suelo
};
// Cristales: una hoja fija en cada ventana. Se rompen de un balazo, de un golpe (puño o bate)
// o cuando un zombi los revienta para entrar; rotos, dejan pasar. `trozos` que saltan y lo que duran (s).
const GLASS = { grosor: 0.03, trozos: 16, vida: 1.1 };
// Por dónde cruza un zombi el muro de la casa: se planta a `frente` m del hueco, y vale estar
// a `cerca` m de ese punto para empezar a trepar; `espera` (s) entre uno y el siguiente.
const ENTRY = { frente: 0.7, cerca: 0.45, espera: 1.3, pasillo: 0.45 };
// Puerta: se abre sola, hacia el lado contrario, cuando alguien se acerca, y se cierra al irse.
const DOOR = { cerca: 1.7, giro: 1.75, rapidez: 7, grosor: 0.06 };
export const HOUSE_TUNING = { HOUSE, DOOR, GLASS, ENTRY }; // lo muestra el catálogo

const WALL = 0xb9a58a, FRAME = 0x6b4a2f, ROOF = 0x7a3b2e, FLOOR = 0x8c7a66;

export class House {
  constructor(scene, physics) {
    const H = HOUSE, hx = H.ancho / 2, hz = H.fondo / 2;
    this.physics = physics;
    // Un muro a lo largo de X (`alongX`) o de Z, de `from` a `to`, con huecos
    // { at (centro), w, y0, y1 }: macizo entre huecos, y antepecho y dintel en cada uno.
    const wall = (alongX, fixed, from, to, holes) => {
      const piece = (a, b, y0, y1, color = WALL) => {
        if (b - a < 0.01 || y1 - y0 < 0.01) return;
        const mid = (a + b) / 2, len = b - a;
        physics.add({
          size: alongX ? [len, y1 - y0, H.muro] : [H.muro, y1 - y0, len],
          pos: alongX ? [mid, (y0 + y1) / 2, fixed] : [fixed, (y0 + y1) / 2, mid], color,
        });
      };
      let at = from;
      for (const h of holes.slice().sort((p, q) => p.at - q.at)) {
        piece(at, h.at - h.w / 2, 0, H.alto);
        piece(h.at - h.w / 2, h.at + h.w / 2, 0, h.y0);
        piece(h.at - h.w / 2, h.at + h.w / 2, h.y1, H.alto);
        at = h.at + h.w / 2;
      }
      piece(at, to, 0, H.alto);
    };
    this.scene = scene;
    this.windows = []; // { x, z, nx, nz (hacia fuera), mesh, collider, broken, busy }
    this.shards = [];
    this.broken = 0; // cristales rotos (para el catálogo y las pruebas)
    this.glassMat = new THREE.MeshStandardMaterial({ color: 0xa9dcee, transparent: true, opacity: 0.32, roughness: 0.08,
      metalness: 0.1, side: THREE.DoubleSide, depthWrite: false });
    this.shardGeo = new THREE.TetrahedronGeometry(0.05);
    this.shardMat = new THREE.MeshStandardMaterial({ color: 0xcfeefa, transparent: true, opacity: 0.7, roughness: 0.1, flatShading: true });
    const V = H.ventana;
    // Hueco de ventana en un muro; de paso crea su cristal. `out`: +1 o -1, hacia dónde queda fuera.
    const win = (at, alongX, fixed, out) => {
      const size = alongX ? [V.ancho, V.alto - V.bajo, GLASS.grosor] : [GLASS.grosor, V.alto - V.bajo, V.ancho];
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), this.glassMat);
      mesh.position.set(alongX ? at : fixed, (V.bajo + V.alto) / 2, alongX ? fixed : at);
      scene.add(mesh);
      const body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(mesh.position.x, mesh.position.y, mesh.position.z));
      const collider = physics.world.createCollider(RAPIER.ColliderDesc.cuboid(size[0] / 2, size[1] / 2, size[2] / 2), body);
      const w = { x: mesh.position.x, z: mesh.position.z, nx: alongX ? 0 : out, nz: alongX ? out : 0, mesh, collider, broken: false, busy: 0 };
      // Balas y golpes llegan aquí por `physics.meta` (ver Combat.update y Player.hitPunch).
      physics.meta.set(collider.handle, { body, glass: true, break: (dir) => this.breakGlass(w, dir) });
      this.windows.push(w);
      return { at, w: V.ancho, y0: V.bajo, y1: V.alto };
    };
    const doorZ = H.z + 1.2;
    // Este (hacia el inicio): puerta y una ventana. Los muros a lo largo de Z van entre los otros dos.
    wall(false, H.x + hx - H.muro / 2, H.z - hz + H.muro, H.z + hz - H.muro,
      [{ at: doorZ, w: H.puerta.ancho, y0: 0, y1: H.puerta.alto }, win(H.z - 1.3, false, H.x + hx - H.muro / 2, 1)]);
    wall(false, H.x - hx + H.muro / 2, H.z - hz + H.muro, H.z + hz - H.muro, [win(H.z, false, H.x - hx + H.muro / 2, -1)]); // oeste
    wall(true, H.z - hz + H.muro / 2, H.x - hx, H.x + hx, [-2, 2].map((d) => win(H.x + d, true, H.z - hz + H.muro / 2, -1))); // norte
    wall(true, H.z + hz - H.muro / 2, H.x - hx, H.x + hx, [-2, 2].map((d) => win(H.x + d, true, H.z + hz - H.muro / 2, 1))); // sur
    this.doorway = { x: H.x + hx - H.muro / 2, z: doorZ, nx: 1, nz: 0, door: true };
    // Suelo (solo se ve: no levanta el paso) y techo plano.
    const floor = new THREE.Mesh(new THREE.BoxGeometry(H.ancho - 2 * H.muro, 0.02, H.fondo - 2 * H.muro),
      new THREE.MeshStandardMaterial({ color: FLOOR, roughness: 0.9 }));
    floor.position.set(H.x, 0.011, H.z);
    floor.receiveShadow = true;
    scene.add(floor);
    physics.add({ size: [H.ancho + 0.5, H.techo, H.fondo + 0.5], pos: [H.x, H.alto + H.techo / 2, H.z], color: ROOF });

    // Luz interior suave: bajo el techo apenas llega la del cielo.
    const lamp = new THREE.PointLight(0xffe2b8, 14, 9, 1.6);
    lamp.position.set(H.x, H.alto - 0.35, H.z);
    scene.add(lamp);

    // Hoja de la puerta: cuerpo cinemático que gira sobre su bisagra (el lado norte del hueco).
    const P = H.puerta;
    this.hinge = new THREE.Vector3(H.x + hx - H.muro / 2, 0, doorZ - P.ancho / 2);
    this.door = new THREE.Group();
    this.door.position.copy(this.hinge);
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(DOOR.grosor, P.alto - 0.04, P.ancho - 0.04),
      new THREE.MeshStandardMaterial({ color: FRAME, roughness: 0.7 }));
    leaf.position.set(0, P.alto / 2, P.ancho / 2);
    leaf.castShadow = leaf.receiveShadow = true;
    this.door.add(leaf);
    scene.add(this.door);
    this.body = physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(this.hinge.x, 0, this.hinge.z));
    physics.world.createCollider(
      RAPIER.ColliderDesc.cuboid(DOOR.grosor / 2, P.alto / 2 - 0.02, P.ancho / 2 - 0.02).setTranslation(0, P.alto / 2, P.ancho / 2),
      this.body);
    this.center = new THREE.Vector3(this.hinge.x, 0, doorZ);
    this.angle = 0; // giro actual de la hoja (rad; + se abre hacia fuera, hacia +X)
    this.goal = 0;
    this.open = 0; // 0-1, para el catálogo
  }

  /** ¿Está el punto dentro de la casa? (Dentro del muro no cuenta.) */
  inside(p) {
    const H = HOUSE;
    return Math.abs(p.x - H.x) < H.ancho / 2 - H.muro && Math.abs(p.z - H.z) < H.fondo / 2 - H.muro;
  }

  /** Rompe el cristal de una ventana: deja de estorbar y saltan trozos hacia `dir` (o hacia los dos lados). */
  breakGlass(w, dir = null) {
    if (w.broken) return false;
    w.broken = true;
    this.broken++;
    w.mesh.visible = false;
    w.collider.setEnabled(false);
    const V = HOUSE.ventana, tx = -w.nz, tz = w.nx; // a lo largo del muro
    const push = dir ? Math.sign(dir.x * w.nx + dir.z * w.nz) || 1 : 0;
    for (let i = 0; i < GLASS.trozos; i++) {
      const mesh = new THREE.Mesh(this.shardGeo, this.shardMat);
      const a = (Math.random() - 0.5) * V.ancho, out = (push || (i % 2 ? 1 : -1)) * (0.6 + 2.2 * Math.random());
      mesh.position.set(w.x + tx * a, V.bajo + Math.random() * (V.alto - V.bajo), w.z + tz * a);
      mesh.rotation.set(Math.random() * 6, Math.random() * 6, 0);
      mesh.scale.setScalar(0.6 + Math.random());
      this.scene.add(mesh);
      this.shards.push({ mesh, vx: w.nx * out + tx * (Math.random() - 0.5), vy: 1.5 * Math.random(), vz: w.nz * out + tz * (Math.random() - 0.5), t: 0 });
    }
    return true;
  }

  /** Vuelve a poner todos los cristales (al reiniciar el mundo). */
  reset() {
    for (const w of this.windows) {
      w.broken = false;
      w.busy = 0;
      w.mesh.visible = true;
      w.collider.setEnabled(true);
    }
    this.broken = 0;
  }

  /**
   * Por dónde cruza un zombi el muro para llegar de `pos` a `target` cuando uno está dentro y
   * el otro fuera: el hueco (ventana, o la puerta) que menos rodeo le supone. Devuelve adónde
   * ir ahora ({ x, z }) y, si ya está plantado ante una ventana libre, `window` y `side`
   * (+1 si entra desde fuera) para que empiece a trepar. A rastras solo vale la puerta.
   */
  route(pos, target, crawler = false) {
    const a = this.inside(pos);
    if (a === this.inside(target)) return null;
    const side = a ? -1 : 1, E = ENTRY;
    let best = null, cost = Infinity;
    for (const o of crawler ? [this.doorway] : [this.doorway, ...this.windows]) {
      const c = Math.hypot(o.x - pos.x, o.z - pos.z) + Math.hypot(o.x - target.x, o.z - target.z) + (o.busy > 0 ? 2 : 0);
      if (c < cost) { cost = c; best = o; }
    }
    const ax = best.x + best.nx * side * E.frente, az = best.z + best.nz * side * E.frente;
    const d = Math.hypot(ax - pos.x, az - pos.z);
    if (best.door) {
      // Ya en el pasillo de la puerta (o ante ella): sigue recto hasta el otro lado.
      const rx = pos.x - best.x, rz = pos.z - best.z;
      const lateral = Math.abs(rx * best.nz - rz * best.nx), depth = Math.abs(rx * best.nx + rz * best.nz);
      if (d < 0.5 || (lateral < E.pasillo && depth < 1)) return { x: best.x - best.nx * side, z: best.z - best.nz * side };
      return { x: ax, z: az };
    }
    return { x: ax, z: az, window: d < E.cerca && best.busy <= 0 ? best : null, side };
  }

  /** Abre la puerta ante quien se acerque (jugador o zombis) y la cierra cuando no queda nadie. */
  update(dt, characters) {
    let near = null, best = DOOR.cerca;
    for (const c of characters) {
      const d = Math.hypot(c.x - this.center.x, c.z - this.center.z);
      if (d < best) { best = d; near = c; }
    }
    // Se abre alejándose de quien llega; ya abierta, no cambia de lado mientras haya alguien.
    if (!near) this.goal = 0;
    else if (Math.abs(this.goal) < 0.01) this.goal = near.x > this.center.x ? -DOOR.giro : DOOR.giro;
    this.angle = THREE.MathUtils.damp(this.angle, this.goal, DOOR.rapidez, dt);
    this.open = Math.abs(this.angle) / DOOR.giro;
    this.door.rotation.y = this.angle;
    const q = this.door.quaternion;
    this.body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    // Ventanas ocupadas y trozos de cristal en el aire.
    for (const w of this.windows) w.busy = Math.max(0, w.busy - dt);
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i], m = s.mesh;
      s.t += dt / GLASS.vida;
      if (s.t >= 1) { this.scene.remove(m); this.shards.splice(i, 1); continue; }
      s.vy -= 12 * dt;
      m.position.x += s.vx * dt; m.position.y += s.vy * dt; m.position.z += s.vz * dt;
      if (m.position.y < 0.03) { m.position.y = 0.03; s.vy = 0; s.vx *= 0.8; s.vz *= 0.8; }
      else { m.rotation.x += 8 * dt; m.rotation.z += 6 * dt; }
      if (s.t > 0.7) m.scale.multiplyScalar(Math.exp(-6 * dt));
    }
  }
}
