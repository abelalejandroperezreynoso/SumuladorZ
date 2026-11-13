import * as THREE from 'three';

// Pies que no resbalan al caminar y correr. Dos capas sobre la animación del modelo:
//  1. Zancada a medida: la distancia de cada pie a su cadera, a lo largo del avance, se
//     escala para que el paso cubra lo que de verdad avanza el personaje.
//  2. Pie clavado: mientras un pie apoya, su posición en el mundo queda fija y la pierna se
//     recalcula (IK de dos huesos) para llegar hasta él; al levantarse se suelta poco a poco.
//  3. De pie: los pies se quedan donde pisaron. Si uno queda lejos de donde lo pide la postura
//     (al detenerse a media zancada, al girar sobre el sitio, al recolocarse), da un paso
//     corto hasta su sitio, de uno en uno, en vez de deslizarse.
// Lo usan el jugador y los zombis.

// Velocidad (m/s) a la que avanza cada clip a ritmo 1 sin resbalar; medida con el pie de
// apoyo (tools/watch.cjs y pruebas a medida).
export const CLIP_SPEED = { Walk: 1.28, Run: 2.9 };
const STRIDE_MIN = 0.5; // la zancada se acorta o alarga como mucho hasta estos factores
const STRIDE_MAX = 1.22;
const REACH_MAX = 0.965; // la pierna no se estira más que esta fracción de su longitud
const CONTACT_Y = 0.05; // por debajo de esta altura sobre el suelo, el pie apoya (m)
const LOCK_MAX = 0.2; // lo más que un pie clavado se aparta de donde lo pone la animación (m)
const RELEASE = 12; // rapidez con que un pie soltado vuelve a la animación (1/s)
const STEP_TRIGGER = 0.09; // de pie, un pie más lejos que esto de su sitio da un paso (m)
const STEP_FORCE = 0.4; // ...y a esta distancia lo da aunque el otro pie esté en el aire
const STEP_TIME = 0.2; // duración de ese paso (s)
const CATCH_TIME = 0.13; // ...y la del paso de ajuste al caminar
const TELEPORT = 0.7; // un pie a más de esto de su sitio: el personaje fue recolocado (m)
const STEP_LIFT = 0.05; // altura a la que levanta el pie al darlo (m)
export const GAIT_TUNING = { STRIDE_MIN, STRIDE_MAX, CONTACT_Y, LOCK_MAX };

const _hip = new THREE.Vector3();
const _knee = new THREE.Vector3();
const _foot = new THREE.Vector3();
const _end = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _v = new THREE.Vector3();
const _h = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _target = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _pq = new THREE.Quaternion();
const _fq = new THREE.Quaternion();

// Gira un hueso en espacio mundial para llevar la dirección `from` hasta `to`.
function aim(bone, from, to) {
  _q.setFromUnitVectors(from, to);
  bone.getWorldQuaternion(_q2);
  _q.multiply(_q2);
  bone.parent.getWorldQuaternion(_pq);
  bone.quaternion.copy(_q.premultiply(_pq.invert()));
  bone.updateMatrixWorld(true);
}

export class Gait {
  /** legs: [{ upper, lower, foot, side }] (el pie no cuelga de la pierna en este modelo). */
  constructor(legs) {
    this.legs = legs.map((l) => ({
      ...l, off: new THREE.Vector3(), lock: new THREE.Vector3(), locked: false,
      last: new THREE.Vector3(), from: new THREE.Vector3(), stepT: -1,
      rest: [l.upper, l.lower, l.foot].map((b) => ({ bone: b, pos: new THREE.Vector3(), quat: new THREE.Quaternion() })),
    }));
    this.stride = 1; // factor de zancada en uso (suavizado)
    this.weight = 0;
    this.posed = false;
    this.standing = false; // el fotograma anterior fue de pie (stand)
    this.hasLast = false; // `last` de cada pierna es de un fotograma reciente
  }

