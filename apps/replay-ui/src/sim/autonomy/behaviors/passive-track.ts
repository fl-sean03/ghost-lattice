import { Behavior, type VehicleState, type BehaviorResult, type ThreatContext } from "../behavior";
import type { Vec3 } from "../../ddil/link-model";
import type { NetworkResult } from "../../ddil/network-graph";
import type { SimContext } from "../../context";

const STANDOFF = 30;

/**
 * Tracker behavior: follows a target at standoff distance.
 * Default target is search centroid (not hardcoded position).
 */
export class PassiveTrack extends Behavior {
  private targetPos: Vec3 | null = null;
  private lastKnown: Vec3 = [200, 150, 0]; // Will be overridden by configure()
  private altitude = -25;

  configure(ctx: SimContext): void {
    // Default to search centroid if no emitter assigned
    this.lastKnown = [ctx.searchCentroid[0], ctx.searchCentroid[1], 0];
    this.altitude = ctx.altitudes.tracker ?? -25;
  }

  tick(state: VehicleState, _fleet: Map<string, VehicleState>, _network: NetworkResult | null, _threats?: ThreatContext): BehaviorResult {
    return this.tickWithTime(Date.now() / 1000, state);
  }

  updateTarget(pos: Vec3): void {
    this.targetPos = pos;
    this.lastKnown = pos;
  }

  tickWithTime(simTime: number, state: VehicleState): BehaviorResult {
    const emitter = this.targetPos ?? this.lastKnown;
    const orbitR = 25;
    const tx = emitter[0] + orbitR * Math.cos(simTime * 0.1);
    const ty = emitter[1] + orbitR * Math.sin(simTime * 0.1);
    return { target: [tx, ty, this.altitude], yaw: null };
  }
}
