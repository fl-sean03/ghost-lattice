import { Behavior, type VehicleState, type BehaviorResult } from "../behavior";
import type { NetworkResult } from "../../ddil/network-graph";

/** Emergency: return to base station. */
export class ReturnAnchor extends Behavior {
  tick(_state: VehicleState, _fleet: Map<string, VehicleState>, _network: NetworkResult | null): BehaviorResult {
    return { target: [0, 0, -20], yaw: null };
  }
}
