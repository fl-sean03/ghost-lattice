"""Tests for the fleet registry — no simulation required."""

from pathlib import Path
import pytest

from app.registry import FleetRegistry

SCENARIO_PATH = Path(__file__).parent.parent.parent.parent / "data" / "scenarios" / "mission_001.yaml"


@pytest.fixture
def registry() -> FleetRegistry:
    r = FleetRegistry()
    r.load_from_scenario(SCENARIO_PATH)
    return r


def test_load_all_vehicles(registry):
    assert len(registry.get_all()) == 6


def test_get_vehicle_by_id(registry):
    v = registry.get_vehicle("alpha_1")
    assert v is not None
    assert v.vendor == "vendor_a"
    assert v.type == "quad_medium"


def test_get_vehicles_by_role(registry):
    scouts = registry.get_by_role("scout")
    assert len(scouts) >= 4  # Most vehicles can scout


def test_get_vehicles_by_payload(registry):
    relay_capable = registry.get_by_payload("comms_relay")
    assert len(relay_capable) >= 2  # alpha_1 and charlie_1


def test_composition_has_three_vendors(registry):
    comp = registry.get_composition()
    assert comp.vendor_count == 3


def test_composition_roles(registry):
    comp = registry.get_composition()
    assert "scout" in comp.available_roles
    assert "relay" in comp.available_roles
    assert "decoy" in comp.available_roles


def test_vehicle_comms_ranges_differ(registry):
    ranges = {v.comms_range_m for v in registry.get_all()}
    assert len(ranges) >= 2, "Heterogeneous fleet should have different comms ranges"
