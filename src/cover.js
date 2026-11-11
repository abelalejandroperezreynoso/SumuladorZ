import { RAPIER } from './physics.js';

// Alturas (sobre los pies) a las que se sondea un muro: si hay pared a la altura de la
// cintura sirve de cobertura baja; si además la hay por encima de la cabeza, es alta.
export const COVER_LOW_Y = 0.6;
export const COVER_HIGH_Y = 1.6;

/**
 * Lanza un rayo horizontal contra la geometría fija. Devuelve la distancia y la normal
 * (aplanada) de la pared, o null si no hay nada o la superficie no es vertical (rampas).
 */
export function probeWall(world, x, y, z, dx, dz, maxDist) {
  const hit = world.castRayAndGetNormal(
    new RAPIER.Ray({ x, y, z }, { x: dx, y: 0, z: dz }), maxDist, true, RAPIER.QueryFilterFlags.ONLY_FIXED,
  );
  if (!hit || hit.timeOfImpact < 1e-4 || Math.abs(hit.normal.y) > 0.3) return null;
  const len = Math.hypot(hit.normal.x, hit.normal.z);
  return { dist: hit.timeOfImpact, nx: hit.normal.x / len, nz: hit.normal.z / len };
}
