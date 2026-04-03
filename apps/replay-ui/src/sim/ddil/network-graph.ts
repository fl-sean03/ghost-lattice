/**
 * Network graph computation and partition detection.
 * Ported from services/ddil-engine/app/network_graph.py
 */

import { linkQuality, type Vec3, type Building, type JammerDef } from "./link-model";

export interface NetworkEdge {
  src: string;
  dst: string;
  quality: number;
  latency_ms: number;
  active: boolean;
}

export interface NetworkResult {
  edges: NetworkEdge[];
  partitions: string[][];
  partition_count: number;
}

export interface VehiclePos {
  id: string;
  position: Vec3;
  comms_range: number;
}

/** Union-Find with path compression for partition detection. */
export function findPartitions(nodes: string[], edges: [string, string][]): string[][] {
  const parent: Record<string, string> = {};
  for (const n of nodes) parent[n] = n;

  function find(x: string): string {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]; // path compression
      x = parent[x];
    }
    return x;
  }

  for (const [a, b] of edges) {
    if (a in parent && b in parent) {
      const ra = find(a), rb = find(b);
      if (ra !== rb) parent[ra] = rb;
    }
  }

  const components: Record<string, string[]> = {};
  for (const n of nodes) {
    const root = find(n);
    if (!components[root]) components[root] = [];
    components[root].push(n);
  }

  return Object.values(components);
}

/** Compute full network state for the fleet. */
export function computeNetwork(
  vehicles: VehiclePos[],
  buildings: Building[] = [],
  jammers: JammerDef[] = [],
): NetworkResult {
  const edges: NetworkEdge[] = [];
  const vehicleIds = vehicles.map(v => v.id);

  for (let i = 0; i < vehicles.length; i++) {
    for (let j = i + 1; j < vehicles.length; j++) {
      const v1 = vehicles[i], v2 = vehicles[j];
      const maxRange = Math.min(v1.comms_range, v2.comms_range);
      const quality = linkQuality(v1.position, v2.position, maxRange, buildings, jammers);
      const active = quality > 0.1;
      const latency_ms = active ? Math.round(10 / Math.max(quality, 0.01) * 10) / 10 : 0;

      edges.push({ src: v1.id, dst: v2.id, quality: Math.round(quality * 10000) / 10000, latency_ms, active });
    }
  }

  const activeEdges: [string, string][] = edges.filter(e => e.active).map(e => [e.src, e.dst]);
  const partitions = findPartitions(vehicleIds, activeEdges);

  return { edges, partitions, partition_count: partitions.length };
}
