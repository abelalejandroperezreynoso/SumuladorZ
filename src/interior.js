import * as THREE from 'three';
import { RAPIER } from './physics.js';
import { HOUSE_TUNING } from './house.js';

// Edificios de la ciudad en los que se puede entrar: tiendas, casas, el supermercado, la
// comisaría… Sus muros se levantan por piezas alrededor de los huecos, como los de la casa del
// mundo de simulación, y cada hueco es de un tipo:
//   door    puerta abierta: se pasa andando.
//   window  ventana con alféizar y cristal: rota, se pasa como una barda (y los zombis trepan).
//   front   escaparate de suelo a dintel: roto, se entra andando.
// Los cristales se rompen de un balazo, de un golpe o cuando un zombi los revienta para pasar.
const H = HOUSE_TUNING.HOUSE, ENTRY = HOUSE_TUNING.ENTRY, GLASS = HOUSE_TUNING.GLASS;
export const INTERIOR = {
  muro: H.muro, alto: 2.9,
  window: { w: H.ventana.ancho, y0: H.ventana.bajo, y1: H.ventana.alto },
  front: { w: 2.5, y0: 0, y1: 2.5 },
  door: { w: 1.15, y0: 0, y1: 2.1 },
};

/** Todos los cristales de la ciudad: una sola malla, y cada paño con su bloque de choque. */
export class Glass {
  constructor(scene, physics) {
    this.scene = scene;
    this.physics = physics;
    this.panes = [];
    this.shards = [];
    this.broken = 0;
    this.mesh = null;
    this.material = new THREE.MeshStandardMaterial({ color: 0xa9dcee, transparent: true, opacity: 0.3, roughness: 0.08, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false });
    this.shardGeo = new THREE.TetrahedronGeometry(0.05);
    this.shardMat = new THREE.MeshStandardMaterial({ color: 0xcfeefa, transparent: true, opacity: 0.7, roughness: 0.1, flatShading: true });
  }

  /** Paño centrado en (x, z), de `w` de ancho entre las alturas y0 e y1, con la normal (nx, nz) hacia fuera. */
  add(x, z, y0, y1, w, nx, nz, kind) {
    const world = this.physics.world;
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, (y0 + y1) / 2, z));
    const yaw = Math.atan2(nx, nz);
    const collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(w / 2, (y1 - y0) / 2, GLASS.grosor / 2).setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }), body);
    const pane = { x, z, y0, y1, w, nx, nz, kind, collider, broken: false, busy: 0, index: this.panes.length };
    this.physics.meta.set(collider.handle, { body, glass: true, break: (dir) => this.break(pane, dir) });
    this.panes.push(pane);
    return pane;
  }

  /** Crea la malla con todos los paños añadidos. */
  build(parent) {
    const pos = [], idx = [];
    for (const p of this.panes) {
      const tx = -p.nz * p.w / 2, tz = p.nx * p.w / 2, n = pos.length / 3;
      pos.push(p.x - tx, p.y0, p.z - tz, p.x + tx, p.y0, p.z + tz, p.x + tx, p.y1, p.z + tz, p.x - tx, p.y1, p.z - tz);
      idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    this.base = Float32Array.from(pos);
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.renderOrder = 2;
    parent.add(this.mesh);
  }

  /** Rompe un paño: deja de estorbar, desaparece y saltan trozos hacia `dir` (o hacia los dos lados). */
  break(pane, dir = null) {
    if (pane.broken) return false;
    pane.broken = true;
    this.broken++;
    pane.collider.setEnabled(false);
    const a = this.mesh.geometry.attributes.position, i = pane.index * 4;
    for (let k = 0; k < 4; k++) a.setXYZ(i + k, pane.x, pane.y0, pane.z); // sin área: no se dibuja
    a.needsUpdate = true;
    const tx = -pane.nz, tz = pane.nx;
    const push = dir ? Math.sign(dir.x * pane.nx + dir.z * pane.nz) || 1 : 0;
    const n = Math.round(GLASS.trozos * Math.min(2, pane.w / 1.3));
    for (let k = 0; k < n; k++) {
      const mesh = new THREE.Mesh(this.shardGeo, this.shardMat);
      const s = (Math.random() - 0.5) * pane.w, out = (push || (k % 2 ? 1 : -1)) * (0.6 + 2.2 * Math.random());
      mesh.position.set(pane.x + tx * s, pane.y0 + Math.random() * (pane.y1 - pane.y0), pane.z + tz * s);
      mesh.rotation.set(Math.random() * 6, Math.random() * 6, 0);
      mesh.scale.setScalar(0.6 + Math.random());
      this.scene.add(mesh);
      this.shards.push({ mesh, floor: pane.kind === 'window' ? pane.y0 - INTERIOR.window.y0 : pane.y0, vx: pane.nx * out + tx * (Math.random() - 0.5), vy: 1.5 * Math.random(), vz: pane.nz * out + tz * (Math.random() - 0.5), t: 0 });
    }
    return true;
  }

  /** Repone todos los cristales (partida nueva). */
  reset() {
    if (!this.broken) return;
    const a = this.mesh.geometry.attributes.position;
    a.array.set(this.base);
    a.needsUpdate = true;
    for (const p of this.panes) {
      p.broken = false;
      p.busy = 0;
      p.collider.setEnabled(true);
    }
    this.broken = 0;
  }

  update(dt) {
    for (const p of this.panes) if (p.busy > 0) p.busy -= dt;
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i], m = s.mesh;
      s.t += dt / GLASS.vida;
      if (s.t >= 1) { this.scene.remove(m); this.shards.splice(i, 1); continue; }
      s.vy -= 12 * dt;
      m.position.x += s.vx * dt; m.position.y += s.vy * dt; m.position.z += s.vz * dt;
      if (m.position.y < s.floor + 0.03) { m.position.y = s.floor + 0.03; s.vy = 0; s.vx *= 0.8; s.vz *= 0.8; }
      else { m.rotation.x += 8 * dt; m.rotation.z += 6 * dt; }
      if (s.t > 0.7) m.scale.multiplyScalar(Math.exp(-6 * dt));
    }
  }
}

