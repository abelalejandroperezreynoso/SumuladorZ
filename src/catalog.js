import * as THREE from 'three';
import { SCENES, GROUPS, place, clipList } from './catalog-scenes.js';
import { TUNING, POSES, POSE_SPEC, POSE_FIXED } from './player.js';

// Catálogo de mecánicas y animaciones dentro del juego (tecla G o menú → «Catálogo»).
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
const PICK_RADIUS = 46; // distancia máxima en píxeles entre el toque y la parte del cuerpo
const DRAG_TURN = 0.011; // radianes que gira la parte por cada píxel arrastrado
const _va = new THREE.Vector3();
const _vb = new THREE.Vector3();
const _focus = new THREE.Vector3();
const _qr = new THREE.Quaternion();
const _qs = new THREE.Quaternion();
/** Valor de una postura tal como se enseña: grados, metros o tanto por ciento. */
const poseText = (v, unit) => (unit === 'rad' ? `${Math.round(v * 180 / Math.PI)}°`
  : unit === 'm' ? `${fmt(v)} m` : `${Math.round(v * 100)} %`);

// Poses calculadas por código sobre el clip en curso: [rótulo, valor 0-1 leído del personaje].
const PLAYER_LAYERS = [
  ['Flexión (IK)', (p) => Math.max(p.crouch, p.coverCrouch)],
  ['Apuntado', (p) => p.aimWeight],
  ['Retroceso', (p) => p.recoil],
  ['Dos manos', (p) => p.coverGrip * p.aimWeight],
  ['A ciegas (con giro del tronco)', (p) => p.blindW],
  ['Inclinación', (p) => Math.abs(p.coverLean) / TUNING.PEEK_LEAN],
  ['Recostado', (p) => p.prone],
];
const ZOMBIE_LAYERS = [['Brazos al frente', (z) => z.arms]];

