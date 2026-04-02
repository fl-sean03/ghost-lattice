"""Tests for the mission compiler — no simulation required."""

from pathlib import Path

import yaml
import pytest

from app.models import Scenario, CompiledMission
from app.compiler import load_scenario, compile_mission

SCENARIO_PATH = Path(__file__).parent.parent.parent.parent / "data" / "scenarios" / "mission_001.yaml"


@pytest.fixture
def scenario() -> Scenario:
    return load_scenario(SCENARIO_PATH)


def test_load_scenario(scenario):
    assert scenario.scenario_id == "mission_001"
    assert len(scenario.fleet) == 6
    assert len(scenario.disruptions) == 3
    assert len(scenario.objectives) == 3


def test_fleet_has_heterogeneous_vendors(scenario):
    vendors = {v.vendor for v in scenario.fleet}
    assert len(vendors) == 3


def test_compile_produces_tasks(scenario):
    mission = compile_mission(scenario, "run_test")
    assert len(mission.search_tasks) >= 1
    assert len(mission.relay_tasks) >= 1
    assert len(mission.track_tasks) >= 1


def test_compile_assigns_vehicles(scenario):
    mission = compile_mission(scenario, "run_test")
    for task in mission.search_tasks:
        assert len(task.assigned_vehicles) > 0
    for task in mission.relay_tasks:
        assert len(task.assigned_vehicles) > 0


def test_compile_relay_prefers_payload_vehicles(scenario):
    mission = compile_mission(scenario, "run_test")
    for task in mission.relay_tasks:
        # Vehicles with comms_relay payload should be preferred
        relay_payload_vehicles = {
            v.id for v in scenario.fleet if "comms_relay" in v.payloads
        }
        assigned = set(task.assigned_vehicles)
        assert assigned & relay_payload_vehicles, "Relay task should prefer vehicles with comms_relay"


def test_compile_preserves_disruption_schedule(scenario):
    mission = compile_mission(scenario, "run_test")
    assert len(mission.disruption_schedule) == 3
    times = [d.t for d in mission.disruption_schedule]
    assert times == sorted(times)


def test_compile_scoring_weights_preserved(scenario):
    mission = compile_mission(scenario, "run_test")
    total = (
        mission.scoring.search_coverage_weight
        + mission.scoring.relay_uptime_weight
        + mission.scoring.track_continuity_weight
        + mission.scoring.recovery_speed_weight
        + mission.scoring.operator_intervention_penalty
    )
    assert abs(total - 1.0) < 0.01
