import { rng } from './city-textures.js';
import { house, apartments, shopRow, warehouse, DETAIL, BLOCKS } from './city-blocks.js';
import { archBridge, trussBridge, footbridge } from './city-bridges.js';
import { TERRAIN } from './city-terrain.js';
import {
  pick, rr, lamp, post, tree, pine, bush, bench, bin, dumpster, crate, barrel, barrier, sandbags, cone, chainFence, car, container, silo,
} from './city-props.js';

// Las afueras: lo que rodea a la cuadrícula del centro hasta el límite de la ciudad. Aquí las
// calles no son rectas ni llanas: cada una es una curva (una lista de puntos por los que pasa)
// tendida sobre el relieve (src/city-terrain.js), y los solares se reparten a sus lados,
// mirando a la calzada, cada uno en su explanada.
//   este    el cerro: una calle que sube en cuesta, casas arriba y la iglesia en lo alto
//   sur     el río, con dos puentes (uno de piedra, en lomo, y uno de hierro), y al otro lado
//           una urbanización de casas con jardín y la carretera de salida, cortada
//   norte   la vía del tren (dos pasos a nivel y una pasarela peatonal) y el polígono industrial
//   oeste   casco antiguo: callejuelas estrechas entre casas de pisos y tiendas
// Fuera del límite queda el campo: lomas con pinares.

/** Por dónde va el río (de oeste a este, al sur del centro). */
export const riverPath = () => curve([[-330, 152], [-210, 138], [-120, 128], [-40, 124], [30, 127], [100, 123], [170, 133], [240, 150], [330, 160]], 6);
/** Pendiente a partir de la cual una calle lleva quitamiedos (tanto por uno). */
const STEEP = 0.05;

/** Curva suave (Catmull-Rom) por los puntos [[x, z]…], muestreada cada `step` m: [{ x, z, tx, tz, s }]. */
export function curve(points, step = 3) {
  const P = points.map(([x, z]) => ({ x, z })), out = [];
  const at = (i) => P[Math.max(0, Math.min(P.length - 1, i))];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const n = Math.max(2, Math.round(Math.hypot(p2.x - p1.x, p2.z - p1.z) / step));
    for (let k = i ? 1 : 0; k <= n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), z: f(p0.z, p1.z, p2.z, p3.z) });
    }
  }
  let s = 0;
  out.forEach((p, i) => {
    const a = out[Math.max(0, i - 1)], c = out[Math.min(out.length - 1, i + 1)], l = Math.hypot(c.x - a.x, c.z - a.z) || 1;
    if (i) s += Math.hypot(p.x - out[i - 1].x, p.z - out[i - 1].z);
    Object.assign(p, { tx: (c.x - a.x) / l, tz: (c.z - a.z) / l, s });
  });
  return out;
}

/** Punto de la curva a la distancia `s` de su principio. */
export function along(path, s) {
  let i = 1;
  while (i < path.length - 1 && path[i].s < s) i++;
  const a = path[i - 1], c = path[i], k = (s - a.s) / Math.max(1e-6, c.s - a.s);
  return { x: a.x + (c.x - a.x) * k, z: a.z + (c.z - a.z) * k, tx: c.tx, tz: c.tz };
}

/** Deja algo en (x, z) a la altura del suelo: `fn` dibuja con el marco ahí, girado `rot`. */
function put(G, x, z, rot, fn) {
  G.b.push(x, z, rot, G.T.at(x, z));
  fn();
  G.b.pop();
}

/**
 * Calzada a lo largo de una curva, ceñida al relieve: asfalto (o adoquín), línea central,
 * aceras, farolas alternas y, donde va en cuesta, quitamiedos a los dos lados.
 */
