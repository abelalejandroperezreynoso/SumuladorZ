import { post } from './city-props.js';

// Puentes de la ciudad. Cada uno se describe en su propio marco: el eje va a lo largo de +Z
// local, de z = 0 a z = `len`, con la rasante (el suelo de los dos estribos) en y = 0. Todo el
// tablero, sus pretiles y las pilas chocan: se cruza por encima y se pasa por debajo.
export const BRIDGES = {
  arcos: { ancho: 9, lomo: 1.3, pretil: 1.0 }, // de piedra, con el tablero en lomo (cuesta arriba y abajo)
  celosia: { ancho: 9.6, alto: 5.2 }, // de hierro, llano
  pasarela: { alto: 5.3, ancho: 2.4, huella: 0.55 }, // peatonal: `huella` = lo que sube por metro de escalera
};

/** Cara de cuatro puntos del marco local; se orienta sola hacia `out` (dirección local hacia fuera). */
function face(b, mat, pts, color, uv, out) {
  let [p0, p1, p2, p3] = pts.map((p) => b.at(...p));
  const o = b.at(0, 0, 0), q = b.at(...out), hint = [q[0] - o[0], q[1] - o[1], q[2] - o[2]];
  const normal = () => {
    const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2], bx = p3[0] - p0[0], by = p3[1] - p0[1], bz = p3[2] - p0[2];
    const n = [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx], l = Math.hypot(...n) || 1;
    return n.map((v) => v / l);
  };
  let n = normal();
  if (n[0] * hint[0] + n[1] * hint[1] + n[2] * hint[2] < 0) { [p1, p3] = [p3, p1]; n = normal(); }
  b.quad(mat, p0, p1, p2, p3, n, uv, color);
}

/**
 * Puente de piedra de tres arcos sobre el río. El tablero sube `lomo` m hasta el centro y baja:
 * una calle en cuesta. `bed`: altura del lecho bajo el puente (negativa).
 */
