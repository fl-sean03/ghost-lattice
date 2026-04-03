#!/usr/bin/env python3
"""
Generate a synthetic "golden run" dataset for mission_001.

This produces realistic event data matching the 90-second demo script,
allowing the replay UI to work without requiring the full simulation stack.

Events follow the frozen scenario timeline:
  0-15s:   Operator sets mission intent, drones take off
  15-35s:  Swarm fans out, roles self-assign
  30s:     Mobile emitter appears
  35-50s:  Steady state operations, coverage climbing
  60s:     Operator redirect (focus north)
  120s:    Jammer activates → network partition
  180s:    Drone bravo_2 fails (power loss)
  180-210s: Autonomous recovery — role reassignment cascade
  240s:    GPS degradation
  300s:    Mission ends, scorecard generated

Output: JSONL files + metadata.json in data/runs/golden_run/
"""

import json
import math
import os
import random
from datetime import datetime, timezone, timedelta
from pathlib import Path

random.seed(42)

OUTPUT_DIR = Path(__file__).parent.parent / "data" / "runs" / "golden_run"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

RUN_ID = "golden_run"
SCENARIO_ID = "mission_001"
DURATION = 300  # seconds
DT = 0.1  # 10 Hz

# Vehicle definitions
VEHICLES = {
    "alpha_1":  {"vendor": "vendor_a", "type": "quad_medium",  "payloads": ["rgb_camera", "comms_relay"], "comms_range": 800, "battery_wh": 180, "max_speed": 15},
    "alpha_2":  {"vendor": "vendor_a", "type": "quad_medium",  "payloads": ["rgb_camera"],               "comms_range": 800, "battery_wh": 180, "max_speed": 15},
    "bravo_1":  {"vendor": "vendor_b", "type": "quad_light",   "payloads": ["rgb_camera", "ew_emitter"], "comms_range": 600, "battery_wh": 150, "max_speed": 18},
    "bravo_2":  {"vendor": "vendor_b", "type": "quad_light",   "payloads": ["rgb_camera"],               "comms_range": 600, "battery_wh": 150, "max_speed": 18},
    "charlie_1":{"vendor": "vendor_c", "type": "quad_heavy",   "payloads": ["lidar_2d", "rgb_camera", "comms_relay"], "comms_range": 1000, "battery_wh": 200, "max_speed": 12},
    "charlie_2":{"vendor": "vendor_c", "type": "quad_heavy",   "payloads": ["rgb_camera"],               "comms_range": 1000, "battery_wh": 200, "max_speed": 12},
}

# Role timeline: vehicle_id -> [(t_start, t_end, role)]
ROLE_TIMELINE = {
    "alpha_1":  [(0, 120, "scout"),   (120, 300, "scout")],
    "alpha_2":  [(0, 120, "scout"),   (120, 180, "scout"),   (180, 300, "tracker")],
    "bravo_1":  [(0, 120, "decoy"),   (120, 180, "decoy"),   (180, 300, "scout")],
    "bravo_2":  [(0, 180, "tracker")],  # Dies at t=180
    "charlie_1":[(0, 300, "relay")],
    "charlie_2":[(0, 120, "scout"),   (120, 180, "scout"),   (180, 300, "relay")],
}

# Cache for role-change blending: stores position at moment of role change
_role_change_cache: dict[str, tuple[float, list[float]]] = {}


def _triangle_wave(t_val: float, period: float) -> float:
    """0→1→0→1... triangle wave. Continuous, no jumps."""
    phase = (t_val % period) / period  # 0-1 sawtooth
    return 1.0 - abs(2.0 * phase - 1.0)   # 0→1→0


def _smooth_step(x: float) -> float:
    """Cubic ease-in-out: 0→1 smoothly."""
    x = max(0.0, min(1.0, x))
    return x * x * (3.0 - 2.0 * x)


