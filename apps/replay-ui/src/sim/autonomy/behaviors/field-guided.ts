/**
 * FieldGuidedBehavior — unified adaptive behavior for all drone roles.
 *
 * Replaces all 7 hardcoded behavior classes. Every drone uses this
 * same class, but with a different ObjectiveFunction based on its role.
 *
 * Decision loop (every REPLAN_INTERVAL ticks):
 * 1. Get ideal target from ObjectiveFunction
 * 2. Sample ~50 candidate positions around current pos + ideal target
 * 3. Score each: objective_value - cost_penalty
 * 4. Pick the best candidate as new target
 * 5. Move toward target (speed-limited)
 *
 * The behavior is fully environment-driven. Same code in an urban
 * canyon vs open field produces completely different movement patterns
 * because the cost field and objectives produce different scores.
 */

import { Behavior, type VehicleState, type BehaviorResult, type ThreatContext } from "../behavior";
import type { NetworkResult } from "../../ddil/network-graph";
import { CostField } from "../cost-field";
import { type ObjectiveFunction, type ObjectiveContext, OBJECTIVE_MAP } from "../objectives";
import type { Vec3 } from "../../ddil/link-model";
import type { SimContext } from "../../context";

const REPLAN_INTERVAL = 5;  // ticks between replans (0.5s at 10Hz)
const NUM_CANDIDATES = 48;  // positions to evaluate per replan
const SAMPLE_RADIUS = 60;   // meters — how far to look from current position

export class FieldGuidedBehavior extends Behavior {
  private objective: ObjectiveFunction;
  private role: string;
  private target: Vec3;
  private ticksSinceReplan = 0;
  private altitude: number;
  private ctx: SimContext | null = null;
  private replanCount = 0;        // increments each replan — used for exploration noise
  private stagnationTicks = 0;    // how long the drone hasn't moved significantly
  private lastPosition: Vec3 = [0, 0, 0];

  // Shared state injected by engine before tick
  costField: CostField | null = null;
  objectiveContext: ObjectiveContext | null = null;

  constructor(vehicleId: string, role: string = "scout") {
    super(vehicleId);
    this.role = role;
    this.objective = OBJECTIVE_MAP[role] ?? OBJECTIVE_MAP.scout;
    this.target = [0, 0, -30];
    this.altitude = -30;
  }

  configure(ctx: SimContext): void {
    this.ctx = ctx;
    this.altitude = ctx.altitudes[this.role] ?? -30;
  }

  onEnter(state: VehicleState): void {
    this.target = [state.position[0], state.position[1], this.altitude];
    this.ticksSinceReplan = REPLAN_INTERVAL; // force immediate replan
  }

  tick(
    state: VehicleState,
    _fleet: Map<string, VehicleState>,
    _network: NetworkResult | null,
    _threats?: ThreatContext,
  ): BehaviorResult {
    this.ticksSinceReplan++;

    // Track stagnation — if drone hasn't moved >5m, increase urgency to explore
    const dx = state.position[0] - this.lastPosition[0];
    const dy = state.position[1] - this.lastPosition[1];
    if (Math.sqrt(dx * dx + dy * dy) < 5) {
      this.stagnationTicks = Math.min(200, this.stagnationTicks + 1); // cap at 200 (20s)
    } else {
      this.stagnationTicks = 0;
    }
    this.lastPosition = [...state.position] as Vec3;

    if (this.ticksSinceReplan >= REPLAN_INTERVAL && this.costField && this.objectiveContext) {
      this.ticksSinceReplan = 0;
      this.replanCount++;
      this._replan(state);
    }

    return { target: this.target, yaw: null };
  }

