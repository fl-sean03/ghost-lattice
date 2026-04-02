"""Fan-out search behavior for scout role.

The vehicle flies a lawnmower pattern across the search sector,
maintaining spacing from other scouts.
"""

import math
from .base import Behavior

# Search sector bounds from mission_001 (sector_red)
SECTOR_MIN_X = 100.0
SECTOR_MAX_X = 400.0
SECTOR_MIN_Y = 0.0
SECTOR_MAX_Y = 300.0
SEARCH_ALT = -30.0  # NED: negative = up
LANE_SPACING = 50.0  # meters between parallel legs


class FanOutSearch(Behavior):
    def __init__(self, vehicle_id: str):
        super().__init__(vehicle_id)
        self._waypoints: list[list[float]] = []
        self._wp_idx = 0
        self._approach_threshold = 10.0  # meters

    def on_enter(self, state: dict):
        # Generate lawnmower pattern based on vehicle index
        # Different scouts start from different edges to maximize coverage
        vehicle_idx = hash(self.vehicle_id) % 4
        offset = vehicle_idx * LANE_SPACING / 2

        self._waypoints = []
        y = SECTOR_MIN_Y + offset
        direction = 1  # 1 = east, -1 = west

        while y <= SECTOR_MAX_Y:
            if direction == 1:
                self._waypoints.append([SECTOR_MIN_X, y, SEARCH_ALT])
                self._waypoints.append([SECTOR_MAX_X, y, SEARCH_ALT])
            else:
                self._waypoints.append([SECTOR_MAX_X, y, SEARCH_ALT])
                self._waypoints.append([SECTOR_MIN_X, y, SEARCH_ALT])
            y += LANE_SPACING
            direction *= -1

        self._wp_idx = 0

    def tick(self, state: dict, fleet: dict, network: dict | None) -> dict:
        if not self._waypoints:
            return {'position_ned': [0.0, 0.0, SEARCH_ALT], 'yaw': None}

        target = self._waypoints[self._wp_idx]

        # Check if we've reached the current waypoint
        pos = state.get('position_ned', [0.0, 0.0, 0.0])
        dx = target[0] - pos[0]
        dy = target[1] - pos[1]
        dist = math.sqrt(dx * dx + dy * dy)

        if dist < self._approach_threshold:
            self._wp_idx = (self._wp_idx + 1) % len(self._waypoints)
            target = self._waypoints[self._wp_idx]

        return {'position_ned': target, 'yaw': None}
