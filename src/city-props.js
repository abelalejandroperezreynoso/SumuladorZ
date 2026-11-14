// Mobiliario urbano, vegetación y vehículos de la ciudad. Cada función recibe `G`
// ({ b: Batch, M: materiales, R: azar repetible, signs }) y dibuja en el marco actual de `b`.
// Lo que estorba el paso lleva su bloque de choque: sirve de cobertura como cualquier muro.

export const pick = (R, list) => list[Math.floor(R() * list.length)];
export const rr = (R, a, b) => a + R() * (b - a);

const DARK = 0x2b2f33, STEEL = 0x8f959b, BARK = 0x5a4330;
const GREENS = [0x4f7a3a, 0x3d6230, 0x5c8a3c, 0x47703a, 0x6a8f45];
export const CAR_COLORS = [0xc8322b, 0x2a4d8f, 0xe8e8e4, 0x1c1c1f, 0x8a8f96, 0x3d6b4a, 0xd6a21e, 0x6b2f2f, 0x4f7fa8, 0xb9b3a4];

/** Farola de brazo: poste en (x, z) y la luz `reach` m hacia +Z local. Anota la luz como `lamp`. */
export function lamp(G, x, z, rot = 0, h = 6.2, reach = 1.5) {
  const { b, M } = G;
  b.push(x, z, rot);
  b.box(M.plain, 0, 0, 0, 0.3, 0.6, 0.3, { color: DARK });
  b.box(M.plain, 0, 0.6, 0, 0.13, h - 0.6, 0.13, { color: 0x3a4046 });
  b.solid(0, 0, 0, 0.22, h, 0.22);
  b.box(M.plain, 0, h - 0.1, reach / 2, 0.09, 0.09, reach + 0.2, { color: 0x3a4046 });
  b.box(M.plain, 0, h - 0.2, reach, 0.36, 0.14, 0.78, { color: DARK });
  b.box(M.lamp, 0, h - 0.25, reach, 0.28, 0.05, 0.66, { bottom: true, top: false });
  b.hquad(M.pool, 0, 0.03, reach, 12, 12, { rect: [0, 0, 1, 1] });
  b.mark('lamp', 0, h - 0.5, reach);
  b.pop();
}

/** Farol de parque: bajo, con la luz encima del poste. */
export function post(G, x, z) {
  const { b, M } = G;
  b.box(M.plain, x, 0, z, 0.2, 0.3, 0.2, { color: DARK });
  b.box(M.plain, x, 0.3, z, 0.1, 3.0, 0.1, { color: 0x3a4046 });
  b.solid(x, 0, z, 0.18, 3.3, 0.18);
  b.box(M.lamp, x, 3.3, z, 0.36, 0.34, 0.36, { bottom: true });
  b.box(M.plain, x, 3.64, z, 0.46, 0.06, 0.46, { color: DARK });
  b.hquad(M.pool, x, 0.03, z, 9, 9, { rect: [0, 0, 1, 1] });
  b.mark('lamp', x, 3.2, z);
}

/** Árbol de hoja ancha: tronco y tres copas irregulares. */
export function tree(G, x, z, h = 0) {
  const { b, M, R } = G;
  h = h || rr(R, 4.2, 6.5);
  const r = rr(R, 1.5, 2.3), green = pick(R, GREENS), seed = R() * 100;
  b.cyl(M.plain, x, 0, z, 0.2, h * 0.62, { r2: 0.13, sides: 6, color: BARK, cap: false, solid: true });
  b.blob(M.flat, x, h * 0.72, z, r, { color: green, seed });
  b.blob(M.flat, x + r * 0.55, h * 0.62, z + r * 0.3, r * 0.68, { color: pick(R, GREENS), seed: seed + 3 });
  b.blob(M.flat, x - r * 0.5, h * 0.66, z - r * 0.35, r * 0.72, { color: pick(R, GREENS), seed: seed + 7 });
}

