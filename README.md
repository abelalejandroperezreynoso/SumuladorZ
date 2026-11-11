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
| Saltar | `Espacio` |
| Disparar | Clic izquierdo (mantener para ráfaga) |
| Golpear | Clic derecho o `F` |
| Cámara / zoom | Ratón / rueda |
| Reiniciar el mundo | `R` |

## Zonas del mundo de pruebas

- **Campo de tiro** (al frente): dianas a 10, 18 y 27 m y latas sobre una mesa.
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

- Modelo del personaje: *Ultimate Animated Character Pack* de Quaternius (CC0), recoloreado.
