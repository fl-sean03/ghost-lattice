/**
 * TaskDecomposer — splits a search area into sub-regions for each scout.
 *
 * Uses Voronoi-like partitioning: each scout "owns" the part of the
 * search sector closest to it. This is computed locally by every drone
 * using the same algorithm + same fleet state → same result.
 *
 * When disconnected: drone continues sweeping its last known region.
 * When reconnected: regions recompute from merged fleet state.
 *
 * Re-decomposition triggers (event-driven, NOT periodic):
 *   - Scout added or killed
 *   - Jammer placed or removed (modifies effective search area)
 *   - Reconnection after partition (state sync)
 */

import type { Vec3 } from "../ddil/link-model";

export interface SubRegion {
  /** ID of the drone that owns this region. */
  ownerId: string;
  /** Bounding box [minX, minY, maxX, maxY]. */
  bounds: [number, number, number, number];
  /** Center point of this region. */
  center: [number, number];
}

/**
 * Decompose a search area into sub-regions for N scouts.
 *
 * Algorithm: grid-based Voronoi approximation.
 * - Divide the search sector into a fine grid (20m cells)
 * - Assign each cell to the nearest scout
 * - Compute bounding box of each scout's assigned cells
 *
 * This is deterministic: same scoutPositions → same decomposition.
 * Every drone runs this locally and gets the same answer.
 */
export function decomposeSearchArea(
  searchBounds: [[number, number], [number, number]],
  scoutPositions: Map<string, [number, number]>,
  threatZones: Array<{ center: Vec3; radius: number }> = [],
): SubRegion[] {
  const [min, max] = searchBounds;
  const scouts = [...scoutPositions.entries()];
  if (scouts.length === 0) return [];

  const cellSize = 20; // 20m grid for Voronoi approximation
  const cols = Math.ceil((max[0] - min[0]) / cellSize);
  const rows = Math.ceil((max[1] - min[1]) / cellSize);

  // Track which cells belong to which scout + bounds
  const assignment = new Map<string, { minX: number; minY: number; maxX: number; maxY: number; sumX: number; sumY: number; count: number }>();
  for (const [id] of scouts) {
    assignment.set(id, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, sumX: 0, sumY: 0, count: 0 });
  }

  // Assign each cell to nearest scout (Voronoi)
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const cx = min[0] + (col + 0.5) * cellSize;
      const cy = min[1] + (row + 0.5) * cellSize;

      // Skip cells inside threat zones (jammed area = not searchable)
      let inThreat = false;
      for (const tz of threatZones) {
        const d = Math.sqrt((cx - tz.center[0]) ** 2 + (cy - tz.center[1]) ** 2);
        if (d < tz.radius * 0.7) { inThreat = true; break; } // deep inside = skip
      }
      if (inThreat) continue;

      // Find nearest scout
      let nearestId = scouts[0][0];
      let nearestDist = Infinity;
      for (const [id, pos] of scouts) {
        const d = Math.sqrt((cx - pos[0]) ** 2 + (cy - pos[1]) ** 2);
        if (d < nearestDist) { nearestDist = d; nearestId = id; }
      }

      const a = assignment.get(nearestId)!;
      a.minX = Math.min(a.minX, cx - cellSize / 2);
      a.minY = Math.min(a.minY, cy - cellSize / 2);
      a.maxX = Math.max(a.maxX, cx + cellSize / 2);
      a.maxY = Math.max(a.maxY, cy + cellSize / 2);
      a.sumX += cx;
      a.sumY += cy;
      a.count++;
    }
  }

  // Build SubRegion objects
  const regions: SubRegion[] = [];
  for (const [id, a] of assignment) {
    if (a.count === 0) continue; // scout has no assigned cells (surrounded by threats)
    regions.push({
      ownerId: id,
      bounds: [a.minX, a.minY, a.maxX, a.maxY],
      center: [a.sumX / a.count, a.sumY / a.count],
    });
  }

  return regions;
}

/**
 * Generate a sweep path within a sub-region.
 * Returns an ordered list of waypoints for a lawnmower pattern.
 */
export function generateSweepPath(
  region: SubRegion,
  laneSpacing = 30,
  direction: "horizontal" | "vertical" = "horizontal",
): Array<[number, number]> {
  const [minX, minY, maxX, maxY] = region.bounds;
  const waypoints: Array<[number, number]> = [];

  if (direction === "horizontal") {
    let goingRight = true;
    for (let y = minY + laneSpacing / 2; y <= maxY; y += laneSpacing) {
      if (goingRight) {
        waypoints.push([minX, y]);
        waypoints.push([maxX, y]);
      } else {
        waypoints.push([maxX, y]);
        waypoints.push([minX, y]);
      }
      goingRight = !goingRight;
    }
  } else {
    let goingDown = true;
    for (let x = minX + laneSpacing / 2; x <= maxX; x += laneSpacing) {
      if (goingDown) {
        waypoints.push([x, minY]);
        waypoints.push([x, maxY]);
      } else {
        waypoints.push([x, maxY]);
        waypoints.push([x, minY]);
      }
      goingDown = !goingDown;
    }
  }

  // If no waypoints generated (tiny region), use the center
  if (waypoints.length === 0) {
    waypoints.push(region.center);
  }

  return waypoints;
}