  /**
   * De pie: los pies se quedan en el mundo donde están y dan pasos cortos hacia donde los
   * pone la postura ya animada. Llamar después de armar la postura, en lugar de update().
   */
  stand(dt, model, ground, facing) {
    model.updateMatrixWorld(true);
    _fwd.set(Math.sin(facing), 0, Math.cos(facing));
    const enter = !this.standing;
    this.standing = true;
    this.weight = 1;
    this.stride = 1;
    // Posición animada (deseada) de cada pie y distancia a la que está de ella.
    for (const leg of this.legs) {
      if (!this.posed) for (const r of leg.rest) { r.pos.copy(r.bone.position); r.quat.copy(r.bone.quaternion); }
      leg.want = (leg.want ?? new THREE.Vector3());
      leg.foot.getWorldPosition(leg.want);
      if (enter) {
        // Sigue desde donde estaba el pie; si venía por el aire, termina el paso.
        if (this.hasLast) leg.lock.copy(leg.last); else leg.lock.copy(leg.want);
        leg.stepT = -1;
        if (leg.lock.y - ground > CONTACT_Y) { leg.from.copy(leg.lock); leg.stepT = 0.35; }
      }
      leg.err = Math.hypot(leg.lock.x - leg.want.x, leg.lock.z - leg.want.z);
      // Demasiado lejos para ser un paso: el personaje fue recolocado (reaparición, escena).
      if (leg.err > TELEPORT) { leg.lock.copy(leg.want); leg.stepT = -1; leg.err = 0; }
    }
    this.posed = true;
    // Empieza un paso el pie más descolocado, si el otro está apoyado.
    const stepping = this.legs.some((l) => l.stepT >= 0);
    let far = null;
    for (const leg of this.legs) if (leg.stepT < 0 && leg.err > STEP_TRIGGER && (!far || leg.err > far.err)) far = leg;
    if (far && (!stepping || far.err > STEP_FORCE)) { far.from.copy(far.lock); far.stepT = 0; }
    for (const leg of this.legs) {
      leg.foot.getWorldQuaternion(_fq);
      if (leg.stepT >= 0) {
        leg.stepT += dt / STEP_TIME;
        const t = Math.min(leg.stepT, 1), e = t * t * (3 - 2 * t);
        _target.lerpVectors(leg.from, leg.want, e);
        _target.y += STEP_LIFT * Math.sin(Math.PI * t);
        if (t >= 1) leg.stepT = -1;
        leg.lock.copy(_target);
      } else {
        leg.lock.y = leg.want.y;
        _target.copy(leg.lock);
      }
      leg.last.copy(_target);
      leg.off.subVectors(_target, leg.want).setY(0); // por si pasa a caminar: sigue desde aquí
      leg.locked = false;
      this.solve(leg, leg.want, _target, leg.side);
      leg.foot.parent.getWorldQuaternion(_pq);
      leg.foot.quaternion.copy(_pq.invert().multiply(_fq));
      leg.foot.updateMatrixWorld(true);
    }
    this.hasLast = true;
  }

  /**
   * Lleva un pie (side: 1 izquierdo, -1 derecho) a `target` (mundo) recalculando su pierna,
   * sobre la pose ya armada: pisotones y otros gestos por código. Llamar después de stand() o
   * update(); restore() lo deshace igual que a ellos.
   */
  place(side, target, facing) {
    const leg = this.legs.find((l) => l.side === side);
    if (!leg) return;
    _fwd.set(Math.sin(facing), 0, Math.cos(facing));
    if (!this.posed) {
      for (const l of this.legs) for (const r of l.rest) { r.pos.copy(r.bone.position); r.quat.copy(r.bone.quaternion); }
      this.posed = true;
    }
    leg.foot.getWorldPosition(_foot);
    leg.foot.getWorldQuaternion(_fq);
    this.solve(leg, _foot, target, side);
    leg.foot.parent.getWorldQuaternion(_pq);
    leg.foot.quaternion.copy(_pq.invert().multiply(_fq));
    leg.foot.updateMatrixWorld(true);
  }

  /** Deshace la pose del fotograma anterior. Llamar antes de actualizar el mezclador. */
  restore() {
    if (!this.posed) return;
    for (const leg of this.legs) for (const r of leg.rest) { r.bone.position.copy(r.pos); r.bone.quaternion.copy(r.quat); }
    this.posed = false;
  }

