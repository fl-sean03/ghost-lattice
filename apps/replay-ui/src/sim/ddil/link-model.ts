/**
 * Pairwise link quality model.
 * Ported from services/ddil-engine/app/link_model.py
 */

export type Vec3 = [number, number, number];

export interface Building {
  center: Vec3;
  size: Vec3;
}

export interface JammerDef {
  center: Vec3;
  radius_m: number;
  active: boolean;
}

export function vec3Dist(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function vec3Norm(a: Vec3): number {
  return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
}

/** Linear falloff from 1.0 at distance=0 to 0.0 at max_range. */
export function baseQuality(distance: number, maxRange: number): number {
  if (maxRange <= 0) return 0;
  return Math.max(0, 1 - distance / maxRange);
}

/**
 * Ray-AABB intersection for line-of-sight.
 * Returns 1.0 if clear LOS, 0.2 if blocked by a building.
 */
export function lineOfSight(pos1: Vec3, pos2: Vec3, buildings: Building[]): number {
  if (buildings.length === 0) return 1;

  const dir: Vec3 = [pos2[0] - pos1[0], pos2[1] - pos1[1], pos2[2] - pos1[2]];
  const length = vec3Norm(dir);
  if (length < 0.001) return 1;

  const invLen = 1 / length;
  const d: Vec3 = [dir[0] * invLen, dir[1] * invLen, dir[2] * invLen];

  for (const bldg of buildings) {
    const half: Vec3 = [bldg.size[0] / 2, bldg.size[1] / 2, bldg.size[2] / 2];
    const bmin: Vec3 = [bldg.center[0] - half[0], bldg.center[1] - half[1], bldg.center[2] - half[2]];
    const bmax: Vec3 = [bldg.center[0] + half[0], bldg.center[1] + half[1], bldg.center[2] + half[2]];

    let tNear = -Infinity;
    let tFar = Infinity;
    let miss = false;

    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-8) {
        if (pos1[i] < bmin[i] || pos1[i] > bmax[i]) {
          miss = true;
          break;
        }
      } else {
        let t1 = (bmin[i] - pos1[i]) / d[i];
        let t2 = (bmax[i] - pos1[i]) / d[i];
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        tNear = Math.max(tNear, t1);
        tFar = Math.min(tFar, t2);
      }
    }

    if (!miss && tNear <= tFar && tFar >= 0 && tNear <= length) {
      return 0.2; // LOS blocked
    }
  }

  return 1;
}

/**
 * Jammer attenuation on a link.
 * Quadratic falloff from jammer center, compounds multiplicatively.
 */
export function jammerAttenuation(pos1: Vec3, pos2: Vec3, jammers: JammerDef[]): number {
  if (jammers.length === 0) return 1;

  let atten = 1;
  for (const jammer of jammers) {
    if (!jammer.active) continue;
    const d1 = vec3Dist(pos1, jammer.center);
    const d2 = vec3Dist(pos2, jammer.center);
    const minD = Math.min(d1, d2);
    if (minD < jammer.radius_m) {
      atten *= (minD / jammer.radius_m) ** 2;
    }
  }

  return Math.max(0, atten);
}

/**
 * Composite link quality between two positions.
 * Returns 0.0 (no link) to 1.0 (perfect).
 */
export function linkQuality(
  pos1: Vec3, pos2: Vec3, maxRange: number,
  buildings: Building[] = [], jammers: JammerDef[] = [],
): number {
  const distance = vec3Dist(pos1, pos2);
  const bq = baseQuality(distance, maxRange);
  const los = lineOfSight(pos1, pos2, buildings);
  const ja = jammerAttenuation(pos1, pos2, jammers);
  return bq * los * ja;
}
