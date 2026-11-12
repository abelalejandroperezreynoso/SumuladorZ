// Registra el service worker (solo en la versión publicada) para instalar el juego como app
// y poder jugar sin conexión.
export function setupPWA() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const register = () => navigator.serviceWorker.register('./sw.js')
    .catch((err) => console.warn('Service worker no disponible:', err));
  if (document.readyState === 'complete') register(); else addEventListener('load', register);
}

/**
 * Guarda en caché lo que esta visita descargó (scripts, motor de físicas, modelo, iconos) y
 * deja que el service worker borre los archivos de versiones anteriores. Se llama cuando el
 * juego ya arrancó: antes la lista estaría incompleta y se borraría algo que aún hace falta.
 */
export async function cacheLoadedFiles() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const urls = performance.getEntriesByType('resource')
      .map((e) => e.name)
      .filter((u) => u.startsWith(location.origin) && !u.includes('version.json'));
    reg.active?.postMessage({ type: 'precache', urls });
  } catch (err) {
    console.warn('No se pudo guardar el juego para usarlo sin conexión:', err);
  }
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
