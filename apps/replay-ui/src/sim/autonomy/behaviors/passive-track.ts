import { Behavior, type VehicleState, type BehaviorResult, type ThreatContext } from "../behavior";
import type { Vec3 } from "../../ddil/link-model";
import type { NetworkResult } from "../../ddil/network-graph";

const STANDOFF = 30;

/**
 * Tracker behavior: follows a target at standoff distance.
 */
export class PassiveTrack extends Behavior {
  private targetPos: Vec3 | null = null;
  private lastKnown: Vec3 = [250, 180, 0];

  tick(state: VehicleState, _fleet: Map<string, VehicleState>, _network: NetworkResult | null, _threats?: ThreatContext): BehaviorResult {
    const emitter = this.targetPos ?? this.lastKnown;
    const dx = emitter[0] - state.position[0];
    const dy = emitter[1] - state.position[1];
    const dist = Math.sqrt(dx * dx + dy * dy);

    let tx: number, ty: number;
    if (dist > 1) {
      const scale = Math.max(0, (dist - STANDOFF)) / dist;
      tx = state.position[0] + dx * scale;
      ty = state.position[1] + dy * scale;
    } else {
      tx = emitter[0];
      ty = emitter[1];
    }

    // Orbit slowly around target
    const simTime = Date.now() / 1000;
    const orbitR = 25;
    tx += orbitR * Math.cos(simTime * 0.1);
    ty += orbitR * Math.sin(simTime * 0.1);

    return { target: [tx, ty, -25], yaw: null };
  }

  /** Called by SimEngine with emitter position update. */
  updateTarget(pos: Vec3): void {
    this.targetPos = pos;
    this.lastKnown = pos;
  }

  tickWithTime(simTime: number, state: VehicleState): BehaviorResult {
    const emitter = this.targetPos ?? this.lastKnown;
    const orbitR = 25;
    const tx = emitter[0] + orbitR * Math.cos(simTime * 0.1);
    const ty = emitter[1] + orbitR * Math.sin(simTime * 0.1);
    return { target: [tx, ty, -25], yaw: null };
  }
}