def _role_target(vid: str, role: str, t: float, phase_t: float, speed: float) -> list[float]:
    """Pure role-based target position (no blending)."""
    if role == "scout":
        # Each scout gets a unique lane in the sector [100-400, 30-270]
        # Use vid-based index for consistent lane assignment
        scout_lanes = {"alpha_1": 60, "alpha_2": 120, "bravo_1": 180,
                       "bravo_2": 80, "charlie_2": 200}
        lane_y = scout_lanes.get(vid, 100)
        # Triangle wave sweep: 120→380→120 (stay well within sector)
        sweep_period = 520.0 / max(speed * 0.5, 1)
        x = 120 + 260 * _triangle_wave(phase_t, sweep_period)
        y = lane_y + 12 * math.sin(phase_t * 0.08)
        # Operator redirect at t=60: gradual Y shift north over 10s
        if t > 60:
            shift = min(1.0, (t - 60) / 10.0) * 20
            y += shift
        # Clamp within sector
        y = max(30, min(280, y))
        return [x, y, -30]

    elif role == "relay":
        # Relay holds central position between base and fleet
        x = 55 + 8 * math.sin(phase_t * 0.04)
        y = 80 + 8 * math.cos(phase_t * 0.04)
        if vid == "charlie_2" and t >= 180:
            # Charlie_2 new relay: bridge position between groups
            # Gradual move handled by role-change blending in get_position
            x = 150
            y = 140
        return [x, y, -40]

    elif role == "tracker":
        # Emitter moves slowly through the sector
        # Start at [250,180], move NE slowly
        emitter_x = 250 + (t - 30) * 0.3 if t > 30 else 250
        emitter_y = 180 + (t - 30) * (-0.15) if t > 30 else 180
        # Clamp emitter in reasonable area
        emitter_x = min(emitter_x, 390)
        emitter_y = max(emitter_y, 80)
        # Tracker orbits emitter at standoff
        orbit_r = 25
        orbit_speed = 0.1
        x = emitter_x + orbit_r * math.cos(t * orbit_speed)
        y = emitter_y + orbit_r * math.sin(t * orbit_speed)
        return [x, y, -25]

    elif role == "decoy":
        # Figure-8 pattern at edge of sector (between base and search area)
        cx, cy = 90, 150
        r = 35
        x = cx + r * math.cos(phase_t * 0.12)
        y = cy + r * math.sin(phase_t * 0.24) * 0.6
        return [x, y, -20]

    else:  # reserve
        return [30, 30, -35]


def get_position(vid, t):
    """Compute vehicle position at time t. Guaranteed continuous — no teleports."""
    if vid == "bravo_2" and t >= 180:
        return None  # Dead

    base_positions = {
        "alpha_1":  (0, 0),
        "alpha_2":  (3, 0),
        "bravo_1":  (0, 3),
        "bravo_2":  (3, 3),
        "charlie_1":(0, 6),
        "charlie_2":(3, 6),
    }

    bx, by = base_positions[vid]

    if t < 5:
        alt = -t * 6
        return [bx, by, alt]

    if t < 15:
        frac = (t - 5) / 10
        return [bx + frac * 20, by + frac * 10, -30]

    # Position at t=15 (end of climb)
    transit_origin_x = bx + 20
    transit_origin_y = by + 10

    # Find current and previous role
    role = "reserve"
    role_start_t = 0.0
    prev_role = None
    prev_role_end_t = 0.0
    for t_start, t_end, r in ROLE_TIMELINE.get(vid, []):
        if t_start <= t < t_end:
            role = r
            role_start_t = t_start
            break
        prev_role = r
        prev_role_end_t = t_end

    phase_t = t - 15
    speed = VEHICLES[vid]["max_speed"] * 0.6

    target = _role_target(vid, role, t, phase_t, speed)

    # Smooth transit from climb-end to first role position (t=15 to t=35)
    TRANSIT_END = 45.0  # 30 seconds to reach role position (realistic cruise)
    if t < TRANSIT_END:
        blend = _smooth_step((t - 15) / (TRANSIT_END - 15))
        x = transit_origin_x + (target[0] - transit_origin_x) * blend
        y = transit_origin_y + (target[1] - transit_origin_y) * blend
        z = -30 + (target[2] - (-30)) * blend
        return [x, y, z]

    # Smooth blend when role changes mid-mission (e.g. at t=180)
    ROLE_BLEND_DURATION = 25.0  # Enough time to fly at cruise speed
    if role_start_t > 35 and t < role_start_t + ROLE_BLEND_DURATION:
        # Compute where we were just before the role change
        cache_key = f"{vid}_{role_start_t}"
        if cache_key not in _role_change_cache:
            # Compute position at role_start_t - 0.1 using previous role
            old_phase_t = role_start_t - 0.1 - 15
            if prev_role:
                old_pos = _role_target(vid, prev_role, role_start_t - 0.1, old_phase_t, speed)
            else:
                old_pos = [transit_origin_x, transit_origin_y, -30]
            _role_change_cache[cache_key] = (role_start_t, old_pos)

        _, old_pos = _role_change_cache[cache_key]
        blend = _smooth_step((t - role_start_t) / ROLE_BLEND_DURATION)
        x = old_pos[0] + (target[0] - old_pos[0]) * blend
        y = old_pos[1] + (target[1] - old_pos[1]) * blend
        z = old_pos[2] + (target[2] - old_pos[2]) * blend
        return [x, y, z]

    return target


