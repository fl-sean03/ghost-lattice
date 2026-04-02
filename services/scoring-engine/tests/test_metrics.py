"""Tests for scoring metrics — no simulation required."""

import pytest
from app.metrics import compute_scorecard, Scorecard


def _mock_events():
    """Generate minimal mock events for testing."""
    events = []
    # Vehicle states
    for i in range(100):
        for vid in ['alpha_1', 'alpha_2', 'bravo_1']:
            events.append({
                'event_type': 'vehicle_state',
                'entity_id': vid,
                'payload': {'position_ned': [i, 0, -30], 'battery_pct': 90},
            })

    # Coverage metric
    events.append({
        'event_type': 'mission_metric',
        'payload': {'metric_name': 'search_coverage_pct', 'value': 72.5},
    })

    # Network states (mostly connected)
    for i in range(50):
        events.append({
            'event_type': 'network_state',
            'payload': {'partition_count': 1},
        })
    # 10 partitioned
    for i in range(10):
        events.append({
            'event_type': 'network_state',
            'payload': {'partition_count': 2},
        })

    # One operator action
    events.append({
        'event_type': 'operator_action',
        'payload': {'action_type': 'redirect'},
    })

    return events


def test_scorecard_coverage():
    events = _mock_events()
    sc = compute_scorecard(events, "run_test")
    assert sc.search_coverage_pct == 72.5


def test_scorecard_relay_uptime():
    events = _mock_events()
    sc = compute_scorecard(events, "run_test")
    # 50 connected out of 60 total = 83.3%
    assert 80 < sc.relay_uptime_pct < 90


def test_scorecard_operator_count():
    events = _mock_events()
    sc = compute_scorecard(events, "run_test")
    assert sc.operator_intervention_count == 1


def test_scorecard_composite():
    events = _mock_events()
    sc = compute_scorecard(events, "run_test")
    assert sc.composite_score > 0


def test_scorecard_empty_events():
    sc = compute_scorecard([], "run_empty")
    assert sc.search_coverage_pct == 0.0
    assert sc.operator_intervention_count == 0