function street(G, path, w, o = {}) {
  const { b, M, T } = G, walk = o.walk ?? 1.6, drape = (x, z) => T.at(x, z);
  b.strip(o.cobble ? M.pavers : M.asphalt, path, w, 0.015, { uv: o.cobble ? 3 : 6, color: o.color, drape });
  if (walk) for (const s of [-1, 1]) b.strip(M.sidewalk, path, walk, 0.03, { offset: s * (w / 2 + walk / 2), uv: 3, drape });
  const len = path[path.length - 1].s;
  if (o.dash !== false) {
    for (let s = 3; s < len - 3; s += 6) {
      const p = along(path, s);
      b.strip(M.mark, [{ x: p.x - p.tx * 1.5, z: p.z - p.tz * 1.5 }, { x: p.x + p.tx * 1.5, z: p.z + p.tz * 1.5 }], 0.16, 0.03, { color: 0xd9b23c, drape });
    }
  }
  const every = o.lamps ?? 30;
  for (let s = every / 2, k = 0; every && s < len; s += every, k++) {
    const p = along(path, s), side = k % 2 ? 1 : -1, d = w / 2 + walk * 0.6;
    const x = p.x - p.tz * side * d, z = p.z + p.tx * side * d, flat = T.slope(x, z) < 0.02;
    // (El brazo de la farola mira a la calzada. En cuesta, el charco de luz se tiende sobre el suelo.)
    put(G, x, z, Math.atan2(p.tz * side, -p.tx * side), () => lamp(G, 0, 0, 0, o.lampH ?? 6.2, 1.4, flat));
    if (!flat) {
      const cx = x + p.tz * side * 1.4, cz = z - p.tx * side * 1.4;
      b.strip(M.pool, [-6, 0, 6].map((t) => ({ x: cx + p.tx * t, z: cz + p.tz * t })), 12, 0.05, { uv: 12, drape, across: 2 });
    }
  }
  if (o.rails === false) return;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], c = path[i];
    if (Math.abs(T.at(c.x, c.z) - T.at(a.x, a.z)) / (c.s - a.s) < STEEP) continue;
    for (const side of [-1, 1]) {
      const d = side * (w / 2 + walk + 0.35);
      const ax = a.x - a.tz * d, az = a.z + a.tx * d, cx = c.x - c.tz * d, cz = c.z + c.tx * d, ya = T.at(ax, az), yc = T.at(cx, cz);
      b.slab(M.plain, ax, ya + 0.78, az, cx, yc + 0.78, cz, 0.08, 0.3, { color: 0xb9bec4, ends: false });
      b.slab(null, ax, ya + 0.78, az, cx, yc + 0.78, cz, 0.12, 0.78, { solid: true });
      b.box(M.plain, ax, ya, az, 0.12, 0.6, 0.12, { color: 0x6f7479, top: false });
    }
  }
}

/** Poste de la luz con travesaño; `wire`: hasta dónde lleva el cable ({ x, z }). */
function pole(G, x, z, wire = null) {
  const { b, M } = G;
  b.box(M.plain, x, 0, z, 0.2, 8, 0.2, { color: 0x5a4330, solid: true });
  b.box(M.plain, x, 7.3, z, 1.6, 0.12, 0.12, { color: 0x5a4330 });
  if (!wire) return;
  const len = Math.hypot(wire.x - x, wire.z - z), rot = Math.atan2(-(wire.z - z), wire.x - x);
  for (const s of [-0.65, 0.65]) b.box(M.plain, (x + wire.x) / 2, 7.25 + s * 0.02, (z + wire.z) / 2 + s, len, 0.025, 0.025, { rot, color: 0x1c1c1f, top: false });
}

/** Tendedero de fachada a fachada sobre un callejón (a lo largo de X local). */
function clothesline(G, x, z, rot, len) {
  const { b, M, R } = G;
  b.push(x, z, rot);
  b.box(M.plain, 0, 4.6, 0, len, 0.02, 0.02, { color: 0xe8e8e4 });
  for (let k = -len / 2 + 0.6; k < len / 2 - 0.5; k += 0.75) {
    if (R() < 0.3) continue;
    b.vquad(M.plain, k, 3.95 + R() * 0.2, 0, 0.55, 0.62, { color: pick(R, [0xe8e8e4, 0xc8322b, 0x2a4d8f, 0xd6a21e, 0x8fb277, 0xe8b0c0]), both: true });
  }
  b.pop();
}

/** Vagones parados en la vía (a lo largo de X local): locomotora, cerrados, cisternas y plataformas. */
function train(G, x, z, rot) {
  const { b, M, R } = G;
  b.push(x, z, rot);
  let at = -40;
  const bogies = (len) => { for (const s of [-len / 2 + 1.6, len / 2 - 1.6]) for (const w of [-0.75, 0.75]) b.cyl(M.plain, at + s, 0.5, w - 0.1, 0.45, 0.2, { axis: 'z', sides: 10, color: 0x1c1c1f, both: true }); };
  // Locomotora.
  b.box(M.plain, at, 0.7, 0, 14, 2.6, 2.9, { color: 0xb5532a });
  b.box(M.plain, at - 4.5, 3.3, 0, 3.4, 1.0, 2.7, { color: 0x8a3a2a });
  b.box(M.plain, at - 4.5, 3.45, 0, 3.44, 0.55, 2.74, { color: 0x1a2229, top: false });
  b.box(M.plain, at, 0.9, 0, 14.06, 0.3, 2.94, { color: 0xd9b23c, top: false });
  b.solid(at, 0, 0, 14, 4.3, 2.9); bogies(14);
  at += 15.5;
  for (let i = 0; i < 6; i++) {
    const kind = pick(R, ['caja', 'caja', 'cisterna', 'plataforma']);
    if (kind === 'caja') {
      b.box(M.metal, at, 0.9, 0, 13, 3.1, 2.8, { color: pick(R, [0x8a3a2a, 0x3d6f9a, 0x4f5a3a, 0x9a968e, 0xc9a23c]), uv: [1.3, 3.1], top: M.plain, topColor: 0x4a4f55 });
      b.box(M.plain, at, 1.0, 1.42, 2.6, 2.8, 0.05, { color: 0x30343a, top: false });
      b.solid(at, 0, 0, 13, 4, 2.8);
    } else if (kind === 'cisterna') {
      b.cyl(M.plain, at - 6, 2.3, 0, 1.35, 12, { axis: 'x', sides: 12, color: pick(R, [0xe4e4e0, 0x1c1c1f, 0xb9c0c6]), both: true });
      b.box(M.plain, at, 0.7, 0, 12.6, 0.3, 2.4, { color: 0x1c1c1f });
      b.cyl(M.plain, at, 3.6, 0, 0.4, 0.3, { sides: 8, color: 0x8f959b });
      b.solid(at, 0, 0, 12.6, 3.7, 2.7);
    } else {
      b.box(M.plain, at, 0.7, 0, 13, 0.35, 2.8, { color: 0x4a4f55, solid: true });
      b.solid(at, 0, 0, 13, 1.05, 2.8);
      for (const s of [-3.2, 3.2]) if (R() < 0.8) container(G, at + s, 0, 0, pick(R, [0xb5532a, 0x2a5d8f, 0x3d7a4a, 0xc9a23c]), 1.05);
    }
    bogies(13);
    at += 14.2;
  }
  b.pop();
}

