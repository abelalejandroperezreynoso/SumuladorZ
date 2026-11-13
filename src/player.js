import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { RAPIER, GROUPS } from './physics.js';
import { SkeletonView } from './skeleton.js';
import { Gait, CLIP_SPEED } from './gait.js';
import { makeGun, makeBat, GUN_MUZZLE } from './pickups.js';
import { fixProportions } from './proportions.js';
import { probeWall, COVER_BASE_Y, COVER_LOW_Y, COVER_HIGH_Y } from './cover.js';
// Importado como recurso: el nombre publicado lleva un hash, así un modelo nuevo nunca
// se confunde con uno antiguo guardado en la caché del navegador.
import modelUrl from './assets/Character.glb?url';
import { download } from './download.js';

let modelData = null;
/** Empieza a descargar el modelo (para hacerlo a la vez que el motor de físicas). */
export function preloadModel() {
  modelData ??= download(modelUrl, __MODEL_BYTES__);
  return modelData;
}

const WALK_SPEED = 2.2;
const RUN_SPEED = 6.0;
const MAX_TURN = 13; // velocidad máxima de giro del cuerpo (rad/s)
const AIM_TURN = 24; // al apuntar gira más rápido, pero sin latigazo (rad/s)
const STATE_DWELL = 0.12; // tiempo mínimo en una animación de locomoción antes de cambiar (s)
const SPRINT_SPEED = 8.0; // carrera rápida: no permite disparar, pero sí saltar
const SPRINT_STOP_TIME = 0.2; // tiempo sin moverse que cancela la carrera rápida (s)
// Salto con medidas humanas: gravedad real y un despegue de ~3,3 m/s, que eleva el cuerpo
// ~0,55 m parado y ~0,65 m en carrera (unos 4 m de longitud corriendo a 6 m/s).
const GRAVITY = 9.81;
const JUMP_SPEED = 3.3; // velocidad vertical de despegue parado (m/s)
const RUN_JUMP_BONUS = 0.04; // la carrera añade algo de altura (m/s por cada m/s)
const LEAP_SPEED = 2.8; // empuje horizontal mínimo al saltar con dirección (salto de longitud parado ≈ 1,8 m)
const CROUCH_TIME = 0.24; // impulso: tiempo flexionando las piernas antes de despegar (s)
const SPRINT_CROUCH_TIME = 0.09; // a máxima velocidad la batida es mucho más corta
const JUMP_BUFFER = 0.12; // margen para pulsar salto justo antes de aterrizar (s)
const AIR_CONTROL = 1.2; // en el aire apenas se puede corregir la trayectoria
const LAND_TIME = 0.32; // duración de la flexión que amortigua la caída (s)
const LAND_SLOWDOWN = 0.8; // fracción de velocidad horizontal que se conserva al caer
// Cobertura: el personaje se desliza hasta el muro, se pega de espaldas y se mueve a lo
// largo de él. Tras un muro bajo se agacha y se levanta para disparar por encima; tras
// uno alto permanece de pie y se asoma por el borde.
const COVER_RANGE = 2.4; // distancia máxima desde la que se desliza a cubierto (m)
const COVER_GAP = 0.05; // separación entre la cápsula y el muro
const COVER_HUG = 0.27; // cuánto se arrima el cuerpo al muro, hasta apoyar la espalda (m)
const COVER_HUG_AIM = 0.12; // ...y al levantarse de cara al muro para apuntar por encima
const LIMIT_RANGE = 0.55; // a menos de esto del final del muro, está en su límite (m)
const COVER_SLIDE_SPEED = 7; // velocidad del deslizamiento de entrada (m/s)
const COVER_SPEED = 1.7; // velocidad pegado al muro (m/s)
const COVER_CROUCH_SPEED = 1.3; // ...y agachado tras una cobertura baja
const COVER_EXIT_TIME = 0.2; // tiempo tirando hacia fuera para despegarse (s)
const COVER_CROUCH = 0.46; // cuánto baja la cadera tras una cobertura baja (m)
const COVER_NEAR = 1.5; // radio en el que se busca cobertura en cualquier dirección (m)
const COVER_FAN = 32; // rayos de esa búsqueda alrededor del personaje
const PEEK_REACH = 0.8; // distancia máxima al borde para poder asomarse por él (m)
const PEEK_CLEAR_GUN = 0.28; // cuánto sobrepasa el borde al asomarse por el lado del arma (m)
const PEEK_CLEAR_OFF = 0.46; // ...y por el lado contrario, para que el arma libre el muro
const PEEK_LEAN = 0.3; // inclinación lateral del tronco al asomarse (rad)
// Asomarse con el mando: en un límite del muro, mantener la dirección hacia ese lado.
const PEEK_HOLD = 0.25; // tiempo empujando contra el final del muro hasta asomarse (s)
const PEEK_LOOK = 0.5; // fracción del paso completo que da solo para mirar (al disparar, entero)
const PEEK_HEAD = { giro: 0.2, cuello: 0.8 }; // giro del tronco y de la cabeza hacia ese lado (rad)
// Cuánto se agacha (0-1) en cada postura de cobertura.
const CROUCH_HIDE = 1; // oculto tras una cobertura baja
const CROUCH_OVER = 0.14; // disparando por encima
const PRONE_SPEED = 0.8; // velocidad arrastrándose (m/s)
// Posturas armadas por código (el modelo no trae clips así). Sus valores se pueden retocar
// en vivo desde el catálogo (ficha → «Editar postura») y copiar como texto para fijarlos aquí.
// Cada entrada de POSE_SPEC: [clave, rótulo, mínimo, máximo, unidad ('rad', 'm' o '')].
export const POSES = {
  // Tras una cobertura muy baja: acostado boca arriba, con el cuerpo perpendicular al objeto,
  // la cabeza recostada en él, una rodilla levantada y el arma sobre el pecho.
  recostado: {
    giro: 3.14, altura: 0.1, arrimo: 0, centrado: 1.3, tronco: 0.25, cabeza: 0.6,
    caderaArriba: 0.9, rodillaArriba: 1.9, caderaAbajo: 0.06, rodillaAbajo: 0.12, piernasAbiertas: 0.1,
    brazoAdelante: -0.2, brazoAbierto: 0.35, codoCerrado: 1.05, antebrazoArriba: 0.6,
    ajustes: {},
  },
  // Incorporado para apuntar por encima de una cobertura muy baja.
  rodillas: { agachado: 0.9, tronco: 0.27, ajustes: {} },
  // De pie en reposo, relajado (el clip del modelo es una guardia con brazos abiertos y
  // rodillas dobladas). Medidas desde los pies, en metros, hacia fuera, arriba y adelante.
  parado: {
    manosAfuera: 0.2, manosAltura: 0.86, manosAdelante: 0.13,
    piesAfuera: 0.11, piesAdelante: 0.06, cadera: 0.04, tronco: -0.04, cabeza: -0.18,
    ajustes: {},
  },
};
// `ajustes` guarda giros libres por hueso, hechos en el editor seleccionando una parte del
// cuerpo y arrastrando: { NombreDelHueso: [x, y, z, w] }, un cuaternión en el marco del hueso
// padre que se suma a la postura ya calculada.
// Partes seleccionables: [hueso, hueso donde termina (o null), rótulo].
const PARTS = [
  ['Abdomen', 'Torso', 'Cintura'], ['Torso', 'Chest', 'Tronco'], ['Chest', 'Neck', 'Pecho'],
  ['Neck', 'Head', 'Cuello'], ['Head', null, 'Cabeza'],
  ['UpperArmL', 'LowerArmL', 'Brazo izquierdo'], ['LowerArmL', 'WristL', 'Antebrazo izquierdo'], ['WristL', null, 'Mano izquierda'],
  ['UpperArmR', 'LowerArmR', 'Brazo derecho'], ['LowerArmR', 'WristR', 'Antebrazo derecho'], ['WristR', null, 'Mano derecha'],
  ['UpperLegL', 'LowerLegL', 'Muslo izquierdo'], ['LowerLegL', 'FootL', 'Pierna izquierda'], ['FootL', null, 'Pie izquierdo'],
  ['UpperLegR', 'LowerLegR', 'Muslo derecho'], ['LowerLegR', 'FootR', 'Pierna derecha'], ['FootR', null, 'Pie derecho'],
];
// Partes que una postura no deja girar porque otra capa las coloca después (al apuntar, los
// brazos van hacia la mira).
export const POSE_FIXED = { recostado: [], rodillas: ['UpperArmL', 'UpperArmR'], parado: [] };
export const POSE_SPEC = {
  recostado: [
    ['giro', 'Giro del cuerpo (90° de lado, 180° boca arriba)', 1.0, 2.6, 'rad'],
    ['altura', 'Altura sobre el suelo', 0.05, 0.45, 'm'],
    ['arrimo', 'Más cerca o lejos del objeto', -0.3, 0.45, 'm'],
    ['centrado', 'Distancia de los pies al objeto', 0.3, 1.7, 'm'],
    ['tronco', 'Tronco encorvado', -0.3, 1.0, 'rad'],
    ['cabeza', 'Cabeza levantada', -0.4, 1.0, 'rad'],
    ['caderaArriba', 'Pierna levantada: cadera', 0, 2.1, 'rad'],
    ['rodillaArriba', 'Pierna levantada: rodilla', 0, 2.5, 'rad'],
    ['caderaAbajo', 'Pierna estirada: cadera', 0, 2.1, 'rad'],
    ['rodillaAbajo', 'Pierna estirada: rodilla', 0, 2.5, 'rad'],
    ['piernasAbiertas', 'Piernas separadas', -0.3, 0.6, 'rad'],
    ['brazoAdelante', 'Brazos hacia delante', -0.5, 2.4, 'rad'],
    ['brazoAbierto', 'Brazos abiertos', -0.3, 1.3, 'rad'],
    ['codoCerrado', 'Antebrazos hacia dentro', -0.3, 1.5, 'rad'],
    ['antebrazoArriba', 'Antebrazos hacia la cabeza', -1.0, 1.5, 'rad'],
  ],
  rodillas: [
    ['agachado', 'Cuánto se agacha', 0.3, 1, ''],
    ['tronco', 'Tronco inclinado', -0.2, 0.8, 'rad'],
  ],
  parado: [
    ['manosAfuera', 'Manos: separación del centro', 0.1, 0.35, 'm'],
    ['manosAltura', 'Manos: altura', 0.7, 1.1, 'm'],
    ['manosAdelante', 'Manos: hacia delante', -0.05, 0.3, 'm'],
    ['piesAfuera', 'Pies: separación del centro', 0.05, 0.25, 'm'],
    ['piesAdelante', 'Pies: hacia delante', -0.1, 0.2, 'm'],
    ['cadera', 'Cadera más alta (estira las rodillas)', -0.1, 0.08, 'm'],
    ['tronco', 'Tronco hacia delante', -0.3, 0.3, 'rad'],
    ['cabeza', 'Cabeza hacia delante', -0.5, 0.4, 'rad'],
  ],
};
const BREATH_RATE = 1.6; // respiración en reposo (rad/s: un ciclo cada ~4 s)
// Desplazamiento acostado: ciclo de oruga. Manos y pies se apoyan en el suelo, la cadera se
// levanta un poco y el cuerpo se desliza entre ellos; luego manos y pies se adelantan.
const CRAWL_STEP = 0.4; // lo que avanza en cada ciclo (m)
const CRAWL_LIFT = 0.07; // cuánto levanta el cuerpo mientras empuja (m)
const CRAWL_HAND_LIFT = 0.09; // altura a la que levanta las manos al adelantarlas (m)
const CRAWL_FOOT_LIFT = 0.08; // ...y los pies
const CRAWL_HAND_OUT = 0.14; // manos apoyadas: separación hacia fuera desde el hombro (m)
const CRAWL_HAND_DOWN = 0.3; // ...y hacia la cadera (m)
const PRONE_VIEW = 0.8; // altura de la cámara recostado: justo por encima del objeto (m)
const AIM_VIEW = 0.12; // al apuntar, la cámara queda esto por encima de la cabeza (m)
const CROUCH_SIDE_LOW = 0.78; // asomado por el borde de una cobertura baja
const CROUCH_SIDE_HIGH = 0.1; // asomado por el borde de una cobertura alta
const STRIDE_CROUCHED = 0.35; // amplitud del paso lateral cuando va agachado (1 = zancada completa)
const STRIDE_PEEK = 0.4; // ...y en el paso corto de asomarse
const RECOIL_KICK = 0.07; // cuánto sube el arma en cada disparo (rad)
const CROUCH_DEPTH = 0.3;
const MAX_HEALTH = 100;
const REGEN_DELAY = 5; // segundos sin recibir daño antes de empezar a recuperarse
const REGEN_RATE = 12; // vida por segundo // cuánto baja la cadera en la flexión completa (m)
const RADIUS = 0.35;
const HALF = 0.5; // semialtura del tramo recto de la cápsula
const FOOT = HALF + RADIUS; // del centro del cuerpo a los pies
const PUNCH_TIME = 0.55; // duración del golpe (s)
// Armas. Se empieza sin nada: la pistola, el bate y las balas se recogen del suelo (pickups.js).
const SWING_TIME = 0.9; // duración del batazo (s)
const SWING_LOAD = 0.36; // fracción del batazo que dura la toma de impulso, con el bate atrás
const SWING_STRIKE = 0.32; // ...y el golpe en sí; el resto es recuperar la guardia
const SWING_HIT = 0.56; // fracción del batazo en la que conecta (bate al frente, a máxima velocidad)
const MELEE = {
  // [alcance del centro del golpe (m), radio (m), daño a un zombi, empuje]
  puño: { reach: 0.75, radius: 0.6, damage: 1.5, push: 1 },
  bate: { reach: 1.0, radius: 0.85, damage: 3, push: 1.8 },
};
export const MAX_AMMO = 99;
export const WEAPON_NAMES = { manos: 'Sin arma', bate: 'Bate', pistola: 'Pistola' };
const WEAPON_ORDER = ['manos', 'bate', 'pistola'];
const PUNCH_HIT = 0.4; // fracción de la animación en la que conecta
const FIRE_INTERVAL = 0.14;
const JUMP_POSE_TIME = 0.2; // instante del clip de carrera usado como pose de salto
const AIM_HOLD = 0.9; // segundos que mantiene la pose de apuntar tras disparar
const AIM_HOLD_COVER = 0.3; // ...a cubierto vuelve a esconderse enseguida
// Disparar sin apuntar: la cámara no se cierra ni aparece la mira. A cubierto saca el arma
// por encima (o por el lado, si el muro es alto) sin dejar de cubrirse: disparo a ciegas.
const HIP_SPREAD = 0.035; // desvío máximo de la bala sin apuntar (rad)
const BLIND_SPREAD = 0.09; // ...y a ciegas desde la cobertura
const BLIND_HOLD = 0.35; // segundos que mantiene el arma fuera tras disparar a ciegas
const BLIND_REACH = 0.5; // distancia del hombro a la mano con el brazo fuera (m)
// Límites de los brazos (ver reachArm). Dirección hombro→mano: `atras`, cuánto puede ir por
// detrás del cuerpo (componente hacia la espalda, 0-1), y `atrasArriba` lo que se suma con el
// brazo en alto; `cruce`, cuánto puede pasar al otro lado, y `cruceDelante` lo que se suma
// cuanto más por delante va. Distancia hombro→mano, en fracción del brazo: `cerrado` (codo
// doblado del todo, ~145°) y `estirado`. `cruceDosManos`: lo que se suma a `cruce` con las dos
// manos en un objeto (el hombro se adelanta para acompañar). `codoFuera`: cuánto apunta el codo hacia fuera (el
// resto, atrás y abajo).
const ARM_LIMITS = { codoFuera: 0.45, atras: 0.3, atrasArriba: 0.45, cruce: 0.15, cruceDelante: 0.55, cruceDosManos: 0.25, cerrado: 0.32, estirado: 0.97 };
const AIM_REACH = 0.5; // del hombro a la muñeca al apuntar: brazo casi estirado (m)
// Bate en guardia (m, desde el pecho): mano derecha hacia su lado, más abajo y adelante; y
// cuánto se inclina el bate hacia la derecha y hacia atrás (0 = vertical).
const BAT_READY = { lado: 0.12, bajo: 0.16, frente: 0.24, inclinado: 0.25, atras: 0.45 };
// Batazo por código. Cada momento: dónde va la mano derecha (m, desde el pecho: +X izquierda,
// +Y arriba, +Z al frente), hacia dónde apunta el bate y cuánto gira y se encorva el tronco
// (rad; giro + lleva el hombro derecho adelante). Posiciones y direcciones van en el marco
// del pecho ya girado. El recorrido pasa por todos con una curva suave (ver swingPhase).
const SWING_KEYS = [
  { mano: [-BAT_READY.lado, -BAT_READY.bajo, BAT_READY.frente], bate: [-BAT_READY.inclinado, 1, -BAT_READY.atras], giro: 0, frente: 0 }, // guardia
  { mano: [-0.13, -0.04, 0.24], bate: [-0.3, 0.75, -0.95], giro: -0.8, frente: 0.06 }, // impulso: atrás, junto al hombro derecho
  { mano: [-0.16, -0.13, 0.34], bate: [-1, 0.2, -0.1], giro: -0.25, frente: 0.12 }, // las manos tiran; el bate viene retrasado
  { mano: [0.0, -0.2, 0.44], bate: [-0.12, -0.05, 1], giro: 0.3, frente: 0.18 }, // conecta, con los brazos estirados
  { mano: [0.14, -0.12, 0.3], bate: [1, 0.4, -0.2], giro: 0.8, frente: 0.1 }, // acompaña hasta el otro lado
];
SWING_KEYS.push(SWING_KEYS[0]);
const curve = (f) => new THREE.CatmullRomCurve3(SWING_KEYS.map((k) => new THREE.Vector3(...f(k))), false, 'centripetal');
const SWING_HAND = curve((k) => k.mano);
const SWING_BAT = curve((k) => new THREE.Vector3(...k.bate).normalize().toArray());
const SWING_TORSO = curve((k) => [k.giro, k.frente, 0]);
// Dónde agarra la mano izquierda, en el marco del arma: el mango del bate, por debajo de la
// derecha; y la empuñadura de la pistola, envolviendo la derecha por su lado y algo más abajo.
const BAT_LEFT = new THREE.Vector3(0, 0, -0.075);
const GUN_LEFT = new THREE.Vector3(0.045, -0.025, 0);
const GRIP_SHIFT = 0.25; // cuánto puede acercarse el arma a la mano izquierda si esta no llega (m)
const GRIP_SLACK = 0.004; // separación admitida entre la mano y su agarre (m)
// Brazos a cubierto con la pistola (m, desde el pecho): manos delante, algo más abajo y
// hacia el centro del cuerpo, y separación entre las dos manos.
const COVER_ARMS = { frente: 0.26, bajo: 0.12, centro: 0.02, manos: 0.05 };
// Giro del tronco (rad, ver applyTorso) al disparar: el cuerpo acompaña a los brazos.
const TORSO_AIM = { giro: 0.3, lado: 0, frente: 0.08, cuello: -0.22, cabeza: 0 };
const TORSO_BLIND = {
  // Agachado tras una cobertura baja: el hombro derecho sube y va atrás, por encima del muro;
  // la cabeza se queda abajo, mirando al frente.
  baja: { giro: -0.4, lado: 0.3, frente: -0.12, cuello: 0.3, cabeza: 0.25 },
  // Tras un muro alto, lejos de sus límites: erguido, el hombro derecho arriba y la cabeza gacha.
  arriba: { giro: 0, lado: 0.12, frente: 0, cuello: 0, cabeza: 0.2 },
  // En un límite del muro, girado hacia el borde: se inclina hacia él, la cabeza atrás.
  borde: { giro: 0, lado: 0, frente: 0.22, cuello: 0, cabeza: -0.15 },
  // Acostado (objetivo a la izquierda; se refleja).
  muyBaja: { giro: 0.25, lado: 0.2, frente: 0.4, cuello: 0, cabeza: 0.15 },
};
// A ciegas tras un muro alto y lejos de sus límites: brazo en alto y tiro hacia arriba, por
// encima del muro (cuánto se inclina el tiro hacia el otro lado; 0 = vertical).
const BLIND_UP_TILT = 0.2;

