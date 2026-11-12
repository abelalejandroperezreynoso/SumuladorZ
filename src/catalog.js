import * as THREE from 'three';
import { SCENES, GROUPS, place, clipList } from './catalog-scenes.js';
import { TUNING, POSES, POSE_SPEC } from './player.js';

// Catálogo de mecánicas y animaciones dentro del juego (tecla G o botón «Catálogo»).
// No guarda imágenes: cada ficha ejecuta su escena con el motor real y una cámara lateral,
// y los clips, pesos y capas que muestra se leen del personaje en cada fotograma. Por eso
// refleja siempre el código en uso.

const HOLD = 0.7; // pausa al terminar una escena antes de repetirla (s)
const CLIP_SPOT = [20, 30, 0]; // dónde se coloca el personaje para ver un clip suelto
const CLIP_VIEW = Math.PI * 0.8;
const fmt = (x, d = 2) => x.toFixed(d).replace('.', ',');
const shortest = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// Valores de fábrica de cada postura, para «Restablecer» y para marcar lo que se ha cambiado.
const POSE_DEFAULTS = JSON.parse(JSON.stringify(POSES));
const round = (v) => +v.toFixed(3);
/** Valor de una postura tal como se enseña: grados, metros o tanto por ciento. */
const poseText = (v, unit) => (unit === 'rad' ? `${Math.round(v * 180 / Math.PI)}°`
  : unit === 'm' ? `${fmt(v)} m` : `${Math.round(v * 100)} %`);

// Poses calculadas por código sobre el clip en curso: [rótulo, valor 0-1 leído del personaje].
const PLAYER_LAYERS = [
  ['Flexión (IK)', (p) => Math.max(p.crouch, p.coverCrouch)],
  ['Apuntado', (p) => p.aimWeight],
  ['Retroceso', (p) => p.recoil],
  ['Dos manos', (p) => p.coverGrip * p.aimWeight],
  ['Inclinación', (p) => Math.abs(p.coverLean) / TUNING.PEEK_LEAN],
  ['Recostado', (p) => p.prone],
];
const ZOMBIE_LAYERS = [['Brazos al frente', (z) => z.arms]];

export class Catalog {
  /**
   * game: lo mismo que window.__game. hooks: { toggleSkeleton(): boolean, onOpen(), onClose() }.
   */
  constructor(game, hooks = {}) {
    this.game = game;
    this.hooks = hooks;
    this.scenes = SCENES; // tools/watch.cjs graba estas mismas escenas
    this.place = (x, z, yaw) => place(game, x, z, yaw);
    this.active = false;
    this.skipRender = false; // true mientras se prepara o se adelanta una escena
    this.paused = false;
    this.speed = 1;
    this.tab = 'scenes';
    this.item = null; // escena o clip que se está viendo
    this.subject = game.player;
    this.t = 0;
    this.next = 0;
    this.steps = [];
    this.angle = null;
    this.orbit = 0; // giro, altura y zoom que añade el usuario arrastrando
    this.lift = 0;
    this.zoom = 1;
    this.fit = 1; // alejamiento extra cuando el panel deja poco sitio
    this.frames = 0;
    this.editing = null; // clave de POSES que se está retocando (la escena queda detenida en ella)
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 300);

    // Las escenas pulsan teclas sobre esta entrada simulada; antes de cada paso del juego se
    // copia a la real, de modo que lo que toque el usuario no altera la escena.
    this.fake = { keys: new Set(), buttons: new Set(), pressed: new Set(), auto: null };
    this.g = { ...game, input: this.fake, tick: (dt) => this.tick(dt) };

