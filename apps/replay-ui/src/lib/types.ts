// Ghost Lattice event types for the replay UI

export interface VehicleStatePayload {
  position_ned: [number, number, number];
  velocity_ned: [number, number, number];
  heading_rad: number;
  current_role: string;
  battery_pct: number;
  battery_wh_remaining: number;
  armed: boolean;
  flight_mode: string;
}

export interface NetworkEdge {
  src: string;
  dst: string;
  quality: number;
  latency_ms: number;
  active: boolean;
}

export interface NetworkStatePayload {
  edges: NetworkEdge[];
  partitions: string[][];
  partition_count: number;
}

export interface RoleAssignmentPayload {
  old_role: string;
  new_role: string;
  reason: {
    trigger: string;
    link_score_gain: number;
    battery_ok: boolean;
    position_advantage: number;
    utility_delta: number;
  };
  auction_round: number;
}

export interface ScenarioEventPayload {
  disruption_type: string;
  disruption_id: string;
  region: string;
  center: [number, number, number];
  radius_m: number;
  strength_dbm: number;
  target: string;
  affected_entities: string[];
  scheduled_end_t: number;
}

export interface MissionMetricPayload {
  metric_name: string;
  value: number;
  unit: string;
  delta_since_last: number;
}

export interface OperatorActionPayload {
  action_type: string;
  target: string | null;
  source: string;
  reason: string;
  parameters: Record<string, string>;
}

export interface ObjectiveStatePayload {
  objective_id: string;
  objective_type: string;
  progress_pct: number;
  status: string;
  assigned_vehicles: string[];
  degraded: boolean;
  degradation_reason: string;
}

export interface GhostEvent {
  ts: string;
  run_id: string;
  seq: number;
  event_type: string;
  entity_id: string | null;
  payload: Record<string, unknown>;
}

export interface RunMetadata {
  run_id: string;
  scenario_id: string;
  started_at: string;
  completed_at: string;
  duration_sec: number;
  vehicle_count: number;
  random_seed: number;
  status: string;
}

export interface Scorecard {
  run_id: string;
  scenario_id: string;
  search_coverage_pct: number;
  relay_uptime_pct: number;
  track_continuity_sec: number;
  mission_completion_pct: number;
  operator_intervention_count: number;
  recovery_time_partition_sec: number;
  recovery_time_node_loss_sec: number;
  battery_efficiency: number;
  path_efficiency: number;
  active_vehicles_final: number;
  duration_sec: number;
  composite_score: number;
}

// Snapshot of the world at a given time
export interface WorldSnapshot {
  time: number;
  vehicles: Map<string, VehicleStatePayload>;
  network: NetworkStatePayload | null;
  activeDisruptions: ScenarioEventPayload[];
  metrics: Map<string, number>;
}

export const ROLE_COLORS: Record<string, string> = {
  scout: "#3b82f6",    // blue
  relay: "#22c55e",    // green
  tracker: "#f59e0b",  // amber
  reserve: "#6b7280",  // gray
  decoy: "#ef4444",    // red
  edge_anchor: "#8b5cf6", // purple
};

export const VEHICLE_LABELS: Record<string, string> = {
  alpha_1: "A1", alpha_2: "A2",
  bravo_1: "B1", bravo_2: "B2",
  charlie_1: "C1", charlie_2: "C2",
};
