"""Validate scenario YAML files against the JSON schema."""

import json
from pathlib import Path

import jsonschema
import yaml

SCHEMA_PATH = Path(__file__).parent.parent / "schema" / "scenario.schema.json"
SCENARIOS_DIR = Path(__file__).parent.parent


def load_schema():
    with open(SCHEMA_PATH) as f:
        return json.load(f)


def load_scenario(path: Path):
    with open(path) as f:
        return yaml.safe_load(f)


def test_mission_001_validates():
    schema = load_schema()
    scenario = load_scenario(SCENARIOS_DIR / "mission_001.yaml")
    jsonschema.validate(instance=scenario, schema=schema)


def test_mission_001_has_minimum_fleet():
    scenario = load_scenario(SCENARIOS_DIR / "mission_001.yaml")
    assert len(scenario["fleet"]) >= 4, "Fleet must have at least 4 vehicles"


def test_mission_001_has_heterogeneous_vendors():
    scenario = load_scenario(SCENARIOS_DIR / "mission_001.yaml")
    vendors = {v["vendor"] for v in scenario["fleet"]}
    assert len(vendors) >= 2, "Fleet must have at least 2 different vendors"


def test_mission_001_has_disruptions():
    scenario = load_scenario(SCENARIOS_DIR / "mission_001.yaml")
    assert len(scenario["disruptions"]) >= 3, "Scenario must have at least 3 disruptions"


def test_mission_001_disruption_times_within_duration():
    scenario = load_scenario(SCENARIOS_DIR / "mission_001.yaml")
    duration = scenario["duration_sec"]
    for d in scenario["disruptions"]:
        assert d["t"] <= duration, f"Disruption at t={d['t']} exceeds duration {duration}"


def test_mission_001_scoring_weights_sum_to_one():
    scenario = load_scenario(SCENARIOS_DIR / "mission_001.yaml")
    scoring = scenario["scoring"]
    total = sum(scoring.values())
    assert abs(total - 1.0) < 0.01, f"Scoring weights sum to {total}, expected 1.0"


def test_mission_001_unique_vehicle_ids():
    scenario = load_scenario(SCENARIOS_DIR / "mission_001.yaml")
    ids = [v["id"] for v in scenario["fleet"]]
    assert len(ids) == len(set(ids)), "Vehicle IDs must be unique"


def test_mission_001_spawn_poses_no_overlap():
    scenario = load_scenario(SCENARIOS_DIR / "mission_001.yaml")
    poses = [(v["spawn_pose"][0], v["spawn_pose"][1]) for v in scenario["fleet"]]
    assert len(poses) == len(set(poses)), "Spawn positions must not overlap"


def test_all_scenarios_validate():
    """Validate all .yaml files in the scenarios directory."""
    schema = load_schema()
    for path in SCENARIOS_DIR.glob("*.yaml"):
        scenario = load_scenario(path)
        jsonschema.validate(instance=scenario, schema=schema)
