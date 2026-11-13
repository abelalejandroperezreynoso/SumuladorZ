# SumuladorZ

Juego 3D en tercera persona (Three.js + Rapier, Vite). Código en `src/`, comentarios y textos
en español. El `README.md` describe controles, mecánicas y estructura.

## Cómo trabajar en este repositorio

- Responder al usuario en español.
- **Fusionar siempre los cambios**: tras subir y verificar, crear el pull request y fusionarlo
  en `main` sin preguntar (instrucción del usuario).
- Después de una fusión, reiniciar la rama de trabajo desde `main` antes de seguir.
- Verificar cada cambio en un navegador sin interfaz antes de darlo por bueno, y decir
  claramente lo que no se probó (por ejemplo, los controles táctiles en un móvil real).
- `npx vite build` debe compilar.

## Cómo ver y analizar el juego

No se puede ver vídeo; se usan estas herramientas. Todas necesitan el servidor
(`npx vite --port 5199 &`) y Playwright con Chromium en el entorno.

- **Catálogo en el juego** — tecla `G`, menú → «Catálogo» o `#catalogo` en la dirección
  (`src/catalog.js`). Ejecuta cada escena en vivo y muestra clips activos, pesos y capas por
  código. Las escenas se definen una sola vez en `src/catalog-scenes.js` (las usa también
  `tools/watch.cjs`): al añadir o cambiar una mecánica, añadir o ajustar ahí su escena y tomar
  las cifras del texto de `TUNING` para que el catálogo no quede desfasado.
- **Editor de posturas** — en el catálogo, las fichas con `poses` («Cobertura muy baja» y
  «De pie, en reposo») tienen botones «Editar postura». La escena se detiene en esa postura y aparecen
  deslizadores que cambian `POSES` (`src/player.js`) en vivo. Además se puede tocar una parte
  del cuerpo para seleccionarla y arrastrar para girarla libremente; esos giros se guardan por
  hueso en `POSES.<clave>.ajustes`. «Copiar valores» da un texto como
  `postura recostado: giro=1.85 altura=0.2 … | giros: UpperLegR=-0.34,-0.22,0.08,0.91 …`
  (radianes, metros y cuaterniones x,y,z,w). Cuando el usuario pegue uno en el chat, pasar los
  números a `POSES` y los giros a su `ajustes`, y verificar la pose con `tools/watch.cjs`. Para
  hacer editable otra postura: añadir sus valores a `POSES`, sus deslizadores a `POSE_SPEC`,
  llamar a `applyAdjust(clave, peso)` donde se arma y poner `poses: [[clave, título, segundo]]`
  en su escena.
- **Animaciones y sensación** — `node tools/watch.cjs <carpeta> [escena...]`
  Guarda tiras de fotogramas a 30 imágenes por segundo de cada mecánica y mide pies que
  resbalan, saltos bruscos de pose, tirones del personaje y de la cámara y velocidad de giro.
  Mirar las láminas y comparar las medidas antes y después de un cambio.
  El personaje y los zombis son solo esqueletos (`src/skeleton.js`): el usuario pidió quitar
  los modelos 3D. Del GLB se usan los huesos y las animaciones; las mallas se eliminan al
  cargar (`Player.load`) y no hay forma de mostrarlas. No volver a ofrecer ni mencionar «el
  modelo con piel». La cabeza es un poliedro de caras planas, como los huesos, con el mentón en punta
  hacia donde mira.
  Las animaciones de caminar y correr tuercen el pie izquierdo ~60° hacia dentro:
  `SkeletonView.straightenFeet` (márgenes en `FOOT_YAW`) endereza los pies de jugador y zombis.
- **Equilibrio del juego** — `node tools/gameplay.cjs <bot|stand|punch> [segundos]`
  Juega una partida larga y resume cada oleada. Comparar los tres estilos: si quedarse quieto
  disparando (`stand`) llega lejos, el juego es demasiado fácil. Juega con la pistola y munición
  infinita (`player.infiniteAmmo`), como el piloto automático, para comparar con análisis
  anteriores; en una partida real se empieza sin armas y las balas se recogen (`src/pickups.js`).
  Apuntar (botón 2) y disparar (botón 0) son mandos separados: el piloto y `gameplay.cjs`
  pulsan los dos para disparar apuntando; solo el 0 es disparo sin apuntar (a ciegas a cubierto).
