import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';

// Versión de la compilación: commit corto + fecha. Se muestra en el botón de actualizar y se
// publica en version.json para que la app instalada compruebe si hay una más nueva.
let commit = 'local';
try { commit = execSync('git rev-parse --short HEAD').toString().trim(); } catch { /* sin git */ }
const BUILD = { id: commit, date: new Date().toISOString() };

// Rutas relativas para que funcione también bajo una subcarpeta (p. ej. GitHub Pages).
export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(BUILD) },
  plugins: [{
    name: 'version-json',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(BUILD) });
    },
  }],
});
