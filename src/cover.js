import { RAPIER, GROUPS } from './physics.js';

// Alturas (sobre los pies) a las que se sondea un objeto: si lo hay a media pierna sirve de
// cobertura baja; si además lo hay por encima de la cabeza, es alta.
export const COVER_LOW_Y = 0.45;
export const COVER_HIGH_Y = 1.6;
const MIN_COVER_MASS = 5; // los objetos sueltos más ligeros (latas, ladrillos, dianas) no cubren

// Sirve de cobertura todo lo fijo y los objetos sueltos con peso suficiente (cajas, barriles).
// Las pelotas no: ruedan.
function isCover(collider) {
  const body = collider.parent();
  if (!body || body.isFixed()) return true;
  return body.isDynamic() && body.mass() >= MIN_COVER_MASS && collider.shapeType() !== RAPIER.ShapeType.Ball;
}

/**
 * Lanza un rayo horizontal contra el escenario. Devuelve la distancia y la normal (aplanada)
 * de la superficie, o null si no hay nada o no es vertical (rampas).
 */
export function probeWall(world, x, y, z, dx, dz, maxDist) {
  const hit = world.castRayAndGetNormal(
    new RAPIER.Ray({ x, y, z }, { x: dx, y: 0, z: dz }), maxDist, true,
    RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC, GROUPS.cover, undefined, undefined, isCover,
  );
  if (!hit || hit.timeOfImpact < 1e-4 || Math.abs(hit.normal.y) > 0.3) return null;
  const len = Math.hypot(hit.normal.x, hit.normal.z);
  return { dist: hit.timeOfImpact, nx: hit.normal.x / len, nz: hit.normal.z / len };
}
