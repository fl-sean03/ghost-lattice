// Replay data store — loads JSONL event files and provides time-indexed access

import {
  GhostEvent,
  VehicleStatePayload,
  NetworkStatePayload,
  ScenarioEventPayload,
  RoleAssignmentPayload,
  RunMetadata,
  Scorecard,
  WorldSnapshot,
} from "./types";

export class ReplayStore {
  metadata: RunMetadata | null = null;
  scorecard: Scorecard | null = null;
  vehicleStates: GhostEvent[] = [];
  networkStates: GhostEvent[] = [];
  scenarioEvents: GhostEvent[] = [];
  roleAssignments: GhostEvent[] = [];
  operatorActions: GhostEvent[] = [];
  missionMetrics: GhostEvent[] = [];
  objectiveStates: GhostEvent[] = [];
  autonomyTraces: GhostEvent[] = [];
  allEvents: GhostEvent[] = [];

  private startTime: number = 0;
  duration: number = 300;

  async loadFromFiles(basePath: string) {
    const [
      metaResp, scorecardResp,
      vsResp, nsResp, seResp, raResp, oaResp, mmResp, osResp, atResp,
    ] = await Promise.all([
      fetch(`${basePath}/metadata.json`),
      fetch(`${basePath}/scorecard.json`),
      fetch(`${basePath}/vehicle_state.jsonl`),
      fetch(`${basePath}/network_state.jsonl`),
      fetch(`${basePath}/scenario_event.jsonl`),
      fetch(`${basePath}/role_assignment.jsonl`),
      fetch(`${basePath}/operator_action.jsonl`),
      fetch(`${basePath}/mission_metric.jsonl`),
      fetch(`${basePath}/objective_state.jsonl`),
      fetch(`${basePath}/autonomy_decision_trace.jsonl`),
    ]);

    this.metadata = await metaResp.json();
    this.scorecard = await scorecardResp.json();
    this.duration = this.metadata?.duration_sec ?? 300;

    this.vehicleStates = parseJsonl(await vsResp.text());
    this.networkStates = parseJsonl(await nsResp.text());
    this.scenarioEvents = parseJsonl(await seResp.text());
    this.roleAssignments = parseJsonl(await raResp.text());
    this.operatorActions = parseJsonl(await oaResp.text());
    this.missionMetrics = parseJsonl(await mmResp.text());
    this.objectiveStates = parseJsonl(await osResp.text());
    this.autonomyTraces = parseJsonl(await atResp.text());

    if (this.vehicleStates.length > 0) {
      this.startTime = new Date(this.vehicleStates[0].ts).getTime();
    }

    // Build sorted event list for timeline markers
    this.allEvents = [
      ...this.scenarioEvents,
      ...this.roleAssignments,
      ...this.operatorActions,
    ].sort((a, b) => a.seq - b.seq);
  }

  getTimeOffset(ts: string): number {
    return (new Date(ts).getTime() - this.startTime) / 1000;
  }

  getSnapshotAt(time: number): WorldSnapshot {
    const vehicles = new Map<string, VehicleStatePayload>();
    const metrics = new Map<string, number>();

    // Binary search for the first event near the target time
    // Then scan forward to collect latest state per vehicle
    const targetMs = this.startTime + time * 1000;
    let lo = 0;
    let hi = this.vehicleStates.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const evMs = new Date(this.vehicleStates[mid].ts).getTime();
      if (evMs < targetMs - 500) lo = mid + 1;
      else hi = mid;
    }

    // Scan a window of +-0.5s around the target
    const searchStart = Math.max(0, lo - 60);
    const searchEnd = Math.min(this.vehicleStates.length, lo + 60);

    for (let i = searchStart; i < searchEnd; i++) {
      const ev = this.vehicleStates[i];
      if (!ev) continue;
      const evTime = this.getTimeOffset(ev.ts);
      if (evTime > time + 0.5) break;
      if (evTime >= time - 0.5 && ev.entity_id) {
        vehicles.set(ev.entity_id, ev.payload as unknown as VehicleStatePayload);
      }
    }

    // Find latest network state
    let network: NetworkStatePayload | null = null;
    for (let i = this.networkStates.length - 1; i >= 0; i--) {
      const evTime = this.getTimeOffset(this.networkStates[i].ts);
      if (evTime <= time) {
        network = this.networkStates[i].payload as unknown as NetworkStatePayload;
        break;
      }
    }

    // Active disruptions
    const activeDisruptions: ScenarioEventPayload[] = [];
    for (const ev of this.scenarioEvents) {
      const p = ev.payload as unknown as ScenarioEventPayload;
      const evTime = this.getTimeOffset(ev.ts);
      if (evTime <= time && (p.scheduled_end_t === 0 || p.scheduled_end_t > time)) {
        activeDisruptions.push(p);
      }
    }

    // Latest metrics
    for (const ev of this.missionMetrics) {
      const evTime = this.getTimeOffset(ev.ts);
      if (evTime <= time) {
        const p = ev.payload as unknown as { metric_name: string; value: number };
        metrics.set(p.metric_name, p.value);
      }
    }

    return { time, vehicles, network, activeDisruptions, metrics };
  }

  getTimelineEvents(): Array<{ time: number; type: string; label: string; color: string }> {
    const events: Array<{ time: number; type: string; label: string; color: string }> = [];

    for (const ev of this.scenarioEvents) {
      const p = ev.payload as unknown as ScenarioEventPayload;
      const time = this.getTimeOffset(ev.ts);
      events.push({
        time,
        type: p.disruption_type,
        label: p.disruption_type === "jammer_on" ? "Jammer ON"
             : p.disruption_type === "drone_fail" ? `${p.target} LOST`
             : p.disruption_type === "gps_degrade" ? "GPS Degraded"
             : p.disruption_type,
        color: p.disruption_type === "jammer_on" ? "#ef4444"
             : p.disruption_type === "drone_fail" ? "#dc2626"
             : "#f59e0b",
      });
    }

    for (const ev of this.operatorActions) {
      events.push({
        time: this.getTimeOffset(ev.ts),
        type: "operator",
        label: "Operator Redirect",
        color: "#3b82f6",
      });
    }

    for (const ev of this.roleAssignments) {
      const p = ev.payload as unknown as RoleAssignmentPayload;
      events.push({
        time: this.getTimeOffset(ev.ts),
        type: "role_change",
        label: `${ev.entity_id}: ${p.old_role} → ${p.new_role}`,
        color: "#8b5cf6",
      });
    }

    return events.sort((a, b) => a.time - b.time);
  }
}

function parseJsonl(text: string): GhostEvent[] {
  return text
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}
