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

Controles táctiles: joystick a la izquierda (a fondo = correr), arrastrar en la parte derecha para
mover la cámara, y botones de disparo, golpe, salto y reinicio. Mejor en horizontal.

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

## Observador de animaciones (herramienta de desarrollo)

`tools/watch.cjs` reproduce cada mecánica en un navegador sin interfaz y, por escena, guarda
una tira de fotogramas (para revisar la animación cuadro a cuadro) y un informe con medidas
del movimiento: pies que resbalan, saltos bruscos de pose, tirones del personaje y de la
cámara, y velocidad de giro.

```bash
npx vite --port 5199 &
node tools/watch.cjs salida            # todas las escenas
node tools/watch.cjs salida zombi giro # solo algunas
```

Necesita Playwright con Chromium instalado en el entorno; no es una dependencia del juego.

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
| `src/input.js` | Teclado y ratón |
| `src/touch.js` | Controles táctiles |
| `src/pwa.js`, `public/sw.js`, `public/manifest.webmanifest` | Instalación como app y modo sin conexión |

## Créditos

- Modelo del personaje: *Ultimate Modular Men Pack* de Quaternius (CC0).
