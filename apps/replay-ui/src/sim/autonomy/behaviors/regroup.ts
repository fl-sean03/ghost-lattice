import { Behavior, type VehicleState, type BehaviorResult } from "../behavior";
import type { Vec3 } from "../../ddil/link-model";
import type { NetworkResult } from "../../ddil/network-graph";

/**
 * Regroup behavior: move toward disconnected vehicles to restore connectivity.
 */
export class Regroup extends Behavior {
  private regroupTarget: Vec3 | null = null;

  onEnter(state: VehicleState): void {
    this.regroupTarget = [state.position[0] * 0.7, state.position[1] * 0.7, -35];
  }

  tick(state: VehicleState, fleet: Map<string, VehicleState>, network: NetworkResult | null): BehaviorResult {
    if (network && network.partition_count > 1) {
      const myPartition = network.partitions.find(p => p.includes(this.vehicleId));
      if (myPartition) {
        const otherPositions: Vec3[] = [];
        for (const [id, vs] of fleet) {
          if (!myPartition.includes(id) && vs.alive) {
            otherPositions.push(vs.position);
          }
        }
        if (otherPositions.length > 0) {
          const cx = otherPositions.reduce((s, p) => s + p[0], 0) / otherPositions.length;
          const cy = otherPositions.reduce((s, p) => s + p[1], 0) / otherPositions.length;
          this.regroupTarget = [
            state.position[0] + (cx - state.position[0]) * 0.3,
            state.position[1] + (cy - state.position[1]) * 0.3,
            -35,
          ];
        }
      }
    }

    return { target: this.regroupTarget ?? [0, 0, -35], yaw: null };
  }
}
