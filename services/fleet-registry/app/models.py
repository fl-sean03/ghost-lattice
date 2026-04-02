"""Fleet registry data models."""

from pydantic import BaseModel


class VehicleCapability(BaseModel):
    vehicle_id: str
    vendor: str
    type: str
    payloads: list[str]
    roles_eligible: list[str]
    battery_wh: float
    max_speed_ms: float
    comms_range_m: float
    nav_modes: list[str]
    px4_instance: int
    spawn_pose: list[float]


class FleetComposition(BaseModel):
    vehicles: list[VehicleCapability]
    vendor_count: int
    total_vehicles: int
    available_roles: list[str]
    available_payloads: list[str]
