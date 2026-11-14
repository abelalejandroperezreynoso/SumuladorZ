import { mix } from './city-build.js';
import { room } from './interior.js';
import {
  pick, rr, lamp, post, tree, pine, bush, bench, bin, planter, barrier, sandbags, dumpster, crate, barrel, cone,
  chainFence, wallLine, picket, car, container, silo,
} from './city-props.js';

// Edificios y manzanas de la ciudad. Cada edificio se describe en su propio marco: centrado en
// el origen, con la fachada principal hacia +Z y el suelo en y = 0. Una manzana (`BLOCKS`) es
// una función que llena un solar de 40 × 40 m (±20) con edificios y mobiliario.

const DARK = 0x2b2f33;
const GLASS_TINTS = [0xffffff, 0xcfe6e0, 0xd8d0f0, 0xf0e0c8, 0xbcd4f0, 0x9fb8c8];
const CONCRETE_TINTS = [0xffffff, 0xe8dcc8, 0xd6dde2, 0xf0e6d8, 0xc9c2b8];
const BRICK_TINTS = [0xc4705a, 0xa87858, 0xe0c090, 0x8a6a60, 0xf0ece4, 0xb5604c];
const PLASTER_TINTS = [0xfff6e0, 0xf6d9b0, 0xe8c8b8, 0xd0e0d8, 0xc8d8e8, 0xf0f0ec, 0xe8b088];
const HOUSE_WALLS = [0xf2ead8, 0xdfe8ee, 0xf3e3a8, 0xcfdcc4, 0xf0d0c0, 0xffffff, 0xc9d6e2, 0xe6c9a0];
const HOUSE_ROOFS = [0xb0553c, 0x6a6f78, 0x8a5a44, 0x4f5a52, 0xa8452e];
const AWNINGS = [0xc8322b, 0x2f6f4a, 0x2a4d8f, 0xd6a21e, 0x5a1e3a, 0xe8e2d0];

/** Recorte de la celda (columna, fila) de la textura de detalles. */
const cell = (col, row) => [col / 4, 1 - (row + 1) / 4, (col + 1) / 4, 1 - row / 4];
const WINDOW_LIT = cell(0, 0), WINDOW_DARK = cell(1, 0), DOOR = cell(2, 0), GARAGE = cell(3, 0);
const SHUTTER = cell(0, 1), GLASS_DOOR = cell(1, 1), VENT = cell(2, 1), STAINED = cell(3, 1);
const WARNING = cell(1, 2), CROSS = cell(2, 2), BOARD = cell(3, 2);
export const DETAIL = { WARNING, SHUTTER };

/** Aparatos de azotea: climatización, caseta de la escalera y, a veces, antena o depósito. */
function roofGear(G, w, d, y, tank = false) {
  const { b, M, R } = G;
  const n = 2 + Math.floor(R() * 3);
  for (let i = 0; i < n; i++) {
    const x = rr(R, -w / 2 + 2, w / 2 - 2), z = rr(R, -d / 2 + 2, d / 2 - 2);
    b.box(M.plain, x, y, z, 1.7, 1.0, 1.3, { color: 0x9ea3a8 });
    b.vquad(M.details, x, y + 0.12, z + 0.66, 1.3, 0.76, { rect: VENT });
  }
  b.box(M.concrete, w * 0.22, y, -d * 0.2, 3, 2.5, 2.8, { color: 0xb0aba1, uv: [3, 3], top: M.roof });
  b.vquad(M.details, w * 0.22, y, -d * 0.2 + 1.42, 0.95, 2.05, { rect: DOOR, color: 0x6f7479 });
  if (R() < 0.5) {
    b.box(M.plain, -w * 0.25, y, d * 0.2, 0.16, 9, 0.16, { color: 0x6f7479 });
    for (const yy of [3, 5.5, 8]) b.box(M.plain, -w * 0.25, y + yy, d * 0.2, 1.4 - yy * 0.1, 0.06, 0.06, { color: 0x6f7479 });
  }
  if (tank) {
    const x = -w * 0.28, z = -d * 0.22;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box(M.plain, x + sx * 0.7, y, z + sz * 0.7, 0.12, 1.5, 0.12, { color: DARK });
    b.cyl(M.plain, x, y + 1.5, z, 1.15, 2.2, { sides: 10, color: 0x8a6a48, cap: false });
    b.cyl(M.plain, x, y + 3.7, z, 1.25, 0.7, { r2: 0.1, sides: 10, color: 0x5a5d60 });
  }
}

/** Torre o bloque de oficinas: planta baja acristalada, fuste (con retranqueo si es alto) y azotea. */
export function highrise(G, w, d, o = {}) {
  const { b, M, R } = G;
  const kind = o.kind ?? (R() < 0.55 ? 'glass' : 'office');
  const mat = M[kind], fh = kind === 'glass' ? 3.5 : 3.3;
  const floors = o.floors ?? Math.round(rr(R, 7, 14));
  const tint = o.color ?? pick(R, kind === 'glass' ? GLASS_TINTS : CONCRETE_TINTS);
  const cu = Math.floor(R() * 4), cv = Math.floor(R() * 4), gh = 4.4;
  b.box(M.shop, 0, 0, 0, w, gh, d, { cells: [3.4, gh], cv: Math.floor(R() * 4), top: false });
  b.box(M.concrete, 0, gh, 0, w + 0.5, 0.5, d + 0.5, { color: 0x9a968e, uv: [3, 3], bottom: true });
  let y = gh + 0.5, ww = w - 1.2, dd = d - 1.2;
  const tiers = floors > 12 ? [0.62, 0.38] : [1];
  tiers.forEach((frac, i) => {
    const n = Math.max(2, Math.round(floors * frac));
    b.box(mat, 0, y, 0, ww, n * fh, dd, { cells: [3.2, fh], cu, cv, color: tint, top: M.roof });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(M.concrete, (sx * ww) / 2, y, (sz * dd) / 2, 0.7, n * fh, 0.7, { color: 0xb5b0a6, uv: [3, 3], top: false });
    y += n * fh;
    b.box(M.concrete, 0, y, 0, ww + 0.5, 0.7, dd + 0.5, { color: 0xa8a39a, uv: [3, 3], top: M.roof, bottom: true });
    y += 0.7;
    if (i < tiers.length - 1) { ww -= 5; dd -= 5; }
  });
  roofGear(G, ww, dd, y);
  if (floors > 16) { // aguja con baliza
    b.box(M.plain, 0, y, 0, 0.5, 14, 0.5, { color: 0x8f959b });
    b.box(M.lamp, 0, y + 14, 0, 0.6, 0.5, 0.6);
  }
  b.solid(0, 0, 0, w, y, d);
  // Marquesina de la entrada.
  b.box(M.plain, 0, 3.3, d / 2 + 1.2, 6, 0.22, 2.4, { color: DARK, bottom: true });
  for (const s of [-2.7, 2.7]) b.box(M.plain, s, 0, d / 2 + 2.2, 0.16, 3.3, 0.16, { color: 0x3a4046, solid: true });
  if (o.sign) b.vquad(M.signs, 0, 3.55, d / 2 + 2.42, 4.4, 1.1, { rect: G.signs.uv(o.sign) });
  return y;
}

/** Bloque de pisos: ladrillo o revoco, balcones delante y detrás, portal, cornisa y azotea con depósito. */
export function apartments(G, w, d, o = {}) {
  const { b, M, R } = G;
  const kind = o.kind ?? (R() < 0.55 ? 'brick' : 'plaster');
  const floors = o.floors ?? Math.round(rr(R, 4, 7)), fh = 3.05, h = floors * fh;
  const tint = pick(R, kind === 'brick' ? BRICK_TINTS : PLASTER_TINTS);
  b.box(M[kind], 0, 0, 0, w, h, d, { cells: [3.1, fh], cu: Math.floor(R() * 4), cv: Math.floor(R() * 4), color: tint, top: M.roof, solid: true });
  b.box(M.concrete, 0, 0, 0, w + 0.12, 0.6, d + 0.12, { color: 0x77726a, uv: [3, 3], top: false });
  b.box(M.concrete, 0, h, 0, w + 0.7, 0.35, d + 0.7, { color: 0xd8d2c4, uv: [3, 3], bottom: true, top: M.roof });
  for (const [sx, sz, lx, lz] of [[0, 1, w, 0.25], [0, -1, w, 0.25], [1, 0, 0.25, d], [-1, 0, 0.25, d]]) {
    b.box(M.concrete, (sx * (w - 0.25)) / 2, h + 0.35, (sz * (d - 0.25)) / 2, lx, 0.7, lz, { color: 0xc9c3b6, uv: [3, 3] });
  }
  // Balcones: columnas alternas, apilados planta a planta, en las dos fachadas largas.
  const nU = Math.max(1, Math.round(w / 3.1)), bw = w / nU, door = Math.floor(nU / 2);
  for (const side of [0, Math.PI]) {
    b.push(0, 0, side);
    for (let k = side ? 1 : 0; k < nU; k += 2) {
      const x = -w / 2 + (k + 0.5) * bw;
      for (let f = 1; f < floors; f++) {
        const y = f * fh - 0.1;
        b.box(M.concrete, x, y, d / 2 + 0.55, bw * 0.82, 0.12, 1.1, { color: 0xb5b0a6, uv: [3, 3], bottom: true });
        b.box(M.plain, x, y + 0.12, d / 2 + 1.08, bw * 0.82, 0.92, 0.04, { color: DARK });
        for (const s of [-1, 1]) b.box(M.plain, x + s * bw * 0.4, y + 0.12, d / 2 + 0.55, 0.04, 0.92, 1.08, { color: DARK });
      }
    }
    b.pop();
  }
  // Portal con escalón y tejadillo.
  const dx = -w / 2 + (door + 0.5) * bw + (door % 2 ? 0 : bw);
  const px = Math.max(-w / 2 + 1.5, Math.min(w / 2 - 1.5, dx));
  b.box(M.concrete, px, 0, d / 2 + 0.6, 2.8, 0.16, 1.2, { color: 0xa8a39a, uv: [3, 3], solid: true });
  b.vquad(M.details, px, 0.16, d / 2 + 0.04, 1.9, 2.5, { rect: GLASS_DOOR });
  b.box(M.plain, px, 2.8, d / 2 + 0.7, 3, 0.14, 1.4, { color: mix(tint, 0x202020, 0.6), bottom: true });
  // Escalera de incendios en un costado (edificios de ladrillo).
  if (kind === 'brick' && o.escape !== false) {
    b.push(0, 0, Math.PI / 2);
    for (let f = 1; f < floors; f++) {
      const y = f * fh - 0.1;
      b.box(M.plain, 0, y, w / 2 + 0.5, 3.2, 0.06, 1.0, { color: 0x30343a, bottom: true });
      b.box(M.plain, 0, y + 0.06, w / 2 + 0.98, 3.2, 0.9, 0.03, { color: 0x30343a });
      b.box(M.plain, f % 2 ? 1.1 : -1.1, y - fh + 0.06, w / 2 + 0.6, 0.5, fh, 0.05, { color: 0x30343a, top: false });
    }
    b.pop();
  }
  if (w > 12) roofGear(G, w, d, h + 0.35, true);
  return h;
}