export function archBridge(G, len, bed = -3) {
  const { b, M } = G, K = BRIDGES.arcos, W = K.ancho, hw = W / 2;
  const STONE = 0xb9b2a2, DARKER = 0x9a9486, lin = b.lin(STONE), lin2 = b.lin(DARKER);
  const deck = (s) => K.lomo * Math.sin((Math.PI * Math.min(len, Math.max(0, s))) / len);
  // Tablero por tramos (cada uno, una losa inclinada que choca), calzada, aceras y pretiles.
  const N = 10;
  for (let i = 0; i < N; i++) {
    const s0 = (i * len) / N, s1 = ((i + 1) * len) / N, y0 = deck(s0), y1 = deck(s1);
    b.slab(M.concrete, 0, y0, s0, 0, y1, s1, W, 0.7, { color: STONE, solid: true, ends: i === 0 || i === N - 1 });
    b.slab(M.asphalt, 0, y0 + 0.02, s0, 0, y1 + 0.02, s1, W - 2.6, 0.02, { uv: 6, ends: false });
    for (const sx of [-1, 1]) {
      b.slab(M.sidewalk, sx * (hw - 0.85), y0 + 0.1, s0, sx * (hw - 0.85), y1 + 0.1, s1, 0.9, 0.1, { ends: false });
      b.slab(M.concrete, sx * (hw - 0.2), y0 + K.pretil, s0, sx * (hw - 0.2), y1 + K.pretil, s1, 0.4, K.pretil, { color: STONE, solid: true, ends: i === 0 || i === N - 1 });
      b.slab(M.concrete, sx * (hw - 0.2), y0 + K.pretil + 0.08, s0, sx * (hw - 0.2), y1 + K.pretil + 0.08, s1, 0.52, 0.08, { color: DARKER, ends: false });
    }
    if (i % 2 === 0) b.slab(M.mark, 0, y0 + 0.03, s0 + 0.5, 0, deck(s0 + 2.6) + 0.03, s0 + 2.6, 0.16, 0.01, { color: 0xd9b23c, ends: false });
  }
  // Pilas en el río (con tajamar en punta aguas arriba y abajo) y estribos.
  const piers = [len / 3, (2 * len) / 3], PW = 2.2;
  for (const s of piers) {
    const top = deck(s) - 0.7;
    b.box(M.concrete, 0, bed - 0.6, s, W + 0.5, top - bed + 0.6, PW, { color: DARKER, uv: [3, 3], solid: true });
    for (const sx of [-1, 1]) {
      b.cyl(M.concrete, sx * (hw + 0.25), bed - 0.6, s, PW / 2, 2.6, { sides: 3, phase: sx > 0 ? Math.PI / 2 : -Math.PI / 2, color: DARKER, uv: 3 });
      // Farol sobre cada pila, en el pretil.
      b.box(M.concrete, sx * (hw - 0.2), deck(s) + K.pretil, s, 0.6, 0.5, 0.6, { color: DARKER, uv: [2, 2] });
      b.box(M.plain, sx * (hw - 0.2), deck(s) + K.pretil + 0.5, s, 0.1, 1.5, 0.1, { color: 0x2b2f33 });
      b.box(M.lamp, sx * (hw - 0.2), deck(s) + K.pretil + 2.0, s, 0.34, 0.36, 0.34, { bottom: true });
      b.mark('lamp', sx * (hw - 0.2), deck(s) + K.pretil + 1.9, s);
    }
    b.hquad(M.pool, 0, top + 0.76, s, 11, 11, { rect: [0, 0, 1, 1] });
  }
  for (const s of [-0.4, len + 0.4]) b.box(M.concrete, 0, bed - 0.6, s, W + 0.5, 0.6 - bed - 0.7, 1.6, { color: DARKER, uv: [3, 3] });
  // Arcos: bóveda por debajo y tímpanos (el muro entre el arco y el tablero) a los dos lados.
  const spans = [[0.4, piers[0] - PW / 2], [piers[0] + PW / 2, piers[1] - PW / 2], [piers[1] + PW / 2, len - 0.4]];
  for (const [s0, s1] of spans) {
    const mid = (s0 + s1) / 2, half = (s1 - s0) / 2, spring = bed + 0.9, crown = deck(mid) - 1.15, STEPS = 12;
    const arc = (s) => spring + (crown - spring) * Math.sqrt(Math.max(0, 1 - ((s - mid) / half) ** 2));
    for (let k = 0; k < STEPS; k++) {
      const a = s0 + ((s1 - s0) * k) / STEPS, c = s0 + ((s1 - s0) * (k + 1)) / STEPS, ya = arc(a), yc = arc(c);
      face(b, M.concrete, [[-hw, ya, a], [hw, ya, a], [hw, yc, c], [-hw, yc, c]], lin2, [0, a / 3, W / 3, c / 3], [0, -1, 0]); // bóveda
      for (const sx of [-1, 1]) {
        const x = sx * (hw + 0.02), x2 = x + sx * 0.03;
        face(b, M.concrete, [[x, ya, a], [x, yc, c], [x, deck(c) - 0.05, c], [x, deck(a) - 0.05, a]], lin, [a / 3, 0, c / 3, 1], [sx, 0, 0]);
        // Dovelas: el canto del arco, más oscuro.
        face(b, M.concrete, [[x2, ya, a], [x2, yc, c], [x2, yc + 0.38, c], [x2, ya + 0.38, a]], lin2, [a / 3, 0, c / 3, 0.2], [sx, 0, 0]);
      }
    }
  }
}

