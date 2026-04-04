/**
 * Preset scenarios — each one tells a different story with a unique environment.
 * Every scenario has distinct fleet size, buildings, search sector, base position,
 * and threat profile. The same autonomy stack behaves differently in each.
 */

import { type ScenarioConfig, DEFAULT_CONFIG } from "./config";
import type { Vec3 } from "./ddil/link-model";

export interface ScenarioPreset {
  id: string;
  name: string;
  description: string;
  scheduledThreats: Array<{
    time: number;
    type: "jammer" | "gps" | "emitter" | "kill";
    position: Vec3;
    radius?: number;
    target?: string;
    label: string;
  }>;
  config: ScenarioConfig;
}

function makeVehicle(id: string, vendor: string, type: string, spawn: Vec3, payloads: string[], roles: string[], battery: number, speed: number, comms: number) {
  return { id, vendor, type, spawn_pose: spawn, payloads, roles_eligible: roles, battery_wh: battery, max_speed_ms: speed, comms_range_m: comms };
}

// ─── 1. Default Mission (sandbox) ──────────────────────────────────────────

export const SCENARIO_DEFAULT: ScenarioPreset = {
  id: "default",
  name: "Default Mission",
  description: "6 mixed-vendor drones. Open sector with mobile emitter. Place threats manually to test swarm response.",
  scheduledThreats: [],
  config: DEFAULT_CONFIG,
};

// ─── 2. Urban ISR ──────────────────────────────────────────────────────────

export const SCENARIO_URBAN: ScenarioPreset = {
  id: "urban_isr",
  name: "Urban ISR",
  description: "8 drones in a dense city block. Rooftop jammer at T+20s. Mobile target at T+60s. Navigate streets, maintain relay chain.",
  scheduledThreats: [
    { time: 20, type: "jammer", position: [220, 160, 0], radius: 100, label: "Rooftop jammer activates" },
    { time: 60, type: "emitter", position: [300, 200, 0], label: "Mobile target spotted in alley" },
  ],
  config: {
    scenario_id: "urban_isr",
    duration_sec: 240,
    random_seed: 101,
    fleet: [
      makeVehicle("hawk_1", "vendor_a", "quad_medium", [10, 10, 0], ["rgb_camera", "comms_relay"], ["scout", "relay", "tracker"], 180, 15, 800),
      makeVehicle("hawk_2", "vendor_a", "quad_medium", [13, 10, 0], ["rgb_camera"], ["scout", "tracker", "reserve"], 180, 15, 800),
      makeVehicle("sparrow_1", "vendor_b", "quad_light", [10, 13, 0], ["rgb_camera", "ew_emitter"], ["scout", "decoy", "edge_anchor"], 150, 18, 600),
      makeVehicle("sparrow_2", "vendor_b", "quad_light", [13, 13, 0], ["rgb_camera"], ["scout", "tracker", "reserve"], 150, 18, 600),
      makeVehicle("eagle_1", "vendor_c", "quad_heavy", [10, 16, 0], ["lidar_2d", "comms_relay"], ["relay", "edge_anchor", "reserve"], 200, 12, 1000),
      makeVehicle("eagle_2", "vendor_c", "quad_heavy", [13, 16, 0], ["rgb_camera"], ["scout", "tracker", "decoy"], 200, 12, 1000),
      makeVehicle("raven_1", "vendor_a", "quad_medium", [16, 10, 0], ["rgb_camera"], ["scout", "reserve"], 180, 15, 800),
      makeVehicle("raven_2", "vendor_b", "quad_light", [16, 13, 0], ["rgb_camera"], ["scout", "tracker"], 150, 18, 600),
    ],
    world_features: {
      search_sectors: [{ id: "city_block", bounds: [[80, 30], [380, 280]] }],
      no_fly_zones: [{ id: "hospital", bounds: [[300, 240], [360, 280]] }],
      buildings: [
        { id: "apt_1", center: [130, 70, 8], size: [40, 30, 16] },
        { id: "apt_2", center: [200, 60, 12], size: [30, 40, 24] },
        { id: "office", center: [280, 110, 10], size: [50, 35, 20] },
        { id: "warehouse", center: [170, 160, 6], size: [60, 30, 12] },
        { id: "tower", center: [320, 190, 15], size: [25, 25, 30] },
        { id: "mall", center: [240, 240, 8], size: [70, 40, 16] },
        { id: "parking", center: [130, 230, 4], size: [40, 35, 8] },
        { id: "church", center: [350, 70, 10], size: [20, 30, 20] },
      ],
      mobile_emitters: [],
      base_station: { position: [10, 10, 0] },
    },
  },
};

