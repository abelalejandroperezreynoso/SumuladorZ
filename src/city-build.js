import * as THREE from 'three';
import { RAPIER } from './physics.js';

// Constructor de geometría de la ciudad. Miles de piezas (cajas, tejados, cilindros, copas de
// árbol) se escriben directamente en unas pocas mallas, una por material, en vez de crear una
// malla por pieza: cada manzana se dibuja con una docena de llamadas. Las piezas se colocan en
// un marco local (`push`/`pop`: traslación y giro sobre la vertical) para que cada edificio se
// describa mirando a +Z y luego se oriente hacia su calle.

const _col = new Map();
/** Color sRGB (0xrrggbb) -> componentes lineales, que es como se guardan en los vértices. */
function lin(hex) {
  let c = _col.get(hex);
  if (!c) {
    const k = new THREE.Color(hex);
    c = [k.r, k.g, k.b];
    _col.set(hex, c);
  }
  return c;
}

/** Mezcla dos colores 0xrrggbb (t = 0 da `a`, 1 da `b`). */
export function mix(a, b, t) {
  const ch = (s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

// Icosaedro unidad: base de las copas de árbol y los arbustos.
const ICO = new THREE.IcosahedronGeometry(1, 0).attributes.position;

export class Batch {
  /** `body`: cuerpo fijo de Rapier al que se añaden los choques. */
  constructor(world, body) {
    this.world = world;
    this.body = body;
    this.buckets = new Map();
    this.stack = [];
    this.f = { x: 0, y: 0, z: 0, r: 0, c: 1, s: 0 };
    this.marks = {}; // puntos con nombre anotados por los generadores (farolas, objetos…)
    this.solids = 0;
  }

  /** Entra en un marco local: origen en (x, z), girado `r` rad sobre la vertical y elevado `y`. */
  push(x, z, r = 0, y = 0) {
    const f = this.f;
    this.stack.push(f);
    const nr = f.r + r;
    this.f = { x: f.x + x * f.c + z * f.s, y: f.y + y, z: f.z - x * f.s + z * f.c, r: nr, c: Math.cos(nr), s: Math.sin(nr) };
    return this;
  }

  pop() {
    this.f = this.stack.pop();
    return this;
  }

  /** Punto del marco local en coordenadas del mundo. */
  at(x, y, z) {
    const f = this.f;
    return [f.x + x * f.c + z * f.s, f.y + y, f.z - x * f.s + z * f.c];
  }

  /** Anota un punto con nombre (en el mundo), con datos opcionales. */
  mark(kind, x, y, z, data = {}) {
    const [wx, wy, wz] = this.at(x, y, z);
    (this.marks[kind] ??= []).push({ x: wx, y: wy, z: wz, r: this.f.r, ...data });
  }

  bucket(mat) {
    let b = this.buckets.get(mat);
    if (!b) this.buckets.set(mat, b = { pos: [], nor: [], uv: [], col: [], idx: [], n: 0 });
    return b;
  }

  /** Cara de cuatro vértices (p0 abajo-izquierda, en sentido antihorario vista desde fuera). */
  quad(mat, p0, p1, p2, p3, n, uv, col) {
    const b = this.bucket(mat), [u0, v0, u1, v1] = uv;
    b.pos.push(...p0, ...p1, ...p2, ...p3);
    for (let i = 0; i < 4; i++) { b.nor.push(n[0], n[1], n[2]); b.col.push(col[0], col[1], col[2]); }
    b.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    b.idx.push(b.n, b.n + 1, b.n + 2, b.n, b.n + 2, b.n + 3);
    b.n += 4;
  }

  tri(mat, p0, p1, p2, n, col, uv = [0, 0, 1, 0, 0.5, 1]) {
    const b = this.bucket(mat);
    b.pos.push(...p0, ...p1, ...p2);
    for (let i = 0; i < 3; i++) { b.nor.push(n[0], n[1], n[2]); b.col.push(col[0], col[1], col[2]); }
    b.uv.push(...uv);
    b.idx.push(b.n, b.n + 1, b.n + 2);
    b.n += 3;
  }

  /**
   * Caja con la base centrada en (x, y, z) y medidas (sx, sy, sz). Opciones: `rot` (giro
   * propio), `color` y `topColor` (0xrrggbb), `top` (material de la cara de arriba; false la
   * omite), `sides: false`, `bottom: true`, `solid: true` (choca) y la proyección de textura:
   * `uv: [m, m]` metros por repetición, `cells: [vano, planta]` para fachadas (reparte un
   * número entero de ventanas; `cu`, `cv` desplazan la rejilla) o `rect: [u0, v0, u1, v1]`.
   */
  box(mat, x, y, z, sx, sy, sz, o = {}) {
    const R = this.f.r + (o.rot || 0), c = Math.cos(R), s = Math.sin(R);
    const [cx, cy, cz] = this.at(x, y, z);
    const hx = sx / 2, hz = sz / 2, y0 = cy, y1 = cy + sy;
    const P = (lx, yy, lz) => [cx + lx * c + lz * s, yy, cz - lx * s + lz * c];
    const col = lin(o.color ?? 0xffffff);
    if (mat && o.sides !== false) {
      const per = o.per ?? 4;
      const uvFor = (w) => {
        if (o.cells) {
          const nU = Math.max(1, Math.round(w / o.cells[0])), nV = Math.max(1, Math.round(sy / o.cells[1]));
          const ou = (o.cu ?? 0) / per, ov = (o.cv ?? 0) / per;
          return [ou, ov, ou + nU / per, ov + nV / per];
        }
        if (o.uv) return [0, 0, w / o.uv[0], sy / o.uv[1]];
        return o.rect ?? [0, 0, 1, 1];
      };
      const uz = uvFor(sx), ux = uvFor(sz);
      this.quad(mat, P(-hx, y0, hz), P(hx, y0, hz), P(hx, y1, hz), P(-hx, y1, hz), [s, 0, c], uz, col);
      this.quad(mat, P(hx, y0, -hz), P(-hx, y0, -hz), P(-hx, y1, -hz), P(hx, y1, -hz), [-s, 0, -c], uz, col);
      this.quad(mat, P(hx, y0, hz), P(hx, y0, -hz), P(hx, y1, -hz), P(hx, y1, hz), [c, 0, -s], ux, col);
      this.quad(mat, P(-hx, y0, -hz), P(-hx, y0, hz), P(-hx, y1, hz), P(-hx, y1, -hz), [-c, 0, s], ux, col);
    }
    const top = o.top === undefined ? mat : o.top;
    const m = o.topUV ?? 4;
    const tcol = o.topColor !== undefined ? lin(o.topColor) : o.top === undefined || o.top === mat ? col : lin(0xffffff);
    if (top) this.quad(top, P(-hx, y1, hz), P(hx, y1, hz), P(hx, y1, -hz), P(-hx, y1, -hz), [0, 1, 0], [0, 0, sx / m, sz / m], tcol);
    if (o.bottom) this.quad(top || mat, P(-hx, y0, -hz), P(hx, y0, -hz), P(hx, y0, hz), P(-hx, y0, hz), [0, -1, 0], [0, 0, sx / m, sz / m], tcol);
    if (o.solid) this.solid(x, y, z, sx, sy, sz, o.rot || 0);
    return this;
  }

  /** Rectángulo tendido en el suelo (marcas, césped, charcos de luz). `uv`: metros por repetición o recorte fijo en `rect`. */
  hquad(mat, x, y, z, sx, sz, o = {}) {
    this.box(null, x, y, z, sx, 0, sz, { rot: o.rot, sides: false, top: mat, topColor: o.color ?? 0xffffff, topUV: o.uv ?? 4 });
    if (o.rect) this.fixLast(mat, o.rect);
    return this;
  }

  /** Cambia las UV de la última cara escrita en `mat` por un recorte fijo. */
  fixLast(mat, [u0, v0, u1, v1]) {
    const b = this.bucket(mat), i = b.uv.length - 8;
    b.uv.splice(i, 8, u0, v0, u1, v0, u1, v1, u0, v1);
    return this;
  }

  /** Rectángulo vertical de `w` × `h` con la base centrada en (x, y, z), mirando a +Z local (más `rot`). */
  vquad(mat, x, y, z, w, h, o = {}) {
    const R = this.f.r + (o.rot || 0), c = Math.cos(R), s = Math.sin(R);
    const [cx, cy, cz] = this.at(x, y, z);
    const P = (lx, yy) => [cx + lx * c, yy, cz - lx * s];
    const col = lin(o.color ?? 0xffffff), uv = o.rect ?? (o.uv ? [0, 0, w / o.uv[0], h / o.uv[1]] : [0, 0, 1, 1]);
    this.quad(mat, P(-w / 2, cy), P(w / 2, cy), P(w / 2, cy + h), P(-w / 2, cy + h), [s, 0, c], uv, col);
    if (o.both) this.quad(mat, P(w / 2, cy), P(-w / 2, cy), P(-w / 2, cy + h), P(w / 2, cy + h), [-s, 0, -c], uv, col);
    return this;
  }

  /**
   * Tejado a dos aguas: cumbrera a lo largo de X local, base (sx × sz) en `y` y altura `h`.
   * `gable`: material de los hastiales (los triángulos de los extremos) y `gableColor`.
   */
  prism(mat, x, y, z, sx, sz, h, o = {}) {
    const R = this.f.r + (o.rot || 0), c = Math.cos(R), s = Math.sin(R);
    const [cx, cy, cz] = this.at(x, y, z);
    const hx = sx / 2, hz = sz / 2, y1 = cy + h;
    const P = (lx, yy, lz) => [cx + lx * c + lz * s, yy, cz - lx * s + lz * c];
    const N = (lx, ly, lz) => [lx * c + lz * s, ly, -lx * s + lz * c];
    const col = lin(o.color ?? 0xffffff), len = Math.hypot(hz, h), m = o.uv ?? 2.4;
    const uv = [0, 0, sx / m, len / m];
    this.quad(mat, P(-hx, cy, hz), P(hx, cy, hz), P(hx, y1, 0), P(-hx, y1, 0), N(0, hz / len, h / len), uv, col);
    this.quad(mat, P(hx, cy, -hz), P(-hx, cy, -hz), P(-hx, y1, 0), P(hx, y1, 0), N(0, hz / len, -h / len), uv, col);
    const gm = o.gable ?? mat, gc = lin(o.gableColor ?? o.color ?? 0xffffff);
    this.tri(gm, P(hx, cy, hz), P(hx, cy, -hz), P(hx, y1, 0), N(1, 0, 0), gc);
    this.tri(gm, P(-hx, cy, -hz), P(-hx, cy, hz), P(-hx, y1, 0), N(-1, 0, 0), gc);
    return this;
  }

  /**
   * Cuña: plano inclinado que sube de `y` (en z = -sz/2) a `y + h` (en z = +sz/2), con su cara
   * vertical detrás (`back`: su material) y los dos triángulos laterales. Toldos y dientes de sierra.
   */
  wedge(mat, x, y, z, sx, sz, h, o = {}) {
    const R = this.f.r + (o.rot || 0), c = Math.cos(R), s = Math.sin(R);
    const [cx, cy, cz] = this.at(x, y, z);
    const hx = sx / 2, hz = sz / 2, y1 = cy + h;
    const P = (lx, yy, lz) => [cx + lx * c + lz * s, yy, cz - lx * s + lz * c];
    const N = (lx, ly, lz) => [lx * c + lz * s, ly, -lx * s + lz * c];
    const col = lin(o.color ?? 0xffffff), len = Math.hypot(sz, h), m = o.uv ?? 2.4;
    this.quad(mat, P(hx, cy, -hz), P(-hx, cy, -hz), P(-hx, y1, hz), P(hx, y1, hz), N(0, sz / len, -h / len), [0, 0, sx / m, len / m], col);
    const bm = o.back ?? mat, bc = lin(o.backColor ?? o.color ?? 0xffffff);
    this.quad(bm, P(-hx, cy, hz), P(hx, cy, hz), P(hx, y1, hz), P(-hx, y1, hz), N(0, 0, 1), o.backRect ?? [0, 0, sx / m, h / m], bc);
    this.tri(o.side ?? mat, P(hx, cy, hz), P(hx, cy, -hz), P(hx, y1, hz), N(1, 0, 0), col);
    this.tri(o.side ?? mat, P(-hx, cy, -hz), P(-hx, cy, hz), P(-hx, y1, hz), N(-1, 0, 0), col);
    if (o.bottom) this.quad(mat, P(-hx, cy, -hz), P(hx, cy, -hz), P(hx, cy, hz), P(-hx, cy, hz), [0, -1, 0], [0, 0, 1, 1], col);
    return this;
  }

  /**
   * Cilindro (o cono, con `r2`) desde (x, y, z) a lo largo de `axis` ('y' por defecto, 'x' o
   * 'z' locales): radio `r`, longitud `h`, `sides` caras (`phase` las gira). `solid` lo hace chocar (solo en vertical).
   */
  cyl(mat, x, y, z, r, h, o = {}) {
    const f = this.f, sides = o.sides ?? 10, r2 = o.r2 ?? r, axis = o.axis ?? 'y', ph = o.phase ?? 0;
    const [cx, cy, cz] = this.at(x, y, z);
    const X = [f.c, 0, -f.s], Z = [f.s, 0, f.c], Y = [0, 1, 0];
    const [a, u, v] = axis === 'y' ? [Y, Z, X] : axis === 'x' ? [X, Y, Z] : [Z, X, Y];
    const col = lin(o.color ?? 0xffffff);
    const b = this.bucket(mat), base = b.n;
    const slope = (r - r2) / h, nl = Math.hypot(1, slope);
    for (let i = 0; i <= sides; i++) {
      const t = (i / sides) * Math.PI * 2 + ph, ct = Math.cos(t), st = Math.sin(t);
      const d = [u[0] * ct + v[0] * st, u[1] * ct + v[1] * st, u[2] * ct + v[2] * st];
      b.pos.push(cx + d[0] * r, cy + d[1] * r, cz + d[2] * r, cx + a[0] * h + d[0] * r2, cy + a[1] * h + d[1] * r2, cz + a[2] * h + d[2] * r2);
      const n = [(d[0] + a[0] * slope) / nl, (d[1] + a[1] * slope) / nl, (d[2] + a[2] * slope) / nl];
      b.nor.push(...n, ...n);
      b.col.push(...col, ...col);
      const m = o.uv ?? 0;
      b.uv.push(m ? (i / sides) * (2 * Math.PI * r) / m : i / sides, 0, m ? (i / sides) * (2 * Math.PI * r) / m : i / sides, m ? h / m : 1);
      if (i < sides) b.idx.push(base + i * 2, base + i * 2 + 2, base + i * 2 + 3, base + i * 2, base + i * 2 + 3, base + i * 2 + 1);
    }
    b.n += (sides + 1) * 2;
    if (o.cap !== false && r2 > 0.001) {
      // Tapa del extremo (la del origen queda contra el suelo o contra otra pieza).
      const c0 = b.n, cc = lin(o.capColor ?? o.color ?? 0xffffff);
      b.pos.push(cx + a[0] * h, cy + a[1] * h, cz + a[2] * h);
      b.nor.push(...a); b.col.push(...cc); b.uv.push(0.5, 0.5);
      for (let i = 0; i <= sides; i++) {
        const t = (i / sides) * Math.PI * 2 + ph, ct = Math.cos(t), st = Math.sin(t);
        b.pos.push(cx + a[0] * h + (u[0] * ct + v[0] * st) * r2, cy + a[1] * h + (u[1] * ct + v[1] * st) * r2, cz + a[2] * h + (u[2] * ct + v[2] * st) * r2);
        b.nor.push(...a); b.col.push(...cc); b.uv.push(0.5 + ct * 0.5, 0.5 + st * 0.5);
        if (i < sides) b.idx.push(c0, c0 + 1 + i, c0 + 2 + i);
      }
      b.n += sides + 2;
    }
    if (o.both) { // tapa del origen (ruedas, tubos tumbados)
      const c0 = b.n, cc = lin(o.capColor ?? o.color ?? 0xffffff);
      b.pos.push(cx, cy, cz);
      b.nor.push(-a[0], -a[1], -a[2]); b.col.push(...cc); b.uv.push(0.5, 0.5);
      for (let i = 0; i <= sides; i++) {
        const t = (i / sides) * Math.PI * 2 + ph, ct = Math.cos(t), st = Math.sin(t);
        b.pos.push(cx + (u[0] * ct + v[0] * st) * r, cy + (u[1] * ct + v[1] * st) * r, cz + (u[2] * ct + v[2] * st) * r);
        b.nor.push(-a[0], -a[1], -a[2]); b.col.push(...cc); b.uv.push(0.5 + ct * 0.5, 0.5 + st * 0.5);
        if (i < sides) b.idx.push(c0, c0 + 2 + i, c0 + 1 + i);
      }
      b.n += sides + 2;
    }
    if (o.solid && axis === 'y') {
      this.world.createCollider(RAPIER.ColliderDesc.cylinder(h / 2, Math.max(r, r2)).setTranslation(cx, cy + h / 2, cz), this.body);
      this.solids++;
    }
    return this;
  }

  /** Poliedro irregular de caras planas (copas de árbol, arbustos, montones): centro (x, y, z) y radio `r`. */
  blob(mat, x, y, z, r, o = {}) {
    const [cx, cy, cz] = this.at(x, y, z);
    const col = lin(o.color ?? 0xffffff), b = this.bucket(mat), sy = o.sy ?? 1;
    const seed = o.seed ?? 1;
    const jit = (i) => 0.78 + 0.44 * (Math.abs(Math.sin((ICO.getX(i) * 12.9898 + ICO.getY(i) * 78.233 + ICO.getZ(i) * 37.719 + seed) * 43758.5453)) % 1);
    for (let i = 0; i < ICO.count; i += 3) {
      const p = [0, 1, 2].map((k) => {
        const j = jit(i + k);
        return [cx + ICO.getX(i + k) * r * j, cy + ICO.getY(i + k) * r * j * sy, cz + ICO.getZ(i + k) * r * j];
      });
      const ax = p[1][0] - p[0][0], ay = p[1][1] - p[0][1], az = p[1][2] - p[0][2];
      const bx = p[2][0] - p[0][0], by = p[2][1] - p[0][1], bz = p[2][2] - p[0][2];
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      // Tono algo distinto por cara: las de arriba más claras.
      const k = 0.82 + 0.28 * Math.max(0, ny);
      this.tri(mat, p[0], p[1], p[2], [nx, ny, nz], [col[0] * k, col[1] * k, col[2] * k]);
    }
    return this;
  }

  /** Bloque que choca (sin dibujo): base centrada en (x, y, z). */
  solid(x, y, z, sx, sy, sz, rot = 0) {
    const [cx, cy, cz] = this.at(x, y, z), R = this.f.r + rot;
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2).setTranslation(cx, cy + sy / 2, cz)
        .setRotation({ x: 0, y: Math.sin(R / 2), z: 0, w: Math.cos(R / 2) }),
      this.body,
    );
    this.solids++;
    return this;
  }

  /** Crea las mallas (una por material) dentro de `parent` y devuelve cuántos triángulos suman. */
  build(parent) {
    let tris = 0;
    for (const [mat, b] of this.buckets) {
      if (!b.n) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      g.setIndex(b.n > 65535 ? new THREE.Uint32BufferAttribute(b.idx, 1) : new THREE.Uint16BufferAttribute(b.idx, 1));
      const mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = !mat.userData.noShadow;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      parent.add(mesh);
      tris += b.idx.length / 3;
    }
    this.buckets.clear();
    return tris;
  }
}