/** Puente de hierro en celosía, llano: tablero sobre vigas, dos cerchas con diagonales y arriostrado por arriba. */
export function trussBridge(G, len, bed = -3, color = 0x4f6b5a) {
  const { b, M } = G, K = BRIDGES.celosia, W = K.ancho, hw = W / 2, H = K.alto, o = { color };
  b.slab(M.concrete, 0, 0, 0, 0, 0, len, W, 0.5, { color: 0x8d8a84, solid: true });
  b.slab(M.asphalt, 0, 0.02, 0, 0, 0.02, len, W - 3.2, 0.02, { uv: 6, ends: false });
  for (const sx of [-1, 1]) b.slab(M.sidewalk, sx * (hw - 1.15), 0.1, 0, sx * (hw - 1.15), 0.1, len, 0.9, 0.1, { ends: false });
  for (let s = 1.5; s < len - 2; s += 6) b.slab(M.mark, 0, 0.03, s, 0, 0.03, s + 3, 0.16, 0.01, { color: 0xd9b23c, ends: false });
  for (const sx of [-1.5, 1.5]) b.box(M.plain, sx * 2, -1.6, len / 2, 0.45, 1.1, len, { ...o, top: false, bottom: true });
  for (let s = 2; s < len; s += 4) b.box(M.plain, 0, -0.9, s, W, 0.4, 0.3, { ...o, top: false, bottom: true });
  // Pilas: dos fustes y un dintel.
  for (const s of [len / 3, (2 * len) / 3]) {
    for (const sx of [-1, 1]) b.cyl(M.concrete, sx * 3, bed - 0.6, s, 0.75, -1.6 - bed + 0.6 - 0.5, { sides: 10, color: 0x9a968e, uv: 3, solid: true });
    b.box(M.concrete, 0, -2.1, s, W - 1, 0.5, 1.9, { color: 0x8d8a84, uv: [3, 3], bottom: true });
  }
  // Cerchas: cordón inferior y superior, montantes y diagonales hacia el centro.
  const n = Math.max(4, Math.round(len / 4.2) & ~1), at = (i) => (i * len) / n, T = 0.3;
  for (const sx of [-1, 1]) {
    const x = sx * (hw - 0.3);
    b.box(M.plain, x, 0, len / 2, T + 0.1, 0.45, len, { ...o });
    b.slab(M.plain, x, H, at(1), x, H, at(n - 1), T, T, o);
    b.slab(M.plain, x, 0.3, at(0), x, H, at(1), T, T, o);
    b.slab(M.plain, x, H, at(n - 1), x, 0.3, at(n), T, T, o);
    for (let i = 1; i < n; i++) {
      b.box(M.plain, x, 0.4, at(i), T * 0.8, H - 0.6, T * 0.8, { ...o, top: false });
      b.box(M.plain, x + sx * 0.02, 0.35, at(i), T + 0.12, 0.5, 0.6, { ...o }); // cartela
      if (i < n / 2) b.slab(M.plain, x, H - 0.1, at(i), x, 0.4, at(i + 1), T * 0.6, T * 0.6, o);
      if (i > n / 2) b.slab(M.plain, x, H - 0.1, at(i), x, 0.4, at(i - 1), T * 0.6, T * 0.6, o);
    }
    // Barandilla entre la acera y la cercha: es lo que choca (entre las barras se ve y se dispara).
    b.box(M.plain, x - sx * 0.35, 1.05, len / 2, 0.06, 0.06, len, { color: 0xb9bec4 });
    b.box(M.plain, x - sx * 0.35, 0.55, len / 2, 0.04, 0.04, len, { color: 0xb9bec4, top: false });
    for (let s = 0; s <= len; s += 2) b.box(M.plain, x - sx * 0.35, 0, s, 0.05, 1.05, 0.05, { color: 0xb9bec4, top: false });
    b.solid(x - sx * 0.2, 0, len / 2, 0.5, 1.1, len);
  }
  // Arriostrado superior: travesaños y cruces; pórtico de entrada con faroles.
  for (let i = 1; i < n; i++) {
    b.box(M.plain, 0, H - T, at(i), W - 0.6, T * 0.8, T * 0.8, { ...o, bottom: true });
    if (i < n - 1) {
      b.slab(M.plain, -hw + 0.3, H - 0.05, at(i), hw - 0.3, H - 0.05, at(i + 1), 0.12, 0.12, o);
      b.slab(M.plain, hw - 0.3, H - 0.05, at(i), -hw + 0.3, H - 0.05, at(i + 1), 0.12, 0.12, o);
    }
  }
  for (const i of [1, n - 1]) {
    b.box(M.plain, 0, H - 1.1, at(i), W - 0.6, 0.8, 0.12, { ...o, bottom: true });
    b.box(M.lamp, 0, H - 1.35, at(i), 1.2, 0.2, 0.3, { bottom: true });
    b.hquad(M.pool, 0, 0.06, at(i), 12, 12, { rect: [0, 0, 1, 1] });
    b.mark('lamp', 0, H - 1.5, at(i));
  }
}

