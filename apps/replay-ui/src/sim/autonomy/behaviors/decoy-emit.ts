import { Behavior, type VehicleState, type BehaviorResult, type ThreatContext } from "../behavior";
import type { Vec3 } from "../../ddil/link-model";
import type { NetworkResult } from "../../ddil/network-graph";
import type { SimContext } from "../../context";

/**
 * Decoy behavior: figure-8 pattern at edge of search sector.
 * Position derived from search bounds, not hardcoded.
 */
export class DecoyEmit extends Behavior {
  private cx = 90;
  private cy = 150;
  private radius = 35;
  private altitude = -20;

  configure(ctx: SimContext): void {
    // Position decoy at the near edge of the search sector (between base and sector)
    const [min, max] = ctx.searchBounds;
    this.cx = min[0] - 20; // Just outside the search sector
    this.cy = (min[1] + max[1]) / 2; // Vertically centered
    this.radius = Math.min(40, (max[1] - min[1]) * 0.1);
    this.altitude = ctx.altitudes.decoy ?? -20;
  }

  tick(_state: VehicleState, _fleet: Map<string, VehicleState>, _network: NetworkResult | null, _threats?: ThreatContext): BehaviorResult {
    return this.tickWithTime(Date.now() / 1000);
  }

  tickWithTime(simTime: number): BehaviorResult {
    const x = this.cx + this.radius * Math.cos(simTime * 0.12);
    const y = this.cy + this.radius * Math.sin(simTime * 0.24) * 0.6;
    return { target: [x, y, this.altitude], yaw: null };
  }
}
