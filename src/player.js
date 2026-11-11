import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RAPIER, GROUPS } from './physics.js';
// Importado como recurso: el nombre publicado lleva un hash, así un modelo nuevo nunca
// se confunde con uno antiguo guardado en la caché del navegador.
import modelUrl from './assets/Character.glb?url';

const WALK_SPEED = 2.2;
const RUN_SPEED = 6.0;
// Salto con medidas humanas: gravedad real y un despegue de ~3,3 m/s, que eleva el cuerpo
// ~0,55 m parado y ~0,65 m en carrera (unos 4 m de longitud corriendo a 6 m/s).
const GRAVITY = 9.81;
const JUMP_SPEED = 3.3; // velocidad vertical de despegue parado (m/s)
const RUN_JUMP_BONUS = 0.04; // la carrera añade algo de altura (m/s por cada m/s)
const LEAP_SPEED = 2.8; // empuje horizontal mínimo al saltar con dirección (salto de longitud parado ≈ 1,8 m)
const CROUCH_TIME = 0.24; // impulso: tiempo flexionando las piernas antes de despegar (s)
const RUN_CROUCH_TIME = 0.11; // en carrera la batida es mucho más corta
const JUMP_BUFFER = 0.12; // margen para pulsar salto justo antes de aterrizar (s)
const AIR_CONTROL = 1.2; // en el aire apenas se puede corregir la trayectoria
const LAND_TIME = 0.32; // duración de la flexión que amortigua la caída (s)
const LAND_SLOWDOWN = 0.8; // fracción de velocidad horizontal que se conserva al caer
const CROUCH_DEPTH = 0.3; // cuánto baja la cadera en la flexión completa (m)
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
const _hip = new THREE.Vector3();
const _knee = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _right = new THREE.Vector3();

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
    this.jumpT = -1; // >= 0 mientras toma impulso
    this.jumpTime = CROUCH_TIME;
    this.jumpBuffer = 0;
    this.crouch = 0; // 0 = erguido, 1 = flexión completa
    this.landT = 0;
    this.landAmount = 0;
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

    // Aceleración suave en el plano horizontal. En el aire se conserva la inercia:
    // sin entrada no se frena y con ella solo se corrige un poco la trayectoria.
    const k = this.grounded ? 1 - Math.exp(-14 * dt) : moving ? 1 - Math.exp(-AIR_CONTROL * dt) : 0;
    this.velocity.x += (_v.x * speed - this.velocity.x) * k;
    this.velocity.z += (_v.z * speed - this.velocity.z) * k;

    // --- Salto y gravedad ---
    // En el suelo no se acumula gravedad: un empuje mínimo hacia abajo mantiene el contacto
    // (uno mayor frenaría la subida por rampas) y el "snap" se encarga de las bajadas.
    // El salto no es instantáneo: primero se flexionan las piernas (impulso) y al
    // extenderlas se despega. En carrera la batida es más corta y se salta más lejos.
    this.jumpBuffer = input.justPressed('Space') ? JUMP_BUFFER : this.jumpBuffer - dt;
    if (this.grounded && this.velocity.y <= 0) {
      this.velocity.y = 0;
      if (this.jumpT < 0 && this.jumpBuffer > 0 && !punching) {
        this.jumpBuffer = 0;
        this.jumpT = 0;
        this.jumpTime = THREE.MathUtils.lerp(
          CROUCH_TIME, RUN_CROUCH_TIME, THREE.MathUtils.clamp(this.speed / RUN_SPEED, 0, 1),
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
    this.crouch = THREE.MathUtils.damp(this.crouch, crouchTarget, charging ? 3.5 / this.jumpTime : 22, dt);

    // --- Golpe ---
    if (!punching && !charging && this.grounded && (input.justPressed('KeyF') || input.justPressed('Mouse2'))) {
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
    if (this.grounded && !wasGrounded) {
      // Aterrizaje: cuanto más fuerte la caída, más se flexiona y más velocidad se pierde.
      const impact = -this.velocity.y;
      if (impact > 1.5) {
        this.landAmount = THREE.MathUtils.clamp(impact / 5.5, 0.3, 1);
        this.landT = LAND_TIME;
        this.crouch = Math.max(this.crouch, this.landAmount * 0.5);
        this.velocity.x *= LAND_SLOWDOWN;
        this.velocity.z *= LAND_SLOWDOWN;
      }
      this.velocity.y = 0;
    }

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
    // El mezclador no reescribe los valores que no cambian entre fotogramas, así que la
    // flexión del fotograma anterior se deshace a mano antes de animar.
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
  applyCrouch(amount) {
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
    _v.y -= CROUCH_DEPTH * amount;
    this.bodyBone.position.copy(parent.worldToLocal(_v));
    this.bodyBone.updateMatrixWorld(true);

    const fx = Math.sin(this.facing), fz = Math.cos(this.facing);
    for (const leg of this.legs) {
      const target = leg.foot.getWorldPosition(_a);
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
    }

    // Tronco hacia delante y brazos atrás.
    _right.set(fz, 0, -fx);
    if (this.abdomen) this.turnBone(this.abdomen, _right, 0.45 * amount);
    for (const arm of [this.upperArmL, this.upperArm]) {
      if (arm) this.turnBone(arm, _right, 0.7 * amount);
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
    if (this.crouch > 0.01) this.applyCrouch(this.crouch);

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

