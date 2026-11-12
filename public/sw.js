// Service worker: permite instalar el juego, jugar sin conexión y gastar pocos datos.
// - `assets/` (scripts, motor de físicas, modelo): su nombre lleva un hash del contenido, así
//   que nunca cambian. Se sirven de la caché sin tocar la red: tras la primera visita el juego
//   abre al instante aunque la conexión sea lenta.
// - La página y lo demás: red primero, para recibir siempre la última versión; si la red falla
//   o la página tarda más de NAV_TIMEOUT, se usa la copia guardada.
const CACHE = 'sumuladorz-v1';
const NAV_TIMEOUT = 4000; // ms

const isAsset = (url) => new URL(url).pathname.includes('/assets/');

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add('./')).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// La página envía la lista de archivos que ya cargó: se guardan en la primera visita y se
// borran los `assets/` de versiones anteriores, que ya no se usan.
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'precache') return;
  const urls = event.data.urls;
  event.waitUntil(caches.open(CACHE).then(async (c) => {
    await Promise.all(urls.map(async (u) => {
      if (isAsset(u) && await c.match(u, { ignoreVary: true })) return; // ya guardado: no gastar datos otra vez
      await c.add(u).catch(() => {});
    }));
    const current = new Set(urls);
    if (![...current].some(isAsset)) return;
    for (const req of await c.keys()) {
      if (isAsset(req.url) && !current.has(req.url)) await c.delete(req);
    }
  }));
});

async function store(request, response) {
  if (response.ok) (await caches.open(CACHE)).put(request, response.clone());
  return response;
}

async function fromCache(request) {
  const cached = await caches.match(request, { ignoreSearch: true, ignoreVary: true });
  if (cached) return cached;
  if (request.mode === 'navigate') return (await caches.match('./')) || Response.error();
  return Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  if (request.url.includes('version.json')) return; // siempre de la red, sin caché

  if (isAsset(request.url)) {
    event.respondWith(
      // ignoreVary: el contenido es fijo, da igual con qué cabeceras se guardó.
      caches.match(request, { ignoreVary: true })
        .then((cached) => cached || fetch(request).then((r) => store(request, r))),
    );
    return;
  }

  const network = fetch(request).then((r) => store(request, r));
  if (request.mode !== 'navigate') {
    event.respondWith(network.catch(() => fromCache(request)));
    return;
  }
  // Página: si la red no contesta a tiempo se abre la copia guardada. La descarga sigue en
  // segundo plano y deja la página nueva lista para la próxima vez.
  event.waitUntil(network.catch(() => {}));
  event.respondWith(new Promise((done) => {
    const timer = setTimeout(async () => {
      const cached = await caches.match('./');
      if (cached) done(cached);
    }, NAV_TIMEOUT);
    network.then(
      (response) => { clearTimeout(timer); done(response); },
      () => { clearTimeout(timer); done(fromCache(request)); },
    );
  }));
});
