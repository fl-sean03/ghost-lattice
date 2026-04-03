import { Behavior, type VehicleState, type BehaviorResult, type ThreatContext } from "../behavior";
import type { NetworkResult } from "../../ddil/network-graph";
import type { SimContext } from "../../context";

/** Reserve behavior: hold position, minimize movement. */
export class ConserveEnergy extends Behavior {
  private holdPos: [number, number, number] | null = null;
  private altitude = -35;

  configure(ctx: SimContext): void {
    this.altitude = ctx.altitudes.reserve ?? -35;
  }

  onEnter(state: VehicleState): void {
    this.holdPos = [state.position[0], state.position[1], this.altitude];
  }

  tick(state: VehicleState, _fleet: Map<string, VehicleState>, _network: NetworkResult | null, _threats?: ThreatContext): BehaviorResult {
    if (!this.holdPos) this.holdPos = [state.position[0], state.position[1], this.altitude];
    return { target: this.holdPos, yaw: null };
  }
}
