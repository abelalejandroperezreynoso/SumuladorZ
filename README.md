# SumuladorZ

Videojuego 3D en tercera persona con modelos animados y físicas, hecho con
[Three.js](https://threejs.org/) (render) y [Rapier](https://rapier.rs/) (físicas).

Esta primera versión es un **mundo de simulación** para probar las mecánicas del personaje.

## Cómo ejecutarlo

```bash
npm install
npm run dev      # abre http://localhost:5173
npm run build    # versión de producción en dist/
```

## Probarlo en el móvil (iPhone / Android)

El juego detecta la pantalla táctil y muestra un joystick y botones. Dos formas de abrirlo:

1. **Misma red wifi:** ejecuta `npm run dev` en el ordenador y abre en el móvil la dirección
   `Network` que muestra la terminal (por ejemplo `http://192.168.1.20:5173`).
2. **GitHub Pages:** en el repositorio, *Settings → Pages → Source: GitHub Actions*. Cada cambio en
   `main` publica el juego en `https://<usuario>.github.io/SumuladorZ/`.
3. **Netlify:** el proyecto está conectado al repositorio y `netlify.toml` fija la compilación
   (`npm run build`, carpeta `dist`) y la caché. Cada cambio en `main` se publica solo. Sirve
   cuando la red del móvil no llega a `github.io` (algunas líneas de datos no lo abren).

### Instalarlo como app (PWA)

Con el juego publicado por HTTPS (GitHub Pages o Netlify), ábrelo en **Safari** en el iPhone →
botón **Compartir** → **Añadir a pantalla de inicio**. Se abre a pantalla completa, sin barras del
navegador, y tras la primera carga funciona sin conexión. En Android: menú de Chrome →
*Instalar aplicación*.

**Con datos móviles**: la primera visita descarga unos 1,8 MB y muestra el porcentaje. Después
el juego queda guardado en el teléfono: abre al instante y sin gastar datos, y una versión nueva
solo descarga el código del juego (unos 30 KB), no las bibliotecas ni el modelo.

Controles táctiles: joystick a la izquierda (a fondo = correr), arrastrar en la parte derecha para
mover la cámara, y botones de disparo, apuntar (un toque entra, otro sale), golpe, cubrirse,
salto y carrera. Mejor en horizontal.

## Menú y pausa

La pantalla de inicio y la pausa son el mismo menú: **Jugar** (o **Continuar**), **Jugar contra
la horda** (en pausa, iniciarla o detenerla) y **Reiniciar el mundo**, más cuatro apartados:

- **Ajustes**: sensibilidad de la cámara, invertir el eje vertical y piloto automático. La
  sensibilidad y el eje se recuerdan en el navegador.

El personaje y los zombis se ven como esqueletos (el jugador gris, los zombis verdes). Del
modelo 3D solo se usan los huesos y las animaciones: sus mallas se quitan al cargar.
- **Controles**: teclado y ratón, mando y táctil.
- **Catálogo**: mecánicas y animaciones en vivo (ver más abajo).
- **Información**: de qué va el juego, la versión instalada y **Buscar actualización**, que
  recarga el juego si hay una versión más nueva.

En pausa el mundo queda congelado. Se pausa con el botón **❚❚** de arriba a la izquierda, con
`Esc` o con el botón **Menú** del mando. Durante la partida la pantalla solo muestra ese botón,
la vida, la oleada (si hay horda) y los controles táctiles.

## Mando (Xbox, PlayStation…)

Se conecta por Bluetooth y funciona también en iPad/iPhone. Pulsa cualquier botón para empezar
o continuar, y **Menú** para pausar. Mientras se usa el mando se ocultan los controles táctiles (vuelven al tocar la pantalla).

| Acción | Botón |
|---|---|
| Moverse / correr | Stick izquierdo (a fondo o pulsado = correr) |
| Cámara | Stick derecho |
| Disparar (con el bate o sin arma, golpear) | RT |
| Cambiar de arma | Cruceta ← → |
| Apuntar | LT |
| Saltar | A |
| Golpe | X |
| Cubrirse | B |
| Carrera rápida | Y |
| Horda | LB / RB |
| Piloto automático | Cruceta arriba |
| Pausa | Menú |
| Reiniciar | Vista |

## Controles (teclado y ratón)

| Acción | Tecla |
| --- | --- |
| Caminar | `W` `A` `S` `D` |
| Correr | `Shift` |
| Correr rápido | `Q` (un toque; dura mientras sigas avanzando; no permite disparar) |
| Saltar | `Espacio` (flexiona las piernas para tomar impulso y despega) |
| Disparar (con el bate o sin arma, golpear) | Clic izquierdo (mantener para ráfaga; sin apuntar, la cámara no cambia) |
| Elegir arma | `1` sin arma · `2` bate · `3` pistola |
| Apuntar | Clic derecho mantenido (la cámara se cierra sobre el hombro y aparece la mira) |
| Golpear | `F` |
| Cubrirse / salir de la cobertura | `C` (cerca de un muro u objeto) |
| Cámara / zoom | Ratón / rueda |
| Pausa y menú | `Esc` |
| Reiniciar el mundo | `R` |
| Iniciar / detener la horda | `H` |
| Piloto automático | `P` |
| Catálogo de mecánicas y animaciones | `G` |

## Armas y balas

Se empieza sin armas. Para recoger algo basta pasar por encima: los objetos flotan y giran sobre
un aro de color delante del punto de inicio y por el escenario.

- **Pistola** (aro amarillo): trae 12 balas. Cada disparo gasta una; sin balas no dispara y el
  indicador de arriba a la derecha avisa en rojo.
- **Bate de béisbol** (aro naranja): quieto o caminando se lleva en guardia con las dos manos, ancladas al mango; el batazo (clic izquierdo o `F`) toma impulso llevando el bate atrás, gira el tronco con el golpe y alcanza más lejos que el
  puño, mata a un zombi de un golpe y empuja con fuerza los objetos.
- **Cajas de balas** (aro verde): 10 balas cada una, hasta un máximo de 99. Las del escenario
  reaparecen a los 25 s; además, los zombis sueltan a veces una caja de 5 balas que desaparece a
  los 30 s si no se recoge.

El indicador de arriba a la derecha muestra el arma en la mano y las balas; tocarlo (o `1` `2` `3`,
o la cruceta del mando) cambia de arma. Si mueres, pierdes las armas y vuelven a su sitio.
El piloto automático juega con la pistola y munición infinita.

## Horda de zombis

«Jugar contra la horda» en el menú (o `H`) inicia y detiene la horda. La oleada 1 suelta un zombi; al matarlo
llegan dos, luego tres, y así sucesivamente.

- **Visión**: cada zombi deambula hasta detectarte. Ve en un cono de 120° hasta 22 m y los
  muros le tapan la vista, así que una cobertura te oculta. A menos de 2,5 m te nota aunque
  esté de espaldas, y los disparos atraen a los que estén a menos de 28 m.
- **Persecución**: al verte te sigue con los brazos extendidos. Si te pierde, va al último
  lugar donde te vio y, si no te encuentra, vuelve a deambular.
- **Ataque**: a corta distancia te agarra con los brazos y te muerde, lanzando la cabeza (15 de vida). La vida se recupera sola tras 5 s sin
  daño; si llega a cero, la horda termina y reapareces.
- **Matarlos**: solo mueren al perder la cabeza (o a golpes: 2 puñetazos o un batazo). Hasta
  entonces siguen intentando atacar como puedan.
- **Disparos a las articulaciones**: la bala se comprueba contra el esqueleto del zombi, hueso
  por hueso, y la mira marca justo lo que tiene delante. Si atraviesa una articulación (cuello,
  hombro, codo, muñeca, cadera, rodilla o tobillo), el cuerpo se parte por ahí y lo que cuelga
  de ella cae al suelo y ahí se queda. Por el estómago, el tronco se separa de las
  piernas. Una bala que solo roza un hueso lo aturde un instante; la que pasa entre los huesos,
  sigue de largo.
- **Lo que le queda**: sin un pie cojea; sin una pierna o sin tronco cae y se arrastra con los
  brazos (0,9 m/s con dos, 0,6 con uno); sin brazos repta (0,3 m/s). En todos los casos sigue
  mordiendo al llegar. Los puñetazos y el bate no desmiembran.
- **Al morir**: el zombi se desploma como un cuerpo articulado (cadera, pecho, cabeza, brazos y
  piernas con física propia, unidos por rótulas) que choca con el suelo y los muros, desde la
  postura y el impulso que llevaba. Los cadáveres y los trozos se quedan en el escenario hasta
  que termina la horda (se conservan los 240 más recientes).
- **Rematar en el suelo**: si golpeas con un zombi arrastrándose delante (a menos de 1,6 m), el
  golpe va al suelo: sin arma lo aplastas de un pisotón; con el bate, lo descargas de arriba abajo. Son golpes con todo el cuerpo: sacuden la cámara y el zombi rebota.
  Los dos lo matan de un golpe.

El zombi usa el mismo esqueleto del personaje, en verde.

## Piloto automático

El interruptor «Piloto automático» de los ajustes (o `P`) hace que el juego se juegue solo: inicia la horda, busca cobertura,
dispara, huye corriendo cuando se le acercan y golpea si lo acorralan. Usa los mismos controles
que un jugador, así que sirve para ver todas las mecánicas en marcha y para cazar fallos.
Lleva un registro de la partida en `window.__game.autopilot.log` y `.stats`.

## Catálogo de mecánicas y animaciones

«Catálogo» en el menú (o `G`, o añadir `#catalogo` a la dirección) abre un catálogo dentro del propio juego. No guarda imágenes: cada ficha ejecuta su
escena con el motor real y una cámara lateral, así que muestra siempre el juego tal como está.

- **Mecánicas**: locomoción, giro, saltos, golpe, disparo, las tres coberturas, el zombi y el
  piloto. Cada ficha explica la mecánica con las cifras reales del código, lista sus momentos
  clave (al pulsarlos se salta a ese instante) y enseña en vivo el estado, los clips que se
  mezclan con su peso y ritmo, y las poses calculadas por código (flexión, apuntado, retroceso…).
- **Clips**: los 24 clips del modelo, usados o no, reproducidos sobre el personaje, con quién
  los usa y para qué.
- **Editar postura**: en «Cobertura muy baja», los botones «Editar postura» detienen la escena
  en esa postura (recostado o de rodillas). Con la rueda o pellizcando se acerca la vista. Al
  tocar una parte del cuerpo queda seleccionada y arrastrar la gira libremente; un deslizador
  la gira sobre su propio eje y un botón quita su giro. «Ajustes generales» tiene además un
  deslizador por articulación. «Copiar valores» da un texto corto con los números para
  fijarlos en el código (`POSES` en `src/player.js`). Los cambios duran hasta recargar la página.
- **Mandos**: pausa, avance cuadro a cuadro, velocidad (1×, ½×, ¼×).
  Arrastrar sobre la escena gira la cámara y la rueda acerca. Teclado: `←` `→` cambian de
  ficha, `Espacio` pausa, `Esc` cierra.

Las escenas están en `src/catalog-scenes.js` y las comparte `tools/watch.cjs`: una escena nueva
aparece en el catálogo y en las tiras de fotogramas. La lista de clips y sus usos sale de
`PLAYER_CLIPS` y `ZOMBIE_CLIPS`, y las cifras de los textos, de `TUNING`.

## Observador de animaciones (herramienta de desarrollo)

`tools/watch.cjs` reproduce cada mecánica en un navegador sin interfaz y, por escena, guarda
tiras de fotogramas a 30 imágenes por segundo (para revisar la animación cuadro a cuadro) y un informe con medidas
del movimiento: pies que resbalan, saltos bruscos de pose, tirones del personaje y de la
cámara, y velocidad de giro.

```bash
npx vite --port 5199 &
node tools/watch.cjs salida            # todas las escenas
node tools/watch.cjs salida zombi giro # solo algunas
```

`tools/gameplay.cjs` hace jugar una partida larga con un estilo (`bot`, `stand` o `punch`) y
resume cada oleada: duración, daño recibido, disparos y bajas. Sirve para medir el equilibrio.

```bash
node tools/gameplay.cjs stand 300
```

Ambas necesitan Playwright con Chromium instalado en el entorno; no son dependencias del juego.

## Zonas del mundo de pruebas

- **Coberturas** (delante del inicio): bloques con las tres alturas estándar, muy bajo
  (0,45 m), medio (1,1 m) y alto (2,4 m), una por cada tipo de cobertura. Con `C` el personaje se desliza
  hasta la cobertura más cercana y apoya la espalda en ella, con la pistola en la mano derecha delante
  del pecho (sin ella, agachado apoya las manos en las rodillas); `A`/`D` lo mueven a lo largo. Sirve
  cualquier bloque o muro.
  Disparando sin apuntar no sale de la cobertura: saca los brazos y dispara a ciegas, con más desvío.
  El personaje sabe si está en el límite izquierdo o derecho del muro (a menos de 0,55 m de su
  final): en un límite se gira hacia ese borde y saca el arma por él; lejos de los límites
  dispara por encima de la cobertura baja y, tras una alta, levanta el brazo y dispara hacia arriba.
  Asomarse con el mando: manteniendo `A`/`D` (o el stick) hacia un límite del muro, al llegar al
  final no se detiene: sigue el paso, se inclina y gira la cabeza y el tronco para ver qué hay
  tras el muro; disparando así sale del todo y tira desde ahí, sin cerrar la cámara. Al soltar vuelve a cubrirse. Apuntando se asoma: por encima de una cobertura baja, o inclinándose
  por el borde si hay uno cerca (siempre en las altas; en las bajas, cuando apuntas hacia ese lado).
  Tras una cobertura muy baja (menos de unos 60 cm) se acuesta boca arriba, perpendicular al
  bloque, con la cabeza recostada en él, una rodilla levantada y el arma sobre el pecho; la
  cámara baja casi a ras del bloque. Se desplaza de lado apoyándose en manos y pies, y se
  incorpora de rodillas para apuntar.
- **Pies que no resbalan**: al caminar y correr la zancada se ajusta a lo que avanza el
  personaje y el pie de apoyo queda clavado en el suelo (también en los zombis).
- **De pie, en reposo**: quieto, el personaje se relaja (pies bajo la cadera, brazos colgando,
  tronco y cabeza erguidos y una respiración suave) en vez de la guardia del clip del modelo.
- **Apuntar y disparar** son mandos separados. Con el clic derecho levanta el arma y la cámara
  pasa a un plano cerrado sobre el hombro (el arma, sujeta con las dos manos), con menos campo de visión, la mira en pantalla y
  más lenta; las balas van exactas. Disparar sin apuntar no mueve la cámara ni muestra la
  mira: levanta el brazo hacia el centro de la pantalla y las balas se desvían un poco.
  A cubierto, al soltar el apuntado vuelve a esconderse en 0,3 s.
  Las poses de brazos calculadas por código respetan límites de las articulaciones: el codo no
  se dobla al revés y la mano no va muy por detrás de la espalda ni cruza el cuerpo por detrás.
  Tirar hacia atrás, saltar, golpear o `C` de nuevo lo sacan de la cobertura.
- **Escalera y rampa** (detrás): suben a una plataforma de 2 m.

## Estructura

| Archivo | Contenido |
| --- | --- |
| `src/main.js` | Arranque, bucle principal y HUD |
| `src/physics.js` | Mundo de Rapier, creación de cuerpos y sincronización con las mallas |
| `src/world.js` | Construcción del escenario de pruebas |
| `src/player.js` | Personaje: movimiento, animaciones, golpe y pose de apuntado |
| `src/gait.js` | Zancada a medida y pie de apoyo clavado al caminar y correr (jugador y zombis) |
| `src/camera.js` | Cámara en tercera persona con colisión |
| `src/combat.js` | Proyectiles físicos, impactos y contadores |
| `src/pickups.js` | Armas y cajas de balas que se recogen, y sus modelos |
| `src/skeleton.js` | Esqueleto dibujado del personaje y de los zombis |
| `src/proportions.js` | Medidas del cuerpo: corrige el largo de brazos y manos del modelo |
| `src/input.js` | Teclado, ratón y mando |
| `src/touch.js` | Controles táctiles |
| `src/catalog.js`, `src/catalog-scenes.js` | Catálogo de mecánicas dentro del juego y sus escenas |
| `src/menu.js` | Menú de inicio y pausa, ajustes, controles e información |
| `src/pwa.js`, `public/sw.js`, `public/manifest.webmanifest` | Instalación como app y modo sin conexión |
| `src/download.js` | Descargas con porcentaje para la pantalla de carga |
| `vite.config.js` | Compilación: bibliotecas en archivos aparte y el wasm de Rapier fuera del script |

## Créditos

- Modelo del personaje: *Ultimate Modular Men Pack* de Quaternius (CC0).
