/**
 * Scenario configuration types and default mission_001 config.
 */

import type { Vec3 } from "./ddil/link-model";

export interface VehicleConfig {
  id: string;
  vendor: string;
  type: string;
  spawn_pose: Vec3;
  payloads: string[];
  roles_eligible: string[];
  battery_wh: number;
  max_speed_ms: number;
  comms_range_m: number;
}

export interface ScenarioConfig {
  scenario_id: string;
  duration_sec: number;
  random_seed: number;
  fleet: VehicleConfig[];
  world_features: {
    search_sectors: { id: string; bounds: [[number, number], [number, number]] }[];
    no_fly_zones: { id: string; bounds: [[number, number], [number, number]] }[];
    buildings: { id: string; center: Vec3; size: Vec3 }[];
    mobile_emitters: { id: string; start_position: Vec3; velocity: Vec3; appears_at: number }[];
    base_station: { position: Vec3 };
  };
}

export const DEFAULT_CONFIG: ScenarioConfig = {
  scenario_id: "mission_001",
  duration_sec: 300,
  random_seed: 42,
  fleet: [
    { id: "alpha_1", vendor: "vendor_a", type: "quad_medium", spawn_pose: [0, 0, 0], payloads: ["rgb_camera", "comms_relay"], roles_eligible: ["scout", "relay", "tracker"], battery_wh: 180, max_speed_ms: 15, comms_range_m: 800 },
    { id: "alpha_2", vendor: "vendor_a", type: "quad_medium", spawn_pose: [3, 0, 0], payloads: ["rgb_camera"], roles_eligible: ["scout", "tracker", "reserve"], battery_wh: 180, max_speed_ms: 15, comms_range_m: 800 },
    { id: "bravo_1", vendor: "vendor_b", type: "quad_light", spawn_pose: [0, 3, 0], payloads: ["rgb_camera", "ew_emitter"], roles_eligible: ["scout", "decoy", "edge_anchor"], battery_wh: 150, max_speed_ms: 18, comms_range_m: 600 },
    { id: "bravo_2", vendor: "vendor_b", type: "quad_light", spawn_pose: [3, 3, 0], payloads: ["rgb_camera"], roles_eligible: ["scout", "tracker", "reserve"], battery_wh: 150, max_speed_ms: 18, comms_range_m: 600 },
    { id: "charlie_1", vendor: "vendor_c", type: "quad_heavy", spawn_pose: [0, 6, 0], payloads: ["lidar_2d", "rgb_camera", "comms_relay"], roles_eligible: ["relay", "edge_anchor", "reserve"], battery_wh: 200, max_speed_ms: 12, comms_range_m: 1000 },
    { id: "charlie_2", vendor: "vendor_c", type: "quad_heavy", spawn_pose: [3, 6, 0], payloads: ["rgb_camera"], roles_eligible: ["scout", "tracker", "decoy"], battery_wh: 200, max_speed_ms: 12, comms_range_m: 1000 },
  ],
  world_features: {
    search_sectors: [{ id: "sector_red", bounds: [[100, 30], [380, 270]] }],
    no_fly_zones: [{ id: "nfz_1", bounds: [[50, 200], [100, 250]] }],
    buildings: [
      { id: "bldg_1", center: [150, 100, 7.5], size: [30, 20, 15] },
      { id: "bldg_2", center: [250, 200, 10], size: [40, 15, 20] },
      { id: "bldg_3", center: [350, 50, 5], size: [20, 30, 10] },
    ],
    mobile_emitters: [
      { id: "emitter_1", start_position: [250, 180, 0], velocity: [0.3, -0.15, 0], appears_at: 30 },
    ],
    base_station: { position: [0, 0, 0] },
  },
};
