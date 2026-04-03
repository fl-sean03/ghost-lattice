/**
 * GPS degradation zone model. Ported from services/ddil-engine/app/gps_model.py
 */

import { type Vec3, vec3Dist } from "./link-model";

export interface GPSZone {
  id: string;
  center: Vec3;
  radius_m: number;
  accuracy_m: number; // degraded accuracy in meters
  active: boolean;
}

/** Returns GPS accuracy in meters at a position (1.5m = normal, higher = degraded). */
export function gpsDegradationAt(zone: GPSZone, position: Vec3): number {
  if (!zone.active) return 1.5;
  const distance = vec3Dist(position, zone.center);
  if (distance >= zone.radius_m) return 1.5;
  const normalized = 1 - distance / zone.radius_m;
  return 1.5 + normalized * (zone.accuracy_m - 1.5);
}
