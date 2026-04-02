"""
DDIL Bridge Node

Queries the DDIL engine HTTP API with current fleet positions and
publishes NetworkState to ROS 2. Also forwards ScenarioEvents
(jammer activations, GPS degradation) to the DDIL engine.

Publishes at 1 Hz (matches the DDIL computation cost).
"""

import os

import requests
import rclpy
from rclpy.node import Node

from gl_interfaces.msg import FleetState, NetworkState, NetworkLink, ScenarioEvent

COMMS_RANGES = {
    'alpha_1': 800, 'alpha_2': 800,
    'bravo_1': 600, 'bravo_2': 600,
    'charlie_1': 1000, 'charlie_2': 1000,
}


class DDILBridge(Node):
    def __init__(self):
        super().__init__('ddil_bridge')

        self.declare_parameter('ddil_url', os.environ.get('GL_DDIL_URL', 'http://ddil-engine:8001'))
        self.declare_parameter('run_id', 'run_0000')

        self._ddil_url = self.get_parameter('ddil_url').value
        self._run_id = self.get_parameter('run_id').value
        self._fleet: FleetState | None = None

        self.create_subscription(FleetState, '/gl/fleet_state', self._on_fleet, 10)
        self.create_subscription(ScenarioEvent, '/gl/scenario_event', self._on_scenario, 10)

        self._network_pub = self.create_publisher(NetworkState, '/gl/network_state', 10)

        # Query DDIL engine at 1 Hz
        self._timer = self.create_timer(1.0, self._query_ddil)

        self.get_logger().info(f'DDIL bridge started, engine at {self._ddil_url}')

    def _on_fleet(self, msg: FleetState):
        self._fleet = msg

    def _on_scenario(self, msg: ScenarioEvent):
        """Forward disruption events to the DDIL engine."""
        try:
            if msg.disruption_type in ('jammer_on',):
                requests.post(f'{self._ddil_url}/jammers', json={
                    'id': msg.disruption_id,
                    'center': list(msg.center),
                    'radius_m': msg.radius_m,
                    'strength_dbm': msg.strength_dbm,
                    'active': True,
                }, timeout=2)
            elif msg.disruption_type == 'jammer_off':
                requests.delete(f'{self._ddil_url}/jammers/{msg.disruption_id}', timeout=2)
            elif msg.disruption_type == 'gps_degrade':
                requests.post(f'{self._ddil_url}/gps-zones', json={
                    'id': msg.disruption_id,
                    'center': list(msg.center),
                    'radius_m': msg.radius_m,
                    'accuracy_m': msg.accuracy_m,
                    'active': True,
                }, timeout=2)
        except requests.RequestException as e:
            self.get_logger().warn(f'Failed to forward event to DDIL engine: {e}')

    def _query_ddil(self):
        if not self._fleet or not self._fleet.vehicles:
            return

        vehicles = []
        for vs in self._fleet.vehicles:
            vehicles.append({
                'id': vs.vehicle_id,
                'position': list(vs.position_ned),
                'comms_range': COMMS_RANGES.get(vs.vehicle_id, 800),
            })

        try:
            resp = requests.post(
                f'{self._ddil_url}/network',
                json={'vehicles': vehicles},
                timeout=2,
            )
            resp.raise_for_status()
            data = resp.json()
        except requests.RequestException as e:
            self.get_logger().warn(f'DDIL engine query failed: {e}')
            return

        # Convert to ROS message
        msg = NetworkState()
        msg.stamp = self.get_clock().now().to_msg()
        msg.run_id = self._run_id

        for e in data.get('edges', []):
            link = NetworkLink()
            link.src = e['src']
            link.dst = e['dst']
            link.quality = e['quality']
            link.latency_ms = e['latency_ms']
            link.active = e['active']
            msg.edges.append(link)

        partitions = data.get('partitions', [])
        msg.partitions = [','.join(p) for p in partitions]
        msg.partition_count = data.get('partition_count', 1)

        self._network_pub.publish(msg)


def main(args=None):
    rclpy.init(args=args)
    node = DDILBridge()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()
