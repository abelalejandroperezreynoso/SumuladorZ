import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { RAPIER, GROUPS } from './physics.js';
import { probeWall, COVER_BASE_Y, COVER_LOW_Y, COVER_HIGH_Y } from './cover.js';
// Importado como recurso: el nombre publicado lleva un hash, así un modelo nuevo nunca
// se confunde con uno antiguo guardado en la caché del navegador.
import modelUrl from './assets/Character.glb?url';

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
// Cuánto se agacha (0-1) en cada postura de cobertura.
const CROUCH_HIDE = 1; // oculto tras una cobertura baja
const CROUCH_OVER = 0.14; // disparando por encima
const CROUCH_KNEEL = 0.9; // incorporado para disparar por encima de una cobertura muy baja
const PRONE_SPEED = 0.8; // velocidad arrastrándose (m/s)
const PRONE_BACK = 0.85; // el cuerpo tumbado se centra sobre la cápsula (m)
const PRONE_LIFT = 0.14; // altura del eje del cuerpo tumbado sobre el suelo (m)
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
const PUNCH_HIT = 0.4; // fracción de la animación en la que conecta
const FIRE_INTERVAL = 0.14;
const JUMP_POSE_TIME = 0.2; // instante del clip de carrera usado como pose de salto
const AIM_HOLD = 0.9; // segundos que mantiene la pose de apuntar tras disparar

// Colores por nombre de material del modelo (los no listados conservan el original).
// LightBlue = pantalón, LightBrown = camiseta, Red_Dark = zapatillas, Hair = pelo.
const PALETTE = { LightBlue: 0x56633c, Red_Dark: 0x1c2338 }; // pantalón oliva, tenis azul marino
const POCKET_COLOR = 0x4a5634;
const THIGH_WIDTH = 1.5; // pantalón holgado: ensancha los huesos de las piernas
const SHIN_WIDTH = 1.22; // ensanche extra de la pernera (se suma al del muslo)
const SHOE_SIZE = 1.25; // tenis más voluminosos
const POCKET_OFFSET = 0.095; // distancia del eje del muslo a su cara exterior (m)

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

