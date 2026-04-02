"use client";

import { WorldSnapshot, ROLE_COLORS, VEHICLE_LABELS } from "@/lib/types";
import { ReplayStore } from "@/lib/replay-store";
import { useEffect, useRef } from "react";

interface Props {
  snapshot: WorldSnapshot;
  store: ReplayStore;
  time: number;
  selectedVehicle: string | null;
}

export function Sidebar({ snapshot, store, time, selectedVehicle }: Props) {
  const coverage = snapshot.metrics.get("search_coverage_pct") ?? 0;
  const relayUp = snapshot.metrics.get("relay_uptime_pct") ?? 100;
  const partitions = snapshot.network?.partition_count ?? 1;
  const vehicles = snapshot.vehicles.size;

  const selectedState = selectedVehicle ? snapshot.vehicles.get(selectedVehicle) : null;

  const recentEvents = store.allEvents
    .filter((e) => store.getTimeOffset(e.ts) <= time)
    .slice(-8)
    .reverse();

  return (
    <div className="h-full flex flex-col bg-[#0c1019] overflow-hidden">
      {/* Network mini-graph */}
      <div className="h-[220px] shrink-0 border-b border-gray-800/50 p-3">
        <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">Network Topology</div>
        <NetworkMini snapshot={snapshot} />
      </div>

      {/* Metrics */}
      <div className="shrink-0 border-b border-gray-800/50 p-3 space-y-2">
        <div className="text-[10px] text-gray-600 uppercase tracking-widest">Mission Metrics</div>
        <div className="grid grid-cols-2 gap-1.5">
          <Metric label="Search Coverage" value={`${coverage.toFixed(1)}%`} progress={coverage / 100} color="cyan" />
          <Metric label="Relay Uptime" value={`${relayUp.toFixed(0)}%`} progress={relayUp / 100} color={relayUp > 80 ? "green" : "red"} />
          <Metric label="Active Vehicles" value={`${vehicles}/6`} progress={vehicles / 6} color={vehicles >= 5 ? "green" : "amber"} />
          <Metric label="Network" value={partitions === 1 ? "Connected" : `Split (${partitions})`} progress={partitions === 1 ? 1 : 0.3} color={partitions === 1 ? "green" : "red"} />
        </div>
      </div>

      {/* Fleet status */}
      <div className="shrink-0 border-b border-gray-800/50 p-3">
        <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">Fleet Roster</div>
        <div className="space-y-1">
          {Array.from(snapshot.vehicles.entries()).map(([id, state]) => (
            <div key={id} className={`flex items-center gap-2 text-xs px-2 py-1 rounded ${selectedVehicle === id ? "bg-gray-800" : ""}`}>
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: ROLE_COLORS[state.current_role] }} />
              <span className="font-bold w-8">{VEHICLE_LABELS[id]}</span>
              <span className="text-gray-500 flex-1" style={{ color: ROLE_COLORS[state.current_role] + "cc" }}>
                {state.current_role}
              </span>
              <span className="text-gray-600 text-[10px]">{state.battery_pct.toFixed(0)}%</span>
            </div>
          ))}
          {/* Show dead vehicles */}
          {["bravo_2"].filter(id => !snapshot.vehicles.has(id) && time > 180).map(id => (
            <div key={id} className="flex items-center gap-2 text-xs px-2 py-1 opacity-40 line-through">
              <div className="w-2 h-2 rounded-full bg-red-600 shrink-0" />
              <span className="font-bold w-8">{VEHICLE_LABELS[id]}</span>
              <span className="text-red-500">LOST</span>
            </div>
          ))}
        </div>
      </div>

      {/* Selected vehicle detail */}
      {selectedState && selectedVehicle && (
        <div className="shrink-0 border-b border-gray-800/50 p-3">
          <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">
            Selected: {selectedVehicle}
          </div>
          <div className="text-xs space-y-1 text-gray-400">
            <div>Role: <span style={{ color: ROLE_COLORS[selectedState.current_role] }}>{selectedState.current_role}</span></div>
            <div>Battery: {selectedState.battery_pct.toFixed(1)}%</div>
            <div>Position: [{selectedState.position_ned.map(p => p.toFixed(0)).join(", ")}]m</div>
            <div>Heading: {(selectedState.heading_rad * 180 / Math.PI).toFixed(0)}deg</div>
          </div>
        </div>
      )}

      {/* Event feed */}
      <div className="flex-1 overflow-auto p-3">
        <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">Event Log</div>
        <div className="space-y-1.5">
          {recentEvents.map((ev, i) => {
            const evTime = store.getTimeOffset(ev.ts);
            const payload = ev.payload as Record<string, unknown>;
            let label = ev.event_type;
            let color = "#6b7280";

            if (ev.event_type === "scenario_event") {
              const dtype = String(payload.disruption_type || "");
              label = dtype === "jammer_on" ? "Jammer activated"
                    : dtype === "drone_fail" ? `${payload.target} power failure`
                    : dtype === "gps_degrade" ? "GPS degradation"
                    : dtype;
              color = "#ef4444";
            } else if (ev.event_type === "role_assignment") {
              label = `${ev.entity_id}: ${payload.old_role} \u2192 ${payload.new_role}`;
              color = "#a78bfa";
            } else if (ev.event_type === "operator_action") {
              label = `Operator: ${payload.action_type}`;
              color = "#60a5fa";
            }

            return (
              <div key={i} className="flex items-start gap-2 text-[11px]">
                <span className="text-gray-600 font-mono shrink-0 w-10 text-right">
                  {evTime.toFixed(0)}s
                </span>
                <span className="w-1.5 h-1.5 rounded-full mt-1 shrink-0" style={{ backgroundColor: color }} />
                <span className="text-gray-400 leading-tight">{label}</span>
              </div>
            );
          })}
          {recentEvents.length === 0 && (
            <div className="text-gray-700 text-xs italic">Awaiting events...</div>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, progress, color }: { label: string; value: string; progress: number; color: string }) {
  const colors: Record<string, { bar: string; text: string }> = {
    cyan:  { bar: "bg-cyan-500",  text: "text-cyan-400" },
    green: { bar: "bg-green-500", text: "text-green-400" },
    amber: { bar: "bg-amber-500", text: "text-amber-400" },
    red:   { bar: "bg-red-500",   text: "text-red-400" },
  };
  const c = colors[color] || colors.cyan;

  return (
    <div className="bg-gray-900/50 rounded px-2 py-1.5">
      <div className="text-[9px] text-gray-600 uppercase">{label}</div>
      <div className={`text-sm font-bold ${c.text}`}>{value}</div>
      <div className="h-0.5 bg-gray-800 rounded mt-1">
        <div className={`h-full ${c.bar} rounded transition-all duration-500`} style={{ width: `${Math.max(0, Math.min(100, progress * 100))}%` }} />
      </div>
    </div>
  );
}

