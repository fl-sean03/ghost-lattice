"""Pydantic models for scenario parsing and task compilation."""

from pydantic import BaseModel, Field


class VehicleDef(BaseModel):
    id: str
    vendor: str
    type: str
    px4_autostart: int
    px4_model: str
    spawn_pose: list[float] = Field(min_length=6, max_length=6)
    payloads: list[str]
    roles_eligible: list[str]
    battery_wh: float
    max_speed_ms: float
    comms_range_m: float
    nav_modes: list[str] = []


class Objective(BaseModel):
    id: str
    type: str  # area_search, maintain_relay, track_emitter
    priority: int
    region: str = ""
    target_id: str = ""
    min_coverage_pct: float = 0.0
    min_links: int = 0
    min_track_duration_sec: float = 0.0


class Disruption(BaseModel):
    t: float
    type: str
    id: str = ""
    target: str = ""
    region: str = ""
    center: list[float] = [0.0, 0.0, 0.0]
    radius_m: float = 0.0
    strength_dbm: float = 0.0
    accuracy_m: float = 0.0
    duration_sec: float = 0.0
    mode: str = ""
    recoverable: bool = True


class ScoringWeights(BaseModel):
    search_coverage_weight: float
    relay_uptime_weight: float
    track_continuity_weight: float
    recovery_speed_weight: float
    operator_intervention_penalty: float


class Scenario(BaseModel):
    scenario_id: str
    version: str = "1.0"
    world: str
    duration_sec: int
    random_seed: int = 42
    fleet: list[VehicleDef]
    objectives: list[Objective]
    disruptions: list[Disruption]
    scoring: ScoringWeights


# --- Compiled task primitives ---

class SearchTask(BaseModel):
    task_id: str
    type: str = "search"
    region: str
    priority: int
    min_coverage_pct: float
    assigned_vehicles: list[str] = []


class RelayTask(BaseModel):
    task_id: str
    type: str = "relay"
    min_links: int
    priority: int
    assigned_vehicles: list[str] = []


class TrackTask(BaseModel):
    task_id: str
    type: str = "track"
    target_id: str
    min_duration_sec: float
    priority: int
    assigned_vehicles: list[str] = []


class FallbackPolicy(BaseModel):
    on_partition: str = "reassign_relay"
    on_node_loss: str = "redistribute_roles"
    on_gps_degrade: str = "switch_nav_mode"
    on_battery_low: str = "return_to_anchor"


class CompiledMission(BaseModel):
    scenario_id: str
    run_id: str
    search_tasks: list[SearchTask]
    relay_tasks: list[RelayTask]
    track_tasks: list[TrackTask]
    fallback_policy: FallbackPolicy
    scoring: ScoringWeights
    disruption_schedule: list[Disruption]
    fleet_size: int
    duration_sec: int
