import * as THREE from 'three';

// Ciclo de día y noche del modo juego y su reloj. El día dura `dia` segundos y la noche
// `noche`; el último tramo del día es el atardecer (el cielo enrojece y avisa de lo que viene).
// El reloj es una esfera partida en 16 tramos (día, atardecer, noche) con una aguja que da una
// vuelta por ciclo y el número de día en el centro.
export const CYCLE = { dia: 300, noche: 300, atardecer: 37.5, tramos: 16 };
// Cielo en cada momento: cenit, horizonte (también es el color de la niebla) y luces.
const SKY = {
  dia: { top: 0x4f93d8, low: 0xa9cdea, hemi: 0xdfeeff, ground: 0x4a4f48, hemiK: 1.1, fog: [70, 270] },
  ocaso: { top: 0x3b3a78, low: 0xf08f58 },
  noche: { top: 0x04060e, low: 0x0c1526, hemi: 0x7f98d0, ground: 0x161b26, hemiK: 0.5, fog: [16, 130] },
};
const SUN = { color: 0xfff2dd, low: 0xff9a55, fuerza: 2.4 };
const MOON = { color: 0x9db4ff, fuerza: 0.8 };
// Cielo del mundo de simulación (el de siempre).
const SIM = { sky: 0x9cc4e8, fog: [45, 130], hemi: 0xdfeeff, ground: 0x4a4f48, hemiK: 1.1, offset: [18, 30, 12] };
const SHADOW_REACH = 46; // distancia de la luz al jugador (m)
const PHASES = { dia: 'Día', atardecer: 'Atardecer', noche: 'Noche' };
export const DAY_TUNING = { CYCLE };

const _a = new THREE.Color(), _b = new THREE.Color(), _c = new THREE.Color();
const smooth = THREE.MathUtils.smoothstep;

