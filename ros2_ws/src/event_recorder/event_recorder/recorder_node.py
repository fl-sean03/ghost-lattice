"""
Event Recorder Node

Subscribes to all gl_interfaces topics and writes events to:
1. JSONL files in data/runs/run_XXXX/ (one file per event type)
2. PostgreSQL/TimescaleDB events table (if DB connection available)

This is the central data collection point — every state change in the system
flows through here.
"""

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock

import rclpy
from rclpy.node import Node

from gl_interfaces.msg import (
    VehicleState,
    FleetState,
    RoleAssignment,
    ScenarioEvent,
    NetworkState,
    MissionMetric,
    OperatorCommand,
    AutonomyTrace,
    VehicleHealth,
    ObjectiveState,
)


def _stamp_to_iso(stamp) -> str:
    """Convert ROS 2 stamp to ISO 8601 string."""
    t = stamp.sec + stamp.nanosec * 1e-9
    return datetime.fromtimestamp(t, tz=timezone.utc).isoformat()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class EventRecorder(Node):
    def __init__(self):
        super().__init__('event_recorder')

        self.declare_parameter('run_id', 'run_0000')
        self.declare_parameter('output_dir', '/data/runs')
        self.declare_parameter('db_host', os.environ.get('GL_DB_HOST', ''))
        self.declare_parameter('db_port', int(os.environ.get('GL_DB_PORT', '5432')))
        self.declare_parameter('db_name', os.environ.get('GL_DB_NAME', 'ghost_lattice'))
        self.declare_parameter('db_user', os.environ.get('GL_DB_USER', 'gl'))
        self.declare_parameter('db_password', os.environ.get('GL_DB_PASSWORD', 'gl_dev'))

        self.run_id = self.get_parameter('run_id').value
        output_base = self.get_parameter('output_dir').value
        self.output_dir = Path(output_base) / self.run_id
        self.output_dir.mkdir(parents=True, exist_ok=True)

        self._seq = 0
        self._seq_lock = Lock()
        self._files: dict[str, object] = {}
        self._db_conn = None

        # Try to connect to PostgreSQL
        self._init_db()

        # Write run metadata
        self._write_metadata()

        # Subscribe to all gl_interfaces topics
        self.create_subscription(
            FleetState, '/gl/fleet_state',
            self._on_fleet_state, 10,
        )
        self.create_subscription(
            RoleAssignment, '/gl/role_assignment',
            lambda msg: self._record('role_assignment', msg.vehicle_id, {
                'old_role': msg.old_role,
                'new_role': msg.new_role,
                'reason': {
                    'trigger': msg.trigger,
                    'link_score_gain': msg.link_score_gain,
                    'battery_ok': msg.battery_ok,
                    'position_advantage': msg.position_advantage,
                    'utility_delta': msg.utility_delta,
                },
                'auction_round': msg.auction_round,
            }, msg.stamp),
            10,
        )
        self.create_subscription(
            ScenarioEvent, '/gl/scenario_event',
            lambda msg: self._record('scenario_event', msg.disruption_id, {
                'disruption_type': msg.disruption_type,
                'disruption_id': msg.disruption_id,
                'region': msg.region,
                'center': list(msg.center),
                'radius_m': msg.radius_m,
                'strength_dbm': msg.strength_dbm,
                'target': msg.target,
                'affected_entities': list(msg.affected_entities),
                'scheduled_end_t': msg.scheduled_end_t,
            }, msg.stamp),
            10,
        )
        self.create_subscription(
            NetworkState, '/gl/network_state',
            lambda msg: self._record('network_state', None, {
                'edges': [
                    {'src': e.src, 'dst': e.dst, 'quality': e.quality,
                     'latency_ms': e.latency_ms, 'active': e.active}
                    for e in msg.edges
                ],
                'partitions': [p.split(',') for p in msg.partitions],
                'partition_count': msg.partition_count,
            }, msg.stamp),
            10,
        )
        self.create_subscription(
            MissionMetric, '/gl/mission_metric',
            lambda msg: self._record('mission_metric', None, {
                'metric_name': msg.metric_name,
                'value': msg.value,
                'unit': msg.unit,
                'delta_since_last': msg.delta_since_last,
            }, msg.stamp),
            10,
        )
        self.create_subscription(
            OperatorCommand, '/gl/operator_command',
            lambda msg: self._record('operator_action', msg.target, {
                'action_type': msg.action_type,
                'target': msg.target,
                'source': msg.source,
                'reason': msg.reason,
                'parameters': dict(zip(msg.param_keys, msg.param_values)),
            }, msg.stamp),
            10,
        )
        self.create_subscription(
            AutonomyTrace, '/gl/autonomy_trace',
            lambda msg: self._record('autonomy_decision_trace', msg.vehicle_id, {
                'vehicle_id': msg.vehicle_id,
                'decision': msg.decision,
                'context': {
                    'current_role': msg.current_role,
                    'current_health': msg.current_health,
                    'partition_detected': msg.partition_detected,
                    'time_since_event': msg.time_since_event,
                },
                'alternatives': [
                    {'role': r, 'utility': u}
                    for r, u in zip(msg.alt_roles, msg.alt_utilities)
                ],
                'chosen': msg.chosen,
                'chosen_reason': msg.chosen_reason,
            }, msg.stamp),
            10,
        )
        self.create_subscription(
            VehicleHealth, '/gl/vehicle_health',
            lambda msg: self._record('vehicle_health', msg.vehicle_id, {
                'gps_fix_type': msg.gps_fix_type,
                'gps_accuracy_m': msg.gps_accuracy_m,
                'battery_voltage': msg.battery_voltage,
                'comms_status': msg.comms_status,
                'motor_status': list(msg.motor_status),
                'nav_mode': msg.nav_mode,
                'overall_health': msg.overall_health,
            }, msg.stamp),
            10,
        )
        self.create_subscription(
            ObjectiveState, '/gl/objective_state',
            lambda msg: self._record('objective_state', msg.objective_id, {
                'objective_id': msg.objective_id,
                'objective_type': msg.objective_type,
                'progress_pct': msg.progress_pct,
                'status': msg.status,
                'assigned_vehicles': list(msg.assigned_vehicles),
                'degraded': msg.degraded,
                'degradation_reason': msg.degradation_reason,
            }, msg.stamp),
            10,
        )

        self.get_logger().info(
            f'Event recorder started: run_id={self.run_id}, '
            f'output={self.output_dir}, db={"connected" if self._db_conn else "none"}'
        )

    def _on_fleet_state(self, msg: FleetState):
        """Record individual vehicle states from fleet state."""
        for vs in msg.vehicles:
            self._record('vehicle_state', vs.vehicle_id, {
                'position_ned': list(vs.position_ned),
                'velocity_ned': list(vs.velocity_ned),
                'heading_rad': vs.heading_rad,
                'current_role': vs.current_role,
                'battery_pct': vs.battery_pct,
                'battery_wh_remaining': vs.battery_wh_remaining,
                'armed': vs.armed,
                'flight_mode': vs.flight_mode,
            }, vs.stamp)

    def _next_seq(self) -> int:
        with self._seq_lock:
            self._seq += 1
            return self._seq

    def _record(self, event_type: str, entity_id: str | None, payload: dict, stamp=None):
        """Write event to JSONL file and optionally to PostgreSQL."""
        ts = _stamp_to_iso(stamp) if stamp else _now_iso()
        seq = self._next_seq()

        event = {
            'ts': ts,
            'run_id': self.run_id,
            'seq': seq,
            'event_type': event_type,
            'entity_id': entity_id,
            'payload': payload,
        }

        # Write to JSONL file
        self._write_jsonl(event_type, event)

        # Write to PostgreSQL if connected
        if self._db_conn:
            self._write_db(event)

    def _write_jsonl(self, event_type: str, event: dict):
        """Append event to type-specific JSONL file."""
        if event_type not in self._files:
            path = self.output_dir / f'{event_type}.jsonl'
            self._files[event_type] = open(path, 'a')

        f = self._files[event_type]
        f.write(json.dumps(event) + '\n')
        f.flush()

    def _write_metadata(self):
        """Write run metadata file."""
        meta = {
            'run_id': self.run_id,
            'started_at': _now_iso(),
            'status': 'running',
        }
        meta_path = self.output_dir / 'metadata.json'
        with open(meta_path, 'w') as f:
            json.dump(meta, f, indent=2)

    def _init_db(self):
        """Try to connect to PostgreSQL."""
        db_host = self.get_parameter('db_host').value
        if not db_host:
            self.get_logger().info('No DB host configured — writing JSONL only')
            return

        try:
            import psycopg2
            self._db_conn = psycopg2.connect(
                host=db_host,
                port=self.get_parameter('db_port').value,
                dbname=self.get_parameter('db_name').value,
                user=self.get_parameter('db_user').value,
                password=self.get_parameter('db_password').value,
            )
            self._db_conn.autocommit = True

            # Insert run record
            with self._db_conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO runs (run_id, scenario_id, status) VALUES (%s, %s, 'running') "
                    "ON CONFLICT (run_id) DO NOTHING",
                    (self.run_id, 'mission_001'),
                )

            self.get_logger().info(f'Connected to PostgreSQL at {db_host}')
        except Exception as e:
            self.get_logger().warn(f'Failed to connect to PostgreSQL: {e} — JSONL only')
            self._db_conn = None

    def _write_db(self, event: dict):
        """Insert event into TimescaleDB."""
        try:
            with self._db_conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO events (ts, run_id, seq, event_type, entity_id, payload) "
                    "VALUES (%s, %s, %s, %s, %s, %s)",
                    (
                        event['ts'],
                        event['run_id'],
                        event['seq'],
                        event['event_type'],
                        event['entity_id'],
                        json.dumps(event['payload']),
                    ),
                )
        except Exception as e:
            self.get_logger().warn(f'DB write failed: {e}')

    def destroy_node(self):
        """Clean up file handles and DB connection."""
        for f in self._files.values():
            f.close()
        if self._db_conn:
            self._db_conn.close()
        super().destroy_node()


def main(args=None):
    rclpy.init(args=args)
    node = EventRecorder()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
