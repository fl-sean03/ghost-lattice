import { Behavior, type VehicleState, type BehaviorResult } from "../behavior";
import type { Vec3 } from "../../ddil/link-model";
import type { NetworkResult } from "../../ddil/network-graph";

/** Triangle wave: 0→1→0→1 continuously. */
function triangleWave(t: number, period: number): number {
  const phase = ((t % period) + period) % period / period;
  return 1 - Math.abs(2 * phase - 1);
}

/**
 * Scout behavior: sweeps search sector in parallel lanes.
 * Uses triangle wave (back-and-forth) to avoid teleport wrapping.
 */
export class FanOutSearch extends Behavior {
  private laneY = 100;
  private searchBounds: [[number, number], [number, number]] = [[100, 30], [380, 270]];

  onEnter(state: VehicleState): void {
    // Assign unique lane based on vehicle ID hash
    const lanes: Record<string, number> = {
      alpha_1: 60, alpha_2: 120, bravo_1: 180, bravo_2: 80, charlie_2: 200,
    };
    this.laneY = lanes[this.vehicleId] ?? 100;
  }

  tick(state: VehicleState, _fleet: Map<string, VehicleState>, _network: NetworkResult | null): BehaviorResult {
    const speed = state.max_speed * 0.6;
    const [minXY, maxXY] = this.searchBounds;
    const rangeX = maxXY[0] - minXY[0];
    const sweepPeriod = (rangeX * 2) / Math.max(speed * 0.5, 1);

    // Time since behavior was first activated (use position as proxy for phase)
    const phaseT = Date.now() / 1000; // Will be replaced by sim time
    const x = minXY[0] + rangeX * triangleWave(phaseT, sweepPeriod);
    const y = this.laneY + 12 * Math.sin(phaseT * 0.08);

    return { target: [x, Math.max(minXY[1], Math.min(maxXY[1], y)), -30], yaw: null };
  }

  /** Called by SimEngine with actual sim time. */
  tickWithTime(simTime: number, state: VehicleState): BehaviorResult {
    const speed = state.max_speed * 0.6;
    const [minXY, maxXY] = this.searchBounds;
    const rangeX = maxXY[0] - minXY[0];
    const sweepPeriod = (rangeX * 2) / Math.max(speed * 0.5, 1);

    const x = minXY[0] + rangeX * triangleWave(simTime, sweepPeriod);
    let y = this.laneY + 12 * Math.sin(simTime * 0.08);
    y = Math.max(minXY[1], Math.min(maxXY[1], y));

    return { target: [x, y, -30], yaw: null };
  }

  setSearchBounds(bounds: [[number, number], [number, number]]): void {
    this.searchBounds = bounds;
  }
}
