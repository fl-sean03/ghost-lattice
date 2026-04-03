import { Behavior, type VehicleState, type BehaviorResult, type ThreatContext } from "../behavior";
import type { NetworkResult } from "../../ddil/network-graph";

/** Reserve behavior: hold position, minimize movement to conserve battery. */
export class ConserveEnergy extends Behavior {
  private holdPos: [number, number, number] | null = null;

  onEnter(state: VehicleState): void {
    this.holdPos = [state.position[0], state.position[1], -35];
  }

  tick(state: VehicleState, _fleet: Map<string, VehicleState>, _network: NetworkResult | null, _threats?: ThreatContext): BehaviorResult {
    if (!this.holdPos) this.holdPos = [state.position[0], state.position[1], -35];
    return { target: this.holdPos, yaw: null };
  }
}
