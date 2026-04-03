import { Behavior, type VehicleState, type BehaviorResult, type ThreatContext } from "../behavior";
import type { Vec3 } from "../../ddil/link-model";
import type { NetworkResult } from "../../ddil/network-graph";
import type { SimContext } from "../../context";

/**
 * Relay behavior: holds position between base and fleet centroid.
 * Base station and altitude come from SimContext, not hardcoded.
 */
export class HoldRelay extends Behavior {
  private target: Vec3 = [55, 80, -40];
  private base: Vec3 = [0, 0, 0];
  private altitude = -40;

  configure(ctx: SimContext): void {
    this.base = ctx.baseStation;
    this.altitude = ctx.altitudes.relay ?? -40;
    this.target = [this.base[0] + 55, this.base[1] + 80, this.altitude];
  }

  onEnter(): void {
    // Keep current target from configure()
  }

  tick(state: VehicleState, fleet: Map<string, VehicleState>, network: NetworkResult | null, _threats?: ThreatContext): BehaviorResult {
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

      // If network is partitioned, position toward the largest partition's centroid
      if (network && network.partition_count > 1) {
        const myPartition = network.partitions.find(p => p.includes(this.vehicleId));
        const otherPartitions = network.partitions.filter(p => p !== myPartition);
        if (otherPartitions.length > 0 && myPartition) {
          // Position between my partition centroid and nearest other partition
          const myCx = myPartition.reduce((s, id) => s + (fleet.get(id)?.position[0] ?? 0), 0) / myPartition.length;
          const myCy = myPartition.reduce((s, id) => s + (fleet.get(id)?.position[1] ?? 0), 0) / myPartition.length;
          const otherCx = otherPartitions[0].reduce((s, id) => s + (fleet.get(id)?.position[0] ?? 0), 0) / otherPartitions[0].length;
          const otherCy = otherPartitions[0].reduce((s, id) => s + (fleet.get(id)?.position[1] ?? 0), 0) / otherPartitions[0].length;
          this.target = [(myCx + otherCx) / 2, (myCy + otherCy) / 2, this.altitude];
          return { target: this.target, yaw: null };
        }
      }

      // Normal: midpoint between base and fleet centroid
      this.target = [(this.base[0] + cx) / 2, (this.base[1] + cy) / 2, this.altitude];
    }

    return { target: this.target, yaw: null };
  }
}
