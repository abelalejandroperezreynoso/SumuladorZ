import * as THREE from 'three';
import { RAPIER } from './physics.js';

const SENS = 0.0023;
const SHOULDER = 0.5; // desplazamiento lateral del pivote hacia el hombro derecho (m)
const STAND_HEIGHT = 1.55; // altura del pivote con el personaje de pie (m)
// Al apuntar la cámara se cierra sobre el hombro: más cerca, más ladeada y con menos campo.
const AIM_DISTANCE = 1.45;
const AIM_SHOULDER = 0.62;
const AIM_FOV = 46;
const AIM_SENS = 0.7; // la mira se mueve más despacio para afinar
const LOW_DISTANCE = 0.55; // tumbado a cubierto la cámara baja y se acerca (fracción de la distancia)
export const CAMERA_TUNING = { AIM_DISTANCE, AIM_SHOULDER, AIM_FOV, AIM_SENS, LOW_DISTANCE };
const _pivot = new THREE.Vector3();
const _back = new THREE.Vector3();

// Cámara en tercera persona sobre el hombro, con colisión contra el escenario.
export class ThirdPersonCamera {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;
    this.pitch = 0.22;
    this.distance = 4.2;
    this.current = this.distance;
    this.aim = 0; // 0-1: cuánto se ha cerrado sobre el hombro
    this.height = STAND_HEIGHT; // altura actual del pivote sobre los pies
    this.low = 0;
    this.forward = new THREE.Vector3(0, 0, -1); // dirección de la mirada
  }

  /**
   * `view` describe la postura del personaje: `aim` (apunta), `height` (altura del pivote
   * sobre los pies) y `low` (0-1, tumbado a cubierto).
   */
  update(dt, input, playerPos, physics, view = {}) {
    // Dos suavizados encadenados: el movimiento arranca y termina sin tirón.
    const ease = (key, target, lambda) => {
      const raw = key + 'Raw';
      this[raw] = THREE.MathUtils.damp(this[raw] ?? this[key], target, lambda, dt);
      this[key] = THREE.MathUtils.damp(this[key], this[raw], lambda, dt);
    };
    ease('aim', view.aim ? 1 : 0, 17);
    ease('height', view.height ?? STAND_HEIGHT, 16);
    ease('low', view.low ?? 0, 12);
    const sens = SENS * THREE.MathUtils.lerp(1, AIM_SENS, this.aim);
    this.yaw -= input.mouseDX * sens;
    this.pitch = THREE.MathUtils.clamp(this.pitch + input.mouseDY * sens, -0.9, 1.35);
    this.distance = THREE.MathUtils.clamp(this.distance + input.wheel * 0.5, 2, 9);

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    _back.set(Math.sin(this.yaw) * cp, sp, Math.cos(this.yaw) * cp);
    this.forward.copy(_back).negate();

    // Pivote: a la altura de la cabeza, desplazado hacia el hombro derecho.
    const shoulder = THREE.MathUtils.lerp(SHOULDER, AIM_SHOULDER, this.aim);
    _pivot.set(
      playerPos.x + Math.cos(this.yaw) * shoulder,
      playerPos.y + this.height,
      playerPos.z - Math.sin(this.yaw) * shoulder,
    );

    // Evita atravesar la geometría fija acercando la cámara.
    const wanted = THREE.MathUtils.lerp(
      this.distance * THREE.MathUtils.lerp(1, LOW_DISTANCE, this.low), AIM_DISTANCE, this.aim,
    );
    let target = wanted;
    const hit = physics.world.castRay(
      new RAPIER.Ray(_pivot, _back), wanted + 0.3, true, RAPIER.QueryFilterFlags.ONLY_FIXED,
    );
    if (hit) target = Math.min(wanted, Math.max(0.4, hit.timeOfImpact - 0.3));
    // Acercarse es inmediato; alejarse es suave.
    this.current = target < this.current
      ? target
      : THREE.MathUtils.damp(this.current, target, 8, dt);

    this.camera.position.copy(_pivot).addScaledVector(_back, this.current);
    this.camera.lookAt(_pivot);
  }

  /** Campo de visión que corresponde al apuntado actual, partiendo de `base`. */
  fov(base) {
    return THREE.MathUtils.lerp(base, AIM_FOV, this.aim);
  }
}
