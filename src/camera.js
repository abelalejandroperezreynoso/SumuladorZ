import * as THREE from 'three';
import { RAPIER } from './physics.js';

const SENS = 0.0023;
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
    this.forward = new THREE.Vector3(0, 0, -1); // dirección de la mirada
  }

  update(dt, input, playerPos, physics) {
    this.yaw -= input.mouseDX * SENS;
    this.pitch = THREE.MathUtils.clamp(this.pitch + input.mouseDY * SENS, -0.9, 1.35);
    this.distance = THREE.MathUtils.clamp(this.distance + input.wheel * 0.5, 2, 9);

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    _back.set(Math.sin(this.yaw) * cp, sp, Math.cos(this.yaw) * cp);
    this.forward.copy(_back).negate();

    // Pivote: a la altura de la cabeza, desplazado hacia el hombro derecho.
    const shoulder = 0.5;
    _pivot.set(
      playerPos.x + Math.cos(this.yaw) * shoulder,
      playerPos.y + 1.55,
      playerPos.z - Math.sin(this.yaw) * shoulder,
    );

    // Evita atravesar la geometría fija acercando la cámara.
    let target = this.distance;
    const hit = physics.world.castRay(
      new RAPIER.Ray(_pivot, _back), this.distance + 0.3, true, RAPIER.QueryFilterFlags.ONLY_FIXED,
    );
    if (hit) target = Math.max(0.4, hit.timeOfImpact - 0.3);
    // Acercarse es inmediato; alejarse es suave.
    this.current = target < this.current
      ? target
      : THREE.MathUtils.damp(this.current, target, 8, dt);

    this.camera.position.copy(_pivot).addScaledVector(_back, this.current);
    this.camera.lookAt(_pivot);
  }
}