function NetworkMini({ snapshot }: { snapshot: WorldSnapshot }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const parent = canvas.parentElement;
    if (!parent) return;
    const dpr = window.devicePixelRatio;
    const w = parent.clientWidth * dpr;
    const h = (parent.clientHeight - 20) * dpr; // account for title
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${parent.clientWidth}px`;
    canvas.style.height = `${parent.clientHeight - 20}px`;

    ctx.clearRect(0, 0, w, h);

    const vehicles = Array.from(snapshot.vehicles.entries());
    if (vehicles.length === 0) return;

    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) * 0.35;

    // Node positions
    const nodePos: Record<string, { x: number; y: number }> = {};
    vehicles.forEach(([id], i) => {
      const angle = (i / vehicles.length) * Math.PI * 2 - Math.PI / 2;
      nodePos[id] = { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
    });

    // Edges
    if (snapshot.network) {
      for (const edge of snapshot.network.edges) {
        const from = nodePos[edge.src];
        const to = nodePos[edge.dst];
        if (!from || !to) continue;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        if (!edge.active) {
          ctx.strokeStyle = "rgba(75, 85, 99, 0.15)";
          ctx.lineWidth = 1;
        } else if (edge.quality > 0.7) {
          ctx.strokeStyle = `rgba(34, 197, 94, ${0.15 + edge.quality * 0.3})`;
          ctx.lineWidth = 1.5 * dpr;
        } else if (edge.quality > 0.3) {
          ctx.strokeStyle = `rgba(245, 158, 11, ${0.2 + edge.quality * 0.3})`;
          ctx.lineWidth = 1 * dpr;
        } else {
          ctx.strokeStyle = `rgba(239, 68, 68, ${0.2 + edge.quality * 0.3})`;
          ctx.lineWidth = 1 * dpr;
        }
        ctx.stroke();
      }
    }

    // Nodes
    vehicles.forEach(([id, state]) => {
      const pos = nodePos[id];
      if (!pos) return;
      const color = ROLE_COLORS[state.current_role] || "#888";
      const nodeR = 12 * dpr;

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, nodeR, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = "white";
      ctx.font = `bold ${9 * dpr}px monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(VEHICLE_LABELS[id] || id, pos.x, pos.y);
    });

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }, [snapshot]);

  return <canvas ref={canvasRef} className="w-full h-full" />;
}
