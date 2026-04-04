/**
 * SimContext — shared configuration context for all autonomy modules.
 * Eliminates hardcoded mission_001 values from behaviors and allocator.
 * Derived from ScenarioConfig at engine initialization.
 */

import type { Vec3 } from "./ddil/link-model";
import type { ScenarioConfig } from "./config";

export interface SimContext {
  /** Base station position (behaviors use for relay midpoint, RTH target). */
  baseStation: Vec3;

  /** Search sector bounds [[minX, minY], [maxX, maxY]]. */
  searchBounds: [[number, number], [number, number]];

  /** Search sector centroid (for utility position scoring). */
  searchCentroid: [number, number];

  /** Per-role cruise altitudes (NED, negative = up). */
  altitudes: Record<string, number>;

  /** Per-role battery drain per tick (% per tick). */
  drainRates: Record<string, number>;

  /** Battery threshold for automatic RTH (%). */
  rthBatteryThreshold: number;

  /** Scoring weights (must sum to ~1.0). */
  scoringWeights: {
    coverage: number;
    relay: number;
    tracking: number;
    recovery: number;
    autonomy: number;
  };

  /** Total fleet size (for scoring initialization). */
  fleetSize: number;

  /** Default cost field weights. */
  costWeights: {
    jammer: number;
    gps: number;
    isolation: number;
    bounds: number;
  };

  /**
   * Per-role cost weight overrides.
   * Scouts use NEGATIVE isolation (reward being far from fleet).
   * Relay uses POSITIVE isolation (stay near fleet).
   * Tracker uses near-zero isolation (follow target, ignore fleet distance).
   */
  roleCostOverrides: Record<string, Partial<{ jammer: number; gps: number; isolation: number; bounds: number }>>;

  /** Ticks between behavior replans. */
  replanInterval: number;
}

/** Build SimContext from a ScenarioConfig. */
export function buildContext(config: ScenarioConfig): SimContext {
  const sector = config.world_features.search_sectors[0];
  const bounds: [[number, number], [number, number]] = sector
    ? sector.bounds
    : [[100, 30], [380, 270]]; // Only used if config truly empty

  const centroid: [number, number] = [
    (bounds[0][0] + bounds[1][0]) / 2,
    (bounds[0][1] + bounds[1][1]) / 2,
  ];

  return {
    baseStation: config.world_features.base_station?.position ?? [0, 0, 0],
    searchBounds: bounds,
    searchCentroid: centroid,

    altitudes: {
      scout: -30,
      relay: -40,
      tracker: -25,
      decoy: -20,
      reserve: -35,
      edge_anchor: -40,
      return_anchor: -20,
    },

    drainRates: {
      scout: 0.028,       // ~84% drain in 300s → hits RTH around T=200s
      relay: 0.018,       // ~54% drain
      tracker: 0.024,     // ~72% drain
      decoy: 0.020,       // ~60% drain
      reserve: 0.010,     // ~30% drain
      edge_anchor: 0.018,
      return_anchor: 0.012,
    },

    rthBatteryThreshold: 20,  // 20% — enough juice to make it home

    scoringWeights: {
      coverage: 0.30,
      relay: 0.20,
      tracking: 0.20,
      recovery: 0.15,
      autonomy: 0.15,
    },

    fleetSize: config.fleet.length,

    costWeights: {
      jammer: 0.8,    // strong avoidance — drones should exit jammer zones
      gps: 0.35,      // moderate avoidance
      isolation: 0.2,  // reduced — don't cluster just for connectivity
      bounds: 0.3,     // moderate — stay in ops area but don't get stuck at edges
    },

    // Per-role isolation behavior:
    // Positive isolation = penalize being far from fleet (stay close)
    // Negative isolation = REWARD being far from fleet (spread out)
    // Zero = ignore fleet distance entirely
    roleCostOverrides: {
      scout:        { isolation: -0.25 },  // scouts WANT to be far apart
      relay:        { isolation: 0.4 },    // relay needs to stay near fleet
      tracker:      { isolation: 0.0, jammer: 0.3 },  // tracker follows emitter, less jammer fear
      decoy:        { isolation: -0.15 },  // decoy wants to be away from scouts
      reserve:      { isolation: 0.3 },    // reserve stays near base/fleet
      edge_anchor:  { isolation: 0.35 },   // edge anchor bridges partitions
      return_anchor:{ isolation: 0.0, jammer: 0.0 },  // RTH ignores everything, just go home
    },

    replanInterval: 5,
  };
}
