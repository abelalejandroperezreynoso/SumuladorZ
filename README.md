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

### Instalarlo como app (PWA)

Con el juego publicado por HTTPS (GitHub Pages), ábrelo en **Safari** en el iPhone →
botón **Compartir** → **Añadir a pantalla de inicio**. Se abre a pantalla completa, sin barras del
navegador, y tras la primera carga funciona sin conexión. En Android: menú de Chrome →
*Instalar aplicación*.

**Con datos móviles**: la primera visita descarga unos 1,8 MB y muestra el porcentaje. Después
el juego queda guardado en el teléfono: abre al instante y sin gastar datos, y una versión nueva
solo descarga el código del juego (unos 30 KB), no las bibliotecas ni el modelo.

Controles táctiles: joystick a la izquierda (a fondo = correr), arrastrar en la parte derecha para
mover la cámara, y botones de disparo, golpe, salto y reinicio. Mejor en horizontal.

El botón **⟳** de arriba a la derecha muestra la versión instalada; al pulsarlo comprueba si hay
una más nueva y, si la hay, recarga el juego con ella.

## Mando (Xbox, PlayStation…)

Se conecta por Bluetooth y funciona también en iPad/iPhone. Pulsa **Menú** (o cualquier botón)
para empezar. Mientras se usa el mando se ocultan los controles táctiles (vuelven al tocar la pantalla).

| Acción | Botón |
|---|---|
| Moverse / correr | Stick izquierdo (a fondo o pulsado = correr) |
| Cámara | Stick derecho |
| Disparar | RT |
| Saltar | A |
| Golpe | X |
| Cubrirse | B |
| Carrera rápida | Y |
| Horda | LB / RB |
| Piloto automático | Cruceta arriba |
| Reiniciar | Vista |

## Controles (teclado y ratón)

| Acción | Tecla |
| --- | --- |
| Caminar | `W` `A` `S` `D` |
| Correr | `Shift` |
| Correr rápido | `Q` (un toque; dura mientras sigas avanzando; no permite disparar) |
| Saltar | `Espacio` (flexiona las piernas para tomar impulso y despega) |
| Disparar | Clic izquierdo (mantener para ráfaga) |
| Golpear | Clic derecho o `F` |
| Cubrirse / salir de la cobertura | `C` (cerca de un muro u objeto) |
| Cámara / zoom | Ratón / rueda |
| Reiniciar el mundo | `R` |
| Iniciar / detener la horda | `H` o el botón superior |
| Piloto automático | `P` o el botón «Piloto» |
| Ver solo el esqueleto del personaje | `K` o el botón «Esqueleto» |
| Catálogo de mecánicas y animaciones | `G` o el botón «Catálogo» |

## Horda de zombis

El botón superior (o `H`) inicia y detiene la horda. La oleada 1 suelta un zombi; al matarlo
llegan dos, luego tres, y así sucesivamente.

- **Visión**: cada zombi deambula hasta detectarte. Ve en un cono de 120° hasta 22 m y los
  muros le tapan la vista, así que una cobertura te oculta. A menos de 2,5 m te nota aunque
  esté de espaldas, y los disparos atraen a los que estén a menos de 28 m.
- **Persecución**: al verte te sigue con los brazos extendidos. Si te pierde, va al último
  lugar donde te vio y, si no te encuentra, vuelve a deambular.
- **Ataque**: a corta distancia te muerde (15 de vida). La vida se recupera sola tras 5 s sin
  daño; si llega a cero, la horda termina y reapareces.
- **Matarlos**: aguantan 3 balas o 2 puñetazos.

El zombi usa el mismo modelo del personaje recoloreado (piel verdosa y ropa oscura).

## Piloto automático

El botón «Piloto» (o `P`) hace que el juego se juegue solo: inicia la horda, busca cobertura,
dispara, huye corriendo cuando se le acercan y golpea si lo acorralan. Usa los mismos controles
que un jugador, así que sirve para ver todas las mecánicas en marcha y para cazar fallos.
Lleva un registro de la partida en `window.__game.autopilot.log` y `.stats`.