// ─── 3. Contested Airspace ─────────────────────────────────────────────────

export const SCENARIO_CONTESTED: ScenarioPreset = {
  id: "contested",
  name: "Contested Airspace",
  description: "6 drones face escalating threats. 3 jammers + GPS denial + EW kill. Terrain with scattered cover. The swarm must survive.",
  scheduledThreats: [
    { time: 15, type: "jammer", position: [200, 120, 0], radius: 120, label: "Jammer 1 — north sector" },
    { time: 40, type: "gps", position: [300, 180, 0], radius: 100, label: "GPS denial zone detected" },
    { time: 60, type: "jammer", position: [140, 220, 0], radius: 100, label: "Jammer 2 — south sector" },
    { time: 80, type: "emitter", position: [350, 100, 0], label: "Adversary emitter detected" },
    { time: 100, type: "kill", position: [0, 0, 0], target: "bravo_2", label: "Bravo-2 hit by EW attack" },
    { time: 130, type: "jammer", position: [300, 260, 0], radius: 80, label: "Jammer 3 — east sector" },
  ],
  config: {
    scenario_id: "contested",
    duration_sec: 200,
    random_seed: 202,
    fleet: DEFAULT_CONFIG.fleet, // standard 6-drone fleet
    world_features: {
      search_sectors: [{ id: "contested_zone", bounds: [[80, 40], [400, 290]] }],
      no_fly_zones: [],
      buildings: [
        { id: "bunker_1", center: [160, 90, 3], size: [20, 15, 6] },
        { id: "bunker_2", center: [280, 200, 3], size: [15, 20, 6] },
        { id: "comm_tower", center: [350, 150, 12], size: [10, 10, 24] },
      ],
      mobile_emitters: [],
      base_station: { position: [0, 0, 0] },
    },
  },
};

// ─── 4. Open Field Patrol ──────────────────────────────────────────────────

export const SCENARIO_OPEN_FIELD: ScenarioPreset = {
  id: "open_field",
  name: "Open Field Patrol",
  description: "4 long-range drones over wide terrain. No buildings. Massive jammer at T+30s. Maximum coverage with minimal assets.",
  scheduledThreats: [
    { time: 30, type: "jammer", position: [240, 150, 0], radius: 130, label: "Long-range jammer — 130m radius denial zone" },
  ],
  config: {
    scenario_id: "open_field",
    duration_sec: 300,
    random_seed: 303,
    fleet: [
      makeVehicle("patrol_1", "vendor_c", "quad_heavy", [0, 0, 0], ["rgb_camera", "comms_relay"], ["scout", "relay"], 220, 14, 1200),
      makeVehicle("patrol_2", "vendor_c", "quad_heavy", [3, 0, 0], ["rgb_camera"], ["scout", "tracker", "reserve"], 220, 14, 1200),
      makeVehicle("patrol_3", "vendor_c", "quad_heavy", [0, 3, 0], ["rgb_camera", "comms_relay"], ["scout", "relay", "edge_anchor"], 220, 14, 1200),
      makeVehicle("patrol_4", "vendor_c", "quad_heavy", [3, 3, 0], ["rgb_camera"], ["scout", "tracker", "decoy"], 220, 14, 1200),
    ],
    world_features: {
      search_sectors: [{ id: "wide_field", bounds: [[30, 10], [440, 310]] }],
      no_fly_zones: [],
      buildings: [],
      mobile_emitters: [],
      base_station: { position: [0, 0, 0] },
    },
  },
};

// ─── 5. Search and Rescue ──────────────────────────────────────────────────

