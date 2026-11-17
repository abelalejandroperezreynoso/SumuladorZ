// Modo juego: fotos de la ciudad a distintas horas y comprobación del carácter de los zombis
// de día y de noche.
//
// Uso:  npx vite --port 5199 &   y luego   node tools/city.cjs [carpeta de salida]
// Guarda una vista aérea y, de cada lugar de VIEWS, una foto de día, al atardecer y de noche
// (con el reloj y la interfaz). Imprime lo que pesa la ciudad (triángulos, bloques de choque,
// farolas, llamadas de dibujo), el relieve y cuatro medidas del juego:
//   relieve                     corriendo: lo que sube la calle del cerro y su pendiente máxima, la
//                               altura del lomo del puente de piedra, si se cruzan el de hierro y la
//                               pasarela (subiendo y bajando sus escaleras) y el río a pie; y si un
//                               zombi que te persigue cruza el río y sube a la pasarela (segundos
//                               hasta el primer mordisco)
//   de frente / por la espalda  de día, caminando hacia un zombi: a qué distancia sospecha (ojos
//                               en ámbar) y a cuál te detecta (ojos en rojo), en metros
//   lo deja                     segundos que tarda en dejar de buscarte si te alejas caminando
//   a cubierto                  agachado tras los sacos de la plaza con un zombi mirando a 5 m:
//                               cuánto sube su medidor (0 = no te ve) y qué pasa al levantarte
//   noche, quieto               segundos hasta el primer mordisco y hasta morir en la plaza
// Requiere Playwright con Chromium disponible en el entorno.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = process.argv[2] || 'city-out';
const URL = process.env.GAME_URL || 'http://localhost:5199/';
// Lugar: [nombre, x, z (respecto al centro de la ciudad), giro de la cámara (rad), cabeceo].
const VIEWS_ALL = [
  ['plaza', 0, 9, 0, 0.16], ['centro', 29, 24, 0.1, 0.02], ['cuesta', 106, -30, -1.88, 0.02], ['cerro', 170, -8, 1.75, 0.12],
  ['puente_piedra', -45, 104, -2.49, 0.08], ['puente_hierro', 29, 103, 3.14, 0.04], ['rio', 0, 126, 1.57, -0.02], ['pasarela', 46, -104, -1.01, 0],
  ['industrial', 0, -150, -1.37, 0.05], ['casco_antiguo', -140, -30, 2.55, 0.02], ['residencial', 60, 174, -1.57, 0.1], ['salida', 3, 190, 3.14, 0.1],
];
const HOURS = [['dia', 120], ['atardecer', 285], ['noche', 420]];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 620 } });
  page.on('pageerror', (e) => console.log('ERROR', e.message));
  await page.goto(URL);
  await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
  const stats = await page.evaluate(() => {
    const g = window.__game;
    g.renderer.setAnimationLoop(null);
    g.input.touchMode = true; g.input.started = true;
    document.getElementById('m-play').click(); // empieza la partida
    window.__render = g.renderer.render.bind(g.renderer);
    window.__put = (body, x, z, up = 0) => { const C = g.city.center, at = { x: C.x + x, y: g.city.groundAt(C.x + x, C.z + z) + 1.2 + up, z: C.z + z }; body.setTranslation(at, true); body.setNextKinematicTranslation(at); };
    return { construir_ms: Math.round(g.city.buildMs), triangulos: g.city.tris, choques: g.city.solids, farolas: g.city.lamps.length, objetos: g.city.pickups.length, mallas: g.city.group.children.length, interiores: g.city.interiors.length, cristales: g.city.glass.panes.length, patrullas: g.city.patrols.cars.length };
  });
  console.log('ciudad', JSON.stringify(stats));

  // --- Fotos ---
  await page.evaluate(() => {
    const g = window.__game, c = g.camera, C = g.city.center;
    g.sky.time = 120; g.tick(1 / 60);
    const far = c.far, fog = [g.scene.fog.near, g.scene.fog.far];
    c.far = 1500; c.updateProjectionMatrix(); g.scene.fog.near = 600; g.scene.fog.far = 1500; g.sky.sky.visible = false;
    c.position.set(C.x, 400, C.z + 300); c.lookAt(C.x, 0, C.z + 10); c.updateMatrixWorld(true);
    document.body.classList.add('in-menu');
    window.__render(g.scene, c);
    c.far = far; c.updateProjectionMatrix(); [g.scene.fog.near, g.scene.fog.far] = fog; g.sky.sky.visible = true;
  });
  await page.screenshot({ path: path.join(OUT, 'aerea.png') });
  await page.evaluate(() => document.body.classList.remove('in-menu'));
  const VIEWS = process.env.FOTOS === "0" ? [] : VIEWS_ALL; // FOTOS=0: solo las medidas
  for (const [name, x, z, yaw, pitch] of VIEWS) {
    for (const [hour, t] of HOURS) {
      const calls = await page.evaluate(({ x, z, yaw, pitch, t }) => {
        const g = window.__game;
        g.gameMode.civT = 1e9; // sin persecuciones en las fotos
        window.__put(g.player.body, x, z);
        g.player.health = 100;
        g.sky.time = t; g.cam.yaw = yaw; g.cam.pitch = pitch;
        g.renderer.render = () => {};
        for (let f = 0; f < 90; f++) { g.player.health = 100; g.tick(1 / 60); }
        g.renderer.render = window.__render;
        g.tick(1 / 60);
        return g.renderer.info.render.calls;
      }, { x, z, yaw, pitch, t });
      await page.screenshot({ path: path.join(OUT, `${name}_${hour}.png`) });
      console.log(`${name}_${hour}.png`, `${calls} llamadas de dibujo`);
    }
  }

  // --- Relieve: cuestas, puentes, pasarela y río ---
  const hills = await page.evaluate(() => {
    const g = window.__game, P = g.player, H = g.horde, C = g.city.center, dt = 1 / 60, out = {};
    g.renderer.render = () => {};
    g.gameMode.restart(true);
    H.setAmbient(null); H.clear();
    const quiet = () => { g.gameMode.civT = 1e9; H.setAmbient(null); P.health = 100; };
    const at = () => [P.position.x - C.x, P.position.y, P.position.z - C.z];
    // Lleva al jugador a (x, z) y lo hace correr por `legs`: [[dx, dz, segundos]…]. Devuelve dónde acaba y entre qué alturas pasó.
    const run = (x, z, legs) => {
      g.input.auto = { x: 0, z: 0, run: false };
      for (let f = 0; f < 30; f++) { quiet(); g.tick(dt); }
      window.__put(P.body, x, z);
      for (let f = 0; f < 20; f++) { quiet(); g.tick(dt); }
      let lo = 99, hi = -99, grade = 0, prev = at();
      for (const [dx, dz, s] of legs) for (let f = 0; f < s * 60; f++) {
        quiet(); g.autopilot.moveWorld(dx, dz, true); g.tick(dt);
        const p = at();
        lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]);
        if (f % 20 === 19) { const d = Math.hypot(p[0] - prev[0], p[2] - prev[2]); if (d > 1) grade = Math.max(grade, Math.abs(p[1] - prev[1]) / d); prev = p; }
      }
      const p = at();
      return { x: +p[0].toFixed(1), y: +p[1].toFixed(2), z: +p[2].toFixed(1), min: +lo.toFixed(2), max: +hi.toFixed(2), grade };
    };
    let r = run(100, -29, [[1, 0.15, 12]]);
    out.cuesta = { sube_m: r.max, pendiente_max_pct: Math.round(r.grade * 100), llega: r.x > 150 };
    r = run(-29, 100, [[0, 1, 9]]);
    out.puente_piedra = { lomo_m: r.max, pendiente_max_pct: Math.round(r.grade * 100), cruza: r.z > 145 };
    r = run(29, 100, [[0, 1, 9]]);
    out.puente_hierro = { cruza: r.z > 147 && r.min > -0.2 };
    r = run(48, -107, [[1, 0, 4.2], [0, -1, 3.5], [1, 0, 5]]);
    out.pasarela = { sube_m: r.max, baja_al_otro_lado: r.y < 0.3 && r.z < -119 };
    r = run(0, 108, [[0, 1, 8]]);
    out.rio_a_pie = { fondo_m: r.min, cruza: r.z > 144 };
    // Un zombi que persigue al jugador: al otro lado del río, y al pie de la pasarela con el jugador arriba.
    const chase = (px, pz, up, zx, zz, secs) => {
      H.clear();
      g.input.auto = { x: 0, z: 0, run: false };
      window.__put(P.body, px, pz, up);
      for (let f = 0; f < 30; f++) { quiet(); g.tick(dt); }
      const z = H.addAmbient({ x: C.x + zx, z: C.z + zz });
      z.leaveFeed?.(); z.state = 'chase'; z.memory = 60; z.rage = 60;
      let bite = null, lo = 99, hi = -99;
      for (let f = 0; f < secs * 60 && bite === null; f++) {
        g.gameMode.civT = 1e9; H.setAmbient(null); g.input.auto = { x: 0, z: 0, run: false };
        z.memory = 60; z.target.copy(P.position);
        g.tick(dt);
        lo = Math.min(lo, z.position.y); hi = Math.max(hi, z.position.y);
        if (P.health < 100) bite = +(f / 60).toFixed(1);
      }
      P.health = 100;
      return { mordisco_s: bite, y_min: +lo.toFixed(2), y_max: +hi.toFixed(2) };
    };
    out.zombi_cruza_rio = chase(0, 106, 0, 0, 148, 40);
    out.zombi_sube_pasarela = chase(62, -114, 5.4, 44, -107, 40);
    return out;
  });
  console.log('relieve', JSON.stringify(hills));

  // --- Carácter de los zombis ---
  const res = await page.evaluate(() => {
    const g = window.__game, P = g.player, H = g.horde, dt = 1 / 60, out = {};
    g.renderer.render = () => {};
    const run = (s, fn) => { for (let f = 0; f < s * 60; f++) { fn?.(f); g.tick(dt); } };
    const still = () => { g.input.auto = { x: 0, z: 0, run: false }; };
    // Un tramo de calle recto y despejado de 24 m.
    let spot = null;
    for (const x of [29, -29, 87, -87]) for (const z of [16, 74, -42]) {
      const ray = { origin: { x: g.city.center.x + x, y: 0.6, z: g.city.center.z + z + 2 }, dir: { x: 0, y: 0, z: -1 } };
      if (!spot && !g.physics.world.castRay(ray, 24, true)) spot = [x, z];
    }
    const [sx, sz] = spot;
    g.gameMode.restart(true);
    g.gameMode.civT = 1e9; // sin personas huyendo durante las medidas
    H.setAmbient(null); // solo los zombis de la prueba
    H.clear();
    for (let i = 0; i < 2; i++) H.addAmbient({ x: g.city.center.x - 60, z: g.city.center.z - 40 + i * 3 });
    const approach = (z, facing) => {
      P.health = 100; window.__put(P.body, sx, sz);
      z.leaveFeed(); z.state = 'wander'; z.memory = 0; z.rage = 0; z.feedK = 0; window.__put(z.body, sx, sz - 16); run(0.3);
      z.aware = 0;
      let sus = null, det = null;
      run(12, () => {
        z.wanderT = 60;
        if (z.state === 'wander') { z.target.copy(z.position); z.facing = facing; }
        const d = +z.position.distanceTo(P.position).toFixed(2);
        if (sus === null && z.eyes === 1) sus = d;
        if (det === null && z.eyes === 2) det = d;
        if (det !== null || d < 1.2) return still();
        g.autopilot.moveWorld(0, -1, false);
      });
      return { sospecha_m: sus, detecta_m: det };
    };
    out.dia_de_frente = approach(H.zombies[0], 0);
    let t = 0, lost = null;
    run(50, () => { t += dt; g.autopilot.moveWorld(0, 1, false); if (lost === null && H.zombies[0].state === 'wander') lost = +t.toFixed(1); });
    out.dia_lo_deja_s = lost;
    out.dia_por_la_espalda = approach(H.zombies[1], Math.PI);
    still();
    // A cubierto tras los sacos terreros de la plaza, con un zombi mirando desde 5 m.
    {
      const z = H.zombies[0];
      z.state = 'wander'; z.memory = 0; z.rage = 0;
      window.__put(P.body, 4.5, 15.5); g.cam.yaw = 0; run(0.3);
      g.input.pressed.add('KeyC'); run(1.2);
      window.__put(z.body, 4.5, 9.5); run(0.2); z.aware = 0;
      const hold = () => { z.wanderT = 60; if (z.state === 'wander') { z.target.copy(z.position); z.facing = 0; } };
      let peak = 0;
      run(6, () => { hold(); peak = Math.max(peak, z.aware); });
      const hidden = { a_cubierto: !!P.cover?.attached, medidor_max: +peak.toFixed(2), ojos: z.eyes };
      g.input.pressed.add('KeyC'); // se levanta
      let det = null;
      t = 0;
      run(8, () => { hold(); t += dt; if (det === null && z.eyes === 2) det = +t.toFixed(1); });
      out.dia_a_cubierto = { ...hidden, al_levantarse_lo_detecta_s: det };
    }
    // De noche, quieto en la plaza.
    g.gameMode.restart(true);
    g.gameMode.civT = 1e9;
    g.sky.time = 299;
    let bite = null, dead = null, chasing = 0;
    t = 0;
    run(60, () => {
      t += dt;
      if (bite === null && P.health < 100) bite = +(t - 1).toFixed(1);
      if (dead === null && t > 2 && g.sky.time < 100) dead = +(t - 1).toFixed(1); // la partida se reinició: murió
      if (dead === null) chasing = Math.max(chasing, H.zombies.filter((k) => k.state === 'chase' || k.state === 'attack').length);
    });
    out.noche_quieto = { primer_mordisco_s: bite, muerte_s: dead, persiguiendo: chasing };
    return out;
  });
  console.log('zombis', JSON.stringify(res));
  await browser.close();
})();