/** Hilera de tiendas a lo largo de X: escaparate, rótulo, toldo y, a veces, una vivienda encima. */
export function shopRow(G, w, d = 9, names = null) {
  const { b, M, R, signs } = G;
  const n = Math.max(1, Math.round(w / 8)), sw = w / n, gh = 4;
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (i + 0.5) * sw, two = R() < 0.5;
    const kind = R() < 0.5 ? 'brick' : 'plaster', tint = pick(R, kind === 'brick' ? BRICK_TINTS : PLASTER_TINTS);
    const h = two ? gh + 3.1 : gh + rr(R, 0.3, 1.1);
    // Planta baja: un local en el que se entra rompiendo el escaparate (o por la puerta de atrás, si quedó abierta).
    const bays = Math.max(1, Math.round((sw - 1.4) / 3.3)), fw = Math.min(2.6, sw / bays - 0.9);
    const backDoor = R() < 0.35, backAt = rr(R, -1.2, 1.2);
    b.push(x, 0, 0);
    room(G, sw, d, {
      h: gh - 0.2, color: mix(tint, 0xb0b0b0, 0.35), floorColor: pick(R, [0x9a8f80, 0x7d8a8f, 0xa89a7a, 0x8a8078]),
      sides: {
        front: Array.from({ length: bays }, (_, k) => ({ at: -sw / 2 + ((k + 0.5) * sw) / bays, kind: 'front', w: fw })),
        back: backDoor ? [{ at: backAt, kind: 'door', leafColor: 0x6f7479 }] : [],
      },
    });
    // Mostrador y estanterías a medio saquear.
    const wood = pick(R, [0x7a5a3a, 0x5a4330, 0x8f959b, 0x9a7448]);
    b.box(M.plain, sw * 0.14, 0, -d * 0.18, Math.min(2.2, sw * 0.3), 1.0, 0.6, { color: wood, solid: true });
    for (const s of [-1, 1]) {
      b.box(M.plain, s * (sw / 2 - 0.5), 0, -d * 0.1, 0.45, 1.9, d * 0.5, { color: 0x8f959b, solid: true });
      for (let k = 0; k < 3; k++) b.box(M.plain, s * (sw / 2 - 0.52), 0.45 + k * 0.5, -d * 0.1, 0.5, 0.26, d * 0.46, { color: pick(R, [0xc8322b, 0x2a4d8f, 0xd6a21e, 0x3d6b4a, 0xe8e8e4]), top: false });
    }
    if (R() < 0.45) b.mark('balas', -sw * 0.16, 0, -d * 0.24);
    b.pop();
    if (two) b.box(M[kind], x, gh, 0, sw, 3.1, d, { cells: [sw / Math.max(2, Math.round(sw / 2.8)), 3.1], cu: Math.floor(R() * 4), cv: Math.floor(R() * 4), color: tint, top: M.roof, solid: true });
    else b.box(M.concrete, x, gh, 0, sw, h - gh, d, { color: tint, uv: [3, 3], top: M.roof, solid: true });
    b.box(M.concrete, x, h, 0, sw + 0.1, 0.3, d + 0.1, { color: 0xd8d2c4, uv: [3, 3], top: M.roof });
    b.box(M.plain, x, 2.9, d / 2 + 0.1, sw - 0.4, 0.74, 0.2, { color: 0x1d2023 });
    const name = names?.[i] ?? pick(R, signs.shops);
    b.vquad(M.signs, x, 2.95, d / 2 + 0.215, Math.min(sw - 0.9, 4.4), 0.64, { rect: signs.uv(name) });
    if (R() < 0.65) b.wedge(M.plain, x, 2.3, d / 2 + 0.8, sw - 0.9, 1.6, 0.56, { rot: Math.PI, color: pick(R, AWNINGS), bottom: true });
    if (R() < 0.7) { b.box(M.plain, x + rr(R, -1.5, 1.5), h + 0.3, rr(R, -2, 2), 1.6, 0.9, 1.2, { color: 0x9ea3a8 }); }
    // Puerta de servicio detrás (cerrada, si no es la que quedó abierta).
    if (!backDoor) {
      b.push(x, 0, Math.PI);
      b.vquad(M.details, rr(R, -1.5, 1.5), 0, d / 2 + 0.03, 1.0, 2.1, { rect: DOOR, color: 0x6f7479 });
      b.pop();
    }
  }
}

