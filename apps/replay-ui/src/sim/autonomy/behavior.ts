/**
 * Base behavior interface for drone state machines.
 * Ported from ros2_ws/src/behavior_engine/behavior_engine/behaviors/base.py
 */

import type { Vec3 } from "../ddil/link-model";
import type { NetworkResult } from "../ddil/network-graph";

export interface VehicleState {
  id: string;
  position: Vec3;
  velocity: Vec3;
  heading: number;
  role: string;
  battery_pct: number;
  max_speed: number;
  comms_range: number;
  payloads: string[];
  alive: boolean;
}

export interface BehaviorResult {
  target: Vec3;
  yaw: number | null;
}

export abstract class Behavior {
  constructor(public readonly vehicleId: string) {}
  abstract tick(state: VehicleState, fleet: Map<string, VehicleState>, network: NetworkResult | null): BehaviorResult;
  onEnter(_state: VehicleState): void {}
  onExit(): void {}
}