/** Recinto rectangular en el que se entra: sabe si un punto está dentro y por qué hueco cruza un zombi. */
export class Interior {
  constructor(glass, x, z, r, w, d) {
    Object.assign(this, { glass, x, z, w, d });
    this.c = Math.cos(r);
    this.s = Math.sin(r);
    this.openings = []; // puertas ({ x, z, nx, nz, kind: 'door' }) y paños de cristal
    this.reach = Math.hypot(w, d) / 2 + 2;
  }

  /** ¿Está el punto dentro? (Dentro del muro no cuenta.) */
  inside(p) {
    const dx = p.x - this.x, dz = p.z - this.z;
    if (Math.abs(dx) > this.reach || Math.abs(dz) > this.reach) return false;
    const lx = dx * this.c - dz * this.s, lz = dx * this.s + dz * this.c;
    return Math.abs(lx) < this.w / 2 - INTERIOR.muro && Math.abs(lz) < this.d / 2 - INTERIOR.muro;
  }

  breakGlass(w, dir) {
    return this.glass.break(w, dir);
  }

  /**
   * Por dónde cruza un zombi el muro para llegar de `pos` a `target` cuando uno está dentro y
   * el otro fuera (como `House.route`): adónde ir ahora y, plantado ante un cristal, `window`
   * para que lo reviente; `walk` si después se pasa andando (escaparate) en vez de trepando.
   */
  route(pos, target, crawler = false) {
    const a = this.inside(pos);
    if (a === this.inside(target)) return null;
    const side = a ? -1 : 1, E = ENTRY;
    let best = null, cost = Infinity;
    for (const o of this.openings) {
      if (crawler && o.kind === 'window') continue;
      const c = Math.hypot(o.x - pos.x, o.z - pos.z) + Math.hypot(o.x - target.x, o.z - target.z)
        + (o.busy > 0 ? 2 : 0) + (o.kind === 'window' ? 1.5 : o.kind === 'front' && !o.broken ? 0.8 : 0);
      if (c < cost) { cost = c; best = o; }
    }
    if (!best) return null;
    const ax = best.x + best.nx * side * E.frente, az = best.z + best.nz * side * E.frente;
    const d = Math.hypot(ax - pos.x, az - pos.z);
    if (best.kind === 'door' || (best.kind === 'front' && best.broken)) {
      // Ya en el paso (o ante él): sigue recto hasta el otro lado.
      const rx = pos.x - best.x, rz = pos.z - best.z;
      const lateral = Math.abs(rx * best.nz - rz * best.nx), depth = Math.abs(rx * best.nx + rz * best.nz);
      if (d < 0.5 || (lateral < (best.kind === 'front' ? best.w / 2 - 0.3 : E.pasillo) && depth < 1)) return { x: best.x - best.nx * side, z: best.z - best.nz * side };
      return { x: ax, z: az };
    }
    return { x: ax, z: az, window: d < E.cerca && best.busy <= 0 ? best : null, side, walk: best.kind === 'front', house: this };
  }
}

