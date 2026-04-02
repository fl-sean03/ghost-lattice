"""
GPS degradation model.

Defines GPS degradation zones where position accuracy is reduced.
"""

import numpy as np
from pydantic import BaseModel


class GPSDegradationZone(BaseModel):
    id: str
    center: list[float]  # [x, y, z]
    radius_m: float
    accuracy_m: float = 50.0  # degraded accuracy in meters
    active: bool = True

    def degradation_at(self, position: np.ndarray) -> float:
        """Compute GPS degradation at a position.

        Returns accuracy in meters (lower = better).
        Normal GPS: ~1.5m, degraded: up to accuracy_m.
        """
        if not self.active:
            return 1.5  # Normal GPS accuracy

        distance = float(np.linalg.norm(position - np.array(self.center)))
        if distance >= self.radius_m:
            return 1.5

        # Linear interpolation from normal to degraded
        normalized = 1.0 - (distance / self.radius_m)
        return 1.5 + normalized * (self.accuracy_m - 1.5)
