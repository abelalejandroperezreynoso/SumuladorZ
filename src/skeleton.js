import * as THREE from 'three';
import { BODY } from './proportions.js';

// Vista de esqueleto al estilo de Blender: cada hueso es un octaedro alargado, ancho junto a su
// origen y afilado hacia la punta, con una esfera en cada articulación. Es como se ven el jugador
// y los zombis: del modelo 3D solo se conservan los huesos y las animaciones.

const SKIP = /Index|Middle|Ring|Pinky|Thumb|^PT|^Root$/; // dedos y huesos auxiliares
const STATURE = 1.75; // estatura a la que se escala el modelo (m)
// El hueso del pie está en el talón, a ras de suelo, y el de la cabeza en la base del cráneo:
// el pie se dibuja hacia delante y la cabeza se centra más arriba, con su tamaño real.
const FOOT_LENGTH = BODY.foot * STATURE * 0.82; // del talón del hueso a la punta
const HEAD_RADIUS = (BODY.head * STATURE) / 2;
const HEAD_UP = HEAD_RADIUS + 0.025; // del hueso al centro de la cabeza
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
// Cara: ojos y nariz para ver hacia dónde mira la cabeza.
const eyeGeo = new THREE.SphereGeometry(HEAD_RADIUS * 0.17, 10, 8);
const noseGeo = new THREE.ConeGeometry(HEAD_RADIUS * 0.16, HEAD_RADIUS * 0.45, 10).rotateX(Math.PI / 2); // punta hacia +Z
const eyeMat = new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.4 });

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
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _f = new THREE.Vector3();
// Giro de cada pie sobre la vertical respecto al rumbo del cuerpo (rad, + hacia la izquierda):
// lo que se admite, con una ligera apertura hacia fuera. Las animaciones de caminar y correr
// del modelo llevan el pie izquierdo girado unos 60° hacia dentro.
const FOOT_YAW = { L: [0.08, 0.26], R: [-0.26, -0.08] };

export class SkeletonView {
  /** model: el modelo animado; kind: 'player' o 'zombie'. */
  constructor(model, scene, kind = 'player') {
    this.model = model;
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.links = [];
    this.joints = [];
    const mat = paletteMaterials(kind);
    const bones = {};
    model.traverse((o) => { if (o.isBone) bones[o.name] = o; });

    const addLink = (from, to) => {
      const mesh = new THREE.Mesh(boneGeo, mat.bone);
      mesh.castShadow = true;
      mesh.add(new THREE.LineSegments(edgeGeo, edgeMat));
      this.group.add(mesh);
      const link = { from, to, mesh };
      this.links.push(link);
      return link;
    };
    for (const o of Object.values(bones)) {
      if (SKIP.test(o.name)) continue;
      const joint = new THREE.Mesh(jointGeo, mat.joint);
      joint.castShadow = true;
      const head = o.name === 'Head';
      if (head) joint.scale.setScalar(HEAD_RADIUS / 0.03); // la cabeza, a su tamaño
      this.group.add(joint);
      this.joints.push({ bone: o, mesh: joint, lift: head ? HEAD_UP : 0 });
      if (head) {
        // La cara sigue al hueso de la cabeza; se guarda el giro que la deja mirando al +Z
        // del modelo en la pose de reposo.
        const face = new THREE.Group();
        for (const s of [-1, 1]) {
          const eye = new THREE.Mesh(eyeGeo, eyeMat);
          eye.position.set(s * HEAD_RADIUS * 0.38, HEAD_RADIUS * 0.22, HEAD_RADIUS * 0.86);
          face.add(eye);
        }
        const nose = new THREE.Mesh(noseGeo, mat.joint);
        nose.position.set(0, -HEAD_RADIUS * 0.05, HEAD_RADIUS * 1.05);
        nose.castShadow = true;
        face.add(nose);
        this.group.add(face);
        this.face = { bone: o, mesh: face, rest: null };
      }
      if (o.parent?.isBone && !SKIP.test(o.parent.name)) addLink(o.parent, o);
    }
    model.updateMatrixWorld(true);
    model.getWorldQuaternion(_q);
    if (this.face) this.face.rest = this.face.bone.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(_q);
    for (const side of ['L', 'R']) {
      // Los pies no cuelgan de la pierna en este modelo: se unen a mano.
      const shin = bones['LowerLeg' + side], foot = bones['Foot' + side];
      if (shin && foot) {
        addLink(shin, foot);
        // Pie: del talón hacia delante. La dirección se guarda en el marco del hueso, tomada
        // de la pose de reposo (el modelo mira a su +Z).
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(_q)
          .applyQuaternion(foot.getWorldQuaternion(new THREE.Quaternion()).invert());
        const link = addLink(foot, null);
        link.toe = forward;
        link.side = side;
      }
      // Mano: de la muñeca a la punta del dedo medio.
      const wrist = bones['Wrist' + side], tip = bones['Middle4' + side];
      if (wrist && tip) addLink(wrist, tip);
    }
  }

