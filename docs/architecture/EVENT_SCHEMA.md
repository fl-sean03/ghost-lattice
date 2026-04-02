# Ghost Lattice — Event Schema

## Event Envelope

Every event in the system follows this envelope:

```json
{
  "ts": "2026-04-02T18:35:21.231Z",
  "run_id": "run_0042",
  "seq": 12345,
  "event_type": "role_assignment",
  "entity_id": "alpha_1",
  "payload": { ... }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `ts` | ISO 8601 timestamp | Event time (simulation clock, not wall clock) |
| `run_id` | string | Unique run identifier |
| `seq` | integer | Monotonically increasing sequence number per run |
| `event_type` | string enum | One of the 9 types below |
| `entity_id` | string | Vehicle ID, objective ID, or null for system-level events |
| `payload` | object | Type-specific payload |

## Event Types

### 1. `vehicle_state` (10 Hz per vehicle)

Position, velocity, and status of each drone.

```json
{
  "position_ned": [120.5, 45.2, -30.0],
  "velocity_ned": [5.2, -1.1, 0.3],
  "heading_rad": 1.57,
  "current_role": "scout",
  "battery_pct": 82.5,
  "battery_wh_remaining": 148.5,
  "armed": true,
  "flight_mode": "offboard"
}
```

### 2. `vehicle_health`

Health status changes (fires on-change only).

```json
{
  "gps_fix_type": 3,
  "gps_accuracy_m": 1.5,
  "battery_voltage": 22.4,
  "comms_status": "degraded",
  "motor_status": [1, 1, 1, 1],
  "nav_mode": "gps",
  "overall_health": "nominal"
}
```

Values for `comms_status`: `nominal`, `degraded`, `lost`
Values for `overall_health`: `nominal`, `degraded`, `critical`, `failed`

### 3. `role_assignment`

Role changes with rationale.

```json
{
  "old_role": "scout",
  "new_role": "relay",
  "reason": {
    "trigger": "partition_detected",
    "link_score_gain": 0.42,
    "battery_ok": true,
    "position_advantage": 0.78,
    "utility_delta": 0.35
  },
  "auction_round": 7
}
```

Values for `trigger`: `initial_assignment`, `partition_detected`, `node_loss`, `battery_low`, `objective_change`, `operator_redirect`, `utility_rebalance`

### 4. `network_state` (1 Hz)

Full network topology snapshot.

```json
{
  "edges": [
    {"src": "alpha_1", "dst": "alpha_2", "quality": 0.92, "latency_ms": 12, "active": true},
    {"src": "alpha_1", "dst": "bravo_1", "quality": 0.0, "latency_ms": null, "active": false}
  ],
  "partitions": [
    ["alpha_1", "alpha_2", "charlie_1"],
    ["bravo_1", "charlie_2"]
  ],
  "relay_chains": [
    {"from": "base", "to": "alpha_1", "via": ["charlie_1"]}
  ]
}
```

### 5. `operator_action`

Operator commands (both scripted and manual).

```json
{
  "action_type": "redirect_search",
  "target": null,
  "parameters": {
    "priority_subregion": "sector_red_north",
    "reason": "Intel update — focus north"
  },
  "source": "scripted"
}
```

Values for `source`: `scripted` (from scenario), `manual` (live operator input)

### 6. `scenario_event`

Environmental disruptions injected by the scenario engine.

```json
{
  "disruption_type": "jammer_on",
  "disruption_id": "jammer_1",
  "region": "zone_j1",
  "center": [200.0, 150.0, 0.0],
  "radius_m": 150,
  "strength_dbm": -60,
  "affected_entities": ["bravo_1", "bravo_2"],
  "scheduled_end_t": 240
}
```

### 7. `objective_state`

Mission objective progress (fires on-change).

```json
{
  "objective_id": "obj_search",
  "objective_type": "area_search",
  "progress_pct": 45.2,
  "status": "in_progress",
  "assigned_vehicles": ["alpha_1", "alpha_2"],
  "degraded": false,
  "degradation_reason": null
}
```

Values for `status`: `pending`, `in_progress`, `completed`, `degraded`, `failed`

### 8. `mission_metric`

Instantaneous metric values (sampled every 10s).

```json
{
  "metric_name": "search_coverage_pct",
  "value": 45.2,
  "unit": "percent",
  "delta_since_last": 3.1
}
```

Metric names: `search_coverage_pct`, `relay_uptime_pct`, `track_continuity_sec`, `mission_completion_pct`, `operator_intervention_count`, `active_vehicles`, `mean_battery_pct`, `path_efficiency`

### 9. `autonomy_decision_trace`

Detailed reasoning trace for significant autonomy decisions.

```json
{
  "vehicle_id": "alpha_1",
  "decision": "role_change",
  "context": {
    "current_role": "scout",
    "current_health": 0.95,
    "partition_detected": true,
    "time_since_partition_sec": 5.2
  },
  "alternatives": [
    {"role": "relay", "utility": 0.82},
    {"role": "scout", "utility": 0.47},
    {"role": "reserve", "utility": 0.31}
  ],
  "chosen": "relay",
  "chosen_reason": "Highest utility score; partition requires relay restoration"
}
```

## Event Volume Estimates (5-minute run, 6 vehicles)

| Event Type | Frequency | Approx Count |
|-----------|-----------|--------------|
| vehicle_state | 10 Hz x 6 | 18,000 |
| network_state | 1 Hz | 300 |
| mission_metric | 0.1 Hz x 8 metrics | 240 |
| vehicle_health | on-change | ~30 |
| role_assignment | on-change | ~15 |
| scenario_event | scheduled | 3-5 |
| operator_action | scheduled | 1-2 |
| objective_state | on-change | ~20 |
| autonomy_decision_trace | on-change | ~15 |
| **Total** | | **~18,600** |

Total data size: ~8-10 MB per run in JSONL format.

## Storage

### JSONL (development)
One file per event type per run:
```
data/runs/run_0042/
  vehicle_state.jsonl
  role_assignment.jsonl
  network_state.jsonl
  ...
  metadata.json        # run_id, scenario_id, started_at, duration, config
```

### TimescaleDB (production queries)
```sql
-- Events hypertable (partitioned by ts)
CREATE TABLE events (
  id BIGSERIAL,
  ts TIMESTAMPTZ NOT NULL,
  run_id TEXT NOT NULL,
  seq BIGINT NOT NULL,
  event_type TEXT NOT NULL,
  entity_id TEXT,
  payload JSONB NOT NULL
);
SELECT create_hypertable('events', 'ts');

-- Replay query pattern
SELECT * FROM events
WHERE run_id = 'run_0042'
  AND ts BETWEEN '2026-04-02T18:35:00Z' AND '2026-04-02T18:36:30Z'
  AND event_type IN ('vehicle_state', 'role_assignment')
ORDER BY seq;
```
