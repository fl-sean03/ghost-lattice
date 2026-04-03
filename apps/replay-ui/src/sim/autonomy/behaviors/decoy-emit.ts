import { Behavior, type VehicleState, type BehaviorResult, type ThreatContext } from "../behavior";
import type { Vec3 } from "../../ddil/link-model";
import type { NetworkResult } from "../../ddil/network-graph";

/**
 * Decoy behavior: figure-8 pattern to create a convincing movement signature.
 */
export class DecoyEmit extends Behavior {
  private cx = 90;
  private cy = 150;
  private radius = 35;

  tick(_state: VehicleState, _fleet: Map<string, VehicleState>, _network: NetworkResult | null, _threats?: ThreatContext): BehaviorResult {
    const t = Date.now() / 1000;
    return this.tickWithTime(t);
  }

  tickWithTime(simTime: number): BehaviorResult {
    const x = this.cx + this.radius * Math.cos(simTime * 0.12);
    const y = this.cy + this.radius * Math.sin(simTime * 0.24) * 0.6;
    return { target: [x, y, -20], yaw: null };
  }
}
