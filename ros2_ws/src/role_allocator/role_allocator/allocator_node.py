"""
Role Allocator Node

Implements utility-based role allocation for the drone swarm.
Each vehicle's utility for each eligible role is computed, and roles are
assigned via a simple auction: highest utility wins, ties broken by vehicle ID.

Utility function:
  utility(v, role) = w_health * health_score
                   + w_position * position_advantage
                   + w_sensor * sensor_suitability
                   + w_link * link_utility
                   - w_battery * battery_cost

Reallocation triggers:
  - Initial assignment (mission start)
  - Partition detected
  - Node loss
  - Battery low
  - Operator redirect
  - Periodic rebalance (every 30s)
"""

import math

import rclpy
from rclpy.node import Node

from gl_interfaces.msg import (
    FleetState,
    VehicleState,
    NetworkState,
    RoleAssignment,
    ScenarioEvent,
    AutonomyTrace,
)

# Utility weights
W_HEALTH = 0.20
W_POSITION = 0.25
W_SENSOR = 0.20
W_LINK = 0.20
W_BATTERY = 0.15

# Role requirements: what makes a vehicle good at each role
ROLE_SENSOR_PREFERENCES = {
    'scout': ['rgb_camera'],
    'relay': ['comms_relay'],
    'tracker': ['rgb_camera'],
    'reserve': [],
    'decoy': ['ew_emitter'],
    'edge_anchor': ['comms_relay'],
}

# How important is comms range for each role (0-1)
ROLE_LINK_IMPORTANCE = {
    'scout': 0.3,
    'relay': 1.0,
    'tracker': 0.5,
    'reserve': 0.2,
    'decoy': 0.4,
    'edge_anchor': 0.8,
}

ALL_ROLES = ['scout', 'relay', 'tracker', 'reserve', 'decoy', 'edge_anchor']


