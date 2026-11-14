import * as THREE from 'three';
import { RAPIER } from './physics.js';
import { cityTextures, cityMaterials, rng } from './city-textures.js';
import { Batch } from './city-build.js';
import { BLOCKS, roadblock, DETAIL } from './city-blocks.js';
import { lamp, tree, bench, bin, hydrant, busStop, trafficLight, car, cone, pick, rr } from './city-props.js';

// Ciudad del modo juego: una cuadrícula de 5 × 5 manzanas de distinto tipo, con sus calles,
// aceras, farolas y coches abandonados, cercada por un muro de cuarentena. Se construye una
// sola vez al cargar, lejos del mundo de simulación (que sigue en el origen), y siempre sale
// igual: todo el azar parte de semillas fijas.
//
// Medidas en metros. Cada manzana ocupa `manzana` de lado contando su acera (`acera`), que
// sube `bordillo` sobre la calzada; entre manzanas hay `calle` de calzada.
export const CITY = { x: 600, z: 0, manzanas: 5, manzana: 46, calle: 12, acera: 3, bordillo: 0.08, muro: 5 };
// Farolas con luz de verdad: solo las `LUCES` más cercanas al jugador (las demás brillan y
// pintan su charco de luz en el suelo, pero no iluminan). `fuerza` y `alcance` de cada una.
const LIGHTS = { cuantas: 3, fuerza: 46, alcance: 20, cambio: 5 };
export const CITY_TUNING = { CITY, LIGHTS };

// Qué hay en cada manzana (fila = de norte a sur, columna = de oeste a este).
const LAYOUT = [
  ['industria', 'almacenes', 'obra', 'pisos', 'casas'],
  ['super', 'pisos', 'torres', 'oficinas', 'casas'],
  ['tiendas', 'oficinas', 'plaza', 'tiendas', 'parque'],
  ['gasolinera', 'pisos', 'torres', 'hospital', 'escuela'],
  ['casas', 'casas', 'tiendas', 'pisos', 'iglesia'],
];
const LEAFY = new Set(['casas', 'pisos', 'parque', 'plaza', 'tiendas', 'escuela', 'iglesia', 'hospital']);
const SIDES = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

/** Mobiliario de las cuatro aceras de una manzana y coches aparcados junto al bordillo. */
function sidewalks(G, type, edge, S) {
  const { b, M, R } = G;
  SIDES.forEach((rot, side) => {
    b.push(0, 0, rot);
    for (const x of [-11.5, 11.5]) lamp(G, x, edge - 0.7, 0);
    if (LEAFY.has(type)) {
      for (const x of [-17.5, -4.5, 4.5, 17.5]) {
        if (R() < 0.25) continue;
        b.hquad(M.plain, x, 0.01, edge - 1.1, 1.3, 1.3, { color: 0x3a2d22 });
        tree(G, x, edge - 1.1, rr(R, 4.5, 6));
      }
    }
    if (R() < 0.6) bin(G, rr(R, -9, 9), edge - 0.55);
    if (side === 0) hydrant(G, 16, edge - 0.5);
    if (R() < 0.35) bench(G, rr(R, -8, 8), edge - 2.5, 0);
    if (side === 2 && R() < 0.6) busStop(G, -1.5, edge - 1.6, 0);
    if (side % 2 === 0) trafficLight(G, edge - 0.6, edge - 0.6, 0);
    // Coches aparcados (en la calzada: un bordillo más abajo).
    for (const x of [-15, -9, -3, 3, 9, 15]) {
      if (R() < 0.2) car(G, x + rr(R, -0.6, 0.6), edge + 1.25, (R() < 0.5 ? 0 : Math.PI) + rr(R, -0.05, 0.05), { y: -S });
    }
    b.pop();
  });
}

/** Lo que quedó tirado en un tramo de calle: choques, un autobús cruzado, una barricada… El marco va a lo largo de la calle. */
function clutter(G) {
  const { R } = G;
  const t = R(), at = rr(R, -13, 13);
  if (t < 0.16) { car(G, at - 1.6, 1.3, 0.5); car(G, at + 2.4, -0.3, 2.45); }
  else if (t < 0.28) roadblock(G, at, 0, Math.PI / 2);
  else if (t < 0.36) car(G, at, 0.6, 0.38, { kind: 'bus', color: pick(R, [0xe0a81c, 0x2a5d8f, 0xb9c0c6]) });
  else if (t < 0.5) car(G, at, rr(R, -3, 3), rr(R, 0, 6.28), { kind: 'quemado' });
  else if (t < 0.58) { car(G, at, -2.2, 0.25, { kind: 'policia' }); car(G, at + 5, 2.4, Math.PI - 0.3, { kind: 'policia' }); cone(G, at + 2.4, 0.2); cone(G, at + 1.2, 1.4); }
  else if (t < 0.66) car(G, at, rr(R, -2.5, 2.5), rr(R, -0.4, 0.4), { kind: pick(R, ['camion', 'van', 'ambulancia']) });
}

