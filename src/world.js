import * as THREE from 'three';

function gridTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#56616e';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#6f7c8b';
  g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.stroke();
    g.beginPath(); g.moveTo(0, i * 64); g.lineTo(256, i * 64); g.stroke();
  }
  g.strokeStyle = '#aab6c4';
  g.lineWidth = 4;
  g.strokeRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Construye el mundo de simulación: zonas para probar cada mecánica.
export function buildWorld(scene, physics) {
  // --- Iluminación y cielo ---
  scene.background = new THREE.Color(0x9cc4e8);
  scene.fog = new THREE.Fog(0x9cc4e8, 45, 130);
  scene.add(new THREE.HemisphereLight(0xdfeeff, 0x4a4f48, 1.1));
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -28; sc.right = sc.top = 28; sc.near = 1; sc.far = 120;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  // --- Suelo ---
  const SIZE = 80;
  const tex = gridTexture();
  tex.repeat.set(SIZE / 4, SIZE / 4); // una celda grande = 4 m, subdivisiones de 1 m
  physics.add({
    size: [SIZE, 1, SIZE], pos: [0, -0.5, 0], shadow: false,
    material: new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }),
  });
  // Muros perimetrales
  const H = SIZE / 2;
  for (const [x, z, w, d] of [[0, -H, SIZE, 1], [0, H, SIZE, 1], [-H, 0, 1, SIZE], [H, 0, 1, SIZE]]) {
    physics.add({ size: [w, 4, d], pos: [x, 2, z], color: 0x39424d });
  }

  // --- Coberturas (delante del inicio, -Z): bloques con las tres alturas estándar ---
  // Muy bajo (0,45 m): el personaje se recuesta. Medio (1,1 m): se agacha y dispara por
  // encima. Alto (2,4 m): queda de pie y se asoma por el borde.
  const concrete = 0x8a9099;
  physics.add({ size: [2.6, 1.1, 0.45], pos: [-2.8, 0.55, -5], color: concrete }); // medio
  physics.add({ size: [1.8, 2.4, 0.45], pos: [2.8, 1.2, -5], color: concrete }); // alto
  // Pieza mixta: tramo alto y tramo medio seguidos.
  physics.add({ size: [1.4, 2.4, 0.45], pos: [-0.9, 1.2, -7.5], color: concrete });
  physics.add({ size: [1.8, 1.1, 0.45], pos: [0.7, 0.55, -7.5], color: concrete });
  physics.add({ size: [3.2, 0.45, 0.5], pos: [5.6, 0.225, -7.5], color: concrete }); // muy bajo

  // --- Circuito de movimiento (detrás, +Z): escaleras, plataforma y rampa ---
  const PH = 2; // altura de la plataforma
  // Losa delgada: deja 1,88 m libres para pasar por debajo (el personaje mide 1,75 m). Con
  // menos altura, las cápsulas se quedaban encajadas contra el borde inferior.
  const SLAB = 0.12;
  physics.add({ size: [6, SLAB, 6], pos: [0, PH - SLAB / 2, 16], color: 0x7d8a99 });
  for (const [x, z] of [[-2.8, 13.2], [2.8, 13.2], [-2.8, 18.8], [2.8, 18.8]]) {
    physics.add({ size: [0.3, PH - SLAB, 0.3], pos: [x, (PH - SLAB) / 2, z], color: 0x4b5561 });
  }
  // Relleno bajo una rampa: bloques escalonados que tapan el hueco en cuña de debajo, donde
  // un personaje quedaría atrapado entre el suelo y la cara inferior. `at(s)` da el centro
  // [x, z] del tramo a distancia horizontal s del pie de la rampa.
  const fillUnder = (run, size, at, options = {}) => {
    const N = 8;
    for (let i = 0; i < N; i++) {
      const h = (PH * i) / N - 0.3; // por debajo de la superficie de la rampa
      if (h < 0.15) continue;
      const [x, z] = at(((i + 0.5) * run) / N);
      physics.add({ size: size(run / N, h), pos: [x, h / 2, z], ...options });
    }
  };
  // Escaleras: peldaños visuales + una rampa invisible como colisión (subida suave y fiable).
  const STEPS = 10, RISE = PH / STEPS, RUN = 0.4;
  for (let i = 0; i < STEPS; i++) {
    const h = RISE * (i + 1);
    const step = new THREE.Mesh(
      new THREE.BoxGeometry(3, h, RUN),
      new THREE.MeshStandardMaterial({ color: i % 2 ? 0x8f9cab : 0x7d8a99, roughness: 0.75 }),
    );
    step.position.set(-1.5, h / 2, 13 - STEPS * RUN + i * RUN + RUN / 2);
    step.castShadow = step.receiveShadow = true;
    scene.add(step);
  }
  const sRun = STEPS * RUN + 0.2;
  const sAng = Math.atan2(PH, sRun);
  physics.add({
    size: [3, 0.2, Math.hypot(sRun, PH)], visible: false,
    pos: [-1.5, PH / 2 - 0.1 * Math.cos(sAng), 13 - sRun / 2 + 0.1 * Math.sin(sAng)],
    euler: [-sAng, 0, 0],
  });
  fillUnder(sRun, (len, h) => [3, h, len], (s) => [-1.5, 13 - sRun + s], { visible: false, shadow: false });
  const ang = THREE.MathUtils.degToRad(20);
  const run = PH / Math.tan(ang);
  const len = PH / Math.sin(ang);
  physics.add({
    size: [len, 0.2, 4], color: 0xc9a23c,
    pos: [3 + run / 2 - 0.1 * Math.sin(ang), PH / 2 - 0.1 * Math.cos(ang), 16],
    euler: [0, 0, -ang],
  });
  fillUnder(run, (len, h) => [len, h, 4], (s) => [3 + run - s, 16], { color: 0xa8842e });
  return { sun };
}