/**
 * Levanta un recinto de w × d (fachada hacia +Z, centrado en el marco actual de `G.b`) con
 * muros de `h` de alto y los huecos de `sides`: { front, right, back, left }, cada uno una
 * lista de { at (centro, a lo largo del muro), kind, w? }. Devuelve su `Interior`.
 * Opciones: `mat` y `color` del muro, `floor` (material del suelo), `floorColor`, `ceiling`
 * (false para no ponerlo) y `trim` (color de los marcos).
 */
export function room(G, w, d, o = {}) {
  const { b, M } = G, t = INTERIOR.muro, h = o.h ?? INTERIOR.alto;
  const mat = o.mat ?? M.concrete, color = o.color ?? 0xe8e2d4, trim = o.trim ?? 0xf4f1e8;
  const [wx, , wz] = b.at(0, 0, 0);
  const it = new Interior(G.glass, wx, wz, b.f.r, w, d);
  G.interiors.push(it);
  const walls = [['front', 0, w, d], ['right', Math.PI / 2, d - 2 * t, w], ['back', Math.PI, w, d], ['left', -Math.PI / 2, d - 2 * t, w]];
  for (const [name, rot, len, depth] of walls) {
    b.push(0, 0, rot);
    const z = depth / 2 - t / 2, R = b.f.r, nx = Math.sin(R), nz = Math.cos(R);
    const piece = (x0, x1, y0, y1) => {
      if (x1 - x0 < 0.02 || y1 - y0 < 0.02) return;
      b.box(mat, (x0 + x1) / 2, y0, z, x1 - x0, y1 - y0, t, { color, uv: [3, 3], solid: true });
    };
    let at = -len / 2;
    const holes = (o.sides?.[name] ?? []).map((q) => ({ ...INTERIOR[q.kind], ...q })).sort((p, q) => p.at - q.at);
    for (const q of holes) {
      piece(at, q.at - q.w / 2, 0, h);
      piece(q.at - q.w / 2, q.at + q.w / 2, 0, q.y0);
      piece(q.at - q.w / 2, q.at + q.w / 2, q.y1, h);
      at = q.at + q.w / 2;
      const [x, y, zz] = b.at(q.at, 0, z);
      if (q.kind === 'door') it.openings.push({ x, z: zz, nx, nz, kind: 'door', busy: 0 });
      else it.openings.push(G.glass.add(x, zz, y + q.y0, y + q.y1, q.w, nx, nz, q.kind));
      // Marco: jambas, dintel y alféizar (o umbral).
      const dark = q.kind === 'front' ? 0x2b2f33 : trim, f = 0.07;
      for (const s of [-1, 1]) b.box(M.plain, q.at + s * (q.w / 2 - f / 2), q.y0, z, f, q.y1 - q.y0, t + 0.06, { color: dark, top: false });
      b.box(M.plain, q.at, q.y1 - f, z, q.w, f, t + 0.06, { color: dark, bottom: true, top: false });
      if (q.kind === 'window') b.box(M.plain, q.at, q.y0 - 0.05, z + 0.04, q.w + 0.16, 0.06, t + 0.16, { color: trim, bottom: true });
      if (q.kind === 'door' && q.leaf !== false) b.box(M.plain, q.at - q.w / 2 + 0.03, 0, z - t / 2 - q.w / 2 + 0.05, 0.05, q.y1 - 0.05, q.w - 0.1, { color: q.leafColor ?? 0x6b4a2f }); // hoja abierta hacia dentro
    }
    piece(at, len / 2, 0, h);
    b.pop();
  }
  b.hquad(o.floor ?? M.concrete, 0, 0.02, 0, w - 2 * t, d - 2 * t, { uv: 3, color: o.floorColor ?? 0x9a8f80 });
  if (o.ceiling !== false) b.box(M.plain, 0, h, 0, w, 0.2, d, { color: 0xe9e4d8, bottom: true, under: M.plain, top: o.top ?? M.roof, topColor: 0xffffff, solid: true });
  return it;
}
