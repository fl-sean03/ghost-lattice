/**
 * Utility-based role allocator.
 * Ported from ros2_ws/src/role_allocator/role_allocator/allocator_node.py
 * Stripped of all ROS2 — pure decision-making logic.
 */

import type { VehicleState } from "./behavior";
import type { NetworkResult } from "../ddil/network-graph";

// Utility weights
const W_HEALTH = 0.20;
const W_POSITION = 0.25;
const W_SENSOR = 0.20;
const W_LINK = 0.20;
const W_BATTERY = 0.15;

const ROLE_SENSOR_PREFS: Record<string, string[]> = {
  scout: ["rgb_camera"],
  relay: ["comms_relay"],
  tracker: ["rgb_camera"],
  reserve: [],
  decoy: ["ew_emitter"],
  edge_anchor: ["comms_relay"],
};

const ROLE_LINK_IMPORTANCE: Record<string, number> = {
  scout: 0.3, relay: 1.0, tracker: 0.5,
  reserve: 0.2, decoy: 0.4, edge_anchor: 0.8,
};

export interface RoleChange {
  vehicleId: string;
  oldRole: string;
  newRole: string;
  trigger: string;
  utility: number;
}

export interface VehicleCapabilities {
  payloads: string[];
  roles_eligible: string[];
  comms_range: number;
}

export function computeUtility(
  vehicle: VehicleState,
  role: string,
  caps: VehicleCapabilities,
): number {
  // Health score
  const health = vehicle.battery_pct / 100;

  // Position advantage
  const dist = Math.sqrt(vehicle.position[0] ** 2 + vehicle.position[1] ** 2);
  let posAdv: number;
  if (["scout", "tracker", "decoy"].includes(role)) {
    posAdv = Math.min(1, dist / 200); // far out is good
  } else if (["relay", "edge_anchor"].includes(role)) {
    posAdv = Math.max(0, 1 - dist / 200); // central is good
  } else {
    posAdv = 0.5;
  }

  // Sensor suitability
  const preferred = ROLE_SENSOR_PREFS[role] ?? [];
  let sensorScore = 0.5;
  if (preferred.length > 0) {
    sensorScore = preferred.filter(p => caps.payloads.includes(p)).length / preferred.length;
  }

  // Link utility
  const linkImportance = ROLE_LINK_IMPORTANCE[role] ?? 0.5;
  const linkUtil = Math.min(1, caps.comms_range / 1000) * linkImportance;

  // Battery cost
  const batteryCost = (1 - health) * (["scout", "relay"].includes(role) ? 0.8 : 0.3);

  return Math.round((
    W_HEALTH * health +
    W_POSITION * posAdv +
    W_SENSOR * sensorScore +
    W_LINK * linkUtil -
    W_BATTERY * batteryCost
  ) * 10000) / 10000;
}

/**
 * Run role allocation across all active vehicles.
 * Returns a map of vehicleId -> role and a list of changes.
 */
export function allocateRoles(
  vehicles: Map<string, VehicleState>,
  capabilities: Map<string, VehicleCapabilities>,
  network: NetworkResult | null,
  currentRoles: Map<string, string>,
  trigger: string,
  activeEmitterCount = 0,
): { roles: Map<string, string>; changes: RoleChange[] } {
  const activeIds = [...vehicles.keys()].filter(id => vehicles.get(id)!.alive);
  if (activeIds.length === 0) return { roles: new Map(), changes: [] };

  // Compute utility for each (vehicle, role) pair
  const bids: Array<{ utility: number; vehicleId: string; role: string }> = [];
  for (const id of activeIds) {
    const v = vehicles.get(id)!;
    const caps = capabilities.get(id);
    if (!caps) continue;
    for (const role of caps.roles_eligible) {
      const utility = computeUtility(v, role, caps);
      bids.push({ utility, vehicleId: id, role });
    }
  }

  // Sort by utility descending
  bids.sort((a, b) => b.utility - a.utility);

  // Greedy assignment with role limits
  const assigned = new Map<string, string>();
  const roleCount = new Map<string, number>();

  // Role limits: max number of vehicles per role
  const partitioned = network && network.partition_count > 1;
  const numActive = activeIds.length;
  const ROLE_LIMITS: Record<string, number> = {
    relay: partitioned ? 2 : 1,
    tracker: activeEmitterCount > 0 ? Math.min(2, Math.ceil(numActive / 4)) : 0,  // no tracker if no emitters
    decoy: 1,
    edge_anchor: partitioned ? 1 : 0,  // only assign edge_anchor when partitioned
    scout: numActive,  // unlimited scouts — the default productive role
    reserve: 0,        // don't actively assign reserve — use scout fallback instead
  };

  for (const bid of bids) {
    if (assigned.has(bid.vehicleId)) continue;
    const count = roleCount.get(bid.role) ?? 0;
    const limit = ROLE_LIMITS[bid.role] ?? 1;
    if (count >= limit) continue;
    assigned.set(bid.vehicleId, bid.role);
    roleCount.set(bid.role, count + 1);
  }

  // Unassigned -> scout (prefer scouting over idle reserve)
  for (const id of activeIds) {
    if (!assigned.has(id)) assigned.set(id, "scout");
  }

  // Compute changes
  const changes: RoleChange[] = [];
  for (const [id, newRole] of assigned) {
    const oldRole = currentRoles.get(id) ?? "";
    if (oldRole !== newRole) {
      const caps = capabilities.get(id);
      const v = vehicles.get(id)!;
      changes.push({
        vehicleId: id,
        oldRole,
        newRole,
        trigger,
        utility: caps ? computeUtility(v, newRole, caps) : 0,
      });
    }
  }

  return { roles: assigned, changes };
}
