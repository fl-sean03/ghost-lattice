import { Behavior, type VehicleState, type BehaviorResult, type ThreatContext } from "../behavior";
import type { Vec3 } from "../../ddil/link-model";
import type { NetworkResult } from "../../ddil/network-graph";

function triangleWave(t: number, period: number): number {
  const phase = ((t % period) + period) % period / period;
  return 1 - Math.abs(2 * phase - 1);
}

/**
 * Scout behavior: sweeps search sector in parallel lanes.
 * Avoids jammer zones by deflecting target position away from threats.
 */
export class FanOutSearch extends Behavior {
  private laneY = 100;
  private searchBounds: [[number, number], [number, number]] = [[100, 30], [380, 270]];

  onEnter(state: VehicleState): void {
    const lanes: Record<string, number> = {
      alpha_1: 60, alpha_2: 120, bravo_1: 180, bravo_2: 80, charlie_2: 200,
    };
    this.laneY = lanes[this.vehicleId] ?? 100;
  }

  tick(state: VehicleState, _fleet: Map<string, VehicleState>, _network: NetworkResult | null, threats?: ThreatContext): BehaviorResult {
    return this.tickWithTime(Date.now() / 1000, state, threats);
  }

  tickWithTime(simTime: number, state: VehicleState, threats?: ThreatContext): BehaviorResult {
    const speed = state.max_speed * 0.6;
    const [minXY, maxXY] = this.searchBounds;
    const rangeX = maxXY[0] - minXY[0];
    const sweepPeriod = (rangeX * 2) / Math.max(speed * 0.5, 1);

    let x = minXY[0] + rangeX * triangleWave(simTime, sweepPeriod);
    let y = this.laneY + 12 * Math.sin(simTime * 0.08);
    y = Math.max(minXY[1], Math.min(maxXY[1], y));

    // Avoid jammer zones: push target away from jammer centers
    if (threats) {
      for (const jammer of threats.jammers) {
        const dx = x - jammer.center[0];
        const dy = y - jammer.center[1];
        const dist = Math.sqrt(dx * dx + dy * dy);
        const avoidRadius = jammer.radius_m * 1.3;
        if (dist < avoidRadius && dist > 0.1) {
          const pushStrength = (avoidRadius - dist) / avoidRadius;
          x += (dx / dist) * pushStrength * 80;
          y += (dy / dist) * pushStrength * 80;
        }
      }
      x = Math.max(minXY[0], Math.min(maxXY[0], x));
      y = Math.max(minXY[1], Math.min(maxXY[1], y));
    }

    return { target: [x, y, -30], yaw: null };
  }

  setSearchBounds(bounds: [[number, number], [number, number]]): void {
    this.searchBounds = bounds;
  }
}