export class City {
  constructor(scene, physics) {
    const t0 = performance.now();
    const C = CITY, N = C.manzanas, S = C.bordillo, pitch = C.manzana + C.calle;
    const half = (N * C.manzana + (N + 1) * C.calle) / 2;
    const T = cityTextures(), M = cityMaterials(T);
    this.M = M;
    this.half = half;
    this.center = { x: C.x, z: C.z };
    /** Zona por la que se mueven jugador y zombis (dentro del muro). */
    this.bounds = { x0: C.x - half + 1.5, x1: C.x + half - 1.5, z0: C.z - half + 1.5, z1: C.z + half - 1.5 };
    /** Límite de la ciudad: fuera de él llega la horda (ver GameMode.border). */
    this.limit = this.bounds;
    this.group = new THREE.Group();
    scene.add(this.group);
    const world = physics.world;
    this.body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    world.createCollider(RAPIER.ColliderDesc.cuboid(half + 40, 0.5, half + 40).setTranslation(C.x, -0.5, C.z), this.body);
    const marks = {};
    let tris = 0, solids = 1;
    const batch = () => { const b = new Batch(world, this.body); b.marks = marks; return b; };
    const done = (b) => { tris += b.build(this.group); solids += b.solids; };
    const blockAt = (i) => (i - (N - 1) / 2) * pitch;
    const roadAt = (k) => (k - N / 2) * pitch;

    // --- Calzada, marcas viales, campo exterior y muro de cuarentena ---
    const base = batch();
    base.push(C.x, C.z);
    base.hquad(M.asphalt, 0, 0, 0, half * 2, half * 2, { uv: 6 });
    // Campo de fuera del muro: cuatro franjas alrededor (no por debajo de la calzada, que a lo lejos se pelearía con ella).
    const F = 600, e = half + 1;
    SIDES.forEach((rot, i) => base.push(0, 0, rot).hquad(M.grass, 0, -0.02, e + F / 2, i % 2 ? e * 2 : e * 2 + F * 2, F, { uv: 9, color: 0x9a9a78 }).pop());
    const YELLOW = 0xd9b23c, WHITE = 0xe8e8e0;
    for (let k = 0; k <= N; k++) for (let j = 0; j < N; j++) {
      const a = roadAt(k), c = blockAt(j);
      for (let t = -18; t <= 18; t += 6) {
        base.hquad(M.mark, a, 0.015, c + t, 0.16, 3, { color: YELLOW });
        base.hquad(M.mark, c + t, 0.015, a, 3, 0.16, { color: YELLOW });
      }
      for (const e of [-21, 21]) for (let s = -4.8; s <= 4.81; s += 1.2) { // pasos de cebra
        base.hquad(M.mark, a + s, 0.015, c + e, 0.55, 3, { color: WHITE });
        base.hquad(M.mark, c + e, 0.015, a + s, 3, 0.55, { color: WHITE });
      }
    }
    const WALL = 0x8f8c86;
    for (const rot of SIDES) {
      base.push(0, 0, rot);
      base.box(M.concrete, 0, 0, half + 0.5, half * 2 + 2, C.muro, 1, { color: WALL, uv: [4, 5], solid: true });
      base.box(M.plain, 0, C.muro, half + 0.5, half * 2, 0.45, 0.5, { color: 0x4a4f55, top: false });
      for (let x = -half + 4; x < half; x += 8) base.box(M.concrete, x, 0, half - 0.15, 0.7, C.muro + 0.3, 0.5, { color: 0x7d7a74, uv: [2, 5] });
      for (let x = -half + 16; x < half; x += 32) base.vquad(M.details, x, 1.6, half - 0.03, 2.2, 2.2, { rect: DETAIL.WARNING, rot: Math.PI });
      // Portones cerrados donde las calles llegaban a la carretera.
      for (const x of [roadAt(2), roadAt(3)]) {
        base.box(M.metal, x, 0, half - 0.1, 9.4, 4.4, 0.3, { color: 0x5a6068, uv: [1.5, 4.4] });
        base.box(M.plain, x, 0.9, half - 0.27, 9.4, 0.5, 0.04, { color: 0xd9b23c, top: false });
        for (const s of [-4.9, 4.9]) base.box(M.concrete, x + s, 0, half - 0.2, 0.9, C.muro + 0.6, 0.9, { color: 0x6f6c66, uv: [2, 5] });
      }
      // Torre de vigilancia en la esquina.
      base.push(half - 3, half - 3, 0);
      for (const sx of [-1.4, 1.4]) for (const sz of [-1.4, 1.4]) base.box(M.plain, sx, 0, sz, 0.25, 7.2, 0.25, { color: 0x4a4f55 });
      base.solid(0, 0, 0, 3.2, 7.2, 3.2);
      base.box(M.plain, 0, 7.2, 0, 4, 0.25, 4, { color: 0x5a5d60, bottom: true });
      for (const [sx, sz, lx, lz] of [[0, 1, 4, 0.1], [0, -1, 4, 0.1], [1, 0, 0.1, 4], [-1, 0, 0.1, 4]]) base.box(M.plain, sx * 1.95, 7.45, sz * 1.95, lx, 1.1, lz, { color: 0x4f5a3a });
      base.box(M.plain, 0, 9.9, 0, 4.6, 0.2, 4.6, { color: 0x3a4046, bottom: true });
      for (const sx of [-1.9, 1.9]) for (const sz of [-1.9, 1.9]) base.box(M.plain, sx, 8.55, sz, 0.12, 1.35, 0.12, { color: 0x4a4f55 });
      base.box(M.lamp, -1.6, 9.5, -1.6, 0.5, 0.35, 0.5, { bottom: true });
      base.pop();
      base.pop();
    }
    base.pop();
    done(base);

    // --- Manzanas ---
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const type = LAYOUT[j][i], b = batch();
      const G = { b, M, R: rng(1000 + i * 37 + j * 101), signs: T.signs };
      b.push(C.x + blockAt(i), C.z + blockAt(j), 0, S);
      b.box(M.sidewalk, 0, -S, 0, C.manzana, S, C.manzana, { uv: [3, 3], topUV: 3 });
      b.solid(0, -S - 0.4, 0, C.manzana, S + 0.4, C.manzana);
      BLOCKS[type](G);
      sidewalks(G, type, C.manzana / 2, S);
      // Tramos de calle al este y al sur (y, en el borde, también al oeste y al norte).
      const roads = [[pitch / 2, 0, Math.PI / 2], [0, pitch / 2, 0]];
      if (i === 0) roads.push([-pitch / 2, 0, Math.PI / 2]);
      if (j === 0) roads.push([0, -pitch / 2, 0]);
      for (const [x, z, rot] of roads) { b.push(x, z, rot, -S); clutter(G); b.pop(); }
      b.pop();
      done(b);
    }