// Solares del polígono industrial (30 × 26 m, mirando a la calle).
const INDUSTRY = [
  (G) => { G.b.push(0, -2, 0); warehouse(G, 26, 18); G.b.pop(); car(G, -6, 10.5, 0.1, { kind: 'camion' }); for (let i = 0; i < 3; i++) crate(G, 9 + i * 1.15, 10.5, 1.05); G.b.mark('balas', 10, 0, 12.2); },
  (G) => { // depósitos
    const { b, M, R } = G;
    b.hquad(M.concrete, 0, 0.02, 0, 28, 24, { uv: 5, color: 0x9a968e });
    for (const [x, z] of [[-8, -5], [0, -5], [8, -5], [-4, 3], [4, 3]]) silo(G, x, z, 2.6, rr(R, 8, 13), pick(R, [0xc9cdd1, 0xe4e4e0, 0xb0a090]));
    for (const z of [-5, 3]) b.box(M.plain, 0, 3, z + 2.9, 20, 0.25, 0.25, { color: 0xd9b23c });
    chainFence(G, -14, 11.5, -3, 11.5); chainFence(G, 3, 11.5, 14, 11.5);
    for (let i = 0; i < 4; i++) barrel(G, -11 + i * 0.75, 9, pick(R, [0x2d4a6a, 0x8a3a2a, 0xc9a23c]));
  },
  (G) => { // patio de contenedores con grúa pórtico
    const { b, M, R } = G, colors = [0xb5532a, 0x2a5d8f, 0x3d7a4a, 0x8a3a2a, 0xc9a23c, 0x6a6f78];
    b.hquad(M.asphalt, 0, 0.02, 0, 28, 24, { uv: 6 });
    for (const x of [-9.5, -3, 3.5, 10]) for (const z of [-7, -4.2]) {
      const n = 1 + Math.floor(R() * 3);
      for (let k = 0; k < n; k++) container(G, x, z, rr(R, -0.02, 0.02), pick(R, colors), k * 2.6);
    }
    for (const s of [-12.5, 12.5]) { b.box(M.plain, s, 0, 3, 0.6, 11, 0.6, { color: 0xd9b23c, solid: true }); b.box(M.plain, s, 0, 3, 1.2, 0.5, 3, { color: 0x4a4f55 }); }
    b.box(M.plain, 0, 11, 3, 26.2, 1.0, 1.0, { color: 0xd9b23c });
    b.box(M.plain, 4, 9.6, 3, 2.2, 1.4, 1.8, { color: 0xf0f0ec });
    b.box(M.plain, 4, 5, 3, 0.06, 4.6, 0.06, { color: 0x1c1c1f });
    container(G, 4, 3, 0, pick(R, colors), 2.4);
    car(G, -6, 8.5, 0.2, { kind: 'camion', cargo: 0x2a5d8f });
    b.mark('balas', 9, 0, 8);
  },
  (G) => { // subestación eléctrica
    const { b, M } = G;
    b.hquad(M.concrete, 0, 0.02, 0, 26, 22, { uv: 5, color: 0x8d8a84 });
    for (const x of [-7, 0, 7]) {
      b.box(M.plain, x, 0, -3, 3, 2.6, 2.2, { color: 0x6f7479, solid: true });
      for (const s of [-0.8, 0, 0.8]) { b.cyl(M.plain, x + s, 2.6, -3, 0.14, 1.1, { sides: 8, color: 0xd8d0b8 }); b.cyl(M.plain, x + s, 3.7, -3, 0.2, 0.08, { sides: 8, color: 0x8a3a2a }); }
    }
    for (const x of [-10, 10]) { // torres de alta tensión
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box(M.plain, x + sx * 0.8, 0, 4 + sz * 0.8, 0.14, 16, 0.14, { color: 0x8f959b });
      b.solid(x, 0, 4, 1.8, 6, 1.8);
      for (const y of [11, 13.5, 16]) b.box(M.plain, x, y, 4, 0.14, 0.14, 7 - (y - 11) * 0.6, { color: 0x8f959b });
      for (let y = 2; y < 16; y += 2.5) b.box(M.plain, x, y, 4, 1.7, 0.08, 1.7, { color: 0x8f959b, top: false });
    }
    for (const s of [-2.6, 0, 2.6]) b.box(M.plain, 0, 11.05, 4 + s, 20, 0.03, 0.03, { color: 0x1c1c1f, top: false });
    chainFence(G, -13, 11, 13, 11); chainFence(G, -13, -11, -13, 11); chainFence(G, 13, -11, 13, 11);
    b.vquad(M.details, 0, 0.6, 11.06, 1.5, 1.5, { rect: DETAIL.WARNING });
  },
  (G) => { G.b.push(0, -3, 0); warehouse(G, 22, 16, { saw: true }); G.b.pop(); container(G, 6, 9.5, 0.3, 0x3d7a4a); dumpster(G, -9, 9, 0); car(G, -2, 10, 3.2, { kind: 'van' }); },
];

