# CLAUDE.md — Ghost Lattice Mission Digital Twin

## What This Is

A scenario-driven, replayable, event-sourced drone swarm digital twin. Simulates 6 mixed-capability drones executing adaptive ISR + relay restoration + deception under DDIL impairment, with automatic role reassignment and low operator burden.

**Not** a fake video render, not a centralized commander pretending to be decentralized, not a brittle one-off animation.

## Read Order

1. This file (orientation)
2. `docs/architecture/ARCHITECTURE.md` (system design, 6 layers, 7 containers)
3. `docs/architecture/EVENT_SCHEMA.md` (event envelope + payload specs)
4. `data/scenarios/mission_001.yaml` (frozen first scenario)
5. `docs/demo-script/DEMO_SCRIPT.md` (90-second replay narrative)
6. `ghost_lattice_mission_digital_twin_dev_guide.md` (full 850-line dev guide)

## Stack

| Layer | Technology |
|-------|-----------|
| Flight stack | PX4 v1.16 SITL |
| World/physics | Gazebo Harmonic (headless) |
| Autonomy/orchestration | ROS 2 Humble |
| Network impairment | Python/FastAPI (standalone DDIL engine) |
| Event storage | TimescaleDB (PostgreSQL) |
| Replay frontend | Next.js + React Three Fiber + D3.js |
| Infrastructure | Docker Compose (profiles: sim, autonomy, services, replay, full) |

Everything sim-related runs in Docker containers. ROS 2, Gazebo, and PX4 are NOT installed on the host.

## Directory Structure

```
ghost-lattice/
  apps/                    # Frontend applications
    replay-ui/             # Next.js replay viewer (3D + network + operator panes)
    scenario-editor/       # Future: scenario authoring UI
    operator-console/      # Future: live operator interface
  services/                # Python microservices
    mission-compiler/      # Scenario YAML -> executable task list
    fleet-registry/        # Vehicle capabilities and fleet composition
    role-allocator/        # Utility-based role assignment (future standalone)
    ddil-engine/           # Network impairment model (FastAPI, testable without sim)
    scoring-engine/        # Mission metrics + baseline comparison
    replay-api/            # FastAPI serving recorded run data to frontend
  sim/                     # Simulation assets
    launch/                # PX4 + Gazebo launch scripts
    worlds/                # Gazebo SDF world files
    vehicle-models/        # Vehicle parameter sets per vendor
    sensors/               # Sensor model configs
  ros2_ws/src/             # ROS 2 workspace
    gl_interfaces/         # Custom messages and services
    telemetry_bridge/      # PX4 -> unified FleetState
    scenario_engine/       # Timed event injection from scenario YAML
    role_allocator/        # Market-based role allocation node
    behavior_engine/       # Per-vehicle state machine execution
    mission_executor/      # Offboard commands to PX4
    coordination_nodes/    # Partition detection, mesh awareness
    ddil_bridge/           # Queries DDIL engine, publishes NetworkState
    event_recorder/        # Subscribes to all topics, writes JSONL + PostgreSQL
  infra/                   # Infrastructure
    docker/                # Dockerfiles, init scripts
    ci/                    # CI smoke tests
    observability/         # Prometheus config
  data/
    scenarios/             # Scenario YAML files + JSON schema
    runs/                  # Recorded mission run data (gitignored)
    baselines/             # Single-agent baseline scenarios
  tests/integration/       # Integration tests requiring sim
  scripts/                 # Utility scripts (export, wait-for-ready)
  docs/                    # Documentation
```

## Key Commands

```bash
# Start sim backbone only
docker compose --profile sim up --build

# Start full stack
docker compose --profile full up --build

# Start replay only (requires prior run data)
docker compose --profile replay up

# Frontend dev (hot-reload on host)
cd apps/replay-ui && npm run dev

# Run unit tests (no sim required)
cd services/ddil-engine && pytest
cd services/scoring-engine && pytest
cd services/mission-compiler && pytest

# Run integration tests
docker compose --profile sim up -d
docker compose exec sim bash -c "/scripts/wait_for_ready.sh 6"
pytest tests/integration/
```

## Conventions

- Event-sourced: every state change is an event with timestamp, run_id, entity_id, payload
- Scenario-driven: no hardcoded mission logic, everything comes from scenario YAML
- Deterministic: seeded RNG for stochastic elements, same seed = same events
- Python for all ROS 2 nodes (rclpy) — fast enough for 10 Hz at 6 vehicles
- Pydantic models for all service data contracts
- JSONL for development inspection, TimescaleDB for production queries
