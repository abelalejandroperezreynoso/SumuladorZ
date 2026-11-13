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
- **Editor de posturas** — en el catálogo, las fichas con `poses` (por ahora «Cobertura muy
  baja») tienen botones «Editar postura». La escena se detiene en esa postura y aparecen
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
  modelo con piel».
- **Equilibrio del juego** — `node tools/gameplay.cjs <bot|stand|punch> [segundos]`
  Juega una partida larga y resume cada oleada. Comparar los tres estilos: si quedarse quieto
  disparando (`stand`) llega lejos, el juego es demasiado fácil. Juega con la pistola y munición
  infinita (`player.infiniteAmmo`), como el piloto automático, para comparar con análisis
  anteriores; en una partida real se empieza sin armas y las balas se recogen (`src/pickups.js`).
- **Piloto automático** — tecla `P` en el juego (`src/autopilot.js`). Su registro está en
  `window.__game.autopilot.log` y `.stats`. Busca cobertura de forma activa y va rotando
  entre alta, baja y muy baja (`stats.coverTypes`). La escena `piloto` de `tools/watch.cjs`
  graba 16 s de su partida.
- **Proporciones** — `src/proportions.js` lleva brazos y manos del modelo a medidas humanas
  (fracciones de la estatura, 1,75 m) escalando huesos y pistas de posición de los clips; se
  aplica al cargar, antes de clonar el modelo para los zombis. El modelo original trae brazos
  de 40 cm de hombro a muñeca; corregidos miden 56 cm. Piernas y tronco ya estaban bien.
- **Pruebas a medida** — `window.__game` expone escena, física, jugador, horda, cámara y
  `tick(dt)`. Parar el bucle con `renderer.setAnimationLoop(null)` y avanzar con `tick(1/60)`.

## Estado del análisis de juego

Último análisis: el juego es demasiado fácil. Quieto y solo disparando se llega a la oleada
10–16; el piloto completo, a la 26–27 en 7 minutos. La cobertura no tiene función porque los
zombis solo atacan cuerpo a cuerpo. Mejoras propuestas, por impacto: enemigos a distancia,
cargador y recarga, resistencia para la carrera rápida, variedad de zombis, puntuación.
Desde entonces: se empieza sin armas y la munición es limitada (pistola, bate y cajas de balas
que se recogen); `gameplay.cjs` aún no mide cómo cambia eso la dificultad.
