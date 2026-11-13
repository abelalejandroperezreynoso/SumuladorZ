// Escenas del catálogo de mecánicas: cada una prepara una situación y dice qué pulsar y cuándo.
// Las usan el catálogo del juego (src/catalog.js, tecla G) y tools/watch.cjs, así que una
// escena nueva aparece en los dos sitios. Los textos toman sus cifras de los valores reales
// del juego para no quedar desfasados.
import { TUNING as T, PLAYER_CLIPS } from './player.js';
import { ZOMBIE_TUNING as Z, ZOMBIE_CLIPS } from './horde.js';
import { COMBAT_TUNING as C } from './combat.js';
import { AUTOPILOT_TUNING as A } from './autopilot.js';
import { PICKUP_TUNING as K2 } from './pickups.js';
import { CAMERA_TUNING as K } from './camera.js';

const n = (x, digits = 2) => String(+x.toFixed(digits)).replace('.', ',');
const jumpHeight = (v) => (v * v) / (2 * T.GRAVITY);

// Acciones de una escena. Reciben `g` (lo mismo que window.__game).
const key = (k, on = true) => (g) => { if (on) g.input.keys.add(k); else g.input.keys.delete(k); };
const press = (k) => (g) => { g.input.pressed.add(k); };
const fire = (on) => (g) => { if (on) g.input.buttons.add(0); else g.input.buttons.delete(0); };
const aim = (on) => (g) => { if (on) g.input.buttons.add(2); else g.input.buttons.delete(2); };
const all = (...fns) => (g) => { for (const f of fns) f(g); };

/** Deja el mundo limpio y al jugador quieto en (x, z) con la cámara mirando hacia `yaw`. */
export function place(g, x, z, yaw = 0) {
  // El piloto de la escena «piloto» seguiría jugando (y matando al zombi) en las siguientes.
  if (g.autopilot.active) g.autopilot.toggle();
  g.player.preview(null);
  g.horde.stop(); g.physics.reset(); g.player.respawn();
  // Las escenas empiezan con la pistola cargada y sin objetos por el suelo.
  g.pickups?.clear();
  g.player.pickUp('pistola', 99);
  g.player.body.setTranslation({ x, y: 0.9, z }, true);
  g.player.body.setNextKinematicTranslation({ x, y: 0.9, z });
  g.input.keys.clear(); g.input.buttons.clear(); g.input.pressed.clear();
  g.input.auto = null;
  g.cam.yaw = yaw; g.cam.pitch = 0.1;
  for (let i = 0; i < 20; i++) g.tick(1 / 60);
}

export const GROUPS = [
  { id: 'movimiento', title: 'Movimiento' },
  { id: 'combate', title: 'Combate' },
  { id: 'cobertura', title: 'Cobertura' },
  { id: 'enemigos', title: 'Enemigos' },
  { id: 'piloto', title: 'Piloto automático' },
];