/**
 * Construye las afueras. `ctx`: { section(semilla, fn(G)) crea un lote de mallas y llama a fn
 * con el marco en el centro de la ciudad; half (mitad del centro), limit (mitad de la ciudad),
 * terrain (el relieve: aquí se piden las explanadas de los solares) y ground() (se llama una
 * vez repartidos los solares: calcula el relieve definitivo y crea el suelo) }.
 */
export function buildOutskirts({ section, half: H, limit: L, terrain: T, ground }) {
  const inside = (x, z) => Math.abs(x) < H + 14 && Math.abs(z) < H + 14; // pisa la cuadrícula del centro
  const far = (x, z) => Math.abs(x) > L - 11 || Math.abs(z) > L - 11 || inside(x, z);
  const home = (G) => house(G, 19.6, 19.6);

  // --- Trazado: todas las calles, antes de repartir nada (los solares no pisan otra calle) ---
  const roads = [];
  const road = (points, w, step) => { const path = curve(points, step); roads.push({ path, w }); return path; };
  // Este: la calle del cerro sube en cuesta, recorre lo alto y baja; un camino lleva a la iglesia.
  const E1 = road([[H, -29], [112, -29], [132, -24], [152, -14], [168, -8], [175, 10], [172, 34], [160, 50], [142, 52], [126, 42], [110, 31], [H, 29]], 7);
  const E2 = road([[167, -14], [169, -24], [168, -35]], 4);
  // Sur: dos calles cruzan el río por sus puentes hasta la avenida del otro lado.
  const BR = [{ x: -29, z0: 109, z1: 141 }, { x: 29, z0: 111, z1: 143 }];
  const SA = [road([[-29, H], [-29, BR[0].z0]], 7), road([[-29, BR[0].z1], [-30, 157], [-29, 173]], 7)];
  const SB = [road([[29, H], [29, BR[1].z0]], 7), road([[29, BR[1].z1], [30, 158], [29, 173]], 7)];
  for (const k of BR) roads.push({ path: curve([[k.x, k.z0], [k.x, k.z1]]), w: 10 });
  const S1 = road([[-170, 176], [-120, 170], [-72, 176], [-29, 173], [0, 174], [29, 173], [72, 176], [120, 170], [170, 176]], 8);
  const S3 = road([[0, 174], [5, 196], [-2, L + 20], [3, L + 70]], 9);
  // Norte: la vía, las dos calles que la cruzan a nivel y la del polígono.
  const rail = road([[-L - 110, -116], [-120, -113], [0, -115], [120, -113], [L + 110, -117]], 7, 6);
  const NA = road([[-29, -H], [-29, -128], [-31, -148], [-29, -162]], 8);
  const NB = road([[29, -H], [29, -128], [31, -148], [29, -162]], 8);
  const N1 = road([[-172, -158], [-120, -166], [-60, -160], [-29, -162], [0, -163], [29, -162], [70, -158], [120, -165], [168, -158]], 9);
  // Oeste: callejuelas del casco antiguo.
  const W1 = road([[-H, -29], [-H - 30, -38], [-H - 58, -18], [-H - 70, 20], [-H - 50, 52], [-H - 18, 44], [-H, 29]], 4.4);
  const W2 = road([[-H - 58, -18], [-H - 70, -62], [-H - 40, -88], [-H, -87]], 4.4);
  const W3 = road([[-H - 70, 20], [-H - 88, 60], [-H - 62, 92], [-H - 20, 96], [-H, 87]], 4.4);
  /** ¿Hay otra calle a menos de `r` m (de su borde) de este punto? */
  const clash = (x, z, r, self) => roads.some((k) => k.path !== self && k.path.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < (r + k.w / 2) ** 2));

  // --- Solares: cada uno pide su explanada; en demasiada pendiente no hay solar ---
  const wild = []; // sitios sin construir junto a una calle
  const plan = (path, o) => {
    const len = path[path.length - 1].s, list = [];
    let i = 0;
    for (let s = o.every / 2 + 4; s < len - o.every / 2 - 2; s += o.every, i++) {
      const p = along(path, s);
      for (const side of [-1, 1]) {
        const nx = -p.tz * side, nz = p.tx * side, x = p.x + nx * o.offset, z = p.z + nz * o.offset; // hacia el solar
        if (clash(x, z, Math.min(o.w, o.d) / 2 + 1.5, path) || o.skip(x, z)) continue;
        const rot = Math.atan2(-nx, -nz), y = T.pad(x, z, rot, o.w, o.d);
        if (y === null) wild.push([x, z]);
        else list.push({ x, z, rot, y, side, i, s });
      }
    }
    return list;
  };
  const HOME = { every: 21.5, offset: 15.6, w: 19.6, d: 19.6, skip: far };
  const taken = [];
  // (Cada casa del casco antiguo aparta el sitio que ocupa: donde dos callejuelas se acercan no se pisan.)
  const free = (x, z) => { if (far(x, z) || taken.some((t) => Math.hypot(t[0] - x, t[1] - z) < 8.2)) return true; taken.push([x, z]); return false; };
  const OLD = { every: 8.6, offset: 7.7, w: 8.4, d: 9, skip: free };
  const lotsE1 = plan(E1, HOME), lotsS1 = plan(S1, HOME);
  const lotsN1 = plan(N1, { every: 33, offset: 19.5, w: 30, d: 26, skip: far });
  const lotsW = [W1, W2, W3].map((path) => plan(path, OLD));
  const church = { x: 176, z: -56, y: T.pad(176, -56, 0, 42, 42, 2) };
  const tower = { x: 192, z: 62, y: T.pad(192, 62, 0, 9, 9, 2) };
  T.pad(150, -3, Math.PI / 2, 10, 6, 3); // mirador
  ground();

  // --- Construcción ---
  // Una calle con sus solares, en varios lotes de mallas (para que se oculten los que no se ven).
  const lined = (seed, path, w, streetOpts, lots, gen, chunk = 110) => {
    section(seed, (G) => street(G, path, w, streetOpts));
    for (let s0 = 0, k = 1; s0 < path[path.length - 1].s; s0 += chunk, k++) {
      const part = lots.filter((l) => l.s >= s0 && l.s < s0 + chunk);
      if (part.length) section(seed + k, (G) => { for (const l of part) { G.b.push(l.x, l.z, l.rot, l.y); gen(G, l.side, l.i); G.b.pop(); } });
    }
  };

  // --- Este: el cerro ---
  lined(5100, E1, 7, { lamps: 26 }, lotsE1, home);
  section(5150, (G) => {
    const { b, M, R } = G;
    street(G, E2, 4, { dash: false, walk: 0, lamps: 0, cobble: true, rails: false });
    for (const s of [6, 18]) { const p = along(E2, s); put(G, p.x + 3, p.z, 0, () => post(G, 0, 0)); }
    if (church.y !== null) { b.push(church.x, church.z, 0, church.y); BLOCKS.iglesia(G); b.pop(); }
    // Depósito de agua en lo alto.
    if (tower.y !== null) {
      b.push(tower.x, tower.z, 0, tower.y);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box(M.plain, sx * 2, 0, sz * 2, 0.3, 12, 0.3, { color: 0x6f7479, solid: true });
      for (const y of [4, 8]) for (const r of [0, Math.PI / 2]) { b.push(0, 0, r); for (const s of [-2, 2]) b.box(M.plain, 0, y, s, 4.2, 0.12, 0.12, { color: 0x6f7479, top: false }); b.pop(); }
      b.cyl(M.metal, 0, 12, 0, 4, 4.5, { sides: 12, color: 0xb9c0c6, uv: 3 });
      b.cyl(M.plain, 0, 16.5, 0, 4.1, 1.6, { r2: 0.3, sides: 12, color: 0x8a3a2a });
      b.mark('balas', 0, 0, 6);
      b.pop();
    }
    // Mirador sobre la ciudad, donde la calle corona el cerro: bancos y barandilla.
    put(G, 150, -3, Math.PI / 2, () => {
      b.hquad(M.pavers, 0, 0.03, 0, 9, 5, { uv: 3 });
      bench(G, -2.2, 1.2, Math.PI); bench(G, 2.2, 1.2, Math.PI); bin(G, 4, 1.6); post(G, -4, 1.8);
      b.box(M.plain, 0, 1.0, -2.3, 9, 0.07, 0.07, { color: 0x3a4046 });
      for (let x = -4.5; x <= 4.5; x += 1.5) b.box(M.plain, x, 0, -2.3, 0.07, 1.0, 0.07, { color: 0x3a4046, top: false });
      b.solid(0, 0, -2.3, 9, 1.05, 0.1);
      b.mark('balas', 0, 0, 0);
    });
    for (let i = 0; i < 5; i++) put(G, rr(R, 128, 146), rr(R, 2, 30), 0, () => { b.blob(M.flat, 0, 0.3, 0, rr(R, 0.6, 1.3), { color: 0x8d8a84, seed: i, sy: 0.7 }); b.solid(0, 0, 0, 1.2, 0.8, 1.2); });
  });

  // --- Sur: el río, sus puentes y la urbanización del otro lado ---
  section(5200, (G) => {
    const { b, M, R } = G, K = TERRAIN.rio;
    b.strip(M.water, T.river, 2 * (K.lecho + 3.4), K.agua, { uv: 8 });
    // Piedras en el cauce y juncos en las orillas.
    for (let i = 0; i < 46; i++) {
      const p = along(T.river, rr(R, 90, T.river[T.river.length - 1].s - 90)), d = rr(R, -7, 7), x = p.x - p.tz * d, z = p.z + p.tx * d;
      if (clash(x, z, 3)) continue;
      put(G, x, z, 0, () => b.blob(M.flat, 0, 0.1, 0, rr(R, 0.5, 1.3), { color: pick(R, [0x8d8a84, 0x7a776f, 0x9a968e]), seed: i, sy: 0.6 }));
    }
    for (let i = 0; i < 70; i++) {
      const p = along(T.river, rr(R, 90, T.river[T.river.length - 1].s - 90)), d = (R() < 0.5 ? -1 : 1) * rr(R, 8.2, 9.6), x = p.x - p.tz * d, z = p.z + p.tx * d;
      if (clash(x, z, 2)) continue;
      put(G, x, z, 0, () => { for (let k = 0; k < 5; k++) b.cyl(M.flat, rr(R, -0.5, 0.5), 0, rr(R, -0.5, 0.5), 0.05, rr(R, 0.9, 1.6), { r2: 0, sides: 3, color: pick(R, [0x6a8f45, 0x7d8a48, 0x5c7a3a]), cap: false }); });
    }
  });
  section(5210, (G) => {
    for (const path of [...SA, ...SB]) street(G, path, 7, { lamps: 22 });
    const [A, B] = BR;
    put(G, A.x, A.z0, 0, () => archBridge(G, A.z1 - A.z0, TERRAIN.rio.fondo));
    put(G, B.x, B.z0, 0, () => trussBridge(G, B.z1 - B.z0, TERRAIN.rio.fondo));
    // Paseo de la orilla, entre los dos puentes: bancos mirando al río.
    for (const x of [-12, 0, 12]) put(G, x, 108.5, 0, () => bench(G, 0, 0, 0));
    put(G, -6, 108, 0, () => post(G, 0, 0)); put(G, 6, 108, 0, () => post(G, 0, 0));
    G.b.mark('balas', 0, 0, 107);
  });
  lined(5220, S1, 8, {}, lotsS1, home);
  section(5270, (G) => {
    const { b, M, R } = G;
    street(G, S3, 9, { lamps: 0, walk: 0, rails: false });
    // Atasco de la huida y control abandonado justo antes del límite.
    const end = L - 174 - 8;
    for (let s = 6; s < end - 6; s += 6.5) { const p = along(S3, s); for (const side of [-1, 1]) if (R() < 0.75) put(G, p.x - p.tz * side * 2.2, p.z + p.tx * side * 2.2, 0, () => car(G, 0, 0, Math.atan2(-p.tz, p.tx) + rr(R, -0.15, 0.15))); }
    const p = along(S3, end), rot = Math.atan2(-p.tz, p.tx) + Math.PI / 2;
    put(G, p.x, p.z, 0, () => {
      barrier(G, -3, 0, rot); barrier(G, 0.2, 0.2, rot); barrier(G, 3.4, 0, rot);
      sandbags(G, -6.5, -2, rot, 3.6); sandbags(G, 7, -2, rot, 3.6);
      car(G, -8, -6, 0.4, { kind: 'militar' }); car(G, 7.5, -7, 2.6, { kind: 'policia' });
      for (const s of [-6, 6]) { b.box(M.plain, s, 0, 2.5, 0.1, 2.4, 0.1, { color: 0x4a4f55 }); b.vquad(M.details, s, 1.0, 2.56, 1.6, 1.6, { rect: DETAIL.WARNING, both: true }); }
      b.mark('balas', -5, 0, -4);
    });
  });

  // --- Norte: la vía (pasos a nivel y pasarela) y el polígono industrial ---
  section(5300, (G) => { street(G, NA, 8, { lamps: 26 }); street(G, NB, 8, { lamps: 26 }); });
  lined(5310, N1, 9, { lamps: 34 }, lotsN1, (G, side, i) => INDUSTRY[(i * 2 + (side > 0 ? 1 : 0) + 1) % INDUSTRY.length](G), 100);
  section(5390, (G) => {
    const { b, M } = G, drape = (x, z) => T.at(x, z);
    b.strip(M.concrete, rail, 3.6, 0.04, { uv: 3, color: 0x8a8072, drape });
    for (const s of [-0.75, 0.75]) b.strip(M.plain, rail, 0.1, 0.18, { offset: s, color: 0x6f7479, drape });
    const len = rail[rail.length - 1].s;
    for (let s = 0; s < len; s += 0.9) { const p = along(rail, s); put(G, p.x, p.z, Math.atan2(p.tx, p.tz), () => b.box(M.plain, 0, 0.04, 0, 2.5, 0.1, 0.24, { color: 0x5a4330, top: M.plain })); }
    const p = rail.reduce((q, k) => (Math.abs(k.x + 105) < Math.abs(q.x + 105) ? k : q));
    train(G, p.x, p.z, Math.atan2(-p.tz, p.tx));
    // Pasos a nivel: cruz de San Andrés y barrera levantada a cada lado.
    for (const x of [-29, 29]) for (const s of [-1, 1]) {
      b.push(x + s * 5.4, -114.5 + s * 4.5, s > 0 ? 0 : Math.PI);
      b.box(M.plain, 0, 0, 0, 0.12, 3.2, 0.12, { color: 0xe8e8e4, solid: true });
      for (const r of [0.7, -0.7]) b.slab(M.plain, -0.7 * Math.cos(r), 2.9 - 0.7 * Math.sin(r), 0.08, 0.7 * Math.cos(r), 2.9 + 0.7 * Math.sin(r), 0.08, 0.04, 0.16, { color: 0xc8322b });
      b.box(M.lamp, 0, 2.1, 0.08, 0.5, 0.22, 0.06);
      b.box(M.plain, -0.5, 0, 0, 0.4, 1.1, 0.4, { color: 0x4a4f55, solid: true });
      b.slab(M.plain, -0.5, 1.0, 0, -2.2, 4.6, 0, 0.1, 0.1, { color: 0xe8e8e4 });
      b.pop();
    }
    // Pasarela peatonal sobre la vía.
    b.push(62, -107, Math.PI); footbridge(G, 14); b.pop();
    // Chimeneas al fondo.
    for (const [x, z, h] of [[-192, -138, 30], [-183, -146, 24], [190, -140, 26]]) {
      put(G, x, z, 0, () => {
        b.cyl(M.plain, 0, 0, 0, 1.5, h, { r2: 0.9, sides: 12, color: 0x9a5a48, solid: true });
        b.cyl(M.plain, 0, h - 5, 0, 1.02, 2.4, { r2: 0.96, sides: 12, color: 0xe8e2d6, cap: false });
      });
    }
  });

  // --- Oeste: casco antiguo, de callejuelas ---
  const old = (G, side, i) => {
    const { R } = G;
    if (R() < 0.38) shopRow(G, 8.4, 9);
    else apartments(G, 8.4, 9, { floors: 2 + Math.floor(R() * 3), escape: false });
    if (i % 3 === 1 && side > 0) clothesline(G, 0, 7.1, Math.PI / 2, 5.2); // cruza el callejón
    if (R() < 0.22) dumpster(G, rr(R, -2.5, 2.5), 5.6, 0);
    else if (R() < 0.25) { crate(G, rr(R, -3, 3), 5.4, 0.8); barrel(G, rr(R, -3, 3), 5.5, 0x5a5d60); }
  };
  const alley = { dash: false, walk: 0.9, lamps: 22, lampH: 4.2, cobble: true };
  [W1, W2, W3].forEach((path, k) => lined(5400 + k * 50, path, 4.4, alley, lotsW[k], old, 70));
  section(5590, (G) => { // plazuela donde se cruzan: fuente y puestos de mercado
    const { b, M, R } = G, x = -H - 58, z = -18;
    b.cyl(M.pavers, x, 0, z, 9, 0.04, { sides: 14 });
    b.cyl(M.concrete, x, 0, z, 2.2, 0.5, { sides: 12, color: 0xc9c3b6, uv: 3, solid: true });
    b.cyl(M.water, x, 0.51, z, 1.9, 0.01, { sides: 12 });
    b.cyl(M.concrete, x, 0.5, z, 0.3, 1.5, { sides: 8, color: 0xb5b0a6, uv: 3 });
    for (const [dx, dz, c] of [[5.5, 3, 0xc8322b], [-5, 4.5, 0x2f6f4a], [4, -5.5, 0xd6a21e]]) {
      b.push(x + dx, z + dz, Math.atan2(-dx, -dz));
      for (const sx of [-1.1, 1.1]) for (const sz of [-0.7, 0.7]) b.box(M.plain, sx, 0, sz, 0.07, 2.1, 0.07, { color: 0x5a4330 });
      b.wedge(M.plain, 0, 2.1, 0, 2.6, 1.8, 0.5, { color: c, bottom: true });
      b.box(M.plain, 0, 0, -0.1, 2.2, 0.85, 1.0, { color: 0x9a7448, solid: true });
      for (let k = 0; k < 4; k++) b.blob(M.flat, -0.8 + k * 0.5, 0.95, -0.1, 0.16, { color: pick(R, [0xc8322b, 0xd6a21e, 0x5c8a3c, 0xe8701e]), seed: k });
      b.pop();
    }
    post(G, x + 6.5, z - 2); post(G, x - 6, z - 3);
    b.mark('balas', x - 3, 0, z + 2);
  });

  // --- Arbolado: en las laderas, las orillas y los solares sin construir; pinares en el campo ---
  const built = (x, z) => T.pads.some((p) => { const dx = x - p.x, dz = z - p.z; return Math.abs(dx * p.c - dz * p.s) < p.hw + 2 && Math.abs(dx * p.s + dz * p.c) < p.hd + 2; });
  const plant = (G, x, z, wood) => {
    if (inside(x, z) || clash(x, z, 3.5) || built(x, z) || T.riverDist(x, z) < 12.5) return;
    put(G, x, z, 0, () => (G.R() < wood ? pine : tree)(G, 0, 0, wood > 0.5 ? rr(G.R, 6, 10) : 0));
  };
  for (let q = 0; q < 4; q++) {
    section(5600 + q, (G) => {
      const { R } = G, E = L + 95, sx = q % 2 ? 1 : -1, sz = q < 2 ? 1 : -1;
      for (let i = 0; i < 150; i++) {
        const x = sx * rr(R, 0, E), z = sz * rr(R, 0, E), out = Math.max(Math.abs(x), Math.abs(z)) > L - 4;
        if (!out && R() < 0.45) continue; // dentro de la ciudad, menos
        plant(G, x, z, out ? 0.8 : 0.35);
      }
      for (const [x, z] of wild) if ((x > 0) === (sx > 0) && (z > 0) === (sz > 0)) { plant(G, x + rr(R, -4, 4), z + rr(R, -4, 4), 0.3); plant(G, x + rr(R, -6, 6), z + rr(R, -6, 6), 0.3); }
    });
  }
  section(5700, (G) => { // postes de la luz en la urbanización del sur
    const len = S1[S1.length - 1].s;
    let prev = null;
    for (let s = 10; s < len - 6; s += 28) {
      const p = along(S1, s), at = { x: p.x - p.tz * 6.2, z: p.z + p.tx * 6.2 };
      if (clash(at.x, at.z, 1, S1)) { prev = null; continue; }
      pole(G, at.x, at.z, prev);
      prev = at;
    }
  });
}

