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

## Controles

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

## Créditos

- Modelo del personaje: *RobotExpressive* de Tomás Laulhé (CC0), con modificaciones de Don McCurdy,
  distribuido con los ejemplos de Three.js.