export class Catalog {
  /**
   * game: lo mismo que window.__game. hooks: { onOpen(), onClose() }.
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
    this.part = null; // parte del cuerpo seleccionada en el editor
    this.dragMode = 'view'; // qué hace arrastrar en el editor: 'view' gira la vista, 'part' gira la parte
    this.focus = null; // punto que mira la cámara mientras se edita
    // Marca de la parte seleccionada: su articulación y su extremo, visibles a través del cuerpo.
    const dot = (r, color) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 10),
        new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.9 }));
      m.renderOrder = 999;
      m.visible = false;
      game.scene.add(m);
      return m;
    };
    this.marks = [dot(0.045, 0xffd479), dot(0.028, 0xffffff)];
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
      <div id="cat-stage"><span>Arrastra para girar la vista · rueda o pellizco para acercar</span></div>
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
      progress: $('cat-progress').firstElementChild, live: $('cat-live'), info: $('cat-info') };

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
      else if (act === 'part-reset') this.resetPart();
      const drag = e.target.closest('[data-drag]')?.dataset.drag;
      if (drag) this.setDragMode(drag);
    });
    // «Girar sobre su eje»: el deslizador aplica lo que se mueve y vuelve al centro al soltarlo.
    let twist = 0;
    this.el.info.addEventListener('change', (e) => {
      if (e.target.id === 'cat-part-twist') { e.target.value = 0; twist = 0; }
    });
    this.el.info.addEventListener('input', (e) => {
      if (e.target.id === 'cat-part-twist') {
        this.twistPart((+e.target.value - twist) * Math.PI);
        twist = +e.target.value;
        return;
      }
      const key = e.target.dataset?.key;
      if (!key || !this.editing) return;
      POSES[this.editing][key] = round(+e.target.value);
      this.refreshPose();
    });

    // Arrastrar sobre la escena gira y sube la cámara; la rueda acerca.
    // Con dos dedos se acerca o aleja (pellizco). En el editor, un toque sin arrastrar
    // selecciona la parte del cuerpo y arrastrar la gira si está en modo «Girar parte».
    const stage = this.el.stage;
    const touches = new Map(); // dedos o ratón sobre la escena
    let moved = 0, spread = 0;
    const gap = () => { const [a, b] = [...touches.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    const zoomBy = (k) => { this.zoom = THREE.MathUtils.clamp(this.zoom * k, this.editing ? 0.3 : 0.5, 2.5); };
    stage.addEventListener('pointerdown', (e) => {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      stage.setPointerCapture(e.pointerId);
      if (touches.size === 1) moved = 0;
      else { spread = gap(); moved = 99; }
    });
    stage.addEventListener('pointermove', (e) => {
      const p = touches.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (touches.size > 1) {
        const now = gap();
        if (spread > 0 && now > 0) zoomBy(spread / now);
        spread = now;
        return;
      }
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved < 6) return; // aún puede ser un toque
      if (this.editing && this.part && this.dragMode === 'part') this.turnPart(dx, dy);
      else {
        this.orbit -= dx * 0.008;
        this.lift = THREE.MathUtils.clamp(this.lift + dy * 0.008, -1, 3);
      }
    });
    const drop = (e) => {
      if (!touches.delete(e.pointerId)) return;
      if (e.type === 'pointerup' && !touches.size && moved < 6 && this.editing) this.pick(e.clientX, e.clientY);
    };
    stage.addEventListener('pointerup', drop);
    stage.addEventListener('pointercancel', drop);
    stage.addEventListener('wheel', (e) => zoomBy(e.deltaY > 0 ? 1.1 : 0.9), { passive: true });

    addEventListener('resize', () => { if (this.active) this.layout(); });
    addEventListener('keydown', (e) => {
      if (!this.active || e.repeat) return;
      if (e.code === 'Escape') this.close();
      else if (e.code === 'ArrowRight') this.cycle(1);
      else if (e.code === 'ArrowLeft') this.cycle(-1);
      else if (e.code === 'Space') this.setPaused(!this.paused);
      else return;
      e.preventDefault();
    });
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
    this.selectPart(null);
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
    this.selectPart(null);
    this.focus = null;
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
      + '<p class="cat-how">La escena queda detenida en esta postura. Pellizca o usa la rueda para acercar. Toca una parte del cuerpo para seleccionarla y arrastra para girarla.</p>'
      + '<div class="cat-part"><b id="cat-part-name"></b>'
      + '<div class="cat-seg" id="cat-drag"><button data-drag="view">Mover vista</button><button data-drag="part">Girar parte</button></div>'
      + '<label class="cat-slider"><span>Girar sobre su eje</span><b></b><input type="range" id="cat-part-twist" min="-1" max="1" step="0.005" value="0"></label>'
      + '<button data-act="part-reset" id="cat-part-reset">Quitar el giro de esta parte</button></div>'
      + `<details class="cat-general"><summary>Ajustes generales (${spec.length})</summary>`
      + spec.map(([k, label, min, max, unit]) => `<label class="cat-slider" data-row="${k}"><span>${label}</span><b></b>`
        + `<input type="range" id="cat-pose-${k}" data-key="${k}" min="${min}" max="${max}" step="${unit === 'rad' ? 0.01745 : 0.01}"></label>`).join('')
      + '</details>'
      + '<div class="cat-row cat-wrap"><button data-act="copy">Copiar valores</button><button data-act="reset">Restablecer</button><button data-act="done">Salir</button></div>'
      + '<p class="cat-how" id="cat-pose-msg">Copia los valores y pégalos en el chat para dejarlos fijos en el juego.</p>'
      + '<textarea id="cat-pose-text" readonly rows="3" aria-label="Valores de la postura"></textarea>';
    this.refreshPose(true);
    this.selectPart(null);
  }

  // --- Partes del cuerpo: seleccionar tocando y girar arrastrando ---

  /** Partes que esta postura deja girar. */
  get parts() {
    const fixed = POSE_FIXED[this.editing] ?? [];
    return this.game.player.parts.filter((p) => !fixed.includes(p.name));
  }

  /** Posición en el mundo del extremo de una parte (o un poco más allá de su articulación). */
  partEnd(part, out) {
    if (part.end) return part.end.getWorldPosition(out);
    return out.setFromMatrixColumn(part.bone.matrixWorld, 1).normalize().multiplyScalar(0.12)
      .add(part.bone.getWorldPosition(_va));
  }

  /** Selecciona la parte cuyo hueso pasa más cerca del punto tocado; si no hay ninguna, deselecciona. */
  pick(x, y) {
    const W = innerWidth, H = innerHeight;
    this.game.player.model.updateMatrixWorld(true);
    const screen = (v) => { v.project(this.camera); v.x = (v.x * 0.5 + 0.5) * W; v.y = (0.5 - v.y * 0.5) * H; return v; };
    let best = null, bestD = PICK_RADIUS;
    for (const part of this.parts) {
      const b = this.partEnd(part, _vb).clone();
      const a = screen(part.bone.getWorldPosition(_va));
      screen(b);
      if (a.z > 1 || b.z > 1) continue; // detrás de la cámara
      // Distancia del toque al segmento a-b en pantalla.
      const abx = b.x - a.x, aby = b.y - a.y;
      const t = THREE.MathUtils.clamp(((x - a.x) * abx + (y - a.y) * aby) / (abx * abx + aby * aby || 1), 0, 1);
      const d = Math.hypot(x - a.x - abx * t, y - a.y - aby * t);
      if (d < bestD) { bestD = d; best = part; }
    }
    this.selectPart(best);
  }

