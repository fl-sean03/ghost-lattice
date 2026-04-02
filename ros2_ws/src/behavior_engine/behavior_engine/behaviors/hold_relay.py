"""Hold relay position behavior for relay/edge_anchor roles.

The vehicle positions itself to maximize connectivity between
partitioned groups or between the swarm and the base station.
"""

import math
from .base import Behavior

BASE_POSITION = [0.0, 0.0, 0.0]
RELAY_ALT = -40.0  # Higher altitude for better LOS


class HoldRelay(Behavior):
    def __init__(self, vehicle_id: str):
        super().__init__(vehicle_id)
        self._target = [0.0, 0.0, RELAY_ALT]

    def on_enter(self, state: dict):
        # Initial relay position: midpoint between base and center of search area
        self._target = [50.0, 75.0, RELAY_ALT]

    def tick(self, state: dict, fleet: dict, network: dict | None) -> dict:
        # Compute optimal relay position based on fleet positions
        if fleet:
            # Find centroid of all active vehicles
            positions = []
            for vid, vs in fleet.items():
                if vid != self.vehicle_id:
                    pos = vs.get('position_ned', [0.0, 0.0, 0.0])
                    positions.append(pos)

            if positions:
                # Position relay at midpoint between base and fleet centroid
                cx = sum(p[0] for p in positions) / len(positions)
                cy = sum(p[1] for p in positions) / len(positions)

                self._target = [
                    (BASE_POSITION[0] + cx) / 2,
                    (BASE_POSITION[1] + cy) / 2,
                    RELAY_ALT,
                ]

        return {'position_ned': self._target, 'yaw': None}
