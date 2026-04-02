"use client";

import { Scorecard } from "@/lib/types";

interface Props {
  scorecard: Scorecard;
  onClose: () => void;
}

export function ScorePanel({ scorecard, onClose }: Props) {
  // Single-agent baseline estimates for comparison
  const baseline = {
    search_coverage_pct: 31,
    relay_uptime_pct: 0,
    track_continuity_sec: 18,
    mission_completion_pct: 25,
    operator_intervention_count: 3,
    recovery_time_partition_sec: 0,
    recovery_time_node_loss_sec: 0,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl max-w-xl w-full mx-4 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold">Mission Scorecard</h2>
            <p className="text-sm text-gray-400 mt-1">
              Composite Score: <span className="text-green-400 font-bold text-lg">{scorecard.composite_score.toFixed(1)}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl px-2">
            x
          </button>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs uppercase border-b border-gray-800">
              <th className="text-left py-2">Metric</th>
              <th className="text-right py-2">Swarm</th>
              <th className="text-right py-2">Single Agent</th>
              <th className="text-right py-2">Delta</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            <ScoreRow label="Search Coverage" swarm={scorecard.search_coverage_pct} baseline={baseline.search_coverage_pct} unit="%" />
            <ScoreRow label="Relay Uptime" swarm={scorecard.relay_uptime_pct} baseline={baseline.relay_uptime_pct} unit="%" />
            <ScoreRow label="Track Continuity" swarm={scorecard.track_continuity_sec} baseline={baseline.track_continuity_sec} unit="s" />
            <ScoreRow label="Mission Completion" swarm={scorecard.mission_completion_pct} baseline={baseline.mission_completion_pct} unit="%" />
            <ScoreRow label="Operator Interventions" swarm={scorecard.operator_intervention_count} baseline={baseline.operator_intervention_count} unit="" invert />
            <ScoreRow label="Partition Recovery" swarm={scorecard.recovery_time_partition_sec} baseline={baseline.recovery_time_partition_sec} unit="s" invert />
            <ScoreRow label="Node Loss Recovery" swarm={scorecard.recovery_time_node_loss_sec} baseline={baseline.recovery_time_node_loss_sec} unit="s" invert />
          </tbody>
        </table>

        <div className="mt-6 flex items-center gap-3">
          <div className="flex-1 text-xs text-gray-500">
            {scorecard.active_vehicles_final}/6 vehicles active at mission end |
            Duration: {scorecard.duration_sec}s
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium transition-colors"
          >
            Replay Again
          </button>
        </div>
      </div>
    </div>
  );
}

function ScoreRow({ label, swarm, baseline, unit, invert }: {
  label: string;
  swarm: number;
  baseline: number;
  unit: string;
  invert?: boolean;
}) {
  const delta = swarm - baseline;
  const better = invert ? delta < 0 : delta > 0;
  const deltaStr = (delta > 0 ? "+" : "") + delta.toFixed(1) + unit;

  return (
    <tr>
      <td className="py-2 text-gray-300">{label}</td>
      <td className="py-2 text-right font-mono font-bold">{swarm.toFixed(1)}{unit}</td>
      <td className="py-2 text-right font-mono text-gray-500">{baseline.toFixed(1)}{unit}</td>
      <td className={`py-2 text-right font-mono font-bold ${better ? "text-green-400" : delta === 0 ? "text-gray-500" : "text-red-400"}`}>
        {deltaStr}
      </td>
    </tr>
  );
}