- **Piloto automático** — tecla `P` en el juego (`src/autopilot.js`). Su registro está en
  `window.__game.autopilot.log` y `.stats`. Busca cobertura de forma activa y va rotando
  entre alta, baja y muy baja (`stats.coverTypes`). La escena `piloto` de `tools/watch.cjs`
  graba 16 s de su partida.
- **Proporciones** — `src/proportions.js` lleva brazos y manos del modelo a medidas humanas
  (fracciones de la estatura, 1,75 m) escalando huesos y pistas de posición de los clips; se
  aplica al cargar, antes de clonar el modelo para los zombis. El modelo original trae brazos
  de 40 cm de hombro a muñeca; corregidos miden 56 cm. Piernas y tronco ya estaban bien.
- **Pies que no resbalan** — `src/gait.js` (jugador y zombis): al caminar o correr de frente
  escala la zancada a la medida del avance (`CLIP_SPEED` es lo que avanza cada clip a ritmo 1)
  y clava el pie de apoyo en el mundo, recalculando la pierna. Si se cambia una velocidad de
  marcha o el ritmo de un clip, comprobar que el pie apoyado sigue quieto (la medida
  `footSlide` de `tools/watch.cjs` incluye el instante de apoyar y despegar; en apoyo pleno
  debe dar ~0). De lado o hacia atrás (apuntando) no actúa. De pie (`Gait.stand`) los pies se
  quedan donde pisaron y dan pasos cortos hasta su sitio al detenerse o al girar sobre el
  sitio; al arrancar o frenar, un pie que ya no llega da un paso de ajuste en vez de deslizarse.
  La corrección de pies va siempre después de armar la postura (`applyStand`).
- **Brazos** — toda pose de brazo calculada por código pasa por `Player.reachArm`, que aplica
  `ARM_LIMITS` (el codo se dobla hacia fuera, abajo y atrás; la mano no va muy detrás de la
  espalda ni cruza el cuerpo salvo por delante). Usarlo en vez de girar huesos a mano.
- **Armas a dos manos** — `Player.holdTwoHanded` ancla las manos al arma como `gait.js` los
  pies al suelo: el arma va en la palma derecha, la izquierda en su agarre (`BAT_LEFT`,
  `GUN_LEFT`, en el marco del arma) y, si no llega, el arma se acerca hasta `GRIP_SHIFT`.
  `player.gripGap` es la separación que queda (m); debe dar unos milímetros. La pistola solo
  se sujeta con las dos manos al apuntar: a cubierto, acostado, a ciegas o disparando sin
  apuntar va en la derecha (acostado se arrastra con la mano izquierda y los pies).
  A cubierto la lleva con el codo recogido y la mano delante del hombro (`COVER_ARMS`); sin
  apuntar el cañón sigue al antebrazo y la muñeca no se dobla más de `WRIST_MAX`. El batazo va entero por código
  (`SWING_KEYS`, `swingPhase`, `placeBat`): impulso atrás, golpe y acompañamiento, sin clip;
  durante el giro los límites de los brazos se miden en el marco del pecho (`armFrame`).
- **Cobertura** — la entrada se desliza hasta el muro y en el último tramo (`COVER_ARRIVE`,
  `cover.arrive` 0-1) frena, se da la vuelta, se agacha y coloca los brazos a la vez. Tras un muro bajo queda en
  cuclillas con la espalda en el muro y los pies por delante (`COVER_SIT`, `coverSit`; se quita
  al levantarse o asomarse a disparar). Tras uno muy bajo se da la vuelta agachándose, se
  sienta y se recuesta hacia atrás (`PRONE_SIT`, en `postPhysics`); la postura final no cambia. `coverMove` mide cada fotograma la distancia a cada final del muro
  (`cover.edgeR`, `cover.edgeL`) y en qué límite está (`cover.limit`: -1 derecho, +1 izquierdo,
  0 ninguno; `LIMIT_RANGE`). El disparo a ciegas se decide con eso (`cover.blindMode`: `side`
  por el borde, girado hacia él; `over` por encima del muro bajo; `up` brazo en alto y tiro
  hacia arriba tras un muro alto; `prone` acostado). El modelo se arrima al muro (`COVER_HUG`)
  aunque la cápsula quede más lejos. Asomarse con el mando (`cover.stickPeek`): en un límite,
  mantener la dirección hacia ese lado continúa el paso lateral sin pausa (`PEEK_LOOK`, a la
  velocidad de caminar), inclina el tronco y gira cabeza y tronco hacia detrás del muro
  (`PEEK_HEAD`, `cover.look`; empieza a girar al acercarse); disparando da el paso entero, como al apuntar.
