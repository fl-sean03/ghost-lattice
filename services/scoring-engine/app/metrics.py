"""
Mission metrics computation.

Computes all scoring metrics from event logs.
Can process either JSONL files or database query results.
"""

from pydantic import BaseModel


class Scorecard(BaseModel):
    run_id: str
    scenario_id: str
    search_coverage_pct: float = 0.0
    relay_uptime_pct: float = 0.0
    track_continuity_sec: float = 0.0
    mission_completion_pct: float = 0.0
    operator_intervention_count: int = 0
    recovery_time_partition_sec: float = 0.0
    recovery_time_node_loss_sec: float = 0.0
    battery_efficiency: float = 0.0
    path_efficiency: float = 0.0
    active_vehicles_final: int = 0
    duration_sec: float = 0.0
    composite_score: float = 0.0


def compute_scorecard(events: list[dict], run_id: str, scenario_id: str = "mission_001") -> Scorecard:
    """Compute a scorecard from a list of event dicts."""
    sc = Scorecard(run_id=run_id, scenario_id=scenario_id)

    # Extract events by type
    vehicle_states = [e for e in events if e.get('event_type') == 'vehicle_state']
    network_states = [e for e in events if e.get('event_type') == 'network_state']
    role_assignments = [e for e in events if e.get('event_type') == 'role_assignment']
    scenario_events = [e for e in events if e.get('event_type') == 'scenario_event']
    operator_actions = [e for e in events if e.get('event_type') == 'operator_action']
    objective_states = [e for e in events if e.get('event_type') == 'objective_state']
    metrics = [e for e in events if e.get('event_type') == 'mission_metric']

    # Search coverage: last mission_metric of type search_coverage_pct
    coverage_events = [
        m for m in metrics
        if m.get('payload', {}).get('metric_name') == 'search_coverage_pct'
    ]
    if coverage_events:
        sc.search_coverage_pct = coverage_events[-1]['payload']['value']

    # Relay uptime: fraction of network_state snapshots with 1 partition
    if network_states:
        connected = sum(
            1 for ns in network_states
            if ns.get('payload', {}).get('partition_count', 1) == 1
        )
        sc.relay_uptime_pct = (connected / len(network_states)) * 100.0

    # Track continuity: longest continuous tracking interval
    # (Simplified: count role_assignments where a vehicle is tracker)
    sc.track_continuity_sec = len([
        r for r in role_assignments
        if r.get('payload', {}).get('new_role') == 'tracker'
    ]) * 10.0  # Rough estimate

    # Operator interventions
    sc.operator_intervention_count = len(operator_actions)

    # Mission completion: last objective_state progress
    if objective_states:
        progresses = [o['payload']['progress_pct'] for o in objective_states]
        sc.mission_completion_pct = sum(progresses) / len(progresses) if progresses else 0.0

    # Recovery times (from partition events)
    partition_start = None
    for ns in network_states:
        p_count = ns.get('payload', {}).get('partition_count', 1)
        if p_count > 1 and partition_start is None:
            partition_start = ns.get('ts', '')
        elif p_count == 1 and partition_start is not None:
            # Recovered — estimate time (would need proper timestamp parsing)
            sc.recovery_time_partition_sec = 12.0  # Placeholder
            partition_start = None

    # Node loss recovery
    node_loss_events = [
        e for e in scenario_events
        if e.get('payload', {}).get('disruption_type') == 'drone_fail'
    ]
    if node_loss_events:
        sc.recovery_time_node_loss_sec = 8.0  # Placeholder

    # Active vehicles at end
    if vehicle_states:
        last_entities = set()
        for vs in vehicle_states[-60:]:  # Last ~6 seconds
            entity = vs.get('entity_id', '')
            if entity:
                last_entities.add(entity)
        sc.active_vehicles_final = len(last_entities)

    # Duration
    if vehicle_states:
        sc.duration_sec = len(vehicle_states) / max(1, sc.active_vehicles_final) / 10.0

    # Composite score (weighted per scenario scoring)
    sc.composite_score = (
        sc.search_coverage_pct * 0.30
        + sc.relay_uptime_pct * 0.20
        + min(100, sc.track_continuity_sec) * 0.20
        + max(0, 100 - sc.recovery_time_partition_sec * 2) * 0.15
        + max(0, 100 - sc.operator_intervention_count * 30) * 0.15
    )

    return sc
