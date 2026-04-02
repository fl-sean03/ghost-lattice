"""Return to safe anchor behavior.

Used when battery is critically low or vehicle is damaged.
Returns to a safe anchor point (base station or nearest safe landing zone).
"""

from .base import Behavior

BASE_POSITION = [0.0, 0.0, 0.0]
RETURN_ALT = -20.0


class ReturnToAnchor(Behavior):
    def __init__(self, vehicle_id: str):
        super().__init__(vehicle_id)
        self._anchor = list(BASE_POSITION)
        self._anchor[2] = RETURN_ALT

    def on_enter(self, state: dict):
        # Could choose nearest safe zone — for now always return to base
        self._anchor = [BASE_POSITION[0], BASE_POSITION[1], RETURN_ALT]

    def tick(self, state: dict, fleet: dict, network: dict | None) -> dict:
        return {'position_ned': self._anchor, 'yaw': None}
