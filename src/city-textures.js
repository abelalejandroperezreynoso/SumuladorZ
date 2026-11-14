import * as THREE from 'three';

// Texturas de la ciudad, pintadas en lienzo al cargar (no se descarga ninguna imagen). Las
// fachadas son rejillas de 4 × 4 celdas: cada celda es un vano (una ventana) de una planta, y
// llevan una segunda textura con las ventanas encendidas, que solo se ve de noche.

const CELLS = 4; // celdas por lado en las texturas de fachada
export const FACADE_CELLS = CELLS;

/** Azar repetible: la ciudad sale igual en cada carga. */
export function rng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function texture(c, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Grano: `count` puntos de `size` píxeles con tonos entre `lo` y `hi` y la opacidad dada. */
function grain(g, n, r, count, lo, hi, alpha, size = 1) {
  for (let i = 0; i < count; i++) {
    const v = Math.round(lo + r() * (hi - lo));
    g.fillStyle = `rgba(${v},${v},${v},${alpha * (0.4 + r() * 0.6)})`;
    const s = size * (0.5 + r());
    g.fillRect(r() * n, r() * n, s, s);
  }
}

/** Pinta una rejilla de fachada: `cell(g, x, y, s, r, col, row)` dibuja cada celda en el color y `lit(...)` en la de luces. */
function facade(seed, cell, lit, litChance) {
  const n = 512, s = n / CELLS;
  const [c, g] = canvas(n);
  const [e, h] = canvas(n);
  h.fillStyle = '#000';
  h.fillRect(0, 0, n, n);
  const r = rng(seed);
  for (let row = 0; row < CELLS; row++) {
    for (let col = 0; col < CELLS; col++) {
      g.save(); g.translate(col * s, row * s);
      g.beginPath(); g.rect(0, 0, s, s); g.clip();
      const info = cell(g, s, r, col, row);
      g.restore();
      if (lit && r() < litChance) {
        h.save(); h.translate(col * s, row * s);
        lit(h, s, r, info, col, row);
        h.restore();
      }
    }
  }
  return { map: texture(c), glow: texture(e) };
}

const WARM = ['255,214,150', '255,226,176', '236,240,255', '255,198,120'];

export function cityTextures() {
  const T = {};

  // --- Suelos ---
  {
    const [c, g] = canvas(256), r = rng(3);
    g.fillStyle = '#3b3d40'; g.fillRect(0, 0, 256, 256);
    grain(g, 256, r, 5000, 30, 110, 0.35);
    grain(g, 256, r, 60, 20, 60, 0.18, 14); // parches
    g.strokeStyle = 'rgba(15,15,16,0.3)'; g.lineWidth = 1;
    for (let i = 0; i < 3; i++) { // grietas: trazos cortos que siguen más o menos un rumbo
      let x = r() * 256, y = r() * 256;
      const a = r() * 6.28;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += Math.cos(a + (r() - 0.5) * 1.2) * 12; y += Math.sin(a + (r() - 0.5) * 1.2) * 12; g.lineTo(x, y); }
      g.stroke();
    }
    T.asphalt = texture(c);
  }
  {
    const [c, g] = canvas(256), r = rng(5);
    g.fillStyle = '#9d9a93'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const v = 150 + r() * 22;
      g.fillStyle = `rgb(${v},${v - 2},${v - 8})`;
      g.fillRect(i * 64 + 1, j * 64 + 1, 62, 62);
    }
    grain(g, 256, r, 3500, 90, 200, 0.2);
    g.fillStyle = 'rgba(40,40,40,0.5)';
    for (let i = 0; i <= 4; i++) { g.fillRect(i * 64 - 1, 0, 2, 256); g.fillRect(0, i * 64 - 1, 256, 2); }
    T.sidewalk = texture(c);
  }
  {
    // Adoquines de plaza: hiladas alternas, tonos cálidos.
    const [c, g] = canvas(256), r = rng(9);
    g.fillStyle = '#6b6156'; g.fillRect(0, 0, 256, 256);
    for (let j = 0; j < 8; j++) for (let i = -1; i < 4; i++) {
      const v = 0.82 + r() * 0.3;
      g.fillStyle = `rgb(${Math.round(176 * v)},${Math.round(160 * v)},${Math.round(138 * v)})`;
      g.fillRect((i + (j % 2) * 0.5) * 64 + 1, j * 32 + 1, 62, 30);
    }
    grain(g, 256, r, 2500, 60, 220, 0.14);
    T.pavers = texture(c);
  }
  {
    const [c, g] = canvas(256), r = rng(13);
    g.fillStyle = '#4c6b35'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 4200; i++) {
      const v = r();
      g.fillStyle = `rgba(${50 + v * 70},${90 + v * 80},${30 + v * 40},0.5)`;
      g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 2 + r() * 4);
    }
    grain(g, 256, r, 40, 40, 90, 0.12, 20);
    T.grass = texture(c);
  }
  {
    const [c, g] = canvas(256), r = rng(17);
    g.fillStyle = '#a8a59d'; g.fillRect(0, 0, 256, 256);
    grain(g, 256, r, 6000, 110, 215, 0.22);
    grain(g, 256, r, 50, 80, 140, 0.1, 18);
    g.fillStyle = 'rgba(60,60,60,0.35)'; g.fillRect(0, 0, 256, 2); g.fillRect(0, 0, 2, 256);
    T.concrete = texture(c);
  }
  {
    // Azotea: tela asfáltica con grava y juntas.
    const [c, g] = canvas(256), r = rng(19);
    g.fillStyle = '#55524e'; g.fillRect(0, 0, 256, 256);
    grain(g, 256, r, 7000, 50, 150, 0.3);
    g.fillStyle = 'rgba(25,25,25,0.4)'; g.fillRect(0, 126, 256, 3); g.fillRect(126, 0, 3, 256);
    T.roof = texture(c);
  }
  {
    // Tejas en tono neutro (el color de cada tejado se lo da el vértice).
    const [c, g] = canvas(256), r = rng(23), rows = 8, cols = 8, h = 256 / rows, w = 256 / cols;
    for (let i = 0; i < rows; i++) {
      for (let j = -1; j < cols; j++) {
        const v = Math.round(170 + r() * 70);
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect((j + (i % 2) * 0.5) * w, i * h, w - 1, h);
      }
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, (i + 1) * h - 4, 256, 4);
    }
    T.tiles = texture(c);
  }
  {
    // Chapa ondulada: ondas verticales y óxido abajo.
    const [c, g] = canvas(256), r = rng(29);
    for (let x = 0; x < 256; x++) {
      const v = Math.round(178 + Math.sin((x / 16) * Math.PI * 2) * 42);
      g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, 0, 1, 256);
    }
    for (let i = 0; i < 26; i++) {
      g.fillStyle = `rgba(120,70,35,${0.05 + r() * 0.12})`;
      const w = 4 + r() * 14, hgt = 30 + r() * 90;
      g.fillRect(r() * 256, 256 - hgt, w, hgt);
    }
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, 256, 3);
    T.metal = texture(c);
  }
  {
    // Malla de alambre (con transparencia) para las vallas.
    const [c, g] = canvas(64);
    g.clearRect(0, 0, 64, 64);
    g.strokeStyle = '#b9bec4'; g.lineWidth = 3;
    for (let i = -64; i <= 64; i += 16) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke();
      g.beginPath(); g.moveTo(i + 64, 0); g.lineTo(i, 64); g.stroke();
    }
    T.chain = texture(c);
  }

  // --- Fachadas ---
  // Muro cortina de las torres: antepecho opaco y paño de vidrio con montantes.
  T.glass = facade(31, (g, s, r) => {
    g.fillStyle = '#24323d'; g.fillRect(0, 0, s, s);
    const tint = r();
    const grd = g.createLinearGradient(0, 0, 0, s);
    grd.addColorStop(0, `rgb(${Math.round(70 + tint * 30)},${Math.round(120 + tint * 25)},${Math.round(150 + tint * 25)})`);
    grd.addColorStop(1, `rgb(${Math.round(38 + tint * 18)},${Math.round(72 + tint * 18)},${Math.round(98 + tint * 16)})`);
    g.fillStyle = grd; g.fillRect(0, s * 0.08, s, s * 0.66);
    g.fillStyle = 'rgba(255,255,255,0.10)'; g.beginPath(); g.moveTo(0, s * 0.74); g.lineTo(s * 0.5, s * 0.08); g.lineTo(s * 0.72, s * 0.08); g.lineTo(s * 0.22, s * 0.74); g.fill();
    g.fillStyle = '#aab6bf'; g.fillRect(0, 0, 3, s); g.fillRect(s / 2 - 1, 0, 2, s);
    g.fillRect(0, s * 0.08 - 2, s, 3); g.fillRect(0, s * 0.74, s, 3);
  }, (h, s, r) => {
    h.fillStyle = `rgba(${WARM[Math.floor(r() * 4)]},${0.55 + r() * 0.45})`;
    const half = r();
    h.fillRect(half < 0.3 ? s / 2 : 4, s * 0.1, half < 0.6 ? s / 2 - 6 : s - 8, s * 0.62);
    h.fillStyle = 'rgba(0,0,0,0.45)';
    for (let y = s * 0.1; y < s * 0.1 + s * 0.62 * r(); y += 5) h.fillRect(0, y, s, 2); // persiana a medio bajar
  }, 0.2);

  // Oficinas de hormigón con ventanas corridas.
  T.office = facade(37, (g, s, r) => {
    g.fillStyle = '#c4c0b6'; g.fillRect(0, 0, s, s);
    grain(g, s, r, 260, 120, 230, 0.16);
    g.fillStyle = '#1f2c36'; g.fillRect(5, s * 0.24, s - 10, s * 0.5);
    const grd = g.createLinearGradient(0, s * 0.24, 0, s * 0.74);
    grd.addColorStop(0, 'rgba(120,160,190,0.45)'); grd.addColorStop(1, 'rgba(40,60,80,0.1)');
    g.fillStyle = grd; g.fillRect(5, s * 0.24, s - 10, s * 0.5);
    g.fillStyle = '#e4e1d8'; g.fillRect(s / 2 - 2, s * 0.24, 4, s * 0.5); g.fillRect(5, s * 0.46, s - 10, 2);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, s * 0.74, s, 4);
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(0, s * 0.2, s, 3);
  }, (h, s, r) => {
    h.fillStyle = `rgba(${WARM[Math.floor(r() * 4)]},${0.5 + r() * 0.5})`;
    h.fillRect(6, s * 0.25, s - 12, s * 0.48);
    h.fillStyle = 'rgba(0,0,0,0.5)'; h.fillRect(s / 2 - 2, s * 0.24, 4, s * 0.5);
  }, 0.16);

  // Ladrillo con ventanas de guillotina, dintel y alféizar de piedra.
  T.brick = facade(41, (g, s, r) => {
    g.fillStyle = '#b3a492'; g.fillRect(0, 0, s, s); // mortero
    const bh = s / 16, bw = s / 5;
    for (let j = 0; j < 16; j++) for (let i = -1; i < 5; i++) {
      const v = 0.8 + r() * 0.35;
      g.fillStyle = `rgb(${Math.round(196 * v)},${Math.round(168 * v)},${Math.round(150 * v)})`;
      g.fillRect((i + (j % 2) * 0.5) * bw + 1, j * bh + 1, bw - 2, bh - 2);
    }
    const x = s * 0.27, w = s * 0.46, y = s * 0.2, hgt = s * 0.56;
    g.fillStyle = '#e8e2d4'; g.fillRect(x - 6, y - 9, w + 12, 9); g.fillRect(x - 8, y + hgt, w + 16, 7);
    g.fillStyle = '#141c24'; g.fillRect(x, y, w, hgt);
    const grd = g.createLinearGradient(0, y, 0, y + hgt);
    grd.addColorStop(0, 'rgba(130,165,190,0.5)'); grd.addColorStop(1, 'rgba(30,45,60,0.1)');
    g.fillStyle = grd; g.fillRect(x, y, w, hgt);
    const kind = r();
    if (kind < 0.35) { g.fillStyle = 'rgba(230,222,200,0.8)'; g.fillRect(x, y, w * 0.34, hgt); g.fillRect(x + w * 0.66, y, w * 0.34, hgt); } // cortinas
    else if (kind < 0.5) { g.fillStyle = 'rgba(210,205,190,0.85)'; g.fillRect(x, y, w, hgt * 0.55); } // estor
    g.strokeStyle = '#f2ede2'; g.lineWidth = 3; g.strokeRect(x, y, w, hgt);
    g.fillStyle = '#f2ede2'; g.fillRect(x, y + hgt / 2 - 1, w, 3); g.fillRect(x + w / 2 - 1, y, 2, hgt);
    return { x, y, w, hgt };
  }, (h, s, r, k) => {
    h.fillStyle = `rgba(${WARM[Math.floor(r() * 4)]},${0.55 + r() * 0.45})`;
    h.fillRect(k.x + 2, k.y + 2, k.w - 4, k.hgt - 4);
    h.fillStyle = 'rgba(0,0,0,0.6)'; h.fillRect(k.x, k.y + k.hgt / 2 - 1, k.w, 3); h.fillRect(k.x + k.w / 2 - 1, k.y, 2, k.hgt);
  }, 0.24);

  // Revoco claro con contraventanas (el color del edificio lo pone el vértice).
  T.plaster = facade(43, (g, s, r) => {
    g.fillStyle = '#ece8de'; g.fillRect(0, 0, s, s);
    grain(g, s, r, 300, 170, 255, 0.18);
    for (let i = 0; i < 3; i++) { g.fillStyle = `rgba(90,80,65,${0.03 + r() * 0.05})`; g.fillRect(r() * s, 0, 3 + r() * 8, s); } // chorretones
    const x = s * 0.3, w = s * 0.4, y = s * 0.22, hgt = s * 0.52;
    g.fillStyle = '#7d8a84'; g.fillRect(x - w * 0.42, y, w * 0.4, hgt); g.fillRect(x + w * 1.02, y, w * 0.4, hgt);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let yy = y + 3; yy < y + hgt; yy += 6) { g.fillRect(x - w * 0.42, yy, w * 0.4, 2); g.fillRect(x + w * 1.02, yy, w * 0.4, 2); }
    g.fillStyle = '#18222b'; g.fillRect(x, y, w, hgt);
    const grd = g.createLinearGradient(0, y, 0, y + hgt);
    grd.addColorStop(0, 'rgba(140,170,195,0.5)'); grd.addColorStop(1, 'rgba(30,45,60,0.1)');
    g.fillStyle = grd; g.fillRect(x, y, w, hgt);
    if (r() < 0.4) { g.fillStyle = 'rgba(235,228,210,0.8)'; g.fillRect(x, y, w, hgt * (0.3 + r() * 0.4)); }
    g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.strokeRect(x, y, w, hgt);
    g.fillStyle = '#fff'; g.fillRect(x + w / 2 - 1, y, 2, hgt);
    g.fillStyle = '#d4cfc3'; g.fillRect(x - 6, y + hgt, w + 12, 6);
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, s - 3, s, 3);
    return { x, y, w, hgt };
  }, (h, s, r, k) => {
    h.fillStyle = `rgba(${WARM[Math.floor(r() * 4)]},${0.55 + r() * 0.45})`;
    h.fillRect(k.x + 2, k.y + 2, k.w - 4, k.hgt - 4);
    h.fillStyle = 'rgba(0,0,0,0.6)'; h.fillRect(k.x + k.w / 2 - 1, k.y, 2, k.hgt);
  }, 0.26);

  // Escaparates: zócalo, luna con marco, rótulo liso arriba. La segunda celda de cada fila es la puerta.
  T.shop = facade(47, (g, s, r, col) => {
    g.fillStyle = '#d9d5cc'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#3a3d42'; g.fillRect(0, s * 0.84, s, s * 0.16); // zócalo
    const x = col === 1 ? s * 0.22 : 6, w = col === 1 ? s * 0.56 : s - 12, y = s * 0.24, hgt = col === 1 ? s * 0.76 : s * 0.6;
    g.fillStyle = '#10161c'; g.fillRect(x, y, w, hgt);
    const grd = g.createLinearGradient(0, y, 0, y + hgt);
    grd.addColorStop(0, 'rgba(150,180,200,0.55)'); grd.addColorStop(0.6, 'rgba(60,80,100,0.2)'); grd.addColorStop(1, 'rgba(20,30,40,0.1)');
    g.fillStyle = grd; g.fillRect(x, y, w, hgt);
    if (col !== 1) { // género a medio saquear
      for (let i = 0; i < 5; i++) {
        g.fillStyle = `hsla(${Math.floor(r() * 360)},45%,${30 + r() * 30}%,0.55)`;
        const bw = 8 + r() * 16, bh = 8 + r() * 26;
        g.fillRect(x + 6 + r() * (w - bw - 12), y + hgt - bh - 2, bw, bh);
      }
      if (r() < 0.3) { // cristal roto, tapado con tablas
        g.fillStyle = '#7a5a3a';
        for (let i = 0; i < 3; i++) { g.save(); g.translate(x + w / 2, y + hgt * (0.25 + i * 0.25)); g.rotate((r() - 0.5) * 0.3); g.fillRect(-w / 2, -6, w, 12); g.restore(); }
      }
    } else {
      g.fillStyle = '#c9c4b8'; g.fillRect(x + w * 0.82, y + hgt * 0.5, 4, 14);
    }
    g.strokeStyle = '#2b2e33'; g.lineWidth = 4; g.strokeRect(x, y, w, hgt);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, s * 0.2, s, 4);
    return { x, y, w, hgt, door: col === 1 };
  }, (h, s, r, k) => {
    h.fillStyle = `rgba(${WARM[Math.floor(r() * 4)]},${0.25 + r() * 0.35})`;
    h.fillRect(k.x + 3, k.y + 3, k.w - 6, k.hgt - 6);
  }, 0.3);

  // --- Detalles: ventanas, puertas y persianas sueltas (rejilla de 4 × 4) ---
  {
    const n = 512, s = n / 4;
    const [c, g] = canvas(n);
    const [e, h] = canvas(n);
    h.fillStyle = '#000'; h.fillRect(0, 0, n, n);
    const r = rng(53);
    const at = (col, row, draw) => { g.save(); g.translate(col * s, row * s); g.beginPath(); g.rect(0, 0, s, s); g.clip(); draw(); g.restore(); };
    const glow = (col, row, draw) => { h.save(); h.translate(col * s, row * s); draw(); h.restore(); };
    const pane = (lit) => {
      g.fillStyle = '#f4f1e8'; g.fillRect(0, 0, s, s);
      g.fillStyle = '#17212a'; g.fillRect(10, 10, s - 20, s - 26);
      const grd = g.createLinearGradient(0, 10, 0, s - 16);
      grd.addColorStop(0, 'rgba(150,180,205,0.55)'); grd.addColorStop(1, 'rgba(30,45,60,0.1)');
      g.fillStyle = grd; g.fillRect(10, 10, s - 20, s - 26);
      g.fillStyle = 'rgba(232,224,204,0.8)'; g.fillRect(10, 10, (s - 20) * 0.3, s - 26); g.fillRect(s - 10 - (s - 20) * 0.3, 10, (s - 20) * 0.3, s - 26);
      g.fillStyle = '#f4f1e8'; g.fillRect(s / 2 - 2, 10, 4, s - 26); g.fillRect(10, s * 0.45, s - 20, 4);
      g.fillStyle = '#cfc9bb'; g.fillRect(0, s - 14, s, 14);
      if (lit) return (col, row) => glow(col, row, () => { h.fillStyle = 'rgba(255,214,150,0.95)'; h.fillRect(12, 12, s - 24, s - 30); h.fillStyle = 'rgba(0,0,0,0.6)'; h.fillRect(s / 2 - 2, 10, 4, s - 26); h.fillRect(10, s * 0.45, s - 20, 4); });
      return null;
    };
    at(0, 0, () => pane(true)(0, 0)); // ventana que se enciende de noche
    at(1, 0, () => pane(false)); // ventana a oscuras
    at(2, 0, () => { // puerta de cuarterones (tono neutro: el color lo pone el vértice)
      g.fillStyle = '#e9e9e9'; g.fillRect(0, 0, s, s);
      g.fillStyle = '#c9c9c9';
      for (const [x, y, w, hh] of [[14, 10, 44, 46], [70, 10, 44, 46], [14, 66, 44, 52], [70, 66, 44, 52]]) g.fillRect(x, y, w, hh);
      g.fillStyle = '#b08d3a'; g.beginPath(); g.arc(s - 14, s * 0.52, 5, 0, 7); g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 4; g.strokeRect(2, 2, s - 4, s - 4);
    });
    at(3, 0, () => { // portón de garaje, por paneles
      g.fillStyle = '#e4e4e0'; g.fillRect(0, 0, s, s);
      g.fillStyle = 'rgba(0,0,0,0.22)';
      for (let y = 0; y < s; y += s / 5) g.fillRect(0, y, s, 3);
      g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(s / 2 - 10, s - 22, 20, 4);
    });
    at(0, 1, () => { // persiana metálica
      for (let y = 0; y < s; y += 8) { g.fillStyle = y % 16 ? '#9a9da1' : '#b6b9bd'; g.fillRect(0, y, s, 8); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, y + 7, s, 1); }
      g.fillStyle = 'rgba(110,60,30,0.25)'; for (let i = 0; i < 8; i++) g.fillRect(r() * s, s * 0.6, 3 + r() * 6, s * 0.4);
    });
    at(1, 1, () => { // puerta doble de cristal
      g.fillStyle = '#2c3138'; g.fillRect(0, 0, s, s);
      const grd = g.createLinearGradient(0, 0, 0, s);
      grd.addColorStop(0, 'rgb(120,160,185)'); grd.addColorStop(1, 'rgb(40,60,78)');
      g.fillStyle = grd; g.fillRect(6, 6, s / 2 - 9, s - 10); g.fillRect(s / 2 + 3, 6, s / 2 - 9, s - 10);
      g.fillStyle = '#c9ccd0'; g.fillRect(s / 2 - 12, s * 0.45, 4, 22); g.fillRect(s / 2 + 8, s * 0.45, 4, 22);
    });
    glow(1, 1, () => { h.fillStyle = 'rgba(210,235,255,0.45)'; h.fillRect(6, 6, s - 12, s - 10); });
    at(2, 1, () => { // rejilla de ventilación
      g.fillStyle = '#8d9196'; g.fillRect(0, 0, s, s);
      g.fillStyle = '#4c5055'; for (let y = 8; y < s - 6; y += 10) g.fillRect(8, y, s - 16, 5);
      g.strokeStyle = '#5b5f64'; g.lineWidth = 5; g.strokeRect(2, 2, s - 4, s - 4);
    });
    at(3, 1, () => { // vidriera ojival (iglesia)
      g.fillStyle = '#8f8c86'; g.fillRect(0, 0, s, s);
      g.beginPath(); g.moveTo(26, s); g.lineTo(26, 54); g.quadraticCurveTo(s / 2, -14, s - 26, 54); g.lineTo(s - 26, s); g.closePath();
      g.save(); g.clip();
      for (let i = 0; i < 26; i++) { g.fillStyle = `hsl(${Math.floor(r() * 360)},55%,${22 + r() * 22}%)`; g.fillRect(20 + r() * (s - 60), r() * s, 12 + r() * 20, 12 + r() * 20); }
      g.restore();
      g.strokeStyle = '#3c3a36'; g.lineWidth = 5; g.stroke();
      g.fillStyle = '#3c3a36'; g.fillRect(s / 2 - 2, 20, 4, s);
    });
    glow(3, 1, () => {
      h.beginPath(); h.moveTo(28, s); h.lineTo(28, 54); h.quadraticCurveTo(s / 2, -10, s - 28, 54); h.lineTo(s - 28, s); h.closePath();
      h.save(); h.clip();
      for (let i = 0; i < 26; i++) { h.fillStyle = `hsla(${Math.floor(r() * 360)},80%,60%,0.75)`; h.fillRect(20 + r() * (s - 60), r() * s, 12 + r() * 20, 12 + r() * 20); }
      h.restore();
    });
    at(0, 2, () => { // contenedor: chapa con nervios y puertas
      for (let x = 0; x < s; x++) { const v = Math.round(200 + Math.sin((x / 10) * Math.PI * 2) * 40); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, 0, 1, s); }
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, s, 5); g.fillRect(0, s - 5, s, 5);
      g.fillStyle = 'rgba(120,70,35,0.2)'; for (let i = 0; i < 10; i++) g.fillRect(r() * s, r() * s, 4 + r() * 12, 10 + r() * 40);
    });
    at(1, 2, () => { // cartel de aviso: zona en cuarentena
      g.fillStyle = '#e8c21a'; g.fillRect(0, 0, s, s);
      g.fillStyle = '#16161a';
      for (let i = -s; i < s * 2; i += 26) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 13, 0); g.lineTo(i + 13 - 22, 22); g.lineTo(i - 22, 22); g.fill(); }
      for (let i = -s; i < s * 2; i += 26) { g.beginPath(); g.moveTo(i, s - 22); g.lineTo(i + 13, s - 22); g.lineTo(i + 13 - 22, s); g.lineTo(i - 22, s); g.fill(); }
      g.font = 'bold 19px system-ui, sans-serif'; g.textAlign = 'center';
      g.fillText('ZONA EN', s / 2, 56); g.fillText('CUARENTENA', s / 2, 80);
      g.font = 'bold 12px system-ui, sans-serif'; g.fillText('NO PASAR', s / 2, 98);
    });
    at(2, 2, () => { // cruz roja sobre blanco
      g.fillStyle = '#f2f2ee'; g.fillRect(0, 0, s, s);
      g.fillStyle = '#c8322b'; g.fillRect(s * 0.38, s * 0.14, s * 0.24, s * 0.72); g.fillRect(s * 0.14, s * 0.38, s * 0.72, s * 0.24);
    });
    glow(2, 2, () => { h.fillStyle = 'rgba(255,60,50,0.9)'; h.fillRect(s * 0.38, s * 0.14, s * 0.24, s * 0.72); h.fillRect(s * 0.14, s * 0.38, s * 0.72, s * 0.24); });
    at(3, 2, () => { // tablero de baloncesto / panel liso con marco
      g.fillStyle = '#f0f0ec'; g.fillRect(0, 0, s, s);
      g.strokeStyle = '#c8322b'; g.lineWidth = 6; g.strokeRect(6, 6, s - 12, s - 12); g.strokeRect(s * 0.3, s * 0.45, s * 0.4, s * 0.35);
    });
    T.details = { map: texture(c, false), glow: texture(e, false) };
  }

  // --- Rótulos: 2 columnas × 8 filas ---
  {
    const NAMES = [
      ['FARMACIA', '#1f7a3a', '#ffffff'], ['PANADERÍA', '#b5651d', '#fff4d6'], ['CAFÉ LUNA', '#3b2a22', '#ffd479'], ['FERRETERÍA', '#c8322b', '#ffffff'],
      ['MERCADO', '#e8a71a', '#2a1c05'], ['LIBRERÍA', '#274a7a', '#f2ecd8'], ['BAR EL PASO', '#5a1e3a', '#ffd9a8'], ['ZAPATERÍA', '#22303a', '#e6edf2'],
      ['FRUTERÍA', '#4f8a2c', '#fffbe0'], ['PIZZERÍA', '#a8281f', '#ffe9b0'], ['MODA', '#111111', '#ffffff'], ['LAVANDERÍA', '#3a8fb7', '#ffffff'],
      ['HOTEL', '#1b2440', '#ffd479'], ['SÚPER Z', '#d0261e', '#ffffff'], ['GASOLINERA', '#f2f2f2', '#c8322b'], ['HOSPITAL', '#f2f2ee', '#c8322b'],
      ['ESCUELA', '#2c5a8a', '#ffffff'], ['24 H', '#f6d21a', '#16161a'], ['POLICÍA', '#1b2a4a', '#ffffff'], ['MOTEL', '#7a1e2a', '#ffe9b0'],
    ];
    const rw = 256, rh = 64, W = 512, H = Math.ceil(NAMES.length / 2) * rh;
    const [c, g] = canvas(W, H);
    NAMES.forEach(([name, bg, fg], i) => {
      const x = (i % 2) * rw, y = Math.floor(i / 2) * rh;
      g.fillStyle = bg; g.fillRect(x, y, rw, rh);
      g.strokeStyle = fg; g.globalAlpha = 0.5; g.lineWidth = 3; g.strokeRect(x + 5, y + 5, rw - 10, rh - 10); g.globalAlpha = 1;
      g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
      let size = 38;
      g.font = `bold ${size}px system-ui, "Helvetica Neue", Arial, sans-serif`;
      while (g.measureText(name).width > rw - 30 && size > 12) { size -= 2; g.font = `bold ${size}px system-ui, "Helvetica Neue", Arial, sans-serif`; }
      g.fillText(name, x + rw / 2, y + rh / 2 + 2);
    });
    const map = texture(c, false);
    /** Recorte [u0, v0, u1, v1] del rótulo `name` dentro de la textura. */
    const uv = (name) => {
      const i = Math.max(0, NAMES.findIndex((s) => s[0] === name));
      const x = (i % 2) * rw, y = Math.floor(i / 2) * rh;
      return [x / W, 1 - (y + rh) / H, (x + rw) / W, 1 - y / H];
    };
    T.signs = { map, uv, shops: NAMES.slice(0, 12).map((s) => s[0]) };
  }

  // --- Charco de luz bajo las farolas (suma de luz, borde suave) ---
  {
    const [c, g] = canvas(128);
    const grd = g.createRadialGradient(64, 64, 2, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    T.pool = texture(c, false);
  }
  return T;
}

