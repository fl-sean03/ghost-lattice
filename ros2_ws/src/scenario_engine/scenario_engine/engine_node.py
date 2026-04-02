"""
Scenario Engine Node

Reads a scenario YAML file and publishes timed ScenarioEvent and
OperatorCommand messages at the scheduled times.

Also publishes mission start/end markers and tracks elapsed simulation time.
"""

from pathlib import Path

import yaml
import rclpy
from rclpy.node import Node

from gl_interfaces.msg import ScenarioEvent, OperatorCommand


class ScenarioEngine(Node):
    def __init__(self):
        super().__init__('scenario_engine')

        self.declare_parameter('scenario_path', '/data/scenarios/mission_001.yaml')
        self.declare_parameter('run_id', 'run_0000')

        scenario_path = self.get_parameter('scenario_path').value
        self.run_id = self.get_parameter('run_id').value

        # Load scenario
        with open(scenario_path) as f:
            self.scenario = yaml.safe_load(f)

        self.duration_sec = self.scenario['duration_sec']
        self.get_logger().info(
            f'Loaded scenario: {self.scenario["scenario_id"]}, '
            f'duration={self.duration_sec}s, '
            f'disruptions={len(self.scenario.get("disruptions", []))}'
        )

        # Build event schedule: list of (time_sec, event_type, data)
        self._schedule = []
        for d in self.scenario.get('disruptions', []):
            self._schedule.append((d['t'], 'disruption', d))
        for op in self.scenario.get('operator_interventions', []):
            self._schedule.append((op['t'], 'operator', op))
        self._schedule.sort(key=lambda x: x[0])

        self._next_event_idx = 0
        self._elapsed = 0.0
        self._mission_started = False
        self._mission_ended = False

        # Publishers
        self._scenario_pub = self.create_publisher(ScenarioEvent, '/gl/scenario_event', 10)
        self._operator_pub = self.create_publisher(OperatorCommand, '/gl/operator_command', 10)

        # 10 Hz timer to track elapsed time and fire events
        self._timer = self.create_timer(0.1, self._tick)

        self.get_logger().info(f'Scenario engine ready. {len(self._schedule)} scheduled events.')

    def _tick(self):
        self._elapsed += 0.1

        if not self._mission_started:
            self._mission_started = True
            self.get_logger().info('Mission started')

        # Check for events to fire
        while (self._next_event_idx < len(self._schedule)
               and self._schedule[self._next_event_idx][0] <= self._elapsed):
            _, event_type, data = self._schedule[self._next_event_idx]
            self._next_event_idx += 1

            if event_type == 'disruption':
                self._fire_disruption(data)
            elif event_type == 'operator':
                self._fire_operator_action(data)

        # Check mission end
        if self._elapsed >= self.duration_sec and not self._mission_ended:
            self._mission_ended = True
            self.get_logger().info(
                f'Mission complete. Duration: {self._elapsed:.1f}s, '
                f'events fired: {self._next_event_idx}/{len(self._schedule)}'
            )

    def _fire_disruption(self, data: dict):
        msg = ScenarioEvent()
        msg.stamp = self.get_clock().now().to_msg()
        msg.run_id = self.run_id
        msg.disruption_type = data.get('type', '')
        msg.disruption_id = data.get('id', '')
        msg.region = data.get('region', '')
        msg.center = [float(c) for c in data.get('center', [0.0, 0.0, 0.0])]
        msg.radius_m = float(data.get('radius_m', 0.0))
        msg.strength_dbm = float(data.get('strength_dbm', 0.0))
        msg.accuracy_m = float(data.get('accuracy_m', 0.0))
        msg.target = data.get('target', '')
        msg.mode = data.get('mode', '')
        msg.affected_entities = []  # Computed by DDIL engine
        msg.scheduled_end_t = float(data.get('t', 0.0) + data.get('duration_sec', 0.0))

        self._scenario_pub.publish(msg)
        self.get_logger().info(
            f'[t={self._elapsed:.0f}s] Disruption: {msg.disruption_type} '
            f'({msg.disruption_id}) target={msg.target or msg.region}'
        )

    def _fire_operator_action(self, data: dict):
        msg = OperatorCommand()
        msg.stamp = self.get_clock().now().to_msg()
        msg.run_id = self.run_id
        msg.action_type = data.get('action', '')
        msg.target = ''
        msg.source = 'scripted'
        msg.reason = data.get('parameters', {}).get('reason', '')

        params = data.get('parameters', {})
        msg.param_keys = list(params.keys())
        msg.param_values = [str(v) for v in params.values()]

        self._operator_pub.publish(msg)
        self.get_logger().info(
            f'[t={self._elapsed:.0f}s] Operator action: {msg.action_type}'
        )


def main(args=None):
    rclpy.init(args=args)
    node = ScenarioEngine()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
