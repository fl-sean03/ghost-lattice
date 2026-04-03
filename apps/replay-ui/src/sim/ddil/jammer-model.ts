/**
 * Jammer zone model. Ported from services/ddil-engine/app/jammer_model.py
 */

import { type Vec3, vec3Dist } from "./link-model";

export interface JammerZone {
  id: string;
  center: Vec3;
  radius_m: number;
  strength_dbm: number;
  active: boolean;
}

/** Returns jamming intensity 0-1 at a position (1 = full jamming at center). */
export function jammerSignalAt(jammer: JammerZone, position: Vec3): number {
  if (!jammer.active) return 0;
  const distance = vec3Dist(position, jammer.center);
  if (distance >= jammer.radius_m) return 0;
  const normalized = distance / jammer.radius_m;
  return (1 - normalized) ** 2;
}