function disc(size, paint) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  paint(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class DayNight {
  constructor(scene, { sun, hemi, camera }) {
    Object.assign(this, { scene, sun, hemi, camera });
    this.active = false;
    this.time = 0; // segundos desde el amanecer del día 1
    this.dir = new THREE.Vector3(...SIM.offset).normalize(); // hacia la luz (sol o luna)
    this.light = 1; // 1 = pleno día, 0 = noche cerrada
    this.onPhase = null; // (fase, día) => void, al cambiar de día a atardecer, a noche...
    this.lastPhase = 'dia';

    // Bóveda: degradado del horizonte al cenit y resplandor alrededor del sol.
    this.uniforms = {
      top: { value: new THREE.Color() }, low: { value: new THREE.Color() },
      glow: { value: new THREE.Color(0xffb070) }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, glowK: { value: 0 },
    };
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(280, 24, 12), new THREE.ShaderMaterial({
      uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
      vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform vec3 top; uniform vec3 low; uniform vec3 glow; uniform vec3 sunDir; uniform float glowK;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = clamp(d.y, 0.0, 1.0);
          vec3 c = mix(low, top, pow(h, 0.5));
          float s = max(dot(d, sunDir), 0.0);
          c += glow * glowK * (pow(s, 5.0) * 0.45 + pow(s, 48.0) * 0.5) * (1.0 - h * 0.5);
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;

    // Estrellas, sol y luna.
    const pts = [];
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < 650; i++) {
      const y = rnd() * 0.95 + 0.04, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - y * y);
      pts.push(Math.cos(a) * r * 270, y * 270, Math.sin(a) * r * 270);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 1.7, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.stars.frustumCulled = false;
    const glow = disc(128, (g, n) => {
      const grd = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
      grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.16, 'rgba(255,250,225,1)'); grd.addColorStop(0.24, 'rgba(255,225,160,0.4)'); grd.addColorStop(1, 'rgba(255,200,120,0)');
      g.fillStyle = grd; g.fillRect(0, 0, n, n);
    });
    const moon = disc(128, (g, n) => {
      const grd = g.createRadialGradient(n / 2, n / 2, n * 0.2, n / 2, n / 2, n / 2);
      grd.addColorStop(0, 'rgba(190,210,255,0.35)'); grd.addColorStop(1, 'rgba(160,190,255,0)');
      g.fillStyle = grd; g.fillRect(0, 0, n, n);
      g.fillStyle = '#eef2ff'; g.beginPath(); g.arc(n / 2, n / 2, n * 0.2, 0, 7); g.fill();
      g.fillStyle = 'rgba(150,165,205,0.55)';
      for (const [x, y, r] of [[0.44, 0.44, 0.045], [0.56, 0.5, 0.03], [0.5, 0.6, 0.04], [0.58, 0.4, 0.022], [0.42, 0.56, 0.02]]) { g.beginPath(); g.arc(n * x, n * y, n * r, 0, 7); g.fill(); }
    });
    const sprite = (map, size, blending) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map, fog: false, depthWrite: false, transparent: true, blending, toneMapped: false }));
      sp.scale.setScalar(size);
      return sp;
    };
    this.sunDisc = sprite(glow, 95, THREE.AdditiveBlending);
    this.moonDisc = sprite(moon, 60, THREE.NormalBlending);
    this.sky = new THREE.Group();
    this.sky.add(this.dome, this.stars, this.sunDisc, this.moonDisc);
    this.sky.visible = false;
    scene.add(this.sky);
    this.sunPos = new THREE.Vector3();
    this.moonPos = new THREE.Vector3();
    this.clock = new Clock();
    this.setActive(false);
  }

  /** Segundo dentro del ciclo (0 = amanecer). */
  get t() { return this.time % (CYCLE.dia + CYCLE.noche); }
  get day() { return Math.floor(this.time / (CYCLE.dia + CYCLE.noche)) + 1; }
  get night() { return this.t >= CYCLE.dia; }
  get phase() { return this.night ? 'noche' : this.t >= CYCLE.dia - CYCLE.atardecer ? 'atardecer' : 'dia'; }
  /** Segundos que faltan para que cambie de día a noche o al revés. */
  get left() { return this.night ? CYCLE.dia + CYCLE.noche - this.t : CYCLE.dia - this.t; }

  /** Vuelve al amanecer del día 1. */
  reset() {
    this.time = 0;
    this.lastPhase = 'dia';
    this.apply();
  }

  /** Activa el ciclo (modo juego) o deja el cielo fijo del mundo de simulación. */
  setActive(on) {
    this.active = on;
    this.sky.visible = on;
    this.clock.show(on);
    if (on) return this.apply();
    const { scene, sun, hemi } = this;
    scene.background.set(SIM.sky);
    scene.fog.color.set(SIM.sky);
    [scene.fog.near, scene.fog.far] = SIM.fog;
    hemi.color.set(SIM.hemi);
    hemi.groundColor.set(SIM.ground);
    hemi.intensity = SIM.hemiK;
    sun.color.set(SUN.color);
    sun.intensity = SUN.fuerza;
    this.dir.set(...SIM.offset).normalize();
    this.light = 1;
  }

  update(dt) {
    if (!this.active) return;
    this.time += dt;
    this.apply();
    const phase = this.phase;
    if (phase !== this.lastPhase) {
      this.lastPhase = phase;
      this.onPhase?.(phase, this.day);
    }
  }

  /** Calcula luces, cielo y reloj para el momento actual. */
  apply() {
    const { scene, sun, hemi } = this, C = CYCLE, t = this.t, total = C.dia + C.noche;
    // Luz del día: sube al amanecer (un poco antes de acabar la noche) y cae en el atardecer.
    const tm = t > total / 2 + C.dia / 2 ? t - total : t;
    const L = t < C.dia / 2 || t > total / 2 + C.dia / 2 ? smooth(tm, -22, 8) : 1 - smooth(t, C.dia - C.atardecer, C.dia + 6);
    this.light = L;
    const golden = 0.55 * smooth(t, C.dia * 0.72, C.dia - C.atardecer) * L;
    const warm = Math.max(Math.sin(Math.PI * L), golden);

    // Sol y luna: un arco de este a oeste cada uno.
    const u = t / C.dia, v = (t - C.dia) / C.noche;
    this.sunPos.set(Math.cos(Math.PI * u), Math.sin(Math.PI * u) * 0.92, 0.36).normalize();
    this.moonPos.set(Math.cos(Math.PI * v), Math.sin(Math.PI * v) * 0.8, -0.42).normalize();
    const day = L > 0.001;
    const moonK = smooth(t, C.dia + 8, C.dia + 45) * (1 - smooth(t, total - 45, total - 22));
    this.dir.copy(day ? this.sunPos : this.moonPos);
    this.dir.y = Math.max(this.dir.y, 0.26); // sombras largas, pero no rasantes
    this.dir.normalize();
    if (day) {
      sun.color.set(SUN.color).lerp(_a.set(SUN.low), warm);
      sun.intensity = SUN.fuerza * L * (0.35 + 0.65 * smooth(this.sunPos.y, 0, 0.4));
    } else {
      sun.color.set(MOON.color);
      sun.intensity = MOON.fuerza * moonK;
    }
    hemi.color.set(SKY.noche.hemi).lerp(_a.set(SKY.dia.hemi), L);
    hemi.groundColor.set(SKY.noche.ground).lerp(_a.set(SKY.dia.ground), L);
    hemi.intensity = THREE.MathUtils.lerp(SKY.noche.hemiK, SKY.dia.hemiK, L);

    const top = _b.set(SKY.noche.top).lerp(_a.set(SKY.dia.top), L).lerp(_a.set(SKY.ocaso.top), warm * 0.8);
    const low = _c.set(SKY.noche.low).lerp(_a.set(SKY.dia.low), L).lerp(_a.set(SKY.ocaso.low), warm * 0.8);
    this.uniforms.top.value.copy(top);
    this.uniforms.low.value.copy(low);
    this.uniforms.sunDir.value.copy(this.sunPos);
    this.uniforms.glowK.value = warm;
    scene.background.copy(low);
    scene.fog.color.copy(low);
    scene.fog.near = THREE.MathUtils.lerp(SKY.noche.fog[0], SKY.dia.fog[0], L);
    scene.fog.far = THREE.MathUtils.lerp(SKY.noche.fog[1], SKY.dia.fog[1], L);
    this.stars.material.opacity = (1 - L) ** 2 * 0.95;
    this.sunDisc.material.opacity = smooth(this.sunPos.y, -0.08, 0.04) * (t < C.dia + 10 || t > total - 10 ? 1 : 0);
    this.sunDisc.material.color.set(0xffffff).lerp(_a.set(0xff8a4a), warm);
    this.moonDisc.material.opacity = smooth(this.moonPos.y, -0.05, 0.08) * (1 - L);
    this.clock.set(t / total, this.day, this.phase, this.left);
  }

  /** Antes de dibujar: el cielo sigue a la cámara y la luz (con su sombra) al jugador. */
  follow(focus) {
    const { sun } = this;
    sun.target.position.copy(focus);
    sun.position.copy(focus).addScaledVector(this.dir, SHADOW_REACH);
    if (!this.active) return;
    const c = this.camera.position;
    this.sky.position.copy(c);
    this.sunDisc.position.copy(this.sunPos).multiplyScalar(262);
    this.moonDisc.position.copy(this.moonPos).multiplyScalar(262);
  }
}