/** Detalles de calle del centro: alcantarillas, manchas, basura y un helicóptero estrellado. */
export function streetDetails(G, half, roadAt, blockAt, N) {
  const { b, M, R } = G;
  for (let k = 0; k <= N; k++) for (let j = 0; j < N; j++) {
    const a = roadAt(k), c = blockAt(j);
    for (const [x, z] of [[a + 2.4, c - 9], [c + 11, a - 2.4]]) { // alcantarillas
      b.cyl(M.plain, x, 0, z, 0.42, 0.012, { sides: 12, color: 0x2e3033 });
      b.cyl(M.plain, x, 0.012, z, 0.3, 0.004, { sides: 12, color: 0x3d4045 });
    }
    for (let i = 0; i < 3; i++) { // manchas de sangre y de aceite, papeles
      const along = R() < 0.5, u = rr(R, -20, 20), v = rr(R, -5, 5), x = along ? a + v : c + u, z = along ? c + u : a + v;
      const t = R();
      if (t < 0.4) b.cyl(M.mark, x, 0.014, z, rr(R, 0.4, 1.1), 0.002, { sides: 9, color: 0x4a0c0c });
      else if (t < 0.7) b.cyl(M.mark, x, 0.014, z, rr(R, 0.5, 1.4), 0.002, { sides: 8, color: 0x1e1f21 });
      else for (let n = 0; n < 5; n++) b.hquad(M.mark, x + rr(R, -1.5, 1.5), 0.02, z + rr(R, -1.5, 1.5), 0.3, 0.21, { rot: R() * 3, color: pick(R, [0xe8e8e0, 0xd8d0b8, 0xc9c5bb]) });
    }
  }
  // Helicóptero estrellado en un cruce.
  b.push(roadAt(N - 1), roadAt(1), 0.7);
  const C = 0x2f3a2a;
  b.box(M.plain, 0, 0.3, 0, 5.2, 1.9, 2.0, { color: C, rot: 0.1 });
  b.box(M.plain, 1.9, 0.9, 0, 1.4, 1.1, 1.9, { color: 0x14181c, rot: 0.1 });
  b.box(M.plain, -5, 1.0, 0.5, 5.4, 0.5, 0.5, { color: C, rot: 0.22 });
  b.box(M.plain, -7.6, 0.9, 1.1, 0.2, 1.8, 0.9, { color: C, rot: 0.22 });
  b.box(M.plain, 0, 2.2, 0, 0.3, 0.5, 0.3, { color: 0x1c1c1f });
  b.box(M.plain, 2.4, 2.6, 1.2, 6.2, 0.06, 0.34, { color: 0x1c1c1f, rot: 0.5 });
  b.box(M.plain, -1.6, 1.3, -2.6, 5.4, 0.06, 0.34, { color: 0x1c1c1f, rot: -1.1 });
  for (const s of [-1, 1]) b.box(M.plain, 0, 0.1, s * 1.1, 4.4, 0.1, 0.12, { color: 0x1c1c1f, rot: 0.1 });
  b.solid(0, 0, 0, 5.4, 2.2, 2.2, 0.1).solid(-5, 0, 0.5, 5.4, 1.5, 0.6, 0.22);
  b.cyl(M.mark, 1, 0.014, 0, 4.5, 0.002, { sides: 12, color: 0x1a1a1b });
  for (let i = 0; i < 5; i++) crate(G, rr(R, -6, 6), rr(R, 3, 6), 0.5);
  b.mark('balas', 2.5, 0, 3.5);
  b.pop();
}