def link_quality(pos1, pos2, t, jammer_active):
    """Compute link quality between two positions."""
    if pos1 is None or pos2 is None:
        return 0.0
    dx = pos1[0] - pos2[0]
    dy = pos1[1] - pos2[1]
    dz = pos1[2] - pos2[2]
    dist = math.sqrt(dx*dx + dy*dy + dz*dz)
    quality = max(0, 1 - dist / 800)

    if jammer_active:
        # Jammer at [200, 150], radius 150m
        for pos in [pos1, pos2]:
            jd = math.sqrt((pos[0]-200)**2 + (pos[1]-150)**2)
            if jd < 150:
                quality *= (jd / 150) ** 2

    return round(quality, 4)


def generate():
    seq = 0
    files = {}
    start_time = datetime(2026, 4, 2, 18, 0, 0, tzinfo=timezone.utc)
    jammer_active = False
    gps_degraded = False
    alive_vehicles = set(VEHICLES.keys())

    def write_event(event_type, entity_id, payload, t):
        nonlocal seq
        seq += 1
        event = {
            "ts": (start_time + timedelta(seconds=t)).isoformat(),
            "run_id": RUN_ID,
            "seq": seq,
            "event_type": event_type,
            "entity_id": entity_id,
            "payload": payload,
        }
        if event_type not in files:
            files[event_type] = open(OUTPUT_DIR / f"{event_type}.jsonl", "w")
        files[event_type].write(json.dumps(event) + "\n")

    # Generate vehicle_state at 10 Hz
    print("Generating vehicle states...")
    for step in range(int(DURATION / DT)):
        t = step * DT

        # Only write every 10th step (1 Hz) for non-vehicle events timing
        is_1hz = step % 10 == 0

        for vid in alive_vehicles:
            pos = get_position(vid, t)
            if pos is None:
                continue

            battery_drain = t / DURATION * 30  # Lose 30% over mission
            battery = 100 - battery_drain + random.gauss(0, 0.5)

            role = "reserve"
            for t_start, t_end, r in ROLE_TIMELINE.get(vid, []):
                if t_start <= t < t_end:
                    role = r
                    break

            write_event("vehicle_state", vid, {
                "position_ned": [round(p, 2) for p in pos],
                "velocity_ned": [round(random.gauss(0, 1), 2) for _ in range(3)],
                "heading_rad": round(math.atan2(pos[1], max(pos[0], 1)), 3),
                "current_role": role,
                "battery_pct": round(max(0, min(100, battery)), 1),
                "battery_wh_remaining": round(VEHICLES[vid]["battery_wh"] * battery / 100, 1),
                "armed": True,
                "flight_mode": "offboard",
            }, t)

        # 1 Hz events
        if is_1hz:
            t_sec = int(t)

            # Network state
            positions = {}
            for vid in alive_vehicles:
                p = get_position(vid, t)
                if p:
                    positions[vid] = p

            edges = []
            vids = sorted(positions.keys())
            for i, v1 in enumerate(vids):
                for j, v2 in enumerate(vids):
                    if i >= j:
                        continue
                    q = link_quality(positions[v1], positions[v2], t, jammer_active)
                    edges.append({
                        "src": v1, "dst": v2,
                        "quality": q,
                        "latency_ms": round(10 / max(q, 0.01), 1) if q > 0.1 else 0,
                        "active": q > 0.1,
                    })

            # Compute partitions
            active_edges = [(e["src"], e["dst"]) for e in edges if e["active"]]
            parent = {v: v for v in vids}
            def find(x):
                while parent[x] != x:
                    parent[x] = parent[parent[x]]
                    x = parent[x]
                return x
            for a, b in active_edges:
                ra, rb = find(a), find(b)
                if ra != rb:
                    parent[ra] = rb
            components = {}
            for v in vids:
                r = find(v)
                components.setdefault(r, []).append(v)
            partitions = list(components.values())

            write_event("network_state", None, {
                "edges": edges,
                "partitions": partitions,
                "partition_count": len(partitions),
            }, t)

            # Mission metrics every 10s
            if t_sec % 10 == 0 and t_sec > 0:
                coverage = min(95, t_sec / DURATION * 100 * 0.95)
                if jammer_active:
                    coverage *= 0.85
                write_event("mission_metric", None, {
                    "metric_name": "search_coverage_pct",
                    "value": round(coverage, 1),
                    "unit": "percent",
                    "delta_since_last": round(coverage / max(t_sec/10, 1), 1),
                }, t)

                relay_up = 100 if len(partitions) == 1 else 60
                write_event("mission_metric", None, {
                    "metric_name": "relay_uptime_pct",
                    "value": relay_up,
                    "unit": "percent",
                    "delta_since_last": 0,
                }, t)

    # Disruption events
    print("Generating scenario events...")

    # t=60: Operator redirect
    write_event("operator_action", None, {
        "action_type": "redirect_search",
        "target": None,
        "source": "scripted",
        "reason": "Intel update — focus north",
        "parameters": {"priority_subregion": "sector_red_north"},
    }, 60)

    # t=120: Jammer on
    jammer_active = True
    write_event("scenario_event", "jammer_1", {
        "disruption_type": "jammer_on",
        "disruption_id": "jammer_1",
        "region": "zone_j1",
        "center": [200.0, 150.0, 0.0],
        "radius_m": 150,
        "strength_dbm": -60,
        "affected_entities": ["bravo_1", "bravo_2"],
        "scheduled_end_t": 240,
    }, 120)

    # Role changes after jammer
    write_event("role_assignment", "charlie_1", {
        "old_role": "relay", "new_role": "relay",
        "reason": {"trigger": "partition_detected", "link_score_gain": 0.15, "battery_ok": True, "position_advantage": 0.8, "utility_delta": 0.0},
        "auction_round": 2,
    }, 122)

    # t=180: Drone fail
    write_event("scenario_event", "bravo_2", {
        "disruption_type": "drone_fail",
        "disruption_id": "fail_bravo_2",
        "target": "bravo_2",
        "mode": "power_loss",
        "affected_entities": ["bravo_2"],
        "region": "",
        "center": [0, 0, 0],
        "radius_m": 0,
        "strength_dbm": 0,
        "scheduled_end_t": 300,
    }, 180)
    alive_vehicles.discard("bravo_2")

    # Recovery role changes
    write_event("role_assignment", "charlie_2", {
        "old_role": "scout", "new_role": "relay",
        "reason": {"trigger": "node_loss", "link_score_gain": 0.42, "battery_ok": True, "position_advantage": 0.78, "utility_delta": 0.35},
        "auction_round": 3,
    }, 183)

    write_event("role_assignment", "alpha_2", {
        "old_role": "scout", "new_role": "tracker",
        "reason": {"trigger": "node_loss", "link_score_gain": 0.0, "battery_ok": True, "position_advantage": 0.65, "utility_delta": 0.28},
        "auction_round": 3,
    }, 184)

    write_event("role_assignment", "bravo_1", {
        "old_role": "decoy", "new_role": "scout",
        "reason": {"trigger": "utility_rebalance", "link_score_gain": 0.0, "battery_ok": True, "position_advantage": 0.5, "utility_delta": 0.15},
        "auction_round": 3,
    }, 185)

    # Autonomy traces for the recovery
    write_event("autonomy_decision_trace", "charlie_2", {
        "vehicle_id": "charlie_2",
        "decision": "role_change",
        "context": {"current_role": "scout", "current_health": 0.82, "partition_detected": True, "time_since_event": 3.0},
        "alternatives": [
            {"role": "relay", "utility": 0.82},
            {"role": "scout", "utility": 0.47},
            {"role": "decoy", "utility": 0.31},
        ],
        "chosen": "relay",
        "chosen_reason": "Highest utility; partition requires relay restoration after node loss",
    }, 183)

    # t=240: GPS degradation
    write_event("scenario_event", "gps_deg_1", {
        "disruption_type": "gps_degrade",
        "disruption_id": "gps_deg_1",
        "region": "sector_red_east",
        "center": [300.0, 100.0, 0.0],
        "radius_m": 100,
        "accuracy_m": 50,
        "affected_entities": ["alpha_1"],
        "strength_dbm": 0,
        "scheduled_end_t": 300,
    }, 240)

    # Objective states
    for t_val, progress, status in [(10, 5, "in_progress"), (60, 25, "in_progress"),
                                      (120, 45, "in_progress"), (180, 55, "degraded"),
                                      (240, 65, "in_progress"), (300, 78, "completed")]:
        write_event("objective_state", "obj_search", {
            "objective_id": "obj_search", "objective_type": "area_search",
            "progress_pct": progress, "status": status,
            "assigned_vehicles": [v for v in alive_vehicles if v != "charlie_1"],
            "degraded": status == "degraded", "degradation_reason": "node_loss" if status == "degraded" else "",
        }, t_val)

    # Close files
    for f in files.values():
        f.close()

    # Write metadata
    meta = {
        "run_id": RUN_ID,
        "scenario_id": SCENARIO_ID,
        "started_at": start_time.isoformat(),
        "completed_at": (start_time + timedelta(seconds=DURATION)).isoformat(),
        "duration_sec": DURATION,
        "vehicle_count": 6,
        "random_seed": 42,
        "status": "completed",
    }
    with open(OUTPUT_DIR / "metadata.json", "w") as f:
        json.dump(meta, f, indent=2)

    # Write scorecard
    scorecard = {
        "run_id": RUN_ID,
        "scenario_id": SCENARIO_ID,
        "search_coverage_pct": 72.5,
        "relay_uptime_pct": 88.0,
        "track_continuity_sec": 52.0,
        "mission_completion_pct": 78.0,
        "operator_intervention_count": 1,
        "recovery_time_partition_sec": 12.0,
        "recovery_time_node_loss_sec": 8.0,
        "battery_efficiency": 0.85,
        "path_efficiency": 0.72,
        "active_vehicles_final": 5,
        "duration_sec": 300.0,
        "composite_score": 74.2,
    }
    with open(OUTPUT_DIR / "scorecard.json", "w") as f:
        json.dump(scorecard, f, indent=2)

    # Count events
    total = 0
    for p in OUTPUT_DIR.glob("*.jsonl"):
        count = sum(1 for _ in open(p))
        total += count
        print(f"  {p.name}: {count} events")
    print(f"Total: {total} events")
    print(f"Output: {OUTPUT_DIR}")


if __name__ == "__main__":
    generate()
