// Registra el service worker (solo en la versión publicada) para instalar el juego como app
// y poder jugar sin conexión.
export function setupPWA() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('./sw.js');
      const reg = await navigator.serviceWorker.ready;
      // Guarda en caché lo que esta visita ya descargó (script, modelo, iconos).
      const urls = performance.getEntriesByType('resource')
        .map((e) => e.name)
        .filter((u) => u.startsWith(location.origin));
      reg.active?.postMessage({ type: 'precache', urls });
    } catch (err) {
      console.warn('Service worker no disponible:', err);
    }
  });
}

/**
 * Botón de versión: muestra la compilación en uso y, al pulsarlo, pregunta al servidor si hay
 * otra más nueva. Si la hay, vacía la caché y recarga; si no, lo dice.
 */
export function setupUpdateButton(button, toast) {
  const build = __BUILD__;
  button.textContent = `⟳ ${build.id}`;
  let busy = false;
  const check = async () => {
    if (busy) return;
    busy = true;
    toast('Buscando actualización…');
    try {
      const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(res.status);
      const latest = await res.json();
      if (latest.id === build.id && latest.date === build.date) {
        toast(`Ya tienes la última versión (${build.id})`);
      } else {
        toast(`Actualizando a ${latest.id}…`);
        // Pase lo que pase con la caché, se recarga (el service worker va primero a la red).
        setTimeout(() => location.reload(), 900);
        navigator.serviceWorker?.getRegistration().then((reg) => reg?.update()).catch(() => {});
        if (window.caches) caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
        return;
      }
    } catch {
      toast(import.meta.env.PROD ? 'Sin conexión: no se pudo comprobar' : `Versión local (${build.id})`);
    }
    busy = false;
  };
  button.addEventListener('touchstart', (e) => {
    e.preventDefault();
    e.stopPropagation();
    check();
  }, { passive: false });
  button.addEventListener('click', () => { check(); button.blur(); });
}