export const SCENARIO_SAR: ScenarioPreset = {
  id: "search_rescue",
  name: "Search & Rescue",
  description: "10 drones, canyon terrain with GPS shadow. No adversaries. Maximize coverage to find missing persons. Battery is critical.",
  scheduledThreats: [
    { time: 5, type: "gps", position: [230, 130, 0], radius: 90, label: "Canyon GPS shadow — navigation degraded" },
  ],
  config: {
    scenario_id: "search_rescue",
    duration_sec: 240,
    random_seed: 404,
    fleet: [
      makeVehicle("sar_1", "vendor_a", "quad_medium", [20, 280, 0], ["rgb_camera", "comms_relay"], ["scout", "relay"], 200, 16, 900),
      makeVehicle("sar_2", "vendor_a", "quad_medium", [23, 280, 0], ["rgb_camera"], ["scout", "reserve"], 200, 16, 900),
      makeVehicle("sar_3", "vendor_b", "quad_light", [26, 280, 0], ["rgb_camera"], ["scout", "tracker"], 160, 20, 700),
      makeVehicle("sar_4", "vendor_b", "quad_light", [29, 280, 0], ["rgb_camera"], ["scout", "reserve"], 160, 20, 700),
      makeVehicle("sar_5", "vendor_c", "quad_heavy", [20, 283, 0], ["lidar_2d", "comms_relay"], ["relay", "scout"], 240, 12, 1100),
      makeVehicle("sar_6", "vendor_a", "quad_medium", [23, 283, 0], ["rgb_camera"], ["scout", "reserve"], 200, 16, 900),
      makeVehicle("sar_7", "vendor_b", "quad_light", [26, 283, 0], ["rgb_camera"], ["scout", "tracker"], 160, 20, 700),
      makeVehicle("sar_8", "vendor_c", "quad_heavy", [29, 283, 0], ["rgb_camera", "comms_relay"], ["relay", "scout", "edge_anchor"], 240, 12, 1100),
      makeVehicle("sar_9", "vendor_a", "quad_medium", [32, 280, 0], ["rgb_camera"], ["scout", "reserve"], 200, 16, 900),
      makeVehicle("sar_10", "vendor_b", "quad_light", [32, 283, 0], ["rgb_camera"], ["scout"], 160, 20, 700),
    ],
    world_features: {
      search_sectors: [{ id: "canyon", bounds: [[80, 30], [380, 260]] }],
      no_fly_zones: [{ id: "cliff_edge", bounds: [[380, 0], [450, 300]] }],
      buildings: [
        { id: "ridge_north", center: [230, 80, 15], size: [180, 8, 30] },
        { id: "ridge_south", center: [230, 200, 12], size: [160, 8, 24] },
        { id: "boulder_1", center: [150, 140, 5], size: [15, 15, 10] },
        { id: "boulder_2", center: [310, 140, 4], size: [12, 12, 8] },
      ],
      mobile_emitters: [],
      base_station: { position: [20, 280, 0] }, // base at south edge of canyon
    },
  },
};

// ─── 6. Progressive Degradation ────────────────────────────────────────────

export const SCENARIO_PROGRESSIVE: ScenarioPreset = {
  id: "progressive",
  name: "Progressive Degradation",
  description: "Starts clean with 6 drones. New threat every 30s for 3 minutes. Watch the swarm degrade gracefully — not collapse.",
  scheduledThreats: [
    { time: 30, type: "jammer", position: [200, 130, 0], radius: 100, label: "Phase 1: Jammer deployed at sector center" },
    { time: 60, type: "gps", position: [300, 100, 0], radius: 120, label: "Phase 2: GPS denial in east sector" },
    { time: 90, type: "kill", position: [0, 0, 0], target: "alpha_1", label: "Phase 3: Alpha-1 destroyed" },
    { time: 120, type: "jammer", position: [150, 200, 0], radius: 100, label: "Phase 4: Second jammer — west sector" },
    { time: 150, type: "kill", position: [0, 0, 0], target: "charlie_2", label: "Phase 5: Charlie-2 destroyed" },
    { time: 180, type: "emitter", position: [280, 180, 0], label: "Phase 6: Adversary emitter detected" },
  ],
  config: {
    scenario_id: "progressive",
    duration_sec: 240,
    random_seed: 505,
    fleet: DEFAULT_CONFIG.fleet,
    world_features: {
      search_sectors: [{ id: "test_sector", bounds: [[80, 20], [400, 280]] }],
      no_fly_zones: [],
      buildings: [
        { id: "structure_1", center: [180, 100, 6], size: [25, 20, 12] },
        { id: "structure_2", center: [300, 200, 5], size: [20, 25, 10] },
      ],
      mobile_emitters: [],
      base_station: { position: [0, 0, 0] },
    },
  },
};

// ─── All scenarios ─────────────────────────────────────────────────────────

export const ALL_SCENARIOS: ScenarioPreset[] = [
  SCENARIO_DEFAULT,
  SCENARIO_URBAN,
  SCENARIO_CONTESTED,
  SCENARIO_OPEN_FIELD,
  SCENARIO_SAR,
  SCENARIO_PROGRESSIVE,
];
