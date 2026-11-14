# SumuladorZ

Videojuego 3D en tercera persona con modelos animados y físicas, hecho con
[Three.js](https://threejs.org/) (render) y [Rapier](https://rapier.rs/) (físicas).

Tiene dos modos:

- **Modo juego**: sobrevivir en una ciudad en cuarentena, con ciclo de día y noche. De día los
  zombis son mansos; de noche van a por ti. Es donde arranca el juego.
- **Simulación**: el mundo de pruebas de las mecánicas del personaje, con su horda por oleadas.

## Modo juego

**La ciudad** (`src/city.js`) es una cuadrícula de 5 × 5 manzanas (302 m de lado) cercada por un
muro de cuarentena con torres de vigilancia. Cada manzana es de un tipo: torres de cristal,
bloques de oficinas, pisos de ladrillo con balcones y escalera de incendios, hileras de tiendas
con toldos y rótulos, casas con jardín y garaje, una fábrica con silos y chimenea, almacenes con
muelles de carga, una obra con su grúa, un supermercado con aparcamiento, una gasolinera, un
hospital con helipuerto y carpas de triaje, una escuela con pista, una iglesia con cementerio,
un parque y la plaza central, donde se empieza junto a un puesto de control militar abandonado
(ahí están la pistola y el bate). En las calles hay farolas, semáforos, coches, autobuses y
barricadas. Todo choca y sirve de cobertura; coches, barreras y vallas se pasan como bardas.
Las cajas de balas están repartidas por las manzanas y reaparecen a los 2 minutos.

**Día y noche** (`src/daynight.js`): el día dura 5 minutos y la noche otros 5. El sol y la luna
cruzan el cielo, que enrojece al atardecer; de noche salen las estrellas, se encienden las
farolas, las ventanas y los rótulos, y el personaje lleva una linterna que se enciende sola.

**El reloj**, arriba a la derecha, es una esfera de 16 tramos: amarillos de día, rojo el del
atardecer y azules de noche. La aguja da una vuelta por ciclo, los tramos ya pasados se apagan,
el centro dice el día en que vas y debajo pone cuánto falta para que anochezca o amanezca.

**Los zombis** no vienen por oleadas: pueblan las calles alrededor de ti (aparecen donde no los
ves y se retiran al quedar lejos).

| | De día | De noche |
|---|---|---|
| Cuántos | 14 | 24 |
| Te notan | a 4,5 m de frente o 2,2 m por la espalda | a 40 m, mires adonde mires; además te huelen a 45 m aunque no te vean |
| Velocidad | 1,9 m/s (tú caminas a 2,2) | 3,9 m/s (corres a 6) |
| Te olvidan | a los 2,5 s | a los 20 s |
| Oyen un disparo | a 9 m | a 60 m |
| Mordida | 12 de vida cada 1,15 s | 15 cada 0,85 s; muerden 3 a la vez como mucho |

De día, si le haces daño a uno, ese te persigue como un zombi normal durante 8 s. De noche
brillan en rojo. Al amanecer se amansan y olvidan lo que perseguían. Si mueres, la partida
vuelve a empezar en el día 1.

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

La pantalla de inicio y la pausa son el mismo menú. **Jugar** empieza la partida en la ciudad y
**Simulación** lleva al mundo de pruebas. En pausa: **Continuar**, **Reiniciar la partida** (o
el mundo), **Ir a la simulación** / **Ir al modo juego** y, en la simulación, **Iniciar la
horda** (o detenerla). Cambiar de modo empieza de cero en el otro. Además hay cuatro apartados:

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
| Saltar (toque) · carrera rápida (mantener) | A |
| Cámara | Stick derecho |
| Disparar (con el bate o sin arma, golpear) | RT |
| Cambiar de arma | Cruceta ← → |
| Apuntar | LT |
| Saltar | RB |
| Golpe | X |
| Cubrirse | B |
| Carrera rápida | Y |
| Horda | LB |
| Piloto automático | Cruceta arriba |
| Pausa | Menú |
| Moverse por el menú | Cruceta o stick izquierdo (A elegir, B volver, ← → deslizador) |
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

## Bardas

En carrera rápida de frente contra un muro (o pulsando saltar junto a él), el personaje lo pasa solo,
según su altura:

- **Muy baja** (hasta 0,62 m): la salta sin tocarla y sigue corriendo.
- **Media** (hasta 1,4 m): apoya la mano izquierda arriba y pasa las piernas por un lado.
- **Alta** (hasta 2,7 m): salta, se cuelga del borde, se sube a pulso y se deja caer al otro lado.

Si arriba hay sitio (una plataforma), se queda de pie encima. Más de 2,7 m no se puede
escalar. Caminando no ocurre, y en diagonal tampoco: hay que ir de frente.

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

En la simulación, «Iniciar la horda» en el menú de pausa (o `H`) inicia y detiene la horda. La oleada 1 suelta un zombi; al matarlo
llegan dos, luego tres, y así sucesivamente. (En el modo juego los zombis son los mismos, con el carácter que marca la hora.)

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

`tools/city.cjs` fotografía la ciudad (vista aérea y ocho lugares, cada uno de día, al atardecer
y de noche), dice lo que pesa (triángulos, bloques de choque, llamadas de dibujo) y mide el
carácter de los zombis: a qué distancia te notan de día y cuánto tardan en morderte de noche.

```bash
node tools/city.cjs salida
```

Las tres necesitan Playwright con Chromium instalado en el entorno; no son dependencias del juego.

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
- **Casa** (al oeste del inicio): una planta de 8 × 6 m con tejado de tejas a dos aguas, chimenea,
  muros de estuco con zócalo de piedra, una puerta con tejadillo y farol, y seis ventanas con
  marco, contraventanas y cristal. Dentro hay tarima, rodapié, cortinas, lámpara, mesa con sillas,
  cama, sofá, estantería, cocina con nevera, una planta y un perchero (los muebles chocan y
  sirven de cobertura). Fuera: canalones, césped, arriates con flores, arbustos, buzón y un
  árbol cuyo tronco también cubre. La puerta se abre sola al acercarse (también a los zombis) y se cierra al
  alejarse. El cristal no deja pasar: se rompe de un puñetazo, un batazo o un balazo, y con
  él roto se entra en carrera rápida de frente (o saltando junto a la ventana), como por una barda
  media. Los zombis también entran por las ventanas: revientan el cristal de un cabezazo, se
  echan por el hueco, se deslizan de cabeza y se levantan dentro. Los cristales vuelven al
  reiniciar el mundo (`R`).

## Estructura

| Archivo | Contenido |
| --- | --- |
| `src/main.js` | Arranque, bucle principal y HUD |
| `src/physics.js` | Mundo de Rapier, creación de cuerpos y sincronización con las mallas |
| `src/world.js` | Construcción del escenario de pruebas |
| `src/city.js` | Ciudad del modo juego: trazado, calles, muro y luces de las farolas |
| `src/city-blocks.js`, `src/city-props.js` | Edificios de cada tipo de manzana; mobiliario urbano y vehículos |
| `src/city-build.js`, `src/city-textures.js` | Geometría agrupada por material; texturas pintadas en lienzo |
| `src/daynight.js` | Ciclo de día y noche, cielo y reloj |
| `src/gamemode.js` | Reglas del modo juego: población y carácter de los zombis según la hora, linterna |
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
