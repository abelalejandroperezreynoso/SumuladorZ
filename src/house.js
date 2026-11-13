import * as THREE from 'three';
import { RAPIER } from './physics.js';

// Casa de una planta: cuatro muros con huecos de puerta y ventanas, suelo y techo plano.
// Medidas en metros. Las ventanas no tienen cristal: se pasa por ellas como por una barda
// (su alféizar queda a la altura del paso con apoyo de mano) y se dispara a través.
const HOUSE = {
  x: -16, z: 2, // centro
  ancho: 8, fondo: 6, // en X y en Z
  alto: 2.7, muro: 0.2, techo: 0.2,
  puerta: { ancho: 1.1, alto: 2.1 },
  ventana: { ancho: 1.3, bajo: 1.0, alto: 2.05 }, // alféizar y dintel sobre el suelo
};
// Puerta: se abre sola, hacia el lado contrario, cuando alguien se acerca, y se cierra al irse.
const DOOR = { cerca: 1.7, giro: 1.75, rapidez: 7, grosor: 0.06 };
export const HOUSE_TUNING = { HOUSE, DOOR }; // lo muestra el catálogo

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
    const win = (at) => ({ at, w: H.ventana.ancho, y0: H.ventana.bajo, y1: H.ventana.alto });
    const doorZ = H.z + 1.2;
    // Este (hacia el inicio): puerta y una ventana. Los muros a lo largo de Z van entre los otros dos.
    wall(false, H.x + hx - H.muro / 2, H.z - hz + H.muro, H.z + hz - H.muro,
      [{ at: doorZ, w: H.puerta.ancho, y0: 0, y1: H.puerta.alto }, win(H.z - 1.3)]);
    wall(false, H.x - hx + H.muro / 2, H.z - hz + H.muro, H.z + hz - H.muro, [win(H.z)]); // oeste
    wall(true, H.z - hz + H.muro / 2, H.x - hx, H.x + hx, [win(H.x - 2), win(H.x + 2)]); // norte
    wall(true, H.z + hz - H.muro / 2, H.x - hx, H.x + hx, [win(H.x - 2), win(H.x + 2)]); // sur
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
  }
}