  /**
   * Endereza los pies con peso `w`: gira cada hueso del pie sobre la vertical para que la
   * punta no se aparte del rumbo del modelo más de lo que admite FOOT_YAW. Los pies son
   * huesos finales, así que no mueve nada más. Con el pie casi vertical (punta hacia abajo o
   * hacia arriba) apenas actúa, porque su giro horizontal no está definido.
   */
  straightenFeet(w = 1) {
    if (w < 0.01) return;
    this.model.updateMatrixWorld(true);
    this.model.getWorldQuaternion(_q);
    _f.set(0, 0, 1).applyQuaternion(_q);
    const facing = Math.atan2(_f.x, _f.z);
    for (const l of this.links) {
      if (!l.toe) continue;
      const foot = l.from;
      foot.getWorldQuaternion(_q2);
      _a.copy(l.toe).applyQuaternion(_q2);
      const flat = Math.hypot(_a.x, _a.z);
      if (flat < 0.2) continue;
      const yaw = Math.atan2(Math.sin(Math.atan2(_a.x, _a.z) - facing), Math.cos(Math.atan2(_a.x, _a.z) - facing));
      const [lo, hi] = FOOT_YAW[l.side];
      const fix = (THREE.MathUtils.clamp(yaw, lo, hi) - yaw) * w * THREE.MathUtils.smoothstep(flat, 0.2, 0.6);
      if (Math.abs(fix) < 1e-4) continue;
      _q.setFromAxisAngle(_up, fix).multiply(_q2); // nuevo giro mundial del pie
      foot.parent.getWorldQuaternion(_q2);
      foot.quaternion.copy(_q2.invert().multiply(_q));
      foot.updateMatrixWorld(true);
    }
  }

  /** Coloca huesos y articulaciones sobre la pose final de este fotograma. */
  update() {
    if (!this.group.visible) return;
    this.model.updateMatrixWorld(true);
    for (const j of this.joints) {
      j.bone.getWorldPosition(j.mesh.position);
      if (j.lift) j.mesh.position.addScaledVector(_b.setFromMatrixColumn(j.bone.matrixWorld, 1).normalize(), j.lift);
    }
    if (this.face) {
      const f = this.face;
      f.bone.getWorldPosition(f.mesh.position);
      f.mesh.position.addScaledVector(_b.setFromMatrixColumn(f.bone.matrixWorld, 1).normalize(), HEAD_UP);
      f.mesh.quaternion.copy(f.bone.getWorldQuaternion(_q)).multiply(f.rest);
    }
    for (const l of this.links) {
      l.from.getWorldPosition(_a);
      if (l.to) l.to.getWorldPosition(_b);
      else _b.copy(l.toe).applyQuaternion(l.from.getWorldQuaternion(_q)).multiplyScalar(FOOT_LENGTH).add(_a);
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