const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _h = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _pq = new THREE.Quaternion();
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _hip = new THREE.Vector3();
const _knee = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _right = new THREE.Vector3();
// Orientación del bate respecto a la muñeca (ajustada mirando las capturas).
const BAT_GRIP = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0)); // el bate sobre el -X de la muñeca
const _knee2 = new THREE.Vector3();
const _foot = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _axis2 = new THREE.Vector3();
const _fq = new THREE.Quaternion();

// Estado del juego -> clip del modelo. El catálogo lo lee para saber qué clips se usan.
export const PLAYER_CLIPS = {
  Idle: 'Idle', Walking: 'Walk', Running: 'Run', Punch: 'Punch_Right',
  Jump: 'Run', // el modelo no trae salto: zancada de carrera congelada como pose en el aire
  CoverLeft: 'Run_Left', CoverRight: 'Run_Right', // pasos laterales pegado a una cobertura
};
// Valores que el catálogo muestra en sus fichas (así nunca quedan desfasados).
export const TUNING = {
  WALK_SPEED, RUN_SPEED, SPRINT_SPEED, MAX_TURN, AIM_TURN, STATE_DWELL, GRAVITY, JUMP_SPEED, CROUCH_TIME,
  SPRINT_CROUCH_TIME, LAND_TIME, LAND_SLOWDOWN, PUNCH_TIME, PUNCH_HIT, SWING_TIME, SWING_LOAD, SWING_STRIKE, SWING_HIT, MELEE, MAX_AMMO, FIRE_INTERVAL, AIM_HOLD, RECOIL_KICK,
  COVER_RANGE, COVER_SPEED, COVER_CROUCH_SPEED, COVER_CROUCH, CROUCH_DEPTH, PEEK_REACH, PEEK_LEAN, PEEK_HOLD, PEEK_LOOK,
  PRONE_SPEED, CRAWL_STEP, STRIDE_CROUCHED, MAX_HEALTH, REGEN_DELAY, REGEN_RATE, AIM_HOLD, AIM_HOLD_COVER,
  HIP_SPREAD, BLIND_SPREAD, BLIND_HOLD, LIMIT_RANGE, COVER_HUG,
};

function dampAngle(a, b, lambda, dt) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * (1 - Math.exp(-lambda * dt));
}

export class Player {
  static async load(scene, physics) {
    // Si la página incrusta el modelo en base64 (hosts que no sirven .glb), se usa ese.
    const loader = new GLTFLoader();
    const embedded = globalThis.__MODEL_GLB_B64;
    const gltf = embedded
      ? await loader.parseAsync(Uint8Array.from(atob(embedded), (c) => c.charCodeAt(0)).buffer, '')
      : await loader.parseAsync(await preloadModel(), '');
    fixProportions(gltf.scene, gltf.animations); // brazos y manos a medidas humanas
    // Del modelo solo se usan el esqueleto y las animaciones: se escala a 1,75 m con la
    // medida de su malla y después se quitan las mallas (los personajes se ven como esqueletos).
    const box = new THREE.Box3().setFromObject(gltf.scene);
    gltf.scene.scale.setScalar(1.75 / (box.max.y - box.min.y));
    const meshes = [];
    gltf.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
    for (const m of meshes) {
      m.removeFromParent();
      m.geometry.dispose();
    }
    // Copia intacta del modelo (antes de vestir al jugador) para crear los zombis.
    const assets = { scene: cloneSkinned(gltf.scene), animations: gltf.animations };
    const player = new Player(scene, physics, gltf);
    player.assets = assets;
    return player;
  }