/** Conífera: tronco y tres conos apilados. */
export function pine(G, x, z, h = 0) {
  const { b, M, R } = G;
  h = h || rr(R, 5.5, 8);
  const c = pick(R, [0x2f5236, 0x35603c, 0x2a4a34]);
  b.cyl(M.plain, x, 0, z, 0.16, h * 0.3, { sides: 6, color: BARK, cap: false, solid: true });
  for (let i = 0; i < 3; i++) b.cyl(M.flat, x, h * (0.22 + i * 0.24), z, h * (0.26 - i * 0.06), h * 0.36, { r2: 0, sides: 7, color: c, cap: false });
}

/** Arbusto: no choca (se pasa apartando las ramas). */
export function bush(G, x, z, r = 0.6) {
  const { b, M, R } = G;
  b.blob(M.flat, x, r * 0.6, z, r, { color: pick(R, GREENS), seed: R() * 100, sy: 0.8 });
  b.blob(M.flat, x + r * 0.6, r * 0.45, z + r * 0.2, r * 0.7, { color: pick(R, GREENS), seed: R() * 100, sy: 0.8 });
}

/** Banco con respaldo, mirando a +Z local. Cobertura muy baja. */
export function bench(G, x, z, rot = 0) {
  const { b, M } = G;
  b.push(x, z, rot);
  b.box(M.plain, 0, 0.4, 0, 1.8, 0.07, 0.48, { color: 0x7a5a3a, bottom: true });
  b.box(M.plain, 0, 0.5, -0.24, 1.8, 0.42, 0.06, { color: 0x7a5a3a });
  for (const s of [-0.75, 0.75]) b.box(M.plain, s, 0, 0, 0.08, 0.4, 0.44, { color: DARK });
  b.solid(0, 0, 0, 1.8, 0.5, 0.5);
  b.pop();
}

export function bin(G, x, z) {
  const { b, M } = G;
  b.cyl(M.plain, x, 0, z, 0.27, 0.85, { sides: 8, color: 0x35503d, capColor: 0x1a1d1f, solid: true });
}

export function hydrant(G, x, z) {
  const { b, M } = G;
  b.cyl(M.plain, x, 0, z, 0.13, 0.55, { sides: 8, color: 0xc8322b, solid: true });
  b.cyl(M.plain, x, 0.55, z, 0.15, 0.12, { r2: 0.05, sides: 8, color: 0xc8322b });
  b.box(M.plain, x, 0.3, z, 0.42, 0.12, 0.12, { color: 0xb02a24 });
}

/** Jardinera de hormigón con arbustos. */
export function planter(G, x, z, w = 2.4, d = 1) {
  const { b, M } = G;
  b.box(M.concrete, x, 0, z, w, 0.58, d, { color: 0xbdb7ab, uv: [2, 2], topColor: 0x3a2d22, top: M.plain, solid: true });
  for (let i = 0; i < Math.round(w / 0.9); i++) bush(G, x - w / 2 + 0.5 + i * 0.9, z, 0.42);
}

/** Barrera de hormigón (tipo New Jersey), a lo largo de X local. Cobertura baja. */
export function barrier(G, x, z, rot = 0, len = 2.6) {
  const { b, M } = G;
  b.push(x, z, rot);
  b.box(M.concrete, 0, 0, 0, len, 0.34, 0.62, { color: 0xc9c5bb, uv: [2, 2] });
  b.box(M.concrete, 0, 0.34, 0, len, 0.56, 0.3, { color: 0xc9c5bb, uv: [2, 2] });
  b.box(M.plain, 0, 0.5, 0, len * 0.5, 0.22, 0.32, { color: 0xd98a1e, top: false });
  b.solid(0, 0, 0, len, 0.9, 0.5);
  b.pop();
}