/**
 * Pasarela peatonal de acero sobre la vía: tablero a `alto` m entre z = 0 y z = `span`, y una
 * escalera en cada cabeza (la de z = 0 baja hacia +X; la otra, hacia -X). Las escaleras chocan
 * como rampas, así que también suben los zombis.
 */
export function footbridge(G, span, color = 0x3d6f9a) {
  const { b, M } = G, K = BRIDGES.pasarela, H = K.alto, hw = K.ancho / 2, o = { color }, RAIL = 0xd9d4c4;
  const z0 = -hw, z1 = span + hw, run = H / K.huella;
  b.box(M.metal, 0, H - 0.25, span / 2, K.ancho, 0.25, z1 - z0, { color, uv: [2, 2], top: M.concrete, topColor: 0x9a968e, bottom: true, solid: true });
  for (const sx of [-1, 1]) b.box(M.plain, sx * (hw - 0.1), H - 0.75, span / 2, 0.2, 0.5, z1 - z0, { ...o, top: false, bottom: true });
  // Barandillas del tablero: pasamanos, malla y el bloque que choca.
  const rail = (x0, za, x1, zb) => {
    const len = Math.hypot(x1 - x0, zb - za), rot = Math.atan2(-(zb - za), x1 - x0);
    b.push((x0 + x1) / 2, (za + zb) / 2, rot, H);
    b.box(M.plain, 0, 1.1, 0, len, 0.06, 0.06, { color: RAIL });
    b.vquad(M.chain, 0, 0, 0, len, 1.1, { uv: [0.5, 0.5] });
    for (let i = 0; i <= Math.ceil(len / 2); i++) b.box(M.plain, -len / 2 + (i * len) / Math.ceil(len / 2), 0, 0, 0.06, 1.1, 0.06, { color: RAIL, top: false });
    b.solid(0, 0, 0, len, 1.15, 0.08);
    b.pop();
  };
  rail(-hw, z0, -hw, span - hw); rail(hw, hw, hw, z1); rail(-hw, z0, hw, z0); rail(-hw, z1, hw, z1);
  for (const [z, dir] of [[0, 1], [span, -1]]) {
    // Pilares bajo la cabeza del tablero.
    for (const sx of [-1, 1]) b.box(M.plain, sx * (hw - 0.25), 0, z, 0.35, H - 0.25, 0.35, { ...o, top: false, solid: true });
    b.box(M.plain, 0, H - 1.0, z, K.ancho, 0.25, 0.3, { ...o, bottom: true });
    // Escalera: peldaños, zancas, pasamanos y la rampa que choca.
    const xa = dir * hw, xb = dir * (hw + run), n = Math.round(H / 0.18), w = K.ancho - 0.4;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      b.box(M.metal, xa + (xb - xa) * t, H * (1 - (i + 1) / n), z, run / n + 0.03, 0.05, w, { color: 0x9a968e, uv: [1, 1], bottom: true });
    }
    b.slab(null, xa, H, z, xb, 0, z, w, 0.35, { solid: true });
    for (const sz of [-1, 1]) {
      const zz = z + sz * (w / 2 + 0.05);
      b.slab(M.plain, xa, H - 0.05, zz, xb, -0.05, zz, 0.1, 0.32, o);
      b.slab(M.plain, xa, H + 1.05, zz, xb, 1.05, zz, 0.06, 0.06, { color: RAIL });
      b.slab(null, xa, H + 1.05, zz, xb, 1.05, zz, 0.08, 1.1, { solid: true });
      for (let i = 0; i <= 5; i++) { const t = i / 5; b.box(M.plain, xa + (xb - xa) * t, H * (1 - t), zz, 0.05, 1.05, 0.05, { color: RAIL, top: false }); }
    }
    // Por dónde suben los zombis cuando su presa está arriba: del pie de la escalera a la cabeza del tablero.
    b.mark('subida', xb + dir * 1.0, 0, z, { top: b.at(xa - dir * 0.4, H, z), reach: span + 5 });
    // Pilar a media escalera y farol al pie.
    b.box(M.plain, (xa + xb) / 2, 0, z, 0.3, H / 2 - 0.3, w, { ...o, top: false, solid: true });
    post(G, xb + dir * 1.2, z + 1.6);
  }
}