## Catálogo de mecánicas y animaciones

El botón «Catálogo» (o `G`, o el botón de la pantalla de inicio, o añadir `#catalogo` a la
dirección) abre un catálogo dentro del propio juego. No guarda imágenes: cada ficha ejecuta su
escena con el motor real y una cámara lateral, así que muestra siempre el juego tal como está.

- **Mecánicas**: locomoción, giro, saltos, golpe, disparo, las tres coberturas, el zombi y el
  piloto. Cada ficha explica la mecánica con las cifras reales del código, lista sus momentos
  clave (al pulsarlos se salta a ese instante) y enseña en vivo el estado, los clips que se
  mezclan con su peso y ritmo, y las poses calculadas por código (flexión, apuntado, retroceso…).
- **Clips**: los 24 clips del modelo, usados o no, reproducidos sobre el personaje, con quién
  los usa y para qué.
- **Mandos**: pausa, avance cuadro a cuadro, velocidad (1×, ½×, ¼×) y vista de esqueleto.
  Arrastrar sobre la escena gira la cámara y la rueda acerca. Teclado: `←` `→` cambian de
  ficha, `Espacio` pausa, `K` esqueleto, `Esc` cierra.

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
SKELETON=1 node tools/watch.cjs salida # tiras con solo el esqueleto
```

`tools/gameplay.cjs` hace jugar una partida larga con un estilo (`bot`, `stand` o `punch`) y
resume cada oleada: duración, daño recibido, disparos y bajas. Sirve para medir el equilibrio.

```bash
node tools/gameplay.cjs stand 300
```

Ambas necesitan Playwright con Chromium instalado en el entorno; no son dependencias del juego.

## Zonas del mundo de pruebas

- **Campo de tiro** (al frente): dianas a 10, 18 y 27 m y latas sobre una mesa.
- **Coberturas** (antes de las dianas): muros bajos y altos. Con `C` el personaje se desliza
  hasta la cobertura más cercana y se pega de espaldas; `A`/`D` lo mueven a lo largo. Sirve
  casi cualquier objeto: muros, postes, bloques, el parapeto y también cajas y barriles.
  Al disparar se asoma: por encima de una cobertura baja, o inclinándose por el borde si hay
  uno cerca (siempre en las altas; en las bajas, cuando apuntas hacia ese lado).
  Tras una cobertura muy baja (menos de unos 60 cm) se tumba boca abajo, se arrastra a lo
  largo de ella y se incorpora de rodillas para disparar.
  Tirar hacia atrás, saltar, golpear o `C` de nuevo lo sacan de la cobertura.
- **Cajas, muro de bloques y barriles** (izquierda): para empujar, golpear y derribar.
- **Sacos de boxeo** (derecha): tres sacos de distinto peso colgados con articulaciones.
- **Circuito de movimiento** (detrás): escaleras, plataforma, rampa, rampa no escalable,
  bloques de salto y pelotas.

## Estructura

| Archivo | Contenido |
| --- | --- |
| `src/main.js` | Arranque, bucle principal y HUD |
| `src/physics.js` | Mundo de Rapier, creación de cuerpos y sincronización con las mallas |
| `src/world.js` | Construcción del escenario de pruebas |
| `src/player.js` | Personaje: movimiento, animaciones, golpe y pose de apuntado |
| `src/camera.js` | Cámara en tercera persona con colisión |
| `src/combat.js` | Proyectiles físicos, impactos y contadores |
| `src/input.js` | Teclado, ratón y mando |
| `src/touch.js` | Controles táctiles |
| `src/catalog.js`, `src/catalog-scenes.js` | Catálogo de mecánicas dentro del juego y sus escenas |
| `src/pwa.js`, `public/sw.js`, `public/manifest.webmanifest` | Instalación como app y modo sin conexión |
| `src/download.js` | Descargas con porcentaje para la pantalla de carga |
| `vite.config.js` | Compilación: bibliotecas en archivos aparte y el wasm de Rapier fuera del script |

## Créditos

- Modelo del personaje: *Ultimate Modular Men Pack* de Quaternius (CC0).
