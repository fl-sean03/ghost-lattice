/**
 * CostField — environmental cost function for adaptive autonomy.
 *
 * Maps any (x, y) position to a scalar cost based on environmental threats.
 * Higher cost = more dangerous/undesirable position. Cost = 0 means safe.
 * Cost = Infinity means impassable (buildings, NFZ).
 *
 * The cost field is the foundation for all drone decision-making.
 * Same code, different environment → fundamentally different behavior.
 */

import { type Vec3, vec3Dist } from "../ddil/link-model";
import { jammerSignalAt, type JammerZone } from "../ddil/jammer-model";
import { gpsDegradationAt, type GPSZone } from "../ddil/gps-model";
import { type VehicleState } from "./behavior";

export interface CostFieldConfig {
  /** Weight for jammer proximity cost (0-1). Higher = more avoidance. */
  jammerWeight: number;
  /** Weight for GPS degradation cost (0-1). */
  gpsWeight: number;
  /** Weight for fleet isolation cost (0-1). Being far from teammates. */
  isolationWeight: number;
  /** Weight for being out of operational bounds. */
  boundsWeight: number;
  /** Max comms range beyond which isolation cost maxes out. */
  maxCommsRange: number;
}

export const DEFAULT_COST_WEIGHTS: CostFieldConfig = {
  jammerWeight: 0.5,
  gpsWeight: 0.25,
  isolationWeight: 0.3,
  boundsWeight: 0.4,
  maxCommsRange: 800,
};

export interface CostFieldState {
  jammers: JammerZone[];
  gpsZones: GPSZone[];
  buildings: Array<{ center: Vec3; size: Vec3 }>;
  nfzs: Array<{ bounds: [[number, number], [number, number]] }>;
  fleetPositions: Vec3[];  // positions of all alive drones
  operationalBounds: [[number, number], [number, number]]; // [minXY, maxXY]
}

export class CostField {
  private state: CostFieldState;
  private config: CostFieldConfig;

  constructor(state: CostFieldState, config: CostFieldConfig = DEFAULT_COST_WEIGHTS) {
    this.state = state;
    this.config = config;
  }

  /** Update with new state (called each tick). */
  update(state: CostFieldState): void {
    this.state = state;
  }

  /**
   * Query the environmental cost at position (x, y).
   * Returns 0 (safe) to ~1 (very dangerous). Infinity for impassable.
   */
  query(x: number, y: number): number {
    // Hard constraints — impassable
    if (this._inBuilding(x, y)) return Infinity;
    if (this._inNFZ(x, y)) return Infinity;

    let cost = 0;

    // Jammer cost: uses the real DDIL model's signal strength
    for (const j of this.state.jammers) {
      if (!j.active) continue;
      const signal = jammerSignalAt(j, [x, y, 0]);
      cost += signal * this.config.jammerWeight;
    }

    // GPS degradation cost: higher where accuracy is worse
    for (const gz of this.state.gpsZones) {
      if (!gz.active) continue;
      const accuracy = gpsDegradationAt(gz, [x, y, 0]);
      // Normalize: 1.5m (normal) → 0 cost, accuracy_m → 1.0 cost
      const normalized = Math.max(0, (accuracy - 1.5) / Math.max(gz.accuracy_m - 1.5, 1));
      cost += normalized * this.config.gpsWeight;
    }

    // Isolation cost: distance from nearest teammate
    if (this.state.fleetPositions.length > 0) {
      let minDist = Infinity;
      for (const fp of this.state.fleetPositions) {
        const d = Math.sqrt((x - fp[0]) ** 2 + (y - fp[1]) ** 2);
        if (d > 1) minDist = Math.min(minDist, d);  // exclude self (d > 1m)
      }
      if (minDist < Infinity) {
        const isolationFrac = Math.min(1, minDist / this.config.maxCommsRange);
        cost += isolationFrac * this.config.isolationWeight;
      }
    }

    // Bounds cost: penalty for being outside operational area
    const [bMin, bMax] = this.state.operationalBounds;
    const margin = 50; // soft margin outside bounds
    if (x < bMin[0]) cost += Math.min(1, (bMin[0] - x) / margin) * this.config.boundsWeight;
    if (x > bMax[0]) cost += Math.min(1, (x - bMax[0]) / margin) * this.config.boundsWeight;
    if (y < bMin[1]) cost += Math.min(1, (bMin[1] - y) / margin) * this.config.boundsWeight;
    if (y > bMax[1]) cost += Math.min(1, (y - bMax[1]) / margin) * this.config.boundsWeight;

    return cost;
  }

  /** Is this position passable? (Not inside a building or NFZ) */
  isPassable(x: number, y: number): boolean {
    return !this._inBuilding(x, y) && !this._inNFZ(x, y);
  }

  /**
   * Approximate gradient of the cost field at (x, y).
   * Points in the direction of INCREASING cost.
   * To move toward safety, go OPPOSITE to the gradient.
   */
  gradient(x: number, y: number): [number, number] {
    const eps = 2; // meters for finite difference
    const cx = this.query(x, y);
    const dx = (this._safeQuery(x + eps, y) - this._safeQuery(x - eps, y)) / (2 * eps);
    const dy = (this._safeQuery(x, y + eps) - this._safeQuery(x, y - eps)) / (2 * eps);
    return [dx, dy];
  }

  /** Query that returns a capped value instead of Infinity (for gradient computation). */
  private _safeQuery(x: number, y: number): number {
    const c = this.query(x, y);
    return c === Infinity ? 10 : c;
  }

  private _inBuilding(x: number, y: number): boolean {
    for (const b of this.state.buildings) {
      const hx = b.size[0] / 2, hy = b.size[1] / 2;
      if (x >= b.center[0] - hx && x <= b.center[0] + hx &&
          y >= b.center[1] - hy && y <= b.center[1] + hy) {
        return true;
      }
    }
    return false;
  }

  private _inNFZ(x: number, y: number): boolean {
    for (const nfz of this.state.nfzs) {
      const [min, max] = nfz.bounds;
      if (x >= min[0] && x <= max[0] && y >= min[1] && y <= max[1]) {
        return true;
      }
    }
    return false;
  }
}