/** Casa unifamiliar en un solar de w × d: jardín, porche, garaje, tejado a dos aguas y valla. */
export function house(G, w, d) {
  const { b, M, R } = G;
  const wall = pick(R, HOUSE_WALLS), roof = pick(R, HOUSE_ROOFS), trim = 0xf4f1e8;
  const floors = R() < 0.45 ? 2 : 1, h = floors === 2 ? 6 : 3.1;
  const bw = rr(R, 8.5, 10.5), bd = rr(R, 6.5, 7.8), gside = R() < 0.5 ? 1 : -1;
  const bx = -gside * 1.9, bz = -1.2; // la casa deja sitio al garaje a un lado
  b.hquad(M.grass, 0, 0.012, 0, w, d, { uv: 4 });
  // Cuerpo, zócalo y tejado.
  // La planta baja es un recinto en el que se entra: por una ventana, rompiendo el cristal, o
  // por la puerta si quedó abierta. La planta alta (si la hay) es maciza.
  const open = R() < 0.3, doorColor = pick(R, [0x6b2f2f, 0x2f4a3a, 0x2a3d5a, 0x7a5a3a, 0xf0f0ec]);
  const pair = [{ at: -bw * 0.3, kind: 'window' }, { at: bw * 0.3, kind: 'window' }], one = [{ at: 0, kind: 'window' }];
  b.push(bx, bz, 0);
  room(G, bw, bd, {
    color: wall, floorColor: pick(R, [0x8a6a48, 0x9a7a55, 0x7a6048]),
    sides: { front: open ? [...pair, { at: 0, kind: 'door', leafColor: doorColor }] : pair, back: pair, right: gside > 0 ? [] : one, left: gside > 0 ? one : [] },
  });
  // Muebles: sofá, mesa y armario.
  b.box(M.plain, -bw * 0.28, 0, -bd * 0.08, 0.9, 0.45, 1.9, { color: pick(R, [0x6b4a5a, 0x4a5a6b, 0x6b6248]), solid: true });
  b.box(M.plain, -bw * 0.28 - 0.35, 0.45, -bd * 0.08, 0.2, 0.4, 1.9, { color: 0x4a4048 });
  b.box(M.plain, bw * 0.12, 0, bd * 0.12, 1.3, 0.74, 0.8, { color: 0x7a5a3a, solid: true });
  b.box(M.plain, gside * (bw / 2 - 0.5), 0, -bd * 0.2, 0.5, 1.9, 1.4, { color: 0x5a4330, solid: true });
  if (R() < 0.4) b.mark('balas', bw * 0.12, 0, -bd * 0.2);
  b.pop();
  if (floors === 2) b.box(M.concrete, bx, 3.1, bz, bw, 2.9, bd, { color: wall, uv: [3, 3], top: false, solid: true });
  const rh = rr(R, 1.9, 2.6);
  b.prism(M.tiles, bx, h, bz, bw + 0.9, bd + 0.9, rh, { color: roof, gable: M.concrete, gableColor: wall });
  b.box(M.plain, bx, h - 0.06, bz, bw + 0.94, 0.07, bd + 0.94, { color: trim, bottom: true, top: false });
  b.box(M.concrete, bx + bw * 0.28, h + rh * 0.3, bz - bd * 0.15, 0.7, rh * 0.9 + 0.5, 0.7, { color: 0x8a5a48, uv: [1.5, 1.5] });
  // Ventanas y puerta (planta a planta, en las cuatro fachadas).
  const win = (x, y, z, rot, lit, ww = 1.25) => { b.push(bx, bz, rot); b.vquad(M.details, x, y, z + 0.025, ww, 1.25, { rect: lit ? WINDOW_LIT : WINDOW_DARK }); b.pop(); };
  if (floors === 2) { // ventanas de la planta alta (pintadas)
    const y = 4.1;
    for (const x of [-bw * 0.3, 0, bw * 0.3]) win(x, y, bd / 2, 0, R() < 0.5);
    for (const x of [-bw * 0.3, bw * 0.3]) win(x, y, bd / 2, Math.PI, R() < 0.4);
    for (const rot of [Math.PI / 2, -Math.PI / 2]) win(0, y, bw / 2, rot, R() < 0.4);
  }
  if (!open) b.vquad(M.details, bx, 0, bz + bd / 2 + 0.03, 1.0, 2.1, { rect: DOOR, color: doorColor });
  // Porche: losa, dos postes y tejadillo.
  const pz = bz + bd / 2;
  b.box(M.concrete, bx, 0, pz + 0.85, 3.4, 0.06, 1.6, { color: 0xb5b0a6, uv: [2, 2] });
  for (const s of [-1.5, 1.5]) b.box(M.plain, bx + s, 0, pz + 1.5, 0.12, 2.5, 0.12, { color: trim, solid: true });
  b.wedge(M.tiles, bx, 2.5, pz + 0.85, 3.8, 1.9, 0.6, { rot: Math.PI, color: roof, bottom: true, side: M.plain });
  b.hquad(M.pavers, bx, 0.02, (pz + 1.6 + d / 2) / 2, 1.3, d / 2 - pz - 1.6, { uv: 2 });
  // Garaje adosado y entrada de coches.
  const gx = bx + gside * (bw / 2 + 1.9), gz = bz + 0.4;
  b.box(M.concrete, gx, 0, gz, 3.8, 2.7, 5.6, { color: wall, uv: [3, 3], top: M.roof, solid: true });
  b.box(M.plain, gx, 2.7, gz, 4.0, 0.14, 5.8, { color: trim });
  b.vquad(M.details, gx, 0, gz + 2.83, 3.0, 2.25, { rect: GARAGE });
  b.hquad(M.concrete, gx, 0.02, (gz + 2.8 + d / 2) / 2, 3.2, d / 2 - gz - 2.8, { uv: 3, color: 0xc9c5bb });
  if (R() < 0.55) car(G, gx, gz + 2.8 + 3.2, Math.PI / 2 * (R() < 0.5 ? 1 : -1), { kind: pick(R, ['sedan', 'sedan', 'pickup', 'van']) });
  // Valla: laterales y fondo cerrados; delante, abierta en el camino y en la entrada de coches.
  const hw = w / 2 - 0.3, hd = d / 2 - 0.3, fence = R() < 0.6;
  const line = fence ? (x0, z0, x1, z1) => picket(G, x0, z0, x1, z1)
    : (x0, z0, x1, z1) => wallLine(G, x0, z0, x1, z1, 0.95, 0.22, M.concrete, mix(wall, 0x9a9a9a, 0.5), 0xd8d2c4);
  line(-hw, -hd, hw, -hd); line(-hw, -hd, -hw, hd); line(hw, -hd, hw, hd);
  const gaps = [[bx - 0.9, bx + 0.9], [gx - 1.8, gx + 1.8]].sort((p, q) => p[0] - q[0]);
  let at = -hw;
  for (const [g0, g1] of gaps) { if (g0 - at > 0.5) line(at, hd, g0, hd); at = Math.max(at, g1); }
  if (hw - at > 0.5) line(at, hd, hw, hd);
  // Jardín.
  tree(G, -gside * (w / 2 - 2.6), d / 2 - 3.2);
  if (R() < 0.6) tree(G, gside * (w / 2 - 2.4), -d / 2 + 2.6);
  for (const s of [-1, 1]) bush(G, bx + s * (bw * 0.3), pz + 0.55, 0.5);
  b.box(M.plain, bx + 1.6, 0, hd - 0.4, 0.08, 1.0, 0.08, { color: DARK });
  b.box(M.plain, bx + 1.6, 1.0, hd - 0.4, 0.24, 0.22, 0.44, { color: pick(R, [0x2a4d8f, 0xc8322b, 0x1c1c1f]) });
}

/** Nave industrial de chapa: portones con persiana, muelle de carga y cubierta en diente de sierra o a dos aguas. */
export function warehouse(G, w, d, o = {}) {
  const { b, M, R } = G;
  const h = o.h ?? rr(R, 7.5, 9.5), color = o.color ?? pick(R, [0xb9c0c6, 0x9fb3bd, 0xc9bfa8, 0x8fa39a, 0xb0a090]);
  b.box(M.metal, 0, 0, 0, w, h, d, { color, uv: [2, h], top: false, solid: true });
  b.box(M.concrete, 0, 0, 0, w + 0.1, 0.9, d + 0.1, { color: 0x8d8a84, uv: [3, 3], top: false });
  if (o.saw ?? R() < 0.5) {
    const n = Math.max(2, Math.round(d / 6)), sd = d / n;
    for (let i = 0; i < n; i++) {
      b.wedge(M.metal, 0, h, -d / 2 + (i + 0.5) * sd, w, sd, 2.2, { color: mix(color, 0x606060, 0.3), back: M.glass, backRect: [0, 0, Math.round(w / 3.2) / 4, 0.19], side: M.metal });
    }
  } else {
    b.prism(M.metal, 0, h, 0, w + 0.6, d + 0.6, 2.4, { color: mix(color, 0x606060, 0.3), gableColor: color, uv: 2 });
    for (const x of [-w / 4, w / 4]) b.cyl(M.plain, x, h + 2.2, 0, 0.5, 0.7, { sides: 8, color: 0x9ea3a8 });
  }
  // Portones y muelle.
  const n = Math.max(1, Math.round(w / 9));
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + ((i + 0.5) * w) / n;
    b.vquad(M.details, x, 1.1, d / 2 + 0.03, 4.2, 4.2, { rect: SHUTTER });
    b.box(M.plain, x, 5.3, d / 2 + 0.2, 4.6, 0.12, 0.4, { color: DARK, bottom: true });
    b.box(M.plain, x - 2.3, 0.2, d / 2 + 1.25, 0.16, 0.9, 0.16, { color: 0xd6a21e });
  }
  b.box(M.concrete, 0, 0, d / 2 + 1.2, w * 0.86, 1.1, 2.4, { color: 0xa8a39a, uv: [3, 3], solid: true });
  // Puerta de personal y ventanas altas en el costado.
  b.push(0, 0, Math.PI / 2);
  b.vquad(M.details, d * 0.3, 0, w / 2 + 0.03, 1.0, 2.1, { rect: DOOR, color: 0x6f7479 });
  for (let x = -d * 0.3; x < d * 0.2; x += 4) b.vquad(M.details, x, h - 2.6, w / 2 + 0.03, 2.4, 1.2, { rect: WINDOW_DARK });
  b.pop();
  return h;
}

/** Tienda de campaña militar: armazón, techo a dos aguas y lona en tres lados (abierta hacia +Z). */
function tent(G, x, z, rot = 0, color = 0x5d6b47, w = 4.4, d = 3.4) {
  const { b, M } = G;
  b.push(x, z, rot);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(M.plain, (sx * w) / 2, 0, (sz * d) / 2, 0.08, 2.0, 0.08, { color: DARK });
  b.prism(M.plain, 0, 2.0, 0, w + 0.3, d + 0.3, 1.0, { color });
  b.box(M.plain, 0, 0, -d / 2, w, 2.0, 0.04, { color: mix(color, 0x000000, 0.15), solid: true });
  for (const s of [-1, 1]) b.box(M.plain, (s * w) / 2, 0, -d * 0.15, 0.04, 2.0, d * 0.7, { color: mix(color, 0x000000, 0.1), solid: true });
  b.pop();
}

/** Fuente: vaso circular con agua, columna y taza. */
function fountain(G, x, z, r = 3.2) {
  const { b, M } = G;
  b.cyl(M.concrete, x, 0, z, r, 0.55, { sides: 16, color: 0xc9c3b6, uv: 3, solid: true });
  b.cyl(M.water, x, 0.56, z, r - 0.3, 0.01, { sides: 16 });
  b.cyl(M.concrete, x, 0.5, z, 0.38, 1.7, { sides: 8, color: 0xb5b0a6, uv: 3 });
  b.cyl(M.concrete, x, 1.9, z, 0.5, 0.3, { r2: 1.15, sides: 12, color: 0xc9c3b6, uv: 3 });
  b.cyl(M.water, x, 2.21, z, 1.0, 0.01, { sides: 12 });
}

/** Solar asfaltado con plazas pintadas: fila de `n` plazas a lo largo de X, con coches al azar. */
function parkingRow(G, x, z, n, rot = 0, chance = 0.45) {
  const { b, M, R } = G;
  b.push(x, z, rot);
  for (let i = 0; i <= n; i++) b.hquad(M.mark, -n * 1.35 + i * 2.7, 0.02, 0, 0.12, 5, { color: 0xe8e8e0 });
  for (let i = 0; i < n; i++) if (R() < chance) car(G, -n * 1.35 + (i + 0.5) * 2.7 + rr(R, -0.15, 0.15), rr(R, -0.3, 0.3), (R() < 0.5 ? 1 : -1) * Math.PI / 2 + rr(R, -0.06, 0.06));
  b.pop();
}

