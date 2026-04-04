/**
 * Preset scenarios that demonstrate different swarm capabilities.
 * Each scenario defines a unique environment — the same autonomy
 * stack produces fundamentally different behavior in each one.
 */

import { type ScenarioConfig, DEFAULT_CONFIG } from "./config";
import type { Vec3 } from "./ddil/link-model";

export interface ScenarioPreset {
  id: string;
  name: string;
  description: string;
  /** Threats that auto-deploy at specific sim times. [] = user deploys manually. */
  scheduledThreats: Array<{
    time: number;
    type: "jammer" | "gps" | "emitter" | "kill";
    position: Vec3;
    radius?: number;
    target?: string; // vehicle ID for kill
    label: string;
  }>;
  config: ScenarioConfig;
}

function makeFleet(count: number, base: Vec3 = [0, 0, 0]): ScenarioConfig["fleet"] {
  const templates = DEFAULT_CONFIG.fleet;
  const fleet: ScenarioConfig["fleet"] = [];
  for (let i = 0; i < count; i++) {
    const tmpl = templates[i % templates.length];
    fleet.push({
      ...tmpl,
      id: count <= 6 ? tmpl.id : `drone_${i}`,
      spawn_pose: [base[0] + (i % 4) * 3, base[1] + Math.floor(i / 4) * 3, 0],
    });
  }
  return fleet;
}

// ─── 1. Default Mission ────────────────────────────────────────────────────

export const SCENARIO_DEFAULT: ScenarioPreset = {
  id: "default",
  name: "Default Mission",
  description: "6 mixed-vendor drones, open search sector, mobile emitter. Place threats manually to test swarm response.",
  scheduledThreats: [],
  config: DEFAULT_CONFIG,
};

// ─── 2. Urban ISR ──────────────────────────────────────────────────────────

export const SCENARIO_URBAN: ScenarioPreset = {
  id: "urban_isr",
  name: "Urban ISR",
  description: "Dense building environment with rooftop jammer. Drones must navigate streets and maintain relay chain through obstacles.",
  scheduledThreats: [
    { time: 20, type: "jammer", position: [220, 160, 0], radius: 100, label: "Rooftop jammer activates" },
    { time: 60, type: "emitter", position: [300, 200, 0], label: "Mobile target spotted" },
  ],
  config: {
    ...DEFAULT_CONFIG,
    scenario_id: "urban_isr",
    world_features: {
      ...DEFAULT_CONFIG.world_features,
      buildings: [
        { id: "b1", center: [150, 80, 8], size: [40, 30, 16] },
        { id: "b2", center: [200, 150, 10], size: [30, 50, 20] },
        { id: "b3", center: [280, 120, 6], size: [25, 40, 12] },
        { id: "b4", center: [180, 230, 9], size: [45, 25, 18] },
        { id: "b5", center: [320, 200, 7], size: [35, 35, 14] },
        { id: "b6", center: [250, 260, 5], size: [20, 30, 10] },
        { id: "b7", center: [130, 180, 8], size: [30, 20, 16] },
        { id: "b8", center: [350, 80, 6], size: [25, 25, 12] },
      ],
      search_sectors: [{ id: "urban_sector", bounds: [[100, 40], [380, 280]] }],
    },
  },
};

// ─── 3. Contested Airspace ─────────────────────────────────────────────────

export const SCENARIO_CONTESTED: ScenarioPreset = {
  id: "contested",
  name: "Contested Airspace",
  description: "Multiple jammers activate progressively. GPS denial zone. Moving adversary emitter. The swarm must adapt to escalating threats.",
  scheduledThreats: [
    { time: 15, type: "jammer", position: [200, 120, 0], radius: 120, label: "Jammer 1 activates" },
    { time: 40, type: "gps", position: [300, 150, 0], radius: 100, label: "GPS denial zone detected" },
    { time: 60, type: "jammer", position: [150, 220, 0], radius: 100, label: "Jammer 2 activates" },
    { time: 80, type: "emitter", position: [350, 100, 0], label: "Adversary emitter detected" },
    { time: 100, type: "kill", position: [0, 0, 0], target: "bravo_2", label: "Bravo-2 hit by EW attack" },
    { time: 130, type: "jammer", position: [300, 250, 0], radius: 80, label: "Jammer 3 activates" },
  ],
  config: {
    ...DEFAULT_CONFIG,
    scenario_id: "contested",
    duration_sec: 200,
  },
};

// ─── 4. Open Field Patrol ──────────────────────────────────────────────────

export const SCENARIO_OPEN_FIELD: ScenarioPreset = {
  id: "open_field",
  name: "Open Field Patrol",
  description: "Wide open area, minimal buildings. Long-range jammer tests how the swarm handles a large denial zone. Focus on coverage efficiency.",
  scheduledThreats: [
    { time: 30, type: "jammer", position: [240, 150, 0], radius: 200, label: "Long-range jammer activates — huge denial zone" },
  ],
  config: {
    ...DEFAULT_CONFIG,
    scenario_id: "open_field",
    world_features: {
      ...DEFAULT_CONFIG.world_features,
      buildings: [], // no buildings
      search_sectors: [{ id: "wide_sector", bounds: [[50, 20], [420, 300]] }],
    },
  },
};

// ─── 5. Search and Rescue ──────────────────────────────────────────────────

export const SCENARIO_SAR: ScenarioPreset = {
  id: "search_rescue",
  name: "Search & Rescue",
  description: "No adversaries. Pure coverage mission with 8 drones. GPS-denied canyon area. Maximize search coverage with limited battery.",
  scheduledThreats: [
    { time: 10, type: "gps", position: [250, 130, 0], radius: 80, label: "Canyon GPS shadow detected" },
  ],
  config: {
    ...DEFAULT_CONFIG,
    scenario_id: "search_rescue",
    fleet: makeFleet(8),
    duration_sec: 240,
    world_features: {
      ...DEFAULT_CONFIG.world_features,
      buildings: [
        { id: "ridge1", center: [200, 100, 15], size: [120, 10, 30] },
        { id: "ridge2", center: [200, 180, 12], size: [100, 10, 24] },
      ],
      mobile_emitters: [], // no threats
      search_sectors: [{ id: "canyon", bounds: [[120, 50], [350, 250]] }],
    },
  },
};

// ─── 6. Progressive Degradation ────────────────────────────────────────────

export const SCENARIO_PROGRESSIVE: ScenarioPreset = {
  id: "progressive",
  name: "Progressive Degradation",
  description: "Starts clean. Every 30 seconds, a new threat is added. Watch the swarm degrade gracefully — not collapse.",
  scheduledThreats: [
    { time: 30, type: "jammer", position: [200, 130, 0], radius: 100, label: "Phase 1: Jammer online" },
    { time: 60, type: "gps", position: [300, 100, 0], radius: 120, label: "Phase 2: GPS denied" },
    { time: 90, type: "kill", position: [0, 0, 0], target: "alpha_1", label: "Phase 3: Alpha-1 lost" },
    { time: 120, type: "jammer", position: [150, 200, 0], radius: 100, label: "Phase 4: Second jammer" },
    { time: 150, type: "kill", position: [0, 0, 0], target: "charlie_2", label: "Phase 5: Charlie-2 lost" },
    { time: 180, type: "emitter", position: [280, 180, 0], label: "Phase 6: Adversary emitter" },
  ],
  config: {
    ...DEFAULT_CONFIG,
    scenario_id: "progressive",
    duration_sec: 240,
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
