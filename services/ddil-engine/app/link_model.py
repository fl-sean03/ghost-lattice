"""
Pairwise link quality model.

Computes link quality between two vehicles as:
  quality = base_quality(distance) * los_factor(terrain) * jammer_attenuation(jammer_fields)
"""

import math
import numpy as np


def base_quality(distance: float, max_range: float) -> float:
    """Distance-based quality: linear falloff from 1.0 at 0m to 0.0 at max_range."""
    if max_range <= 0:
        return 0.0
    return max(0.0, 1.0 - distance / max_range)


def line_of_sight(
    pos1: np.ndarray,
    pos2: np.ndarray,
    buildings: list[dict],
) -> float:
    """Check line-of-sight between two points, considering buildings.

    Returns 1.0 if clear LOS, 0.2 if blocked (attenuated through structure).
    Uses simplified AABB ray-box intersection.
    """
    if not buildings:
        return 1.0

    direction = pos2 - pos1
    length = np.linalg.norm(direction)
    if length < 0.001:
        return 1.0

    direction = direction / length

    for bldg in buildings:
        center = np.array(bldg['center'], dtype=float)
        size = np.array(bldg['size'], dtype=float)
        half = size / 2.0

        bmin = center - half
        bmax = center + half

        # Ray-AABB intersection (slab method)
        t_near = -np.inf
        t_far = np.inf

        for i in range(3):
            if abs(direction[i]) < 1e-8:
                if pos1[i] < bmin[i] or pos1[i] > bmax[i]:
                    t_near = np.inf  # No intersection
                    break
            else:
                t1 = (bmin[i] - pos1[i]) / direction[i]
                t2 = (bmax[i] - pos1[i]) / direction[i]
                if t1 > t2:
                    t1, t2 = t2, t1
                t_near = max(t_near, t1)
                t_far = min(t_far, t2)

        if t_near <= t_far and t_far >= 0 and t_near <= length:
            return 0.2  # LOS blocked

    return 1.0


def jammer_attenuation(
    pos1: np.ndarray,
    pos2: np.ndarray,
    jammers: list[dict],
) -> float:
    """Compute jammer attenuation on a link.

    Each active jammer attenuates based on the closer endpoint's distance to the jammer.
    Attenuation compounds multiplicatively across multiple jammers.
    """
    if not jammers:
        return 1.0

    atten = 1.0
    for jammer in jammers:
        if not jammer.get('active', True):
            continue

        jcenter = np.array(jammer['center'], dtype=float)
        radius = jammer.get('radius_m', 100.0)

        d1 = np.linalg.norm(pos1 - jcenter)
        d2 = np.linalg.norm(pos2 - jcenter)
        min_d = min(d1, d2)

        if min_d < radius:
            # Quadratic falloff inside jammer radius
            atten *= (min_d / radius) ** 2

    return max(0.0, atten)


def link_quality(
    pos1: np.ndarray,
    pos2: np.ndarray,
    max_range: float,
    buildings: list[dict] | None = None,
    jammers: list[dict] | None = None,
) -> float:
    """Compute overall link quality between two positions.

    Returns value between 0.0 (no link) and 1.0 (perfect link).
    """
    distance = float(np.linalg.norm(pos2 - pos1))
    bq = base_quality(distance, max_range)

    los = line_of_sight(pos1, pos2, buildings or [])
    ja = jammer_attenuation(pos1, pos2, jammers or [])

    return bq * los * ja
