"""
Mission Executor Node

Sends offboard flight commands to PX4 SITL instances.
In Phase 1, this executes simple waypoint missions (takeoff → fly to point → loiter).
In later phases, it receives commands from the behavior engine.

Each PX4 instance requires:
1. OffboardControlMode messages at >=2 Hz to stay in offboard mode
2. TrajectorySetpoint messages with position/velocity targets
3. VehicleCommand to arm and switch to offboard mode
"""

import rclpy
from rclpy.node import Node
from rclpy.qos import QoSProfile, ReliabilityPolicy, HistoryPolicy

from px4_msgs.msg import (
    OffboardControlMode,
    TrajectorySetpoint,
    VehicleCommand,
    VehicleStatus,
)


# Vehicle namespace mapping
VEHICLE_NAMESPACES = {
    0: '',           # alpha_1
    1: '/px4_1',     # alpha_2
    2: '/px4_2',     # bravo_1
    3: '/px4_3',     # bravo_2
    4: '/px4_4',     # charlie_1
    5: '/px4_5',     # charlie_2
}

VEHICLE_NAMES = {
    0: 'alpha_1', 1: 'alpha_2', 2: 'bravo_1',
    3: 'bravo_2', 4: 'charlie_1', 5: 'charlie_2',
}

# Simple waypoint assignments for Phase 1 validation
# Each vehicle gets a takeoff altitude + one waypoint (NED: x=North, y=East, z=Down)
PHASE1_WAYPOINTS = {
    0: {'takeoff_alt': -30.0, 'waypoint': [100.0, 0.0, -30.0]},     # alpha_1 → north
    1: {'takeoff_alt': -30.0, 'waypoint': [100.0, 50.0, -30.0]},    # alpha_2 → northeast
    2: {'takeoff_alt': -25.0, 'waypoint': [50.0, 100.0, -25.0]},    # bravo_1 → east
    3: {'takeoff_alt': -25.0, 'waypoint': [150.0, 100.0, -25.0]},   # bravo_2 → far east
    4: {'takeoff_alt': -35.0, 'waypoint': [50.0, 50.0, -35.0]},     # charlie_1 → center (relay)
    5: {'takeoff_alt': -30.0, 'waypoint': [200.0, 50.0, -30.0]},    # charlie_2 → far north
}


class VehicleController:
    """Controls a single PX4 vehicle instance."""

    def __init__(self, node: Node, instance: int):
        self.node = node
        self.instance = instance
        self.ns = VEHICLE_NAMESPACES[instance]
        self.name = VEHICLE_NAMES[instance]

        px4_qos = QoSProfile(
            reliability=ReliabilityPolicy.BEST_EFFORT,
            history=HistoryPolicy.KEEP_LAST,
            depth=1,
        )

        # Publishers
        self._offboard_pub = node.create_publisher(
            OffboardControlMode, f'{self.ns}/fmu/in/offboard_control_mode', 10)
        self._setpoint_pub = node.create_publisher(
            TrajectorySetpoint, f'{self.ns}/fmu/in/trajectory_setpoint', 10)
        self._command_pub = node.create_publisher(
            VehicleCommand, f'{self.ns}/fmu/in/vehicle_command', 10)

        # Subscribers
        self._nav_state = None
        node.create_subscription(
            VehicleStatus, f'{self.ns}/fmu/out/vehicle_status',
            self._on_status, px4_qos)

        # State machine
        self._state = 'init'  # init → arming → takeoff → waypoint → loiter
        self._offboard_counter = 0
        self._waypoint = PHASE1_WAYPOINTS[instance]

    def _on_status(self, msg: VehicleStatus):
        self._nav_state = msg.nav_state

    def tick(self, timestamp: int):
        """Called at 10 Hz. Drives the state machine."""
        # Always publish offboard control mode
        ocm = OffboardControlMode()
        ocm.position = True
        ocm.velocity = False
        ocm.acceleration = False
        ocm.attitude = False
        ocm.body_rate = False
        ocm.timestamp = timestamp
        self._offboard_pub.publish(ocm)

        if self._state == 'init':
            self._offboard_counter += 1
            # Send setpoints for a few seconds before arming
            self._publish_setpoint(timestamp, [0.0, 0.0, self._waypoint['takeoff_alt']])

            if self._offboard_counter > 20:  # 2 seconds at 10 Hz
                self._state = 'arming'
                self.node.get_logger().info(f'{self.name}: switching to offboard + arming')
                self._send_command(VehicleCommand.VEHICLE_CMD_DO_SET_MODE, 1.0, 6.0, timestamp=timestamp)
                self._send_command(VehicleCommand.VEHICLE_CMD_COMPONENT_ARM_DISARM, 1.0, timestamp=timestamp)

        elif self._state == 'arming':
            self._publish_setpoint(timestamp, [0.0, 0.0, self._waypoint['takeoff_alt']])
            # Check if we're in offboard mode
            if self._nav_state == VehicleStatus.NAVIGATION_STATE_OFFBOARD:
                self._state = 'takeoff'
                self.node.get_logger().info(f'{self.name}: taking off to {-self._waypoint["takeoff_alt"]}m')

        elif self._state == 'takeoff':
            self._publish_setpoint(timestamp, [0.0, 0.0, self._waypoint['takeoff_alt']])
            # Simple altitude check would go here — for now, transition after time
            self._offboard_counter += 1
            if self._offboard_counter > 100:  # ~10 seconds
                self._state = 'waypoint'
                wp = self._waypoint['waypoint']
                self.node.get_logger().info(f'{self.name}: flying to waypoint [{wp[0]}, {wp[1]}, {-wp[2]}m]')

        elif self._state == 'waypoint':
            self._publish_setpoint(timestamp, self._waypoint['waypoint'])
            # Stay in waypoint mode — the vehicle will fly there and hold

        elif self._state == 'loiter':
            self._publish_setpoint(timestamp, self._waypoint['waypoint'])

    def _publish_setpoint(self, timestamp: int, position_ned: list[float]):
        sp = TrajectorySetpoint()
        sp.position = [float(position_ned[0]), float(position_ned[1]), float(position_ned[2])]
        sp.yaw = float('nan')  # Let PX4 choose heading
        sp.timestamp = timestamp
        self._setpoint_pub.publish(sp)

    def _send_command(self, command: int, param1: float = 0.0, param2: float = 0.0, timestamp: int = 0):
        cmd = VehicleCommand()
        cmd.command = command
        cmd.param1 = param1
        cmd.param2 = param2
        cmd.target_system = 1
        cmd.target_component = 1
        cmd.source_system = 1
        cmd.source_component = 1
        cmd.from_external = True
        cmd.timestamp = timestamp
        self._command_pub.publish(cmd)


class MissionExecutor(Node):
    def __init__(self):
        super().__init__('mission_executor')

        self.declare_parameter('num_vehicles', 6)
        self.num_vehicles = self.get_parameter('num_vehicles').value

        # Create a controller for each vehicle
        self._controllers = {}
        for i in range(self.num_vehicles):
            self._controllers[i] = VehicleController(self, i)

        # 10 Hz tick timer
        self._timer = self.create_timer(0.1, self._tick)
        self._tick_count = 0

        self.get_logger().info(f'Mission executor started: {self.num_vehicles} vehicles')

    def _tick(self):
        self._tick_count += 1
        timestamp = int(self.get_clock().now().nanoseconds / 1000)

        for controller in self._controllers.values():
            controller.tick(timestamp)


def main(args=None):
    rclpy.init(args=args)
    node = MissionExecutor()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
