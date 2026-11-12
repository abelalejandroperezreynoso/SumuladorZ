// Descargas grandes con progreso, para que la pantalla de carga muestre un porcentaje real
// (con datos móviles la primera visita puede tardar medio minuto).
const parts = new Map(); // url -> { loaded, total }
let listener = null;

function report() {
  if (!listener) return;
  let loaded = 0;
  let total = 0;
  for (const p of parts.values()) { loaded += Math.min(p.loaded, p.total); total += p.total; }
  if (total > 0) listener(loaded / total);
}

/** `fn(fracción 0..1)` se llama cada vez que llegan datos de cualquier descarga en curso. */
export function onDownloadProgress(fn) {
  listener = fn;
}

/**
 * Descarga `url` y devuelve su contenido. `bytes` es el tamaño real del archivo (el servidor
 * lo envía comprimido, así que su Content-Length no sirve para calcular el porcentaje).
 */
export async function download(url, bytes) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`no se pudo descargar ${url} (${res.status})`);
  const part = { loaded: 0, total: bytes || +res.headers.get('content-length') || 0 };
  parts.set(url, part);
  let data;
  if (res.body?.getReader) {
    const reader = res.body.getReader();
    const chunks = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      part.loaded += value.length;
      report();
    }
    data = new Uint8Array(part.loaded);
    let at = 0;
    for (const c of chunks) { data.set(c, at); at += c.length; }
    data = data.buffer;
  } else {
    data = await res.arrayBuffer();
  }
  part.loaded = part.total = Math.max(part.total, data.byteLength);
  report();
  return data;
}
