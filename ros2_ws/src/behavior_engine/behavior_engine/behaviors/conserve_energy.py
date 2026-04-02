"""Conserve energy behavior for reserve role.

The vehicle holds position at a safe location, minimizing movement
to preserve battery for potential reassignment.
"""

from .base import Behavior

RESERVE_ALT = -35.0


class ConserveEnergy(Behavior):
    def __init__(self, vehicle_id: str):
        super().__init__(vehicle_id)
        self._hold_position = None

    def on_enter(self, state: dict):
        pos = state.get('position_ned', [0.0, 0.0, 0.0])
        # Hold current position at reserve altitude
        self._hold_position = [pos[0], pos[1], RESERVE_ALT]

    def tick(self, state: dict, fleet: dict, network: dict | None) -> dict:
        if self._hold_position is None:
            pos = state.get('position_ned', [0.0, 0.0, 0.0])
            self._hold_position = [pos[0], pos[1], RESERVE_ALT]

        return {'position_ned': self._hold_position, 'yaw': None}
