import * as THREE from 'three';

// Objetos que se recogen pasando por encima: la pistola, el bate y cajas de balas. Flotan y
// giran sobre un aro de color. Las cajas del escenario reaparecen un rato después de cogerlas
// y los zombis a veces sueltan una al morir (esas desaparecen si no se recogen).

const REACH = 1.0; // distancia horizontal para recogerlo (m)
const AMMO_RESPAWN = 25; // segundos hasta que una caja del escenario vuelve a aparecer
const DROP_CHANCE = 0.4; // probabilidad de que un zombi suelte balas
const DROP_AMMO = 5;
const DROP_LIFE = 30; // segundos que dura una caja soltada por un zombi
const BOX_AMMO = 10;
const GUN_AMMO = 12; // balas que trae la pistola
export const PICKUP_TUNING = { REACH, AMMO_RESPAWN, DROP_CHANCE, DROP_AMMO, DROP_LIFE, BOX_AMMO, GUN_AMMO };

// Dónde está cada objeto al empezar: [tipo, x, z].
const LAYOUT = [
  ['pistola', 1.6, -2.6], ['bate', -1.6, -2.6],
  ['balas', 6, -3], ['balas', -7, -1], ['balas', 4, 5], ['balas', -4, 7], ['balas', 0, -11], ['balas', -9, -9],
];
const RING_COLORS = { pistola: 0xffd479, bate: 0xff9a4d, balas: 0x8fd16a };

// Punta del cañón de la pistola, en su propio marco (de ahí salen las balas y el fogonazo).
export const GUN_MUZZLE = new THREE.Vector3(0, 0.086, 0.215);
const steelMat = new THREE.MeshStandardMaterial({ color: 0x8a929b, metalness: 0.35, roughness: 0.4 });
const gripMat = new THREE.MeshStandardMaterial({ color: 0x2b2f35, metalness: 0.05, roughness: 0.85 });
// Corredera. Poco metálica a propósito: sin mapa de entorno, un metal puro se ve negro.
export const gunMat = new THREE.MeshStandardMaterial({ color: 0x4d555e, metalness: 0.3, roughness: 0.45 });

/**
 * Pistola semiautomática: corredera, armazón, empuñadura inclinada, guardamonte, gatillo,
 * miras y boca del cañón. El origen es la empuñadura (donde la sujeta la mano); el cañón
 * queda encima y apunta a +Z. `material` es el de la corredera.
 */
export function makeGun(material = gunMat) {
  const gun = new THREE.Group();
  const box = (w, h, d, x, y, z, mat = material) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    gun.add(m);
    return m;
  };
  box(0.036, 0.044, 0.25, 0, 0.088, 0.075); // corredera
  box(0.038, 0.012, 0.07, 0, 0.1, -0.01); // estrías de la corredera, atrás
  box(0.03, 0.03, 0.2, 0, 0.052, 0.09, gripMat); // armazón
  box(0.034, 0.14, 0.058, 0, -0.012, -0.012, gripMat).rotation.x = 0.26; // empuñadura, inclinada
  box(0.038, 0.014, 0.066, 0, -0.082, -0.03, steelMat).rotation.x = 0.26; // base del cargador
  box(0.012, 0.008, 0.07, 0, -0.004, 0.085, gripMat); // guardamonte: tramo inferior
  box(0.012, 0.044, 0.008, 0, 0.016, 0.118, gripMat); // ...y delantero
  box(0.008, 0.026, 0.008, 0, 0.022, 0.07, steelMat).rotation.x = -0.3; // gatillo
  box(0.006, 0.012, 0.012, 0, 0.114, 0.185, steelMat); // punto de mira
  box(0.022, 0.012, 0.01, 0, 0.114, -0.04, steelMat); // alza
  box(0.024, 0.02, 0.05, 0.008, 0.094, 0.07, steelMat); // ventana de expulsión
  const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.02, 10).rotateX(Math.PI / 2), steelMat);
  muzzle.position.set(0, 0.086, 0.205);
  gun.add(muzzle);
  gun.traverse((o) => { o.castShadow = true; });
  return gun;
}

/** Bate de béisbol: madera clara, más grueso hacia la punta y el mango negro. El origen es el puño; se extiende sobre +Z. */
export function makeBat() {
  const bat = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0xc8955a, roughness: 0.6 });
  const tape = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.016, 0.62, 12).rotateX(Math.PI / 2), wood);
  body.position.z = 0.42;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.22, 10).rotateX(Math.PI / 2), tape);
  handle.position.z = 0.03;
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.02, 12).rotateX(Math.PI / 2), tape);
  knob.position.z = -0.085;
  bat.add(body, handle, knob);
  bat.traverse((o) => { o.castShadow = true; });
  return bat;
}