- **Disparos a las articulaciones de los zombis** — las balas no chocan con la cápsula del
  zombi (`GROUPS.enemy`): `Combat.update` comprueba el tramo que recorre cada bala contra el
  esqueleto con `Zombie.trace` (`src/horde.js`), que devuelve el corte de `CUTS` de la primera
  articulación que atraviesa (`JOINT_ZONE`; cabeza `HEAD_ZONE`; estómago `STOMACH_ZONE` = corte
  `legs`), `'body'` si solo roza un hueso (`BODY_SEGMENTS`) o null. `Combat.aimPoint` usa lo
  mismo, así que la mira marca la articulación. `shoot(corte)` desprende lo que cuelga de ella
  (`SkeletonView.detach`, `Horde.detach`, cuerpos sueltos en `GROUPS.debris`). El usuario pidió
  que el zombi **solo muera al perder la cabeza**: las balas no quitan vida (`hp` es solo para
  golpes). Sin un pie cojea (`limp`); sin una pierna o sin tronco se arrastra (`crawler`,
  `poseCrawl`, cuerpo físico en esfera) a `CRAWL_SPEEDS[limbs]` según los brazos enteros.
  El piloto y `gameplay.cjs` apuntan a la cabeza con `autopilot.aimZombie` (corrige `aimAt`,
  que se desvía ~13 cm, con el rayo real de la mira; `onHead`). Escena `desmembrar`.
- **Mordida y golpes bajos** — los zombis muerden por código, sin clip (el usuario no quiere que
  golpeen): `lunge` en `Zombie.update` (se echa atrás, lanza tronco y cabeza al llegar a
  `ATTACK_HIT`), `BITE_BEND` y brazos agarrando; a rastras, cuello e impulso en `poseCrawl`.
  El jugador, si al golpear hay un zombi a rastras delante (`LOW_RANGE`, `player.meleeLow`),
  golpea al suelo: sin arma, pisotón (`poseStomp`, `STOMP`, pierna con `Gait.place`); con el
  bate, batazo vertical (`SLAM_KEYS` en vez de `SWING_KEYS`). Daño en `MELEE.pisotón` y
  `MELEE.bateBajo`. Escenas `pisoton` y `bate-suelo`.
- **Muerte de los zombis** — no hay clip de muerte: `Zombie.startRagdoll` (`src/horde.js`) crea
  un cuerpo físico por segmento (`RAGDOLL`, cápsulas en `GROUPS.debris`, unidos por rótulas)
  sobre la pose del momento y `poseRagdoll` lleva los huesos a esos cuerpos. Cuando todos
  duermen (`settled`; entre `RAGDOLL_MIN` y `RAGDOLL_MAX`) se retira la física y el cadáver se
  funde en mallas fijas (`bakeStatic` en `src/skeleton.js`, `Horde.keep`, `horde.remains`). El
  usuario pidió **dejar los cuerpos, no eliminarlos**: solo se van al terminar la horda o al
  pasar de `REMAINS_MAX`. Los trozos desprendidos siguen el mismo camino y también son
  articulados (`Horde.detach` crea un cuerpo por segmento de `RAGDOLL` con sus rótulas: unas
  piernas sueltas se desploman, no quedan erguidas); solo cabeza, mano y pie caen rígidos. Los restos no tienen
  colisión: jugador y zombis pasan por encima.
- **Pruebas a medida** — `window.__game` expone escena, física, jugador, horda, cámara y
  `tick(dt)`. Parar el bucle con `renderer.setAnimationLoop(null)` y avanzar con `tick(1/60)`.

## Estado del análisis de juego

Último análisis: el juego es demasiado fácil. Quieto y solo disparando se llega a la oleada
10–16; el piloto completo, a la 26–27 en 7 minutos. La cobertura no tiene función porque los
zombis solo atacan cuerpo a cuerpo. Mejoras propuestas, por impacto: enemigos a distancia,
cargador y recarga, resistencia para la carrera rápida, variedad de zombis, puntuación.
Con las balas contra el esqueleto y la muerte solo por la cabeza, los bots (puntería perfecta a
la cabeza) llegan igual de lejos: `stand` a la oleada 15 en 2 min sin morir; falta medir a un jugador humano.
Desde entonces: se empieza sin armas y la munición es limitada (pistola, bate y cajas de balas
que se recogen); `gameplay.cjs` aún no mide cómo cambia eso la dificultad.
