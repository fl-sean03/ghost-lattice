"""Base behavior class for all drone behaviors."""

from abc import ABC, abstractmethod


class Behavior(ABC):
    """Base class for vehicle behaviors.

    Each behavior produces a target position (NED) and yaw for the vehicle.
    The behavior engine calls tick() at 10 Hz and sends the resulting
    setpoint to the mission executor.
    """

    def __init__(self, vehicle_id: str):
        self.vehicle_id = vehicle_id

    @abstractmethod
    def tick(self, state: dict, fleet: dict, network: dict | None) -> dict:
        """Compute the next setpoint.

        Args:
            state: Current vehicle state (position_ned, velocity_ned, battery_pct, etc.)
            fleet: Dict of all vehicle states {vehicle_id: state_dict}
            network: Network state (edges, partitions) or None if unavailable

        Returns:
            dict with keys:
                position_ned: [x, y, z] target position
                yaw: target yaw in radians (or None for auto)
        """
        ...

    def on_enter(self, state: dict):
        """Called when behavior is first activated."""
        pass

    def on_exit(self):
        """Called when behavior is deactivated."""
        pass