  constructor(scene, physics, gltf) {
    this.physics = physics;
    this.position = new THREE.Vector3(0, 0, 0); // posición de los pies
    this.velocity = new THREE.Vector3();
    this.facing = Math.PI; // mira hacia -Z
    this.grounded = true;
    this.airTime = 0;
    this.jumpT = -1; // >= 0 mientras toma impulso
    this.jumpTime = CROUCH_TIME;
    this.jumpBuffer = 0;
    this.crouch = 0; // 0 = erguido, 1 = flexión completa
    this.landT = 0;
    this.landAmount = 0;
    this.sprinting = false;
    this.sprintIdle = 0;
    this.health = MAX_HEALTH;
    this.hurtT = 0; // tiempo desde el último daño
    this.dead = false;
    this.cover = null; // { nx, nz, high, attached, peek, peekDir, away } mientras está a cubierto
    this.coverCrouch = 0;
    this.prone = 0; // 0 = erguido, 1 = recostado tras una cobertura muy baja
    this.proneSide = 1; // hacia qué lado gira al recostarse para dar la espalda al objeto
    this.proneN = { x: 0, z: 1 }; // normal de esa cobertura (del objeto hacia el personaje)
    this.scoot = 0; // fase (0-1) del ciclo de desplazamiento acostado
    this.scootW = 0; // 0-1: cuánto se nota ese ciclo (se apaga al quedarse quieto)
    this.scootDir = 1; // hacia qué lado del cuerpo (+X o -X del modelo) se desplaza
    this.kneel = 0; // 0-1: usa la postura «rodillas» (cobertura muy baja) en vez del agachado normal
    this.aiming = false; // mantiene el botón de apuntar: cámara al hombro y mira en pantalla
    this.blindT = 0; // tiempo que le queda con el arma fuera a ciegas tras disparar a cubierto
    this.blindW = 0; // 0-1: brazos fuera de la cobertura disparando a ciegas
    this.coverReady = 0; // 0-1: brazos en la postura de espera de la cobertura
    this.standW = 0; // 0-1: postura de pie relajada (en reposo, sin moverse)
    this.breath = 0; // fase de la respiración
    this.coverLean = 0; // inclinación lateral al asomarse (rad, + hacia la derecha del personaje)
    this.coverGrip = 0; // 0-1: mano izquierda sujetando la pistola (al apuntar)
    this.batReady = 0; // 0-1: bate en guardia, sobre el hombro derecho
    this.peekLook = 0; // -1..1: mira por el borde derecho o izquierdo, asomado con el mando
    this.coverHug = 0; // cuánto se arrima ahora el modelo al muro (m)
    this.hugN = { x: 0, z: 0 }; // normal del último muro (para separarse poco a poco al salir)
    this.armFrame = null; // marco del tronco para los límites de los brazos, si está girado (reachArm)
    this.armCross = 0; // margen extra para cruzar el brazo (dos manos en un arma)
    this.batGrip = 0; // 0-1: mano izquierda sujetando el bate
    this.canFire = true;
    this.state = 'Idle';
    this.stateT = 0;
    this.strideBlend = false;
    this.punchT = -1;
    this.punchDone = false;
    this.fireCooldown = 0;
    this.aimT = 0;
    this.aimWeight = 0;
    this.aimPoint = new THREE.Vector3();
    this.shots = 0;
    // Inventario: lo que lleva y el arma en la mano.
    this.has = { bate: false, pistola: false };
    this.ammo = 0;
    this.weapon = 'manos';
    this.infiniteAmmo = false; // piloto automático y pruebas
    this.meleeKind = 'puño';
    this.fireWas = false;
    this.dryFire = 0; // >0 un instante tras apretar el gatillo sin balas (la interfaz lo avisa)

    // --- Modelo ---
    const model = gltf.scene;
    this.model = model;
    scene.add(model);

    const bone = (name) => {
      let found = null;
      model.traverse((o) => { if (!found && o.isBone && o.name === name) found = o; });
      return found;
    };
    this.upperArm = bone('UpperArmR');
    this.upperArmL = bone('UpperArmL');
    this.bodyBone = bone('Body');
    this.abdomen = bone('Abdomen');
    this.legs = ['L', 'R']
      .map((s) => ({ upper: bone('UpperLeg' + s), lower: bone('LowerLeg' + s), foot: bone('Foot' + s), end: new THREE.Vector3(), side: s === 'L' ? 1 : -1 }))
      .filter((l) => l.upper && l.lower && l.foot);
    this.gait = new Gait(this.legs); // zancada a medida y pies clavados al caminar y correr
    // Huesos que modifica la flexión, con su pose de animación guardada para restaurarla.
    this.lowerArm = bone('LowerArmR');
    this.lowerArmL = bone('LowerArmL');
    // Partes del cuerpo que el editor de posturas deja seleccionar y girar.
    this.parts = PARTS.map(([name, end, label]) => ({ name, label, bone: bone(name), end: end && bone(end) }))
      .filter((p) => p.bone);
    const legBones = new Set(this.legs.flatMap((l) => [l.upper, l.lower, l.foot]));
    this.adjustBones = this.parts.map((p) => p.bone).filter((b) => !legBones.has(b)); // de padres a hijos
    this.poseBones = [...new Set([this.bodyBone, this.abdomen, this.upperArmL, this.upperArm, this.lowerArmL, this.lowerArm,
      ...this.legs.flatMap((l) => [l.upper, l.lower, l.foot]), ...this.adjustBones])]
      .filter(Boolean)
      .map((b) => ({ bone: b, pos: new THREE.Vector3(), quat: new THREE.Quaternion() }));
    this.posed = false;
    this.hand = bone('WristR') ?? bone('LowerArmR');
    this.handL = bone('WristL') ?? bone('LowerArmL');
    this.fingerR = bone('Middle4R'); // punta del dedo medio: con la muñeca da la palma
    this.fingerL = bone('Middle4L');
    this.neck = bone('Neck');
    this.spine = ['Abdomen', 'Torso', 'Chest'].map(bone).filter(Boolean); // de la cadera al pecho
    this.neckRest = new THREE.Quaternion();
    this.neckPosed = false;

    // --- Animaciones ---
    this.mixer = new THREE.AnimationMixer(model);
    // Nombres de estado del juego -> clips del modelo.
    const clip = (name) => gltf.animations.find((c) => c.name === name);
    this.clips = gltf.animations;
    this.actions = {};
    for (const [state, name] of Object.entries(PLAYER_CLIPS)) {
      // El salto usa una copia del clip de carrera para poder congelarla sin afectar a la carrera.
      this.actions[state] = this.mixer.clipAction(state === 'Jump' ? clip(name).clone() : clip(name));
    }
    this.actions.Jump.timeScale = 0;
    this.previewAction = null; // catálogo: clip suelto que sustituye a las animaciones del juego
    this.actions.CoverLeft.timeScale = this.actions.CoverRight.timeScale = 0.9; // ajustado para que los pies no resbalen a 1,7 m/s
    this.actions.Punch.setLoop(THREE.LoopOnce);
    this.actions.Punch.clampWhenFinished = true;
    this.actions.Punch.timeScale = this.actions.Punch.getClip().duration / PUNCH_TIME;
    this.current = this.actions.Idle;
    this.current.play();

    // --- Arma (se coloca cada frame en la mano) ---
    this.gun = makeGun();
    this.flash = new THREE.PointLight(0xffc066, 0, 6);
    this.flash.position.copy(GUN_MUZZLE).z += 0.1;
    this.gun.add(this.flash);
    this.gun.visible = false;
    // Bate de béisbol (pickups.js): va en la mano cuando es el arma elegida.
    this.bat = makeBat();
    this.bat.visible = false;
    scene.add(this.bat);
    this.batTip = new THREE.Vector3();
    this.recoil = 0; // 1 justo al disparar; decae enseguida

    // El personaje se dibuja como esqueleto (src/skeleton.js).
    this.skel = new SkeletonView(model, scene, 'player');
    this.skeleton = this.skel.group;
    scene.add(this.gun);
    this.muzzle = new THREE.Vector3();

    // --- Física: cápsula cinemática + controlador de personaje ---
    const world = physics.world;
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, FOOT + 0.05, 0),
    );
    this.collider = world.createCollider(
      RAPIER.ColliderDesc.capsule(HALF, RADIUS).setCollisionGroups(GROUPS.player),
      this.body,
    );
    const cc = world.createCharacterController(0.02);
    cc.setUp({ x: 0, y: 1, z: 0 });
    cc.enableAutostep(0.35, 0.2, false);
    cc.enableSnapToGround(0.3);
    cc.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(45));
    cc.setMinSlopeSlideAngle(THREE.MathUtils.degToRad(50));
    cc.setApplyImpulsesToDynamicBodies(true);
    cc.setCharacterMass(70);
    this.controller = cc;
  }

  respawn() {
    this.body.setTranslation({ x: 0, y: FOOT + 0.05, z: 0 }, true);
    this.body.setNextKinematicTranslation({ x: 0, y: FOOT + 0.05, z: 0 });
    this.position.set(0, 0, 0); // ya, para no recoger lo que haya donde murió
    this.velocity.set(0, 0, 0);
    this.jumpT = -1;
    this.jumpBuffer = this.landT = this.crouch = 0;
    this.cover = null;
    this.sprinting = false;
    this.health = MAX_HEALTH;
    this.dead = false;
    this.punchT = -1;
    this.resetInventory();
  }

  /** Vuelve a empezar sin armas ni balas. */
  resetInventory() {
    this.has.bate = this.has.pistola = false;
    this.ammo = 0;
    this.weapon = 'manos';
    // Con munición infinita (piloto automático, pruebas) se empieza con la pistola.
    if (this.infiniteAmmo) this.has.pistola = true, this.weapon = 'pistola';
  }

  /** Recoge un objeto: 'pistola', 'bate' o 'balas' (con `amount` balas). Devuelve el aviso. */
  pickUp(type, amount = 0) {
    this.dryFire = 0;
    if (type === 'balas') {
      const before = this.ammo;
      this.ammo = Math.min(MAX_AMMO, this.ammo + amount);
      if (this.weapon === 'manos' && this.has.pistola) this.weapon = 'pistola';
      return `+${this.ammo - before} balas`;
    }
    const first = !this.has[type];
    this.has[type] = true;
    if (type === 'pistola') this.ammo = Math.min(MAX_AMMO, this.ammo + amount);
    // Un arma nueva va a la mano; la pistola, solo si tiene balas.
    if (first && (type === 'bate' || this.loaded)) this.weapon = type;
    return type === 'pistola' ? `Pistola · +${amount} balas` : 'Bate de béisbol';
  }

  /** Cambia al arma `name`, o a la siguiente que tenga si es 1 / -1. */
  equip(name) {
    if (this.punchT >= 0) return;
    if (typeof name === 'number') {
      const owned = WEAPON_ORDER.filter((w) => w === 'manos' || this.has[w]);
      const i = owned.indexOf(this.weapon);
      name = owned[(i + name + owned.length) % owned.length];
    }
    if (name !== 'manos' && !this.has[name]) return;
    this.weapon = name;
    if (name !== 'pistola') this.aimT = 0;
  }

  /** ¿La pistola puede disparar? */
  get loaded() {
    return this.infiniteAmmo || this.ammo > 0;
  }

  /** Altura de la cabeza sobre los pies: baja al agacharse o tumbarse a cubierto. */
  get headHeight() {
    return THREE.MathUtils.lerp(1.45 - 0.6 * this.coverCrouch, 0.3, this.prone);
  }

  /** Postura que la cámara debe seguir (ver ThirdPersonCamera.update). */
  get view() {
    this._view ??= { aim: false, height: 1.55, low: 0 };
    const v = this._view;
    v.aim = this.aiming;
    v.low = this.cover?.attached && this.cover.veryLow ? 1 : this.prone;
    // Apuntando, a la altura de la cabeza (de pie queda como siempre); recostado, casi a ras
    // del objeto que lo cubre.
    v.height = this.aiming ? this.headHeight + AIM_VIEW : THREE.MathUtils.lerp(1.55, PRONE_VIEW, this.prone);
    return v;
  }

  get healthFraction() {
    return this.health / MAX_HEALTH;
  }

  damage(amount) {
    if (this.dead) return;
    this.health = Math.max(0, this.health - amount);
    this.hurtT = 0;
    if (this.health <= 0) this.dead = true;
  }

  /**
   * Busca cobertura: primero lejos, en las direcciones dadas (hacia donde se empuja o se
   * mira); si no, la más cercana en cualquier dirección. Si la hay, se desliza hacia ella.
   */
  tryEnterCover(dirs) {
    const world = this.physics.world;
    const t = this.body.translation();
    const y = t.y - FOOT + COVER_BASE_Y;
    let best = null;
    for (const d of dirs) {
      const hit = probeWall(world, t.x, y, t.z, d.x, d.z, COVER_RANGE);
      if (hit && hit.nx * d.x + hit.nz * d.z < -0.5) { best = hit; break; } // hay que encararlo
    }
    if (!best) {
      for (let i = 0; i < COVER_FAN; i++) {
        const a = (i / COVER_FAN) * Math.PI * 2;
        const dx = Math.sin(a), dz = Math.cos(a);
        const hit = probeWall(world, t.x, y, t.z, dx, dz, COVER_NEAR);
        if (hit && hit.nx * dx + hit.nz * dz < -0.3 && (!best || hit.dist < best.dist)) best = hit;
      }
    }
    if (!best) return false;
    this.cover = {
      nx: best.nx, nz: best.nz, high: false, veryLow: false, proneDir: 1, attached: false, away: 0,
      mode: null, // al apuntar: 'over' (por encima), 'side' (por el borde) o 'blocked'
      peek: 0, peekDir: 0, peekGoal: 0,
      // Límites del muro: distancia a cada final (Infinity si queda lejos) y en cuál está:
      // -1 el derecho del personaje (de espaldas al muro), +1 el izquierdo, 0 ninguno.
      edgeR: Infinity, edgeL: Infinity, limit: 0,
      blindMode: 'over', blindSide: 0, blindLocked: false,
      stickPeek: false, stickSide: 0, stickT: 0, // asomarse manteniendo el mando hacia un límite
    };
    this.jumpT = -1;
    return true;
  }

  leaveCover() {
    this.cover = null;
  }

  /** Movimiento mientras está a cubierto: fija la velocidad horizontal. */
  coverMove(dt, dir, moving, aiming, cam) {
    const c = this.cover;
    const world = this.physics.world;
    const t = this.body.translation();
    const feet = t.y - FOOT;
    const wall = (x, z, y, dist) => probeWall(world, x, feet + y, z, -c.nx, -c.nz, dist);

    // Mantiene el contacto con el muro (salvo mientras se asoma más allá del borde).
    let gap = 0;
    if (c.peek < 0.02) {
      const hit = wall(t.x, t.z, COVER_BASE_Y, c.attached ? 1 : COVER_RANGE + 0.6);
      if (!hit) return this.leaveCover();
      c.nx = hit.nx;
      c.nz = hit.nz;
      gap = hit.dist - (RADIUS + COVER_GAP);
      if (gap < 0.12 && !c.attached) {
        c.attached = true;
        // Recostado no se da la vuelta: la cabeza queda hacia donde empujaba al llegar (o a la
        // derecha de la cámara) y se arrastra hacia la cabeza o hacia los pies.
        const side = (moving ? dir.x : Math.cos(cam.yaw)) * hit.nz - (moving ? dir.z : -Math.sin(cam.yaw)) * hit.nx;
        c.proneDir = side < 0 ? -1 : 1;
      }
      c.high = !!wall(t.x, t.z, COVER_HIGH_Y, hit.dist + 0.5);
      c.veryLow = !c.high && !wall(t.x, t.z, COVER_LOW_Y, hit.dist + 0.5);
    }
    const tx = c.nz, tz = -c.nx; // tangente al muro
    // ¿Se acaba el muro a esa distancia lateral?
    const ends = (side, reach) =>
      !wall(t.x + tx * side * reach, t.z + tz * side * reach, COVER_BASE_Y, RADIUS + 0.8);

    // Desplazamiento lateral; tirar hacia fuera un instante despega del muro.
    let along = 0;
    if (c.attached && moving) {
      const away = dir.x * c.nx + dir.z * c.nz;
      c.away = away > 0.7 ? c.away + dt : 0;
      if (c.away > COVER_EXIT_TIME) return this.leaveCover();
      const s = dir.x * tx + dir.z * tz;
      if (Math.abs(s) > 0.3 && !ends(Math.sign(s), RADIUS + 0.1)) along = Math.sign(s);
    } else {
      c.away = 0;
    }
    // Asomarse con el mando: ya en el final del muro, seguir empujando hacia ese lado.
    let stick = 0;
    if (c.attached && moving && !c.veryLow) {
      const s = dir.x * tx + dir.z * tz;
      const sgn = Math.sign(s);
      if (Math.abs(s) > 0.5 && (c.peek > 0.02 ? c.peekDir === sgn : !along && ends(sgn, RADIUS + 0.1))) stick = sgn;
    }
    c.stickT = stick && stick === c.stickSide ? c.stickT + dt : 0;
    c.stickSide = stick;
    c.stickPeek = stick !== 0 && c.stickT >= PEEK_HOLD;

    // ¿Está en un límite del muro? Se mide la distancia a cada final (mientras no se asoma).
    const edge = (side) => {
      for (let r = 0.1; r <= PEEK_REACH; r += 0.07) if (ends(side, r)) return r;
      return Infinity;
    };
    if (c.attached && c.peek < 0.02) {
      c.edgeR = edge(-1);
      c.edgeL = edge(1);
      const near = Math.min(c.edgeR, c.edgeL);
      c.limit = near > LIMIT_RANGE ? 0 : c.edgeR <= c.edgeL ? -1 : 1;
    }

    // Al empezar a apuntar decide cómo asomarse: por el borde si hay uno cerca (siempre en
    // cobertura alta, por el más cercano; en la baja, solo si se apunta hacia ese lado) o por
    // encima.
    if (c.attached && (aiming || c.stickPeek) && !c.mode) {
      const left = c.edgeR, right = c.edgeL;
      const aimSide = -Math.sin(cam.yaw) * tx - Math.cos(cam.yaw) * tz; // hacia dónde mira la cámara
      let dir = 0;
      if (c.stickPeek) dir = c.stickSide; // el lado lo elige el mando
      else if (c.high) {
        dir = right < left ? 1 : left < Infinity ? -1 : 0;
      } else if (c.veryLow) dir = 0; // tumbado solo se dispara incorporándose
      else if (right < Infinity && aimSide > 0.3) dir = 1;
      else if (left < Infinity && aimSide < -0.3) dir = -1;
      c.peekDir = dir;
      // El arma va en la mano derecha (lado +tangente al encarar el muro).
      c.peekGoal = dir > 0 ? right + PEEK_CLEAR_GUN : dir < 0 ? left + PEEK_CLEAR_OFF : 0;
      c.mode = dir ? 'side' : c.high ? 'blocked' : 'over';
    }
    if (!aiming && !c.stickPeek && c.peek < 0.02) c.mode = null;
    // A ciegas: en un límite del muro saca el arma por ese lado; si no, por encima (muro bajo)
    // o con el brazo en alto, tirando hacia arriba (muro alto). Se decide al empezar a disparar
    // y el brazo lo recuerda mientras se recoge.
    if (c.attached && this.blindT > 0) {
      if (!c.blindLocked) {
        c.blindLocked = true;
        c.blindSide = c.veryLow ? 0 : c.limit;
        c.blindMode = c.veryLow ? 'prone' : c.blindSide ? 'side' : c.high ? 'up' : 'over';
      }
    } else c.blindLocked = false;
    // Apuntando o disparando da el paso entero; solo para mirar, una parte.
    const peekTarget = c.mode !== 'side' ? 0 : aiming ? c.peekGoal : c.stickPeek ? c.peekGoal * PEEK_LOOK : 0;
    let peekV = THREE.MathUtils.clamp((peekTarget - c.peek) * 8, -2.8, 2.8);
    if (c.peek + peekV * dt < 0) peekV = -c.peek / dt;
    c.peek += peekV * dt;
    if (c.peek > 0.02 || peekTarget) along = 0;

    if (c.veryLow && this.blindW > 0.3) along = 0; // acostado no se arrastra con el arma fuera
    const vt = along * (c.veryLow ? PRONE_SPEED : c.high ? COVER_SPEED : COVER_CROUCH_SPEED) + c.peekDir * peekV;
    // El deslizamiento hacia el muro acelera en vez de arrancar de golpe.
    const vnTarget = c.peek > 0.02 ? 0 : THREE.MathUtils.clamp(gap * 10, -2, COVER_SLIDE_SPEED);
    c.vn = Math.min(vnTarget, (c.vn ?? Math.max(0, -(this.velocity.x * c.nx + this.velocity.z * c.nz))) + 45 * dt);
    const vn = c.vn;
    this.velocity.x = tx * vt - c.nx * vn;
    this.velocity.z = tz * vt - c.nz * vn;
  }

  /** Gira el cuerpo hacia un rumbo con suavizado y velocidad máxima de giro. */
  turnToward(angle, lambda, dt, max = MAX_TURN) {
    const turned = dampAngle(this.facing, angle, lambda, dt);
    const step = Math.atan2(Math.sin(turned - this.facing), Math.cos(turned - this.facing));
    this.facing += THREE.MathUtils.clamp(step, -max * dt, max * dt);
  }

  /** Coloca los huesos y articulaciones dibujados sobre la pose final de este fotograma. */
  updateSkeleton() {
    // Pies hacia el frente (las animaciones de caminar y correr tuercen el izquierdo).
    this.skel.straightenFeet(1 - THREE.MathUtils.clamp(this.prone * 3, 0, 1));
    this.skel.update();
  }

  get speed() {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  /** Antes del paso de física: entrada → movimiento y acciones. */
  update(dt, input, cam, combat) {
    // --- Dirección de movimiento relativa a la cámara ---
    const { x: ix, z: iz, run: running } = input.move();
    const sin = Math.sin(cam.yaw), cos = Math.cos(cam.yaw);
    _v.set(-sin * iz + cos * ix, 0, -cos * iz - sin * ix);
    const moving = _v.lengthSq() > 0;
    if (moving) _v.normalize();

    // La vida se recupera sola tras unos segundos sin recibir daño.
    this.hurtT += dt;
    if (this.hurtT > REGEN_DELAY) this.health = Math.min(MAX_HEALTH, this.health + REGEN_RATE * dt);

    const punching = this.punchT >= 0;
    // Carrera rápida: se activa con un toque y dura mientras se siga avanzando.
    if (input.justPressed('KeyQ')) this.sprinting = !this.sprinting && moving && !this.cover;
    this.sprintIdle = moving ? 0 : this.sprintIdle + dt;
    if (this.sprintIdle > SPRINT_STOP_TIME || punching || this.cover) this.sprinting = false;
    let speed = moving ? (this.sprinting ? SPRINT_SPEED : running ? RUN_SPEED : WALK_SPEED) : 0;
    if (punching) speed *= 0.25;
    this.jumpBuffer = input.justPressed('Space') ? JUMP_BUFFER : this.jumpBuffer - dt;
    // Armas: 1, 2, 3 eligen; la cruceta del mando y el botón táctil las recorren.
    if (input.justPressed('Digit1')) this.equip('manos');
    if (input.justPressed('Digit2')) this.equip('bate');
    if (input.justPressed('Digit3')) this.equip('pistola');
    if (input.justPressed('NextWeapon')) this.equip(1);
    if (input.justPressed('PrevWeapon')) this.equip(-1);
    const gun = this.weapon === 'pistola';
    // El gatillo con el bate o sin arma es un golpe (uno por pulsación).
    const fireDown = input.mouseDown(0);
    const fireEdge = fireDown && !this.fireWas;
    this.fireWas = fireDown;
    const wantsPunch = input.justPressed('KeyF') || (fireEdge && !gun && !this.sprinting);
    const aimHeld = gun && !!input.aiming?.() && !punching && !this.sprinting;

    // --- Cobertura ---
    // Se busca muro hacia donde se empuja, hacia donde mira la cámara o de frente.
    if (input.justPressed('KeyC')) {
      if (this.cover) this.leaveCover();
      else if (this.grounded && !punching) {
        const dirs = [];
        if (moving) dirs.push({ x: _v.x, z: _v.z });
        dirs.push({ x: -sin, z: -cos }, { x: Math.sin(this.facing), z: Math.cos(this.facing) });
        this.tryEnterCover(dirs);
      }
    } else if (this.cover && (!this.grounded || this.jumpBuffer > 0 || wantsPunch)) {
      this.leaveCover(); // saltar, golpear o quedarse sin suelo saca de la cobertura
    }
    // Solo apuntando se levanta o se asoma; disparar sin apuntar es a ciegas, sin salir.
    // (Asomado con el mando, disparar también lo saca del todo.)
    const coverAim = aimHeld || (!!this.cover?.stickPeek && this.aimT > 0);
    if (this.cover) this.coverMove(dt, _v, moving, coverAim, cam);

    if (!this.cover) {
      // Aceleración suave en el plano horizontal. En el aire se conserva la inercia:
      // sin entrada no se frena y con ella solo se corrige un poco la trayectoria.
      const k = this.grounded ? 1 - Math.exp(-14 * dt) : moving ? 1 - Math.exp(-AIR_CONTROL * dt) : 0;
      this.velocity.x += (_v.x * speed - this.velocity.x) * k;
      this.velocity.z += (_v.z * speed - this.velocity.z) * k;
    }
    // Agachado tras una cobertura baja; al apuntar se levanta para disparar por encima.
    const cover = this.cover;
    let coverCrouchTarget = 0, leanTarget = 0, proneTarget = 0;
    if (cover?.attached) {
      const out = cover.peekGoal ? cover.peek / cover.peekGoal : 0; // 0-1: cuánto se ha asomado
      if (cover.mode === 'side') {
        const rest = cover.high ? 0 : CROUCH_HIDE;
        coverCrouchTarget = THREE.MathUtils.lerp(rest, cover.high ? CROUCH_SIDE_HIGH : CROUCH_SIDE_LOW, out);
        leanTarget = cover.peekDir * PEEK_LEAN * Math.min(1, out / PEEK_LOOK);
      } else if (cover.mode === 'over') coverCrouchTarget = cover.veryLow ? POSES.rodillas.agachado : CROUCH_OVER;
      else if (cover.veryLow) proneTarget = 1;
      else if (!cover.high) coverCrouchTarget = CROUCH_HIDE;
    }
    // Recostarse es más pausado que incorporarse a disparar.
    this.prone = THREE.MathUtils.damp(this.prone, proneTarget, proneTarget ? 6 : 9, dt);
    if (proneTarget) {
      this.proneN.x = cover.nx;
      this.proneN.z = cover.nz;
      // Gira hacia el lado que deja el pecho hacia fuera: depende solo de hacia dónde queda la
      // cabeza, así que no cambia mientras se recuesta ni al girar para disparar.
      this.proneSide = -cover.proneDir;
    }
    this.coverCrouch = THREE.MathUtils.damp(this.coverCrouch, coverCrouchTarget, 11, dt);
    this.kneel = THREE.MathUtils.damp(this.kneel, cover?.attached && cover.veryLow ? 1 : 0, 10, dt);
    this.coverLean = THREE.MathUtils.damp(this.coverLean, leanTarget, 11, dt);
    // Apuntando sujeta el arma con las dos manos (a cubierto o no); sin apuntar, con una.
    this.coverGrip = THREE.MathUtils.damp(this.coverGrip, aimHeld && (!cover || cover.attached) ? 1 : 0, 10, dt);
    // Bate: en guardia con las dos manos mientras está quieto o camina; la izquierda lo
    // sigue también durante el batazo.
    const batOut = this.weapon === 'bate' && !cover && this.grounded && this.prone < 0.01;
    const calm = this.state === 'Idle' || this.state === 'Walking';
    // El batazo se hace entero por código (placeBat), con las dos manos en el mango.
    const swinging = this.swinging;
    this.batReady = THREE.MathUtils.damp(this.batReady, swinging || (batOut && calm) ? 1 : 0, swinging ? 22 : 7, dt);
    this.batGrip = THREE.MathUtils.damp(this.batGrip, swinging || (batOut && calm) ? 1 : 0, swinging ? 22 : 9, dt);
    this.canFire = !cover || (cover.attached && (
      cover.mode === 'side' ? cover.peek > cover.peekGoal * 0.8
        : cover.mode === 'over' ? (cover.veryLow ? this.prone < 0.25 : this.coverCrouch < 0.45)
          : this.blindW > 0.7
    ));

    // --- Salto y gravedad ---
    // En el suelo no se acumula gravedad: un empuje mínimo hacia abajo mantiene el contacto
    // (uno mayor frenaría la subida por rampas) y el "snap" se encarga de las bajadas.
    // El salto no es instantáneo: primero se flexionan las piernas (impulso) y al
    // extenderlas se despega. En carrera la batida es más corta y se salta más lejos.
    if (this.grounded && this.velocity.y <= 0) {
      this.velocity.y = 0;
      if (this.jumpT < 0 && this.jumpBuffer > 0 && !punching && !cover) {
        this.jumpBuffer = 0;
        this.jumpT = 0;
        this.jumpTime = THREE.MathUtils.lerp(
          CROUCH_TIME, SPRINT_CROUCH_TIME, THREE.MathUtils.clamp(this.speed / SPRINT_SPEED, 0, 1),
        );
      }
      if (this.jumpT >= 0) {
        this.jumpT += dt;
        if (this.jumpT >= this.jumpTime) {
          const hs = this.speed;
          this.velocity.y = JUMP_SPEED + RUN_JUMP_BONUS * hs;
          if (moving && hs < LEAP_SPEED) {
            this.velocity.x = _v.x * LEAP_SPEED;
            this.velocity.z = _v.z * LEAP_SPEED;
          }
          this.jumpT = -1;
          this.landT = 0;
          this.grounded = false;
          this.airTime = 1; // fuerza la animación de salto
        }
      }
    } else {
      this.jumpT = -1; // se quedó sin suelo mientras tomaba impulso
    }
    if (!this.grounded) this.velocity.y -= GRAVITY * dt;

    // Flexión de piernas: sube durante el impulso y amortigua el aterrizaje.
    this.landT = Math.max(0, this.landT - dt);
    const charging = this.jumpT >= 0;
    const crouchTarget = charging ? 1 : this.landAmount * (this.landT / LAND_TIME);
    // Durante el impulso la flexión sigue una curva suave (arranca y termina sin brusquedad).
    if (charging) this.crouch = Math.max(this.crouch, THREE.MathUtils.smootherstep(this.jumpT / this.jumpTime, 0, 1));
    else this.crouch = THREE.MathUtils.damp(this.crouch, crouchTarget, 18, dt);

    // --- Golpe ---
    // Con el bate en la mano, F o el gatillo dan un batazo; si no, un puñetazo.
    if (!punching && !charging && this.grounded && wantsPunch) {
      this.punchT = 0;
      this.punchDone = false;
      this.aimT = 0;
      this.meleeKind = this.weapon === 'bate' ? 'bate' : 'puño';
    }
    if (this.punchT >= 0) {
      const bat = this.meleeKind === 'bate';
      const time = bat ? SWING_TIME : PUNCH_TIME;
      this.punchT += dt;
      if (!this.punchDone && this.punchT >= time * (bat ? SWING_HIT : PUNCH_HIT)) {
        this.punchDone = true;
        this.hitPunch(combat);
      }
      if (this.punchT >= time) this.punchT = -1;
    }

    // --- Disparo ---
    this.fireCooldown -= dt;
    this.dryFire = Math.max(0, this.dryFire - dt);
    if (gun && fireEdge && !this.loaded) this.dryFire = 1; // gatillo sin balas
    this.wantsFire = gun && fireDown && this.loaded && this.punchT < 0 && !this.sprinting;
    // Sin apuntar: fuera de cobertura dispara desde la cadera (levanta el brazo, la cámara no
    // cambia); a cubierto saca el arma a ciegas.
    if (this.wantsFire) {
      if (aimHeld) this.aimT = cover ? AIM_HOLD_COVER : AIM_HOLD;
      else if (cover?.stickPeek) this.aimT = AIM_HOLD_COVER; // asomado con el mando: dispara desde ahí
      else if (cover) this.blindT = BLIND_HOLD;
      else this.aimT = AIM_HOLD;
    }
    this.aimT -= dt;
    this.blindT -= dt;
    if (aimHeld || !gun) this.blindT = 0;
    const aiming = (this.aimT > 0 && (!cover || aimHeld || cover.stickPeek)) || (aimHeld && this.punchT < 0);
    this.aiming = aimHeld && this.punchT < 0;
    this.aimWeight = THREE.MathUtils.damp(this.aimWeight, aiming ? 1 : 0, aiming ? 25 : 10, dt);
    // Quieto de pie: la postura relajada sustituye a la guardia del clip de reposo.
    const still = this.state === 'Idle' && !cover && this.prone < 0.01 && this.punchT < 0 && this.grounded
      && this.crouch < 0.02 && this.speed < 0.3;
    this.standW = THREE.MathUtils.damp(this.standW, still ? 1 : 0, still ? 5 : 12, dt);
    this.breath += BREATH_RATE * dt;
    this.coverReady = THREE.MathUtils.damp(this.coverReady, cover?.attached ? 1 : cover ? 0.5 : 0, 8, dt);
    const blind = this.blindT > 0 && !!cover?.attached && !cover.mode && cover.peek < 0.02;
    this.blindW = THREE.MathUtils.damp(this.blindW, blind ? 1 : 0, blind ? 14 : 9, dt);

    // --- Orientación: hacia la mira al apuntar/golpear, si no hacia el movimiento ---
    if (aiming) {
      this.turnToward(Math.atan2(cam.forward.x, cam.forward.z), 22, dt, AIM_TURN);
    } else if (cover) {
      // De espaldas al muro; durante el deslizamiento de entrada, de cara a él.
      const s = cover.attached ? 1 : -1;
      if (cover.attached && cover.veryLow) {
        // Acostado: perpendicular a la cobertura, con la cabeza hacia ella.
        this.turnToward(Math.atan2(-cover.nx, -cover.nz), 10, dt);
      } else if (blind && cover.blindMode === 'side') {
        // A ciegas en un límite del muro: se gira hacia ese borde, con el hombro en el muro,
        // para sacar el brazo de frente por él.
        this.turnToward(Math.atan2(cover.nz * cover.blindSide, -cover.nx * cover.blindSide), 14, dt);
      } else
      this.turnToward(Math.atan2(cover.nx * s, cover.nz * s), 14, dt);
    } else if (moving && !punching) {
      // Giro suave con velocidad máxima: una media vuelta tarda ~0,25 s en vez de un latigazo.
      this.turnToward(Math.atan2(_v.x, _v.z), 12, dt);
    }

    // --- Mover la cápsula con colisiones ---
    const delta = {
      x: this.velocity.x * dt,
      y: this.grounded ? 0 : this.velocity.y * dt,
      z: this.velocity.z * dt,
    };
    this.controller.computeColliderMovement(this.collider, delta, undefined, GROUPS.player);
    const m = this.controller.computedMovement();
    // Junto a un zombi (otro cuerpo cinemático) el controlador puede devolver más avance
    // horizontal del pedido; se limita para no salir disparado.
    let mx = m.x, mz = m.z;
    const want = Math.hypot(delta.x, delta.z), got = Math.hypot(mx, mz);
    if (got > want + 1e-4) {
      const k = want / got;
      mx *= k;
      mz *= k;
    }
    const t = this.body.translation();
    this.body.setNextKinematicTranslation({ x: t.x + mx, y: t.y + m.y, z: t.z + mz });

    const wasGrounded = this.grounded;
    this.grounded = this.controller.computedGrounded() && this.velocity.y <= 0;
    if (this.velocity.y > 0 && m.y < delta.y * 0.5) this.velocity.y = 0; // golpe contra el techo
    this.airTime = this.grounded ? 0 : this.airTime + dt;
    if (this.grounded && !wasGrounded) {
      // Aterrizaje: cuanto más fuerte la caída, más se flexiona y más velocidad se pierde.
      const impact = -this.velocity.y;
      if (impact > 1.5) {
        this.landAmount = THREE.MathUtils.clamp(impact / 5.5, 0.3, 1);
        this.landT = LAND_TIME;
        this.velocity.x *= LAND_SLOWDOWN;
        this.velocity.z *= LAND_SLOWDOWN;
      }
      this.velocity.y = 0;
    }

    this.updateAnimation(dt, punching);
  }

  /**
   * Catálogo: reproduce en bucle un clip cualquiera del modelo (aunque el juego no lo use) en
   * lugar de las animaciones del juego. Sin nombre, vuelve a la animación normal.
   */
  preview(name) {
    const clip = name && this.clips.find((c) => c.name === name);
    if (!clip && !this.previewAction) return;
    this.mixer.stopAllAction();
    this.strideBlend = false;
    this.previewAction = null;
    if (clip) {
      this.previewClips ??= {};
      this.previewClips[name] ??= clip.clone(); // copia: no hereda el ritmo ni el bucle del juego
      this.previewAction = this.mixer.clipAction(this.previewClips[name]);
      this.previewAction.reset().play();
    }
    this.current = this.actions.Idle;
    this.current.reset().setEffectiveWeight(1);
    if (!clip) this.current.play();
    this.state = 'Idle';
    this.stateT = 0;
  }

  updateAnimation(dt, punching) {
    if (this.previewAction) return this.finishAnimation(dt);
    const s = this.speed;
    let next;
    if (punching && this.meleeKind !== 'bate') next = 'Punch'; // el batazo va por código sobre el clip en curso
    else if (this.airTime > 0.18) next = 'Jump';
    else if (this.cover?.attached) {
      // Paso lateral según hacia qué lado del personaje se desplaza.
      const side = this.velocity.x * -Math.cos(this.facing) + this.velocity.z * Math.sin(this.facing);
      if (this.cover.veryLow) next = 'Idle'; // recostado: la pose y el arrastre van por código
      else next = s < 0.3 ? 'Idle' : side > 0 ? 'CoverRight' : 'CoverLeft';
    }
    else if (s > (WALK_SPEED + RUN_SPEED) / 2) next = 'Running';
    else if (s > 0.35) next = 'Walking';
    else next = 'Idle';

    // Entre quieto, caminar y correr no se cambia más de una vez cada STATE_DWELL: al pasar
    // por velocidad cero (media vuelta) las animaciones parpadeaban y daban saltos.
    this.stateT += dt;
    const gait = (n) => n === 'Idle' || n === 'Walking' || n === 'Running';
    if (next !== this.state && !(gait(next) && gait(this.state) && this.stateT < STATE_DWELL)) {
      const stride = (n) => n === 'Walking' || n === 'Running';
      const strafe = (n) => n === 'CoverLeft' || n === 'CoverRight';
      const idle = this.actions.Idle;
      let action = this.actions[next];
      if (strafe(next)) {
        // El paso lateral se mezcla con la pose de reposo desde el primer fotograma (ver más
        // abajo): aquí solo se arranca con peso cero y se retira la animación anterior.
        if (this.current !== idle) this.current.fadeOut(0.18);
        action.reset();
        action.setEffectiveWeight(0);
        action.play();
        idle.enabled = true;
        if (!idle.isRunning()) idle.reset().play();
        this.strideBlend = true;
      } else if (this.strideBlend && next === 'Idle') {
        // Se detiene: el paso se desvanece y queda la pose de reposo que ya estaba mezclada.
        this.current.fadeOut(0.2);
        idle.setEffectiveWeight(1);
        action = idle;
        this.strideBlend = false;
      } else {
        if (this.strideBlend) idle.fadeOut(0.18);
        this.strideBlend = false;
        // De caminar a correr (y viceversa) se conserva la fase del paso en vez de reiniciarlo.
        const phase = stride(next) && stride(this.state)
          ? this.current.time / this.current.getClip().duration : 0;
        action.reset();
        action.setEffectiveWeight(1);
        if (next === 'Jump') action.time = JUMP_POSE_TIME;
        else if (phase) action.time = phase * action.getClip().duration;
        const fade = next === 'Punch' ? 0.08 : gait(next) && gait(this.state) ? 0.25 : 0.18;
        action.crossFadeFrom(this.current, fade, false).play();
      }
      this.current = action;
      this.state = next;
      this.stateT = 0;
    }
    // Paso lateral a cubierto: el clip es una zancada de carrera, demasiado amplia para ir
    // agachado o para el paso corto de asomarse (las piernas se enredaban). Se mezcla con la
    // pose de reposo para reducir su amplitud.
    if (this.strideBlend) {
      const reduced = this.cover?.peek > 0.02 || this.cover?.mode === 'side'
        ? STRIDE_PEEK : THREE.MathUtils.lerp(1, STRIDE_CROUCHED, this.coverCrouch);
      const w = reduced * THREE.MathUtils.smoothstep(this.stateT, 0, 0.2);
      this.current.setEffectiveWeight(w);
      this.actions.Idle.setEffectiveWeight(1 - w);
    }
    // Ritmo del paso según la velocidad. A ritmo 1 el clip de caminar avanza ~1,28 m/s y el
    // de correr ~2,9 m/s (CLIP_SPEED); lo que falta lo pone la zancada alargada (src/gait.js),
    // hasta un 20 % al correr: igualarlo solo con el ritmo daría pasos frenéticos.
    if (this.state === 'Walking') this.current.timeScale = THREE.MathUtils.clamp(s / 1.25, 0.7, 2);
    if (this.state === 'Running') this.current.timeScale = THREE.MathUtils.clamp(s / (CLIP_SPEED.Run * 1.2), 0.8, 2.2);
    this.finishAnimation(dt);
  }

  finishAnimation(dt) {
    // El mezclador no reescribe los valores que no cambian entre fotogramas, así que la
    // flexión del fotograma anterior se deshace a mano antes de animar.
    if (this.neckPosed) {
      this.neck.quaternion.copy(this.neckRest);
      this.neckPosed = false;
    }
    if (this.posed) {
      for (const p of this.poseBones) {
        p.bone.position.copy(p.pos);
        p.bone.quaternion.copy(p.quat);
      }
      this.posed = false;
    }
    this.mixer.update(dt);
  }

  // Gira un hueso en espacio mundial para llevar la dirección `from` hasta `to`.
  aimBone(bone, from, to) {
    _q.setFromUnitVectors(from, to);
    bone.getWorldQuaternion(_q2);
    _q.multiply(_q2);
    bone.parent.getWorldQuaternion(_pq);
    bone.quaternion.copy(_q.premultiply(_pq.invert()));
    bone.updateMatrixWorld(true);
  }

  // Gira un hueso un ángulo alrededor de un eje dado en espacio mundial.
  turnBone(bone, axis, angle) {
    _q.setFromAxisAngle(axis, angle);
    bone.getWorldQuaternion(_q2);
    _q.multiply(_q2);
    bone.parent.getWorldQuaternion(_pq);
    bone.quaternion.copy(_q.premultiply(_pq.invert()));
    bone.updateMatrixWorld(true);
  }

  /** Guarda la pose animada de los huesos que se modifican por código (una vez por fotograma). */
  savePose() {
    if (this.posed) return;
    for (const p of this.poseBones) {
      p.pos.copy(p.bone.position);
      p.quat.copy(p.bone.quaternion);
    }
    this.posed = true;
  }

  /**
   * Lleva el segmento hueso→`end` (posición mundial de su extremo) hacia `dir`, una dirección
   * en el espacio del modelo de pie (+X izquierda, +Y cabeza, +Z pecho), con peso `w`.
   */
  poseSegment(bone, end, dir, w) {
    _qa.copy(bone.quaternion);
    bone.getWorldPosition(_hip);
    _knee.copy(end).sub(_hip).normalize();
    _dir.copy(dir).normalize().applyQuaternion(this.model.quaternion);
    this.aimBone(bone, _knee, _dir);
    if (w < 1) {
      bone.quaternion.copy(_qa.slerp(bone.quaternion, w));
      bone.updateMatrixWorld(true);
    }
  }

  /**
   * Suma a la postura ya calculada los giros libres guardados en `POSES[key].ajustes`, con
   * peso `w`. Los pies no cuelgan de la pierna en este modelo: se llevan con la tibia.
   */
  applyAdjust(key, w) {
    const adj = POSES[key].ajustes;
    if (w < 0.002 || !adj) return;
    let any = false;
    for (const k in adj) { any = true; break; }
    if (!any) return;
    this.savePose();
    this.model.updateMatrixWorld(true);
    const turn = (bone) => {
      const d = adj[bone.name];
      if (!d) return;
      _qb.set(d[0], d[1], d[2], d[3]);
      if (w < 1) _qb.copy(_q.identity().slerp(_qb, w));
      bone.quaternion.premultiply(_qb);
      bone.updateMatrixWorld(true);
    };
    for (const bone of this.adjustBones) turn(bone);
    for (const leg of this.legs) {
      if (!adj[leg.upper.name] && !adj[leg.lower.name] && !adj[leg.foot.name]) continue;
      const kneeOld = leg.lower.getWorldPosition(_knee2);
      const footOld = leg.foot.getWorldPosition(_foot).sub(kneeOld);
      leg.foot.getWorldQuaternion(_fq);
      leg.lower.getWorldQuaternion(_qa);
      turn(leg.upper);
      turn(leg.lower);
      leg.lower.getWorldQuaternion(_q2).multiply(_qa.invert()); // giro total de la tibia
      leg.lower.getWorldPosition(_a).add(footOld.applyQuaternion(_q2));
      leg.foot.position.copy(leg.foot.parent.worldToLocal(_a));
      leg.foot.parent.getWorldQuaternion(_pq);
      leg.foot.quaternion.copy(_pq.invert().multiply(_q2).multiply(_fq));
      leg.foot.updateMatrixWorld(true);
      turn(leg.foot);
    }
  }

  /**
   * Editor de posturas: gira un hueso con el giro `world` (cuaternión en el mundo) y lo
   * acumula en los ajustes de la postura `key`.
   */
  adjustBone(key, name, world) {
    const part = this.parts.find((p) => p.name === name);
    if (!part) return;
    const adj = POSES[key].ajustes;
    part.bone.parent.getWorldQuaternion(_pq);
    _qa.copy(_pq).invert().multiply(world).multiply(_pq); // el mismo giro visto desde el hueso padre
    const d = adj[name];
    if (d) _qa.multiply(_qb.set(d[0], d[1], d[2], d[3]));
    _qa.normalize();
    adj[name] = [_qa.x, _qa.y, _qa.z, _qa.w].map((v) => +v.toFixed(4));
  }

  /**
   * Pose acostada tras una cobertura muy baja, con peso `w`: una rodilla levantada con el pie
   * apoyado, la otra pierna estirada, manos sobre el pecho y cabeza recostada en el objeto.
   * Se define sobre el modelo de pie; `postPhysics` ya lo ha tumbado boca arriba.
   */
  /**
   * Fase `ph` (0-1) del ciclo de desplazamiento acostado. Primera mitad: manos y pies quietos
   * en el suelo y el cuerpo, algo levantado, se desliza un paso entero entre ellos. Segunda
   * mitad: el cuerpo descansa y manos y pies se levantan y se adelantan. Devuelve, en metros
   * y hacia donde avanza: `body`, adelanto del cuerpo sobre la cápsula (que va a velocidad
   * constante); `lift`, cuánto se levanta; `limb`, posición de manos y pies respecto a su
   * sitio de reposo; `up`, 0-1, cuánto están levantados.
   */
  crawlPhase(ph) {
    const L = CRAWL_STEP;
    const ss = THREE.MathUtils.smoothstep;
    if (ph < 0.5) {
      const u = ph / 0.5, P = L * ss(u, 0, 1);
      return { body: P - L * ph - L / 4, lift: CRAWL_LIFT * Math.sin(Math.PI * u), limb: L / 2 - P, up: 0 };
    }
    const u = (ph - 0.5) / 0.5;
    return { body: L - L * ph - L / 4, lift: 0, limb: -L / 2 + L * ss(u, 0, 1), up: Math.sin(Math.PI * u) };
  }

  /**
   * Cadena de dos huesos (`upper`, `lower`) que lleva el punto `endPos` (mundial, unido a
   * `lower`) hasta `target`, doblando la articulación hacia `pole`. Con `foot`, ese hueso,
   * que en este modelo no cuelga de la pierna, se recoloca para seguir a la tibia.
   */
  reach(upper, lower, endPos, target, pole, foot = null) {
    const end = lower.worldToLocal(_foot.copy(endPos));
    if (foot) {
      foot.getWorldQuaternion(_fq);
      lower.getWorldQuaternion(_qb);
    }
    for (let i = 0; i < 2; i++) {
      upper.getWorldPosition(_hip);
      lower.getWorldPosition(_knee);
      const l1 = _hip.distanceTo(_knee);
      const l2 = _knee.distanceTo(_h.copy(end).applyMatrix4(lower.matrixWorld));
      _dir.subVectors(target, _hip);
      const d = THREE.MathUtils.clamp(_dir.length(), Math.abs(l1 - l2) + 1e-3, (l1 + l2) * 0.999);
      _dir.normalize();
      _axis.copy(pole).addScaledVector(_dir, -pole.dot(_dir)).normalize();
      const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
      const out = Math.sqrt(Math.max(l1 * l1 - along * along, 0));
      _v.copy(_hip).addScaledVector(_dir, along).addScaledVector(_axis, out); // codo o rodilla
      this.aimBone(upper, _knee.sub(_hip).normalize(), _h.copy(_v).sub(_hip).normalize());
      lower.getWorldPosition(_knee);
      _h.copy(end).applyMatrix4(lower.matrixWorld).sub(_knee).normalize();
      this.aimBone(lower, _h, _v.copy(target).sub(_knee).normalize());
    }
    if (foot) {
      lower.getWorldQuaternion(_q2).multiply(_qb.invert()); // giro total de la tibia
      foot.position.copy(foot.parent.worldToLocal(_h.copy(end).applyMatrix4(lower.matrixWorld)));
      foot.parent.getWorldQuaternion(_pq);
      foot.quaternion.copy(_pq.invert().multiply(_q2).multiply(_fq));
      foot.updateMatrixWorld(true);
    }
  }

  /**
   * Brazo con límites de articulación: lleva la mano (`side` +1 izquierda, -1 derecha) hacia
   * `target` con peso `w`. El hombro no deja llevar la mano muy por detrás de la espalda ni
   * cruzarla por delante del pecho más de lo natural; el codo no se estira del todo ni se
   * cierra más de ~145°, y se dobla siempre hacia fuera, abajo y atrás, nunca al revés.
   * Con `straight`, el peso mueve la mano en línea recta desde donde está (si se mezclaran
   * los giros de los huesos, la mano podría pasar por detrás del cuerpo entre dos posturas).
   * Con `palm`, lo que llega a `target` es el centro de la palma en vez de la muñeca.
   */
  reachArm(side, target, w, straight = false, palm = false) {
    const upper = side > 0 ? this.upperArmL : this.upperArm;
    const lower = side > 0 ? this.lowerArmL : this.lowerArm;
    const hand = side > 0 ? this.handL : this.hand;
    if (!upper || !lower || !hand || hand === lower || w < 0.002) return;
    this.model.updateMatrixWorld(true);
    const q = this.model.quaternion.clone();
    const S = upper.getWorldPosition(new THREE.Vector3());
    const E = lower.getWorldPosition(new THREE.Vector3());
    const H = palm ? this.palm(new THREE.Vector3(), side) : hand.getWorldPosition(new THREE.Vector3());
    const len = S.distanceTo(E) + E.distanceTo(H);
    // Los límites son respecto al tronco: si está girado (batazo), se miden en su marco.
    if (this.armFrame) q.copy(this.armFrame);
    if (straight && w < 1) {
      target = H.clone().lerp(target, w);
      w = 1;
    }
    // Dirección hombro→mano en el marco del modelo (+X izquierda, +Y arriba, +Z pecho).
    const qi = q.clone().invert();
    const u = target.clone().sub(S);
    const dist = THREE.MathUtils.clamp(u.length(), len * ARM_LIMITS.cerrado, len * ARM_LIMITS.estirado);
    u.normalize().applyQuaternion(qi);
    // Los recortes conservan la longitud: lo que se quita de un eje pasa a los otros, así la
    // dirección cambia de forma continua (sin saltos de un fotograma a otro).
    for (let i = 0; i < 3; i++) {
      // Hacia atrás solo un poco (algo más con el brazo en alto).
      const back = -ARM_LIMITS.atras - ARM_LIMITS.atrasArriba * Math.max(u.y, 0);
      if (u.z < back) {
        const r = Math.hypot(u.x, u.y), m = Math.sqrt(1 - back * back);
        if (r > 1e-6) { u.x *= m / r; u.y *= m / r; } else u.y = m;
        u.z = back;
      }
      // Cruzar al otro lado solo por delante del pecho: el sobrante lleva la mano al frente.
      const cross = ARM_LIMITS.cruce + this.armCross + ARM_LIMITS.cruceDelante * Math.max(u.z, 0);
      if (-u.x * side > cross) {
        u.x = -cross * side;
        const rest = 1 - u.x * u.x, lim = Math.sqrt(rest);
        u.y = THREE.MathUtils.clamp(u.y, -lim, lim);
        u.z = Math.sqrt(Math.max(rest - u.y * u.y, 0));
      }
    }
    u.normalize();
    const goal = u.applyQuaternion(q).multiplyScalar(dist).add(S);
    // El codo apunta sobre todo atrás, algo abajo y hacia fuera.
    const pole = new THREE.Vector3(side * ARM_LIMITS.codoFuera, -0.45, -0.75).applyQuaternion(q);
    const qu = upper.quaternion.clone(), ql = lower.quaternion.clone();
    this.reach(upper, lower, H, goal, pole);
    if (w < 1) {
      upper.quaternion.copy(qu.slerp(upper.quaternion, w));
      lower.quaternion.copy(ql.slerp(lower.quaternion, w));
      upper.updateMatrixWorld(true);
    }
  }

  applyRecline(w) {
    if (!this.bodyBone || !this.legs.length) return;
    this.savePose();
    this.model.updateMatrixWorld(true);
    const R = POSES.recostado;
    const k = this.scootW * w; // al desplazarse dobla las dos rodillas para empujar con los pies

    for (const leg of this.legs) {
      const i = leg.side < 0 ? 0 : 1; // la pierna derecha es la que levanta la rodilla
      const hip = THREE.MathUtils.lerp(i ? R.caderaAbajo : R.caderaArriba, R.caderaArriba, k);
      const knee = THREE.MathUtils.lerp(i ? R.rodillaAbajo : R.rodillaArriba, R.rodillaArriba, k);
      // El pie no cuelga de la pierna en este modelo: se recoloca para que siga a la tibia.
      // (Sin matrices: los huesos de la pierna tienen escala no uniforme y las deforman.)
      const kneeOld = leg.lower.getWorldPosition(_knee2);
      const footOld = leg.foot.getWorldPosition(_foot).sub(kneeOld); // del tobillo respecto a la rodilla
      leg.foot.getWorldQuaternion(_fq);
      // El eje Y de la tibia es su longitud; el signo, hacia el pie.
      const sign = Math.sign(_axis.setFromMatrixColumn(leg.lower.matrixWorld, 1).dot(footOld)) || 1;
      _axis.normalize().multiplyScalar(sign);

      this.poseSegment(leg.upper, kneeOld, _h.set(leg.side * Math.sin(R.piernasAbiertas), -Math.cos(hip), Math.sin(hip)), w);
      const shin = hip - knee;
      leg.lower.getWorldPosition(_a);
      _a.addScaledVector(_axis2.setFromMatrixColumn(leg.lower.matrixWorld, 1).normalize(), sign);
      this.poseSegment(leg.lower, _a, _h.set(0, -Math.cos(shin), Math.sin(shin)), w);

      // Giro total de la tibia → el pie gira y se traslada con ella.
      _axis2.setFromMatrixColumn(leg.lower.matrixWorld, 1).normalize().multiplyScalar(sign);
      _q.setFromUnitVectors(_axis, _axis2);
      leg.lower.getWorldPosition(_a).add(footOld.applyQuaternion(_q));
      leg.foot.position.copy(leg.foot.parent.worldToLocal(_a));
      leg.foot.parent.getWorldQuaternion(_pq);
      leg.foot.quaternion.copy(_pq.invert().multiply(_q).multiply(_fq));
      leg.foot.updateMatrixWorld(true);
    }

    // Tronco encorvado hacia las rodillas.
    if (this.abdomen) this.turnBone(this.abdomen, _right.set(1, 0, 0).applyQuaternion(this.model.quaternion), R.tronco * w);
    // Brazos: codos junto al cuerpo y las dos manos delante del pecho, donde va el arma.
    for (const [upper, lower, hand, side] of [
      [this.upperArmL, this.lowerArmL, this.handL, 1], [this.upperArm, this.lowerArm, this.hand, -1],
    ]) {
      if (!upper || !lower || !hand || hand === lower) continue;
      lower.getWorldPosition(_a);
      const open = Math.cos(R.brazoAbierto), close = Math.cos(R.codoCerrado);
      this.poseSegment(upper, _a, _h.set(
        side * Math.sin(R.brazoAbierto), -Math.cos(R.brazoAdelante) * open, Math.sin(R.brazoAdelante) * open), w);
      hand.getWorldPosition(_a);
      this.poseSegment(lower, _a, _h.set(
        -side * Math.sin(R.codoCerrado), Math.sin(R.antebrazoArriba) * close, Math.cos(R.antebrazoArriba) * close), w);
    }
    // Cabeza levantada del suelo.
    if (this.neck) {
      this.neckRest.copy(this.neck.quaternion);
      this.neckPosed = true;
      _v.set(0, 1, 0).applyQuaternion(this.model.quaternion); // hacia la cabeza
      _right.set(_v.z, 0, -_v.x); // eje horizontal perpendicular: gira la cabeza hacia arriba
      if (_right.lengthSq() > 1e-6) this.turnBone(this.neck, _right.normalize(), -R.cabeza * w);
    }
    this.applyAdjust('recostado', w);
    if (k > 0.001) this.applyCrawl(k);
  }

  /**
   * Desplazamiento acostado, con peso `k`: manos y pies se apoyan en el suelo según la fase
   * del ciclo (`crawlPhase`) y quedan quietos mientras el cuerpo se desliza entre ellos.
   */
  applyCrawl(k) {
    this.model.updateMatrixWorld(true);
    const c = this.crawlPhase(this.scoot);
    const floor = this.position.y;
    const side = _a.set(1, 0, 0).applyQuaternion(this.model.quaternion).setY(0).normalize().clone(); // +X del modelo
    const down = _a.set(0, -1, 0).applyQuaternion(this.model.quaternion).setY(0).normalize().clone(); // hacia los pies
    const step = this.scootDir * c.limb;
    const up = _a.set(0, 1, 0);
    // Manos apoyadas junto a la cadera, con los codos hacia fuera.
    for (const [upper, lower, hand, s] of [
      [this.upperArmL, this.lowerArmL, this.handL, 1], [this.upperArm, this.lowerArm, this.hand, -1],
    ]) {
      if (!upper || !lower || !hand || hand === lower) continue;
      upper.getWorldPosition(_hip);
      const target = _hip.clone().addScaledVector(side, s * CRAWL_HAND_OUT + step).addScaledVector(down, CRAWL_HAND_DOWN);
      target.y = floor + 0.04 + CRAWL_HAND_LIFT * c.up;
      const now = hand.getWorldPosition(_knee2).clone();
      if (k < 1) target.lerp(now, 1 - k);
      this.reach(upper, lower, now, target, side.clone().multiplyScalar(s).addScaledVector(up, 0.6));
    }
    // Pies: desde donde los deja la pose de rodillas dobladas, quietos o adelantándose.
    for (const leg of this.legs) {
      const now = leg.foot.getWorldPosition(_knee2).clone();
      const target = now.clone().addScaledVector(side, step * k);
      target.y = THREE.MathUtils.lerp(now.y, floor + 0.08 + CRAWL_FOOT_LIFT * c.up, k);
      this.reach(leg.upper, leg.lower, now, target, up.clone().addScaledVector(side, leg.side * 0.4), leg.foot);
    }
  }

  /**
   * De pie en reposo, con peso `w` (valores en POSES.parado): pies bajo la cadera con las
   * rodillas casi rectas, brazos colgando junto a los muslos, tronco y cabeza erguidos y una
   * respiración suave. Sustituye a la guardia del clip de reposo.
   */
  applyStand(w) {
    const S = POSES.parado;
    this.savePose();
    this.model.updateMatrixWorld(true);
    const q = this.model.quaternion;
    const F = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const U = new THREE.Vector3(0, 1, 0);
    const X = new THREE.Vector3(1, 0, 0).applyQuaternion(q); // a la izquierda
    const base = this.model.position;
    const breath = Math.sin(this.breath);
    // La cadera del clip está baja (rodillas dobladas): se sube un poco. Los pies se quedan.
    const feet = this.legs.map((l) => [l.foot.getWorldPosition(new THREE.Vector3()), l.foot.getWorldQuaternion(new THREE.Quaternion())]);
    if (this.bodyBone && S.cadera) {
      this.bodyBone.getWorldPosition(_v);
      _v.y += S.cadera * w;
      this.bodyBone.position.copy(this.bodyBone.parent.worldToLocal(_v));
      this.bodyBone.updateMatrixWorld(true);
      this.legs.forEach((l, i) => {
        l.foot.position.copy(l.foot.parent.worldToLocal(_v.copy(feet[i][0])));
        l.foot.parent.getWorldQuaternion(_pq);
        l.foot.quaternion.copy(_pq.invert().multiply(feet[i][1]));
        l.foot.updateMatrixWorld(true);
      });
    }
    // Piernas: el pie va bajo la cadera, plano como estaba; las rodillas apenas se doblan.
    for (const leg of this.legs) {
      const foot = leg.foot.getWorldPosition(new THREE.Vector3());
      const rot = leg.foot.getWorldQuaternion(new THREE.Quaternion());
      const target = base.clone().addScaledVector(X, leg.side * S.piesAfuera).addScaledVector(F, S.piesAdelante);
      target.y = foot.y;
      this.reach(leg.upper, leg.lower, foot, foot.clone().lerp(target, w), F.clone().addScaledVector(X, leg.side * 0.15), leg.foot);
      leg.foot.parent.getWorldQuaternion(_pq);
      leg.foot.quaternion.copy(_pq.invert().multiply(rot));
      leg.foot.updateMatrixWorld(true);
    }
    // Tronco y cabeza erguidos; el pecho sube y baja un poco al respirar.
    this.applyTorso(w, { giro: 0, lado: 0, frente: S.tronco - 0.012 * breath, cuello: 0, cabeza: S.cabeza + 0.01 * breath });
    // Brazos colgando junto a los muslos (no cuando apunta).
    const arms = w * (1 - this.aimWeight) * (1 - this.blindW);
    for (const side of [1, -1]) {
      const hand = base.clone().addScaledVector(X, side * S.manosAfuera)
        .addScaledVector(F, S.manosAdelante + 0.006 * breath).addScaledVector(U, S.manosAltura);
      this.reachArm(side, hand, arms);
    }
    this.applyAdjust('parado', w);
  }

  /** Centro de la palma, donde va la empuñadura del arma (`side` +1 izquierda, -1 derecha). */
  palm(out, side = -1) {
    const hand = side > 0 ? this.handL : this.hand, finger = side > 0 ? this.fingerL : this.fingerR;
    hand.getWorldPosition(out);
    if (finger) out.lerp(finger.getWorldPosition(_h), 0.35);
    return out;
  }

  /** ¿Está dando un batazo? (El golpe en curso empezó con el bate y sigue en la mano.) */
  get swinging() {
    return this.punchT >= 0 && this.meleeKind === 'bate' && this.weapon === 'bate';
  }

  /**
   * Avance del batazo (0-5, índice en SWING_KEYS) según la fracción `u` de su duración. Toma
   * impulso despacio y se detiene un instante atrás; el golpe acelera hasta conectar y se
   * frena al otro lado; después vuelve a la guardia.
   */
  swingPhase(u) {
    const ease = (x) => THREE.MathUtils.smootherstep(x, 0, 1);
    const hit = SWING_LOAD + SWING_STRIKE;
    if (u < SWING_LOAD) return ease(u / SWING_LOAD);
    if (u < hit) {
      // Arranca de parado, va cada vez más rápido y solo frena pasado el contacto.
      const x = (u - SWING_LOAD) / SWING_STRIKE;
      const a = 0.6;
      return 1 + 3 * (x < a ? (x * x) / a : 1 - ((1 - x) * (1 - x)) / (1 - a));
    }
    return 4 + ease((u - hit) / (1 - hit));
  }

  /**
   * Sujeta un arma con las dos manos, como los pies se clavan al suelo: el arma va en la palma
   * derecha y la izquierda se ancla a su agarre (`leftGrip`, en el marco del arma). Si la
   * izquierda no llega (los brazos tienen límites), se acerca el arma hacia ella (hasta
   * GRIP_SHIFT) y se repite, de modo que ninguna mano se despega. `right` es adónde va la muñeca derecha con peso `wR`
   * (con `posed`, el brazo ya está ahí y solo se mueve si hay que acercar el arma); `place()` coloca el arma en la palma derecha y la
   * orienta; `wL` es el peso de la mano izquierda.
   */
  holdTwoHanded(weapon, right, wR, place, leftGrip, wL, straight = true, posed = false) {
    this.savePose();
    this.armCross = ARM_LIMITS.cruceDosManos * wL;
    this.solveTwoHanded(weapon, right, wR, place, leftGrip, wL, straight, posed);
    this.armCross = 0;
    this.armFrame = null;
  }

  solveTwoHanded(weapon, right, wR, place, leftGrip, wL, straight, posed) {
    const arms = [this.upperArm, this.lowerArm, this.upperArmL, this.lowerArmL];
    const saved = arms.map((b) => b.quaternion.clone());
    const restore = (from) => {
      for (let i = from; i < 4; i++) arms[i].quaternion.copy(saved[i]);
      this.model.updateMatrixWorld(true);
    };
    const shift = new THREE.Vector3(), L = new THREE.Vector3(), P = new THREE.Vector3();
    // A medio colocar no hay nada que corregir: la corrección entra poco a poco al final.
    const firm = THREE.MathUtils.smoothstep(Math.min(wL, right ? wR : 1), 0.9, 1);
    for (let i = 0; i < 4; i++) {
      if (i) restore(right ? 0 : 2);
      if (right && wR > 0.002 && (i || !posed)) this.reachArm(-1, right.clone().add(shift), wR, straight);
      place();
      weapon.updateMatrixWorld(true);
      if (wL < 0.01 || !this.handL || this.handL === this.lowerArmL) return;
      L.copy(leftGrip).applyMatrix4(weapon.matrixWorld);
      this.reachArm(1, L, wL, straight, true);
      const gap = this.palm(P, 1).distanceTo(L);
      if (firm > 0.99) this.gripGap = gap; // para medirlo desde fuera
      if (!firm || !right || gap < GRIP_SLACK) return;
      shift.addScaledVector(P.sub(L), 0.8 * firm).clampLength(0, GRIP_SHIFT); // el arma va hacia donde sí llega la izquierda
    }
  }

  /**
   * Brazos a cubierto, con peso `w`. Con la pistola, las dos manos juntas delante del pecho y
   * el cañón hacia arriba; sin ella, agachado apoya las manos en las rodillas y de pie las
   * deja delante del vientre, con los codos doblados.
   */
  applyCoverArms(w, withGun) {
    if (!this.upperArm || !this.lowerArm || !this.upperArmL || !this.lowerArmL) return;
    if (this.hand === this.lowerArm || this.handL === this.lowerArmL) return;
    this.savePose();
    this.model.updateMatrixWorld(true);
    const q = this.model.quaternion;
    const F = new THREE.Vector3(0, 0, 1).applyQuaternion(q); // al frente
    const U = new THREE.Vector3(0, 1, 0).applyQuaternion(q); // arriba
    const X = new THREE.Vector3(1, 0, 0).applyQuaternion(q); // a la izquierda
    const chest = (this.spine[this.spine.length - 1] ?? this.bodyBone).getWorldPosition(new THREE.Vector3());
    const A = COVER_ARMS;
    let right, left;
    if (withGun) {
      right = chest.clone().addScaledVector(F, A.frente).addScaledVector(U, -A.bajo).addScaledVector(X, -A.centro);
      left = right.clone().addScaledVector(X, A.manos).addScaledVector(F, -0.02).addScaledVector(U, -0.03);
    } else if (this.coverCrouch > 0.5) {
      // Manos sobre las rodillas.
      const knee = (side) => {
        const leg = this.legs.find((l) => l.side === side);
        return leg ? leg.lower.getWorldPosition(new THREE.Vector3()).addScaledVector(U, 0.06).addScaledVector(F, -0.04) : null;
      };
      right = knee(-1) ?? chest.clone();
      left = knee(1) ?? chest.clone();
    } else {
      right = chest.clone().addScaledVector(F, 0.2).addScaledVector(U, -0.34).addScaledVector(X, -0.1);
      left = chest.clone().addScaledVector(F, 0.2).addScaledVector(U, -0.34).addScaledVector(X, 0.1);
    }
    const nowR = this.hand.getWorldPosition(new THREE.Vector3());
    this.reachArm(-1, right, w);
    // Con la pistola la izquierda va a la mano derecha ya colocada.
    if (withGun) left = this.hand.getWorldPosition(new THREE.Vector3()).addScaledVector(X, A.manos).addScaledVector(U, -0.03);
    this.reachArm(1, left, w);
  }

  /**
   * Gira el tronco (repartido entre cintura, tronco y pecho) y la cabeza, con peso `w`. Los
   * ángulos van en el marco del modelo: `giro` sobre la columna (+ lleva el hombro derecho
   * adelante), `lado` inclinación lateral (+ hacia la izquierda, sube el hombro derecho),
   * `frente` hacia el pecho (+ se encorva), y `cuello`/`cabeza` el giro y la inclinación de la
   * cabeza (para compensar y mirar hacia otro lado).
   */
  applyTorso(w, t) {
    if (!this.spine.length) return;
    this.savePose();
    this.model.updateMatrixWorld(true);
    const q = this.model.quaternion;
    const axes = [[_axis.set(0, 1, 0).applyQuaternion(q).clone(), t.giro], [_axis.set(0, 0, 1).applyQuaternion(q).clone(), -t.lado],
      [_axis.set(1, 0, 0).applyQuaternion(q).clone(), t.frente]];
    const k = w / this.spine.length;
    for (const bone of this.spine) for (const [axis, a] of axes) if (a) this.turnBone(bone, axis, a * k);
    if (this.neck) {
      if (t.cuello) this.turnBone(this.neck, axes[0][0], t.cuello * w);
      if (t.cabeza) this.turnBone(this.neck, axes[2][0], t.cabeza * w);
    }
  }

  /** Giro del tronco al disparar a ciegas, según la cobertura (ver applyTorso). */
  blindTorso(c) {
    if (c.veryLow) {
      // Acostado: se encorva levantando hombros y pecho, girado hacia el lado del objetivo.
      _v.copy(this.aimPoint).sub(this.position);
      _axis.set(1, 0, 0).applyQuaternion(this.model.quaternion);
      const side = Math.sign(_v.dot(_axis)) || 1; // + objetivo a la izquierda del cuerpo
      return { ...TORSO_BLIND.muyBaja, giro: TORSO_BLIND.muyBaja.giro * -side };
    }
    if (c.blindMode === 'up') return TORSO_BLIND.arriba;
    if (c.blindMode === 'side') return TORSO_BLIND.borde;
    return TORSO_BLIND.baja;
  }

  /**
   * Disparo a ciegas desde la cobertura, con peso `w`: el brazo derecho sale por encima del
   * objeto (por el lado si el muro es alto) mientras el cuerpo sigue cubierto, y la mano
   * izquierda lo acompaña. El arma se orienta después hacia la mira.
   */
  applyBlindFire(w) {
    const c = this.cover;
    if (!c || !this.upperArm || !this.lowerArm || this.hand === this.lowerArm) return;
    this.savePose();
    this.model.updateMatrixWorld(true);
    const shoulder = this.upperArm.getWorldPosition(_a).clone();
    const toward = _v.copy(this.aimPoint).sub(shoulder).setY(0);
    if (toward.lengthSq() > 1e-6) toward.normalize();
    const back = new THREE.Vector3(-c.nx, 0, -c.nz); // hacia el muro (y lo que hay detrás)
    const dir = new THREE.Vector3(0, 1, 0);
    if (c.veryLow) dir.addScaledVector(toward, 0.45); // acostado: brazo en alto sobre el pecho
    else if (c.blindMode === 'side') {
      // En un límite del muro: brazo estirado hacia el borde por el que saca el arma.
      const side = c.blindSide;
      dir.set(c.nz * side, 0.12, -c.nx * side).addScaledVector(back, 0.1);
    } else if (c.blindMode === 'up') dir.addScaledVector(back, 0.12); // brazo en alto, pegado al muro
    else dir.addScaledVector(back, 0.5).addScaledVector(toward, 0.15); // por encima y hacia atrás
    const target = shoulder.clone().addScaledVector(dir.normalize(), BLIND_REACH);
    const straight = this.coverReady > 0.5; // parte de la postura de espera, ya calculada
    this.reachArm(-1, target, w, straight);
    if (c.blindMode === 'up') return; // con el brazo en alto, la izquierda se queda abajo
    // La mano izquierda va junto a la derecha.
    const left = new THREE.Vector3(1, 0, 0).applyQuaternion(this.model.quaternion); // +X = izquierda
    this.reachArm(1, this.hand.getWorldPosition(new THREE.Vector3()).addScaledVector(left, 0.06), w, straight);
  }

  /**
   * Flexión procedimental sobre la animación en curso: baja la cadera, dobla las rodillas
   * (IK de dos huesos, con los pies fijos en el suelo), inclina el tronco y lleva los
   * brazos hacia atrás, como al tomar impulso o al amortiguar una caída.
   */
  applyCrouch(depth, lean, arms, side = 0) {
    if (!this.bodyBone || !this.legs.length) return;
    this.savePose();
    this.model.updateMatrixWorld(true);
    // El extremo de cada pierna (tobillo) en coordenadas de su hueso, antes de agacharse.
    for (const leg of this.legs) {
      leg.foot.getWorldPosition(leg.end);
      leg.lower.worldToLocal(leg.end);
    }

    // Baja la cadera.
    const parent = this.bodyBone.parent;
    this.bodyBone.getWorldPosition(_v);
    _v.y -= depth;
    this.bodyBone.position.copy(parent.worldToLocal(_v));
    this.bodyBone.updateMatrixWorld(true);

    const fx = Math.sin(this.facing), fz = Math.cos(this.facing);
    // La pose de piernas calculada entra de forma gradual con la profundidad: aplicarla de
    // golpe hacía que las rodillas dieran un salto al empezar o terminar de agacharse.
    const ik = THREE.MathUtils.smoothstep(depth, 0, 0.08);
    for (const leg of ik > 0 ? this.legs : []) {
      const target = leg.foot.getWorldPosition(_a);
      _qa.copy(leg.upper.quaternion);
      _qb.copy(leg.lower.quaternion);
      for (let i = 0; i < 3; i++) {
        leg.upper.getWorldPosition(_hip);
        leg.lower.getWorldPosition(_knee);
        const l1 = _hip.distanceTo(_knee);
        const l2 = _knee.distanceTo(_h.copy(leg.end).applyMatrix4(leg.lower.matrixWorld));
        _dir.subVectors(target, _hip);
        const d = Math.min(_dir.length(), (l1 + l2) * 0.999);
        _dir.normalize();
        // La rodilla se dobla hacia delante.
        _pole.set(fx, 0, fz).addScaledVector(_dir, -(fx * _dir.x + fz * _dir.z)).normalize();
        const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
        const out = Math.sqrt(Math.max(l1 * l1 - along * along, 0));
        _v.copy(_hip).addScaledVector(_dir, along).addScaledVector(_pole, out); // rodilla deseada
        this.aimBone(leg.upper, _knee.sub(_hip).normalize(), _h.copy(_v).sub(_hip).normalize());
        leg.lower.getWorldPosition(_knee);
        _h.copy(leg.end).applyMatrix4(leg.lower.matrixWorld).sub(_knee).normalize();
        this.aimBone(leg.lower, _h, _v.copy(target).sub(_knee).normalize());
      }
      if (ik < 1) {
        leg.upper.quaternion.copy(_qa.slerp(leg.upper.quaternion, ik));
        leg.lower.quaternion.copy(_qb.slerp(leg.lower.quaternion, ik));
        leg.upper.updateMatrixWorld(true);
      }
    }

    // Tronco hacia delante y brazos atrás.
    _right.set(fz, 0, -fx);
    if (this.abdomen) {
      this.turnBone(this.abdomen, _right, lean);
      // Inclinación lateral (asomarse): giro alrededor del eje de avance.
      if (side) this.turnBone(this.abdomen, _pole.set(fx, 0, fz), side);
    }
    for (const arm of [this.upperArmL, this.upperArm]) {
      if (arm && arms) this.turnBone(arm, _right, arms);
    }
  }

  // Golpe (puño o bate): empuja todo lo que esté delante del personaje y hiere a los zombis.
  hitPunch(combat) {
    const M = MELEE[this.meleeKind];
    const fx = Math.sin(this.facing), fz = Math.cos(this.facing);
    const center = { x: this.position.x + fx * M.reach, y: this.position.y + 1.05, z: this.position.z + fz * M.reach };
    // Primero se recogen los colliders; los impulsos se aplican fuera de la consulta.
    const found = [];
    this.physics.world.intersectionsWithShape(
      center, { x: 0, y: 0, z: 0, w: 1 }, new RAPIER.Ball(M.radius),
      (collider) => { found.push(collider); return true; },
      undefined, GROUPS.query,
    );
    const seen = new Set();
    let hits = 0;
    for (const collider of found) {
      const body = collider.parent();
      if (!body || seen.has(body.handle)) continue;
      const zombie = this.physics.meta.get(collider.handle)?.zombie;
      if (zombie) {
        seen.add(body.handle);
        zombie.damage(M.damage, this);
        combat.punchHits++;
        hits++;
        continue;
      }
      if (!body.isDynamic()) continue;
      seen.add(body.handle);
      const strength = (Math.min(body.mass(), 25) * 4.5 + 5) * M.push;
      body.applyImpulse({ x: fx * strength, y: strength * 0.3, z: fz * strength }, true);
      const meta = this.physics.meta.get(collider.handle);
      this.physics.flash(meta);
      combat.registerHit(meta, 'punch');
      hits++;
    }
    if (hits) combat.spark(_v.set(center.x, center.y, center.z), 0.5, 0xffffff);
  }

  /**
   * El bate va en las manos si es el arma elegida: en guardia sobre el hombro derecho y, en el
   * batazo, por el recorrido de SWING_KEYS (impulso atrás, golpe y acompañamiento), con el
   * tronco girando con él. Las dos manos quedan ancladas al mango (holdTwoHanded).
   */
  placeBat() {
    this.bat.visible = this.weapon === 'bate';
    // Al cambiar de arma las manos sueltan el bate poco a poco, aunque ya no se vea.
    if ((!this.bat.visible && this.batReady < 0.01 && this.batGrip < 0.01) || !this.hand) return;
    this.model.updateMatrixWorld(true);
    const swinging = this.swinging;
    const ready = this.batReady * (swinging ? 1 : 1 - THREE.MathUtils.clamp(this.coverReady * 2, 0, 1));
    const k = (swinging ? this.swingPhase(this.punchT / SWING_TIME) : 0) / (SWING_KEYS.length - 1);
    let right = null;
    const aim = new THREE.Quaternion();
    if (ready > 0.01) {
      this.savePose();
      // El tronco carga hacia atrás y gira con el golpe; la cabeza sigue mirando al frente.
      const torso = SWING_TORSO.getPoint(k);
      if (swinging) this.applyTorso(ready, { giro: torso.x, lado: 0, frente: torso.y, cuello: -torso.x * 0.7, cabeza: -torso.y * 0.5 });
      this.model.updateMatrixWorld(true);
      const q = _q2.copy(this.model.quaternion).multiply(_q.setFromAxisAngle(_a.set(0, 1, 0), swinging ? torso.x * ready : 0));
      right = (this.spine[this.spine.length - 1] ?? this.bodyBone).getWorldPosition(new THREE.Vector3());
      right.add(SWING_HAND.getPoint(k).applyQuaternion(q));
      aim.setFromUnitVectors(_a.set(0, 0, 1), SWING_BAT.getPoint(k).normalize().applyQuaternion(q));
      this.armFrame = q.clone();
    }
    this.holdTwoHanded(this.bat, right, ready, () => {
      this.palm(this.bat.position);
      this.hand.getWorldQuaternion(this.bat.quaternion);
      this.bat.quaternion.multiply(BAT_GRIP);
      if (ready > 0.01) this.bat.quaternion.slerp(aim, ready);
    }, BAT_LEFT, this.batGrip);
    this.batTip.set(0, 0, 0.72).applyMatrix4(this.bat.matrixWorld);
  }

  /** Después del paso de física: coloca el modelo, apunta el brazo y dispara. */
  postPhysics(dt, cam, combat) {
    const t = this.body.translation();
    this.position.set(t.x, t.y - FOOT - 0.02, t.z);
    this.model.position.copy(this.position);
    // A cubierto el cuerpo se arrima al muro hasta apoyar la espalda (la cápsula queda más
    // lejos); menos al levantarse de cara al muro, y nada al asomarse más allá del borde.
    const cv = this.cover;
    const out = cv?.peekGoal ? THREE.MathUtils.clamp(cv.peek / cv.peekGoal, 0, 1) : 0;
    const hug = !cv?.attached || cv.veryLow ? 0 : (cv.mode === 'over' || cv.mode === 'blocked' || (cv.blindLocked && cv.blindMode === 'side') ? COVER_HUG_AIM : COVER_HUG) * (1 - out);
    this.coverHug = THREE.MathUtils.damp(this.coverHug, hug, 9, dt);
    if (cv) { this.hugN.x = cv.nx; this.hugN.z = cv.nz; }
    this.model.position.x -= this.hugN.x * this.coverHug;
    this.model.position.z -= this.hugN.z * this.coverHug;
    // Acostado: el modelo se tumba hacia el objeto y gira sobre su eje hasta quedar boca
    // arriba, con la cabeza junto a él y los pies hacia fuera.
    const prone = this.prone > 0.005 ? this.prone : 0;
    this.model.rotation.set(0, this.facing, 0);
    // Caminar y correr de frente: zancada a la medida del avance y pie de apoyo clavado.
    const striding = this.state === 'Walking' || this.state === 'Running';
    const ahead = this.speed > 0.3
      ? (this.velocity.x * Math.sin(this.facing) + this.velocity.z * Math.cos(this.facing)) / this.speed : 0;
    // Sin apuntar el cuerpo gira enseguida hacia donde va, así que vale desde el arranque;
    // apuntando solo si avanza de frente (de lado o hacia atrás el clip no sirve).
    const gaitOn = striding && this.grounded && !this.cover && !prone && this.crouch < 0.05
      && (ahead > 0.8 || this.aimWeight < 0.3);
    // De pie y quieto los pies se quedan donde pisaron y dan pasos cortos (tras la postura).
    const standOn = !gaitOn && this.state === 'Idle' && this.grounded && !this.cover && !prone && this.crouch < 0.05
      && this.coverCrouch < 0.02;
    if (gaitOn || standOn || this.gait.weight > 0.01) this.savePose();
    if (prone) {
      const fx = Math.sin(this.facing), fz = Math.cos(this.facing);
      const n = this.proneN;
      const ease = THREE.MathUtils.smoothstep(prone, 0, 1);
      const R = POSES.recostado;
      this.model.quaternion
        .multiply(_q.setFromAxisAngle(_v.set(1, 0, 0), ease * Math.PI / 2))
        .multiply(_q.setFromAxisAngle(_v.set(0, 1, 0), ease * R.giro * this.proneSide));
      this.model.position.x -= (fx * R.centrado + n.x * R.arrimo) * ease;
      this.model.position.z -= (fz * R.centrado + n.z * R.arrimo) * ease;
      this.model.position.y += R.altura * ease;
      // Ciclo de desplazamiento: la velocidad de lado, vista desde el cuerpo tumbado (+X del modelo).
      _right.set(1, 0, 0).applyQuaternion(this.model.quaternion).setY(0);
      const lat = _right.lengthSq() > 1e-6 ? (this.velocity.x * _right.x + this.velocity.z * _right.z) / _right.length() : 0;
      if (Math.abs(lat) > 0.15) this.scootDir = Math.sign(lat);
      this.scootW = THREE.MathUtils.damp(this.scootW, Math.abs(lat) > 0.15 && prone > 0.6 ? 1 : 0, 7, dt);
      this.scoot = (this.scoot + Math.abs(lat) / CRAWL_STEP * dt) % 1;
      const c = this.crawlPhase(this.scoot);
      const k = this.scootW * ease;
      if (k > 0.001 && _right.lengthSq() > 1e-6) {
        _right.normalize();
        this.model.position.addScaledVector(_right, c.body * this.scootDir * k);
        this.model.position.y += c.lift * k;
      }
      this.applyRecline(ease);
    }
    if (this.standW > 0.01 && !prone) this.applyStand(this.standW);
    if (standOn) this.gait.stand(dt, this.model, this.position.y, this.facing);
    else this.gait.update(dt, this.model, this.position.y, this.facing, this.speed * Math.max(ahead, 0),
      (this.state === 'Running' ? CLIP_SPEED.Run : CLIP_SPEED.Walk) * (this.current?.timeScale ?? 1), gaitOn);
    // Flexión del salto y agachado de cobertura comparten la misma pose procedimental.
    const jc = this.crouch, cc = this.coverCrouch;
    if (jc > 0.01 || cc > 0.01 || Math.abs(this.coverLean) > 0.005) {
      // Inclinación del tronco a cubierto: 0,3 rad agachado del todo; de rodillas, la de su postura.
      const K = POSES.rodillas;
      const coverLean = THREE.MathUtils.lerp(0.3, K.tronco / Math.max(K.agachado, 0.05), this.kneel) * cc;
      this.applyCrouch(
        Math.max(CROUCH_DEPTH * jc, COVER_CROUCH * cc), Math.max(0.45 * jc, coverLean), 0.7 * jc,
        this.coverLean,
      );
    }

    // Asomado con el mando, sin apuntar: gira el tronco y la cabeza para mirar por el borde.
    const look = cv?.stickPeek && cv.mode === 'side' ? cv.peekDir : 0;
    this.peekLook = THREE.MathUtils.damp(this.peekLook, look * (1 - this.aimWeight), 9, dt);
    if (Math.abs(this.peekLook) > 0.01) {
      this.applyTorso(1, { giro: PEEK_HEAD.giro * this.peekLook, lado: 0, frente: 0, cuello: PEEK_HEAD.cuello * this.peekLook, cabeza: 0 });
    }

    const armed = this.aimWeight > 0.05 || this.blindW > 0.05;
    // De rodillas tras una cobertura muy baja: giros libres de su postura.
    const kneelW = this.kneel * THREE.MathUtils.clamp(cc / Math.max(POSES.rodillas.agachado, 0.05), 0, 1) * (1 - prone);
    if (kneelW > 0.01) this.applyAdjust('rodillas', kneelW);

    const cover = this.cover?.attached ? this.cover : null;
    const gun = this.weapon === 'pistola';
    // A cubierto, los brazos esperan en una postura propia (no la del clip de reposo ni el
    // balanceo de la zancada lateral); apuntar o disparar a ciegas la van sustituyendo.
    const ready = this.coverReady * (1 - this.aimWeight) * (1 - this.blindW) * (1 - prone);
    if (ready > 0.01) this.applyCoverArms(ready, gun);
    this.placeBat();
    this.gun.visible = gun && (armed || prone > 0.5 || ready > 0.3);
    this.flash.intensity = Math.max(0, this.flash.intensity - dt * 220);
    if (!this.gun.visible) return;
    if (!armed) {
      // Acostado lleva el arma en las manos, sobre el pecho, apuntando hacia los pies y arriba.
      // A cubierto, junto al pecho con el cañón hacia arriba.
      // La mano izquierda va anclada a la empuñadura, junto a la derecha.
      this.model.updateMatrixWorld(true);
      this.holdTwoHanded(this.gun, this.hand.getWorldPosition(new THREE.Vector3()), 1, () => {
        this.palm(this.gun.position);
        _v.set(prone > 0.5 ? 0.15 : 0.1, prone > 0.5 ? -0.8 : 0.75, prone > 0.5 ? 0.45 : 0.5).applyQuaternion(this.model.quaternion);
        this.gun.lookAt(_v.add(this.gun.position));
      }, GUN_LEFT, Math.max(ready, THREE.MathUtils.smoothstep(prone, 0.5, 1)), true, true);
      return;
    }

    this.aimPoint.copy(combat.aimPoint(cam));
    this.model.updateMatrixWorld(true);
    // A ciegas: los brazos salen de la cobertura (su propia pose; la de apuntar no se usa).
    const blind = this.blindW;
    // El tronco acompaña a los brazos: gira y se inclina antes de colocarlos.
    if (!cover && this.aimWeight > 0.01) {
      // Al descubierto, perfil de tirador: hombro derecho adelante y algo inclinado al frente.
      // Con las dos manos en el arma se cuadra más, para que la izquierda llegue.
      const two = this.coverGrip;
      this.applyTorso(this.aimWeight * (1 - blind), two > 0.01
        ? { ...TORSO_AIM, giro: TORSO_AIM.giro * (1 - 0.8 * two), cuello: TORSO_AIM.cuello * (1 - 0.8 * two) } : TORSO_AIM);
    }
    if (blind > 0.01 && cover) this.applyTorso(blind, this.blindTorso(cover));
    if (blind > 0.01) {
      // A ciegas no hay mira: tira hacia donde mira la cámara (el punto de la mira caería en
      // el propio muro que lo cubre).
      this.upperArm.getWorldPosition(_v);
      if (cover?.blindMode === 'up') {
        // Muro alto, lejos de sus límites: tira hacia arriba, por encima del muro.
        _v.x -= cover.nx * 40 * BLIND_UP_TILT;
        _v.z -= cover.nz * 40 * BLIND_UP_TILT;
        _v.y += 40;
      } else _v.addScaledVector(cam.forward, 40);
      this.aimPoint.lerp(_v, blind);
      this.applyBlindFire(blind);
    }
    const aimW = this.aimWeight * (1 - blind);

    // Brazo derecho casi estirado hacia el objetivo (con límites de articulación).
    // Retroceso: el brazo y el arma suben un instante con cada disparo.
    this.recoil = Math.max(0, this.recoil - dt * 9);
    const kick = RECOIL_KICK * this.recoil * this.recoil;
    if (aimW > 0.002) {
      this.savePose();
      const S = this.upperArm.getWorldPosition(new THREE.Vector3());
      const want = this.aimPoint.clone().sub(S).normalize();
      want.y += kick;
      this.reachArm(-1, want.normalize().multiplyScalar(AIM_REACH).add(S), aimW, this.coverReady > 0.5);
    }

    const aimGun = () => {
      this.palm(this.gun.position);
      this.gun.lookAt(_knee.copy(this.aimPoint).setY(
        this.aimPoint.y + kick * 1.6 * this.gun.position.distanceTo(this.aimPoint),
      ));
    };
    // Apuntando sujeta el arma con las dos manos: el brazo izquierdo va hacia la pistola.
    const grip = this.coverGrip * aimW;
    if (grip > 0.02) {
      // La izquierda envuelve la empuñadura por debajo de la derecha, anclada al arma: si no
      // llega, la pistola se acerca (el brazo derecho ya está colocado y se recoloca con ella).
      this.holdTwoHanded(this.gun, this.hand.getWorldPosition(new THREE.Vector3()), 1, aimGun, GUN_LEFT, grip, this.coverReady > 0.5, true);
    } else aimGun();
    this.gun.updateMatrixWorld(true);
    this.muzzle.copy(GUN_MUZZLE).applyMatrix4(this.gun.matrixWorld);

    if (this.wantsFire && this.canFire && this.fireCooldown <= 0 && (this.aimWeight > 0.6 || blind > 0.7)) {
      this.fireCooldown = FIRE_INTERVAL;
      this.shots++;
      if (!this.infiniteAmmo) this.ammo--;
      this.flash.intensity = 30;
      this.recoil = 1;
      // Sin apuntar la bala se desvía un poco; a ciegas, bastante más.
      const spread = blind > 0.5 ? BLIND_SPREAD : this.aiming ? 0 : HIP_SPREAD;
      const to = _knee.copy(this.aimPoint);
      if (spread) {
        const d = this.muzzle.distanceTo(to) * Math.tan(spread * Math.sqrt(Math.random()));
        _v.randomDirection();
        to.addScaledVector(_v, d);
      }
      combat.fire(this.muzzle, to);
    }
  }
}

