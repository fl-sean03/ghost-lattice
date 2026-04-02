"""Regroup after partition behavior.

When a network partition is detected, vehicles in isolated subgroups
move toward each other to restore connectivity.
"""

import math
from .base import Behavior

REGROUP_ALT = -35.0


class RegroupAfterPartition(Behavior):
    def __init__(self, vehicle_id: str):
        super().__init__(vehicle_id)
        self._regroup_target = None

    def on_enter(self, state: dict):
        pos = state.get('position_ned', [0.0, 0.0, 0.0])
        # Default: move toward base
        self._regroup_target = [pos[0] * 0.7, pos[1] * 0.7, REGROUP_ALT]

    def tick(self, state: dict, fleet: dict, network: dict | None) -> dict:
        if network and network.get('partitions'):
            partitions = network['partitions']
            # Find which partition we're in
            my_partition = None
            for partition in partitions:
                if self.vehicle_id in partition:
                    my_partition = partition
                    break

            if my_partition and fleet:
                # Find vehicles NOT in our partition
                other_vehicles = []
                for vid, vs in fleet.items():
                    if vid not in my_partition:
                        other_vehicles.append(vs.get('position_ned', [0.0, 0.0, 0.0]))

                if other_vehicles:
                    # Move toward the centroid of the other partition
                    cx = sum(p[0] for p in other_vehicles) / len(other_vehicles)
                    cy = sum(p[1] for p in other_vehicles) / len(other_vehicles)
                    pos = state.get('position_ned', [0.0, 0.0, 0.0])

                    # Move 30% toward the other partition
                    self._regroup_target = [
                        pos[0] + (cx - pos[0]) * 0.3,
                        pos[1] + (cy - pos[1]) * 0.3,
                        REGROUP_ALT,
                    ]

        target = self._regroup_target or [0.0, 0.0, REGROUP_ALT]
        return {'position_ned': target, 'yaw': None}