    this.tris = tris; // (cifras para tools/city.cjs)
    this.solids = solids;
    this.buildMs = performance.now() - t0;
    this.lamps = marks.lamp ?? [];
    const sp = marks.spawn[0];
    /** Dónde empieza el jugador y hacia dónde mira la cámara. */
    this.spawn = { x: sp.x, z: sp.z, yaw: 0 };
    /** Objetos del escenario: [tipo, x, z], como en `pickups.js`. */
    this.pickups = ['pistola', 'bate', 'balas'].flatMap((kind) => (marks[kind] ?? []).map((m) => [kind, m.x, m.z]));

    // --- Luces de verdad de las farolas más cercanas ---
    this.lights = [];
    for (let i = 0; i < LIGHTS.cuantas; i++) {
      const light = new THREE.PointLight(0xffc98a, 0, LIGHTS.alcance, 1.5);
      light.userData = { lamp: null, k: 0 };
      scene.add(light);
      this.lights.push(light);
    }
    this.night = 0;
    this.scanT = 0;
    this.near = [];
  }

  /** Muestra u oculta la ciudad (sus choques siguen ahí: queda lejos del mundo de simulación). */
  setActive(on) {
    this.group.visible = on;
    for (const l of this.lights) l.visible = on;
  }

  /** 0 = de día, 1 = noche cerrada: enciende ventanas, rótulos y farolas. */
  setNight(k) {
    this.night = k;
    for (const [mat, f] of this.M.glow) mat.emissiveIntensity = k * f;
    this.M.pool.opacity = k * 0.42;
  }

  /** Lleva las luces a las farolas más cercanas a `pos`, encendiéndolas y apagándolas poco a poco. */
  update(dt, pos) {
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 0.3;
      const best = [];
      for (const l of this.lamps) {
        const d = (l.x - pos.x) ** 2 + (l.z - pos.z) ** 2;
        if (best.length < LIGHTS.cuantas || d < best[best.length - 1].d) {
          best.push({ l, d });
          best.sort((p, q) => p.d - q.d);
          if (best.length > LIGHTS.cuantas) best.pop();
        }
      }
      this.near = best.map((e) => e.l);
    }
    const used = new Set(this.lights.map((l) => l.userData.lamp));
    for (const light of this.lights) {
      const u = light.userData;
      const keep = u.lamp && this.near.includes(u.lamp);
      u.k = THREE.MathUtils.damp(u.k, keep ? 1 : 0, LIGHTS.cambio, dt);
      if (!keep && u.k < 0.03) {
        const next = this.near.find((l) => !used.has(l));
        if (next) {
          used.delete(u.lamp);
          u.lamp = next;
          used.add(next);
          light.position.set(next.x, next.y, next.z);
          u.k = 0;
        }
      }
      light.intensity = LIGHTS.fuerza * this.night * u.k;
    }
  }
}
