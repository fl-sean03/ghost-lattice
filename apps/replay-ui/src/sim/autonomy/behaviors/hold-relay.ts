import { Behavior, type VehicleState, type BehaviorResult } from "../behavior";
import type { Vec3 } from "../../ddil/link-model";
import type { NetworkResult } from "../../ddil/network-graph";

const BASE: Vec3 = [0, 0, 0];

/**
 * Relay behavior: holds position between base and fleet centroid
 * to maximize connectivity backbone.
 */
export class HoldRelay extends Behavior {
  private target: Vec3 = [55, 80, -40];

  onEnter(): void {
    this.target = [55, 80, -40];
  }

  tick(state: VehicleState, fleet: Map<string, VehicleState>, _network: NetworkResult | null): BehaviorResult {
    let cx = 0, cy = 0, count = 0;
    for (const [id, vs] of fleet) {
      if (id !== this.vehicleId && vs.alive) {
        cx += vs.position[0];
        cy += vs.position[1];
        count++;
      }
    }

    if (count > 0) {
      cx /= count;
      cy /= count;
      this.target = [(BASE[0] + cx) / 2, (BASE[1] + cy) / 2, -40];
    }

    return { target: this.target, yaw: null };
  }
}
