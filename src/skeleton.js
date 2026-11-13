import * as THREE from 'three';

// Vista de esqueleto al estilo de Blender: cada hueso es un octaedro alargado, ancho junto a su
// origen y afilado hacia la punta, con una esfera en cada articulación. La usan el jugador y los
// zombis; mientras está activa, la malla del modelo se oculta (sigue animándose igual).

// Por ahora el juego se ve solo con esqueletos (menú → Ajustes para ver los modelos).
export const SKELETON_DEFAULT = true;

const SKIP = /Index|Middle|Ring|Pinky|Thumb|^PT|^Root$/; // dedos y huesos auxiliares
const W = 0.1;
const boneGeo = new THREE.BufferGeometry();
// Octaedro de longitud 1 sobre +Y: origen, anillo cuadrado al 10 % y punta.
boneGeo.setAttribute('position', new THREE.Float32BufferAttribute([
  0, 0, 0, W, W, W, W, W, -W, -W, W, -W, -W, W, W, 0, 1, 0,
], 3));
boneGeo.setIndex([0, 2, 1, 0, 3, 2, 0, 4, 3, 0, 1, 4, 5, 1, 2, 5, 2, 3, 5, 3, 4, 5, 4, 1]);
boneGeo.computeVertexNormals();
const edgeGeo = new THREE.EdgesGeometry(boneGeo);
const jointGeo = new THREE.SphereGeometry(0.03, 14, 10);
const edgeMat = new THREE.LineBasicMaterial({ color: 0x111111 });

// Colores por tipo de personaje (los materiales se comparten entre todos los del mismo tipo).
const PALETTES = {
  player: { bone: 0x9a9a9a, joint: 0xc4c4c4 },
  zombie: { bone: 0x6e8a4e, joint: 0xa3c27a },
};
const materials = {};
function paletteMaterials(kind) {
  if (!materials[kind]) {
    const p = PALETTES[kind];
    materials[kind] = {
      bone: new THREE.MeshStandardMaterial({ color: p.bone, roughness: 0.7, flatShading: true }),
      joint: new THREE.MeshStandardMaterial({ color: p.joint, roughness: 0.5 }),
    };
  }
  return materials[kind];
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export class SkeletonView {
  /** model: el modelo animado; kind: 'player' o 'zombie'. */
  constructor(model, scene, kind = 'player') {
    this.model = model;
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.links = [];
    this.joints = [];
    this.only = false;
    const mat = paletteMaterials(kind);
    const bones = {};
    model.traverse((o) => { if (o.isBone) bones[o.name] = o; });

    const addLink = (from, to) => {
      const mesh = new THREE.Mesh(boneGeo, mat.bone);
      mesh.castShadow = true;
      mesh.add(new THREE.LineSegments(edgeGeo, edgeMat));
      this.group.add(mesh);
      this.links.push({ from, to, mesh });
    };
    for (const o of Object.values(bones)) {
      if (SKIP.test(o.name)) continue;
      const joint = new THREE.Mesh(jointGeo, mat.joint);
      joint.castShadow = true;
      if (o.name === 'Head') joint.scale.setScalar(3.5); // la cabeza, más grande
      this.group.add(joint);
      this.joints.push({ bone: o, mesh: joint });
      if (o.parent?.isBone && !SKIP.test(o.parent.name)) addLink(o.parent, o);
    }
    // Los pies no cuelgan de la pierna en este modelo: se unen a mano.
    for (const side of ['L', 'R']) {
      const shin = bones['LowerLeg' + side], foot = bones['Foot' + side];
      if (shin && foot) addLink(shin, foot);
    }
  }

  /** Muestra solo el esqueleto (true) o el modelo normal (false). */
  set(only) {
    this.only = only;
    this.group.visible = only;
    this.model.traverse((o) => { if (o.isMesh) o.visible = !only; });
  }

  /** Coloca huesos y articulaciones sobre la pose final de este fotograma. */
  update() {
    if (!this.only || !this.group.visible) return;
    this.model.updateMatrixWorld(true);
    for (const j of this.joints) j.bone.getWorldPosition(j.mesh.position);
    for (const l of this.links) {
      l.from.getWorldPosition(_a);
      l.to.getWorldPosition(_b);
      const len = _a.distanceTo(_b);
      l.mesh.visible = len > 1e-4;
      if (!l.mesh.visible) continue;
      l.mesh.position.copy(_a);
      l.mesh.quaternion.setFromUnitVectors(_up, _b.sub(_a).divideScalar(len));
      l.mesh.scale.setScalar(len); // el grosor es proporcional a la longitud, como en Blender
    }
  }

  dispose() {
    this.scene.remove(this.group);
  }
}
