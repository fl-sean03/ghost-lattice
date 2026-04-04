/** Shared test factories — used across all test files. */

import type { VehicleState } from "@/sim/autonomy/behavior";
import type { VehicleCapabilities } from "@/sim/autonomy/allocator";
import type { SimContext } from "@/sim/context";
import type { NetworkResult } from "@/sim/ddil/network-graph";
import type { Vec3 } from "@/sim/ddil/link-model";
import { buildContext } from "@/sim/context";
import { DEFAULT_CONFIG } from "@/sim/config";

export function makeVehicle(id: string, overrides: Partial<VehicleState> = {}): VehicleState {
  return {
    id, position: [100, 100, -30], velocity: [0, 0, 0], heading: 0,
    role: "scout", battery_pct: 90, max_speed: 15, comms_range: 800,
    payloads: ["rgb_camera"], alive: true, ...overrides,
  };
}

export function makeCaps(overrides: Partial<VehicleCapabilities> = {}): VehicleCapabilities {
  return { payloads: ["rgb_camera"], roles_eligible: ["scout", "tracker", "reserve"], comms_range: 800, ...overrides };
}

export function makeContext(overrides: Partial<SimContext> = {}): SimContext {
  return { ...buildContext(DEFAULT_CONFIG), ...overrides };
}

export function makeFleet(positions: Record<string, Vec3>): Map<string, VehicleState> {
  const fleet = new Map<string, VehicleState>();
  for (const [id, pos] of Object.entries(positions)) {
    fleet.set(id, makeVehicle(id, { position: pos }));
  }
  return fleet;
}

export function makeNetwork(partitions: string[][], edges: NetworkResult["edges"] = []): NetworkResult {
  return { edges, partitions, partition_count: partitions.length };
}
