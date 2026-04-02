"""
Partition Detector Node

Monitors NetworkState for network partitions and publishes alerts
when the swarm splits into disconnected subgroups.
"""

import rclpy
from rclpy.node import Node
from gl_interfaces.msg import NetworkState


class PartitionDetector(Node):
    def __init__(self):
        super().__init__('partition_detector')
        self._last_partition_count = 1
        self._partition_start_time = None

        self.create_subscription(NetworkState, '/gl/network_state', self._on_network, 10)
        self.get_logger().info('Partition detector started')

    def _on_network(self, msg: NetworkState):
        count = msg.partition_count

        if count > self._last_partition_count:
            self.get_logger().warn(
                f'PARTITION DETECTED: {self._last_partition_count} -> {count} components. '
                f'Partitions: {msg.partitions}'
            )
            self._partition_start_time = self.get_clock().now()

        elif count < self._last_partition_count:
            if self._partition_start_time:
                elapsed = (self.get_clock().now() - self._partition_start_time).nanoseconds / 1e9
                self.get_logger().info(
                    f'Partition healed: {self._last_partition_count} -> {count} components '
                    f'(partition lasted {elapsed:.1f}s)'
                )
            self._partition_start_time = None

        self._last_partition_count = count


def main(args=None):
    rclpy.init(args=args)
    node = PartitionDetector()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()
