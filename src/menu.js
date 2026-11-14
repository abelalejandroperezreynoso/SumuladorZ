// Menú del juego: la misma ventana sirve de pantalla de inicio y de pausa. Desde ella se
// juega o se continúa, se inicia la horda, se reinicia el mundo y se abren los ajustes, los
// controles, el catálogo y la información. Los ajustes se recuerdan en este navegador.

const STORE = 'sumuladorz.ajustes';
const $ = (id) => document.getElementById(id);

function load() {
  try { return JSON.parse(localStorage.getItem(STORE)) ?? {}; } catch { return {}; }
}

function save(settings) {
  try { localStorage.setItem(STORE, JSON.stringify(settings)); } catch { /* sin almacenamiento */ }
}

export class Menu {
  /**
   * actions: { play(evento), pause(), toggleHorde(), reset(), catalog(), toggleAuto(),
   * hordeActive(), autoActive(), applySettings(settings) }
   */
  constructor(actions) {
    this.actions = actions;
    this.root = $('overlay');
    this.msg = $('overlay-msg');
    this.play = $('m-play');
    this.horde = $('m-horde');
    this.pauseBtn = $('pause-btn');
    this.sec = $('m-sec');
    this.started = false; // ya se pulsó «Jugar» alguna vez
    this.open = true;
    this.section = null;
    this.settings = { sens: 1, invert: false, ...load() };

    // En iOS un toque no siempre genera «click»: los botones que arrancan el juego responden
    // al propio toque (además, el toque fija el modo táctil antes de bloquear el puntero).
    const tap = (el, fn) => {
      el.addEventListener('touchend', (e) => { e.preventDefault(); fn(e); el.blur(); }, { passive: false });
      el.addEventListener('click', (e) => { fn(e); if (e.detail !== 0) el.blur(); }); // (detail 0: pulsado con el mando)
    };
    tap(this.play, (e) => actions.play(e));
    tap(this.horde, (e) => { actions.toggleHorde(); actions.play(e); });
    tap($('m-reset'), (e) => { actions.reset(); actions.play(e); });
    tap($('overlay-cat'), () => actions.catalog());
    for (const b of this.root.querySelectorAll('[data-sec]')) tap(b, () => this.show(b.dataset.sec));

    // Pausa desde el juego (táctil o ratón). El toque no debe llegar a los controles táctiles.
    this.pauseBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      actions.pause();
    }, { passive: false });
    this.pauseBtn.addEventListener('click', () => { actions.pause(); this.pauseBtn.blur(); });
    // Lo que se toque dentro del menú no mueve la cámara ni dispara.
    for (const type of ['touchstart', 'touchmove']) this.root.addEventListener(type, (e) => e.stopPropagation());

    // Ajustes.
    const sens = $('m-sens'), sensVal = $('m-sens-val');
    const showSens = () => { sensVal.textContent = `${this.settings.sens.toFixed(2).replace('.', ',')}×`; };
    sens.value = this.settings.sens;
    showSens();
    sens.addEventListener('input', () => {
      this.settings.sens = +sens.value;
      showSens();
      this.saveSettings();
    });
    const invert = $('m-invert');
    invert.checked = !!this.settings.invert;
    invert.addEventListener('change', () => { this.settings.invert = invert.checked; this.saveSettings(); });
    $('m-auto').addEventListener('change', () => actions.toggleAuto(true));
    actions.applySettings(this.settings);
  }

  /**
   * Manejo con el mando: las direcciones llevan el foco al control visible más cercano hacia
   * ese lado (← → mueven el deslizador si está elegido), A lo pulsa, B cierra la sección
   * abierta o vuelve al juego y Menú vuelve al juego.
   */
  nav(cmd) {
    const items = [...this.root.querySelectorAll('button, input')]
      .filter((el) => !el.disabled && el.offsetParent !== null);
    let cur = document.activeElement;
    if (!items.includes(cur)) cur = null;
    if (cmd === 'start') return this.actions.play();
    if (cmd === 'back') {
      if (this.section) { const b = this.root.querySelector(`[data-sec="${this.section}"]`); this.show(this.section); this.focus(b); }
      else if (this.started) this.actions.play();
      return;
    }
    if (!cur) return this.focus(items.includes(this.play) ? this.play : items[0]);
    if (cmd === 'ok') {
      if (cur.type === 'range') return;
      cur.click();
      if (!this.root.classList.contains('hidden') && document.activeElement !== cur && cur.offsetParent) this.focus(cur);
      return;
    }
    if (cur.type === 'range' && (cmd === 'left' || cmd === 'right')) {
      cmd === 'right' ? cur.stepUp() : cur.stepDown();
      cur.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    // El más cercano hacia ese lado (penaliza desviarse de la dirección).
    const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[cmd];
    const c = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
    const [x0, y0] = c(cur);
    let best = null, bestScore = Infinity;
    for (const el of items) {
      if (el === cur) continue;
      const [x, y] = c(el), along = (x - x0) * dx + (y - y0) * dy, side = Math.abs((x - x0) * dy) + Math.abs((y - y0) * dx);
      if (along < 4) continue;
      const score = along + side * 2.5;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (best) this.focus(best);
    else if (this.section && dy) this.sec.scrollBy({ top: dy * 140, behavior: 'smooth' }); // texto largo sin controles
  }

  focus(el) {
    if (!el) return;
    for (const o of this.root.querySelectorAll('.pad-focus')) o.classList.remove('pad-focus');
    el.classList.add('pad-focus');
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  saveSettings() {
    save(this.settings);
    this.actions.applySettings(this.settings);
  }

  /** Juego cargado: se puede pulsar «Jugar». */
  ready() {
    this.play.disabled = this.horde.disabled = false;
    this.msg.textContent = '';
  }

  /** Abre una sección (o la cierra si ya estaba abierta). */
  show(name) {
    this.section = this.section === name ? null : name;
    this.sec.hidden = !this.section;
    for (const p of this.sec.querySelectorAll('[data-panel]')) p.hidden = p.dataset.panel !== this.section;
    for (const b of this.root.querySelectorAll('[data-sec]')) b.classList.toggle('on', b.dataset.sec === this.section);
    if (this.section) this.sec.scrollTop = 0;
  }

  /** Muestra u oculta el menú. Si la partida ya empezó, abrirlo es la pausa. */
  setOpen(open) {
    this.open = open;
    this.root.classList.toggle('hidden', !open);
    document.body.classList.toggle('in-menu', open);
    if (!open) this.started = true;
    this.pauseBtn.hidden = open;
    if (!open) return;
    const paused = this.started;
    this.root.classList.toggle('paused', paused);
    this.msg.textContent = paused ? 'En pausa' : this.msg.textContent;
    if (document.body.classList.contains('gamepad') && !this.play.disabled) this.focus(this.play);
    this.play.textContent = paused ? 'Continuar' : 'Jugar';
    const horde = this.actions.hordeActive();
    this.horde.textContent = paused ? (horde ? 'Detener la horda' : 'Iniciar la horda') : 'Jugar contra la horda';
    $('m-auto').checked = this.actions.autoActive();
  }

  get paused() {
    return this.open && this.started;
  }
}
