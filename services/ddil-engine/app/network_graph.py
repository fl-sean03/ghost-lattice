"""
Network graph computation and partition detection.

Builds the adjacency graph for the swarm and identifies connected components.
"""

import numpy as np
from .link_model import link_quality


def compute_network(
    vehicles: list[dict],
    buildings: list[dict] | None = None,
    jammers: list[dict] | None = None,
) -> dict:
    """Compute full network state for the fleet.

    Args:
        vehicles: list of {id, position, comms_range}
        buildings: list of {center, size}
        jammers: list of {center, radius_m, active}

    Returns:
        dict with edges, partitions, partition_count
    """
    edges = []
    vehicle_ids = [v['id'] for v in vehicles]

    for i, v1 in enumerate(vehicles):
        for j, v2 in enumerate(vehicles):
            if i >= j:
                continue

            pos1 = np.array(v1['position'], dtype=float)
            pos2 = np.array(v2['position'], dtype=float)

            # Use minimum comms range (conservative estimate)
            max_range = min(v1.get('comms_range', 800), v2.get('comms_range', 800))

            quality = link_quality(pos1, pos2, max_range, buildings, jammers)
            active = quality > 0.1
            latency = 10.0 / max(quality, 0.01) if active else 0.0

            edges.append({
                'src': v1['id'],
                'dst': v2['id'],
                'quality': round(quality, 4),
                'latency_ms': round(latency, 1),
                'active': active,
            })

    # Find partitions
    active_edges = [(e['src'], e['dst']) for e in edges if e['active']]
    partitions = find_partitions(vehicle_ids, active_edges)

    return {
        'edges': edges,
        'partitions': partitions,
        'partition_count': len(partitions),
    }


def find_partitions(nodes: list[str], edges: list[tuple[str, str]]) -> list[list[str]]:
    """Find connected components using union-find."""
    parent = {n: n for n in nodes}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    for a, b in edges:
        if a in parent and b in parent:
            union(a, b)

    components: dict[str, list[str]] = {}
    for n in nodes:
        root = find(n)
        components.setdefault(root, []).append(n)

    return list(components.values())