class RoleAllocator(Node):
    def __init__(self):
        super().__init__('role_allocator')

        self.declare_parameter('run_id', 'run_0000')
        self.declare_parameter('rebalance_interval_sec', 30.0)
        # Vehicle capabilities (loaded from scenario via param or fleet registry)
        self.declare_parameter('vehicle_payloads_json', '{}')
        self.declare_parameter('vehicle_roles_json', '{}')
        self.declare_parameter('vehicle_comms_ranges_json', '{}')

        self.run_id = self.get_parameter('run_id').value

        # Current state
        self._fleet_state: dict[str, VehicleState] = {}
        self._network_state: NetworkState | None = None
        self._current_roles: dict[str, str] = {}  # vehicle_id -> role
        self._auction_round = 0
        self._initialized = False

        # Vehicle capabilities (will be set from fleet registry)
        self._vehicle_payloads: dict[str, list[str]] = {
            'alpha_1': ['rgb_camera', 'comms_relay'],
            'alpha_2': ['rgb_camera'],
            'bravo_1': ['rgb_camera', 'ew_emitter'],
            'bravo_2': ['rgb_camera'],
            'charlie_1': ['lidar_2d', 'rgb_camera', 'comms_relay'],
            'charlie_2': ['rgb_camera'],
        }
        self._vehicle_eligible_roles: dict[str, list[str]] = {
            'alpha_1': ['scout', 'relay', 'tracker'],
            'alpha_2': ['scout', 'tracker', 'reserve'],
            'bravo_1': ['scout', 'decoy', 'edge_anchor'],
            'bravo_2': ['scout', 'tracker', 'reserve'],
            'charlie_1': ['relay', 'edge_anchor', 'reserve'],
            'charlie_2': ['scout', 'tracker', 'decoy'],
        }
        self._vehicle_comms_range: dict[str, float] = {
            'alpha_1': 800, 'alpha_2': 800,
            'bravo_1': 600, 'bravo_2': 600,
            'charlie_1': 1000, 'charlie_2': 1000,
        }

        # Subscribers
        self.create_subscription(FleetState, '/gl/fleet_state', self._on_fleet, 10)
        self.create_subscription(NetworkState, '/gl/network_state', self._on_network, 10)
        self.create_subscription(ScenarioEvent, '/gl/scenario_event', self._on_scenario_event, 10)

        # Publishers
        self._role_pub = self.create_publisher(RoleAssignment, '/gl/role_assignment', 10)
        self._trace_pub = self.create_publisher(AutonomyTrace, '/gl/autonomy_trace', 10)

        # Rebalance timer
        interval = self.get_parameter('rebalance_interval_sec').value
        self._rebalance_timer = self.create_timer(interval, self._periodic_rebalance)

        self.get_logger().info('Role allocator started')

    def _on_fleet(self, msg: FleetState):
        for vs in msg.vehicles:
            self._fleet_state[vs.vehicle_id] = vs

        if not self._initialized and len(self._fleet_state) >= 4:
            self._initialized = True
            self.get_logger().info(f'Fleet detected ({len(self._fleet_state)} vehicles) — running initial allocation')
            self._reallocate('initial_assignment')

    def _on_network(self, msg: NetworkState):
        old_partitions = self._network_state.partition_count if self._network_state else 1
        self._network_state = msg

        if msg.partition_count > old_partitions:
            self.get_logger().warn(f'Network partition detected: {msg.partition_count} components')
            self._reallocate('partition_detected')

    def _on_scenario_event(self, msg: ScenarioEvent):
        if msg.disruption_type == 'drone_fail':
            self.get_logger().warn(f'Vehicle lost: {msg.target}')
            # Remove from fleet state
            self._fleet_state.pop(msg.target, None)
            self._current_roles.pop(msg.target, None)
            self._reallocate('node_loss')

    def _periodic_rebalance(self):
        if self._initialized and self._fleet_state:
            self._reallocate('utility_rebalance')

    def _reallocate(self, trigger: str):
        """Run utility-based role allocation across all active vehicles."""
        self._auction_round += 1
        active_vehicles = list(self._fleet_state.keys())

        if not active_vehicles:
            return

        # Compute utility matrix: vehicle x role -> score
        utilities: dict[str, dict[str, float]] = {}
        for vid in active_vehicles:
            utilities[vid] = {}
            eligible = self._vehicle_eligible_roles.get(vid, [])
            for role in eligible:
                utilities[vid][role] = self._compute_utility(vid, role)

        # Greedy allocation: assign roles by highest utility
        assigned: dict[str, str] = {}
        taken_roles: dict[str, str] = {}  # role -> vehicle (for unique roles like relay)

        # Sort all (vehicle, role, utility) by utility descending
        bids = []
        for vid, role_utils in utilities.items():
            for role, util in role_utils.items():
                bids.append((util, vid, role))
        bids.sort(reverse=True)

        for util, vid, role in bids:
            if vid in assigned:
                continue
            # For relay, only assign one vehicle (unless partition requires more)
            if role == 'relay' and role in taken_roles:
                # Allow multiple relays if network is partitioned
                if self._network_state and self._network_state.partition_count <= 1:
                    continue
            assigned[vid] = role
            taken_roles[role] = vid

        # Assign remaining vehicles as reserve
        for vid in active_vehicles:
            if vid not in assigned:
                assigned[vid] = 'reserve'

        # Publish role changes
        for vid, new_role in assigned.items():
            old_role = self._current_roles.get(vid, '')
            if old_role != new_role:
                self._publish_role_change(vid, old_role, new_role, trigger, utilities.get(vid, {}))

        self._current_roles = assigned

    def _compute_utility(self, vehicle_id: str, role: str) -> float:
        """Compute utility score for a vehicle-role pair."""
        vs = self._fleet_state.get(vehicle_id)
        if vs is None:
            return 0.0

        # Health score (battery-based)
        health = vs.battery_pct / 100.0

        # Position advantage (simplified: distance from center of operations)
        pos = vs.position_ned
        dist_from_center = math.sqrt(pos[0]**2 + pos[1]**2) if pos else 0.0
        # Scouts benefit from being far out, relays from being central
        if role in ('scout', 'tracker', 'decoy'):
            position_adv = min(1.0, dist_from_center / 200.0)
        elif role in ('relay', 'edge_anchor'):
            position_adv = max(0.0, 1.0 - dist_from_center / 200.0)
        else:
            position_adv = 0.5

        # Sensor suitability
        payloads = self._vehicle_payloads.get(vehicle_id, [])
        preferred = ROLE_SENSOR_PREFERENCES.get(role, [])
        if preferred:
            sensor_score = sum(1 for p in preferred if p in payloads) / len(preferred)
        else:
            sensor_score = 0.5

        # Link utility (comms range advantage)
        comms_range = self._vehicle_comms_range.get(vehicle_id, 500)
        link_importance = ROLE_LINK_IMPORTANCE.get(role, 0.5)
        link_util = min(1.0, comms_range / 1000.0) * link_importance

        # Battery cost (penalize low battery for demanding roles)
        battery_cost = (1.0 - health) * (0.8 if role in ('scout', 'relay') else 0.3)

        utility = (
            W_HEALTH * health
            + W_POSITION * position_adv
            + W_SENSOR * sensor_score
            + W_LINK * link_util
            - W_BATTERY * battery_cost
        )

        return round(utility, 4)

    def _publish_role_change(self, vid: str, old_role: str, new_role: str,
                              trigger: str, role_utilities: dict[str, float]):
        old_util = role_utilities.get(old_role, 0.0) if old_role else 0.0
        new_util = role_utilities.get(new_role, 0.0)

        msg = RoleAssignment()
        msg.stamp = self.get_clock().now().to_msg()
        msg.run_id = self.run_id
        msg.vehicle_id = vid
        msg.old_role = old_role
        msg.new_role = new_role
        msg.trigger = trigger
        msg.utility_delta = new_util - old_util
        msg.battery_ok = True
        msg.position_advantage = 0.0
        msg.link_score_gain = 0.0
        msg.auction_round = self._auction_round
        self._role_pub.publish(msg)

        # Publish autonomy trace
        trace = AutonomyTrace()
        trace.stamp = msg.stamp
        trace.run_id = self.run_id
        trace.vehicle_id = vid
        trace.decision = 'role_change'
        trace.current_role = old_role
        trace.current_health = self._fleet_state[vid].battery_pct / 100.0 if vid in self._fleet_state else 0.0
        trace.partition_detected = (
            self._network_state is not None and self._network_state.partition_count > 1
        )
        trace.time_since_event = 0.0
        trace.alt_roles = list(role_utilities.keys())
        trace.alt_utilities = [role_utilities[r] for r in trace.alt_roles]
        trace.chosen = new_role
        trace.chosen_reason = f'{trigger}: utility={new_util:.3f}'
        self._trace_pub.publish(trace)

        self.get_logger().info(
            f'Role change: {vid} {old_role or "none"} -> {new_role} '
            f'(trigger={trigger}, utility={new_util:.3f})'
        )


def main(args=None):
    rclpy.init(args=args)
    node = RoleAllocator()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