/** Parapeto de sacos terreros a lo largo de X local: `len` m de largo y `rows` hiladas. Cobertura baja. */
export function sandbags(G, x, z, rot = 0, len = 3.6, rows = 5) {
  const { b, M, R } = G;
  b.push(x, z, rot);
  const n = Math.round(len / 0.62);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < n - (j % 2); i++) {
      const k = 0.85 + R() * 0.25;
      const c = (Math.round(0xb0 * k) << 16) | (Math.round(0x9c * k) << 8) | Math.round(0x74 * k);
      b.box(M.plain, -len / 2 + 0.31 + i * 0.62 + (j % 2) * 0.31, j * 0.21, (R() - 0.5) * 0.05, 0.58, 0.2, 0.36, { color: c });
    }
  }
  b.solid(0, 0, 0, len, rows * 0.21, 0.4);
  b.pop();
}

export function dumpster(G, x, z, rot = 0) {
  const { b, M, R } = G;
  b.push(x, z, rot);
  const c = pick(R, [0x2f5a3c, 0x2d4a6a, 0x5a5d60]);
  b.box(M.plain, 0, 0.12, 0, 1.9, 1.05, 1.0, { color: c });
  b.box(M.plain, 0, 1.17, 0, 1.96, 0.07, 1.06, { color: 0x1d2023 });
  for (const s of [-0.8, 0.8]) b.box(M.plain, s, 0, 0, 0.12, 0.12, 0.8, { color: 0x16171a });
  b.solid(0, 0, 0, 1.9, 1.24, 1.0);
  b.pop();
}

export function crate(G, x, z, s = 1, y = 0, rot = 0) {
  const { b, M } = G;
  b.box(M.plain, x, y, z, s, s, s, { color: 0x9a7448, rot, solid: true });
  b.box(M.plain, x, y + s * 0.42, z, s * 1.03, s * 0.12, s * 1.03, { color: 0x7a5a3a, rot, top: false });
}

export function barrel(G, x, z, color = 0x2d4a6a) {
  const { b, M } = G;
  b.cyl(M.plain, x, 0, z, 0.3, 0.9, { sides: 10, color, capColor: 0x1a1d1f, solid: true });
  b.cyl(M.plain, x, 0.42, z, 0.315, 0.06, { sides: 10, color: 0x1a1d1f, cap: false });
}

export function cone(G, x, z) {
  const { b, M } = G;
  b.box(M.plain, x, 0, z, 0.36, 0.04, 0.36, { color: 0xd9611e });
  b.cyl(M.plain, x, 0.04, z, 0.14, 0.5, { r2: 0.03, sides: 8, color: 0xe8701e });
  b.cyl(M.plain, x, 0.24, z, 0.105, 0.1, { r2: 0.085, sides: 8, color: 0xf2f2ee, cap: false });
}

/** Marquesina de autobús, abierta hacia +Z local. */
export function busStop(G, x, z, rot = 0) {
  const { b, M } = G;
  b.push(x, z, rot);
  b.box(M.plain, 0, 2.35, 0, 3.6, 0.1, 1.5, { color: 0x3a4046, bottom: true });
  b.box(M.plain, 0, 0.25, -0.7, 3.5, 2.1, 0.06, { color: 0x9fc3d6, solid: true });
  for (const s of [-1.75, 1.75]) b.box(M.plain, s, 0, -0.7, 0.08, 2.35, 0.08, { color: DARK });
  b.box(M.plain, 1.75, 0.25, -0.1, 0.06, 2.1, 1.1, { color: 0x9fc3d6, solid: true });
  b.box(M.plain, -0.3, 0.42, -0.4, 2.2, 0.07, 0.4, { color: 0x7a5a3a, bottom: true });
  b.box(M.plain, -1.95, 0, 0.5, 0.08, 2.7, 0.08, { color: DARK });
  b.box(M.plain, -1.95, 2.3, 0.5, 0.5, 0.5, 0.06, { color: 0x2a4d8f });
  b.pop();
}