/** Materiales de la ciudad. Todos admiten color por vértice (tiñe la textura). */
export function cityMaterials(T) {
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.9, vertexColors: true, ...o });
  const lit = (t, o = {}) => std({ map: t.map, emissiveMap: t.glow, emissive: 0xffffff, emissiveIntensity: 0, ...o });
  const M = {
    asphalt: std({ map: T.asphalt, roughness: 0.95 }),
    sidewalk: std({ map: T.sidewalk }),
    pavers: std({ map: T.pavers }),
    grass: std({ map: T.grass, roughness: 1 }),
    concrete: std({ map: T.concrete }),
    roof: std({ map: T.roof, roughness: 1 }),
    tiles: std({ map: T.tiles, roughness: 0.8 }),
    metal: std({ map: T.metal, roughness: 0.55, metalness: 0.25 }),
    plain: std({ roughness: 0.75 }),
    flat: std({ roughness: 0.9, flatShading: true }), // follaje
    glass: lit(T.glass, { roughness: 0.25, metalness: 0.2 }),
    office: lit(T.office),
    brick: lit(T.brick),
    plaster: lit(T.plaster),
    shop: lit(T.shop, { roughness: 0.6 }),
    details: lit(T.details, { roughness: 0.7 }),
    signs: std({ map: T.signs.map, emissiveMap: T.signs.map, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.6 }),
    chain: std({ map: T.chain, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.4 }),
    // Marcas viales: pegadas al asfalto, sin pelearse con él en la distancia.
    mark: std({ roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    water: std({ color: 0x3f7f96, roughness: 0.12, metalness: 0.3 }),
    // Farolas: la tulipa (se enciende de noche) y el charco de luz en el suelo.
    lamp: new THREE.MeshStandardMaterial({ color: 0xd8d4c8, emissive: 0xffd9a0, emissiveIntensity: 0, roughness: 0.4 }),
    pool: new THREE.MeshBasicMaterial({ map: T.pool, color: 0xffc98a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
  };
  for (const k of ['mark', 'pool', 'chain']) M[k].userData.noShadow = true;
  // Lo que brilla de noche y con cuánta fuerza (lo regula `City.setNight`).
  M.glow = [[M.glass, 1.5], [M.office, 1.4], [M.brick, 1.5], [M.plaster, 1.5], [M.shop, 1.1], [M.details, 1.5], [M.signs, 0.9], [M.lamp, 3.2]];
  return M;
}
