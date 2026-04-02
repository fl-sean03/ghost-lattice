"""
DDIL Engine API

FastAPI service providing network impairment computation.
Queried by the ddil_bridge ROS 2 node over HTTP.
"""

import os

from fastapi import FastAPI
from pydantic import BaseModel

from .network_graph import compute_network
from .jammer_model import JammerZone
from .gps_model import GPSDegradationZone

app = FastAPI(title="Ghost Lattice DDIL Engine", version="0.1.0")

# Active jammer zones (updated via API)
_jammers: dict[str, JammerZone] = {}
_gps_zones: dict[str, GPSDegradationZone] = {}
_buildings: list[dict] = []


class VehiclePosition(BaseModel):
    id: str
    position: list[float]  # [x, y, z]
    comms_range: float = 800.0


class NetworkRequest(BaseModel):
    vehicles: list[VehiclePosition]


class JammerRequest(BaseModel):
    id: str
    center: list[float]
    radius_m: float
    strength_dbm: float = -60.0
    active: bool = True


class GPSRequest(BaseModel):
    id: str
    center: list[float]
    radius_m: float
    accuracy_m: float = 50.0
    active: bool = True


class BuildingDef(BaseModel):
    center: list[float]
    size: list[float]


@app.get("/health")
def health():
    return {"status": "ok", "jammers": len(_jammers), "gps_zones": len(_gps_zones)}


@app.post("/network")
def compute_network_state(req: NetworkRequest):
    """Compute full network state for given vehicle positions."""
    vehicles = [
        {'id': v.id, 'position': v.position, 'comms_range': v.comms_range}
        for v in req.vehicles
    ]
    jammer_dicts = [j.to_dict() for j in _jammers.values()]

    result = compute_network(vehicles, _buildings, jammer_dicts)
    return result


@app.post("/jammers")
def set_jammer(req: JammerRequest):
    """Add or update a jammer zone."""
    _jammers[req.id] = JammerZone(**req.model_dump())
    return {"status": "ok", "active_jammers": len([j for j in _jammers.values() if j.active])}


@app.delete("/jammers/{jammer_id}")
def remove_jammer(jammer_id: str):
    """Remove a jammer zone."""
    _jammers.pop(jammer_id, None)
    return {"status": "ok"}


@app.post("/gps-zones")
def set_gps_zone(req: GPSRequest):
    """Add or update a GPS degradation zone."""
    _gps_zones[req.id] = GPSDegradationZone(**req.model_dump())
    return {"status": "ok"}


@app.delete("/gps-zones/{zone_id}")
def remove_gps_zone(zone_id: str):
    _gps_zones.pop(zone_id, None)
    return {"status": "ok"}


@app.post("/buildings")
def set_buildings(buildings: list[BuildingDef]):
    """Set the building list for LOS computation."""
    global _buildings
    _buildings = [{'center': b.center, 'size': b.size} for b in buildings]
    return {"status": "ok", "building_count": len(_buildings)}


@app.get("/gps-accuracy")
def get_gps_accuracy(x: float, y: float, z: float = 0.0):
    """Get GPS accuracy at a position."""
    import numpy as np
    pos = np.array([x, y, z])
    worst_accuracy = 1.5  # Normal GPS
    for zone in _gps_zones.values():
        acc = zone.degradation_at(pos)
        worst_accuracy = max(worst_accuracy, acc)
    return {"accuracy_m": round(worst_accuracy, 2)}
