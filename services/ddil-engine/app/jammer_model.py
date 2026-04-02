"""
Jammer zone model.

Defines jammer zones with center, radius, and strength.
Computes signal degradation at any point in space.
"""

import numpy as np
from pydantic import BaseModel


class JammerZone(BaseModel):
    id: str
    center: list[float]  # [x, y, z]
    radius_m: float
    strength_dbm: float = -60.0
    active: bool = True

    def signal_at(self, position: np.ndarray) -> float:
        """Compute jammer signal strength at a position (0-1 scale, 1 = full jamming)."""
        if not self.active:
            return 0.0

        distance = float(np.linalg.norm(position - np.array(self.center)))
        if distance >= self.radius_m:
            return 0.0

        # Quadratic falloff from center
        normalized = distance / self.radius_m
        return (1.0 - normalized) ** 2

    def to_dict(self) -> dict:
        return {
            'center': self.center,
            'radius_m': self.radius_m,
            'strength_dbm': self.strength_dbm,
            'active': self.active,
        }