// Estado del juego -> clip del modelo. El catálogo lo lee para saber qué clips se usan.
export const PLAYER_CLIPS = {
  Idle: 'Idle', Walking: 'Walk', Running: 'Run', Punch: 'Punch_Right',
  Jump: 'Run', // el modelo no trae salto: zancada de carrera congelada como pose en el aire
  CoverLeft: 'Run_Left', CoverRight: 'Run_Right', // pasos laterales pegado a una cobertura
};
// Valores que el catálogo muestra en sus fichas (así nunca quedan desfasados).
export const TUNING = {
  WALK_SPEED, RUN_SPEED, SPRINT_SPEED, MAX_TURN, AIM_TURN, STATE_DWELL, GRAVITY, JUMP_SPEED, CROUCH_TIME,
  SPRINT_CROUCH_TIME, LAND_TIME, LAND_SLOWDOWN, PUNCH_TIME, PUNCH_HIT, FIRE_INTERVAL, AIM_HOLD, RECOIL_KICK,
  COVER_RANGE, COVER_SPEED, COVER_CROUCH_SPEED, COVER_CROUCH, CROUCH_DEPTH, PEEK_REACH, PEEK_LEAN,
  PRONE_SPEED, STRIDE_CROUCHED, MAX_HEALTH, REGEN_DELAY, REGEN_RATE,
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
      : await loader.loadAsync(modelUrl);
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
    this.prone = 0; // 0 = erguido, 1 = tumbado boca abajo tras una cobertura muy baja
    this.coverLean = 0; // inclinación lateral al asomarse (rad, + hacia la derecha del personaje)
    this.coverGrip = 0; // 0-1: mano izquierda sujetando el arma
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

    // --- Modelo ---
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    model.scale.setScalar(1.75 / (box.max.y - box.min.y));
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.frustumCulled = false;
      const color = PALETTE[o.material.name];
      if (color !== undefined) o.material.color.set(color);
      o.material.roughness = 0.85;
      o.material.metalness = 0;
    });
    this.model = model;
    scene.add(model);

    const bone = (name) => {
      let found = null;
      model.traverse((o) => { if (!found && o.isBone && o.name === name) found = o; });
      return found;
    };
    this.addCargoPants(bone);
    this.upperArm = bone('UpperArmR');
    this.upperArmL = bone('UpperArmL');
    this.bodyBone = bone('Body');
    this.abdomen = bone('Abdomen');
    this.legs = ['L', 'R']
      .map((s) => ({ upper: bone('UpperLeg' + s), lower: bone('LowerLeg' + s), foot: bone('Foot' + s), end: new THREE.Vector3() }))
      .filter((l) => l.upper && l.lower && l.foot);
    // Huesos que modifica la flexión, con su pose de animación guardada para restaurarla.
    this.poseBones = [this.bodyBone, this.abdomen, this.upperArmL, this.upperArm,
      ...this.legs.flatMap((l) => [l.upper, l.lower])]
      .filter(Boolean)
      .map((b) => ({ bone: b, pos: new THREE.Vector3(), quat: new THREE.Quaternion() }));
    this.posed = false;
    this.hand = bone('WristR') ?? bone('LowerArmR');
    this.handL = bone('WristL') ?? bone('LowerArmL');
    this.neck = bone('Neck');
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
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x22262b, metalness: 0.7, roughness: 0.35 });
    this.gun = new THREE.Group();
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.38), gunMat);
    barrel.position.z = 0.16;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.08), gunMat);
    grip.position.set(0, -0.11, 0.02);
    this.gun.add(barrel, grip);
    this.flash = new THREE.PointLight(0xffc066, 0, 6);
    this.flash.position.z = 0.4;
    this.gun.add(this.flash);
    this.gun.visible = false;
    this.recoil = 0; // 1 justo al disparar; decae enseguida

    // Vista de esqueleto al estilo de Blender: cada hueso es un octaedro alargado, ancho
    // junto a su origen y afilado hacia la punta, con una esfera en cada articulación.
    this.skeleton = new THREE.Group();
    this.skeleton.visible = false;
    scene.add(this.skeleton);
    const boneMat = new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.7, flatShading: true });
    const jointMat = new THREE.MeshStandardMaterial({ color: 0xc4c4c4, roughness: 0.5 });
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x111111 });
    // Octaedro de longitud 1 sobre +Y: origen, anillo cuadrado al 10 % y punta.
    const W = 0.1;
    const boneGeo = new THREE.BufferGeometry();
    boneGeo.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0, W, W, W, W, W, -W, -W, W, -W, -W, W, W, 0, 1, 0,
    ], 3));
    boneGeo.setIndex([0, 2, 1, 0, 3, 2, 0, 4, 3, 0, 1, 4, 5, 1, 2, 5, 2, 3, 5, 3, 4, 5, 4, 1]);
    boneGeo.computeVertexNormals();
    const edgeGeo = new THREE.EdgesGeometry(boneGeo);
    const jointGeo = new THREE.SphereGeometry(0.03, 14, 10);
    const SKIP = /Index|Middle|Ring|Pinky|Thumb|^PT|^Root$/; // dedos y huesos auxiliares
    this.stick = { links: [], joints: [] };
    const addLink = (from, to) => {
      const mesh = new THREE.Mesh(boneGeo, boneMat);
      mesh.add(new THREE.LineSegments(edgeGeo, edgeMat));
      this.skeleton.add(mesh);
      this.stick.links.push({ from, to, mesh });
    };
    model.traverse((o) => {
      if (!o.isBone || SKIP.test(o.name)) return;
      const joint = new THREE.Mesh(jointGeo, jointMat);
      if (o.name === 'Head') joint.scale.setScalar(3.5); // la cabeza, más grande
      this.skeleton.add(joint);
      this.stick.joints.push({ bone: o, mesh: joint });
      if (o.parent?.isBone && !SKIP.test(o.parent.name)) addLink(o.parent, o);
    });
    // Los pies no cuelgan de la pierna en este modelo: se unen a mano.
    for (const side of ['L', 'R']) {
      const shin = bone('LowerLeg' + side), foot = bone('Foot' + side);
      if (shin && foot) addLink(shin, foot);
    }
    this.skeletonOnly = false;
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

  // Pantalón tipo cargo: piernas más anchas y un bolsillo con solapa en cada muslo.
  addCargoPants(bone) {
    const pantsMat = new THREE.MeshStandardMaterial({ color: PALETTE.LightBlue, roughness: 0.9 });
    const pocketMat = new THREE.MeshStandardMaterial({ color: POCKET_COLOR, roughness: 0.9 });
    const hip = new THREE.Vector3(), knee = new THREE.Vector3();
    const add = (mesh, parentBone) => {
      mesh.traverse((o) => { o.castShadow = true; });
      this.model.add(mesh);
      parentBone.attach(mesh); // conserva la posición y sigue al hueso al animarse
    };
    for (const side of ['L', 'R']) {
      const upper = bone('UpperLeg' + side), lower = bone('LowerLeg' + side), foot = bone('Foot' + side);
      if (!upper || !lower) continue;
      // El eje Y de cada hueso es su longitud: solo se ensancha el grosor.
      upper.scale.set(THIGH_WIDTH, 1, THIGH_WIDTH);
      lower.scale.set(SHIN_WIDTH, 1, SHIN_WIDTH);
      foot?.scale.setScalar(SHOE_SIZE);
      this.model.updateMatrixWorld(true);
      upper.getWorldPosition(hip);
      lower.getWorldPosition(knee);
      const out = Math.sign(hip.x - this.model.position.x) || (side === 'L' ? 1 : -1);

      // Bolsillo plano con solapa en el lateral del muslo.
      const pocket = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.19, 0.17), pocketMat);
      const flap = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.055, 0.18), pantsMat);
      flap.position.y = 0.075;
      pocket.add(body, flap);
      pocket.position.lerpVectors(hip, knee, 0.6);
      pocket.position.x += out * POCKET_OFFSET;
      add(pocket, upper);

      // Bajo ancho y arrugado que cae sobre el tenis, al final de la pernera.
      const dir = new THREE.Vector3().setFromMatrixColumn(lower.matrixWorld, 1).normalize();
      if (dir.y > 0) dir.negate(); // hacia el tobillo
      const ankleY = this.model.position.y + 0.1;
      const hem = new THREE.Group();
      [[0.112, 0.07, 0.045], [0.124, 0.05, 0]].forEach(([r, h, y]) => {
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.94, r, h, 10), pantsMat);
        ring.position.y = y;
        hem.add(ring);
      });
      hem.position.copy(knee).addScaledVector(dir, (knee.y - ankleY) / -dir.y);
      hem.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
      add(hem, lower);
    }
  }

  respawn() {
    this.body.setTranslation({ x: 0, y: FOOT + 0.05, z: 0 }, true);
    this.body.setNextKinematicTranslation({ x: 0, y: FOOT + 0.05, z: 0 });
    this.velocity.set(0, 0, 0);
    this.jumpT = -1;
    this.jumpBuffer = this.landT = this.crouch = 0;
    this.cover = null;
    this.sprinting = false;
    this.health = MAX_HEALTH;
    this.dead = false;
  }

  /** Altura de la cabeza sobre los pies: baja al agacharse o tumbarse a cubierto. */
  get headHeight() {
    return THREE.MathUtils.lerp(1.45 - 0.6 * this.coverCrouch, 0.3, this.prone);
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
      if (gap < 0.12) c.attached = true;
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

    // Al empezar a apuntar decide cómo asomarse: por el borde si hay uno cerca (siempre en
    // cobertura alta; en la baja, solo si se apunta hacia ese lado) o por encima.
    if (c.attached && aiming && !c.mode) {
      const edge = (side) => {
        for (let r = 0.1; r <= PEEK_REACH; r += 0.07) if (ends(side, r)) return r;
        return Infinity;
      };
      const left = edge(-1), right = edge(1);
      const aimSide = -Math.sin(cam.yaw) * tx - Math.cos(cam.yaw) * tz; // hacia dónde mira la cámara
      let dir = 0;
      if (c.high) {
        const camSide = Math.sign(Math.cos(cam.yaw) * tx - Math.sin(cam.yaw) * tz) || 1;
        dir = left < Infinity && right < Infinity ? camSide : right < Infinity ? 1 : left < Infinity ? -1 : 0;
      } else if (c.veryLow) dir = 0; // tumbado solo se dispara incorporándose
      else if (right < Infinity && aimSide > 0.3) dir = 1;
      else if (left < Infinity && aimSide < -0.3) dir = -1;
      c.peekDir = dir;
      // El arma va en la mano derecha (lado +tangente al encarar el muro).
      c.peekGoal = dir > 0 ? right + PEEK_CLEAR_GUN : dir < 0 ? left + PEEK_CLEAR_OFF : 0;
      c.mode = dir ? 'side' : c.high ? 'blocked' : 'over';
    }
    if (!aiming && c.peek < 0.02) c.mode = null;
    const peekTarget = aiming && c.mode === 'side' ? c.peekGoal : 0;
    let peekV = THREE.MathUtils.clamp((peekTarget - c.peek) * 8, -2.8, 2.8);
    if (c.peek + peekV * dt < 0) peekV = -c.peek / dt;
    c.peek += peekV * dt;
    if (c.peek > 0.02 || peekTarget) along = 0;

    if (along) c.proneDir = along; // tumbado, la cabeza apunta hacia donde se arrastra
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

  /** Alterna entre el personaje normal y solo su esqueleto. */
  toggleSkeleton() {
    this.skeletonOnly = !this.skeletonOnly;
    this.skeleton.visible = this.skeletonOnly;
    this.model.traverse((o) => { if (o.isMesh) o.visible = !this.skeletonOnly; });
    return this.skeletonOnly;
  }

  /** Coloca los huesos y articulaciones dibujados sobre la pose final de este fotograma. */
  updateSkeleton() {
    if (!this.skeletonOnly) return;
    this.model.updateMatrixWorld(true);
    for (const j of this.stick.joints) j.bone.getWorldPosition(j.mesh.position);
    for (const l of this.stick.links) {
      l.from.getWorldPosition(_a);
      l.to.getWorldPosition(_h);
      const len = _a.distanceTo(_h);
      l.mesh.visible = len > 1e-4;
      if (!l.mesh.visible) continue;
      l.mesh.position.copy(_a);
      l.mesh.quaternion.setFromUnitVectors(_v.set(0, 1, 0), _h.sub(_a).divideScalar(len));
      l.mesh.scale.setScalar(len); // el grosor es proporcional a la longitud, como en Blender
    }
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
    const wantsPunch = input.justPressed('KeyF') || input.justPressed('Mouse2');

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
    const coverAim = this.aimT > 0 || (input.mouseDown(0) && !this.sprinting);
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
        leanTarget = cover.peekDir * PEEK_LEAN * out;
      } else if (cover.mode === 'over') coverCrouchTarget = cover.veryLow ? CROUCH_KNEEL : CROUCH_OVER;
      else if (cover.veryLow) proneTarget = 1;
      else if (!cover.high) coverCrouchTarget = CROUCH_HIDE;
    }
    this.prone = THREE.MathUtils.damp(this.prone, proneTarget, 9, dt);
    this.coverCrouch = THREE.MathUtils.damp(this.coverCrouch, coverCrouchTarget, 11, dt);
    this.coverLean = THREE.MathUtils.damp(this.coverLean, leanTarget, 11, dt);
    this.coverGrip = THREE.MathUtils.damp(this.coverGrip, cover?.attached && coverAim ? 1 : 0, 10, dt);
    this.canFire = !cover || (cover.attached && (
      cover.mode === 'side' ? cover.peek > cover.peekGoal * 0.8
        : cover.mode === 'over' && (cover.veryLow ? this.prone < 0.25 : this.coverCrouch < 0.45)
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
    if (!punching && !charging && this.grounded && wantsPunch) {
      this.punchT = 0;
      this.punchDone = false;
      this.aimT = 0;
    }
    if (this.punchT >= 0) {
      this.punchT += dt;
      if (!this.punchDone && this.punchT >= PUNCH_TIME * PUNCH_HIT) {
        this.punchDone = true;
        this.hitPunch(combat);
      }
      if (this.punchT >= PUNCH_TIME) this.punchT = -1;
    }

    // --- Disparo ---
    this.fireCooldown -= dt;
    this.wantsFire = input.mouseDown(0) && this.punchT < 0 && !this.sprinting;
    if (this.wantsFire) this.aimT = AIM_HOLD;
    this.aimT -= dt;
    const aiming = this.aimT > 0;
    this.aimWeight = THREE.MathUtils.damp(this.aimWeight, aiming ? 1 : 0, aiming ? 25 : 10, dt);

    // --- Orientación: hacia la mira al apuntar/golpear, si no hacia el movimiento ---
    if (aiming) {
      this.turnToward(Math.atan2(cam.forward.x, cam.forward.z), 22, dt, AIM_TURN);
    } else if (cover) {
      // De espaldas al muro; durante el deslizamiento de entrada, de cara a él.
      const s = cover.attached ? 1 : -1;
      if (cover.attached && cover.veryLow) {
        // Tumbado: el cuerpo queda paralelo a la cobertura.
        this.turnToward(Math.atan2(cover.nz * cover.proneDir, -cover.nx * cover.proneDir), 10, dt);
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
    if (punching) next = 'Punch';
    else if (this.airTime > 0.18) next = 'Jump';
    else if (this.cover?.attached) {
      // Paso lateral según hacia qué lado del personaje se desplaza.
      const side = this.velocity.x * -Math.cos(this.facing) + this.velocity.z * Math.sin(this.facing);
      if (this.cover.veryLow) next = s < 0.15 || this.cover.mode ? 'Idle' : 'Walking'; // arrastrarse
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
    // Medido con tools/watch.cjs: a ritmo 1 el clip de caminar avanza ~0,8 m/s y el de correr
    // ~3,1 m/s. Igualarlos del todo daría pasos frenéticos; estos valores reducen el
    // deslizamiento de los pies sin perder naturalidad.
    if (this.state === 'Walking') this.current.timeScale = THREE.MathUtils.clamp(s / 1.25, 0.7, 2);
    if (this.state === 'Running') this.current.timeScale = THREE.MathUtils.clamp(s / 4.2, 0.8, 1.9);
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

  /**
   * Flexión procedimental sobre la animación en curso: baja la cadera, dobla las rodillas
   * (IK de dos huesos, con los pies fijos en el suelo), inclina el tronco y lleva los
   * brazos hacia atrás, como al tomar impulso o al amortiguar una caída.
   */
  applyCrouch(depth, lean, arms, side = 0) {
    if (!this.bodyBone || !this.legs.length) return;
    for (const p of this.poseBones) {
      p.pos.copy(p.bone.position);
      p.quat.copy(p.bone.quaternion);
    }
    this.posed = true;
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

  // Empuja todo lo que esté delante del personaje.
  hitPunch(combat) {
    const fx = Math.sin(this.facing), fz = Math.cos(this.facing);
    const center = { x: this.position.x + fx * 0.75, y: this.position.y + 1.05, z: this.position.z + fz * 0.75 };
    // Primero se recogen los colliders; los impulsos se aplican fuera de la consulta.
    const found = [];
    this.physics.world.intersectionsWithShape(
      center, { x: 0, y: 0, z: 0, w: 1 }, new RAPIER.Ball(0.6),
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
        zombie.damage(1.5, this);
        combat.punchHits++;
        hits++;
        continue;
      }
      if (!body.isDynamic()) continue;
      seen.add(body.handle);
      const strength = Math.min(body.mass(), 25) * 4.5 + 5;
      body.applyImpulse({ x: fx * strength, y: strength * 0.3, z: fz * strength }, true);
      const meta = this.physics.meta.get(collider.handle);
      this.physics.flash(meta);
      combat.registerHit(meta, 'punch');
      hits++;
    }
    if (hits) combat.spark(_v.set(center.x, center.y, center.z), 0.5, 0xffffff);
  }

  /** Después del paso de física: coloca el modelo, apunta el brazo y dispara. */
  postPhysics(dt, cam, combat) {
    const t = this.body.translation();
    this.position.set(t.x, t.y - FOOT - 0.02, t.z);
    this.model.position.copy(this.position);
    // Tumbado: el modelo gira hasta quedar boca abajo y se centra sobre la cápsula.
    const prone = this.prone > 0.005 ? this.prone : 0;
    this.model.rotation.set(prone * Math.PI / 2, this.facing, 0, 'YXZ');
    if (prone) {
      this.model.position.x -= Math.sin(this.facing) * PRONE_BACK * prone;
      this.model.position.z -= Math.cos(this.facing) * PRONE_BACK * prone;
      this.model.position.y += PRONE_LIFT * prone;
      // Levanta la cabeza para mirar al frente en vez de al suelo.
      if (this.neck) {
        this.neckRest.copy(this.neck.quaternion);
        this.neckPosed = true;
        this.model.updateMatrixWorld(true);
        this.turnBone(this.neck, _right.set(Math.cos(this.facing), 0, -Math.sin(this.facing)), -0.9 * prone);
      }
    }
    // Flexión del salto y agachado de cobertura comparten la misma pose procedimental.
    const jc = this.crouch, cc = this.coverCrouch;
    if (jc > 0.01 || cc > 0.01 || Math.abs(this.coverLean) > 0.005 || this.coverGrip > 0.01) {
      this.applyCrouch(
        Math.max(CROUCH_DEPTH * jc, COVER_CROUCH * cc), Math.max(0.45 * jc, 0.3 * cc), 0.7 * jc,
        this.coverLean,
      );
    }

    this.gun.visible = this.aimWeight > 0.05;
    this.flash.intensity = Math.max(0, this.flash.intensity - dt * 220);
    if (!this.gun.visible) return;

    this.aimPoint.copy(combat.aimPoint(cam));
    this.model.updateMatrixWorld(true);

    // Gira el brazo derecho para que la línea hombro→mano apunte al objetivo.
    this.upperArm.getWorldPosition(_a);
    this.hand.getWorldPosition(_h);
    const cur = _h.sub(_a).normalize();
    const want = _v.copy(this.aimPoint).sub(_a).normalize();
    // Retroceso: el brazo y el arma suben un instante con cada disparo.
    this.recoil = Math.max(0, this.recoil - dt * 9);
    const kick = RECOIL_KICK * this.recoil * this.recoil;
    want.y += kick;
    want.normalize();
    _q.setFromUnitVectors(cur, want);
    this.upperArm.getWorldQuaternion(_q2);
    _q.multiply(_q2); // orientación mundial deseada
    this.upperArm.parent.getWorldQuaternion(_pq);
    _q.premultiply(_pq.invert());
    this.upperArm.quaternion.slerp(_q, this.aimWeight);
    this.upperArm.updateMatrixWorld(true);

    // A cubierto sujeta el arma con las dos manos: el brazo izquierdo va hacia la pistola.
    const grip = this.coverGrip * this.aimWeight;
    if (grip > 0.02 && this.upperArmL && this.handL) {
      this.hand.getWorldPosition(_knee);
      this.upperArmL.getWorldPosition(_a);
      this.handL.getWorldPosition(_h);
      _q.setFromUnitVectors(_h.sub(_a).normalize(), _v.copy(_knee).sub(_a).normalize());
      this.upperArmL.getWorldQuaternion(_q2);
      _q.multiply(_q2);
      this.upperArmL.parent.getWorldQuaternion(_pq);
      _q.premultiply(_pq.invert());
      this.upperArmL.quaternion.slerp(_q, grip);
      this.upperArmL.updateMatrixWorld(true);
    }

    this.hand.getWorldPosition(this.gun.position);
    this.gun.lookAt(_knee.copy(this.aimPoint).setY(
      this.aimPoint.y + kick * 1.6 * this.gun.position.distanceTo(this.aimPoint),
    ));
    this.gun.updateMatrixWorld(true);
    this.muzzle.set(0, 0, 0.4).applyMatrix4(this.gun.matrixWorld);

    if (this.wantsFire && this.canFire && this.fireCooldown <= 0 && this.aimWeight > 0.6) {
      this.fireCooldown = FIRE_INTERVAL;
      this.shots++;
      this.flash.intensity = 30;
      this.recoil = 1;
      combat.fire(this.muzzle, this.aimPoint);
    }
  }
}

