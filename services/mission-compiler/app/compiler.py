"""
Mission Compiler

Reads a scenario YAML file and compiles it into executable task primitives.
Assigns initial vehicle-to-task mappings based on capability matching.
"""

from pathlib import Path

import yaml

from .models import (
    Scenario,
    CompiledMission,
    SearchTask,
    RelayTask,
    TrackTask,
    FallbackPolicy,
)


def load_scenario(path: str | Path) -> Scenario:
    """Load and validate a scenario YAML file."""
    with open(path) as f:
        data = yaml.safe_load(f)
    return Scenario(**data)


def compile_mission(scenario: Scenario, run_id: str) -> CompiledMission:
    """Compile a scenario into executable task primitives."""
    search_tasks = []
    relay_tasks = []
    track_tasks = []

    for obj in scenario.objectives:
        if obj.type == "area_search":
            # Find vehicles eligible for scout role
            scout_eligible = [
                v.id for v in scenario.fleet if "scout" in v.roles_eligible
            ]
            search_tasks.append(SearchTask(
                task_id=f"task_{obj.id}",
                region=obj.region,
                priority=obj.priority,
                min_coverage_pct=obj.min_coverage_pct,
                assigned_vehicles=scout_eligible[:3],  # Initial assignment
            ))

        elif obj.type == "maintain_relay":
            relay_eligible = [
                v.id for v in scenario.fleet if "relay" in v.roles_eligible
            ]
            # Prefer vehicles with comms_relay payload
            relay_with_payload = [
                v.id for v in scenario.fleet
                if "relay" in v.roles_eligible and "comms_relay" in v.payloads
            ]
            relay_tasks.append(RelayTask(
                task_id=f"task_{obj.id}",
                min_links=obj.min_links,
                priority=obj.priority,
                assigned_vehicles=relay_with_payload or relay_eligible[:1],
            ))

        elif obj.type == "track_emitter":
            tracker_eligible = [
                v.id for v in scenario.fleet if "tracker" in v.roles_eligible
            ]
            track_tasks.append(TrackTask(
                task_id=f"task_{obj.id}",
                target_id=obj.target_id,
                min_duration_sec=obj.min_track_duration_sec,
                priority=obj.priority,
                assigned_vehicles=tracker_eligible[:1],
            ))

    return CompiledMission(
        scenario_id=scenario.scenario_id,
        run_id=run_id,
        search_tasks=search_tasks,
        relay_tasks=relay_tasks,
        track_tasks=track_tasks,
        fallback_policy=FallbackPolicy(),
        scoring=scenario.scoring,
        disruption_schedule=scenario.disruptions,
        fleet_size=len(scenario.fleet),
        duration_sec=scenario.duration_sec,
    )


def main():
    """CLI entry point for testing."""
    import json
    import sys

    path = sys.argv[1] if len(sys.argv) > 1 else "/data/scenarios/mission_001.yaml"
    run_id = sys.argv[2] if len(sys.argv) > 2 else "run_test"

    scenario = load_scenario(path)
    mission = compile_mission(scenario, run_id)

    print(json.dumps(mission.model_dump(), indent=2))


if __name__ == "__main__":
    main()