/** Semáforo: poste en (x, z) con el brazo hacia +Z local, sobre la calzada. */
export function trafficLight(G, x, z, rot = 0) {
  const { b, M } = G;
  b.push(x, z, rot);
  b.box(M.plain, 0, 0, 0, 0.16, 5.4, 0.16, { color: DARK, solid: true });
  b.box(M.plain, 0, 5.2, 1.9, 0.1, 0.1, 3.8, { color: DARK });
  for (const zz of [1.6, 3.5]) {
    b.box(M.plain, 0, 4.3, zz, 0.3, 0.9, 0.28, { color: 0x16171a });
    [0xb02a24, 0xd6a21e, 0x2f8a4a].forEach((c, i) => b.box(M.plain, 0.16, 4.94 - i * 0.28, zz, 0.02, 0.18, 0.18, { color: c, top: false }));
  }
  b.pop();
}

/** Valla de malla de alambre de (x0, z0) a (x1, z1), con postes. Alta: se escala o se rodea. */
export function chainFence(G, x0, z0, x1, z1, h = 2.2) {
  const { b, M } = G;
  const len = Math.hypot(x1 - x0, z1 - z0), rot = Math.atan2(-(z1 - z0), x1 - x0);
  b.push((x0 + x1) / 2, (z0 + z1) / 2, rot);
  b.vquad(M.chain, 0, 0, 0, len, h, { uv: [0.5, 0.5] });
  b.box(M.plain, 0, h, 0, len, 0.06, 0.06, { color: STEEL });
  for (let i = 0; i <= Math.ceil(len / 3); i++) b.box(M.plain, -len / 2 + (i * len) / Math.ceil(len / 3), 0, 0, 0.08, h + 0.1, 0.08, { color: STEEL });
  b.solid(0, 0, 0, len, h, 0.1);
  b.pop();
}

/** Muro o valla maciza de (x0, z0) a (x1, z1). */
export function wallLine(G, x0, z0, x1, z1, h, t, mat, color, cap = 0) {
  const { b } = G;
  const len = Math.hypot(x1 - x0, z1 - z0), rot = Math.atan2(-(z1 - z0), x1 - x0);
  b.push((x0 + x1) / 2, (z0 + z1) / 2, rot);
  b.box(mat, 0, 0, 0, len, h, t, { color, uv: [2.5, 2.5], solid: true });
  if (cap) b.box(mat, 0, h, 0, len + 0.06, 0.08, t + 0.12, { color: cap, uv: [2.5, 2.5] });
  b.pop();
}

/** Valla de estacas blancas de (x0, z0) a (x1, z1). Cobertura baja. */
export function picket(G, x0, z0, x1, z1, color = 0xf2efe6) {
  const { b, M } = G;
  const len = Math.hypot(x1 - x0, z1 - z0), rot = Math.atan2(-(z1 - z0), x1 - x0);
  b.push((x0 + x1) / 2, (z0 + z1) / 2, rot);
  for (const y of [0.3, 0.72]) b.box(M.plain, 0, y, 0, len, 0.07, 0.04, { color });
  const n = Math.round(len / 0.24);
  for (let i = 0; i <= n; i++) b.box(M.plain, -len / 2 + (i * len) / n, 0.05, 0.03, 0.1, 0.95, 0.025, { color });
  b.solid(0, 0, 0, len, 1.0, 0.1);
  b.pop();
}

/**
 * Vehículo abandonado en (x, z), con el morro hacia +X local más `rot`. `kind`: sedan, taxi,
 * policia, van, ambulancia, pickup, bus, camion, militar o quemado.
 */
