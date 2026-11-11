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
