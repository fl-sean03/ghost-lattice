"use client";

import { WorldSnapshot, ROLE_COLORS, VEHICLE_LABELS, VehicleStatePayload } from "@/lib/types";
import { ReplayStore } from "@/lib/replay-store";

interface Props {
  snapshot: WorldSnapshot;
  store: ReplayStore;
  time: number;
  selectedVehicle: string | null;
}

export function OperatorPane({ snapshot, store, time, selectedVehicle }: Props) {
  const coverage = snapshot.metrics.get("search_coverage_pct") ?? 0;
  const relayUp = snapshot.metrics.get("relay_uptime_pct") ?? 100;
  const partitions = snapshot.network?.partition_count ?? 1;
  const activeVehicles = snapshot.vehicles.size;

  // Recent events up to current time
  const recentEvents = store.allEvents
    .filter((e) => store.getTimeOffset(e.ts) <= time)
    .slice(-5)
    .reverse();

  const selectedState = selectedVehicle
    ? snapshot.vehicles.get(selectedVehicle)
    : null;

  return (
    <div className="p-4 pt-8 space-y-4 text-sm h-full overflow-auto">
      {/* Mission Status */}
      <div>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Mission Status</h3>
        <div className="grid grid-cols-2 gap-2">
          <MetricBox label="Coverage" value={`${coverage.toFixed(1)}%`} color={coverage > 60 ? "green" : coverage > 30 ? "amber" : "red"} />
          <MetricBox label="Relay" value={`${relayUp.toFixed(0)}%`} color={relayUp > 80 ? "green" : "red"} />
          <MetricBox label="Vehicles" value={`${activeVehicles}/6`} color={activeVehicles >= 5 ? "green" : "amber"} />
          <MetricBox label="Partitions" value={String(partitions)} color={partitions === 1 ? "green" : "red"} />
        </div>
      </div>

      {/* Vehicle roles */}
      <div>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Active Roles</h3>
        <div className="flex flex-wrap gap-1.5">
          {Array.from(snapshot.vehicles.entries()).map(([id, state]) => (
            <span
              key={id}
              className="text-xs px-2 py-1 rounded font-mono"
              style={{
                backgroundColor: ROLE_COLORS[state.current_role] + "30",
                borderLeft: `3px solid ${ROLE_COLORS[state.current_role]}`,
              }}
            >
              {VEHICLE_LABELS[id]} {state.current_role}
            </span>
          ))}
        </div>
      </div>

      {/* Selected vehicle detail */}
      {selectedState && selectedVehicle && (
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Selected: {selectedVehicle}
          </h3>
          <div className="bg-gray-800/50 rounded p-2 text-xs space-y-1 font-mono">
            <div>Role: <span style={{ color: ROLE_COLORS[selectedState.current_role] }}>{selectedState.current_role}</span></div>
            <div>Battery: {selectedState.battery_pct.toFixed(1)}%</div>
            <div>Position: [{selectedState.position_ned.map((p) => p.toFixed(1)).join(", ")}]</div>
            <div>Mode: {selectedState.flight_mode}</div>
          </div>
        </div>
      )}

      {/* Event feed */}
      <div>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Event Feed</h3>
        <div className="space-y-1">
          {recentEvents.map((ev, i) => {
            const evTime = store.getTimeOffset(ev.ts);
            const payload = ev.payload as Record<string, unknown>;
            let label = ev.event_type;
            let color = "#6b7280";

            if (ev.event_type === "scenario_event") {
              label = String(payload.disruption_type || "disruption");
              color = "#ef4444";
            } else if (ev.event_type === "role_assignment") {
              label = `${ev.entity_id}: ${payload.old_role} -> ${payload.new_role}`;
              color = "#8b5cf6";
            } else if (ev.event_type === "operator_action") {
              label = String(payload.action_type || "command");
              color = "#3b82f6";
            }

            return (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="text-gray-500 font-mono shrink-0">
                  T+{evTime.toFixed(0)}s
                </span>
                <span className="w-1.5 h-1.5 rounded-full mt-1 shrink-0" style={{ backgroundColor: color }} />
                <span className="text-gray-300">{label}</span>
              </div>
            );
          })}
          {recentEvents.length === 0 && (
            <div className="text-gray-600 text-xs">No events yet</div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricBox({ label, value, color }: { label: string; value: string; color: string }) {
  const colorMap: Record<string, string> = {
    green: "text-green-400 border-green-800",
    amber: "text-amber-400 border-amber-800",
    red: "text-red-400 border-red-800",
  };
  return (
    <div className={`border rounded px-2 py-1.5 ${colorMap[color] || "text-gray-400 border-gray-700"}`}>
      <div className="text-[10px] text-gray-500 uppercase">{label}</div>
      <div className="text-base font-bold font-mono">{value}</div>
    </div>
  );
}
