// Observador del juego: reproduce cada mecánica en un navegador sin interfaz, guarda una
// tira de fotogramas por escena a 30 imágenes por segundo (para revisar las animaciones
// cuadro a cuadro) y mide la
// calidad del movimiento: pies que resbalan, saltos bruscos de pose y tirones de cámara.
//
// Uso:  npx vite --port 5199 &   y luego   node tools/watch.cjs [carpeta de salida] [escena...]
// Con SKELETON=1 las tiras muestran solo el esqueleto del personaje.
// Con EVERY=4 guarda una imagen cada 4 fotogramas (15 por segundo): tiras más cortas para un catálogo.
// Requiere Playwright con Chromium disponible en el entorno.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = process.argv[2] || 'watch-out';
const ONLY = process.argv.slice(3);
const URL = process.env.GAME_URL || 'http://localhost:5199/';

// Código que se ejecuta dentro de la página.
function install(skeleton) {
  const g = window.__game;
  const DT = 1 / 60;
  g.renderer.setAnimationLoop(null);
  g.input.touchMode = true;
  g.input.started = true;
  document.querySelectorAll('body > div, body > button').forEach((e) => { e.style.display = 'none'; });
  const realRender = g.renderer.render.bind(g.renderer);
  g.renderer.render = () => {};
  if (skeleton) g.player.toggleSkeleton(); // SKELETON=1: tiras con solo el esqueleto
  const THREE_V = g.player.position.constructor;
  const bonesOf = (model, names) => {
    const out = {};
    model.traverse((o) => { if (o.isBone && names.includes(o.name)) out[o.name] = o; });
    return out;
  };
  const NAMES = ['FootL', 'FootR', 'Head', 'WristL', 'WristR', 'Body', 'LowerLegL', 'LowerLegR'];
  const cell = { w: 230, h: 250 };
  const EVERY = 2; // una imagen cada 2 fotogramas = 30 por segundo

  window.W = {
    place(x, z, yaw = 0) {
      // El piloto de la escena «piloto» seguiría jugando (y matando al zombi) en las siguientes.
      if (g.autopilot.active) g.autopilot.toggle();
      g.horde.stop(); g.physics.reset(); g.player.respawn();
      g.player.body.setTranslation({ x, y: 0.9, z }, true);
      g.player.body.setNextKinematicTranslation({ x, y: 0.9, z });
      g.input.keys.clear(); g.input.buttons.clear(); g.input.pressed.clear();
      g.cam.yaw = yaw; g.cam.pitch = 0.1;
      for (let i = 0; i < 20; i++) g.tick(DT);
    },
    /**
     * Ejecuta una escena. steps: [{ t, do(g) }] acciones en el segundo t.
     * subject: () => { model, position, facing, state } a observar (jugador por defecto).
     */
    record({ seconds, steps = [], every = EVERY, view = 1.2, dist = 3.6, subject, cols = 8, rowsPerSheet = 6 }) {
      const sub = subject ? subject() : g.player;
      const bones = bonesOf(sub.model, NAMES);
      const frames = Math.round(seconds * 60);
      // A 30 imágenes por segundo una escena no cabe en una sola lámina: se reparte en varias.
      const perSheet = cols * rowsPerSheet;
      const sheets = [];
      let ctx = null;
      const newSheet = (cells) => {
        const sheet = document.createElement('canvas');
        sheet.width = cols * cell.w; sheet.height = Math.ceil(cells / cols) * cell.h;
        ctx = sheet.getContext('2d');
        ctx.fillStyle = '#111'; ctx.fillRect(0, 0, sheet.width, sheet.height);
        sheets.push(sheet);
      };
      const shots = Math.ceil(frames / every);
      const cam = g.cam.camera;
      const prev = {}; const p = new THREE_V();
      const feet = [];
      const m = { stride: {}, slide: {}, slideN: {}, pops: [], maxJoint: 0, rootJerk: 0, camJerk: 0, turn: 0, states: {} };
      let prevRoot = null, prevVel = null, prevCam = null, prevCamVel = null, prevFacing = sub.facing, prevState = sub.state;
      const todo = steps.slice().sort((a, b) => a.t - b.t);
      for (let f = 0; f < frames; f++) {
        while (todo.length && todo[0].t * 60 <= f) todo.shift().do(g);
        g.tick(DT);
        const root = sub.position;
        const state = sub === g.player && g.player.cover?.attached
          ? 'Cover' + (g.player.cover.veryLow ? 'Prone' : g.player.cover.high ? 'High' : 'Low') + ':' + sub.state
          : sub.state;
        m.states[state] = (m.states[state] || 0) + 1;
        sub.model.updateMatrixWorld(true);
        // --- Métricas por hueso ---
        const rootV = prevRoot ? { x: (root.x - prevRoot.x) / DT, y: (root.y - prevRoot.y) / DT, z: (root.z - prevRoot.z) / DT } : null;
        for (const name of NAMES) {
          const b = bones[name]; if (!b) continue;
          b.getWorldPosition(p);
          const q = prev[name];
          if (q && rootV) {
            const vx = (p.x - q.x) / DT, vy = (p.y - q.y) / DT, vz = (p.z - q.z) / DT;
            // Velocidad relativa al cuerpo: un pico es un salto brusco de pose.
            const rel = Math.hypot(vx - rootV.x, vy - rootV.y, vz - rootV.z);
            if (rel > m.maxJoint) m.maxJoint = rel;
            if (rel > 9) m.pops.push({ t: +(f / 60).toFixed(2), bone: name, v: +rel.toFixed(1), state, from: prevState });
            // Pie apoyado que se desplaza por el suelo = resbala.
            if (name.startsWith('Foot')) feet.push({ y: p.y - root.y, vx, vz });
          }
          prev[name] = q ? q.copy(p) : p.clone();
        }
        // El pie más bajo es el de apoyo: si se mueve respecto al suelo, resbala. Su velocidad
        // hacia atrás respecto al cuerpo, dividida por el ritmo del clip, da la velocidad de
        // avance a la que esa animación no resbalaría.
        if (rootV && feet.length === 2 && Math.hypot(rootV.x, rootV.z) > 0.3) {
          const foot = feet[0].y < feet[1].y ? feet[0] : feet[1];
          if (foot.y < 0.07 && Math.abs(feet[0].y - feet[1].y) > 0.03) {
            const sp = Math.hypot(rootV.x, rootV.z), ux = rootV.x / sp, uz = rootV.z / sp;
            const back = (rootV.x - foot.vx) * ux + (rootV.z - foot.vz) * uz;
            m.slide[state] = (m.slide[state] || 0) + Math.hypot(foot.vx, foot.vz);
            m.slideN[state] = (m.slideN[state] || 0) + 1;
            m.stride[state] = (m.stride[state] || 0) + back / (sub.current?.timeScale || 1);
          }
        }
        feet.length = 0;
        if (rootV && prevVel) m.rootJerk = Math.max(m.rootJerk, Math.hypot(rootV.x - prevVel.x, rootV.z - prevVel.z) / DT);
        prevVel = rootV; prevRoot = prevRoot ? prevRoot.copy(root) : root.clone();
        const df = Math.abs(Math.atan2(Math.sin(sub.facing - prevFacing), Math.cos(sub.facing - prevFacing))) / DT;
        m.turn = Math.max(m.turn, df); prevFacing = sub.facing; prevState = state;
        // Cámara del juego: tirones (se mide antes de moverla para la foto).
        const cv = prevCam ? { x: (cam.position.x - prevCam.x) / DT, y: (cam.position.y - prevCam.y) / DT, z: (cam.position.z - prevCam.z) / DT } : null;
        if (cv && prevCamVel) m.camJerk = Math.max(m.camJerk, Math.hypot(cv.x - prevCamVel.x, cv.y - prevCamVel.y, cv.z - prevCamVel.z) / DT);
        prevCamVel = cv; prevCam = prevCam ? prevCam.copy(cam.position) : cam.position.clone();

        // --- Fotograma de la tira: cámara lateral que sigue al sujeto ---
        if (f % every === 0) {
          const saved = { p: cam.position.clone(), q: cam.quaternion.clone(), fov: cam.fov, aspect: cam.aspect };
          const a = typeof view === 'function' ? view(sub) : view;
          cam.aspect = cell.w / cell.h; cam.fov = 42; cam.updateProjectionMatrix();
          cam.position.set(root.x + Math.sin(a) * dist, root.y + 1.25, root.z + Math.cos(a) * dist);
          cam.lookAt(root.x, root.y + 0.85, root.z); cam.updateMatrixWorld(true);
          const wasVisible = g.player.model.visible; g.player.model.visible = true;
          realRender(g.scene, cam);
          const shot = f / every, i = shot % perSheet;
          if (i === 0) newSheet(Math.min(perSheet, shots - shot));
          const cx = (i % cols) * cell.w, cy = Math.floor(i / cols) * cell.h;
          const src = g.renderer.domElement, sw = src.height * (cell.w / cell.h);
          ctx.drawImage(src, (src.width - sw) / 2, 0, sw, src.height, cx, cy, cell.w, cell.h);
          ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(cx, cy, cell.w, 16);
          ctx.fillStyle = '#fff'; ctx.font = '11px monospace';
          ctx.fillText(`${(f / 60).toFixed(2)}s ${state}`, cx + 3, cy + 12);
          g.player.model.visible = wasVisible;
          cam.position.copy(saved.p); cam.quaternion.copy(saved.q); cam.fov = saved.fov; cam.aspect = saved.aspect;
          cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
        }
      }
      const slide = {};
      const stride = {};
      for (const k in m.slide) {
        if (m.slideN[k] < 12) continue;
        slide[k] = +(m.slide[k] / m.slideN[k]).toFixed(2);
        stride[k] = +(m.stride[k] / m.slideN[k]).toFixed(2);
      }
      return {
        pngs: sheets.map((c) => c.toDataURL('image/png')),
        metrics: {
          footSlide: slide, naturalStrideSpeed: stride, maxJointSpeed: +m.maxJoint.toFixed(1), pops: m.pops.slice(0, 12), popCount: m.pops.length,
          rootJerk: +m.rootJerk.toFixed(0), camJerk: +m.camJerk.toFixed(0), maxTurn: +m.turn.toFixed(1),
        },
      };
    },
  };
}

