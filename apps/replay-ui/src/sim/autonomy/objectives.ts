/**
 * ObjectiveFunction — per-role position desirability scoring.
 *
 * Each role has a different answer to "is this a good spot for me?"
 * Pure functions: evaluate(x, y, context) → score (0 = useless, 1 = ideal).
 * No pathfinding, no obstacle avoidance — that's the CostField's job.
 */

import { type Vec3, linkQuality } from "../ddil/link-model";
import type { VehicleState } from "./behavior";

/** Context passed to all objectives each tick. */
export interface ObjectiveContext {
  /** Positions of all alive drones in the fleet. */
  fleetPositions: Map<string, Vec3>;
  /** Search sector bounds. */
  searchBounds: [[number, number], [number, number]];
  /** Set of visited coverage cells (from scoring engine). */
  visitedCells: Set<string>;
  /** Cell size for coverage grid. */
  cellSize: number;
  /** Active emitter positions. */
  emitters: Vec3[];
  /** Base station position. */
  baseStation: Vec3;
  /** Current vehicle's ID (to exclude self from fleet). */
  selfId: string;
  /** Current vehicle's position. */
  selfPosition: Vec3;
  /** Comms ranges per vehicle. */
  commsRanges: Map<string, number>;
}

export interface ObjectiveFunction {
  /** Score how desirable position (x, y) is for this role. 0 = useless, 1 = ideal. */
  evaluate(x: number, y: number, ctx: ObjectiveContext): number;
}

/**
 * Scout: seeks uncovered coverage cells.
 * Higher score for positions near many unvisited cells.
 */
export class ScoutObjective implements ObjectiveFunction {
  evaluate(x: number, y: number, ctx: ObjectiveContext): number {
    const [min, max] = ctx.searchBounds;
    // Penalty for being outside search sector
    if (x < min[0] || x > max[0] || y < min[1] || y > max[1]) {
      // Still some value — approaching the sector
      const dxIn = Math.max(0, min[0] - x, x - max[0]);
      const dyIn = Math.max(0, min[1] - y, y - max[1]);
      return Math.max(0, 0.3 - (dxIn + dyIn) / 500);
    }

    // Count unvisited cells in a radius around this position
    const radius = 3; // cells
    const cx = Math.floor(x / ctx.cellSize);
    const cy = Math.floor(y / ctx.cellSize);
    let unvisited = 0;
    let total = 0;
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        if (dx * dx + dy * dy > radius * radius) continue;
        total++;
        if (!ctx.visitedCells.has(`${cx + dx},${cy + dy}`)) {
          unvisited++;
        }
      }
    }

    // Score: fraction of unvisited cells in neighborhood
    const coverageNeed = total > 0 ? unvisited / total : 0;

    // Bonus for being spread from other scouts
    let spreadBonus = 0;
    for (const [id, pos] of ctx.fleetPositions) {
      if (id === ctx.selfId) continue;
      const d = Math.sqrt((x - pos[0]) ** 2 + (y - pos[1]) ** 2);
      if (d > 80) spreadBonus += 0.05; // reward being far from teammates
    }
    spreadBonus = Math.min(0.2, spreadBonus);

    return Math.min(1, coverageNeed * 0.8 + spreadBonus);
  }
}

/**
 * Relay: seeks positions that maximize fleet connectivity.
 * Best position: where link quality to both base and scouts is maximized.
 */
export class RelayObjective implements ObjectiveFunction {
  evaluate(x: number, y: number, ctx: ObjectiveContext): number {
    if (ctx.fleetPositions.size <= 1) return 0.5; // nothing to relay

    const pos: Vec3 = [x, y, -40]; // relay altitude
    let minQuality = Infinity;
    let totalQuality = 0;
    let count = 0;

    // Score: minimum link quality to any fleet member (want to maximize the minimum)
    for (const [id, fp] of ctx.fleetPositions) {
      if (id === ctx.selfId) continue;
      const range = ctx.commsRanges.get(id) ?? 800;
      const q = linkQuality(pos, fp, Math.min(range, 800));
      minQuality = Math.min(minQuality, q);
      totalQuality += q;
      count++;
    }

    // Also consider link to base
    const baseQ = linkQuality(pos, ctx.baseStation, 800);
    minQuality = Math.min(minQuality, baseQ);

    if (minQuality === Infinity) return 0;

    // Combine: prioritize raising the minimum link + reward total connectivity
    return Math.min(1, minQuality * 0.6 + (count > 0 ? totalQuality / count : 0) * 0.4);
  }
}