export function car(G, x, z, rot = 0, o = {}) {
  const { b, M, R } = G;
  const kind = o.kind ?? pick(R, ['sedan', 'sedan', 'sedan', 'sedan', 'van', 'pickup', 'taxi', 'quemado']);
  const burnt = kind === 'quemado';
  let color = o.color ?? pick(R, CAR_COLORS);
  if (kind === 'taxi') color = 0xe8b61a;
  if (kind === 'policia' || kind === 'ambulancia') color = 0xf0f0ec;
  if (kind === 'militar') color = 0x4f5a3a;
  if (burnt) color = 0x26221f;
  const glass = burnt ? 0x14110f : 0x1a2229, tire = 0x141517;
  b.push(x, z, rot, o.y ?? 0);
  const wheels = (xs, hw, r = 0.33) => {
    for (const wx of xs) for (const s of [-1, 1]) {
      b.cyl(M.plain, wx, r, s * hw - (s > 0 ? 0.22 : 0), r, 0.22, { axis: 'z', sides: 10, color: tire, capColor: burnt ? 0x26221f : 0x34373b, both: true });
    }
  };
  const lights = (fx, hw, y) => {
    for (const s of [-1, 1]) {
      b.box(M.plain, fx, y, s * hw, 0.05, 0.15, 0.32, { color: burnt ? 0x3a3530 : 0xf4f0d8, top: false });
      b.box(M.plain, -fx, y, s * hw, 0.05, 0.15, 0.32, { color: burnt ? 0x3a3530 : 0xa8281f, top: false });
    }
  };
  if (kind === 'bus') {
    const c = o.color ?? 0xe0a81c;
    b.box(M.plain, 0, 0.42, 0, 11, 2.6, 2.5, { color: c });
    b.box(M.plain, -0.2, 1.55, 0, 9.6, 0.85, 2.54, { color: glass, top: false });
    b.box(M.plain, 5.46, 1.3, 0, 0.1, 1.2, 2.2, { color: glass, top: false });
    b.box(M.plain, 0, 0.42, 0, 11.04, 0.25, 2.54, { color: 0x1c1c1f, top: false });
    wheels([-3.4, 3.6], 1.26, 0.46);
    lights(5.5, 0.9, 0.75);
    b.solid(0, 0, 0, 11, 3.02, 2.5);
  } else if (kind === 'camion' || kind === 'militar') {
    const cargo = kind === 'militar' ? 0x5a6642 : o.cargo ?? 0xd9d6cc;
    b.box(M.plain, 2.6, 0.5, 0, 2.2, 1.9, 2.3, { color });
    b.box(M.plain, 3.3, 1.45, 0, 0.84, 0.75, 2.34, { color: glass, top: false });
    b.box(M.plain, 0, 0.5, 0, 7.4, 0.3, 2.1, { color: 0x1c1c1f });
    b.box(kind === 'militar' ? M.plain : M.metal, -1.2, 0.8, 0, 5, 2.4, 2.4, { color: cargo, uv: [2, 2.4], top: M.plain, topColor: cargo });
    wheels([-2.8, -1.6, 2.6], 1.16, 0.46);
    lights(3.72, 0.8, 0.85);
    b.solid(0, 0, 0, 7.4, 0.8, 2.3).solid(2.6, 0.8, 0, 2.2, 1.6, 2.3).solid(-1.2, 0.8, 0, 5, 2.4, 2.4);
  } else if (kind === 'van' || kind === 'ambulancia') {
    b.box(M.plain, 0, 0.3, 0, 5, 1.75, 1.95, { color });
    b.box(M.plain, 1.35, 1.2, 0, 1.5, 0.6, 1.99, { color: glass, top: false });
    b.box(M.plain, 2.46, 1.15, 0, 0.1, 0.65, 1.7, { color: glass, top: false });
    if (kind === 'ambulancia') {
      b.box(M.plain, -0.4, 0.95, 0, 4.1, 0.26, 1.99, { color: 0xc8322b, top: false });
      b.box(M.plain, 1.2, 2.05, 0, 0.3, 0.14, 1.2, { color: 0xc8322b });
      b.box(M.plain, -1.2, 2.05, 0, 0.3, 0.14, 1.2, { color: 0x2a4d8f });
    }
    wheels([-1.6, 1.6], 0.99, 0.36);
    lights(2.5, 0.68, 0.7);
    b.solid(0, 0, 0, 5, 2.05, 1.95);
  } else if (kind === 'pickup') {
    b.box(M.plain, 0, 0.32, 0, 5.2, 0.6, 1.85, { color });
    b.box(M.plain, 0.7, 0.92, 0, 1.7, 0.52, 1.66, { color: glass });
    b.box(M.plain, 0.7, 1.44, 0, 1.6, 0.06, 1.64, { color });
    b.box(M.plain, 2.0, 0.92, 0, 1.2, 0.1, 1.8, { color });
    for (const s of [-0.89, 0.89]) b.box(M.plain, -1.45, 0.92, s, 2.3, 0.42, 0.07, { color });
    b.box(M.plain, -2.57, 0.92, 0, 0.07, 0.42, 1.85, { color });
    wheels([-1.65, 1.6], 0.94, 0.36);
    lights(2.6, 0.64, 0.66);
    b.solid(0, 0, 0, 5.2, 0.95, 1.85).solid(0.7, 0.9, 0, 1.7, 0.6, 1.66);
  } else {
    // Turismo: carrocería baja, habitáculo acristalado y techo.
    b.box(M.plain, 0, 0.27, 0, 4.4, 0.62, 1.8, { color });
    b.box(M.plain, -0.25, 0.89, 0, 2.3, 0.5, 1.6, { color: glass });
    b.box(M.plain, -0.25, 1.39, 0, 2.05, 0.06, 1.58, { color });
    for (const [px, pz] of [[0.88, 0.78], [0.88, -0.78], [-1.38, 0.78], [-1.38, -0.78], [-0.25, 0.79], [-0.25, -0.79]]) b.box(M.plain, px, 0.89, pz, 0.07, 0.5, 0.05, { color, top: false });
    b.box(M.plain, 0, 0.27, 0, 4.46, 0.16, 1.7, { color: 0x1c1c1f, top: false });
    if (kind === 'taxi') b.box(M.plain, -0.25, 1.45, 0, 0.5, 0.16, 0.26, { color: 0xf4f0d8 });
    if (kind === 'policia') { // la puerta del conductor y las luces son piezas aparte: ver src/patrol.js
      b.box(M.plain, -0.25, 0.4, 0, 1.6, 0.48, 1.82, { color: 0x1c1c1f, top: false });
      b.box(M.plain, -0.25, 0.9, 0, 1.3, 0.02, 1.83, { color: 0x2a4d8f, top: false });
      b.mark('patrulla', 0, 0, 0);
    }
    wheels([-1.42, 1.42], 0.91);
    lights(2.2, 0.62, 0.62);
    b.solid(0, 0, 0, 4.4, 0.9, 1.8).solid(-0.25, 0.89, 0, 2.2, 0.56, 1.6);
  }
  b.pop();
}

