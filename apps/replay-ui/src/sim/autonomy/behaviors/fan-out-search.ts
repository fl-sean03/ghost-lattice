import { Behavior, type VehicleState, type BehaviorResult, type ThreatContext } from "../behavior";
import type { Vec3 } from "../../ddil/link-model";
import type { NetworkResult } from "../../ddil/network-graph";
import type { SimContext } from "../../context";

function triangleWave(t: number, period: number): number {
  const phase = ((t % period) + period) % period / period;
  return 1 - Math.abs(2 * phase - 1);
}

/**
 * Scout behavior: sweeps search sector in parallel lanes.
 * Lane assignment is dynamic based on scout index, not hardcoded vehicle IDs.
 * Avoids jammer zones by deflecting target position.
 */
export class FanOutSearch extends Behavior {
  private laneY = 100;
  private searchBounds: [[number, number], [number, number]] = [[100, 30], [380, 270]];
  private altitude = -30;
  private scoutIndex = 0;

  /** Call with the scout's index among all scouts (0, 1, 2...) */
  configure(scoutIndex: number, ctx: SimContext): void {
    this.searchBounds = ctx.searchBounds;
    this.altitude = ctx.altitudes.scout ?? -30;
    this.scoutIndex = scoutIndex;
    this._computeLane();
  }

  onEnter(_state: VehicleState): void {
    this._computeLane();
  }

  private _computeLane(): void {
    const [min, max] = this.searchBounds;
    const rangeY = max[1] - min[1];
    // Spread lanes evenly across the search sector Y range
    // Use scoutIndex to give each scout a unique lane
    const laneSpacing = rangeY / Math.max(6, this.scoutIndex + 2);
    this.laneY = min[1] + laneSpacing * (this.scoutIndex + 0.5);
  }

  tick(state: VehicleState, _fleet: Map<string, VehicleState>, _network: NetworkResult | null, threats?: ThreatContext): BehaviorResult {
    return this.tickWithTime(Date.now() / 1000, state, threats);
  }

  tickWithTime(simTime: number, state: VehicleState, threats?: ThreatContext): BehaviorResult {
    const speed = state.max_speed * 0.6;
    const [minXY, maxXY] = this.searchBounds;
    const rangeX = maxXY[0] - minXY[0];
    const sweepPeriod = (rangeX * 2) / Math.max(speed * 0.5, 1);

    let x = minXY[0] + rangeX * triangleWave(simTime + this.scoutIndex * 7, sweepPeriod);
    let y = this.laneY + 12 * Math.sin(simTime * 0.08);
    y = Math.max(minXY[1] + 10, Math.min(maxXY[1] - 10, y));

    // Avoid jammer/GPS zones
    if (threats) {
      for (const jammer of threats.jammers) {
        const dx = x - jammer.center[0];
        const dy = y - jammer.center[1];
        const dist = Math.sqrt(dx * dx + dy * dy);
        const avoidRadius = jammer.radius_m * 1.3;
        if (dist < avoidRadius && dist > 0.1) {
          const push = (avoidRadius - dist) / avoidRadius;
          x += (dx / dist) * push * 80;
          y += (dy / dist) * push * 80;
        }
      }
      for (const gz of threats.gpsZones) {
        const dx = x - gz.center[0];
        const dy = y - gz.center[1];
        const dist = Math.sqrt(dx * dx + dy * dy);
        const avoidRadius = gz.radius_m * 1.1;
        if (dist < avoidRadius && dist > 0.1) {
          const push = (avoidRadius - dist) / avoidRadius;
          x += (dx / dist) * push * 40;
          y += (dy / dist) * push * 40;
        }
      }
      x = Math.max(minXY[0], Math.min(maxXY[0], x));
      y = Math.max(minXY[1], Math.min(maxXY[1], y));
    }

    return { target: [x, y, this.altitude], yaw: null };
  }

  setSearchBounds(bounds: [[number, number], [number, number]]): void {
    this.searchBounds = bounds;
    this._computeLane();
  }
}