// place: [x, z, rumbo de la cámara]. view: ángulo de la cámara lateral (o función del sujeto).
// steps: [segundo, acción, rótulo]; los pasos con rótulo son los momentos clave de la ficha.
export const SCENES = [
  { id: 'locomocion', group: 'movimiento', title: 'Caminar, correr y carrera rápida',
    how: 'W A S D caminar · Shift correr · Q carrera rápida',
    desc: `Tres marchas: ${n(T.WALK_SPEED)}, ${n(T.RUN_SPEED)} y ${n(T.SPRINT_SPEED)} m/s. De caminar a correr se conserva la fase del paso, y ninguna marcha cambia antes de ${n(T.STATE_DWELL)} s para que no parpadee. La carrera rápida se activa con un toque, dura mientras avances y no deja disparar.`,
    place: [-30, 30, -Math.PI / 2], seconds: 6.4, view: 0,
    steps: [[0.2, key('KeyW'), 'Empieza a caminar'], [1.8, key('ShiftLeft'), 'Pasa a correr'],
      [3.4, press('KeyQ'), 'Carrera rápida'], [5.2, all(key('KeyW', false), key('ShiftLeft', false)), 'Suelta y frena']] },
  { id: 'parado', group: 'movimiento', title: 'De pie, en reposo',
    how: 'Sin tocar nada',
    desc: 'Quieto, de pie y relajado: pies bajo la cadera con las rodillas casi rectas, brazos colgando junto a los muslos, tronco y cabeza erguidos y una respiración suave. La postura se arma por código sobre el clip de reposo del modelo (una guardia con los brazos abiertos) y se deshace en cuanto se mueve, apunta o se cubre.',
    place: [20, 30, Math.PI], seconds: 4, view: Math.PI * 0.85, dist: 3,
    steps: [[0.1, null, 'De pie, en reposo'], [2.5, key('KeyW'), 'Echa a andar'], [3.2, key('KeyW', false)]],
    poses: [['parado', 'De pie', 1.8]] },
  { id: 'giro', group: 'movimiento', title: 'Media vuelta en carrera',
    how: 'W + Shift, luego S',
    desc: `El cuerpo gira con suavizado y un tope de ${n(T.MAX_TURN)} rad/s: la media vuelta tarda en torno a ${n(Math.PI / T.MAX_TURN)} s en lugar de dar un latigazo.`,
    place: [0, 30, 0], seconds: 3.2, view: Math.PI / 2,
    steps: [[0.1, all(key('KeyW'), key('ShiftLeft')), 'Corre hacia delante'],
      [1.3, all(key('KeyW', false), key('KeyS')), 'Invierte la dirección'], [2.6, key('KeyS', false), 'Suelta']] },
  { id: 'salto_parado', group: 'movimiento', title: 'Salto parado',
    how: 'Espacio',
    desc: `No es instantáneo: flexiona las piernas ${n(T.CROUCH_TIME)} s, despega a ${n(T.JUMP_SPEED)} m/s (unos ${n(jumpHeight(T.JUMP_SPEED))} m de altura) y amortigua la caída con otra flexión de ${n(T.LAND_TIME)} s. El modelo no trae clip de salto: en el aire se usa una zancada de carrera congelada.`,
    place: [20, 30, 0], seconds: 1.6, view: Math.PI / 2,
    steps: [[0.1, press('Space'), 'Flexión de impulso'], [0.1 + T.CROUCH_TIME, null, 'Despegue'], [1.0, null, 'Aterrizaje']] },
  { id: 'salto_carrera', group: 'movimiento', title: 'Salto en carrera',
    how: 'W + Shift, luego Espacio',
    desc: `A más velocidad la batida es más corta (hasta ${n(T.SPRINT_CROUCH_TIME)} s a tope) y el salto algo más alto y largo. En el aire casi no se corrige la trayectoria y al caer se conserva el ${n(T.LAND_SLOWDOWN * 100)} % de la velocidad.`,
    place: [-30, 30, -Math.PI / 2], seconds: 2.6, view: 0,
    steps: [[0, all(key('KeyW'), key('ShiftLeft')), 'Carrera'], [1.0, press('Space'), 'Batida y salto'], [1.8, null, 'Aterriza y sigue']] },

  { id: 'golpe', group: 'combate', title: 'Puñetazo',
    how: 'F · mando X',
    desc: `Dura ${n(T.PUNCH_TIME)} s y conecta al ${n(T.PUNCH_HIT * 100)} % de la animación. Empuja lo que haya delante del personaje y quita 1,5 de vida a un zombi (tienen ${n(Z.HEALTH)}). Mientras golpea se mueve a un cuarto de velocidad.`,
    place: [20, 30, 0], seconds: 1.2, view: Math.PI * 0.7,
    steps: [[0.1, press('KeyF'), 'Arranca el golpe'], [0.1 + T.PUNCH_TIME * T.PUNCH_HIT, null, 'Conecta'], [0.1 + T.PUNCH_TIME, null, 'Recupera']] },
  { id: 'bate', group: 'combate', title: 'Bate de béisbol',
    how: 'Con el bate en la mano (2 · cruceta): clic izquierdo o F · mando RT o X · botón «Batazo»',
    desc: `Un batazo dura ${n(T.SWING_TIME)} s, usa el clip Sword_Slash y alcanza ${n(T.MELEE.bate.reach + T.MELEE.bate.radius)} m por delante. Quita ${n(T.MELEE.bate.damage)} de vida (un zombi muere de un golpe) y empuja ${n(T.MELEE.bate.push)} veces más que un puñetazo.`,
    place: [20, 30, 0], seconds: 1.6, view: Math.PI * 0.6,
    before: (g) => g.player.pickUp('bate'),
    steps: [[0.2, press('KeyF'), 'Echa el bate atrás'], [0.2 + T.SWING_TIME * 0.45, null, 'Conecta'], [0.2 + T.SWING_TIME, null, 'Recupera']] },
  { id: 'recoger', group: 'combate', title: 'Recoger armas y balas',
    how: 'Pasar por encima del objeto',
    desc: `Se empieza sin armas. Basta acercarse a menos de ${n(K2.REACH)} m: la pistola trae ${K2.GUN_AMMO} balas y cada caja ${K2.BOX_AMMO} (máximo ${T.MAX_AMMO}). Las cajas del escenario reaparecen a los ${K2.AMMO_RESPAWN} s; un zombi suelta ${K2.DROP_AMMO} balas el ${n(K2.DROP_CHANCE * 100, 0)} % de las veces. Al morir, las armas vuelven a su sitio.`,
    place: [20, 30, 0], seconds: 2.4, view: Math.PI * 0.55, dist: 4.2,
    before: (g) => { g.player.resetInventory(); g.pickups.drop('bate', 20, 28.7); g.pickups.drop('pistola', 20, 27.2); g.pickups.drop('balas', 20, 25.8); },
    steps: [[0.2, key('KeyW'), 'Coge el bate'], [0.75, null, 'La pistola'], [1.25, null, 'Las balas'], [1.8, key('KeyW', false)]] },
  // Disparo de pie sin apuntar: ráfaga parado, y después caminando sin dejar de disparar.
  { id: 'disparo', group: 'combate', title: 'Disparar sin apuntar',
    how: 'Clic izquierdo (mantener para ráfaga) · mando RT · botón «Disparo» en táctil',
    desc: `Dispara sin apuntar: la cámara no se mueve y no aparece la mira. El cuerpo gira hacia el centro de la pantalla (hasta ${n(T.AIM_TURN)} rad/s), levanta el brazo y pone el tronco de perfil, con el hombro derecho adelante; las balas se desvían hasta ${n(T.HIP_SPREAD)} rad (apuntando van exactas). Una bala cada ${n(T.FIRE_INTERVAL)} s, con retroceso; las balas son cuerpos físicos a ${n(C.BULLET_SPEED)} m/s. Tras soltar mantiene el brazo arriba ${n(T.AIM_HOLD)} s. Se puede caminar sin dejar de disparar.`,
    place: [20, 30, 0], seconds: 3.6, view: Math.PI * 0.7,
    steps: [[0.3, fire(true), 'Levanta el arma y dispara'], [1.4, key('KeyW'), 'Camina disparando'],
      [2.6, key('KeyW', false), 'Se detiene'], [3.0, fire(false), 'Deja de disparar']] },

  { id: 'apuntar', group: 'combate', title: 'Apuntar (cámara al hombro)',
    how: 'Clic derecho mantenido · mando LT · botón «Apuntar» en táctil (un toque entra, otro sale)',
    desc: `Levanta el arma y la cámara del juego se cierra sobre el hombro derecho: pasa a ${n(K.AIM_DISTANCE)} m del personaje, a la altura de la cabeza, con ${n(K.AIM_FOV)}° de campo (60° normal), aparece la mira y se mueve un ${n((1 - K.AIM_SENS) * 100)} % más lenta. Apuntando, las balas van exactas. Es un mando aparte del disparo: disparar sin apuntar no cierra la cámara. Esta ficha lo muestra desde fuera; el movimiento de cámara se ve jugando.`,
    place: [20, 30, 0], seconds: 3.2, view: Math.PI * 0.7,
    steps: [[0.3, aim(true), 'Apunta sin disparar'], [1.2, fire(true), 'Dispara'], [2.0, fire(false)], [2.4, aim(false), 'Baja el arma']] },

  { id: 'cobertura_baja', group: 'cobertura', title: 'Cobertura baja',
    how: 'C cubrirse · A / D a lo largo · clic disparar a ciegas · clic derecho + clic levantarse y disparar',
    desc: `Se desliza hasta el muro (desde ${n(T.COVER_RANGE)} m como mucho), se agacha (la cadera baja ${n(T.COVER_CROUCH)} m) con la pistola en las dos manos delante del pecho, el cañón hacia arriba (sin ella, las manos en las rodillas), y se desplaza de lado a ${n(T.COVER_CROUCH_SPEED)} m/s con la zancada reducida al ${n(T.STRIDE_CROUCHED * 100)} %. Disparando sin apuntar gira el tronco, sube el hombro derecho, saca los brazos por encima del muro con la cabeza abajo y dispara a ciegas sin dejar de cubrirse (desvío de hasta ${n(T.BLIND_SPREAD)} rad). Apuntando se levanta para tirar por encima, o se asoma por el borde si apuntas hacia ese lado.`,
    place: [-2.8, -3, 0], seconds: 6.6, view: 0.6, dist: 3.2,
    steps: [[0.1, press('KeyC'), 'Se desliza hasta el muro'], [1.3, key('KeyD'), 'Paso lateral'], [2.2, key('KeyD', false)],
      [2.5, fire(true), 'Dispara a ciegas por encima'], [3.4, fire(false), 'Recoge los brazos'],
      [4.0, all(aim(true), fire(true)), 'Apunta: se levanta y dispara'], [5.2, all(fire(false), aim(false)), 'Vuelve a ocultarse']] },
  { id: 'cobertura_alta', group: 'cobertura', title: 'Cobertura alta',
    how: 'C cubrirse · clic disparar a ciegas · clic derecho + clic asomarse y disparar',
    desc: `Tras un muro alto permanece de pie (${n(T.COVER_SPEED)} m/s de lado), con la pistola en las dos manos delante del pecho. Sin apuntar gira e inclina el tronco hacia el borde, estira el brazo por él y dispara a ciegas, si tiene un borde al alcance de la mano (menos de ${n(T.BLIND_EDGE)} m por el lado del arma); si no, no puede. Apuntando da un paso corto más allá del borde, si lo hay a menos de ${n(T.PEEK_REACH)} m, e inclina el tronco ${n(T.PEEK_LEAN)} rad; sin un borde cerca no puede.`,
    place: [3.3, -3.2, 0], seconds: 6.4, view: -0.5, dist: 3.4,
    steps: [[0.1, press('KeyC'), 'Se desliza hasta el muro'], [1.2, key('KeyA'), 'Hasta el borde'], [2.3, key('KeyA', false)],
      [2.5, fire(true), 'Saca el arma por el borde y dispara a ciegas'], [3.4, fire(false)],
      [3.9, all(aim(true), fire(true)), 'Apunta: se asoma por el borde y dispara'], [5.2, all(fire(false), aim(false)), 'Regresa']] },
  { id: 'cobertura_tumbado', group: 'cobertura', title: 'Cobertura muy baja (acostado)',
    how: 'C junto a un objeto de menos de unos 60 cm',
    desc: `Se acuesta boca arriba, perpendicular al objeto, con la cabeza recostada en él, una rodilla levantada y el arma sobre el pecho. Se desplaza de lado a ${n(T.PRONE_SPEED)} m/s apoyándose en manos y pies: los planta en el suelo, levanta un poco el cuerpo y lo desliza ${n(T.CRAWL_STEP * 100)} cm entre ellos; luego los adelanta. La cámara baja casi a ras del objeto. Disparando sin apuntar se encorva levantando los hombros, alza el arma sobre el pecho y dispara a ciegas sin incorporarse. Al apuntar se incorpora de rodillas y la cámara se cierra sobre el hombro. La pose se arma por código: el modelo no trae un clip así.`,
    place: [5.6, -5.5, 0], seconds: 8.2, view: 0.7, dist: 3.4,
    steps: [[0.1, press('KeyC'), 'Se desliza y se acuesta'], [1.6, key('KeyD'), 'Se desplaza de lado con manos y pies'], [2.8, key('KeyD', false)],
      [3.1, key('KeyA'), 'Vuelve hacia el otro lado'], [4.1, key('KeyA', false)],
      [4.4, fire(true), 'Dispara a ciegas sin incorporarse'], [5.2, fire(false)],
      [5.8, aim(true), 'Se arrodilla y apunta'], [6.3, fire(true), 'Dispara'], [7.0, all(fire(false), aim(false)), 'Vuelve a acostarse']],
    // Posturas editables desde la ficha: [clave de POSES, título, segundo de la escena en que se ve].
    poses: [['recostado', 'Acostado', 1.5], ['rodillas', 'De rodillas, apuntando', 6.2]] },

  { id: 'zombi', group: 'enemigos', title: 'Zombi: persecución, mordida y muerte',
    how: 'H inicia la horda',
    desc: `Persigue a ${n(Z.CHASE_SPEED)} m/s con los brazos extendidos, usando el clip de correr a ritmo lento. A ${n(Z.ATTACK_RANGE)} m muerde: cada mordida dura ${n(Z.ATTACK_TIME)} s y quita ${n(Z.BITE_DAMAGE)} de vida. Un impacto lo aturde ${n(Z.STAGGER)} s; tiene ${n(Z.HEALTH)} de vida (una bala quita 1) y el cadáver queda ${n(Z.CORPSE_TIME)} s.`,
    place: [20, 20, 0], seconds: 7.5, view: (s) => s.facing + Math.PI / 2, dist: 3.8,
    before: (g) => {
      g.horde.start();
      for (let i = 0; i < 40; i++) g.tick(1 / 60);
      const z = g.horde.zombies[0];
      z.body.setTranslation({ x: 20, y: 0.9, z: 31 }, true);
      z.body.setNextKinematicTranslation({ x: 20, y: 0.9, z: 31 });
      z.facing = Math.PI;
      g.tick(1 / 60);
    },
    subject: (g) => g.horde.zombies[0],
    steps: [[0, null, 'Persecución'], [5.2, (g) => g.horde.zombies[0]?.damage(1, g.player), 'Recibe un impacto'],
      [6.0, (g) => g.horde.zombies[0]?.damage(5, g.player), 'Muere']],
    keepAlive: true },

  // El piloto automático jugando: se le ve buscar cobertura, asomarse y disparar.
  { id: 'piloto', group: 'piloto', title: 'Partida del piloto automático',
    how: 'P o menú → Ajustes → Piloto automático · mando: cruceta arriba',
    desc: `El juego jugándose solo con los mismos controles que un jugador: inicia la horda, busca cobertura (rota entre alta, baja y muy baja), dispara a los zombis que ve a menos de ${n(A.SHOOT_RANGE)} m, huye cuando se acercan a ${n(A.FLEE_START)} m y golpea si lo acorralan. Cada repetición sale distinta.`,
    place: [0, 0, 0], seconds: 16, view: (s) => s.facing + 2.4, dist: 4.2,
    before: (g) => { g.input.pressed.add('KeyP'); g.tick(1 / 60); },
    steps: [], keepAlive: true },
];

// Para qué usa el juego cada estado de animación (texto de la lista de clips).
const ROLES = {
  player: { Idle: 'reposo', Walking: 'caminar y arrastrarse', Running: 'correr', Punch: 'puñetazo',
    Jump: 'pose de salto (congelado)', CoverLeft: 'paso lateral a cubierto', CoverRight: 'paso lateral a cubierto' },
  zombie: { Idle: 'quieto', Walk: 'deambular', Run: 'perseguir', Attack: 'morder', Hit: 'aturdido', Death: 'morir' },
};

/** Todos los clips del modelo con quién los usa y para qué; se calcula del código en uso. */
export function clipList(animations) {
  const uses = (map, roles, name) => Object.keys(map).filter((s) => map[s] === name).map((s) => roles[s] ?? s);
  return animations.map((c) => ({
    name: c.name,
    duration: c.duration,
    player: [...new Set(uses(PLAYER_CLIPS, ROLES.player, c.name))],
    zombie: [...new Set(uses(ZOMBIE_CLIPS, ROLES.zombie, c.name))],
  }));
}