// ---------------------------------------------------------------------------
// Manzanas. `G.b` ya está en el marco de la manzana (suelo = acera, y = 0).
// ---------------------------------------------------------------------------
export const BLOCKS = {
  /** Una torre alta con su plazoleta. */
  torres(G) {
    const { b, M, R } = G;
    b.hquad(M.pavers, 0, 0.012, 0, 40, 40, { uv: 3 });
    b.push(-3, -4, 0);
    highrise(G, 26, 24, { kind: 'glass', floors: Math.round(rr(R, 19, 26)), sign: R() < 0.5 ? 'HOTEL' : null });
    b.pop();
    for (const x of [-14, -6, 2, 10]) planter(G, x, 15.5);
    for (const x of [-10, -2, 6]) bench(G, x, 17.5, Math.PI);
    tree(G, 16, 14); tree(G, 15.5, -14); tree(G, 16.5, 0);
    post(G, 14, 8); post(G, 14, -8);
    b.box(M.plain, 17, 0, 17, 0.12, 9, 0.12, { color: 0xb9bec4, solid: true });
    b.box(M.plain, 17.75, 7.6, 17, 1.5, 1.0, 0.03, { color: pick(R, [0xc8322b, 0x2a4d8f, 0x2f6f4a]) });
    b.mark('balas', 13.5, 0, 12);
  },

  /** Dos bloques de oficinas con un callejón de servicio entre ellos. */
  oficinas(G) {
    const { b, M, R } = G;
    b.hquad(M.concrete, 0, 0.012, 0, 40, 40, { uv: 4, color: 0xb5b0a6 });
    b.push(0, -11.5, Math.PI); highrise(G, 38, 16, { floors: Math.round(rr(R, 8, 13)) }); b.pop();
    b.push(0, 11.5, 0); highrise(G, 38, 16, { floors: Math.round(rr(R, 6, 11)) }); b.pop();
    dumpster(G, -14, 0, 0); dumpster(G, -11.5, 0.2, 0.1);
    crate(G, 6, -1.6, 1.1); crate(G, 7.2, -1.5, 0.9); crate(G, 6.5, -1.7, 0.8, 1.1);
    barrel(G, 12, 1.8); barrel(G, 12.8, 1.7, 0x8a3a2a);
    car(G, 0, 0.6, 0.05, { kind: 'van' });
    b.mark('balas', 16, 0, 0);
  },

  /** Cuatro bloques de pisos alrededor de un patio en cruz. */
  pisos(G) {
    const { b, M, R } = G;
    b.hquad(M.concrete, 0, 0.012, 0, 40, 40, { uv: 4, color: 0xa8a39a });
    if (R() < 0.5) {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        b.push(sx * 11.6, sz * 12.4, sz > 0 ? 0 : Math.PI);
        apartments(G, 16.5, 12.5);
        b.pop();
      }
      tree(G, 0, 0); bench(G, 0, 2.6, 0); bench(G, 0, -2.6, Math.PI);
      dumpster(G, -1, 13, Math.PI / 2); dumpster(G, 1, -13, Math.PI / 2);
      post(G, -2.2, 6); post(G, 2.2, -6);
    } else {
      b.push(0, -13, Math.PI); apartments(G, 38, 12); b.pop();
      b.push(0, 13, 0); apartments(G, 38, 12); b.pop();
      b.hquad(M.grass, 0, 0.02, 0, 30, 8, { uv: 4 });
      for (const x of [-12, -4, 4, 12]) tree(G, x, rr(R, -2, 2));
      bench(G, -8, 3.2, Math.PI); bench(G, 8, -3.2, 0);
      dumpster(G, 17.5, 0, Math.PI / 2);
      post(G, 0, 3.6);
      // Columpio.
      for (const s of [-1.2, 1.2]) { b.box(M.plain, s, 0, -2.6, 0.08, 2.2, 0.08, { color: 0xc8322b, solid: true }); }
      b.box(M.plain, 0, 2.2, -2.6, 2.6, 0.08, 0.08, { color: 0xc8322b });
      for (const s of [-0.5, 0.5]) { b.box(M.plain, s, 0.55, -2.6, 0.02, 1.65, 0.02, { color: DARK }); b.box(M.plain, s, 0.5, -2.6, 0.4, 0.04, 0.2, { color: 0x2a4d8f }); }
    }
    b.mark('balas', 0, 0, -1.2);
  },

  /** Manzana comercial: tiendas a las cuatro calles y patio de carga dentro. */
  tiendas(G) {
    const { b, M } = G;
    b.hquad(M.asphalt, 0, 0.012, 0, 40, 40, { uv: 6 });
    b.push(0, 15.5, 0); shopRow(G, 40); b.pop();
    b.push(0, -15.5, Math.PI); shopRow(G, 40); b.pop();
    b.push(15.5, 0, Math.PI / 2); shopRow(G, 17); b.pop();
    b.push(-15.5, 0, -Math.PI / 2); shopRow(G, 17); b.pop();
    dumpster(G, -8, -9.5, 0); dumpster(G, 8, 9.5, Math.PI);
    crate(G, -9, 8.5, 1); crate(G, -7.8, 8.7, 0.8); barrel(G, 9.5, -9.2); barrel(G, 8.6, -9.4, 0x8a3a2a);
    car(G, 0, 0, 0.3, { kind: 'van' });
    b.mark('balas', 3, 0, 3);
  },

  /** Cuatro casas con jardín. */
  casas(G) {
    const { b } = G;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      b.push(sx * 10, sz * 10, sz > 0 ? 0 : Math.PI);
      house(G, 19.6, 19.6);
      b.pop();
    }
    b.mark('balas', 0, 0, 0);
  },

  /** Comisaría: vestíbulo en el que se entra, calabozos, coches patrulla y antena. */
  comisaria(G) {
    const { b, M, R, signs } = G;
    b.hquad(M.asphalt, 0, 0.012, 0, 40, 40, { uv: 6 });
    b.push(0, -10, 0);
    room(G, 32, 15, { h: 3.5, color: 0xd6dde2, floorColor: 0x8a8f96, sides: {
      front: [{ at: -11, kind: 'front' }, { at: -6.5, kind: 'front' }, { at: 0, kind: 'door', w: 1.7, leafColor: 0x1b2a4a }, { at: 6.5, kind: 'front' }, { at: 11, kind: 'front' }],
      back: [{ at: -12, kind: 'door', leafColor: 0x6f7479 }], left: [{ at: 0, kind: 'window' }], right: [{ at: 2, kind: 'window' }],
    } });
    b.box(M.plain, 0, 0, 1.5, 6, 1.05, 0.7, { color: 0x1b2a4a, solid: true }); // mostrador
    for (const x of [-12, 12]) b.box(M.plain, x, 0, 5.2, 3, 0.45, 0.6, { color: 0x7a5a3a, solid: true });
    // Calabozos: barrotes.
    for (let x = 6; x <= 14.5; x += 0.28) b.box(M.plain, x, 0, -2.5, 0.05, 3.5, 0.05, { color: 0x3a4046, top: false });
    b.solid(10.2, 0, -2.5, 8.8, 3.5, 0.1);
    b.box(M.plain, 10, 0, -2.5, 0.1, 3.5, 4.6, { color: 0x8f959b, solid: true });
    // Armería: taquillas y lo que quedó.
    for (const x of [-14, -12.5, -11]) b.box(M.plain, x, 0, -6.3, 1.3, 2.0, 0.6, { color: 0x4f5a6a, solid: true });
    b.mark('balas', -12.5, 0, -4.6); b.mark('balas', -9, 0, -5.4); b.mark('pistola', -6, 0, -5);
    b.box(M.office, 0, 3.7, 0, 32, 6.6, 15, { cells: [3.2, 3.3], color: 0xd6dde2, cu: 1, top: M.roof, solid: true });
    b.box(M.concrete, 0, 10.3, 0, 32.5, 0.6, 15.5, { color: 0xa8a39a, uv: [3, 3], top: M.roof });
    b.box(M.plain, 0, 3.75, 7.6, 7, 1.5, 0.25, { color: 0x1d2023 });
    b.vquad(M.signs, 0, 3.85, 7.74, 6.6, 1.3, { rect: signs.uv('POLICÍA') });
    b.box(M.plain, 0, 3.4, 8.6, 5, 0.2, 2.2, { color: 0x1b2a4a, bottom: true });
    roofGear(G, 26, 11, 10.9);
    // Antena de radio.
    for (const [sx, sz] of [[-1, -1], [1, -1], [0, 1]]) b.box(M.plain, 11 + sx * 0.5, 10.9, sz * 0.5, 0.08, 14, 0.08, { color: 0xc8322b });
    for (let y = 12; y < 25; y += 2) b.box(M.plain, 11, y, 0, 1.1, 0.05, 1.1, { color: 0xe8e8e4, top: false });
    b.box(M.lamp, 11, 24.9, 0, 0.3, 0.3, 0.3);
    b.pop();
    // Aparcamiento con coches patrulla y un furgón.
    for (let i = 0; i <= 6; i++) b.hquad(M.mark, -9 + i * 3, 0.02, 9, 0.12, 5, { color: 0xe8e8e0 });
    car(G, -7.5, 9, Math.PI / 2 + 0.05, { kind: 'policia' }); car(G, -1.5, 9.2, -Math.PI / 2, { kind: 'policia' }); car(G, 4.5, 8.8, Math.PI / 2 - 0.08, { kind: 'policia' });
    car(G, 14, 13, 0.3, { kind: 'van', color: 0x1b2a4a });
    barrier(G, -14, 18.5, 0); barrier(G, -10.8, 18.6, 0.05); sandbags(G, 12, 18.4, 0, 4);
    for (const [x, z] of [[-17, 3], [-16.2, 3.4]]) cone(G, x, z);
    b.box(M.plain, 17.5, 0, 17.5, 0.12, 9, 0.12, { color: 0xb9bec4, solid: true });
    b.box(M.plain, 18.25, 7.6, 17.5, 1.5, 1.0, 0.03, { color: 0x2a4d8f });
    lamp(G, -18, 12, Math.PI / 2, 7, 0.3); lamp(G, 18, 4, -Math.PI / 2, 7, 0.3);
    chainFence(G, -19.6, -2, -19.6, 19.6); chainFence(G, 19.6, -2, 19.6, 12);
  },

  /** Fábrica: nave grande, silos, chimenea y patio de contenedores tras una valla. */
  industria(G) {
    const { b, M, R } = G;
    b.hquad(M.concrete, 0, 0.012, 0, 40, 40, { uv: 5, color: 0x9a968e });
    b.push(-5, -8, 0); warehouse(G, 28, 20, { saw: true }); b.pop();
    for (const [x, z] of [[13.5, -15], [13.5, -9.5], [13.5, -4]]) silo(G, x, z, 2.3, rr(R, 10, 13));
    // Chimenea de ladrillo con bandas.
    b.cyl(M.plain, 15, 0, 3.5, 1.3, 27, { r2: 0.85, sides: 12, color: 0x9a5a48, solid: true });
    b.cyl(M.plain, 15, 22, 3.5, 0.96, 2.5, { r2: 0.9, sides: 12, color: 0xe8e2d6, cap: false });
    b.cyl(M.plain, 15, 27, 3.5, 0.95, 0.5, { sides: 12, color: 0x3a3d40 });
    const colors = [0xb5532a, 0x2a5d8f, 0x3d7a4a, 0x8a3a2a, 0xc9a23c, 0x6a6f78];
    container(G, -12, 9, 0, pick(R, colors)); container(G, -12, 9, 0.04, pick(R, colors), 2.6);
    container(G, -12, 12.2, 0, pick(R, colors)); container(G, -4.5, 11, 0.5, pick(R, colors));
    container(G, 4, 14.5, 0, pick(R, colors)); container(G, 4, 14.5, -0.03, pick(R, colors), 2.6);
    for (let i = 0; i < 4; i++) crate(G, 9 + (i % 2) * 1.15, 9 + Math.floor(i / 2) * 1.15, 1.05);
    crate(G, 9.5, 9.5, 1.0, 1.05);
    barrel(G, 6, 5.5); barrel(G, 6.8, 5.4, 0x8a3a2a); barrel(G, 6.3, 6.2, 0xc9a23c);
    car(G, 0, 6, 0, { kind: 'camion' });
    chainFence(G, -19.6, 19.6, -4, 19.6); chainFence(G, 4, 19.6, 19.6, 19.6);
    chainFence(G, 19.6, 19.6, 19.6, 8); chainFence(G, -19.6, 19.6, -19.6, 4);
    b.mark('balas', 8, 0, 12);
  },

  /** Almacenes logísticos: dos naves, muelles con camiones y depósitos tumbados. */
  almacenes(G) {
    const { b, M, R } = G;
    b.hquad(M.asphalt, 0, 0.012, 0, 40, 40, { uv: 6 });
    b.push(-9.5, -3, Math.PI / 2); warehouse(G, 32, 18, { saw: false }); b.pop();
    b.push(11, -10, 0); warehouse(G, 16, 17, { saw: true, h: 7 }); b.pop();
    // Depósitos de combustible tumbados sobre cunas.
    for (const z of [12, 15.6]) {
      b.cyl(M.plain, 5, 1.7, z, 1.35, 9, { axis: 'x', sides: 12, color: 0xe4e4e0, both: true });
      for (const x of [6.5, 12.5]) b.box(M.concrete, x, 0, z, 0.6, 1.0, 2.6, { color: 0xa8a39a, uv: [2, 2] });
      b.solid(9.5, 0, z, 9, 3, 2.6);
    }
    car(G, 4.5, 3.5, Math.PI / 2, { kind: 'camion', cargo: 0x2a5d8f });
    car(G, 9, 4.5, Math.PI / 2 + 0.1, { kind: 'camion', cargo: 0xb5532a });
    for (let i = 0; i < 3; i++) crate(G, 15 + (i % 2) * 1.1, 4 + i * 0.6, 1);
    barrel(G, 17.5, 8); barrel(G, 18.2, 8.4, 0xc9a23c);
    chainFence(G, 1, 19.6, 19.6, 19.6); chainFence(G, 19.6, 19.6, 19.6, 9);
    b.mark('balas', 14, 0, 7);
  },

  /** Obra: estructura de hormigón a medio levantar, grúa torre y vallado de chapa. */
  obra(G) {
    const { b, M, R } = G;
    b.hquad(M.grass, 0, 0.012, 0, 40, 40, { uv: 5, color: 0xa08a68 });
    // Estructura: pilares y forjados (se puede pasar por debajo del primero).
    const fx = -6, fz = -5, W = 22, D = 18, fh = 3.6, floors = 6;
    for (let f = 1; f <= floors; f++) {
      b.box(M.concrete, fx, f * fh - 0.3, fz, W, 0.3, D, { color: 0xb5b0a6, uv: [3, 3], bottom: true, solid: f === 1 });
      if (f < floors) for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
        b.box(M.concrete, fx - W / 2 + 1 + (i * (W - 2)) / 3, f * fh, fz - D / 2 + 1 + (j * (D - 2)) / 2, 0.6, fh - 0.3, 0.6, { color: 0xa8a39a, uv: [2, 2], top: false });
      }
    }
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
      b.box(M.concrete, fx - W / 2 + 1 + (i * (W - 2)) / 3, 0, fz - D / 2 + 1 + (j * (D - 2)) / 2, 0.6, fh - 0.3, 0.6, { color: 0xa8a39a, uv: [2, 2], top: false, solid: true });
    }
    b.box(M.concrete, fx + 6, 0, fz - 4, 4, floors * fh + 2.5, 5, { color: 0x9a968e, uv: [3, 3], solid: true }); // núcleo de escaleras
    // Red de seguridad naranja en dos plantas.
    for (const f of [3, 5]) b.box(M.plain, fx, f * fh, fz + D / 2, W, 1.1, 0.03, { color: 0xe8701e });
    // Grúa torre.
    const cx = 13, cz = 10, H = 44, Y = 0xe0a81c;
    b.box(M.concrete, cx, 0, cz, 4, 0.6, 4, { color: 0x9a968e, uv: [2, 2], solid: true });
    for (const sx of [-0.8, 0.8]) for (const sz of [-0.8, 0.8]) b.box(M.plain, cx + sx, 0.6, cz + sz, 0.16, H, 0.16, { color: Y });
    for (let y = 2.5; y < H; y += 2.4) {
      b.box(M.plain, cx, y, cz + 0.8, 1.7, 0.1, 0.1, { color: Y }); b.box(M.plain, cx, y, cz - 0.8, 1.7, 0.1, 0.1, { color: Y });
      b.box(M.plain, cx + 0.8, y + 1.2, cz, 0.1, 0.1, 1.7, { color: Y }); b.box(M.plain, cx - 0.8, y + 1.2, cz, 0.1, 0.1, 1.7, { color: Y });
    }
    b.solid(cx, 0.6, cz, 1.8, 8, 1.8);
    b.push(cx, cz, 0.55, H);
    b.box(M.plain, 0, 0.6, 0, 2.2, 2.0, 2.2, { color: 0xf0f0ec }); // cabina
    b.box(M.plain, 0, 1.5, 1.11, 1.6, 0.9, 0.02, { color: 0x1a2229 });
    b.box(M.plain, -15, 2.6, 0, 46, 0.2, 0.2, { color: Y }); // pluma y contrapluma
    for (const s of [-0.55, 0.55]) b.box(M.plain, -18, 1.5, s, 36, 0.14, 0.14, { color: Y });
    for (let x = -35; x < 0; x += 2.2) b.box(M.plain, x, 1.5, 0, 0.1, 1.2, 1.2, { color: Y, top: false });
    b.box(M.plain, 6, 1.4, 0, 3.4, 1.6, 2.0, { color: 0x6a6f78 }); // contrapeso
    b.box(M.plain, 0, 2.6, 0, 0.3, 5, 0.3, { color: Y });
    b.box(M.plain, -22, -20, 0, 0.05, 21.5, 0.05, { color: 0x1c1c1f });
    b.box(M.plain, -22, -20.6, 0, 0.5, 0.6, 0.5, { color: 0xc8322b });
    b.pop();
    // Acopios, casetas y vallado.
    container(G, 13, -13, Math.PI / 2, 0xe4e4e0);
    for (const [x, z] of [[16, -4], [17.2, -4]]) b.box(M.plain, x, 0, z, 1.1, 2.3, 1.1, { color: 0x2a6d9f, solid: true });
    b.cyl(M.flat, 8, 0, 14, 2.6, 1.8, { r2: 0.2, sides: 8, color: 0xc9b07a, cap: false });
    b.cyl(M.flat, 3, 0, 15.5, 2.0, 1.3, { r2: 0.2, sides: 7, color: 0x8a8a86, cap: false });
    for (let i = 0; i < 5; i++) b.cyl(M.plain, -16, 0.26 + Math.floor(i / 3) * 0.48, 12 + (i % 3) * 0.52 + Math.floor(i / 3) * 0.26, 0.25, 6, { axis: 'x', sides: 8, color: 0x9ea3a8, both: true });
    b.solid(-13, 0, 12.5, 6, 0.9, 1.6);
    for (const [x, z] of [[-3, 9], [-2, 9.4], [-4.2, 9.2]]) cone(G, x, z);
    for (const [x0, z0, x1, z1] of [[-19.6, -19.6, 19.6, -19.6], [-19.6, -19.6, -19.6, 19.6], [19.6, -19.6, 19.6, 19.6], [-19.6, 19.6, -5, 19.6], [1, 19.6, 19.6, 19.6]]) {
      wallLine(G, x0, z0, x1, z1, 2.2, 0.08, M.metal, 0x3d6f9a);
    }
    b.mark('balas', -6, 0, -5);
  },

  /** Supermercado con aparcamiento. */
  super(G) {
    const { b, M, R, signs } = G;
    b.hquad(M.asphalt, 0, 0.012, 0, 40, 40, { uv: 6 });
    b.push(0, -11, 0);
    // Una nave diáfana con pasillos de estanterías: se entra rompiendo las lunas de la fachada.
    room(G, 38, 17, { h: 4.8, color: 0xe4dfd2, floorColor: 0xb9b6ae, sides: {
      front: [-15, -11, -7, -3, 3, 7, 11, 15].map((at) => ({ at, kind: 'front', w: 2.8 })),
      back: [{ at: 14, kind: 'door', leafColor: 0x6f7479 }],
    } });
    for (const x of [-13.5, -8.5, -3.5, 3.5, 8.5, 13.5]) {
      b.box(M.plain, x, 0, -1.6, 0.9, 1.8, 8.5, { color: 0x9ea3a8, solid: true });
      for (let k = 0; k < 3; k++) b.box(M.plain, x, 0.4 + k * 0.5, -1.6, 0.96, 0.28, 8.3, { color: pick(R, [0xc8322b, 0x2a4d8f, 0xd6a21e, 0x3d6b4a, 0xe8e8e4, 0xe8701e]), top: false });
    }
    for (const x of [-9, -3, 3, 9]) b.box(M.plain, x, 0, 6.1, 2.2, 0.95, 0.8, { color: 0x4a4f55, solid: true }); // cajas
    b.mark('balas', -11, 0, -6.5); b.mark('balas', 6, 0, -6.8); b.mark('balas', 16.5, 0, 4);
    b.box(M.concrete, 0, 5, 0, 38, 2, 17, { color: 0xe4dfd2, uv: [4, 3.5], top: M.roof, solid: true });
    b.box(M.plain, 0, 5.2, 0, 38.2, 1.0, 17.2, { color: 0xc8322b, top: false });
    b.box(M.plain, 0, 3.7, 9.6, 32, 0.25, 2.2, { color: 0xc8322b, bottom: true });
    for (let x = -15; x <= 15; x += 6) b.box(M.plain, x, 0, 10.5, 0.2, 3.7, 0.2, { color: 0xe4dfd2, solid: true });
    b.box(M.plain, 0, 7, 8.2, 12.4, 3.2, 0.3, { color: 0x1d2023 });
    b.vquad(M.signs, 0, 7.1, 8.36, 12, 3, { rect: signs.uv('SÚPER Z') });
    roofGear(G, 34, 14, 7);
    b.pop();
    parkingRow(G, 0, 3.5, 12); parkingRow(G, 0, 15, 12);
    for (const x of [-17, 17]) { lamp(G, x, 9.2, 0, 7, 0.2); }
    lamp(G, 0, 9.2, Math.PI, 7, 0.2);
    // Corral de carros.
    for (const x of [-8, 8]) { for (const s of [-0.7, 0.7]) b.box(M.plain, x + s, 0, 9.2, 0.06, 1.0, 2.6, { color: 0x8f959b, solid: true }); b.box(M.plain, x, 1.0, 9.2, 1.5, 0.06, 2.6, { color: 0x2a4d8f }); }
    car(G, -15, 9.4, 0.2, { kind: 'camion', cargo: 0xe4e4e0 });
    b.mark('balas', 4, 0, 9.2);
    b.mark('balas', -12, 0, 17.5);
  },

  /** Gasolinera con tienda y taller. */
  gasolinera(G) {
    const { b, M, R, signs } = G;
    b.hquad(M.concrete, 0, 0.012, 0, 40, 40, { uv: 5, color: 0xa8a39a });
    // Marquesina sobre los surtidores.
    b.push(2, 6, 0);
    b.box(M.plain, 0, 4.6, 0, 18, 0.7, 10, { color: 0xf0f0ec, bottom: true });
    b.box(M.plain, 0, 4.75, 0, 18.1, 0.3, 10.1, { color: 0xc8322b, top: false });
    b.box(M.lamp, 0, 4.56, 0, 12, 0.04, 5, { top: false, bottom: true });
    b.hquad(M.pool, 0, 0.03, 0, 22, 15, { rect: [0, 0, 1, 1] });
    b.mark('lamp', 0, 4.2, 0);
    for (const sx of [-7, 7]) for (const sz of [-3, 3]) b.box(M.plain, sx, 0, sz, 0.4, 4.6, 0.4, { color: 0xe4e4e0, solid: true });
    for (const sz of [-3, 3]) {
      b.box(M.concrete, 0, 0, sz, 9, 0.2, 1.3, { color: 0xc9c5bb, uv: [2, 2], solid: true });
      for (const sx of [-2.6, 2.6]) {
        b.box(M.plain, sx, 0.2, sz, 0.9, 1.7, 0.6, { color: 0xc8322b, solid: true });
        b.box(M.plain, sx, 1.2, sz, 0.92, 0.5, 0.62, { color: 0x1a2229, top: false });
        b.box(M.plain, sx, 1.9, sz, 1.0, 0.25, 0.7, { color: 0xf0f0ec });
      }
    }
    car(G, -3, 0, 0.05); car(G, 4, -5.8, Math.PI + 0.1, { kind: 'pickup' });
    b.pop();
    // Tienda.
    b.push(-4, -13, 0);
    room(G, 16, 9, { h: 3.2, color: 0xf0ece4, sides: { front: [-5.6, -2.2, 2.2, 5.6].map((at) => ({ at, kind: 'front' })) } });
    b.box(M.plain, 5, 0, -2.2, 3, 1.0, 0.7, { color: 0x4a4f55, solid: true });
    for (const x of [-4.5, -1]) b.box(M.plain, x, 0, -0.5, 0.7, 1.5, 4.5, { color: 0x9ea3a8, solid: true });
    b.box(M.concrete, 0, 3.4, 0, 16, 0.6, 9, { color: 0xf0ece4, uv: [3, 3], top: M.roof });
    b.box(M.plain, 0, 3.4, 0, 16.2, 0.7, 9.2, { color: 0xc8322b, top: false });
    b.vquad(M.signs, 0, 3.42, 4.62, 4.4, 0.66, { rect: signs.uv('24 H') });
    roofGear(G, 12, 6, 4);
    b.pop();
    // Taller con dos portones.
    b.push(12.5, -13, 0);
    b.box(M.metal, 0, 0, 0, 13, 5, 10, { color: 0x9fb3bd, uv: [2, 5], top: M.roof, solid: true });
    for (const x of [-3.2, 3.2]) b.vquad(M.details, x, 0, 5.03, 4.4, 3.8, { rect: SHUTTER });
    b.pop();
    // Poste de precios.
    b.box(M.plain, -17, 0, 16, 0.4, 7, 0.4, { color: 0xe4e4e0, solid: true });
    b.box(M.plain, -17, 4.2, 16, 3.4, 3.2, 0.5, { color: 0x1d2023 });
    b.vquad(M.signs, -17, 6.0, 16.26, 3.2, 1.2, { rect: signs.uv('GASOLINERA') });
    b.vquad(M.signs, -17, 6.0, 15.74, 3.2, 1.2, { rect: signs.uv('GASOLINERA'), rot: Math.PI });
    for (let i = 0; i < 3; i++) barrel(G, 17 + (i % 2) * 0.7, 2 + i * 0.6, pick(R, [0x2d4a6a, 0x8a3a2a, 0xc9a23c]));
    for (let i = 0; i < 4; i++) b.cyl(M.plain, -18, 0.3 + i * 0.22, -5, 0.34, 0.22, { sides: 12, color: 0x141517 });
    b.solid(-18, 0, -5, 0.7, 0.9, 0.7);
    car(G, 14, 3, 1.2, { kind: 'quemado' });
    b.mark('balas', -1, 0, -15.5);
    b.mark('balas', 10, 0, -6.5);
  },

  /** Hospital: bloque principal, dos alas, urgencias con ambulancias, carpas de triaje y helipuerto. */
  hospital(G) {
    const { b, M, R, signs } = G;
    b.hquad(M.concrete, 0, 0.012, 0, 40, 40, { uv: 4, color: 0xb5b0a6 });
    const fh = 3.3, floors = 6, h = floors * fh;
    b.push(0, -11, 0);
    b.box(M.office, 0, 0, 0, 38, h, 15, { cells: [3.2, fh], color: 0xf4f4f0, cu: 1, cv: 2, top: M.roof, solid: true });
    b.box(M.concrete, 0, h, 0, 38.5, 0.8, 15.5, { color: 0xe4e2dc, uv: [3, 3], top: M.roof });
    b.box(M.plain, 0, fh * 4, 7.6, 9, 2.6, 0.3, { color: 0x1d2023 });
    b.vquad(M.signs, 0, fh * 4 + 0.15, 7.76, 8.6, 2.3, { rect: signs.uv('HOSPITAL') });
    for (const x of [-14, 14]) b.vquad(M.details, x, fh * 4.4, 7.53, 3, 3, { rect: CROSS });
    // Helipuerto.
    b.cyl(M.plain, 8, h + 0.8, 0, 5.5, 0.15, { sides: 18, color: 0x3d4045, capColor: 0x3d4045 });
    for (const s of [-1.2, 1.2]) b.hquad(M.mark, 8 + s, h + 0.97, 0, 0.5, 4, { color: 0xf0f0e8 });
    b.hquad(M.mark, 8, h + 0.97, 0, 2.4, 0.5, { color: 0xf0f0e8 });
    roofGear(G, 14, 10, h + 0.8);
    b.pop();
    for (const s of [-1, 1]) {
      b.push(s * 14, 2.5, s > 0 ? 0 : 0);
      b.box(M.office, 0, 0, 0, 10, fh * 3, 12, { cells: [3.2, fh], color: 0xf4f4f0, cu: 2, top: M.roof, solid: true });
      b.box(M.concrete, 0, fh * 3, 0, 10.4, 0.6, 12.4, { color: 0xe4e2dc, uv: [3, 3], top: M.roof });
      b.pop();
    }
    // Urgencias: marquesina, puertas y ambulancias.
    b.box(M.plain, 0, 3.4, -1.2, 14, 0.3, 5, { color: 0xc8322b, bottom: true });
    b.box(M.lamp, 0, 3.36, -1.2, 9, 0.04, 2.4, { top: false, bottom: true });
    b.hquad(M.pool, 0, 0.03, -1, 16, 12, { rect: [0, 0, 1, 1] });
    b.mark('lamp', 0, 3.1, -1.2);
    for (const x of [-6.6, 6.6]) b.box(M.plain, x, 0, 1, 0.3, 3.4, 0.3, { color: 0xe4e4e0, solid: true });
    b.vquad(M.details, 0, 0, -3.46, 3.6, 2.6, { rect: GLASS_DOOR });
    car(G, -3.5, 4.5, 0.15, { kind: 'ambulancia' }); car(G, 4, 7, Math.PI - 0.3, { kind: 'ambulancia' });
    tent(G, -8, 14.5, Math.PI, 0xe8e6e0); tent(G, 0, 15, Math.PI, 0xe8e6e0); tent(G, 8, 14.5, Math.PI, 0xe8e6e0);
    barrier(G, -13, 18.5, 0); barrier(G, 13, 18.5, 0);
    for (let i = 0; i < 3; i++) crate(G, -17.5, 12 + i * 1.1, 0.9);
    b.mark('balas', 0, 0, 11);
    b.mark('balas', 16.5, 0, 16);
  },

  /** Escuela: aulario en L, patio con pista, columpios, autobús y bandera. */
  escuela(G) {
    const { b, M, R, signs } = G;
    b.hquad(M.concrete, 0, 0.012, 0, 40, 40, { uv: 4, color: 0xb0aba1 });
    b.push(0, -13.5, 0);
    b.box(M.brick, 0, 0, 0, 38, 7.2, 11, { cells: [3.1, 3.6], color: 0xc4705a, cu: 2, top: M.roof, solid: true });
    b.box(M.concrete, 0, 7.2, 0, 38.6, 0.5, 11.6, { color: 0xe4dfd2, uv: [3, 3], top: M.roof });
    b.box(M.concrete, 0, 0, 6.2, 7, 4.2, 1.6, { color: 0xe4dfd2, uv: [3, 3], solid: true });
    b.vquad(M.details, 0, 0, 7.03, 3.2, 2.7, { rect: GLASS_DOOR });
    b.vquad(M.signs, 0, 3.0, 7.03, 4.6, 0.9, { rect: signs.uv('ESCUELA') });
    roofGear(G, 30, 8, 7.7);
    b.pop();
    b.push(-13.5, -1, 0);
    b.box(M.brick, 0, 0, 0, 11, 7.2, 14, { cells: [3.1, 3.6], color: 0xc4705a, cu: 1, top: M.roof, solid: true });
    b.box(M.concrete, 0, 7.2, 0, 11.6, 0.5, 14.6, { color: 0xe4dfd2, uv: [3, 3], top: M.roof });
    b.pop();
    // Pista de baloncesto.
    b.hquad(M.concrete, 6, 0.02, 4, 22, 13, { uv: 4, color: 0x7fa0b8 });
    for (const [x, z, sx, sz] of [[6, -2.4, 22, 0.1], [6, 10.4, 22, 0.1], [-5, 4, 0.1, 13], [17, 4, 0.1, 13], [6, 4, 0.1, 13]]) b.hquad(M.mark, x, 0.03, z, sx, sz, { color: 0xf0f0e8 });
    for (const s of [-1, 1]) {
      b.box(M.plain, 6 + s * 11.6, 0, 4, 0.16, 3.1, 0.16, { color: DARK, solid: true });
      b.box(M.plain, 6 + s * 11.1, 3.0, 4, 1.0, 0.1, 0.1, { color: DARK });
      b.vquad(M.details, 6 + s * 10.6, 2.6, 4, 1.8, 1.1, { rect: BOARD, rot: -s * Math.PI / 2, both: true });
    }
    // Bandera, autobús y columpios.
    b.box(M.plain, -4, 0, 14, 0.12, 8, 0.12, { color: 0xb9bec4, solid: true });
    b.box(M.plain, -3.2, 6.7, 14, 1.5, 1.0, 0.03, { color: 0xc8322b });
    car(G, 8, 15.5, 0.04, { kind: 'bus' });
    for (const s of [-1.3, 1.3]) b.box(M.plain, -13 + s, 0, 12, 0.08, 2.2, 0.08, { color: 0x2a4d8f, solid: true });
    b.box(M.plain, -13, 2.2, 12, 2.8, 0.08, 0.08, { color: 0x2a4d8f });
    for (const s of [-0.6, 0.6]) { b.box(M.plain, -13 + s, 0.55, 12, 0.02, 1.65, 0.02, { color: DARK }); b.box(M.plain, -13 + s, 0.5, 12, 0.4, 0.04, 0.2, { color: 0xc8322b }); }
    tree(G, -17, 17); tree(G, 17.5, -4.5);
    bench(G, -8, 9, Math.PI / 2);
    chainFence(G, -19.6, 19.6, -2, 19.6, 1.6); chainFence(G, 19.6, 19.6, 19.6, -7, 1.6);
    b.mark('balas', 6, 0, 4);
  },

  /** Iglesia con campanario y cementerio. */
  iglesia(G) {
    const { b, M, R } = G;
    b.hquad(M.grass, 0, 0.012, 0, 40, 40, { uv: 4, color: 0xd8dcc0 });
    const stone = 0xbcb6a8, slate = 0x4a4f58;
    b.push(-8, -2, 0);
    b.box(M.concrete, 0, 0, 0, 10, 8.5, 24, { color: stone, uv: [3, 3], top: false, solid: true });
    b.prism(M.tiles, 0, 8.5, 0, 24.8, 10.8, 5.5, { rot: Math.PI / 2, color: slate, gable: M.concrete, gableColor: stone });
    for (const s of [-1, 1]) {
      b.push(0, 0, (s * Math.PI) / 2);
      for (let x = -9; x <= 9; x += 4.5) {
        b.vquad(M.details, x, 2.4, 5.03, 1.5, 3.6, { rect: STAINED });
        b.box(M.concrete, x + 2.25, 0, 5.3, 0.7, 6.5, 0.9, { color: mix(stone, 0x808080, 0.2), uv: [2, 2] }); // contrafuertes
      }
      b.pop();
    }
    // Campanario delante, con chapitel y cruz.
    b.box(M.concrete, 0, 0, 14, 5.4, 17, 5.4, { color: stone, uv: [3, 3], top: false, solid: true });
    for (const rot of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) { b.push(0, 14, rot); b.box(M.plain, 0, 12.5, 2.71, 1.4, 2.6, 0.03, { color: 0x14181c }); b.pop(); }
    b.box(M.concrete, 0, 17, 14, 6, 0.5, 6, { color: mix(stone, 0x808080, 0.2), uv: [3, 3] });
    b.cyl(M.tiles, 0, 17.5, 14, 4.1, 9, { r2: 0, sides: 4, phase: Math.PI / 4, color: slate, cap: false, uv: 3 });
    b.box(M.plain, 0, 26.2, 14, 0.14, 1.8, 0.14, { color: 0xc9ad5a }); b.box(M.plain, 0, 27.2, 14, 0.9, 0.14, 0.14, { color: 0xc9ad5a });
    b.vquad(M.details, 0, 0, 16.73, 2.4, 3.6, { rect: DOOR, color: 0x5a3d28 });
    b.vquad(M.details, 0, 5.5, 16.73, 1.6, 3.2, { rect: STAINED });
    b.box(M.concrete, 0, 0, 17.6, 4.4, 0.2, 1.8, { color: 0xa8a39a, uv: [2, 2], solid: true });
    b.pop();
    // Cementerio: lápidas en hileras, cruces, panteón y cipreses.
    for (let i = 0; i < 5; i++) for (let j = 0; j < 7; j++) {
      if (R() < 0.15) continue;
      const x = 3 + i * 3.4 + rr(R, -0.2, 0.2), z = -16 + j * 4.2 + rr(R, -0.3, 0.3), tilt = rr(R, -0.12, 0.12);
      b.hquad(M.grass, x, 0.02, z + 1.1, 0.9, 1.9, { color: 0x9a8a6a, uv: 2, rot: tilt });
      if (R() < 0.7) {
        b.box(M.concrete, x, 0, z, 0.6, rr(R, 0.7, 1.0), 0.16, { color: pick(R, [0xa8a39a, 0x8d8a84, 0xc9c5bb]), uv: [1.5, 1.5], rot: tilt, solid: true });
      } else {
        b.box(M.concrete, x, 0, z, 0.16, 1.3, 0.16, { color: 0xa8a39a, uv: [1.5, 1.5], rot: tilt, solid: true });
        b.box(M.concrete, x, 0.8, z, 0.7, 0.16, 0.16, { color: 0xa8a39a, uv: [1.5, 1.5], rot: tilt });
      }
    }
    b.push(17, 16, -Math.PI / 2);
    b.box(M.concrete, 0, 0, 0, 3.4, 3, 3.4, { color: stone, uv: [3, 3], top: false, solid: true });
    b.prism(M.concrete, 0, 3, 0, 3.8, 3.8, 1.2, { color: mix(stone, 0x606060, 0.3) });
    b.vquad(M.details, 0, 0, 1.73, 1.1, 2.1, { rect: DOOR, color: 0x3a3d40 });
    b.pop();
    for (const [x, z] of [[1, -18], [19, -18.5], [19, -2], [1.5, 17]]) pine(G, x, z);
    // Tapia baja con la entrada frente a la iglesia.
    const c = mix(stone, 0x808080, 0.25);
    wallLine(G, -19.7, -19.7, 19.7, -19.7, 0.95, 0.3, M.concrete, c, c); wallLine(G, 19.7, -19.7, 19.7, 19.7, 0.95, 0.3, M.concrete, c, c);
    wallLine(G, -19.7, -19.7, -19.7, 19.7, 0.95, 0.3, M.concrete, c, c);
    wallLine(G, -19.7, 19.7, -11, 19.7, 0.95, 0.3, M.concrete, c, c); wallLine(G, -5, 19.7, 19.7, 19.7, 0.95, 0.3, M.concrete, c, c);
    post(G, -3, 15.5); post(G, 10, 0);
    b.mark('balas', 10, 0, 12);
  },

  /** Parque: caminos en cruz, fuente, arboleda, estanque, templete y juegos. */
  parque(G) {
    const { b, M, R } = G;
    b.hquad(M.grass, 0, 0.012, 0, 40, 40, { uv: 4 });
    b.hquad(M.pavers, 0, 0.022, 0, 40, 3, { uv: 3 });
    b.hquad(M.pavers, 0, 0.024, 0, 3, 40, { uv: 3 });
    b.cyl(M.pavers, 0, 0, 0, 6.5, 0.03, { sides: 20 });
    fountain(G, 0, 0);
    for (const a of [0.8, 2.35, 3.95, 5.5]) bench(G, Math.sin(a) * 5.4, Math.cos(a) * 5.4, a + Math.PI);
    for (let i = 0; i < 16; i++) {
      const x = rr(R, -18, 18), z = rr(R, -18, 18);
      if (Math.abs(x) < 3 || Math.abs(z) < 3 || Math.hypot(x, z) < 8 || (x > 6 && z > 6)) continue;
      (R() < 0.3 ? pine : tree)(G, x, z);
    }
    // Estanque.
    b.cyl(M.concrete, 12.5, 0, 12.5, 5.2, 0.12, { sides: 14, color: 0xa8a39a, uv: 3 });
    b.cyl(M.water, 12.5, 0.13, 12.5, 4.8, 0.01, { sides: 14 });
    b.solid(12.5, 0, 12.5, 6.8, 0.4, 6.8, Math.PI / 4);
    // Templete.
    b.push(-12, -12, 0);
    b.cyl(M.concrete, 0, 0, 0, 3.4, 0.4, { sides: 8, color: 0xc9c3b6, uv: 3, solid: true });
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; b.box(M.plain, Math.sin(a) * 3, 0.4, Math.cos(a) * 3, 0.14, 2.6, 0.14, { color: 0xf2efe6 }); }
    b.cyl(M.tiles, 0, 3.0, 0, 3.9, 1.8, { r2: 0.1, sides: 8, color: 0x4f5a52, cap: false, uv: 3 });
    b.pop();
    // Juegos: tobogán y columpio.
    b.push(-12, 12, 0);
    b.hquad(M.grass, 0, 0.02, 0, 9, 7, { color: 0xd8c08a, uv: 3 });
    for (const s of [-1.3, 1.3]) b.box(M.plain, s - 2, 0, 0, 0.08, 2.2, 0.08, { color: 0xc8322b, solid: true });
    b.box(M.plain, -2, 2.2, 0, 2.8, 0.08, 0.08, { color: 0xc8322b });
    for (const s of [-0.6, 0.6]) { b.box(M.plain, -2 + s, 0.55, 0, 0.02, 1.65, 0.02, { color: DARK }); b.box(M.plain, -2 + s, 0.5, 0, 0.4, 0.04, 0.2, { color: 0xd6a21e }); }
    b.box(M.plain, 2.6, 0, -1, 1.2, 1.6, 1.2, { color: 0x2a4d8f, solid: true });
    b.wedge(M.plain, 2.6, 0.2, 1.1, 0.8, 3, 1.4, { rot: Math.PI, color: 0xd6a21e });
    b.pop();
    for (const [x, z] of [[-6, -6], [6, -6], [-6, 6], [6, 6], [-17, 0], [17, 0], [0, -17], [0, 17]]) post(G, x, z);
    for (const [x, z] of [[2.2, -12], [-2.2, 12], [12, -2.2]]) bin(G, x, z);
    // Murete bajo en dos lados (cobertura muy baja).
    wallLine(G, -19.7, -19.7, -4, -19.7, 0.45, 0.4, M.concrete, 0xb5b0a6); wallLine(G, 4, -19.7, 19.7, -19.7, 0.45, 0.4, M.concrete, 0xb5b0a6);
    wallLine(G, 19.7, -19.7, 19.7, -4, 0.45, 0.4, M.concrete, 0xb5b0a6); wallLine(G, 19.7, 4, 19.7, 19.7, 0.45, 0.4, M.concrete, 0xb5b0a6);
    b.mark('balas', -12, 0, -12);
    b.mark('balas', 8, 0, -9);
  },

  /** Plaza central: monumento, fuente y un puesto de control militar abandonado. Aquí empieza la partida. */
  plaza(G) {
    const { b, M, R } = G;
    b.hquad(M.pavers, 0, 0.012, 0, 40, 40, { uv: 3 });
    // Monumento: gradas y obelisco.
    b.box(M.concrete, 0, 0, 0, 7, 0.3, 7, { color: 0xc9c3b6, uv: [3, 3], solid: true });
    b.box(M.concrete, 0, 0.3, 0, 5.2, 0.3, 5.2, { color: 0xbdb7ab, uv: [3, 3], solid: true });
    b.box(M.concrete, 0, 0.6, 0, 2.6, 1.6, 2.6, { color: 0xd8d2c4, uv: [3, 3], solid: true });
    b.cyl(M.concrete, 0, 2.2, 0, 1.3, 10, { r2: 0.75, sides: 4, phase: Math.PI / 4, color: 0xe4dfd2, cap: false, uv: 3 });
    b.cyl(M.concrete, 0, 12.2, 0, 0.75, 1.4, { r2: 0, sides: 4, phase: Math.PI / 4, color: 0xc9ad5a, cap: false });
    b.solid(0, 2.2, 0, 1.6, 10, 1.6);
    for (const [x, z] of [[-13, -13], [13, -13]]) fountain(G, x, z, 2.6);
    for (const [x, z] of [[-17, 17], [17, 17], [-17, -4], [17, -4], [-6, -17.5], [6, -17.5]]) tree(G, x, z);
    for (const x of [-9, 9]) { bench(G, x, -7, 0); planter(G, x, -9.2); }
    for (const [x, z] of [[-7, 7], [7, 7], [-7, -7], [7, -7], [0, -15], [-16, 6], [16, 6]]) post(G, x, z);
    // Puesto de control: carpas, sacos terreros, barreras, camión y cajas de suministros.
    tent(G, -12, 4, Math.PI / 2); tent(G, -12, 9.5, Math.PI / 2);
    tent(G, 12.5, 6.5, -Math.PI / 2, 0x5d6b47, 5.4, 3.6);
    sandbags(G, -4.5, 14.5, 0, 4.2); sandbags(G, 4.5, 14.5, 0, 4.2);
    sandbags(G, -8.2, 12.6, Math.PI / 2 + 0.5, 3); sandbags(G, 8.2, 12.6, Math.PI / 2 - 0.5, 3);
    barrier(G, -13, 17.5, 0); barrier(G, -9.8, 17.5, 0); barrier(G, 9.8, 17.5, 0); barrier(G, 13, 17.5, 0);
    car(G, 13, -9.5, Math.PI / 2 + 0.2, { kind: 'militar' });
    for (const [x, z, s] of [[5.5, 9, 1.0], [6.7, 9.2, 0.9], [6, 9.1, 0.8]]) crate(G, x, z, s, s === 0.8 ? 1.0 : 0);
    crate(G, -5.6, 9, 1.0); barrel(G, -6.9, 9.3, 0x4f5a3a); barrel(G, -7.4, 8.6, 0x4f5a3a);
    car(G, -3, -12.6, 0.25, { kind: 'policia' });
    for (const [x, z] of [[-2, 18.5], [0, 18.8], [2, 18.5]]) cone(G, x, z);
    // Focos del puesto.
    lamp(G, -15.5, 13.5, Math.PI * 0.75, 7.5, 0.4); lamp(G, 15.5, 13.5, -Math.PI * 0.75, 7.5, 0.4);
    b.mark('spawn', 0, 0, 9);
    b.mark('pistola', 3, 0, 5.5);
    b.mark('bate', -3, 0, 5.5);
    b.mark('balas', 5.4, 0, 7.4);
    b.mark('balas', -12, 0, 6.8);
    b.mark('balas', 12.5, 0, 6.5);
  },
};

/** Barricada militar cruzando media calle (a lo largo de X local). */
export function roadblock(G, x, z, rot) {
  const { b } = G;
  b.push(x, z, rot);
  barrier(G, -2.8, 0, 0); barrier(G, 0, 0.2, 0.06); barrier(G, 2.8, -0.1, -0.04);
  sandbags(G, 0, -1.6, 0, 3.2, 4);
  cone(G, -4.6, 0.3); cone(G, 4.6, -0.2);
  b.pop();
}