/**
 * Tracker: seeks standoff distance from nearest emitter.
 * Ideal position: ~25-40m from emitter, on the side with lower cost.
 */
export class TrackerObjective implements ObjectiveFunction {
  private standoff = 30;

  evaluate(x: number, y: number, ctx: ObjectiveContext): number {
    if (ctx.emitters.length === 0) {
      // No emitter — score based on being in search area (patrol mode)
      const [min, max] = ctx.searchBounds;
      const inBounds = x >= min[0] && x <= max[0] && y >= min[1] && y <= max[1];
      return inBounds ? 0.3 : 0.1;
    }

    // Find nearest emitter
    let bestScore = 0;
    for (const em of ctx.emitters) {
      const dist = Math.sqrt((x - em[0]) ** 2 + (y - em[1]) ** 2);
      // Gaussian-like score peaking at standoff distance
      const deviation = Math.abs(dist - this.standoff);
      const score = Math.exp(-deviation * deviation / (2 * 20 * 20)); // sigma = 20m
      bestScore = Math.max(bestScore, score);
    }

    return bestScore;
  }
}

/**
 * Decoy: seeks positions at sector perimeter, away from actual scouts.
 * Unpredictable positioning to draw adversary attention.
 */
export class DecoyObjective implements ObjectiveFunction {
  evaluate(x: number, y: number, ctx: ObjectiveContext): number {
    const [min, max] = ctx.searchBounds;
    const cx = (min[0] + max[0]) / 2;
    const cy = (min[1] + max[1]) / 2;

    // Prefer positions near the edge of the search sector
    const dxEdge = Math.min(Math.abs(x - min[0]), Math.abs(x - max[0]));
    const dyEdge = Math.min(Math.abs(y - min[1]), Math.abs(y - max[1]));
    const edgeDist = Math.min(dxEdge, dyEdge);
    const perimeterScore = Math.max(0, 1 - edgeDist / 100); // peaks at edge

    // Bonus for being far from scouts (draw attention away)
    let farFromScouts = 0;
    let scoutCount = 0;
    for (const [id, pos] of ctx.fleetPositions) {
      if (id === ctx.selfId) continue;
      const d = Math.sqrt((x - pos[0]) ** 2 + (y - pos[1]) ** 2);
      farFromScouts += Math.min(1, d / 200);
      scoutCount++;
    }
    const scoutAvoidance = scoutCount > 0 ? farFromScouts / scoutCount : 0.5;

    return Math.min(1, perimeterScore * 0.5 + scoutAvoidance * 0.5);
  }
}

/**
 * Reserve: stay near base, low cost area, ready for reassignment.
 */
export class ReserveObjective implements ObjectiveFunction {
  evaluate(x: number, y: number, ctx: ObjectiveContext): number {
    const d = Math.sqrt((x - ctx.baseStation[0]) ** 2 + (y - ctx.baseStation[1]) ** 2);
    return Math.max(0, 1 - d / 200); // peaks at base station
  }
}

/** Map role names to objective functions. */
export const OBJECTIVE_MAP: Record<string, ObjectiveFunction> = {
  scout: new ScoutObjective(),
  relay: new RelayObjective(),
  tracker: new TrackerObjective(),
  decoy: new DecoyObjective(),
  reserve: new ReserveObjective(),
  edge_anchor: new RelayObjective(), // same as relay
  return_anchor: new ReserveObjective(), // same as reserve (will be overridden by RTH logic)
};
