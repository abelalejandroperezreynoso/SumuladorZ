import * as THREE from 'three';
import { RAPIER } from './physics.js';

// Relieve de la ciudad. El centro (la cuadrícula) es llano; alrededor el suelo sube y baja:
// un cerro al este, el cauce del río al sur y lomas suaves en el campo, más allá del límite.
// Es una rejilla de alturas cada `paso` m (coordenadas respecto al centro de la ciudad): de
// ella salen la malla de hierba y el choque del suelo (la misma triangulación, así los pies
// pisan exactamente lo que se ve), y `at(x, z)` da la altura de cualquier punto.
//
// Los edificios necesitan suelo llano: cada solar pide una explanada con `pad`, que aplana la
// rejilla bajo él (y la une al resto en un talud de `talud` m). Un solar en demasiada
// pendiente (más de `desnivel` m entre sus bordes) no se concede: ahí no se construye.
export const TERRAIN = {
  paso: 4,
  cerro: { alto: 6, x0: 110, rampa: 50, norte: [-104, 26], sur: [64, 40] }, // al este: sube de x0 a x0 + rampa
  rio: { fondo: -3, lecho: 6, orilla: 8, agua: -2.55 }, // medio ancho del lecho y ancho del talud de cada orilla
  campo: { alto: 2.6, desde: 8, hasta: 60 }, // lomas fuera del límite
  desnivel: 0.8, holgura: 4.4, talud: 7,
};

const S = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };

export class Terrain {
  /** `half`: mitad del centro llano; `limit`: mitad de la ciudad; `extent`: hasta dónde llega el suelo; `river`: curva del río. */
  constructor({ half, limit, extent, river }) {
    const P = TERRAIN.paso;
    Object.assign(this, { half, limit, river });
    this.n = Math.ceil(extent / P) * 2; // celdas por lado
    this.e = (this.n / 2) * P;
    this.h = null;
    this.pads = [];
  }

  /** Distancia al eje del río. */
  riverDist(x, z) {
    let best = Infinity;
    const R = this.river;
    for (let i = 1; i < R.length; i++) {
      const a = R[i - 1], b = R[i], dx = b.x - a.x, dz = b.z - a.z;
      const t = Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
      const d = (x - a.x - dx * t) ** 2 + (z - a.z - dz * t) ** 2;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  /** Altura del relieve sin explanadas. */
  base(x, z) {
    const T = TERRAIN, cheb = Math.max(Math.abs(x), Math.abs(z));
    const m = S((cheb - this.half - 10) / 8);
    if (m === 0) return 0;
    const C = T.cerro;
    let h = C.alto * S((x - C.x0) / C.rampa) * S((z - C.norte[0]) / C.norte[1]) * (1 - S((z - C.sur[0]) / C.sur[1]));
    const K = T.campo, out = S((cheb - this.limit - K.desde) / K.hasta);
    if (out > 0) h += K.alto * out * (Math.sin(x * 0.031 + 1.3) * Math.cos(z * 0.027) + 0.6 * Math.sin((x + z) * 0.017 + 0.5));
    const d = this.riverDist(x, z), R = T.rio;
    if (d < R.lecho + R.orilla) { const k = 1 - S((d - R.lecho) / R.orilla); h += (R.fondo - h) * k; }
    return h * m;
  }

  /**
   * Pide una explanada de w × d centrada en (x, z) y girada `rot`. Devuelve su altura, o null
   * si el sitio tiene demasiada pendiente (o cae en el río).
   */
  pad(x, z, rot, w, d, tol = TERRAIN.desnivel) {
    const c = Math.cos(rot), s = Math.sin(rot);
    let lo = Infinity, hi = -Infinity, sum = 0, n = 0;
    for (const u of [-0.5, 0, 0.5]) for (const v of [-0.5, 0, 0.5]) {
      const lx = u * w, lz = v * d, y = this.base(x + lx * c + lz * s, z - lx * s + lz * c);
      lo = Math.min(lo, y); hi = Math.max(hi, y); sum += y; n++;
    }
    if (hi - lo > tol) return null;
    const y = hi - lo < 0.02 ? hi : sum / n;
    this.pads.push({ x, z, c, s, hw: w / 2, hd: d / 2, y });
    return y;
  }

  /** Calcula la rejilla: relieve y, encima, las explanadas pedidas. */
  bake() {
    const P = TERRAIN.paso, n = this.n + 1, e = this.e, h = this.h = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) h[j * n + i] = this.base(i * P - e, j * P - e);
    const G = TERRAIN.holgura, B = TERRAIN.talud;
    for (const p of this.pads) {
      const r = Math.hypot(p.hw, p.hd) + G + B;
      const i0 = Math.max(0, Math.floor((p.x - r + e) / P)), i1 = Math.min(n - 1, Math.ceil((p.x + r + e) / P));
      const j0 = Math.max(0, Math.floor((p.z - r + e) / P)), j1 = Math.min(n - 1, Math.ceil((p.z + r + e) / P));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const dx = i * P - e - p.x, dz = j * P - e - p.z;
        const lx = Math.abs(dx * p.c - dz * p.s) - p.hw - G, lz = Math.abs(dx * p.s + dz * p.c) - p.hd - G;
        const k = 1 - S(Math.hypot(Math.max(lx, 0), Math.max(lz, 0)) / B);
        if (k > 0) h[j * n + i] += (p.y - h[j * n + i]) * k;
      }
    }
    // (El centro queda siempre a cero: las explanadas de sus bordes no lo tocan.)
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (Math.max(Math.abs(i * P - e), Math.abs(j * P - e)) <= this.half + 6) h[j * n + i] = 0;
  }

