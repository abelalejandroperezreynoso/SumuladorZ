import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));

// Versión de la compilación: commit corto + fecha. Se muestra en el botón de actualizar y se
// publica en version.json para que la app instalada compruebe si hay una más nueva.
let commit = 'local';
try { commit = execSync('git rev-parse --short HEAD').toString().trim(); } catch { /* sin git */ }
const BUILD = { id: commit, date: new Date().toISOString() };

/**
 * Rapier (paquete «compat») trae su WebAssembly incrustado en base64 dentro del script: 4 MB
 * que comprimidos siguen siendo 1,6 MB. Al publicar se saca a un archivo .wasm aparte, que
 * comprimido pesa 1,2 MB y se descarga con progreso (`src/physics.js`). En desarrollo no se
 * toca nada: `virtual:rapier-wasm` devuelve `url = null` y Rapier usa el wasm incrustado.
 */
function rapierWasm() {
  const VIRTUAL = 'virtual:rapier-wasm';
  // `algo.toByteArray("<base64>").buffer` dentro de la función de arranque de Rapier.
  const EMBEDDED = /[\w$]+\.toByteArray\("([A-Za-z0-9+/=]{100000,})"\)\.buffer/;
  let build = false;
  let wasmFile = null;
  let wasmBytes = 0;
  return {
    name: 'rapier-wasm',
    configResolved(config) { build = config.command === 'build'; },
    buildStart() {
      if (!build) return;
      const entry = createRequire(import.meta.url).resolve('@dimforge/rapier3d-compat');
      const source = readFileSync(resolve(dirname(entry), 'rapier.mjs'), 'utf8');
      const found = source.match(EMBEDDED);
      if (!found) {
        this.warn('No se encontró el wasm incrustado de Rapier: se publica dentro del script.');
        return;
      }
      const wasm = Buffer.from(found[1], 'base64');
      const dir = resolve(ROOT, 'node_modules/.cache/sumuladorz');
      mkdirSync(dir, { recursive: true });
      wasmFile = resolve(dir, 'rapier.wasm');
      writeFileSync(wasmFile, wasm);
      wasmBytes = wasm.length;
    },
    resolveId(id) { if (id === VIRTUAL) return '\0' + VIRTUAL; },
    load(id) {
      if (id !== '\0' + VIRTUAL) return;
      if (!wasmFile) return 'export const url = null; export const bytes = 0;';
      return `import url from ${JSON.stringify(wasmFile + '?url')};\nexport { url };\nexport const bytes = ${wasmBytes};`;
    },
    transform(code, id) {
      if (!wasmFile || !id.includes('rapier3d-compat') || !EMBEDDED.test(code)) return;
      return { code: code.replace(EMBEDDED, 'globalThis.__rapierWasm'), map: null };
    },
  };
}

// Rutas relativas para que funcione también bajo una subcarpeta (p. ej. GitHub Pages).
export default defineConfig({
  base: './',
  define: {
    __BUILD__: JSON.stringify(BUILD),
    // Tamaño real del modelo, para el porcentaje de la pantalla de carga.
    __MODEL_BYTES__: statSync(resolve(ROOT, 'src/assets/Character.glb')).size,
  },
  build: {
    // Las bibliotecas van en archivos aparte: su nombre solo cambia al actualizarlas, así que
    // una versión nueva del juego no obliga a descargarlas otra vez (importa con datos móviles).
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'rapier', test: /node_modules[\\/]@dimforge/ },
            { name: 'three', test: /node_modules[\\/]three/ },
          ],
        },
      },
    },
  },
  plugins: [
    rapierWasm(),
    {
      name: 'version-json',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(BUILD) });
      },
    },
  ],
});
