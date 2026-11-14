import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Acabados de la casa: texturas hechas a mano, carpintería, tejado a dos aguas, muebles y
// adornos. Casi todo es solo visual; los muebles llevan además un bloque invisible que choca
// (y sirve de cobertura).

/** Textura de lienzo repetida: `draw(g, size)` pinta una baldosa. */
function canvasTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
// Azar repetible: la casa sale igual en cada carga.
function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

export function houseTextures() {
  // Estuco: base cálida con manchas y grano fino.
  const stucco = canvasTexture(256, (g, n) => {
    const r = rng(7);
    g.fillStyle = '#c9b594'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 900; i++) {
      const v = 150 + r() * 80;
      g.fillStyle = `rgba(${v + 30},${v + 8},${v - 30},${0.05 + r() * 0.08})`;
      const s = 2 + r() * 14;
      g.fillRect(r() * n, r() * n, s, s * (0.4 + r()));
    }
    for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(60,45,25,${r() * 0.12})`; g.fillRect(r() * n, r() * n, 1, 1); }
  });
  // Tarima: tablas a lo largo, cada una con su tono y sus juntas.
  const planks = canvasTexture(256, (g, n) => {
    const r = rng(11), rows = 6, h = n / rows;
    for (let i = 0; i < rows; i++) {
      const v = 0.8 + r() * 0.35;
      g.fillStyle = `rgb(${Math.round(122 * v)},${Math.round(84 * v)},${Math.round(50 * v)})`;
      g.fillRect(0, i * h, n, h);
      for (let k = 0; k < 14; k++) { g.fillStyle = `rgba(50,30,12,${0.05 + r() * 0.1})`; g.fillRect(0, i * h + r() * h, n, 1); }
      g.fillStyle = 'rgba(30,18,8,0.75)'; g.fillRect(0, i * h, n, 2);
      const cut = r() * n; g.fillRect(cut, i * h, 2, h);
    }
  });
  // Tejas: hileras con sombra en el borde inferior y juntas alternas.
  const tiles = canvasTexture(256, (g, n) => {
    const r = rng(23), rows = 8, cols = 8, h = n / rows, w = n / cols;
    for (let i = 0; i < rows; i++) {
      for (let j = -1; j < cols; j++) {
        const v = 0.78 + r() * 0.4;
        g.fillStyle = `rgb(${Math.round(150 * v)},${Math.round(68 * v)},${Math.round(48 * v)})`;
        g.fillRect((j + (i % 2) * 0.5) * w, i * h, w - 1, h);
      }
      g.fillStyle = 'rgba(40,14,8,0.6)'; g.fillRect(0, (i + 1) * h - 4, n, 4);
    }
  });
  return { stucco, planks, tiles };
}

/** Ajusta las UV de una caja a su tamaño real para que la textura no se estire (`per` m por baldosa). */
export function worldUV(geometry, [sx, sy, sz], per = 2) {
  const uv = geometry.attributes.uv;
  const dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]]; // caras ±X, ±Y, ±Z
  for (let i = 0; i < uv.count; i++) {
    const [a, b] = dims[Math.floor(i / 4)];
    uv.setXY(i, uv.getX(i) * a / per, uv.getY(i) * b / per);
  }
  uv.needsUpdate = true;
}

const mat = (color, roughness = 0.8, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
export const WOOD = mat(0x6b4a2f, 0.75), WOOD_DARK = mat(0x4a321f, 0.8), WOOD_LIGHT = mat(0x9a7448, 0.7);
const METAL = mat(0xb9a15a, 0.35, { metalness: 0.8 });
const CURTAIN = mat(0xd9cdb0, 0.95), CURTAIN_FOLD = mat(0xc4b693, 0.95);
const STEEL = mat(0xc8ccd0, 0.3, { metalness: 0.7 }), WHITE = mat(0xeeeeea, 0.45), GRAY = mat(0x8f9296, 0.6);
const LEAF = mat(0x4f7a3a, 0.9, { flatShading: true }), LEAF_DARK = mat(0x3d6230, 0.9, { flatShading: true });
const BARK = mat(0x5a4330, 0.95);

/** Mata de hojas: varios poliedros verdes alrededor de (x, y, z), de radio `size`. */
function bush(root, x, y, z, size, r) {
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(size * (0.55 + r() * 0.45), 0), i % 2 ? LEAF : LEAF_DARK);
    m.position.set(x + (r() - 0.5) * size * 1.4, y + size * (0.5 + r() * 0.5), z + (r() - 0.5) * size * 1.4);
    m.rotation.set(r() * 3, r() * 3, 0);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
  }
}

/**
 * Funde en una sola malla por material todas las piezas fijas de `group` (cientos de cajas
 * serían cientos de dibujados por fotograma): cada geometría queda en coordenadas del mundo.
 */
export function mergeStatic(group, scene) {
  group.updateMatrixWorld(true);
  const sets = new Map();
  group.traverse((o) => {
    if (!o.isMesh) return;
    // Solo se funden geometrías del mismo tipo (con índice o sin él, como los poliedros).
    const key = o.material.uuid + (o.castShadow ? 's' : '') + (o.geometry.index ? 'i' : 'n');
    if (!sets.has(key)) sets.set(key, { material: o.material, shadow: o.castShadow, geos: [], meshes: [] });
    const set = sets.get(key);
    set.geos.push(o.geometry.clone().applyMatrix4(o.matrixWorld));
    set.meshes.push(o);
  });
  for (const set of sets.values()) {
    if (set.geos.length < 2) continue;
    const mesh = new THREE.Mesh(mergeGeometries(set.geos), set.material);
    mesh.castShadow = set.shadow;
    mesh.receiveShadow = true;
    scene.add(mesh);
    for (const m of set.meshes) { m.parent.remove(m); m.geometry.dispose(); }
    for (const g of set.geos) g.dispose();
  }
}

/** Caja solo visual dentro de `parent`. */
export function box(parent, size, pos, material, shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  m.position.set(...pos);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** Lo que entran los marcos en su hueco (m), para no coincidir con el canto del muro. */
const TRIM_INSET = 0.01;

/**
 * Carpintería de una ventana, en el marco local del hueco (X a lo largo del muro, Z hacia
 * fuera con `out`): marco, alféizar que sobresale y contraventanas abiertas por fuera.
 */
export function windowTrim(g, V, muro, out) {
  const h = V.alto - V.bajo, yc = (V.bajo + V.alto) / 2, d = muro + 0.05, t = 0.06;
  // El marco entra un poco en el hueco: si su cara coincide con el canto del muro, las dos
  // superficies parpadean (franjas a cuadros).
  const e = TRIM_INSET;
  box(g, [V.ancho + 2 * t, t, d], [0, V.alto + t / 2 - e, 0], WOOD);
  box(g, [t, h, d], [-V.ancho / 2 - t / 2 + e, yc, 0], WOOD);
  box(g, [t, h, d], [V.ancho / 2 + t / 2 - e, yc, 0], WOOD);
  box(g, [V.ancho + 2 * t + 0.1, 0.05, muro + 0.2], [0, V.bajo - 0.025, out * 0.05], WOOD_LIGHT); // alféizar
  // Por dentro: barra y dos cortinas recogidas a los lados.
  const zi = -out * (muro / 2 + 0.06);
  box(g, [V.ancho + 0.9, 0.025, 0.025], [0, V.alto + 0.14, zi], METAL, false);
  for (const s of [-1, 1]) {
    const x = s * (V.ancho / 2 + 0.24);
    box(g, [0.34, h + 0.3, 0.045], [x, yc + 0.06, zi], CURTAIN, false);
    for (let k = -1; k <= 1; k++) box(g, [0.035, h + 0.28, 0.06], [x + k * 0.11, yc + 0.06, zi - out * 0.008], CURTAIN_FOLD, false); // pliegues
    box(g, [0.36, 0.04, 0.07], [x, V.bajo + 0.35, zi], CURTAIN_FOLD, false); // alzapaños
  }
  for (const s of [-1, 1]) { // contraventanas, pegadas a la fachada
    const x = s * (V.ancho / 2 + t + 0.3), z = out * (muro / 2 + 0.02);
    box(g, [0.56, h + 0.04, 0.03], [x, yc, z], WOOD_DARK);
    for (let i = 0; i < 6; i++) box(g, [0.46, 0.035, 0.02], [x, V.bajo + 0.12 + i * (h - 0.2) / 5, z + out * 0.02], WOOD, false);
  }
}

/** Cristal con sus junquillos (una cruz) y, aparte, los picos que quedan en el marco al romperse. */
export function glazing(pane, remains, V, grosor, glassMat) {
  const h = V.alto - V.bajo, yc = (V.bajo + V.alto) / 2;
  const glass = box(pane, [V.ancho, h, grosor], [0, yc, 0], glassMat, false);
  glass.receiveShadow = false;
  box(pane, [0.035, h, grosor + 0.02], [0, yc, 0], WOOD_LIGHT, false);
  box(pane, [V.ancho, 0.035, grosor + 0.02], [0, yc, 0], WOOD_LIGHT, false);
  // Picos de cristal roto: triángulos con la base en el marco.
  const r = rng(31), pts = [];
  const spike = (x, y, ax, ay, len, wide) => { // base centrada en (x, y) a lo largo de (ax, ay); punta hacia dentro
    const nx = -ay, ny = ax;
    pts.push(x - ax * wide, y - ay * wide, 0, x + ax * wide, y + ay * wide, 0, x + nx * len + ax * (r() - 0.5) * wide, y + ny * len + ay * (r() - 0.5) * wide, 0);
  };
  for (let i = 0; i < 5; i++) {
    const u = (i + 0.2 + r() * 0.6) / 5;
    spike(-V.ancho / 2 + u * V.ancho, V.bajo, 1, 0, 0.06 + r() * 0.16, 0.05 + r() * 0.07);
    spike(-V.ancho / 2 + u * V.ancho, V.alto, -1, 0, 0.05 + r() * 0.2, 0.05 + r() * 0.07);
    if (i < 4) {
      const y = V.bajo + (i + 0.2 + r() * 0.6) / 4 * h;
      spike(-V.ancho / 2, y, 0, -1, 0.05 + r() * 0.15, 0.05 + r() * 0.06);
      spike(V.ancho / 2, y, 0, 1, 0.05 + r() * 0.15, 0.05 + r() * 0.06);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  geo.computeVertexNormals();
  remains.add(new THREE.Mesh(geo, glassMat));
}

/** Todo lo demás: tejado, zócalo, entrada, chimenea, luces, muebles. `H` son las medidas de la casa. */
export function decorate(scene, physics, H, tex, doorZ) {
  const hx = H.ancho / 2, hz = H.fondo / 2, top = H.alto + H.techo;
  const root = new THREE.Group();
  scene.add(root);
  const at = (size, pos, material, shadow) => box(root, size, [H.x + pos[0], pos[1], H.z + pos[2]], material, shadow);

  // --- Tejado a dos aguas (cumbrera a lo largo de X), con alero, hastiales y chimenea ---
  const R = { alero: 0.45, sube: 1.2, grueso: 0.08 };
  const half = hz + R.alero, ang = Math.atan2(R.sube, hz), len = half / Math.cos(ang);
  const ridgeY = top + R.sube, eaveY = top - R.alero * Math.tan(ang);
  const roofTex = tex.tiles.clone();
  roofTex.needsUpdate = true;
  const roofMat = mat(0xffffff, 0.85, { map: roofTex });
  for (const s of [-1, 1]) {
    const size = [H.ancho + 2 * R.alero, R.grueso, len];
    const m = at(size, [0, (ridgeY + eaveY) / 2 + R.grueso / 2, s * half / 2], roofMat);
    worldUV(m.geometry, size, 1.6);
    m.rotation.x = s * ang;
    at([H.ancho + 2 * R.alero, 0.12, 0.05], [0, eaveY - 0.02, s * (half - 0.01)], WOOD_DARK); // tabla del alero
  }
  at([H.ancho + 2 * R.alero + 0.04, 0.09, 0.2], [0, ridgeY + 0.07, 0], mat(0x6e2f22, 0.8)); // cumbrera
  const gableMat = mat(0xffffff, 0.95, { map: tex.stucco, side: THREE.DoubleSide });
  for (const s of [-1, 1]) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, top, -hz, 0, top, hz, 0, ridgeY, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, H.fondo / 2, 0, H.fondo / 4, R.sube / 2], 2));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, gableMat);
    m.position.set(H.x + s * (hx - 0.01), 0, H.z);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
    // Vigas del hastial bajo el alero y un respiradero redondo.
    for (const k of [-1, 1]) {
      const beam = at([0.07, 0.1, len], [s * (hx + R.alero - 0.04), (ridgeY + eaveY) / 2 - 0.05, k * half / 2], WOOD_DARK);
      beam.rotation.x = k * ang;
    }
    const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 20), WOOD_DARK);
    vent.rotation.z = Math.PI / 2;
    vent.position.set(H.x + s * (hx + 0.005), top + 0.45, H.z);
    root.add(vent);
  }
  const brick = mat(0x8a4a3a, 0.9);
  at([0.55, 1.5, 0.55], [2.3, top + 0.95, -1.3], brick);
  at([0.7, 0.1, 0.7], [2.3, top + 1.72, -1.3], mat(0x5a5a5a, 0.9));

  // --- Zócalo de piedra alrededor (con el hueco de la puerta) y esquineras ---
  const stone = mat(0x77736b, 0.95), Z = { alto: 0.32, sale: 0.03 };
  for (const s of [-1, 1]) at([H.ancho + 2 * Z.sale, Z.alto, Z.sale], [0, Z.alto / 2, s * (hz + Z.sale / 2)], stone, false);
  at([Z.sale, Z.alto, H.fondo], [-hx - Z.sale / 2, Z.alto / 2, 0], stone, false);
  const d0 = doorZ - H.z - H.puerta.ancho / 2 - 0.08, d1 = doorZ - H.z + H.puerta.ancho / 2 + 0.08;
  at([Z.sale, Z.alto, d0 + hz], [hx + Z.sale / 2, Z.alto / 2, (d0 - hz) / 2], stone, false);
  at([Z.sale, Z.alto, hz - d1], [hx + Z.sale / 2, Z.alto / 2, (d1 + hz) / 2], stone, false);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) at([0.14, H.alto, 0.14], [sx * (hx - 0.04), H.alto / 2, sz * (hz - 0.04)], mat(0xa8977a, 0.9));

  // --- Entrada: marco, tejadillo, felpudo, losas del camino y farol ---
  const P = H.puerta, dz = doorZ - H.z, fx = hx - H.muro / 2;
  for (const s of [-1, 1]) at([H.muro + 0.06, P.alto + 0.07, 0.07], [fx, (P.alto + 0.07) / 2, dz + s * (P.ancho / 2 + 0.035 - TRIM_INSET)], WOOD_DARK);
  at([H.muro + 0.06, 0.07, P.ancho + 0.14], [fx, P.alto + 0.035 - TRIM_INSET, dz], WOOD_DARK);
  const porch = at([0.9, 0.06, P.ancho + 0.9], [hx + 0.4, P.alto + 0.42, dz], roofMat);
  porch.rotation.z = -0.32;
  for (const s of [-1, 1]) {
    const brace = at([0.75, 0.06, 0.06], [hx + 0.3, P.alto + 0.2, dz + s * (P.ancho / 2 + 0.3)], WOOD_DARK);
    brace.rotation.z = 0.5;
  }
  at([0.5, 0.02, 0.8], [hx + 0.4, 0.012, dz], mat(0x5c4a32, 1), false); // felpudo
  const r = rng(5);
  for (let i = 0; i < 5; i++) {
    const slab = at([0.6 + r() * 0.15, 0.025, 0.75 + r() * 0.2], [hx + 1.15 + i * 0.85, 0.013, dz + (r() - 0.5) * 0.25], stone, false);
    slab.rotation.y = (r() - 0.5) * 0.3;
  }
  const lampOut = { x: hx + 0.14, y: 1.95, z: dz - P.ancho / 2 - 0.4 };
  at([0.1, 0.05, 0.05], [hx + 0.06, lampOut.y + 0.12, lampOut.z], WOOD_DARK, false);
  at([0.13, 0.2, 0.13], [lampOut.x, lampOut.y, lampOut.z], mat(0xffe9b0, 0.4, { emissive: 0xffc870, emissiveIntensity: 1.6 }), false);
  at([0.17, 0.03, 0.17], [lampOut.x, lampOut.y + 0.115, lampOut.z], WOOD_DARK, false);
  const porchLight = new THREE.PointLight(0xffc870, 5, 6, 1.8);
  porchLight.position.set(H.x + lampOut.x + 0.25, lampOut.y, H.z + lampOut.z);
  scene.add(porchLight);

  // --- Interior: lámpara, rodapié, alfombra, cuadro y muebles ---
  at([0.02, 0.4, 0.02], [0, H.alto - 0.2, 0], WOOD_DARK, false);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.2, 16, 1, true), mat(0xe8dcc0, 0.8, { side: THREE.DoubleSide, emissive: 0x6b5a30, emissiveIntensity: 0.6 }));
  shade.position.set(H.x, H.alto - 0.42, H.z);
  root.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), mat(0xfff2cc, 0.3, { emissive: 0xffe2a0, emissiveIntensity: 2.5 }));
  bulb.position.set(H.x, H.alto - 0.5, H.z);
  root.add(bulb);
  at([2.4, 0.012, 1.6], [0, 0.028, 0], mat(0x8a2f2a, 1), false); // alfombra
  at([2.1, 0.013, 1.3], [0, 0.029, 0], mat(0xb9895a, 1), false);
  at([0.03, 0.6, 0.85], [-hx + H.muro + 0.016, 1.6, -1.6], WOOD_DARK, false); // cuadro
  at([0.03, 0.48, 0.73], [-hx + H.muro + 0.022, 1.6, -1.6], mat(0x4f7a8c, 0.9), false);

  // Mueble: un bloque invisible que choca y las piezas que se ven. Posiciones respecto al centro de la casa.
  const solid = (size, pos) => physics.add({ size, pos: [H.x + pos[0], size[1] / 2, H.z + pos[1]], visible: false, shadow: false });
  const cloth = (c) => mat(c, 0.95);
  // Mesa con dos sillas, en el centro.
  solid([1.2, 0.76, 0.8], [0, 0]);
  at([1.3, 0.05, 0.9], [0, 0.755, 0], WOOD_LIGHT);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) at([0.07, 0.73, 0.07], [sx * 0.55, 0.365, sz * 0.35], WOOD);
  for (const s of [-1, 1]) {
    const cx = s * 0.98;
    solid([0.42, 0.46, 0.42], [cx, 0]);
    at([0.42, 0.04, 0.42], [cx, 0.45, 0], WOOD);
    for (const a of [-1, 1]) for (const b of [-1, 1]) at([0.04, 0.43, 0.04], [cx + a * 0.18, 0.215, b * 0.18], WOOD_DARK);
    at([0.04, 0.5, 0.42], [cx + s * 0.19, 0.7, 0], WOOD);
  }
  at([0.16, 0.02, 0.16], [0.2, 0.79, 0.1], mat(0xe9e4d8, 0.5), false); // plato
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.09, 12), mat(0x3d6b8c, 0.5));
  mug.position.set(H.x - 0.25, 0.825, H.z - 0.12);
  root.add(mug);
  // Cama, en la esquina noroeste.
  const bx = -hx + H.muro + 0.5, bz = -hz + H.muro + 1.0;
  solid([0.95, 0.5, 1.95], [bx, bz]);
  at([0.95, 0.22, 1.95], [bx, 0.24, bz], WOOD);
  at([0.95, 0.75, 0.06], [bx, 0.5, bz - 0.95], WOOD_DARK); // cabecero
  at([0.87, 0.16, 1.85], [bx, 0.43, bz], cloth(0xe6e0d2));
  at([0.9, 0.05, 1.2], [bx, 0.52, bz + 0.33], cloth(0x4d6a8a)); // manta
  at([0.6, 0.1, 0.34], [bx, 0.55, bz - 0.68], cloth(0xf4f1ea)); // almohada
  // Sofá, contra el muro norte, entre las ventanas.
  const sz0 = -hz + H.muro + 0.42;
  solid([1.8, 0.8, 0.8], [0, sz0]);
  at([1.8, 0.32, 0.8], [0, 0.2, sz0], cloth(0x5d6b4a));
  at([1.8, 0.5, 0.2], [0, 0.6, sz0 - 0.3], cloth(0x56633f));
  for (const s of [-1, 1]) at([0.18, 0.28, 0.8], [s * 0.81, 0.48, sz0], cloth(0x56633f));
  for (const s of [-1, 1]) at([0.68, 0.12, 0.52], [s * 0.36, 0.41, sz0 + 0.08], cloth(0x6f7f58));
  // Estantería, contra el muro sur, entre las ventanas.
  const ez = hz - H.muro - 0.19;
  solid([1.6, 1.8, 0.36], [0, ez]);
  for (const s of [-1, 1]) at([0.04, 1.8, 0.36], [s * 0.78, 0.9, ez], WOOD);
  at([1.6, 1.8, 0.02], [0, 0.9, ez + 0.17], WOOD_DARK);
  const colors = [0x8c3b2e, 0x2f5d7c, 0x3f7a4a, 0xb08a3a, 0x6a3f7a, 0xd8d2c4].map((c) => mat(c, 0.85));
  for (let i = 0; i < 5; i++) {
    const y = 0.04 + i * 0.44;
    at([1.6, 0.04, 0.36], [0, y, ez], WOOD);
    if (i === 4) break;
    let x = -0.72;
    while (x < 0.62) { // libros de grosor y altura variables, con algún hueco
      const w = 0.04 + r() * 0.06, h = 0.22 + r() * 0.14;
      if (r() > 0.18) at([w, h, 0.22], [x + w / 2, y + 0.02 + h / 2, ez - 0.02], colors[Math.floor(r() * colors.length)], false);
      x += w + 0.006;
    }
  }
  // Fuera: barril y caja junto a la esquina.
  physics.add({ shape: 'cylinder', radius: 0.32, height: 0.9, pos: [H.x + hx + 0.45, 0.45, H.z - hz + 0.45], color: 0x6b4a2f });
  physics.add({ size: [0.7, 0.7, 0.7], pos: [H.x + hx + 0.5, 0.35, H.z - hz + 1.25], color: 0x9a7448 });
  // --- Más interior: rodapié, cocina, planta y perchero ---
  const base = mat(0x5a3f28, 0.8), bx0 = hx - H.muro, bz0 = hz - H.muro;
  for (const s of [-1, 1]) at([H.ancho - 2 * H.muro, 0.09, 0.015], [0, 0.045, s * (bz0 - 0.008)], base, false);
  at([0.015, 0.09, H.fondo - 2 * H.muro], [-(bx0 - 0.008), 0.045, 0], base, false);
  const dIn0 = doorZ - H.z - H.puerta.ancho / 2, dIn1 = doorZ - H.z + H.puerta.ancho / 2;
  at([0.015, 0.09, dIn0 + bz0], [bx0 - 0.008, 0.045, (dIn0 - bz0) / 2], base, false);
  at([0.015, 0.09, bz0 - dIn1], [bx0 - 0.008, 0.045, (dIn1 + bz0) / 2], base, false);
  // Cocina contra el muro oeste, entre la ventana y la esquina suroeste: encimera con
  // fregadero y fogones, muebles altos y nevera en la esquina.
  const kx = -bx0 + 0.3, k0 = 0.9, k1 = 2.08, kc = (k0 + k1) / 2, kl = k1 - k0;
  solid([0.6, 0.9, kl], [kx, kc]);
  at([0.56, 0.84, kl], [kx + 0.02, 0.42, kc], WHITE);
  at([0.64, 0.05, kl + 0.02], [kx, 0.885, kc], mat(0x3b3b3e, 0.4)); // encimera
  at([0.02, 0.1, kl - 0.04], [kx + 0.31, 0.05, kc], GRAY, false); // zócalo del mueble
  for (let i = 0; i < 3; i++) { // puertas y tiradores
    const z = k0 + (i + 0.5) * kl / 3;
    at([0.012, 0.7, kl / 3 - 0.03], [kx + 0.306, 0.47, z], WHITE, false);
    at([0.02, 0.12, 0.02], [kx + 0.32, 0.7, z + kl / 6 - 0.07], STEEL, false);
  }
  at([0.4, 0.03, 0.45], [kx + 0.02, 0.905, k0 + 0.32], STEEL, false); // fregadero
  at([0.34, 0.035, 0.38], [kx + 0.02, 0.91, k0 + 0.32], mat(0x55595e, 0.3), false);
  at([0.03, 0.22, 0.03], [kx - 0.22, 1.02, k0 + 0.32], STEEL, false); // grifo
  at([0.2, 0.025, 0.025], [kx - 0.13, 1.12, k0 + 0.32], STEEL, false);
  for (const [dx, dz] of [[-0.1, -0.13], [-0.1, 0.13], [0.12, -0.13], [0.12, 0.13]]) { // fogones
    const burner = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.012, 16), mat(0x1e1e20, 0.5));
    burner.position.set(H.x + kx + dx, 0.916, H.z + k1 - 0.3 + dz);
    root.add(burner);
  }
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.13, 16), mat(0x7a2a22, 0.4, { metalness: 0.3 }));
  pot.position.set(H.x + kx - 0.1, 0.99, H.z + k1 - 0.43);
  root.add(pot);
  at([0.34, 0.6, kl], [-bx0 + 0.17, 1.85, kc], WHITE); // muebles altos
  for (let i = 0; i < 2; i++) at([0.012, 0.56, kl / 2 - 0.03], [-bx0 + 0.346, 1.85, k0 + (i + 0.5) * kl / 2], WHITE, false);
  at([0.012, 0.42, 0.012], [-bx0 + 0.35, 1.9, kc - 0.06], STEEL, false);
  at([0.012, 0.42, 0.012], [-bx0 + 0.35, 1.9, kc + 0.06], STEEL, false);
  at([0.01, 0.55, kl], [-bx0 + 0.006, 1.2, kc], mat(0xdfe6e4, 0.3), false); // azulejos detrás
  const fz = bz0 - 0.36;
  solid([0.68, 1.85, 0.68], [kx + 0.04, fz]);
  at([0.68, 1.85, 0.68], [kx + 0.04, 0.925, fz], WHITE);
  at([0.01, 0.01, 0.66], [kx + 0.385, 1.2, fz], GRAY, false); // separación de las dos puertas
  at([0.03, 0.4, 0.03], [kx + 0.4, 1.45, fz - 0.24], STEEL, false);
  at([0.03, 0.25, 0.03], [kx + 0.4, 0.95, fz - 0.24], STEEL, false);
  // Planta en la esquina noreste y perchero junto a la puerta (este, sureste).
  const px = bx0 - 0.3, pz = -bz0 + 0.3;
  solid([0.4, 0.45, 0.4], [px, pz]);
  const potPlant = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.4, 14), mat(0xa0583a, 0.8));
  potPlant.position.set(H.x + px, 0.2, H.z + pz);
  potPlant.castShadow = true;
  root.add(potPlant);
  bush(root, H.x + px, 0.35, H.z + pz, 0.28, r);
  bush(root, H.x + px, 0.75, H.z + pz, 0.2, r);
  const cx = bx0 - 0.35, cz = bz0 - 0.35;
  at([0.04, 1.75, 0.04], [cx, 0.875, cz], WOOD_DARK, false);
  at([0.36, 0.03, 0.36], [cx, 0.015, cz], WOOD_DARK, false);
  for (const a of [0, 1, 2, 3]) {
    const peg = at([0.18, 0.025, 0.025], [cx + Math.cos(a * 1.57) * 0.08, 1.68, cz + Math.sin(a * 1.57) * 0.08], WOOD_DARK, false);
    peg.rotation.y = -a * 1.57;
  }
  at([0.12, 0.7, 0.32], [cx + 0.05, 1.3, cz], mat(0x3a4a5e, 0.95)); // abrigo colgado

  // --- Más exterior: canalones y bajantes, césped, arbustos, buzón y un árbol ---
  for (const s of [-1, 1]) {
    at([H.ancho + 2 * R.alero, 0.09, 0.11], [0, eaveY - 0.06, s * (half + 0.03)], GRAY);
    for (const k of [-1, 1]) {
      const sx = k * (hx - 0.25);
      at([0.08, eaveY - 0.5, 0.08], [sx, (eaveY - 0.5) / 2 + 0.05, s * (hz + 0.07)], GRAY);
      const elbow = at([0.08, 0.55, 0.08], [sx, eaveY - 0.32, s * (half + hz + 0.1) / 2], GRAY);
      elbow.rotation.x = s * 0.75;
      for (const y of [0.6, 1.5]) at([0.12, 0.03, 0.06], [sx, y, s * (hz + 0.04)], GRAY, false); // abrazaderas
    }
  }
  const lawn = at([H.ancho + 6, 0.01, H.fondo + 6], [-0.5, 0.005, 0], mat(0x5f7d45, 1), false);
  lawn.receiveShadow = true;
  const earth = mat(0x5a4632, 1);
  for (const s of [-1, 1]) at([H.ancho - 0.6, 0.012, 0.6], [0, 0.009, s * (hz + 0.36)], earth, false); // arriates
  at([0.6, 0.012, H.fondo - 0.6], [-(hx + 0.36), 0.009, 0], earth, false);
  for (const [x, z] of [[-2, hz + 0.38], [2, hz + 0.38], [-2, -hz - 0.38], [2, -hz - 0.38], [-hx - 0.38, 0]]) bush(root, H.x + x, 0, H.z + z, 0.32, r);
  const flowers = [0xd8455a, 0xf0c445, 0xeeeeee, 0x8a5ad0].map((c) => mat(c, 0.7));
  for (let i = 0; i < 40; i++) {
    const side = i % 3, t = r() - 0.5;
    const x = side === 2 ? -(hx + 0.36 + (r() - 0.5) * 0.4) : t * (H.ancho - 1);
    const z = side === 2 ? t * (H.fondo - 1) : (side ? 1 : -1) * (hz + 0.36 + (r() - 0.5) * 0.4);
    if (Math.abs(Math.abs(x) - 2) < 0.5 && side !== 2) continue; // ahí van los arbustos
    const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.04, 0), flowers[i % 4]);
    f.position.set(H.x + x, 0.12 + r() * 0.1, H.z + z);
    root.add(f);
    at([0.012, 0.13, 0.012], [x, 0.065, z], LEAF_DARK, false);
  }
  const mx = hx + 4.2, mz = dz + 0.75; // buzón al final del camino
  at([0.08, 1.05, 0.08], [mx, 0.525, mz], WOOD_DARK);
  at([0.42, 0.22, 0.26], [mx, 1.15, mz], mat(0x2f4f6b, 0.5, { metalness: 0.3 }));
  at([0.03, 0.14, 0.03], [mx - 0.1, 1.33, mz + 0.14], mat(0xb8392e, 0.6), false);
  // Árbol al suroeste de la casa: el tronco choca (y cubre); la copa es solo visual.
  const tx = -hx - 2.6, tz = hz + 2.4;
  physics.add({ shape: 'cylinder', radius: 0.22, height: 2.6, pos: [H.x + tx, 1.3, H.z + tz], material: BARK });
  for (const [x, y, z, s] of [[0, 3.1, 0, 1.25], [0.6, 2.7, 0.3, 0.9], [-0.55, 2.8, -0.35, 0.95], [0.1, 3.7, -0.2, 0.85], [-0.3, 2.6, 0.6, 0.8]]) {
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), (x + z) > 0 ? LEAF : LEAF_DARK);
    crown.position.set(H.x + tx + x, y, H.z + tz + z);
    crown.castShadow = crown.receiveShadow = true;
    root.add(crown);
  }
  for (const a of [0.4, 2.5, 4.4]) {
    const branch = at([0.08, 1.0, 0.08], [tx + Math.cos(a) * 0.25, 2.3, tz + Math.sin(a) * 0.25], BARK);
    branch.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
  }

  mergeStatic(root, scene);
  return root;
}