/** Contenedor de carga a lo largo de X local (6,1 × 2,6 × 2,44 m). `y` para apilarlos. */
export function container(G, x, z, rot = 0, color = 0xb5532a, y = 0) {
  const { b, M } = G;
  b.push(x, z, rot, y);
  b.box(M.metal, 0, 0, 0, 6.1, 2.6, 2.44, { color, uv: [1.2, 2.6], top: M.plain, topColor: color, solid: true });
  b.box(M.plain, 3.06, 0.1, 0, 0.03, 2.4, 2.2, { color: 0x30343a, top: false });
  for (const s of [-0.55, 0.55]) b.box(M.plain, 3.09, 0.3, s, 0.03, 2.0, 0.05, { color: 0xb9bec4, top: false });
  b.pop();
}

/** Depósito cilíndrico vertical con tapa cónica y escalera. */
export function silo(G, x, z, r = 2.2, h = 11, color = 0xc9cdd1) {
  const { b, M } = G;
  b.cyl(M.metal, x, 0, z, r, h, { sides: 14, color, uv: 2, cap: false, solid: true });
  b.cyl(M.plain, x, h, z, r, r * 0.55, { r2: 0.3, sides: 14, color: 0x9a9fa5 });
  b.box(M.plain, x + r + 0.06, 0, z, 0.08, h, 0.5, { color: 0x4a4f55 });
  for (let y = 2; y < h; y += 3) b.cyl(M.plain, x, y, z, r + 0.03, 0.12, { sides: 14, color: 0x7a7f85, cap: false });
}
