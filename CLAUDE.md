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

- **Catálogo en el juego** — tecla `G`, botón «Catálogo» o `#catalogo` en la dirección
  (`src/catalog.js`). Ejecuta cada escena en vivo y muestra clips activos, pesos y capas por
  código. Las escenas se definen una sola vez en `src/catalog-scenes.js` (las usa también
  `tools/watch.cjs`): al añadir o cambiar una mecánica, añadir o ajustar ahí su escena y tomar
  las cifras del texto de `TUNING` para que el catálogo no quede desfasado.
- **Editor de posturas** — en el catálogo, las fichas con `poses` (por ahora «Cobertura muy
  baja») tienen botones «Editar postura». La escena se detiene en esa postura y aparecen
  deslizadores que cambian `POSES` (`src/player.js`) en vivo. «Copiar valores» da un texto como
  `postura recostado: giro=1.85 altura=0.2 …` (radianes y metros). Cuando el usuario pegue uno
  en el chat, pasar esos números a `POSES` y verificar la pose con `tools/watch.cjs`. Para
  hacer editable otra postura: añadir sus valores a `POSES`, sus deslizadores a `POSE_SPEC` y
  `poses: [[clave, título, segundo]]` a su escena.
- **Animaciones y sensación** — `node tools/watch.cjs <carpeta> [escena...]`
  Guarda tiras de fotogramas a 30 imágenes por segundo de cada mecánica y mide pies que
  resbalan, saltos bruscos de pose, tirones del personaje y de la cámara y velocidad de giro.
  Mirar las láminas y comparar las medidas antes y después de un cambio.
  Con `SKELETON=1` las tiras muestran solo el esqueleto: es la forma más clara de juzgar
  una pose (piernas enredadas, articulaciones forzadas). En el juego, tecla `K`.
- **Equilibrio del juego** — `node tools/gameplay.cjs <bot|stand|punch> [segundos]`
  Juega una partida larga y resume cada oleada. Comparar los tres estilos: si quedarse quieto
  disparando (`stand`) llega lejos, el juego es demasiado fácil.
- **Piloto automático** — tecla `P` en el juego (`src/autopilot.js`). Su registro está en
  `window.__game.autopilot.log` y `.stats`. Busca cobertura de forma activa y va rotando
  entre alta, baja y muy baja (`stats.coverTypes`). La escena `piloto` de `tools/watch.cjs`
  graba 16 s de su partida.
- **Pruebas a medida** — `window.__game` expone escena, física, jugador, horda, cámara y
  `tick(dt)`. Parar el bucle con `renderer.setAnimationLoop(null)` y avanzar con `tick(1/60)`.

## Estado del análisis de juego

Último análisis: el juego es demasiado fácil. Quieto y solo disparando se llega a la oleada
10–16; el piloto completo, a la 26–27 en 7 minutos. La cobertura no tiene función porque los
zombis solo atacan cuerpo a cuerpo. Mejoras propuestas, por impacto: enemigos a distancia,
cargador y recarga, resistencia para la carrera rápida, variedad de zombis, puntuación.
