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

    if (this.ticksSinceReplan >= REPLAN_INTERVAL && this.costField && this.objectiveContext) {
      this.ticksSinceReplan = 0;
      this._replan(state);
    }

    return { target: this.target, yaw: null };
  }

  private _replan(state: VehicleState): void {
    const cf = this.costField!;
    const oc = this.objectiveContext!;
    const px = state.position[0];
    const py = state.position[1];

    // Generate candidate positions
    const candidates: Array<{ x: number; y: number; score: number }> = [];

    // Ring of candidates around current position
    for (let i = 0; i < NUM_CANDIDATES; i++) {
      const angle = (i / NUM_CANDIDATES) * Math.PI * 2;
      for (const r of [SAMPLE_RADIUS * 0.3, SAMPLE_RADIUS * 0.7, SAMPLE_RADIUS]) {
        const cx = px + r * Math.cos(angle);
        const cy = py + r * Math.sin(angle);

        if (!cf.isPassable(cx, cy)) continue;

        const cost = cf.query(cx, cy);
        const objectiveScore = this.objective.evaluate(cx, cy, oc);

        // Combined score: high objective, low cost
        // The balance here is key — cost penalty scales with a multiplier
        // so threats actually matter more than marginal objective gains
        const score = objectiveScore - cost * 1.5;

        candidates.push({ x: cx, y: cy, score });
      }
    }

    // Also sample around the "ideal" objective target (greedy pull)
    // Find the globally best objective position from the candidates
    let bestObj = -Infinity;
    let idealX = px, idealY = py;
    for (const c of candidates) {
      const objOnly = this.objective.evaluate(c.x, c.y, oc);
      if (objOnly > bestObj) { bestObj = objOnly; idealX = c.x; idealY = c.y; }
    }

    // Sample a few more around the ideal target
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const cx = idealX + 30 * Math.cos(angle);
      const cy = idealY + 30 * Math.sin(angle);
      if (!cf.isPassable(cx, cy)) continue;
      const cost = cf.query(cx, cy);
      const objectiveScore = this.objective.evaluate(cx, cy, oc);
      candidates.push({ x: cx, y: cy, score: objectiveScore - cost * 1.5 });
    }

    // Pick the best candidate
    if (candidates.length === 0) {
      // Nowhere to go — hold position
      return;
    }

    let best = candidates[0];
    for (const c of candidates) {
      if (c.score > best.score) best = c;
    }

    this.target = [best.x, best.y, this.altitude];
  }
}
