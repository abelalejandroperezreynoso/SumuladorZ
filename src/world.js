import * as THREE from 'three';
import { RAPIER } from './physics.js';

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

function targetTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f2f2f2';
  g.fillRect(0, 0, 128, 256);
  const rings = ['#222', '#f2f2f2', '#2a6fdb', '#d93030', '#ffd21f'];
  rings.forEach((col, i) => {
    g.fillStyle = col;
    g.beginPath(); g.arc(64, 90, 58 - i * 11, 0, Math.PI * 2); g.fill();
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
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

  // --- Campo de tiro (frente, -Z) ---
  const faceTex = targetTexture();
  for (const [x, z] of [[-3, -10], [0, -10], [3, -10], [-4, -18], [0, -18], [4, -18], [-5, -27], [0, -27], [5, -27]]) {
    // Cada diana tiene su propio material para poder destellar al impacto.
    physics.add({
      size: [0.7, 1.7, 0.12], pos: [x, 0.85, z], dynamic: true, mass: 4, isTarget: true,
      material: new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.8 }),
    });
  }
  // Marcas de distancia
  for (const z of [-10, -18, -27]) {
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 0.15),
      new THREE.MeshBasicMaterial({ color: 0xffd21f }),
    );
    line.rotation.x = -Math.PI / 2;
    line.position.set(0, 0.01, z + 1.5);
    scene.add(line);
  }
  // Parapeto y botellas/latas sobre una mesa
  physics.add({ size: [5, 0.9, 0.5], pos: [9, 0.45, -12], color: 0x6b4e33 });
  for (let i = 0; i < 7; i++) {
    physics.add({
      shape: 'cylinder', radius: 0.09, height: 0.3, pos: [7.2 + i * 0.6, 1.06, -12],
      dynamic: true, mass: 0.3, color: [0xd93030, 0x2a9d5c, 0x2a6fdb][i % 3], isTarget: true,
    });
  }

  // --- Cajas apiladas (izquierda, -X) ---
  const crateColors = [0xc98f4a, 0xb97f3d, 0xd6a05c];
  const S = 0.8;
  for (let row = 0; row < 5; row++) {
    for (let i = 0; i < 5 - row; i++) {
      physics.add({
        size: [S, S, S], dynamic: true, mass: 6, color: crateColors[(row + i) % 3],
        pos: [-10 + (i + row / 2) * (S + 0.02) - 1.6, S / 2 + row * S, -5],
      });
    }
  }
  // Muro de bloques ligeros
  for (let y = 0; y < 5; y++) {
    for (let i = 0; i < 6; i++) {
      physics.add({
        size: [0.8, 0.4, 0.4], dynamic: true, mass: 2, color: y % 2 ? 0xa34a3a : 0xb85a48,
        pos: [-14 + i * 0.81 + (y % 2) * 0.4, 0.2 + y * 0.4, 2],
      });
    }
  }
  // Barriles
  for (const [x, z] of [[-6, 3], [-6.9, 3.4], [-6.3, 4.2], [-5, -9]]) {
    physics.add({
      shape: 'cylinder', radius: 0.4, height: 1.1, pos: [x, 0.55, z],
      dynamic: true, mass: 12, color: 0x2f6f8f,
    });
  }

  // --- Sacos de boxeo (derecha, +X) ---
  const TOP = 3.0;
  physics.add({ size: [0.25, TOP, 0.25], pos: [5, TOP / 2, -3], color: 0x30363d });
  physics.add({ size: [0.25, TOP, 0.25], pos: [12, TOP / 2, -3], color: 0x30363d });
  const beam = physics.add({ size: [7.25, 0.25, 0.25], pos: [8.5, TOP + 0.125, -3], color: 0x30363d });
  [6.5, 8.5, 10.5].forEach((x, i) => {
    const bagH = 1.1, bagR = 0.32;
    const cy = TOP - 0.5 - bagH / 2 - bagR; // centro del saco
    const bag = physics.add({
      shape: 'capsule', radius: bagR, height: bagH, pos: [x, cy, -3],
      dynamic: true, mass: 18 + i * 12, color: [0xb3262c, 0x24509c, 0x1d1d1f][i],
      damping: 0.25, angularDamping: 1.2,
    });
    const top = bagH / 2 + bagR + 0.5;
    physics.world.createImpulseJoint(
      RAPIER.JointData.spherical({ x: x - 8.5, y: -0.125, z: 0 }, { x: 0, y: top, z: 0 }),
      beam.body, bag.body, true,
    );
    // Cadena (visual, hija del saco)
    const chain = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6),
      new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8, roughness: 0.4 }),
    );
    chain.position.y = bagH / 2 + bagR + 0.25;
    bag.mesh.add(chain);
  });

  // --- Circuito de movimiento (detrás, +Z): escaleras, plataforma y rampa ---
  const PH = 2; // altura de la plataforma
  physics.add({ size: [6, 0.4, 6], pos: [0, PH - 0.2, 16], color: 0x7d8a99 });
  for (const [x, z] of [[-2.8, 13.2], [2.8, 13.2], [-2.8, 18.8], [2.8, 18.8]]) {
    physics.add({ size: [0.3, PH - 0.4, 0.3], pos: [x, (PH - 0.4) / 2, z], color: 0x4b5561 });
  }
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
  const ang = THREE.MathUtils.degToRad(20);
  const run = PH / Math.tan(ang);
  const len = PH / Math.sin(ang);
  physics.add({
    size: [len, 0.2, 4], color: 0xc9a23c,
    pos: [3 + run / 2 - 0.1 * Math.sin(ang), PH / 2 - 0.1 * Math.cos(ang), 16],
    euler: [0, 0, -ang],
  });
  // Rampa empinada (no escalable: > 45°) y bloques de salto
  physics.add({ size: [3, 0.2, 4], pos: [-9, 1.2, 12], euler: [THREE.MathUtils.degToRad(-55), 0, 0], color: 0x9c3d3d });
  [[8, 0.5, 8], [10, 1.0, 9.5], [12, 1.5, 8], [14, 2.0, 9.5]].forEach(([x, h, z]) => {
    physics.add({ size: [1.4, h, 1.4], pos: [x, h / 2, z], color: 0x5c7d5a });
  });
  // Pelotas sobre la plataforma y por el suelo
  const ballColors = [0xe85d4a, 0x4ab0e8, 0xf2c84b, 0x6fd08c];
  for (let i = 0; i < 6; i++) {
    const r = 0.25 + (i % 3) * 0.12;
    physics.add({
      shape: 'ball', radius: r, pos: [-1.5 + (i % 3) * 1.5, PH + r + 0.05, 17 + Math.floor(i / 3) * 1.2],
      dynamic: true, mass: 1 + r * 4, color: ballColors[i % 4], restitution: 0.65, angularDamping: 0.6,
    });
  }
  physics.add({
    shape: 'ball', radius: 0.9, pos: [-6, 0.9, -1], dynamic: true, mass: 15,
    color: 0xf2c84b, restitution: 0.5, angularDamping: 0.6,
  });

  return { sun };
}
