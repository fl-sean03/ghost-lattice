# Ghost Lattice — System Architecture

## Overview

Ghost Lattice is a 6-layer system running in 7 Docker containers. The simulation generates event-sourced mission data. The replay UI reads completed runs from the database — it never connects to the simulation directly.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Docker Compose                          │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  sim container (profile: sim)                           │   │
│  │  ┌──────────┐  ┌─────────────────────────────────────┐ │   │
│  │  │ Gazebo   │  │ PX4 SITL x6 (instances 0-5)        │ │   │
│  │  │ Harmonic │  │  alpha_1, alpha_2, bravo_1, bravo_2 │ │   │
│  │  │ (headless)│  │  charlie_1, charlie_2               │ │   │
│  │  └──────────┘  └─────────────────────────────────────┘ │   │
│  │  ┌──────────────────┐                                   │   │
│  │  │ XRCE-DDS Agent   │ ← bridges PX4 ↔ ROS 2            │   │
│  │  └──────────────────┘                                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │ DDS                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  ros2-autonomy container (profile: autonomy)            │   │
│  │  ┌──────────────┐ ┌───────────────┐ ┌───────────────┐  │   │
│  │  │ telemetry    │ │ scenario      │ │ role          │  │   │
│  │  │ bridge       │ │ engine        │ │ allocator     │  │   │
│  │  └──────────────┘ └───────────────┘ └───────────────┘  │   │
│  │  ┌──────────────┐ ┌───────────────┐ ┌───────────────┐  │   │
│  │  │ behavior     │ │ mission       │ │ coordination  │  │   │
│  │  │ engine       │ │ executor      │ │ nodes         │  │   │
│  │  └──────────────┘ └───────────────┘ └───────────────┘  │   │
│  │  ┌──────────────┐ ┌───────────────┐                     │   │
│  │  │ event        │ │ ddil          │                     │   │
│  │  │ recorder     │ │ bridge        │                     │   │
│  │  └──────────────┘ └───────────────┘                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│          │ writes JSONL + SQL           │ HTTP                   │
│  ┌───────────────┐  ┌──────────────────────────────────────┐   │
│  │  postgres      │  │  ddil-engine (profile: services)     │   │
│  │  (TimescaleDB) │  │  FastAPI — link model, jammer,       │   │
│  │                │  │  GPS degradation, partition detection │   │
│  └───────────────┘  └──────────────────────────────────────┘   │
│          │ SQL                                                   │
│  ┌───────────────┐  ┌──────────────────────────────────────┐   │
│  │  replay-api    │  │  scoring-engine (profile: services)  │   │
│  │  FastAPI       │  │  metrics pipeline + baseline         │   │
│  └───────────────┘  └──────────────────────────────────────┘   │
│          │ HTTP                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  replay-ui (profile: replay)                              │  │
│  │  Next.js + React Three Fiber + D3                         │  │
│  │  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │  │
│  │  │ 3D Pane │  │ Network  │  │ Operator │  │ Timeline │  │  │
│  │  │ (R3F)   │  │ Pane(D3) │  │ Pane     │  │ Scrubber │  │  │
│  │  └─────────┘  └──────────┘  └──────────┘  └──────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Layer Details

### Layer 1: Vehicle Dynamics (PX4 SITL)

Each drone runs a PX4 SITL instance with vehicle-specific parameters.

- Instances 0-5 share one Gazebo server process
- Instance 0 starts Gazebo; instances 1-5 use `PX4_GZ_STANDALONE=1`
- XRCE-DDS Agent bridges PX4 uORB topics to ROS 2 DDS
- Port layout: instance N uses MAVLink UDP ports 14540+2N / 14541+2N

### Layer 2: World & Sensors (Gazebo Harmonic)

Gazebo provides:
- Terrain (flat for v1, heightmap possible later)
- Box buildings for line-of-sight obstruction
- Geofences (no-fly zones)
- Per-vehicle sensors: IMU, GPS, barometer, RGB camera

