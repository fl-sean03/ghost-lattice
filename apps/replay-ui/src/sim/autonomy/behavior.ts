/**
 * Base behavior interface for drone state machines.
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

/** Threat zones that behaviors can react to. */
export interface ThreatContext {
  jammers: Array<{ center: Vec3; radius_m: number }>;
  gpsZones: Array<{ center: Vec3; radius_m: number }>;
}

export abstract class Behavior {
  constructor(public readonly vehicleId: string) {}
  abstract tick(state: VehicleState, fleet: Map<string, VehicleState>, network: NetworkResult | null, threats?: ThreatContext): BehaviorResult;
  onEnter(_state: VehicleState): void {}
  onExit(): void {}
}
