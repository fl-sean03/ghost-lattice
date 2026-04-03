/**
 * Live mission scoring. Ported from services/scoring-engine/app/metrics.py
 * Adapted for incremental updates instead of batch event processing.
 */

export interface LiveScorecard {
  search_coverage_pct: number;
  relay_uptime_pct: number;
  track_continuity_sec: number;
  mission_completion_pct: number;
  operator_intervention_count: number;
  recovery_time_partition_sec: number;
  recovery_time_node_loss_sec: number;
  active_vehicles: number;
  elapsed_sec: number;
  composite_score: number;
}

export class ScoringEngine {
  private connectedTicks = 0;
  private totalNetworkTicks = 0;
  private trackingTicks = 0;
  private partitionStartTime: number | null = null;
  private nodeLossStartTime: number | null = null;
  private lastPartitionRecovery = 0;
  private lastNodeLossRecovery = 0;
  operatorInterventions = 0;
  activeVehicles = 6;

  // Coverage grid
  private coverageGrid: Set<string>;
  private totalCells: number;
  private cellSize = 10; // 10m cells

  constructor(searchBounds: [[number, number], [number, number]]) {
    this.coverageGrid = new Set();
    const [min, max] = searchBounds;
    const cols = Math.ceil((max[0] - min[0]) / this.cellSize);
    const rows = Math.ceil((max[1] - min[1]) / this.cellSize);
    this.totalCells = cols * rows;
  }

  /** Mark cells visited by a scout at this position. */
  markCoverage(x: number, y: number, sensorRadius = 20): void {
    const r = Math.ceil(sensorRadius / this.cellSize);
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (dx * dx + dy * dy <= r * r) {
          this.coverageGrid.add(`${cx + dx},${cy + dy}`);
        }
      }
    }
  }

  /** Call once per network state tick. */
  updateNetwork(partitionCount: number, time: number): void {
    this.totalNetworkTicks++;
    if (partitionCount === 1) {
      this.connectedTicks++;
      if (this.partitionStartTime !== null) {
        this.lastPartitionRecovery = time - this.partitionStartTime;
        this.partitionStartTime = null;
      }
    } else if (this.partitionStartTime === null) {
      this.partitionStartTime = time;
    }
  }

  /** Call when a drone is killed. */
  onNodeLoss(time: number): void {
    this.nodeLossStartTime = time;
    this.activeVehicles--;
  }

  /** Call when roles successfully reassign after node loss. */
  onNodeLossRecovery(time: number): void {
    if (this.nodeLossStartTime !== null) {
      this.lastNodeLossRecovery = time - this.nodeLossStartTime;
      this.nodeLossStartTime = null;
    }
  }

  /** Call when a tracker is actively tracking. */
  tickTracking(): void {
    this.trackingTicks++;
  }

  getScorecard(elapsed: number): LiveScorecard {
    const coveragePct = this.totalCells > 0
      ? Math.min(100, (this.coverageGrid.size / this.totalCells) * 100)
      : 0;

    const relayPct = this.totalNetworkTicks > 0
      ? (this.connectedTicks / this.totalNetworkTicks) * 100
      : 100;

    const trackSec = this.trackingTicks * 0.1; // 10Hz ticks

    const composite =
      coveragePct * 0.30 +
      relayPct * 0.20 +
      Math.min(100, trackSec) * 0.20 +
      Math.max(0, 100 - (this.lastPartitionRecovery || 0) * 2) * 0.15 +
      Math.max(0, 100 - this.operatorInterventions * 30) * 0.15;

    return {
      search_coverage_pct: Math.round(coveragePct * 10) / 10,
      relay_uptime_pct: Math.round(relayPct * 10) / 10,
      track_continuity_sec: Math.round(trackSec * 10) / 10,
      mission_completion_pct: Math.round(coveragePct * 0.6 + Math.min(100, trackSec) * 0.4),
      operator_intervention_count: this.operatorInterventions,
      recovery_time_partition_sec: Math.round((this.lastPartitionRecovery || 0) * 10) / 10,
      recovery_time_node_loss_sec: Math.round((this.lastNodeLossRecovery || 0) * 10) / 10,
      active_vehicles: this.activeVehicles,
      elapsed_sec: Math.round(elapsed * 10) / 10,
      composite_score: Math.round(composite * 10) / 10,
    };
  }
}