  /**
   * Aplica zancada y pies clavados sobre la pose ya animada.
   * model: el modelo colocado en el mundo; ground: altura del suelo; facing: rumbo (rad);
   * speed: avance real (m/s); natural: avance del clip a su ritmo actual (m/s);
   * active: si camina o corre de frente (si no, la corrección se retira).
   */
  update(dt, model, ground, facing, speed, natural, active) {
    this.weight = THREE.MathUtils.damp(this.weight, active ? 1 : 0, 10, dt);
    const fromStand = this.standing; // venía de pie: los pies siguen donde estaban
    this.standing = false;
    const w = this.weight;
    if (w < 0.01) {
      for (const leg of this.legs) { leg.off.set(0, 0, 0); leg.locked = false; }
      this.hasLast = false;
      return;
    }
    this.hasLast = true;
    const want = active && natural > 0.05 ? THREE.MathUtils.clamp(speed / natural, STRIDE_MIN, STRIDE_MAX) : this.stride;
    this.stride = THREE.MathUtils.damp(this.stride, want, 8, dt);
    const k = 1 + (this.stride - 1) * w;
    _fwd.set(Math.sin(facing), 0, Math.cos(facing));
    model.updateMatrixWorld(true);
    for (const leg of this.legs) {
      if (!this.posed) for (const r of leg.rest) { r.pos.copy(r.bone.position); r.quat.copy(r.bone.quaternion); }
      leg.upper.getWorldPosition(_hip);
      leg.foot.getWorldPosition(_foot);
      leg.foot.getWorldQuaternion(_fq);
      leg.length = _hip.distanceTo(leg.lower.getWorldPosition(_knee)) + _knee.distanceTo(_foot);
      // 1. Zancada: el pie se aleja de la cadera (o se acerca) a lo largo del avance.
      _target.copy(_foot).addScaledVector(_fwd, (_foot.dot(_fwd) - _hip.dot(_fwd)) * (k - 1));
      // 2. Pie clavado mientras apoya.
      if (fromStand) leg.off.set(leg.last.x - _target.x, 0, leg.last.z - _target.z);
      if (leg.off.length() > TELEPORT) { leg.off.set(0, 0, 0); leg.locked = false; leg.stepT = -1; } // recolocado
      const down = active && w > 0.5 && _foot.y - ground < CONTACT_Y;
      if (leg.stepT >= 0) {
        // Paso corto de ajuste: el pie se levanta y va a donde lo pone la animación.
        leg.stepT += dt / CATCH_TIME;
        const t = Math.min(leg.stepT, 1), e = t * t * (3 - 2 * t);
        leg.off.set(leg.from.x - _target.x, 0, leg.from.z - _target.z).multiplyScalar(1 - e);
        _target.y += STEP_LIFT * Math.sin(Math.PI * t);
        leg.locked = false;
        if (t >= 1) { leg.stepT = -1; leg.off.set(0, 0, 0); }
      } else if (down) {
        if (!leg.locked) { leg.locked = true; leg.lock.copy(_target).add(leg.off); }
        leg.off.subVectors(leg.lock, _target).setY(0);
        if (leg.off.length() > LOCK_MAX) {
          // No da más de sí (arranque, frenazo, giro): da un paso corto de ajuste si el otro
          // pie está apoyado; si no, cede lo que sobra.
          if (!this.legs.some((l) => l.stepT >= 0)) {
            leg.from.copy(leg.lock);
            leg.stepT = 0;
            leg.locked = false;
          } else {
            leg.off.setLength(LOCK_MAX);
            leg.lock.copy(_target).add(leg.off);
          }
        }
      } else {
        leg.locked = false;
        leg.off.multiplyScalar(Math.exp(-RELEASE * dt));
      }
      _target.add(leg.off);
      // La pierna no se estira del todo: si el pie queda demasiado lejos, se acerca a la
      // cadera en horizontal (zancadas imposibles daban piernas rectas, abiertas en tijera).
      // Se admite, eso sí, lo que ya la estire la propia animación.
      // y, clavado, casi toda su longitud (al final del apoyo la pierna va estirada).
      const max = leg.locked ? leg.length * 0.999
        : Math.min(Math.max(leg.length * REACH_MAX, _hip.distanceTo(_foot)), leg.length * 0.995);
      const dy = _target.y - _hip.y;
      const flat = Math.sqrt(Math.max(max * max - dy * dy, 0.01));
      _v.subVectors(_target, _hip).setY(0);
      if (_v.length() > flat) {
        _target.addScaledVector(_v, flat / _v.length() - 1);
        if (leg.locked) leg.lock.copy(_target); // el pie clavado cede hasta donde llega la pierna
      }
      leg.last.copy(_target);
      this.solve(leg, _foot, _target, leg.side);
      // El pie conserva la orientación de la animación.
      leg.foot.parent.getWorldQuaternion(_pq);
      leg.foot.quaternion.copy(_pq.invert().multiply(_fq));
      leg.foot.updateMatrixWorld(true);
    }
    this.posed = true;
  }

  /** IK de dos huesos: lleva el tobillo (en `from`) hasta `target`, con la rodilla al frente. */
  solve(leg, from, target, side) {
    const { upper, lower, foot } = leg;
    _end.copy(lower.worldToLocal(_v.copy(from)));
    for (let i = 0; i < 2; i++) {
      upper.getWorldPosition(_hip);
      lower.getWorldPosition(_knee);
      const l1 = _hip.distanceTo(_knee);
      const l2 = _knee.distanceTo(_h.copy(_end).applyMatrix4(lower.matrixWorld));
      _dir.subVectors(target, _hip);
      const d = THREE.MathUtils.clamp(_dir.length(), Math.abs(l1 - l2) + 1e-3, (l1 + l2) * 0.999);
      _dir.normalize();
      _pole.copy(_fwd).addScaledVector(_v.set(_fwd.z, 0, -_fwd.x), side * 0.12);
      _pole.addScaledVector(_dir, -_pole.dot(_dir)).normalize();
      const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
      const out = Math.sqrt(Math.max(l1 * l1 - along * along, 0));
      _v.copy(_hip).addScaledVector(_dir, along).addScaledVector(_pole, out); // rodilla
      aim(upper, _knee.sub(_hip).normalize(), _h.copy(_v).sub(_hip).normalize());
      lower.getWorldPosition(_knee);
      _h.copy(_end).applyMatrix4(lower.matrixWorld).sub(_knee).normalize();
      aim(lower, _h, _v.copy(target).sub(_knee).normalize());
    }
    foot.position.copy(foot.parent.worldToLocal(_h.copy(_end).applyMatrix4(lower.matrixWorld)));
    foot.updateMatrixWorld(true);
  }
}
