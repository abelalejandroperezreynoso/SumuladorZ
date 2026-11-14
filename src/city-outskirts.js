import { rng } from './city-textures.js';
import { house, apartments, shopRow, warehouse, DETAIL } from './city-blocks.js';
import {
  pick, rr, lamp, post, tree, pine, bush, bench, bin, dumpster, crate, barrel, barrier, sandbags, cone, chainFence, car, container, silo,
} from './city-props.js';

// Las afueras: lo que rodea a la cuadrícula del centro hasta el límite de la ciudad. Aquí las
// calles no son rectas: cada una es una curva (una lista de puntos por los que pasa) y los
// solares se reparten a sus lados, mirando a la calzada.
//   este y sur   urbanizaciones de casas con jardín a lo largo de calles en curva
//   norte        polígono industrial: naves, depósitos, patio de contenedores y la vía del tren
//   oeste        casco antiguo: callejuelas estrechas entre casas de pisos y tiendas
// Fuera del límite queda el campo: pinares y la carretera de salida, cortada.

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
function along(path, s) {
  let i = 1;
  while (i < path.length - 1 && path[i].s < s) i++;
  const a = path[i - 1], c = path[i], k = (s - a.s) / Math.max(1e-6, c.s - a.s);
  return { x: a.x + (c.x - a.x) * k, z: a.z + (c.z - a.z) * k, tx: c.tx, tz: c.tz };
}

/** Calzada a lo largo de una curva: asfalto (o adoquín), línea central, aceras y farolas alternas. */
function street(G, path, w, o = {}) {
  const { b, M } = G, walk = o.walk ?? 1.6;
  b.strip(o.cobble ? M.pavers : M.asphalt, path, w, 0.015, { uv: o.cobble ? 3 : 6, color: o.color });
  if (walk) for (const s of [-1, 1]) b.strip(M.sidewalk, path, walk, 0.03, { offset: s * (w / 2 + walk / 2), uv: 3 });
  const len = path[path.length - 1].s;
  if (o.dash !== false) {
    for (let s = 3; s < len - 3; s += 6) {
      const p = along(path, s);
      b.hquad(M.mark, p.x, 0.03, p.z, 0.16, 3, { rot: Math.atan2(p.tx, p.tz), color: 0xd9b23c });
    }
  }
  const every = o.lamps ?? 30;
  for (let s = every / 2, k = 0; every && s < len; s += every, k++) {
    const p = along(path, s), side = k % 2 ? 1 : -1, d = w / 2 + walk * 0.6;
    // (El brazo de la farola mira a la calzada.)
    lamp(G, p.x - p.tz * side * d, p.z + p.tx * side * d, Math.atan2(p.tz * side, -p.tx * side), o.lampH ?? 6.2, 1.4);
  }
}

/**
 * Reparte solares a los lados de una curva: cada `every` m y a `offset` del eje, llama a
 * `gen(G, lado, índice)` con el marco centrado en el solar y mirando a la calzada (+Z).
 */
