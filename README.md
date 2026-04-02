# Ghost Lattice Mission Digital Twin

A simulation and replay platform demonstrating how a heterogeneous drone swarm behaves during a mission — including decentralized tasking, DDIL degradation, node loss recovery, role reassignment, and deception behavior.

## Overview

Ghost Lattice runs a 6-drone mixed-vendor swarm through an adaptive ISR scenario with:
- One operator issuing mission intent (not micromanaging)
- Decentralized role allocation (scout, relay, tracker, reserve, decoy)
- Active jammer zone causing network partitions
- Forced drone loss with autonomous recovery
- GPS degradation
- Post-mission replay with synchronized 3D, network, and operator views
- Quantitative scoring with single-agent baseline comparison

## Architecture

The system is built in 6 layers:

1. **Vehicle Dynamics** — PX4 SITL instances (one per drone)
2. **World & Sensors** — Gazebo Harmonic (headless)
3. **Autonomy & Coordination** — ROS 2 Humble nodes
4. **Network/DDIL Impairment** — Standalone Python engine
5. **Telemetry & Event Recording** — JSONL + TimescaleDB
6. **Replay & Presentation** — Next.js + React Three Fiber + D3

All simulation components run in Docker containers.

## Quick Start

```bash
# Build and start full stack
docker compose --profile full up --build

# Run the default scenario
docker compose exec ros2-autonomy ros2 launch scenario_engine mission_001.launch.py

# Open replay UI
open http://localhost:3000
```

## Requirements

- Docker >= 28.x with Compose v2
- 16+ GB RAM (24 GB recommended)
- x86_64 architecture

## Project Structure

See `CLAUDE.md` for full directory layout and conventions.

## Documentation

- [Architecture](docs/architecture/ARCHITECTURE.md)
- [Event Schema](docs/architecture/EVENT_SCHEMA.md)
- [Demo Script](docs/demo-script/DEMO_SCRIPT.md)
- [Full Dev Guide](ghost_lattice_mission_digital_twin_dev_guide.md)