// Escenas: cada una prepara la situación y describe qué pulsar y cuándo.
const key = (k, on = true) => `g.input.keys.${on ? 'add' : 'delete'}('${k}')`;
const press = (k) => `g.input.pressed.add('${k}')`;
const fire = (on) => `g.input.buttons.${on ? 'add' : 'delete'}(0)`;
const SCENES = {
  locomocion: { place: [-30, 30, -Math.PI / 2], seconds: 6.4, view: 0,
    steps: [[0.2, key('KeyW')], [1.8, key('ShiftLeft')], [3.4, press('KeyQ')], [5.2, key('KeyW', false) + ';' + key('ShiftLeft', false)]] },
  giro: { place: [0, 30, 0], seconds: 3.2, view: Math.PI / 2,
    steps: [[0.1, key('KeyW') + ';' + key('ShiftLeft')], [1.3, key('KeyW', false) + ';' + key('KeyS')], [2.6, key('KeyS', false)]] },
  salto_parado: { place: [20, 30, 0], seconds: 1.6, view: Math.PI / 2, steps: [[0.1, press('Space')]] },
  salto_carrera: { place: [-30, 30, -Math.PI / 2], seconds: 2.6, view: 0,
    steps: [[0, key('KeyW') + ';' + key('ShiftLeft')], [1.0, press('Space')]] },
  golpe: { place: [20, 30, 0], seconds: 1.2, view: Math.PI * 0.7, steps: [[0.1, press('KeyF')]] },
  // Disparo de pie: apuntar y ráfaga parado, y después caminando sin dejar de disparar.
  disparo: { place: [20, 30, 0], seconds: 3.6, view: Math.PI * 0.7,
    steps: [[0.3, fire(true)], [1.4, key('KeyW')], [2.6, key('KeyW', false)], [3.0, fire(false)]] },
  cobertura_baja: { place: [-2.8, -3, 0], seconds: 5.2, view: 0.6, dist: 3.2,
    steps: [[0.1, press('KeyC')], [1.3, key('KeyD')], [2.2, key('KeyD', false)], [2.6, fire(true)], [3.8, fire(false)]] },
  cobertura_alta: { place: [3.3, -3.2, 0], seconds: 4.2, view: -0.5, dist: 3.4,
    steps: [[0.1, press('KeyC')], [1.4, fire(true)], [2.8, fire(false)]] },
  cobertura_tumbado: { place: [5.6, -5.5, 0], seconds: 5.6, view: 0.7, dist: 3.4,
    steps: [[0.1, press('KeyC')], [1.6, key('KeyD')], [2.8, key('KeyD', false)], [3.2, fire(true)], [4.4, fire(false)]] },
  // El piloto automático jugando: se le ve buscar cobertura, asomarse y disparar.
  piloto: { place: [0, 0, 0], seconds: 16, view: (s) => s.facing + 2.4, dist: 4.2,
    before: `g.input.pressed.add('KeyP'); g.tick(1/60);`, steps: [], keepAlive: true },
  zombi: { place: [20, 20, 0], seconds: 7.5, view: (s) => s.facing + Math.PI / 2, dist: 3.8,
    before: `g.horde.start(); for (let i = 0; i < 40; i++) g.tick(1/60);
      const z = g.horde.zombies[0]; z.body.setTranslation({ x: 20, y: 0.9, z: 31 }, true);
      z.body.setNextKinematicTranslation({ x: 20, y: 0.9, z: 31 }); z.facing = Math.PI; g.tick(1/60);`,
    subject: 'g.horde.zombies[0]',
    steps: [[5.2, `g.horde.zombies[0].damage(1, g.player)`], [6.0, `g.horde.zombies[0].damage(5, g.player)`]],
    keepAlive: true },
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
  page.on('pageerror', (e) => console.log('ERROR', e.message));
  await page.goto(URL);
  await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
  await page.evaluate(install, !!process.env.SKELETON);
  const report = {};
  for (const [name, sc] of Object.entries(SCENES)) {
    if (ONLY.length && !ONLY.includes(name)) continue;
    const res = await page.evaluate(({ sc, every }) => {
      const g = window.__game;
      W.place(...sc.place);
      if (sc.before) new Function('g', sc.before)(g);
      const steps = sc.steps.map(([t, code]) => ({ t, do: new Function('g', code) }));
      if (sc.keepAlive) steps.push(...Array.from({ length: 40 }, (_, i) => ({ t: i * 0.25, do: (g) => { g.player.health = 100; } })));
      const view = typeof sc.view === 'string' ? new Function('s', 'return ' + sc.view) : sc.view;
      return W.record({ ...sc, ...(every ? { every } : {}), steps, view, subject: sc.subject ? new Function('g', 'return () => ' + sc.subject)(g) : null });
    }, { every: +process.env.EVERY || 0, sc: { ...sc, view: typeof sc.view === 'function' ? sc.view.toString().replace(/^\(s\) => /, '') : sc.view } });
    res.pngs.forEach((png, i) => {
      const file = res.pngs.length > 1 ? `${name}_${i + 1}.png` : `${name}.png`;
      fs.writeFileSync(path.join(OUT, file), Buffer.from(png.split(',')[1], 'base64'));
    });
    report[name] = res.metrics;
    console.log(name, `${res.pngs.length} láminas`, JSON.stringify(res.metrics));
  }
  fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify(report, null, 2));
  await browser.close();
})();