The world file (`coastal_industrial_v1.sdf`) encodes buildings and ground plane. Dynamic features (jammer zones, mobile emitters) are managed by the scenario engine, not Gazebo.

### Layer 3: Autonomy & Coordination (ROS 2 Humble)

All ROS 2 nodes use Python (rclpy). 10 Hz telemetry rate at 6 vehicles is well within Python's performance envelope.

| Node | Subscribes | Publishes |
|------|-----------|----------|
| telemetry_bridge | px4_msgs/VehicleOdometry (x6) | gl_interfaces/FleetState |
| scenario_engine | (timer-driven) | gl_interfaces/ScenarioEvent |
| role_allocator | FleetState, NetworkState | RoleAssignment |
| behavior_engine | RoleAssignment, FleetState | TrajectorySetpoint (via executor) |
| mission_executor | behavior outputs | px4_msgs/TrajectorySetpoint (x6) |
| coordination_nodes | NetworkState | partition alerts |
| ddil_bridge | FleetState | NetworkState |
| event_recorder | ALL gl_interfaces topics | (writes to JSONL + PostgreSQL) |

### Layer 4: DDIL Engine (Standalone Python)

The DDIL engine runs as a separate FastAPI service, queried by the ddil_bridge ROS 2 node over HTTP. This separation makes the DDIL model independently testable.

Link quality model:
```
quality(v1, v2) = base_quality(distance) * los_factor(terrain) * jammer_attenuation(jammer_fields)
```

Outputs: adjacency graph, message success probability, effective team partitions.

### Layer 5: Telemetry & Event Recording

Every state change is an event. The event_recorder node subscribes to all gl_interfaces topics and writes:
- JSONL files to `data/runs/run_XXXX/` (for development inspection)
- SQL inserts to TimescaleDB events hypertable (for replay queries)

Event volume: ~18,000 vehicle_state events + ~500 other events per 5-minute run.

### Layer 6: Replay & Presentation

The replay UI is fully decoupled from simulation. It reads completed runs from PostgreSQL via the replay-api.

Three synchronized panes:
1. **3D Mission Pane** (React Three Fiber) — drone positions, trails, zones, role labels
2. **Network Pane** (D3 force graph) — connectivity, edge quality, partition highlighting
3. **Operator Pane** — mission intent, command history, alerts, objective progress

Plus: timeline scrubber with event markers, scorecard panel, baseline comparison.

## Data Flow

```
Scenario YAML
    → mission-compiler → task primitives
    → fleet-registry → capability profiles
    → scenario_engine (ROS 2) → timed ScenarioEvents
    → role_allocator ← FleetState + NetworkState
    → behavior_engine → per-vehicle commands
    → mission_executor → PX4 TrajectorySetpoint
    → PX4 SITL → Gazebo physics → PX4 state estimation
    → telemetry_bridge → FleetState
    → ddil_bridge ←→ ddil-engine (HTTP) → NetworkState
    → event_recorder → JSONL + PostgreSQL
    → replay-api ← PostgreSQL
    → replay-ui (browser)
```

## Docker Compose Profiles

| Profile | Containers | Use Case |
|---------|-----------|----------|
| `sim` | sim | Validate PX4 + Gazebo launch |
| `autonomy` | sim, ros2-autonomy, postgres | Run missions, record events |
| `services` | ddil-engine, scoring-engine | Develop/test services standalone |
| `replay` | postgres, replay-api, replay-ui | View recorded runs (no sim needed) |
| `full` | all 7 containers | Complete system |

## Network

All containers share a single Docker bridge network (`ghost-lattice`). Key ports:

| Service | Port |
|---------|------|
| replay-ui | 3000 |
| replay-api | 8000 |
| ddil-engine | 8001 |
| scoring-engine | 8002 |
| postgres | 5432 |

ROS 2 DDS traffic uses multicast within the Docker network.
