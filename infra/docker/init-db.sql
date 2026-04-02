-- Ghost Lattice — TimescaleDB Schema
-- Initialized on first postgres container start

-- Enable TimescaleDB
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ── Run metadata ────────────────────────────────────────────────────────────
CREATE TABLE runs (
    run_id TEXT PRIMARY KEY,
    scenario_id TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'running',
    duration_sec REAL,
    vehicle_count INTEGER,
    random_seed INTEGER,
    config JSONB,
    notes TEXT
);

CREATE INDEX idx_runs_scenario ON runs(scenario_id);
CREATE INDEX idx_runs_status ON runs(status);

-- ── Events hypertable ───────────────────────────────────────────────────────
CREATE TABLE events (
    id BIGSERIAL,
    ts TIMESTAMPTZ NOT NULL,
    run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
    seq BIGINT NOT NULL,
    event_type TEXT NOT NULL,
    entity_id TEXT,
    payload JSONB NOT NULL
);

SELECT create_hypertable('events', by_range('ts'));

CREATE INDEX idx_events_run_seq ON events(run_id, seq);
CREATE INDEX idx_events_run_type ON events(run_id, event_type, ts);
CREATE INDEX idx_events_entity ON events(entity_id, ts);

-- ── Scorecards ──────────────────────────────────────────────────────────────
CREATE TABLE scorecards (
    run_id TEXT PRIMARY KEY REFERENCES runs(run_id) ON DELETE CASCADE,
    metrics JSONB NOT NULL,
    baseline_run_id TEXT,
    comparison JSONB,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Continuous aggregate for vehicle state downsampling (replay performance) ─
-- Downsample vehicle_state events to 1-second buckets for the replay UI
CREATE MATERIALIZED VIEW vehicle_state_1s
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 second', ts) AS bucket,
    run_id,
    entity_id,
    last(payload, ts) AS payload
FROM events
WHERE event_type = 'vehicle_state'
GROUP BY bucket, run_id, entity_id
WITH NO DATA;

-- Refresh policy: auto-refresh every 30 seconds for recent data
SELECT add_continuous_aggregate_policy('vehicle_state_1s',
    start_offset => INTERVAL '1 hour',
    end_offset => INTERVAL '10 seconds',
    schedule_interval => INTERVAL '30 seconds'
);

-- ── Helper views ────────────────────────────────────────────────────────────

-- All role changes for a run
CREATE VIEW role_changes AS
SELECT
    ts,
    run_id,
    entity_id,
    payload->>'old_role' AS old_role,
    payload->>'new_role' AS new_role,
    payload->'reason'->>'trigger' AS trigger,
    payload
FROM events
WHERE event_type = 'role_assignment';

-- Network partitions over time
CREATE VIEW network_partitions AS
SELECT
    ts,
    run_id,
    jsonb_array_length(payload->'partitions') AS partition_count,
    payload->'partitions' AS partitions
FROM events
WHERE event_type = 'network_state'
  AND jsonb_array_length(payload->'partitions') > 1;
