import * as THREE from 'three';

// Proporciones del cuerpo. El modelo trae las piernas y el tronco bien medidos, pero los brazos
// muy cortos (17,5 cm de hombro a codo y 22,7 cm de codo a muñeca para 1,75 m de estatura) y
// las manos grandes. Aquí se llevan a medidas humanas, como fracción de la estatura
// (tablas antropométricas de Drillis y Contini).
export const BODY = {
  upperArm: 0.172, // hombro → codo
  forearm: 0.146, // codo → muñeca
  hand: 0.108, // muñeca → punta del dedo medio
  foot: 0.152, // largo del pie
  head: 0.13, // barbilla → coronilla
};

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/**
 * Corrige el largo de brazos y manos del modelo `root` y de sus animaciones `clips`. Las
 * animaciones fijan la posición de cada hueso en cada fotograma, así que también se escalan sus
 * pistas. Hay que llamarlo una vez, antes de clonar el modelo.
 */
export function fixProportions(root, clips) {
  root.updateMatrixWorld(true);
  const height = new THREE.Box3().setFromObject(root).getSize(_a).y;
  const bones = {};
  root.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  const factors = {}; // hueso → factor aplicado a su posición respecto al padre
  const stretch = (name, fraction) => {
    const bone = bones[name];
    if (!bone) return;
    const k = (fraction * height) / bone.position.length();
    bone.position.multiplyScalar(k);
    factors[name] = k;
  };
  for (const side of ['L', 'R']) {
    stretch('LowerArm' + side, BODY.upperArm); // el codo se aleja del hombro
    stretch('Wrist' + side, BODY.forearm); // la muñeca, del codo
    // La mano se encoge entera (dedos incluidos) hasta su largo real.
    const wrist = bones['Wrist' + side], tip = bones['Middle4' + side];
    if (wrist && tip) {
      const length = wrist.getWorldPosition(_a).distanceTo(tip.getWorldPosition(_b));
      wrist.scale.multiplyScalar((BODY.hand * height) / length);
    }
  }
  for (const clip of clips) {
    for (const track of clip.tracks) {
      const [name, property] = track.name.split('.');
      const k = property === 'position' && factors[name];
      if (k) for (let i = 0; i < track.values.length; i++) track.values[i] *= k;
    }
  }
  root.updateMatrixWorld(true);
}