  /** Altura del suelo en (x, z): sobre la rejilla (o el relieve sin explanadas, si aún no se ha calculado). */
  at(x, z) {
    if (!this.h) return this.base(x, z);
    const P = TERRAIN.paso, n = this.n + 1;
    const fx = Math.min(this.n - 1e-4, Math.max(0, (x + this.e) / P)), fz = Math.min(this.n - 1e-4, Math.max(0, (z + this.e) / P));
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, h = this.h, k = j * n + i;
    // Cada celda son dos triángulos partidos por la diagonal (i, j) – (i + 1, j + 1).
    return u > v ? h[k] + (h[k + 1] - h[k]) * u + (h[k + n + 1] - h[k + 1]) * v : h[k] + (h[k + n] - h[k]) * v + (h[k + n + 1] - h[k + n]) * u;
  }

  /** Pendiente del suelo en (x, z), en tanto por uno. */
  slope(x, z) {
    return Math.hypot(this.at(x + 2, z) - this.at(x - 2, z), this.at(x, z + 2) - this.at(x, z - 2)) / 4;
  }

  /**
   * Crea las mallas de hierba (por trozos, para que no se dibujen los que no se ven) y el
   * choque del suelo. `ox`, `oz`: centro de la ciudad en el mundo. Devuelve los triángulos.
   */
  build(group, world, body, mat, ox, oz) {
    const P = TERRAIN.paso, N = this.n, n = N + 1, e = this.e, h = this.h, CH = 22, skip = this.half;
    const inner = (i, j) => Math.max(Math.abs(i * P - e), Math.abs(j * P - e)) <= skip;
    const cell = (i, j) => !(inner(i, j) && inner(i + 1, j) && inner(i, j + 1) && inner(i + 1, j + 1));
    // Choque: una malla de triángulos con toda la rejilla menos el centro (que tiene su losa).
    const verts = new Float32Array(n * n * 3), tri = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) verts.set([ox + i * P - e, h[j * n + i], oz + j * P - e], (j * n + i) * 3);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      if (!cell(i, j)) continue;
      const a = j * n + i;
      tri.push(a, a + n + 1, a + 1, a, a + n, a + n + 1);
    }
    world.createCollider(RAPIER.ColliderDesc.trimesh(verts, new Uint32Array(tri)), body);
    // Dibujo: hierba, más parda donde hay pendiente y fango en el lecho del río.
    const grass = new THREE.Color(0xc6cca2), earth = new THREE.Color(0x8f7d5c), mud = new THREE.Color(0x6f6a52), col = new THREE.Color();
    let tris = 0;
    for (let cj = 0; cj < N; cj += CH) for (let ci = 0; ci < N; ci += CH) {
      const w = Math.min(CH, N - ci), d = Math.min(CH, N - cj), pos = [], uv = [], cols = [], idx = [];
      for (let j = 0; j <= d; j++) for (let i = 0; i <= w; i++) {
        const gi = ci + i, gj = cj + j, y = h[gj * n + gi], x = gi * P - e, z = gj * P - e;
        pos.push(ox + x, y - 0.05, oz + z); // (algo por debajo de lo que pisa: calles y solares van encima)
        uv.push(x / 9, z / 9);
        const sx = h[gj * n + Math.min(N, gi + 1)] - h[gj * n + Math.max(0, gi - 1)], sz = h[Math.min(N, gj + 1) * n + gi] - h[Math.max(0, gj - 1) * n + gi];
        col.copy(grass).lerp(earth, S((Math.hypot(sx, sz) / (2 * P) - 0.12) / 0.3)).lerp(mud, S((-y - 1.2) / 1.2));
        cols.push(col.r, col.g, col.b);
      }
      for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) {
        if (!cell(ci + i, cj + j)) continue;
        const a = j * (w + 1) + i;
        idx.push(a, a + w + 2, a + 1, a, a + w + 1, a + w + 2);
      }
      if (!idx.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, mat);
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
      tris += idx.length / 3;
    }
    return tris;
  }
}