/** Caja de balas: caja verde oliva con tres cartuchos de latón encima. */
function makeAmmoBox() {
  const box = new THREE.Group();
  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.22),
    new THREE.MeshStandardMaterial({ color: 0x55613a, roughness: 0.8 }));
  const brass = new THREE.MeshStandardMaterial({ color: 0xd6a842, metalness: 0.7, roughness: 0.35 });
  box.add(crate);
  for (let i = -1; i <= 1; i++) {
    const round = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.11, 10), brass);
    round.position.set(i * 0.07, 0.14, 0);
    box.add(round);
  }
  box.traverse((o) => { o.castShadow = true; });
  return box;
}

const ringGeo = new THREE.RingGeometry(0.34, 0.42, 32).rotateX(-Math.PI / 2);

export class Pickups {
  /** onTake(texto) avisa al recoger algo. */
  constructor(scene, player, onTake) {
    this.scene = scene;
    this.player = player;
    this.onTake = onTake;
    this.items = [];
    this.t = 0;
    this.reset();
  }

  /** Crea un objeto en (x, z). `life` > 0: desaparece pasado ese tiempo. */
  drop(type, x, z, amount, { life = 0, fixed = false } = {}) {
    const group = new THREE.Group();
    const model = type === 'pistola' ? makeGun(gunMat) : type === 'bate' ? makeBat() : makeAmmoBox();
    if (type === 'pistola') { model.scale.setScalar(1.5); model.traverse((o) => { o.castShadow = true; }); }
    if (type === 'bate') model.rotation.set(0.5, 0, 0.3); // inclinado para que se vea entero
    if (type === 'bate') model.position.z = -0.3;
    const spin = new THREE.Group();
    spin.add(model);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: RING_COLORS[type], transparent: true, opacity: 0.85, depthWrite: false,
    }));
    ring.position.y = 0.02;
    group.add(spin, ring);
    group.position.set(x, 0, z);
    this.scene.add(group);
    const item = {
      type, amount: amount ?? (type === 'balas' ? BOX_AMMO : type === 'pistola' ? GUN_AMMO : 0),
      group, spin, ring, life, fixed, taken: false, back: 0, phase: Math.random() * 6,
    };
    this.items.push(item);
    return item;
  }

  /** Quita todos los objetos. */
  clear() {
    for (const it of this.items) this.scene.remove(it.group);
    this.items = [];
  }

  /** Deja el escenario como al empezar. */
  reset() {
    this.clear();
    for (const [type, x, z] of LAYOUT) this.drop(type, x, z, undefined, { fixed: true });
  }

  /** Un zombi ha muerto en `position`: a veces suelta balas. */
  zombieDied(position) {
    if (Math.random() < DROP_CHANCE) this.drop('balas', position.x, position.z, DROP_AMMO, { life: DROP_LIFE });
  }

  update(dt) {
    this.t += dt;
    const P = this.player;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (it.taken) {
        // Las cajas del escenario reaparecen; lo demás ya se quitó.
        it.back -= dt;
        if (it.back <= 0) { it.taken = false; it.group.visible = true; }
        continue;
      }
      if (it.life > 0) {
        it.life -= dt;
        if (it.life <= 0) { this.remove(i); continue; }
        it.group.visible = it.life > 4 || Math.sin(it.life * 18) > 0; // parpadea al final
      }
      it.spin.position.y = 0.45 + Math.sin(this.t * 2.4 + it.phase) * 0.07;
      it.spin.rotation.y += dt * 1.6;
      it.ring.material.opacity = 0.55 + Math.sin(this.t * 4 + it.phase) * 0.3;

      const dx = P.position.x - it.group.position.x, dz = P.position.z - it.group.position.z;
      if (dx * dx + dz * dz > REACH * REACH || Math.abs(P.position.y - it.group.position.y) > 1.5) continue;
      // Con la caja llena no se gasta: se queda en el suelo.
      if (it.type === 'balas' && P.ammo >= 99 && !P.infiniteAmmo) continue;
      this.onTake?.(P.pickUp(it.type, it.amount), it.type);
      if (it.type === 'balas' && it.fixed) {
        it.taken = true;
        it.back = AMMO_RESPAWN;
        it.group.visible = false;
      } else this.remove(i);
    }
  }

  remove(i) {
    this.scene.remove(this.items[i].group);
    this.items.splice(i, 1);
  }
}
