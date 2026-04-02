"""
Telemetry Bridge Node

Subscribes to PX4 VehicleOdometry from all 6 drone instances and publishes
a unified FleetState message + individual VehicleState messages.

PX4 SITL instance namespacing:
  Instance 0: /fmu/out/vehicle_odometry
  Instance N: /px4_N/fmu/out/vehicle_odometry  (N=1..5)
"""

import math

import rclpy
from rclpy.node import Node
from rclpy.qos import QoSProfile, ReliabilityPolicy, HistoryPolicy

from px4_msgs.msg import VehicleOdometry, BatteryStatus
from gl_interfaces.msg import VehicleState, FleetState


# Vehicle ID mapping: PX4 instance index -> scenario vehicle ID
VEHICLE_MAP = {
    0: 'alpha_1',
    1: 'alpha_2',
    2: 'bravo_1',
    3: 'bravo_2',
    4: 'charlie_1',
    5: 'charlie_2',
}

# PX4 topic namespaces per instance
def _ns(instance: int) -> str:
    """Return the ROS 2 topic namespace prefix for a PX4 instance."""
    if instance == 0:
        return ''
    return f'/px4_{instance}'


class TelemetryBridge(Node):
    def __init__(self):
        super().__init__('telemetry_bridge')

        self.declare_parameter('num_vehicles', 6)
        self.declare_parameter('run_id', 'run_0000')
        self.declare_parameter('publish_rate_hz', 10.0)

        self.num_vehicles = self.get_parameter('num_vehicles').value
        self.run_id = self.get_parameter('run_id').value
        publish_rate = self.get_parameter('publish_rate_hz').value

        # QoS for PX4 topics (best-effort, keep last)
        px4_qos = QoSProfile(
            reliability=ReliabilityPolicy.BEST_EFFORT,
            history=HistoryPolicy.KEEP_LAST,
            depth=1,
        )

        # Current state per vehicle
        self._states: dict[int, VehicleState] = {}

        # Subscribe to each vehicle's odometry and battery
        for i in range(self.num_vehicles):
            ns = _ns(i)

            self.create_subscription(
                VehicleOdometry,
                f'{ns}/fmu/out/vehicle_odometry',
                lambda msg, idx=i: self._on_odometry(idx, msg),
                px4_qos,
            )

            self.create_subscription(
                BatteryStatus,
                f'{ns}/fmu/out/battery_status',
                lambda msg, idx=i: self._on_battery(idx, msg),
                px4_qos,
            )

        # Publishers
        self._fleet_pub = self.create_publisher(FleetState, '/gl/fleet_state', 10)
        self._vehicle_pubs: dict[int, rclpy.publisher.Publisher] = {}
        for i in range(self.num_vehicles):
            vid = VEHICLE_MAP.get(i, f'vehicle_{i}')
            pub = self.create_publisher(VehicleState, f'/gl/vehicle_state/{vid}', 10)
            self._vehicle_pubs[i] = pub

        # Timer for publishing fleet state
        self._timer = self.create_timer(1.0 / publish_rate, self._publish)

        self.get_logger().info(
            f'Telemetry bridge started: {self.num_vehicles} vehicles, '
            f'run_id={self.run_id}, rate={publish_rate} Hz'
        )

    def _on_odometry(self, instance: int, msg: VehicleOdometry):
        """Process VehicleOdometry from PX4 instance."""
        vid = VEHICLE_MAP.get(instance, f'vehicle_{instance}')

        state = self._states.get(instance, VehicleState())
        state.vehicle_id = vid
        state.run_id = self.run_id
        state.stamp = self.get_clock().now().to_msg()

        # PX4 uses NED frame internally
        if msg.pose_frame == VehicleOdometry.POSE_FRAME_NED:
            state.position_ned = [
                float(msg.position[0]),
                float(msg.position[1]),
                float(msg.position[2]),
            ]
        else:
            # FRD to NED conversion if needed
            state.position_ned = [
                float(msg.position[0]),
                float(msg.position[1]),
                float(msg.position[2]),
            ]

        if msg.velocity_frame == VehicleOdometry.VELOCITY_FRAME_NED:
            state.velocity_ned = [
                float(msg.velocity[0]),
                float(msg.velocity[1]),
                float(msg.velocity[2]),
            ]
        else:
            state.velocity_ned = [
                float(msg.velocity[0]),
                float(msg.velocity[1]),
                float(msg.velocity[2]),
            ]

        # Extract heading from quaternion
        q = msg.q
        if len(q) == 4:
            # Yaw from quaternion (NED: heading = atan2(2*(qw*qz + qx*qy), 1 - 2*(qy*qy + qz*qz)))
            siny_cosp = 2.0 * (q[0] * q[3] + q[1] * q[2])
            cosy_cosp = 1.0 - 2.0 * (q[2] * q[2] + q[3] * q[3])
            state.heading_rad = math.atan2(siny_cosp, cosy_cosp)

        state.armed = True  # Will be updated when we add vehicle_status subscription
        state.flight_mode = 'offboard'

        self._states[instance] = state

    def _on_battery(self, instance: int, msg: BatteryStatus):
        """Process BatteryStatus from PX4 instance."""
        state = self._states.get(instance)
        if state is None:
            return

        state.battery_pct = float(msg.remaining) * 100.0
        # Estimate Wh remaining from percentage and vehicle params
        # Default to 180 Wh capacity (will be overridden by fleet registry)
        state.battery_wh_remaining = float(msg.remaining) * 180.0

    def _publish(self):
        """Publish FleetState and individual VehicleState messages."""
        now = self.get_clock().now().to_msg()

        # Publish individual vehicle states
        for i, state in self._states.items():
            state.stamp = now
            pub = self._vehicle_pubs.get(i)
            if pub:
                pub.publish(state)

        # Publish aggregated fleet state
        fleet = FleetState()
        fleet.stamp = now
        fleet.run_id = self.run_id
        fleet.vehicles = list(self._states.values())
        fleet.active_count = len(self._states)
        self._fleet_pub.publish(fleet)


def main(args=None):
    rclpy.init(args=args)
    node = TelemetryBridge()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