  private _replan(state: VehicleState): void {
    const cf = this.costField!;
    const oc = this.objectiveContext!;
    const px = state.position[0];
    const py = state.position[1];

    // IMMEDIATE ESCAPE: role-aware threshold (scouts tolerate more, relay less)
    const escapeThresholds: Record<string, number> = {
      scout: 0.45, relay: 0.25, tracker: 0.35, decoy: 0.35,
      reserve: 0.2, edge_anchor: 0.25, return_anchor: 0.6,
    };
    const escapeThreshold = escapeThresholds[this.role] ?? 0.3;
    const currentCost = cf.query(px, py);
    if (currentCost > escapeThreshold) {
      let bestEscape: { x: number; y: number; cost: number } | null = null;
      for (let i = 0; i < 32; i++) {
        const angle = (i / 32) * Math.PI * 2;
        for (const r of [60, 100, 150, 200, 300, 400]) {
          const ex = px + r * Math.cos(angle);
          const ey = py + r * Math.sin(angle);
          if (!cf.isPassable(ex, ey)) continue;
          const ec = cf.query(ex, ey);
          if (ec < currentCost * 0.5 && (!bestEscape || ec < bestEscape.cost)) {
            bestEscape = { x: ex, y: ey, cost: ec };
          }
        }
      }
      if (bestEscape) {
        this.target = [bestEscape.x, bestEscape.y, this.altitude];
        return;
      }
    }

    // Exploration boost when stagnant
    const explorationBoost = Math.min(0.3, this.stagnationTicks * 0.005);

    // Deterministic but varying angle offset per replan (prevents same candidates every time)
    const angleOffset = (this.replanCount * 0.618033988) * Math.PI * 2; // golden ratio rotation

    // Increase search radius when stagnant (capped to prevent wild jumps)
    const effectiveRadius = Math.min(180, SAMPLE_RADIUS + this.stagnationTicks * 0.5);

    // Generate candidate positions
    const candidates: Array<{ x: number; y: number; score: number }> = [];

    for (let i = 0; i < NUM_CANDIDATES; i++) {
      const angle = angleOffset + (i / NUM_CANDIDATES) * Math.PI * 2;
      for (const rFrac of [0.3, 0.6, 1.0]) {
        const r = effectiveRadius * rFrac;
        const cx = px + r * Math.cos(angle);
        const cy = py + r * Math.sin(angle);

        if (!cf.isPassable(cx, cy)) continue;

        const cost = cf.query(cx, cy);

        // HARD REJECT: don't even consider positions with very high cost
        // This prevents drones from drifting into jammer centers
        if (cost > 0.6) continue;

        const objectiveScore = this.objective.evaluate(cx, cy, oc);

        // Novelty bonus: only for low-cost positions
        const distFromCurrent = Math.sqrt((cx - px) ** 2 + (cy - py) ** 2);
        const rawNovelty = Math.min(0.15, distFromCurrent / 400) + explorationBoost;
        const noveltyBonus = rawNovelty * Math.max(0, 1 - cost * 2);

        const score = objectiveScore + noveltyBonus - cost * 2.0;

        candidates.push({ x: cx, y: cy, score });
      }
    }

    // Also sample around the best objective candidate (greedy pull)
    let bestObj = -Infinity;
    let idealX = px, idealY = py;
    for (const c of candidates) {
      const objOnly = this.objective.evaluate(c.x, c.y, oc);
      if (objOnly > bestObj) { bestObj = objOnly; idealX = c.x; idealY = c.y; }
    }

    for (let i = 0; i < 8; i++) {
      const angle = angleOffset + (i / 8) * Math.PI * 2;
      const cx = idealX + 30 * Math.cos(angle);
      const cy = idealY + 30 * Math.sin(angle);
      if (!cf.isPassable(cx, cy)) continue;
      const cost = cf.query(cx, cy);
      const objectiveScore = this.objective.evaluate(cx, cy, oc);
      const distFromCurrent = Math.sqrt((cx - px) ** 2 + (cy - py) ** 2);
      const rawNovelty = Math.min(0.15, distFromCurrent / 400) + explorationBoost;
      const noveltyBonus = rawNovelty * Math.max(0, 1 - cost * 2);
      candidates.push({ x: cx, y: cy, score: objectiveScore + noveltyBonus - cost * 1.5 });
    }

    // If no valid candidates (stuck in high-cost zone), do an emergency escape search
    // at much larger radius to find a safe position outside the threat zone
    if (candidates.length === 0) {
      const escapeRadius = effectiveRadius * 3;
      for (let i = 0; i < 16; i++) {
        const angle = angleOffset + (i / 16) * Math.PI * 2;
        for (const rFrac of [1.5, 2.0, 3.0]) {
          const r = SAMPLE_RADIUS * rFrac;
          const cx = px + r * Math.cos(angle);
          const cy = py + r * Math.sin(angle);
          if (!cf.isPassable(cx, cy)) continue;
          const cost = cf.query(cx, cy);
          // Accept anything lower cost than current position
          if (cost < cf.query(px, py)) {
            candidates.push({ x: cx, y: cy, score: -cost }); // minimize cost
          }
        }
      }
      if (candidates.length === 0) return; // truly trapped
    }

    let best = candidates[0];
    for (const c of candidates) {
      if (c.score > best.score) best = c;
    }

    this.target = [best.x, best.y, this.altitude];
  }
}