    this.clips = clipList(game.player.clips);
    this.buildUI();
  }

  // ---------- Interfaz ----------

  buildUI() {
    const root = document.createElement('div');
    root.id = 'catalog';
    root.hidden = true;
    root.innerHTML = `
      <div id="cat-stage"><span>Arrastra para girar la vista · rueda para acercar</span></div>
      <aside id="cat-panel">
        <header>
          <strong>Catálogo</strong>
          <div class="cat-seg" id="cat-tabs">
            <button data-tab="scenes" class="on">Mecánicas</button><button data-tab="clips">Clips</button>
          </div>
          <button id="cat-close" aria-label="Cerrar el catálogo">✕</button>
        </header>
        <div class="cat-row">
          <button id="cat-prev" aria-label="Anterior">‹</button>
          <select id="cat-select" aria-label="Elegir ficha"></select>
          <button id="cat-next" aria-label="Siguiente">›</button>
        </div>
        <div class="cat-row">
          <button id="cat-pause" aria-label="Pausar o reanudar">❚❚</button>
          <button id="cat-step" aria-label="Avanzar un fotograma">›|</button>
          <div class="cat-seg" id="cat-speed">
            <button data-speed="1" class="on">1×</button><button data-speed="0.5">½×</button><button data-speed="0.25">¼×</button>
          </div>
          <button id="cat-bones">Esqueleto</button>
        </div>
        <div id="cat-progress"><i></i></div>
        <div id="cat-body">
          <div id="cat-live"></div>
          <div id="cat-info"></div>
        </div>
      </aside>`;
    document.body.append(root);
    this.root = root;
    const $ = (id) => root.querySelector('#' + id);
    this.el = { stage: $('cat-stage'), panel: $('cat-panel'), select: $('cat-select'), pause: $('cat-pause'),
      bones: $('cat-bones'), progress: $('cat-progress').firstElementChild, live: $('cat-live'), info: $('cat-info') };

    // Lo que ocurra dentro del catálogo no debe llegar a los controles del juego.
    for (const type of ['touchstart', 'touchmove', 'touchend', 'mousedown', 'wheel']) {
      root.addEventListener(type, (e) => e.stopPropagation(), { passive: true });
    }
    $('cat-close').addEventListener('click', () => this.close());
    $('cat-prev').addEventListener('click', () => this.cycle(-1));
    $('cat-next').addEventListener('click', () => this.cycle(1));
    this.el.select.addEventListener('change', () => this.show(this.el.select.value));
    this.el.pause.addEventListener('click', () => this.setPaused(!this.paused));
    $('cat-step').addEventListener('click', () => { this.setPaused(true); this.advance(1 / 60); });
    this.el.bones.addEventListener('click', () => this.toggleBones());
    $('cat-tabs').addEventListener('click', (e) => {
      const tab = e.target.dataset?.tab;
      if (tab && tab !== this.tab) this.setTab(tab);
    });
    $('cat-speed').addEventListener('click', (e) => {
      const speed = +e.target.dataset?.speed;
      if (!speed) return;
      this.speed = speed;
      for (const b of $('cat-speed').children) b.classList.toggle('on', b === e.target);
    });
    this.el.info.addEventListener('click', (e) => {
      const t = e.target.closest('[data-t]')?.dataset.t;
      if (t !== undefined) return this.seek(+t);
      const pose = e.target.closest('[data-pose]')?.dataset.pose;
      if (pose) return this.editPose(pose);
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'copy') this.copyPose();
      else if (act === 'reset') this.resetPose();
      else if (act === 'done') this.editPose(null);
    });
    this.el.info.addEventListener('input', (e) => {
      const key = e.target.dataset?.key;
      if (!key || !this.editing) return;
      POSES[this.editing][key] = round(+e.target.value);
      this.refreshPose();
    });

    // Arrastrar sobre la escena gira y sube la cámara; la rueda acerca.
    let drag = null;
    const stage = this.el.stage;
    stage.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, y: e.clientY };
      stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener('pointermove', (e) => {
      if (!drag) return;
      this.orbit -= (e.clientX - drag.x) * 0.008;
      this.lift = THREE.MathUtils.clamp(this.lift + (e.clientY - drag.y) * 0.008, -1, 3);
      drag.x = e.clientX;
      drag.y = e.clientY;
    });
    const drop = () => { drag = null; };
    stage.addEventListener('pointerup', drop);
    stage.addEventListener('pointercancel', drop);
    stage.addEventListener('wheel', (e) => {
      this.zoom = THREE.MathUtils.clamp(this.zoom * (e.deltaY > 0 ? 1.1 : 0.9), 0.5, 2.5);
    }, { passive: true });

    addEventListener('resize', () => { if (this.active) this.layout(); });
    addEventListener('keydown', (e) => {
      if (!this.active || e.repeat) return;
      if (e.code === 'Escape') this.close();
      else if (e.code === 'ArrowRight') this.cycle(1);
      else if (e.code === 'ArrowLeft') this.cycle(-1);
      else if (e.code === 'Space') this.setPaused(!this.paused);
      else if (e.code === 'KeyK') this.toggleBones();
      else return;
      e.preventDefault();
    });
  }

  toggleBones() {
    this.el.bones.classList.toggle('on', !!this.hooks.toggleSkeleton?.());
  }

  setPaused(paused) {
    this.paused = paused;
    this.el.pause.textContent = paused ? '▶' : '❚❚';
  }

  /** Lista de fichas de la pestaña actual: escenas del juego o clips del modelo. */
  get items() {
    return this.tab === 'scenes' ? SCENES.map((s) => s.id) : this.clips.map((c) => c.name);
  }

  setTab(tab, id) {
    this.tab = tab;
    this.fillSelect();
    this.show(id ?? this.items[0]);
  }

  fillSelect() {
    const tab = this.tab;
    for (const b of this.root.querySelectorAll('#cat-tabs button')) b.classList.toggle('on', b.dataset.tab === tab);
    const option = (value, text) => `<option value="${value}">${text}</option>`;
    const used = (c) => c.player.length || c.zombie.length;
    this.el.select.innerHTML = tab === 'scenes'
      ? GROUPS.map((g) => `<optgroup label="${g.title}">${
        SCENES.filter((s) => s.group === g.id).map((s) => option(s.id, s.title)).join('')}</optgroup>`).join('')
      : `<optgroup label="En uso">${this.clips.filter(used).map((c) => option(c.name, c.name)).join('')}</optgroup>`
        + `<optgroup label="Sin usar">${this.clips.filter((c) => !used(c)).map((c) => option(c.name, c.name)).join('')}</optgroup>`;
  }

  cycle(step) {
    const items = this.items;
    const i = items.indexOf(this.item?.id ?? this.item?.name);
    this.show(items[(i + step + items.length) % items.length]);
  }

  /** Abre una ficha por su identificador (escena) o nombre (clip). */
  show(id) {
    const scene = SCENES.find((s) => s.id === id);
    const clip = !scene && this.clips.find((c) => c.name === id);
    if (!scene && !clip) return;
    const tab = scene ? 'scenes' : 'clips';
    if (tab !== this.tab || !this.el.select.options.length) { this.tab = tab; this.fillSelect(); }
    this.item = scene ?? clip;
    this.editing = null;
    this.el.select.value = id;
    this.orbit = this.lift = 0;
    this.zoom = 1;
    this.restart();
    this.renderInfo();
  }

  renderInfo() {
    const it = this.item;
    let html;
    if (it.steps) {
      const beats = it.steps.filter((s) => s[2]);
      html = `<p class="cat-how">${it.how}</p><p>${it.desc}</p>`
        + (it.poses ? `<div class="cat-poses">${it.poses.map(([key, title]) =>
          `<button data-pose="${key}">Editar postura: ${title}</button>`).join('')}</div>` : '')
        + (beats.length ? `<ol class="cat-beats">${beats.map(([t, , label]) =>
          `<li data-t="${t}"><b>${fmt(t)} s</b>${label}</li>`).join('')}</ol>` : '');
    } else {
      const uses = [
        it.player.length ? `<p><span class="cat-tag on">Jugador</span> ${it.player.join(', ')}</p>` : '',
        it.zombie.length ? `<p><span class="cat-tag zb">Zombi</span> ${it.zombie.join(', ')}</p>` : '',
      ].join('') || '<p><span class="cat-tag">Sin usar</span> El modelo lo trae pero el juego no lo utiliza.</p>';
      html = `<p class="cat-how">Clip del modelo · ${fmt(it.duration)} s</p>${uses}`;
    }
    this.el.info.innerHTML = html;

    // Filas fijas del panel en vivo: solo cambian sus valores en cada fotograma.
    const sub = this.subject;
    const row = (label) => `<div class="cat-bar"><span>${label}</span><i><u></u></i><b></b></div>`;
    // Una fila por animación del sujeto; si dos estados comparten clip (el salto usa una copia
    // del de correr) se añade el estado para distinguirlas.
    const actions = [], labels = [];
    for (const [state, a] of it.steps ? Object.entries(sub.actions) : []) {
      if (actions.includes(a)) continue;
      const name = a.getClip().name;
      labels.push(labels.includes(name) ? `${name} (${state})` : name);
      actions.push(a);
    }
    const layers = !it.steps ? [] : sub === this.game.player ? PLAYER_LAYERS : ZOMBIE_LAYERS;
    this.el.live.innerHTML = '<div class="cat-state"><b></b><span></span></div>'
      + (actions.length ? `<h4>Clips activos</h4>${labels.map(row).join('')}` : '')
      + (layers.length ? `<h4>Capas por código</h4>${layers.map(([label]) => row(label)).join('')}` : '');
    const bars = [...this.el.live.querySelectorAll('.cat-bar')];
    this.liveRows = {
      state: this.el.live.querySelector('.cat-state b'),
      time: this.el.live.querySelector('.cat-state span'),
      actions: actions.map((a, i) => ({ a, row: bars[i] })),
      layers: layers.map(([, read], i) => ({ read, row: bars[actions.length + i] })),
      beats: [...this.el.info.querySelectorAll('.cat-beats li')],
    };
    this.updateLive();
  }

  updateLive() {
    const L = this.liveRows, it = this.item, sub = this.subject;
    if (!L || !it) return;
    const player = this.game.player;
    let state, total;
    if (it.steps) {
      state = sub === player && player.cover?.attached
        ? 'Cover' + (player.cover.veryLow ? 'Prone' : player.cover.high ? 'High' : 'Low') + ':' + sub.state
        : sub.state;
      total = it.seconds;
    } else {
      state = it.name;
      total = it.duration;
    }
    const speed = sub === player ? player.speed : sub.moveSpeed ?? 0;
    const t = it.steps ? Math.min(this.t, total) : player.previewAction?.time ?? 0;
    L.state.textContent = state;
    L.time.textContent = `${fmt(t)} / ${fmt(total)} s · ${fmt(speed, 1)} m/s`;
    this.el.progress.style.transform = `scaleX(${Math.min(1, t / total)})`;
    const set = (row, v, text) => {
      row.classList.toggle('off', v < 0.01);
      row.querySelector('u').style.transform = `scaleX(${THREE.MathUtils.clamp(v, 0, 1)})`;
      row.lastElementChild.textContent = text;
    };
    for (const { a, row } of L.actions) {
      const w = a.isScheduled() && a.enabled ? a.getEffectiveWeight() : 0; // isRunning() excluye la pose congelada del salto
      set(row, w, w < 0.01 ? '' : `${Math.round(w * 100)} % · ×${fmt(a.getEffectiveTimeScale(), 1)}`);
    }
    for (const { read, row } of L.layers) {
      const v = read(sub);
      set(row, v, v < 0.01 ? '' : `${Math.round(Math.min(1, v) * 100)} %`);
    }
    let current = -1;
    L.beats.forEach((li, i) => { if (+li.dataset.t <= this.t) current = i; });
    L.beats.forEach((li, i) => li.classList.toggle('on', i === current));
  }

  // ---------- Editor de posturas ----------

  /**
   * Detiene la escena en el instante en que se ve la postura y cambia la ficha por sus
   * deslizadores. Los cambios se aplican en vivo sobre POSES (también al volver al juego, hasta
   * recargar) y «Copiar» los da como texto para fijarlos en el código. Con null, sale.
   */
  editPose(key) {
    const entry = key && this.item?.poses?.find((p) => p[0] === key);
    if (!entry) {
      this.editing = null;
      this.el.live.hidden = false;
      this.restart();
      this.renderInfo();
      return;
    }
    this.seek(entry[2]);
    this.editing = key;
    this.setPaused(false);
    this.el.live.hidden = true;
    const spec = POSE_SPEC[key];
    this.el.info.innerHTML = `<h4>Postura: ${entry[1]}</h4>`
      + '<p class="cat-how">La escena queda detenida en esta postura. Arrastra la vista para girarla; «Esqueleto» ayuda a ver las articulaciones.</p>'
      + spec.map(([k, label, min, max, unit]) => `<label class="cat-slider" data-row="${k}"><span>${label}</span><b></b>`
        + `<input type="range" id="cat-pose-${k}" data-key="${k}" min="${min}" max="${max}" step="${unit === 'rad' ? 0.01745 : 0.01}"></label>`).join('')
      + '<div class="cat-row cat-wrap"><button data-act="copy">Copiar valores</button><button data-act="reset">Restablecer</button><button data-act="done">Salir</button></div>'
      + '<p class="cat-how" id="cat-pose-msg">Copia los valores y pégalos en el chat para dejarlos fijos en el juego.</p>'
      + '<textarea id="cat-pose-text" readonly rows="3" aria-label="Valores de la postura"></textarea>';
    this.refreshPose(true);
  }

  /** Texto que se comparte: solo números, en las unidades del código (radianes y metros). */
  poseString() {
    const key = this.editing;
    return `postura ${key}: ` + POSE_SPEC[key].map(([k]) => `${k}=${round(POSES[key][k])}`).join(' ');
  }

  refreshPose(setInputs = false) {
    const key = this.editing;
    for (const [k, , , , unit] of POSE_SPEC[key]) {
      const row = this.el.info.querySelector(`[data-row="${k}"]`);
      const v = POSES[key][k];
      if (setInputs) row.querySelector('input').value = v;
      row.querySelector('b').textContent = poseText(v, unit);
      row.classList.toggle('changed', Math.abs(v - POSE_DEFAULTS[key][k]) > 1e-3);
    }
    this.el.info.querySelector('#cat-pose-text').value = this.poseString();
  }

  resetPose() {
    Object.assign(POSES[this.editing], POSE_DEFAULTS[this.editing]);
    this.refreshPose(true);
  }

  copyPose() {
    const area = this.el.info.querySelector('#cat-pose-text');
    const msg = this.el.info.querySelector('#cat-pose-msg');
    const manual = () => {
      // Sin acceso al portapapeles: el texto queda seleccionado para copiarlo a mano.
      area.focus();
      area.select();
      msg.textContent = 'No se pudo copiar solo: el texto de abajo queda seleccionado; cópialo a mano.';
    };
    try {
      navigator.clipboard.writeText(area.value).then(() => { msg.textContent = 'Copiado. Pégalo en el chat.'; }, manual);
    } catch { manual(); }
  }

  /** La cámara encuadra la zona libre de la pantalla, no el centro que tapa el panel. */
  layout() {
    const W = innerWidth, H = innerHeight;
    const r = this.el.panel.getBoundingClientRect();
    this.camera.aspect = W / H;
    this.fit = 1;
    if (r.height > H * 0.8) this.camera.setViewOffset(W, H, -r.width / 2, 0, W, H); // panel lateral
    else { // panel inferior (móvil en vertical): la cámara se aleja para que el sujeto quepa arriba
      this.camera.setViewOffset(W, H, 0, r.height / 2, W, H);
      this.fit = 0.9 * H / (H - r.height);
    }
    this.camera.updateProjectionMatrix();
  }

  // ---------- Reproducción ----------

  open(id) {
    if (this.active) return;
    this.active = true;
    document.exitPointerLock?.();
    this.root.hidden = false;
    document.body.classList.add('catalog');
    this.hooks.onOpen?.();
    this.el.bones.classList.toggle('on', this.game.player.skeletonOnly);
    this.setPaused(false);
    this.layout();
    this.show(id ?? this.item?.id ?? this.item?.name ?? this.items[0]);
  }

  close() {
    if (!this.active) return;
    if (this.editing) this.editPose(null);
    this.skipRender = true;
    place(this.g, 0, 0, 0); // deja el mundo como al empezar
    this.skipRender = false;
    this.active = false;
    this.game.input.keys.clear();
    this.game.input.buttons.clear();
    this.root.hidden = true;
    document.body.classList.remove('catalog');
    this.hooks.onClose?.();
  }

  toggle() {
    if (this.active) this.close(); else this.open();
  }

  /** Copia la entrada simulada a la real e ignora lo que esté pulsando el usuario. */
  flush() {
    const I = this.game.input, F = this.fake;
    I.keys.clear();
    for (const k of F.keys) I.keys.add(k);
    I.pressed.clear();
    for (const k of F.pressed) I.pressed.add(k);
    F.pressed.clear();
    if (!this.game.autopilot.active) { // el piloto escribe él mismo el disparo y el movimiento
      I.buttons.clear();
      for (const b of F.buttons) I.buttons.add(b);
      I.auto = null;
    }
    I.mouseDX = I.mouseDY = I.wheel = 0;
    I.stick.x = I.stick.y = 0;
  }

  tick(dt) {
    this.flush();
    this.game.tick(dt);
  }

  /** Prepara la ficha desde el principio. */
  restart() {
    const it = this.item, player = this.game.player;
    this.skipRender = true;
    if (it.steps) {
      place(this.g, ...it.place);
      it.before?.(this.g);
      this.subject = it.subject?.(this.g) ?? player;
      this.steps = it.steps.slice().sort((a, b) => a[0] - b[0]);
    } else {
      place(this.g, ...CLIP_SPOT);
      player.preview(it.name);
      this.subject = player;
      this.steps = [];
    }
    this.skipRender = false;
    this.t = 0;
    this.next = 0;
    this.angle = null;
  }

  advance(dt) {
    const it = this.item;
    while (this.next < this.steps.length && this.steps[this.next][0] <= this.t) this.steps[this.next++][1]?.(this.g);
    if (it.keepAlive) this.game.player.health = TUNING.MAX_HEALTH;
    this.tick(dt);
    this.t += dt;
    if (it.steps && this.t >= it.seconds + HOLD) this.restart();
  }

  /** Salta al segundo t de la escena volviendo a simularla desde el principio. */
  seek(t) {
    if (!this.item.steps) return;
    this.restart();
    this.skipRender = true;
    while (this.t < Math.min(t, this.item.seconds)) this.advance(1 / 60);
    this.skipRender = false;
  }

  /** Un fotograma del bucle principal mientras el catálogo está abierto. */
  frame(dt) {
    // Editando una postura el juego sigue corriendo (para que la pose se recalcule) pero la
    // escena no avanza: las teclas que tenía pulsadas se mantienen.
    if (this.editing && !this.paused) this.tick(dt);
    else if (!this.paused) this.advance(dt * this.speed);
    else {
      this.beforeRender();
      this.game.renderer.render(this.game.scene, this.camera);
    }
    if (++this.frames % 4 === 0) this.updateLive();
  }

  /** Coloca la cámara lateral que sigue al sujeto. Lo llama tick() justo antes de dibujar. */
  beforeRender() {
    const player = this.game.player;
    const sub = this.subject.model.parent ? this.subject : player; // el zombi puede haber desaparecido
    const it = this.item;
    const view = it?.steps ? it.view ?? 1.2 : CLIP_VIEW;
    const target = (typeof view === 'function' ? view(sub) : view) + this.orbit;
    // Las vistas que dependen del rumbo del sujeto se suavizan para que la cámara no dé latigazos.
    this.angle = this.angle === null || typeof view !== 'function'
      ? target : this.angle + shortest(target - this.angle) * 0.06;
    const dist = (it?.dist ?? 3.6) * this.zoom * this.fit;
    const p = sub.position;
    this.camera.position.set(p.x + Math.sin(this.angle) * dist, p.y + 1.25 + this.lift, p.z + Math.cos(this.angle) * dist);
    this.camera.lookAt(p.x, p.y + 0.85, p.z);
    this.camera.updateMatrixWorld(true);
    player.model.visible = true;
  }
}
