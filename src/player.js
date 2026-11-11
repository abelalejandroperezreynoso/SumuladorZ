import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RAPIER, GROUPS } from './physics.js';
// Importado como recurso: el nombre publicado lleva un hash, así un modelo nuevo nunca
// se confunde con uno antiguo guardado en la caché del navegador.
import modelUrl from './assets/Character.glb?url';

const WALK_SPEED = 2.2;
const RUN_SPEED = 6.0;
const JUMP_SPEED = 7.0;
const GRAVITY = 20;
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
const PALETTE = { LightBlue: 0x4f5b37 };
const POCKET_COLOR = 0x444f30;
const POCKET_OFFSET = 0.068; // distancia del eje del muslo a su cara exterior (m)
const LEG_WIDTH = 1.22; // pantalón holgado: ensancha los huesos de las piernas

const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _h = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _pq = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

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
    return new Player(scene, physics, gltf);
  }

  constructor(scene, physics, gltf) {
    this.physics = physics;
    this.position = new THREE.Vector3(0, 0, 0); // posición de los pies
    this.velocity = new THREE.Vector3();
    this.facing = Math.PI; // mira hacia -Z
    this.grounded = true;
    this.airTime = 0;
    this.state = 'Idle';
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
    this.hand = bone('WristR') ?? bone('LowerArmR');

    // --- Animaciones ---
    this.mixer = new THREE.AnimationMixer(model);
    // Nombres de estado del juego -> clips del modelo.
    const clip = (name) => gltf.animations.find((c) => c.name === name);
    this.actions = {
      Idle: this.mixer.clipAction(clip('Idle')),
      Walking: this.mixer.clipAction(clip('Walk')),
      Running: this.mixer.clipAction(clip('Run')),
      Punch: this.mixer.clipAction(clip('Punch_Right')),
      // El modelo no trae salto: se usa una zancada de carrera congelada como pose en el aire.
      Jump: this.mixer.clipAction(clip('Run').clone()),
    };
    this.actions.Jump.timeScale = 0;
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
    const pocketMat = new THREE.MeshStandardMaterial({ color: POCKET_COLOR, roughness: 0.9 });
    const flapMat = new THREE.MeshStandardMaterial({ color: PALETTE.LightBlue, roughness: 0.9 });
    const hip = new THREE.Vector3(), knee = new THREE.Vector3();
    for (const side of ['L', 'R']) {
      const upper = bone('UpperLeg' + side), lower = bone('LowerLeg' + side);
      if (!upper || !lower) continue;
      upper.scale.set(LEG_WIDTH, 1, LEG_WIDTH); // el eje Y del hueso es su longitud
      this.model.updateMatrixWorld(true);
      upper.getWorldPosition(hip);
      lower.getWorldPosition(knee);
      const out = Math.sign(hip.x - this.model.position.x) || (side === 'L' ? 1 : -1);

      const pocket = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.15, 0.13), pocketMat);
      const flap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.045, 0.14), flapMat);
      flap.position.y = 0.06;
      body.castShadow = flap.castShadow = true;
      pocket.add(body, flap);
      pocket.position.lerpVectors(hip, knee, 0.62);
      pocket.position.x += out * POCKET_OFFSET;
      this.model.add(pocket);
      upper.attach(pocket); // conserva la posición y sigue al muslo al animarse
    }
  }

  respawn() {
    this.body.setTranslation({ x: 0, y: FOOT + 0.05, z: 0 }, true);
    this.body.setNextKinematicTranslation({ x: 0, y: FOOT + 0.05, z: 0 });
    this.velocity.set(0, 0, 0);
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

    const punching = this.punchT >= 0;
    let speed = moving ? (running ? RUN_SPEED : WALK_SPEED) : 0;
    if (punching) speed *= 0.25;

    // Aceleración suave en el plano horizontal (menos control en el aire).
    const k = 1 - Math.exp(-(this.grounded ? 14 : 4) * dt);
    this.velocity.x += (_v.x * speed - this.velocity.x) * k;
    this.velocity.z += (_v.z * speed - this.velocity.z) * k;

    // --- Salto y gravedad ---
    // En el suelo no se acumula gravedad: un empuje mínimo hacia abajo mantiene el contacto
    // (uno mayor frenaría la subida por rampas) y el "snap" se encarga de las bajadas.
    if (this.grounded && this.velocity.y <= 0) {
      this.velocity.y = 0;
      if (input.justPressed('Space') && !punching) {
        this.velocity.y = JUMP_SPEED;
        this.grounded = false;
        this.airTime = 1; // fuerza la animación de salto
      }
    }
    if (!this.grounded) this.velocity.y -= GRAVITY * dt;

    // --- Golpe ---
    if (!punching && this.grounded && (input.justPressed('KeyF') || input.justPressed('Mouse2'))) {
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
    this.wantsFire = input.mouseDown(0) && this.punchT < 0;
    if (this.wantsFire) this.aimT = AIM_HOLD;
    this.aimT -= dt;
    const aiming = this.aimT > 0;
    this.aimWeight = THREE.MathUtils.damp(this.aimWeight, aiming ? 1 : 0, aiming ? 25 : 10, dt);

    // --- Orientación: hacia la mira al apuntar/golpear, si no hacia el movimiento ---
    if (aiming) {
      this.facing = dampAngle(this.facing, Math.atan2(cam.forward.x, cam.forward.z), 22, dt);
    } else if (moving && !punching) {
      this.facing = dampAngle(this.facing, Math.atan2(_v.x, _v.z), 12, dt);
    }

    // --- Mover la cápsula con colisiones ---
    const delta = {
      x: this.velocity.x * dt,
      y: this.grounded ? -0.002 : this.velocity.y * dt,
      z: this.velocity.z * dt,
    };
    this.controller.computeColliderMovement(this.collider, delta, undefined, GROUPS.player);
    const m = this.controller.computedMovement();
    const t = this.body.translation();
    this.body.setNextKinematicTranslation({ x: t.x + m.x, y: t.y + m.y, z: t.z + m.z });

    const wasGrounded = this.grounded;
    this.grounded = this.controller.computedGrounded() && this.velocity.y <= 0;
    if (this.velocity.y > 0 && m.y < delta.y * 0.5) this.velocity.y = 0; // golpe contra el techo
    this.airTime = this.grounded ? 0 : this.airTime + dt;
    if (this.grounded && !wasGrounded) this.velocity.y = 0;

    this.updateAnimation(dt, punching);
  }

  updateAnimation(dt, punching) {
    const s = this.speed;
    let next;
    if (punching) next = 'Punch';
    else if (this.airTime > 0.18) next = 'Jump';
    else if (s > (WALK_SPEED + RUN_SPEED) / 2) next = 'Running';
    else if (s > 0.35) next = 'Walking';
    else next = 'Idle';

    if (next !== this.state) {
      const action = this.actions[next];
      action.reset();
      if (next === 'Jump') action.time = JUMP_POSE_TIME;
      action.crossFadeFrom(this.current, next === 'Punch' ? 0.08 : 0.18, false).play();
      this.current = action;
      this.state = next;
    }
    // Sincroniza el ritmo de los pasos con la velocidad real.
    if (this.state === 'Walking') this.current.timeScale = THREE.MathUtils.clamp(s / 1.6, 0.6, 2);
    if (this.state === 'Running') this.current.timeScale = THREE.MathUtils.clamp(s / 5.2, 0.7, 1.4);
    this.mixer.update(dt);
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
      if (!body || !body.isDynamic() || seen.has(body.handle)) continue;
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
    this.model.rotation.y = this.facing;

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
    _q.setFromUnitVectors(cur, want);
    this.upperArm.getWorldQuaternion(_q2);
    _q.multiply(_q2); // orientación mundial deseada
    this.upperArm.parent.getWorldQuaternion(_pq);
    _q.premultiply(_pq.invert());
    this.upperArm.quaternion.slerp(_q, this.aimWeight);
    this.upperArm.updateMatrixWorld(true);

    this.hand.getWorldPosition(this.gun.position);
    this.gun.lookAt(this.aimPoint);
    this.gun.updateMatrixWorld(true);
    this.muzzle.set(0, 0, 0.4).applyMatrix4(this.gun.matrixWorld);

    if (this.wantsFire && this.fireCooldown <= 0 && this.aimWeight > 0.6) {
      this.fireCooldown = FIRE_INTERVAL;
      this.shots++;
      this.flash.intensity = 30;
      combat.fire(this.muzzle, this.aimPoint);
    }
  }
}

