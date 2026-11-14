// Modo juego: fotos de la ciudad a distintas horas y comprobación del carácter de los zombis
// de día y de noche.
//
// Uso:  npx vite --port 5199 &   y luego   node tools/city.cjs [carpeta de salida]
// Guarda una vista aérea y, de cada lugar de VIEWS, una foto de día, al atardecer y de noche
// (con el reloj y la interfaz). Imprime lo que pesa la ciudad (triángulos, bloques de choque,
// farolas, llamadas de dibujo) y cuatro medidas del juego:
//   de frente / por la espalda  distancia a la que un zombi te nota de día (m)
//   lo deja                     segundos que tarda en olvidarte si te alejas caminando
//   noche, quieto               segundos hasta el primer mordisco y hasta morir en la plaza
// Requiere Playwright con Chromium disponible en el entorno.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = process.argv[2] || 'city-out';
const URL = process.env.GAME_URL || 'http://localhost:5199/';
// Lugar: [nombre, x, z (respecto al centro de la ciudad), giro de la cámara (rad), cabeceo].
const VIEWS = [
  ['plaza', 0, 9, 0, 0.16], ['centro', 29, 24, 0.1, 0.02], ['casas', -87, 100, 1.2, 0.1], ['tiendas', 6, 145, 0.3, 0.05],
  ['fabrica', -116, -86, 0, 0.02], ['iglesia', 100, 146, -0.3, -0.1], ['hospital', 58, 86, 0, 0], ['parque', 116, 22, 0, 0.12],
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
    window.__put = (body, x, z) => { const at = { x: g.city.center.x + x, y: 1.2, z: g.city.center.z + z }; body.setTranslation(at, true); body.setNextKinematicTranslation(at); };
    return { construir_ms: Math.round(g.city.buildMs), triangulos: g.city.tris, choques: g.city.solids, farolas: g.city.lamps.length, objetos: g.city.pickups.length, mallas: g.city.group.children.length };
  });
  console.log('ciudad', JSON.stringify(stats));

  // --- Fotos ---
  await page.evaluate(() => {
    const g = window.__game, c = g.camera, C = g.city.center;
    g.sky.time = 120; g.tick(1 / 60);
    const far = c.far, fog = [g.scene.fog.near, g.scene.fog.far];
    c.far = 700; c.updateProjectionMatrix(); g.scene.fog.near = 300; g.scene.fog.far = 700; g.sky.sky.visible = false;
    c.position.set(C.x, 250, C.z + 215); c.lookAt(C.x, 0, C.z + 10); c.updateMatrixWorld(true);
    document.body.classList.add('in-menu');
    window.__render(g.scene, c);
    c.far = far; c.updateProjectionMatrix(); [g.scene.fog.near, g.scene.fog.far] = fog; g.sky.sky.visible = true;
  });
  await page.screenshot({ path: path.join(OUT, 'aerea.png') });
  await page.evaluate(() => document.body.classList.remove('in-menu'));
  for (const [name, x, z, yaw, pitch] of VIEWS) {
    for (const [hour, t] of HOURS) {
      const calls = await page.evaluate(({ x, z, yaw, pitch, t }) => {
        const g = window.__game;
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

  // --- Carácter de los zombis ---
  const res = await page.evaluate(() => {
    const g = window.__game, P = g.player, H = g.horde, dt = 1 / 60, out = {};
    g.renderer.render = () => {};
    const run = (s, fn) => { for (let f = 0; f < s * 60; f++) { fn?.(f); g.tick(dt); } };
    const still = () => { g.input.auto = { x: 0, z: 0, run: false }; };
    // Un tramo de calle recto y despejado de 24 m.
    let spot = null;
    for (const x of [29, -29, 87, -87, 145, -145]) for (const z of [16, 74, -42, 132, -100]) {
      const ray = { origin: { x: g.city.center.x + x, y: 0.6, z: g.city.center.z + z + 2 }, dir: { x: 0, y: 0, z: -1 } };
      if (!spot && !g.physics.world.castRay(ray, 24, true)) spot = [x, z];
    }
    const [sx, sz] = spot;
    g.gameMode.restart(true);
    H.setAmbient(null); // solo los zombis de la prueba
    for (const z of H.zombies.slice(2)) z.dispose();
    H.zombies.length = 2;
    const approach = (z, facing) => {
      P.health = 100; window.__put(P.body, sx, sz);
      z.state = 'wander'; z.memory = 0; z.rage = 0; window.__put(z.body, sx, sz - 16); run(0.3);
      let react = null;
      run(12, () => {
        z.wanderT = 60;
        if (z.state === 'wander') { z.target.copy(z.position); z.facing = facing; }
        if (react !== null) return still();
        g.autopilot.moveWorld(0, -1, false);
        if (z.state !== 'wander') react = +z.position.distanceTo(P.position).toFixed(2);
      });
      return react;
    };
    out.dia_de_frente_m = approach(H.zombies[0], 0);
    let t = 0, lost = null;
    run(16, () => { t += dt; g.autopilot.moveWorld(0, 1, false); if (lost === null && H.zombies[0].state === 'wander') lost = +t.toFixed(1); });
    out.dia_lo_deja_s = lost;
    out.dia_por_la_espalda_m = approach(H.zombies[1], Math.PI);
    still();
    // De noche, quieto en la plaza.
    g.gameMode.restart(true);
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
