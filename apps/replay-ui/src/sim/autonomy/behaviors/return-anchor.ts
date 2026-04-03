import { Behavior, type VehicleState, type BehaviorResult, type ThreatContext } from "../behavior";
import type { NetworkResult } from "../../ddil/network-graph";
import type { SimContext } from "../../context";
import type { Vec3 } from "../../ddil/link-model";

/** Emergency: return to base station (from config, not hardcoded). */
export class ReturnAnchor extends Behavior {
  private base: Vec3 = [0, 0, -20];

  configure(ctx: SimContext): void {
    this.base = [ctx.baseStation[0], ctx.baseStation[1], ctx.altitudes.return_anchor ?? -20];
  }

  tick(_state: VehicleState, _fleet: Map<string, VehicleState>, _network: NetworkResult | null, _threats?: ThreatContext): BehaviorResult {
    return { target: this.base, yaw: null };
  }
}
