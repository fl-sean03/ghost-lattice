"""
Mesh Awareness Node

Builds and publishes the current connectivity graph based on
vehicle positions and the DDIL engine's link quality data.
This is a lightweight wrapper — the actual link computation
happens in the DDIL engine service.
"""

import rclpy
from rclpy.node import Node
from gl_interfaces.msg import FleetState, NetworkState, NetworkLink


class MeshAwareness(Node):
    def __init__(self):
        super().__init__('mesh_awareness')

        self._fleet_state = None

        self.create_subscription(FleetState, '/gl/fleet_state', self._on_fleet, 10)

        self._network_pub = self.create_publisher(NetworkState, '/gl/network_state', 10)

        # Publish network state at 1 Hz (lower rate than fleet state)
        self._timer = self.create_timer(1.0, self._publish_network)

        self.get_logger().info('Mesh awareness started (1 Hz network state)')

    def _on_fleet(self, msg: FleetState):
        self._fleet_state = msg

    def _publish_network(self):
        """Compute and publish network state.

        In the full system, this queries the DDIL engine via HTTP.
        For Phase 1/2, it computes simple distance-based connectivity.
        """
        if not self._fleet_state or not self._fleet_state.vehicles:
            return

        vehicles = self._fleet_state.vehicles
        edges = []

        # Simple distance-based link model (replaced by DDIL engine in Phase 4)
        for i, v1 in enumerate(vehicles):
            for j, v2 in enumerate(vehicles):
                if i >= j:
                    continue

                # Compute distance
                dx = v1.position_ned[0] - v2.position_ned[0]
                dy = v1.position_ned[1] - v2.position_ned[1]
                dz = v1.position_ned[2] - v2.position_ned[2]
                dist = (dx*dx + dy*dy + dz*dz) ** 0.5

                # Use minimum comms range of the pair (conservative)
                # Default range: 800m (will be vehicle-specific later)
                max_range = 800.0
                quality = max(0.0, 1.0 - dist / max_range)
                active = quality > 0.1

                link = NetworkLink()
                link.src = v1.vehicle_id
                link.dst = v2.vehicle_id
                link.quality = quality
                link.latency_ms = 10.0 / max(quality, 0.01) if active else 0.0
                link.active = active
                edges.append(link)

        # Compute partitions using union-find
        partitions = self._find_partitions(
            [v.vehicle_id for v in vehicles],
            [(e.src, e.dst) for e in edges if e.active]
        )

        msg = NetworkState()
        msg.stamp = self.get_clock().now().to_msg()
        msg.run_id = ''  # Set by event recorder
        msg.edges = edges
        msg.partitions = [','.join(p) for p in partitions]
        msg.partition_count = len(partitions)
        self._network_pub.publish(msg)

    def _find_partitions(self, nodes: list[str], edges: list[tuple[str, str]]) -> list[list[str]]:
        """Find connected components using union-find."""
        parent = {n: n for n in nodes}

        def find(x):
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        def union(a, b):
            ra, rb = find(a), find(b)
            if ra != rb:
                parent[ra] = rb

        for a, b in edges:
            union(a, b)

        components: dict[str, list[str]] = {}
        for n in nodes:
            root = find(n)
            components.setdefault(root, []).append(n)

        return list(components.values())


def main(args=None):
    rclpy.init(args=args)
    node = MeshAwareness()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()