function lots(G, path, o, gen) {
  const { b } = G, len = path[path.length - 1].s;
  let i = o.i0 ?? 0;
  for (let s = o.from ?? o.every / 2 + 4; s < Math.min(o.to ?? Infinity, len - o.every / 2 - 2); s += o.every, i++) {
    const p = along(path, s);
    for (const side of o.sides ?? [-1, 1]) {
      const nx = -p.tz * side, nz = p.tx * side; // hacia el solar
      if (o.skip?.(p.x + nx * o.offset, p.z + nz * o.offset)) continue;
      b.push(p.x + nx * o.offset, p.z + nz * o.offset, Math.atan2(-nx, -nz));
      gen(G, side, i);
      b.pop();
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
 * con el marco en el centro de la ciudad; half (mitad del centro) y limit (mitad de la ciudad) }.
 */
export function buildOutskirts({ section, half: H, limit: L }) {
  const inside = (x, z) => Math.abs(x) < H + 14 && Math.abs(z) < H + 14; // pisa la cuadrícula del centro
  const far = (x, z) => Math.abs(x) > L - 11 || Math.abs(z) > L - 11 || inside(x, z);
  const home = (G) => house(G, 19.6, 19.6);
  // Reparte una calle con solares en varios lotes de mallas (para que se oculten los que no se ven).
  const lined = (seed, path, w, streetOpts, lotOpts, gen, chunk = 110) => {
    const len = path[path.length - 1].s;
    section(seed, (G) => street(G, path, w, streetOpts));
    const per = Math.max(1, Math.round(chunk / lotOpts.every)), stride = per * lotOpts.every;
    for (let s0 = lotOpts.every / 2 + 4, k = 0; s0 < len - lotOpts.every / 2 - 2; s0 += stride, k++) {
      section(seed + 1 + k, (G) => lots(G, path, { ...lotOpts, from: s0, to: s0 + stride - 0.01, i0: k * per }, gen));
    }
  };

  // --- Este: urbanización en media luna, con un estanque en el interior ---
  const E1 = curve([[H, -87], [H + 34, -100], [H + 68, -80], [H + 84, -35], [H + 82, 20], [H + 66, 70], [H + 36, 94], [H, 87]]);
  lined(5100, E1, 8, {}, { every: 21.5, offset: 15.6, skip: far }, home);
  const E2 = curve([[H, 29], [H + 26, 24], [H + 44, 2], [H + 40, -24], [H + 22, -32], [H, -29]]);
  section(5150, (G) => {
    const { b, M, R } = G;
    street(G, E2, 5, { dash: false, walk: 0, lamps: 26, lampH: 4.5, cobble: true });
    b.cyl(M.concrete, H + 22, 0, -2, 9.5, 0.1, { sides: 16, color: 0xa8a39a, uv: 3 });
    b.cyl(M.water, H + 22, 0.11, -2, 9, 0.01, { sides: 16 });
    b.solid(H + 22, 0, -2, 13, 0.4, 13, Math.PI / 4);
    for (let i = 0; i < 14; i++) { const a = R() * 6.28, r = rr(R, 13, 20); (R() < 0.4 ? pine : tree)(G, H + 22 + Math.sin(a) * r * 0.9, -2 + Math.cos(a) * r); }
    bench(G, H + 10, 12, 2.4); bench(G, H + 33, -15, -0.7); bin(G, H + 12, 14);
    b.mark('balas', H + 30, 0, 12);
  });

  // --- Sur: avenida serpenteante y la carretera de salida ---
  const S1 = curve([[-87, H], [-96, H + 34], [-62, H + 64], [0, H + 78], [62, H + 64], [100, H + 34], [87, H]]);
  lined(5200, S1, 8, {}, { every: 21.5, offset: 15.6, skip: far }, home);
  const S2 = curve([[-29, H], [-34, H + 22], [-12, H + 40], [12, H + 40], [34, H + 22], [29, H]]);
  section(5250, (G) => {
    const { b, M, R } = G;
    street(G, S2, 6, { dash: false, lamps: 24 });
    // Campo de fútbol del barrio.
    b.hquad(M.grass, 0, 0.02, H + 18, 30, 20, { uv: 4, color: 0xc8e0b0 });
    for (const [x, z, sx, sz] of [[0, H + 8, 30, 0.12], [0, H + 28, 30, 0.12], [-15, H + 18, 0.12, 20], [15, H + 18, 0.12, 20], [0, H + 18, 0.12, 20]]) b.hquad(M.mark, x, 0.03, z, sx, sz, { color: 0xf0f0e8 });
    for (const s of [-1, 1]) {
      for (const k of [-1.8, 1.8]) b.box(M.plain, s * 15, 0, H + 18 + k, 0.1, 2.2, 0.1, { color: 0xf0f0ec, solid: true });
      b.box(M.plain, s * 15, 2.2, H + 18, 0.1, 0.1, 3.7, { color: 0xf0f0ec });
    }
    for (const x of [-18, 18]) { bench(G, x, H + 18, x < 0 ? Math.PI / 2 : -Math.PI / 2); tree(G, x * 1.15, H + 9); }
    b.mark('balas', 0, 0, H + 18);
  });
  const S3 = curve([[0, H + 78], [6, H + 104], [-2, L + 20], [3, L + 70]]);
  section(5270, (G) => {
    const { b, M, R } = G;
    street(G, S3, 9, { lamps: 0, walk: 0 });
    // Atasco de la huida y control abandonado justo antes del límite.
    for (let s = 8; s < 62; s += 6.5) { const p = along(S3, s); for (const side of [-1, 1]) if (R() < 0.75) car(G, p.x - p.tz * side * 2.2, p.z + p.tx * side * 2.2, Math.atan2(-p.tz, p.tx) + rr(R, -0.15, 0.15)); }
    const p = along(S3, 76), rot = Math.atan2(-p.tz, p.tx) + Math.PI / 2;
    barrier(G, p.x - 3, p.z, rot); barrier(G, p.x + 0.2, p.z + 0.2, rot); barrier(G, p.x + 3.4, p.z, rot);
    sandbags(G, p.x - 6.5, p.z - 2, rot, 3.6); sandbags(G, p.x + 7, p.z - 2, rot, 3.6);
    car(G, p.x - 8, p.z - 6, 0.4, { kind: 'militar' }); car(G, p.x + 7.5, p.z - 7, 2.6, { kind: 'policia' });
    for (const s of [-6, 6]) { b.box(M.plain, p.x + s, 0, p.z + 2.5, 0.1, 2.4, 0.1, { color: 0x4a4f55 }); b.vquad(M.details, p.x + s, 1.0, p.z + 2.56, 1.6, 1.6, { rect: DETAIL.WARNING, both: true }); }
    b.mark('balas', p.x - 5, 0, p.z - 4);
  });

  // --- Norte: polígono industrial y vía del tren ---
  const N1 = curve([[-145, -H], [-152, -H - 38], [-104, -H - 58], [-22, -H - 63], [60, -H - 57], [108, -H - 36], [87, -H]]);
  lined(5300, N1, 9, { lamps: 34 }, { every: 33, offset: 19.5, skip: far }, (G, side, i) => INDUSTRY[(i * 2 + (side > 0 ? 1 : 0) + 1) % INDUSTRY.length](G), 100);
  section(5390, (G) => {
    const { b, M, R } = G;
    const rail = curve([[-L - 60, -H - 96], [-120, -H - 101], [0, -H - 104], [140, -H - 100], [L + 60, -H - 92]], 6);
    b.strip(M.concrete, rail, 3.6, 0.02, { uv: 3, color: 0x8a8072 });
    for (const s of [-0.75, 0.75]) b.strip(M.plain, rail, 0.1, 0.16, { offset: s, color: 0x6f7479 });
    const len = rail[rail.length - 1].s;
    for (let s = 0; s < len; s += 0.9) { const p = along(rail, s); b.box(M.plain, p.x, 0.02, p.z, 2.5, 0.1, 0.24, { rot: Math.atan2(p.tx, p.tz), color: 0x5a4330, top: M.plain }); }
    const p = along(rail, len * 0.47);
    train(G, p.x, p.z, Math.atan2(-p.tz, p.tx));
    // Chimeneas y un depósito de agua al fondo.
    for (const [x, z, h] of [[-190, -H - 60, 30], [-178, -H - 66, 24], [180, -H - 55, 26]]) {
      b.cyl(M.plain, x, 0, z, 1.5, h, { r2: 0.9, sides: 12, color: 0x9a5a48, solid: true });
      b.cyl(M.plain, x, h - 5, z, 1.02, 2.4, { r2: 0.96, sides: 12, color: 0xe8e2d6, cap: false });
    }
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box(M.plain, 205 + sx * 2, 0, -H - 30 + sz * 2, 0.3, 12, 0.3, { color: 0x6f7479, solid: true });
    b.cyl(M.metal, 205, 12, -H - 30, 4, 4.5, { sides: 12, color: 0xb9c0c6, uv: 3 });
    b.cyl(M.plain, 205, 16.5, -H - 30, 4.1, 1.6, { r2: 0.3, sides: 12, color: 0x8a3a2a });
    b.mark('balas', 205, 0, -H - 24);
  });

  // --- Oeste: casco antiguo, de callejuelas ---
  const old = (G, side, i) => {
    const { b, R } = G;
    if (R() < 0.38) shopRow(G, 8.4, 9);
    else apartments(G, 8.4, 9, { floors: 2 + Math.floor(R() * 3), escape: false });
    if (i % 3 === 1 && side > 0) clothesline(G, 0, 7.1, Math.PI / 2, 5.2); // cruza el callejón
    if (R() < 0.22) dumpster(G, rr(R, -2.5, 2.5), 5.6, 0);
    else if (R() < 0.25) { crate(G, rr(R, -3, 3), 5.4, 0.8); barrel(G, rr(R, -3, 3), 5.5, 0x5a5d60); }
  };
  const alley = { dash: false, walk: 0.9, lamps: 22, lampH: 4.2, cobble: true };
  const W1 = curve([[-H, -29], [-H - 34, -40], [-H - 64, -15], [-H - 77, 25], [-H - 54, 60], [-H - 19, 70], [-H, 87]]);
  const W2 = curve([[-H - 64, -15], [-H - 74, -70], [-H - 39, -108], [-H, -87]]);
  const W3 = curve([[-H - 77, 25], [-H - 92, 72], [-H - 62, 110], [-H - 19, 122], [-H, 145]]);
  const taken = [];
  // (Cada casa aparta el sitio que ocupa: donde dos callejuelas se acercan no se pisan.)
  const free = (x, z) => { if (far(x, z) || taken.some((t) => Math.hypot(t[0] - x, t[1] - z) < 8.2)) return true; taken.push([x, z]); return false; };
  for (const [seed, path] of [[5400, W1], [5450, W2], [5500, W3]]) {
    lined(seed, path, 4.4, alley, { every: 8.6, offset: 7.7, skip: free }, old, 70);
  }
  section(5590, (G) => { // plazuela donde se cruzan: fuente y puestos de mercado
    const { b, M, R } = G, x = -H - 64, z = -15;
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

  // --- Campo: pinares alrededor (también más allá del límite) y postes de la luz en las urbanizaciones ---
  for (let q = 0; q < 4; q++) {
    section(5600 + q, (G) => {
      const { R } = G;
      for (let i = 0; i < 70; i++) {
        const a = rr(R, 0, Math.PI / 2) + (q * Math.PI) / 2, r = rr(R, H + 60, L + 95);
        const x = Math.sin(a) * r * 1.25, z = Math.cos(a) * r * 1.25;
        if (Math.max(Math.abs(x), Math.abs(z)) < L - 4 && Math.min(Math.abs(x), Math.abs(z)) < H + 45) continue; // dentro de la ciudad, solo en las esquinas
        if (Math.abs(z + H + 100) < 6 || (Math.abs(x) < 9 && z > 0)) continue; // ni en la vía ni en la carretera
        (R() < 0.75 ? pine : tree)(G, x, z, rr(R, 6, 10));
      }
    });
  }
  section(5700, (G) => {
    for (const path of [E1, S1]) {
      const len = path[path.length - 1].s;
      let prev = null;
      for (let s = 10; s < len - 6; s += 28) {
        const p = along(path, s), at = { x: p.x - p.tz * 6.2, z: p.z + p.tx * 6.2 };
        pole(G, at.x, at.z, prev);
        prev = at;
      }
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
  b.push(roadAt(4), roadAt(3), 0.7);
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