  selectPart(part) {
    this.part = part;
    this.setDragMode(part ? 'part' : 'view');
    if (!part) for (const m of this.marks) m.visible = false;
    const name = this.el.info.querySelector('#cat-part-name');
    if (!name) return;
    name.textContent = part ? part.label : 'Ninguna parte seleccionada: toca el cuerpo';
    this.el.info.querySelector('.cat-part').classList.toggle('none', !part);
    this.refreshPart();
  }

  setDragMode(mode) {
    this.dragMode = this.part ? mode : 'view';
    for (const b of this.el.info.querySelectorAll('[data-drag]')) b.classList.toggle('on', b.dataset.drag === this.dragMode);
  }

  refreshPart() {
    const reset = this.el.info.querySelector('#cat-part-reset');
    if (!reset || !this.editing) return;
    reset.disabled = !this.part || !POSES[this.editing].ajustes[this.part.name];
    this.el.info.querySelector('#cat-pose-text').value = this.poseString();
  }

  /** Arrastrar gira la parte como una bola: de lado a lado sobre la vertical de la pantalla, arriba y abajo sobre su horizontal. */
  turnPart(dx, dy) {
    _qr.setFromAxisAngle(_va.set(0, 1, 0).applyQuaternion(this.camera.quaternion), dx * DRAG_TURN);
    _qs.setFromAxisAngle(_va.set(1, 0, 0).applyQuaternion(this.camera.quaternion), dy * DRAG_TURN);
    this.game.player.adjustBone(this.editing, this.part.name, _qr.multiply(_qs));
    this.refreshPart();
  }

  /** Gira la parte sobre su propio eje (lo que arrastrar no puede hacer). */
  twistPart(angle) {
    if (!this.part || !this.editing) return;
    this.game.player.model.updateMatrixWorld(true);
    const axis = this.partEnd(this.part, _vb).sub(this.part.bone.getWorldPosition(_focus)).normalize();
    this.game.player.adjustBone(this.editing, this.part.name, _qr.setFromAxisAngle(axis, angle));
    this.refreshPart();
  }

  resetPart() {
    if (!this.part || !this.editing) return;
    delete POSES[this.editing].ajustes[this.part.name];
    this.refreshPart();
  }

  /** Texto que se comparte: solo números, en las unidades del código (radianes y metros). */
  poseString() {
    const key = this.editing;
    const turns = Object.entries(POSES[key].ajustes).map(([bone, q]) => `${bone}=${q.join(',')}`);
    return `postura ${key}: ` + POSE_SPEC[key].map(([k]) => `${k}=${round(POSES[key][k])}`).join(' ')
      + (turns.length ? ` | giros: ${turns.join(' ')}` : '');
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
    Object.assign(POSES[this.editing], JSON.parse(JSON.stringify(POSE_DEFAULTS[this.editing])));
    this.refreshPose(true);
    this.refreshPart();
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
    this.setPaused(false);
    this.layout();
    this.show(id ?? this.item?.id ?? this.item?.name ?? this.items[0]);
  }

  close() {
    if (!this.active) return;
    if (this.editing) this.editPose(null);
    this.skipRender = true;
    place(this.g, 0, 0, 0); // deja el mundo como al empezar
    this.game.player.resetInventory();
    this.game.pickups.reset();
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
    player.model.visible = true;
    player.skeleton.visible = true;
    for (const m of this.marks) m.visible = false;
    if (this.editing) {
      // Editando, la cámara mira al cuerpo (o a la parte seleccionada) para poder acercarse.
      player.model.updateMatrixWorld(true);
      (this.part?.bone ?? player.bodyBone).getWorldPosition(_focus);
      this.focus = this.focus ? this.focus.lerp(_focus, 0.15) : _focus.clone();
      const f = this.focus;
      this.camera.position.set(f.x + Math.sin(this.angle) * dist, f.y + 0.4 * Math.min(1, this.zoom) + this.lift, f.z + Math.cos(this.angle) * dist);
      this.camera.lookAt(f);
      this.camera.updateMatrixWorld(true);
      if (this.part) {
        this.part.bone.getWorldPosition(this.marks[0].position);
        this.partEnd(this.part, this.marks[1].position);
        const k = THREE.MathUtils.clamp(dist / 2.5, 0.35, 1.2); // la marca no crece al acercarse
        this.marks[0].scale.setScalar(k);
        this.marks[1].scale.setScalar(k);
        this.marks[0].visible = this.marks[1].visible = true;
      }
      return;
    }
    this.camera.position.set(p.x + Math.sin(this.angle) * dist, p.y + 1.25 + this.lift, p.z + Math.cos(this.angle) * dist);
    this.camera.lookAt(p.x, p.y + 0.85, p.z);
    this.camera.updateMatrixWorld(true);
  }
}
