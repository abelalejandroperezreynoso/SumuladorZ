import * as THREE from 'three';

// Coches patrulla del modo juego: en ellos quedó el arma reglamentaria. El jugador se acerca
// a la puerta del conductor, sube (`E`, cruceta abajo o el botón «Coche»), lo registra y baja
// con una pistola y balas. Cada coche se registra una vez por partida; mientras le queda algo,
// sus luces siguen girando.
export const PATROL = {
  alcance: 1.7, // distancia a la puerta para poder subir (m)
  tiempos: { entrar: 0.55, dentro: 1.5, salir: 0.5 }, // segundos de cada tramo
  balas: [14, 22], // balas que hay en cada coche (entre estos dos valores)
  puerta: 1.15, // lo que se abre la puerta (rad)
  // En el marco del coche (morro hacia +X): junto a la puerta del conductor y su asiento.
  fuera: [0.3, -1.55], asiento: [-0.15, -0.4], hundido: 0.38,
};

const doorGeo = new THREE.BoxGeometry(1.05, 0.5, 0.045).translate(-0.525, 0.25, 0); // la bisagra, en su borde delantero
const barGeo = new THREE.BoxGeometry(0.28, 0.13, 0.52);
const doorMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1f, roughness: 0.6 });
const offMat = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.6 });

export class Patrols {
  /** `marks`: dónde está cada coche ({ x, y, z, r }), anotado al construir la ciudad. */
  constructor(parent, marks) {
    this.red = new THREE.MeshStandardMaterial({ color: 0xc8322b, emissive: 0xff2a1a, emissiveIntensity: 0, roughness: 0.4 });
    this.blue = new THREE.MeshStandardMaterial({ color: 0x2a4d8f, emissive: 0x2a5cff, emissiveIntensity: 0, roughness: 0.4 });
    this.t = 0;
    this.cars = marks.map((m) => {
      const group = new THREE.Group();
      group.position.set(m.x, m.y, m.z);
      group.rotation.y = m.r;
      const door = new THREE.Mesh(doorGeo, doorMat);
      door.position.set(0.82, 0.39, -0.925);
      door.castShadow = true;
      const bars = [new THREE.Mesh(barGeo, this.red), new THREE.Mesh(barGeo, this.blue)];
      bars[0].position.set(-0.25, 1.45, 0.3);
      bars[1].position.set(-0.25, 1.45, -0.3);
      group.add(door, ...bars);
      parent.add(group);
      const c = Math.cos(m.r), s = Math.sin(m.r);
      const at = ([x, z]) => new THREE.Vector3(m.x + x * c + z * s, m.y, m.z - x * s + z * c);
      return { group, door, bars, looted: false, open: 0, out: at(PATROL.fuera), seat: at(PATROL.asiento), facing: m.r + Math.PI / 2 };
    });
  }

  /** El coche sin registrar a cuya puerta está el jugador (o null). */
  near(pos) {
    for (const car of this.cars) {
      if (!car.looted && Math.hypot(car.out.x - pos.x, car.out.z - pos.z) < PATROL.alcance && Math.abs(car.out.y - pos.y) < 1) return car;
    }
    return null;
  }

  /** Marca un coche como registrado y devuelve cuántas balas tenía. */
  loot(car) {
    car.looted = true;
    for (const b of car.bars) b.material = offMat;
    return Math.round(THREE.MathUtils.lerp(PATROL.balas[0], PATROL.balas[1], Math.random()));
  }

  reset() {
    for (const car of this.cars) {
      car.looted = false;
      car.open = 0;
      car.door.rotation.y = 0;
      car.bars[0].material = this.red;
      car.bars[1].material = this.blue;
    }
  }

  /** `riding`: el coche en el que está subido el jugador (su puerta se abre). `dark`: 0 de día, 1 de noche. */
  update(dt, riding, dark) {
    this.t += dt;
    const k = 0.6 + 2.2 * dark, on = Math.sin(this.t * 9) > 0;
    this.red.emissiveIntensity = on ? k : 0.05;
    this.blue.emissiveIntensity = on ? 0.05 : k;
    for (const car of this.cars) {
      const want = car === riding || car.looted ? 1 : 0;
      if (Math.abs(car.open - want) < 0.001) continue;
      car.open = THREE.MathUtils.damp(car.open, want, 9, dt);
      car.door.rotation.y = -PATROL.puerta * car.open; // hacia fuera (el lado del conductor es -Z)
    }
  }
}
