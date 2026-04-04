/**
 * TaskExecutor — follows a waypoint path through an assigned sub-region.
 *
 * Replaces FieldGuidedBehavior for scouts. Instead of sampling random
 * positions every 0.5 seconds, it follows a deterministic sweep path
 * and uses the cost field ONLY for obstacle avoidance.
 *
 * Behavior:
 * 1. Receive a list of waypoints from TaskDecomposer's sweep path
 * 2. Fly toward the next waypoint
 * 3. If the path is blocked (cost > threshold), deflect around the obstacle
 * 4. When reaching a waypoint, advance to the next one
 * 5. When all waypoints are visited, loop back to the start (continuous patrol)
 *
 * Re-tasking (new waypoints) happens only on events:
 * - Drone killed (TaskDecomposer re-partitions)
 * - Jammer placed/removed (sub-region changes)
 * - Operator redirect
 *
 * Works disconnected: continues last known waypoint path independently.
 */

import { Behavior, type VehicleState, type BehaviorResult, type ThreatContext } from "../behavior";
import type { Vec3 } from "../../ddil/link-model";
import type { NetworkResult } from "../../ddil/network-graph";
import { CostField } from "../cost-field";
import type { SimContext } from "../../context";
import type { SubRegion } from "../task-decomposer";

const WAYPOINT_REACHED_DIST = 15; // meters — how close before advancing to next waypoint
const AVOIDANCE_CHECK_DIST = 40; // meters ahead to check for obstacles

export class TaskExecutor extends Behavior {
  private waypoints: Array<[number, number]> = [];
  private waypointIndex = 0;
  private altitude = -30;
  private region: SubRegion | null = null;

  // Injected by engine each tick
  costField: CostField | null = null;

  constructor(vehicleId: string) {
    super(vehicleId);
  }

  configure(ctx: SimContext): void {
    this.altitude = ctx.altitudes.scout ?? -30;
  }

  /** Assign a new sub-region with waypoints. Called on re-decomposition events. */
  assignRegion(region: SubRegion, waypoints: Array<[number, number]>): void {
    this.region = region;
    this.waypoints = waypoints;
    // Start from the waypoint nearest to current position
    // (don't reset to 0 — might be mid-sweep)
    this.waypointIndex = 0;
  }

  /** Find the nearest waypoint to start from (used after reassignment). */
  startFromNearest(currentPos: [number, number]): void {
    if (this.waypoints.length === 0) return;
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < this.waypoints.length; i++) {
      const d = Math.sqrt(
        (this.waypoints[i][0] - currentPos[0]) ** 2 +
        (this.waypoints[i][1] - currentPos[1]) ** 2
      );
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    this.waypointIndex = bestIdx;
  }

  onEnter(state: VehicleState): void {
    if (this.waypoints.length > 0) {
      this.startFromNearest([state.position[0], state.position[1]]);
    }
  }

  tick(
    state: VehicleState,
    _fleet: Map<string, VehicleState>,
    _network: NetworkResult | null,
    _threats?: ThreatContext,
  ): BehaviorResult {
    if (this.waypoints.length === 0) {
      // No waypoints — hold position
      return { target: [state.position[0], state.position[1], this.altitude], yaw: null };
    }

    const wp = this.waypoints[this.waypointIndex];
    let targetX = wp[0];
    let targetY = wp[1];

    // Check if we've reached the current waypoint
    const dx = targetX - state.position[0];
    const dy = targetY - state.position[1];
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < WAYPOINT_REACHED_DIST) {
      // Advance to next waypoint (loop back to 0 for continuous patrol)
      this.waypointIndex = (this.waypointIndex + 1) % this.waypoints.length;
      const nextWp = this.waypoints[this.waypointIndex];
      targetX = nextWp[0];
      targetY = nextWp[1];
    }

    // Obstacle avoidance: check if the path ahead is blocked
    if (this.costField) {
      const lookAhead = Math.min(AVOIDANCE_CHECK_DIST, dist);
      if (dist > 1) {
        const checkX = state.position[0] + (dx / dist) * lookAhead;
        const checkY = state.position[1] + (dy / dist) * lookAhead;
        const aheadCost = this.costField.query(checkX, checkY);

        if (aheadCost > 0.4) {
          // Path ahead is dangerous — deflect perpendicular to obstacle
          // Try both left and right, pick the lower-cost option
          const perpX = -dy / dist; // perpendicular direction
          const perpY = dx / dist;
          const deflectDist = 40;

          const leftX = state.position[0] + perpX * deflectDist + (dx / dist) * 20;
          const leftY = state.position[1] + perpY * deflectDist + (dy / dist) * 20;
          const rightX = state.position[0] - perpX * deflectDist + (dx / dist) * 20;
          const rightY = state.position[1] - perpY * deflectDist + (dy / dist) * 20;

          const leftCost = this.costField.query(leftX, leftY);
          const rightCost = this.costField.query(rightX, rightY);

          if (leftCost < rightCost && leftCost < aheadCost) {
            targetX = leftX;
            targetY = leftY;
          } else if (rightCost < aheadCost) {
            targetX = rightX;
            targetY = rightY;
          }
          // If both sides are worse, continue straight (best of bad options)
        }
      }
    }

    return { target: [targetX, targetY, this.altitude], yaw: null };
  }
}
