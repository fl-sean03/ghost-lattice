"""Decoy emission behavior.

The vehicle moves to a designated area and emits false signals
to confuse adversary sensors, drawing attention away from the
actual search/track operations.
"""

import math
from .base import Behavior

DECOY_ALT = -20.0  # Lower altitude for closer signature


class DecoyEmit(Behavior):
    def __init__(self, vehicle_id: str):
        super().__init__(vehicle_id)
        self._pattern_points: list[list[float]] = []
        self._point_idx = 0
        self._approach_threshold = 15.0

    def on_enter(self, state: dict):
        # Fly a figure-8 pattern at the edge of the search area
        # to create a convincing movement signature
        cx, cy = 80.0, 150.0  # Edge of search sector
        radius = 40.0

        self._pattern_points = []
        for i in range(16):
            angle = (i / 16.0) * 2 * math.pi
            if i < 8:
                x = cx + radius * math.cos(angle * 2)
                y = cy + radius * math.sin(angle * 2) * 0.5
            else:
                x = cx - radius * math.cos(angle * 2)
                y = cy + radius * math.sin(angle * 2) * 0.5
            self._pattern_points.append([x, y, DECOY_ALT])

        self._point_idx = 0

    def tick(self, state: dict, fleet: dict, network: dict | None) -> dict:
        if not self._pattern_points:
            return {'position_ned': [80.0, 150.0, DECOY_ALT], 'yaw': None}

        target = self._pattern_points[self._point_idx]
        pos = state.get('position_ned', [0.0, 0.0, 0.0])

        dx = target[0] - pos[0]
        dy = target[1] - pos[1]
        dist = math.sqrt(dx * dx + dy * dy)

        if dist < self._approach_threshold:
            self._point_idx = (self._point_idx + 1) % len(self._pattern_points)

        return {'position_ned': target, 'yaw': None}
