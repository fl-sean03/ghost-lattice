"""Passive tracking behavior for tracker role.

Follows a mobile emitter/target while maintaining standoff distance.
"""

import math
from .base import Behavior

TRACK_ALT = -25.0
STANDOFF_DISTANCE = 30.0  # meters — don't get too close


class PassiveTrack(Behavior):
    def __init__(self, vehicle_id: str):
        super().__init__(vehicle_id)
        self._target_pos = None
        self._last_known_pos = [200.0, 150.0, 0.0]  # Default search area center

    def on_enter(self, state: dict):
        pass

    def tick(self, state: dict, fleet: dict, network: dict | None) -> dict:
        # In a full implementation, we'd subscribe to emitter detection events.
        # For now, use the mobile emitter trajectory from the scenario:
        # start_position: [300, 250, 0], velocity: [0.5, -0.3, 0]
        # The emitter position is computed by the scenario engine and would be
        # available via a separate topic. Here we estimate based on mission time.

        pos = state.get('position_ned', [0.0, 0.0, 0.0])

        if self._target_pos:
            # Maintain standoff distance
            dx = self._target_pos[0] - pos[0]
            dy = self._target_pos[1] - pos[1]
            dist = math.sqrt(dx * dx + dy * dy)

            if dist > 1.0:
                # Move toward target but stop at standoff distance
                scale = max(0, (dist - STANDOFF_DISTANCE)) / dist
                target = [
                    pos[0] + dx * scale,
                    pos[1] + dy * scale,
                    TRACK_ALT,
                ]
            else:
                target = [self._target_pos[0], self._target_pos[1], TRACK_ALT]
        else:
            # No target — orbit last known position
            target = [self._last_known_pos[0], self._last_known_pos[1], TRACK_ALT]

        return {'position_ned': target, 'yaw': None}

    def update_target(self, position: list[float]):
        """Called when emitter is detected or position updates."""
        self._target_pos = position
        self._last_known_pos = position
