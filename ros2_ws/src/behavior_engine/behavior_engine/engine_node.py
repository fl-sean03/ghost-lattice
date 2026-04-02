"""
Behavior Engine Node

Manages per-vehicle behavior instances. When a role assignment changes,
the corresponding behavior is swapped. Each tick produces a setpoint
that gets forwarded to the mission executor.

Subscribes to:
  - /gl/fleet_state (vehicle positions)
  - /gl/role_assignment (role changes)
  - /gl/network_state (network topology)

Publishes to:
  - /gl/behavior_setpoint/{vehicle_id} (per-vehicle setpoints)
"""

import rclpy
from rclpy.node import Node

from gl_interfaces.msg import (
    FleetState,
    RoleAssignment,
    NetworkState,
)
from px4_msgs.msg import TrajectorySetpoint, OffboardControlMode, VehicleCommand

from .behaviors import BEHAVIOR_MAP, Behavior


VEHICLE_NAMESPACES = {
    'alpha_1': '',
    'alpha_2': '/px4_1',
    'bravo_1': '/px4_2',
    'bravo_2': '/px4_3',
    'charlie_1': '/px4_4',
    'charlie_2': '/px4_5',
}


class BehaviorEngine(Node):
    def __init__(self):
        super().__init__('behavior_engine')

        self.declare_parameter('num_vehicles', 6)

        # Active behaviors per vehicle
        self._behaviors: dict[str, Behavior] = {}
        self._roles: dict[str, str] = {}
        self._fleet_state: dict[str, dict] = {}
        self._network_state: dict | None = None

        # Publishers for each vehicle's PX4 commands
        self._setpoint_pubs: dict[str, object] = {}
        self._offboard_pubs: dict[str, object] = {}
        self._command_pubs: dict[str, object] = {}

        for vid, ns in VEHICLE_NAMESPACES.items():
            self._setpoint_pubs[vid] = self.create_publisher(
                TrajectorySetpoint, f'{ns}/fmu/in/trajectory_setpoint', 10)
            self._offboard_pubs[vid] = self.create_publisher(
                OffboardControlMode, f'{ns}/fmu/in/offboard_control_mode', 10)
            self._command_pubs[vid] = self.create_publisher(
                VehicleCommand, f'{ns}/fmu/in/vehicle_command', 10)

        # Subscribers
        self.create_subscription(FleetState, '/gl/fleet_state', self._on_fleet, 10)
        self.create_subscription(RoleAssignment, '/gl/role_assignment', self._on_role, 10)
        self.create_subscription(NetworkState, '/gl/network_state', self._on_network, 10)

        # 10 Hz tick
        self._timer = self.create_timer(0.1, self._tick)

        self.get_logger().info('Behavior engine started')

    def _on_fleet(self, msg: FleetState):
        for vs in msg.vehicles:
            self._fleet_state[vs.vehicle_id] = {
                'position_ned': list(vs.position_ned),
                'velocity_ned': list(vs.velocity_ned),
                'heading_rad': vs.heading_rad,
                'battery_pct': vs.battery_pct,
                'current_role': vs.current_role,
            }

    def _on_role(self, msg: RoleAssignment):
        vid = msg.vehicle_id
        new_role = msg.new_role

        # Exit old behavior
        if vid in self._behaviors:
            self._behaviors[vid].on_exit()

        # Create new behavior
        behavior_cls = BEHAVIOR_MAP.get(new_role)
        if behavior_cls:
            behavior = behavior_cls(vid)
            state = self._fleet_state.get(vid, {})
            behavior.on_enter(state)
            self._behaviors[vid] = behavior
            self._roles[vid] = new_role
            self.get_logger().info(f'{vid}: behavior -> {behavior_cls.__name__}')

    def _on_network(self, msg: NetworkState):
        self._network_state = {
            'edges': [
                {'src': e.src, 'dst': e.dst, 'quality': e.quality, 'active': e.active}
                for e in msg.edges
            ],
            'partitions': [p.split(',') for p in msg.partitions],
            'partition_count': msg.partition_count,
        }

    def _tick(self):
        timestamp = int(self.get_clock().now().nanoseconds / 1000)

        for vid, behavior in self._behaviors.items():
            state = self._fleet_state.get(vid, {})
            result = behavior.tick(state, self._fleet_state, self._network_state)

            if result and 'position_ned' in result:
                self._send_setpoint(vid, result['position_ned'], result.get('yaw'), timestamp)

    def _send_setpoint(self, vid: str, position_ned: list[float], yaw: float | None, timestamp: int):
        # Offboard control mode
        ocm = OffboardControlMode()
        ocm.position = True
        ocm.velocity = False
        ocm.acceleration = False
        ocm.attitude = False
        ocm.body_rate = False
        ocm.timestamp = timestamp

        pub = self._offboard_pubs.get(vid)
        if pub:
            pub.publish(ocm)

        # Trajectory setpoint
        sp = TrajectorySetpoint()
        sp.position = [float(p) for p in position_ned]
        sp.yaw = float(yaw) if yaw is not None else float('nan')
        sp.timestamp = timestamp

        pub = self._setpoint_pubs.get(vid)
        if pub:
            pub.publish(sp)


def main(args=None):
    rclpy.init(args=args)
    node = BehaviorEngine()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