// ---------------------------------------------------------------------------
// Reloj: esfera dibujada con SVG, de trazo irregular, arriba a la derecha.
// ---------------------------------------------------------------------------
const NS = 'http://www.w3.org/2000/svg';
const COLORS = { dia: '#f0c445', atardecer: '#d8643a', noche: '#34457e' };

class Clock {
  constructor() {
    const root = document.createElement('div');
    root.id = 'clock';
    root.hidden = true;
    const n = CYCLE.tramos, total = CYCLE.dia + CYCLE.noche;
    let wedges = '';
    for (let k = 0; k < n; k++) {
      const mid = ((k + 0.5) / n) * total;
      const kind = mid >= CYCLE.dia ? 'noche' : mid >= CYCLE.dia - CYCLE.atardecer ? 'atardecer' : 'dia';
      // Cuña entre dos radios, con un pequeño hueco a cada lado; los bordes van algo torcidos.
      const a0 = (k / n) * Math.PI * 2 + 0.035, a1 = ((k + 1) / n) * Math.PI * 2 - 0.035;
      const j = (i) => Math.sin(k * 12.9898 + i * 78.233) * 0.9;
      const p = (a, r, i) => `${(Math.sin(a) * (r + j(i))).toFixed(2)},${(-Math.cos(a) * (r + j(i))).toFixed(2)}`;
      wedges += `<path class="w" data-k="${k}" d="M${p(a0, 17, 0)} L${p(a0, 41.5, 1)} A42,42 0 0 1 ${p(a1, 41.5, 2)} L${p(a1, 17, 3)} A17,17 0 0 0 ${p(a0, 17, 0)} Z" fill="${COLORS[kind]}"/>`;
    }
    root.innerHTML = `
      <svg viewBox="-52 -52 104 104" xmlns="${NS}" aria-hidden="true">
        <defs><filter id="clock-rough" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.07" numOctaves="2" seed="4" result="n"/>
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.6"/>
        </filter></defs>
        <g filter="url(#clock-rough)">
          <circle r="48" fill="#3a2716" stroke="#150d06" stroke-width="3"/>
          <circle r="44.5" fill="#20150b"/>
          <g stroke="#150d06" stroke-width="1.5" stroke-linejoin="round">${wedges}</g>
          <g id="clock-hand"><path d="M-3.4,3 L-1.5,-37 L0,-44 L1.5,-37 L3.4,3 Z" fill="#f6ecd0" stroke="#150d06" stroke-width="1.5" stroke-linejoin="round"/></g>
          <circle r="14.5" fill="#ecdfba" stroke="#150d06" stroke-width="2.2"/>
        </g>
        <text y="-3.6" text-anchor="middle" font-size="7" font-weight="700" fill="#3a2716" id="clock-word">Día</text>
        <text y="9" text-anchor="middle" font-size="13.5" font-weight="800" fill="#20150b" id="clock-day">1</text>
      </svg>
      <div id="clock-label"></div>`;
    document.body.appendChild(root);
    this.root = root;
    this.hand = root.querySelector('#clock-hand');
    this.dayText = root.querySelector('#clock-day');
    this.label = root.querySelector('#clock-label');
    this.wedges = [...root.querySelectorAll('.w')];
    this.shown = {};
  }

  show(on) {
    this.root.hidden = !on;
    document.body.classList.toggle('game-mode', on);
  }

  /** `turn`: fracción del ciclo (0-1); `left`: segundos hasta el próximo cambio. */
  set(turn, day, phase, left) {
    const S = this.shown;
    const angle = Math.round(turn * 3600) / 10;
    if (angle !== S.angle) { S.angle = angle; this.hand.setAttribute('transform', `rotate(${angle})`); }
    if (day !== S.day) { S.day = day; this.dayText.textContent = day; }
    // Los tramos ya pasados se apagan: de un vistazo se ve cuánto queda.
    const k = Math.floor(turn * this.wedges.length);
    if (k !== S.k) { S.k = k; this.wedges.forEach((w, i) => w.setAttribute('opacity', i < k ? 0.45 : 1)); }
    const secs = Math.ceil(left), text = `${phase === 'noche' ? 'Amanece' : 'Anochece'} en ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    if (text !== S.text) { S.text = text; this.label.textContent = text; }
    if (phase !== S.phase) { S.phase = phase; this.root.dataset.phase = phase; this.label.title = PHASES[phase]; }
  }
}
