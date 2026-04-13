"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSimEngine } from "@/hooks/use-sim-engine";
import { InteractionMode } from "@/sim/interaction";
import { SimToolbar } from "@/components/toolbar/SimToolbar";
import { TacticalMap } from "@/components/tactical-map/TacticalMap";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { ScorePanel } from "@/components/scorecard/ScorePanel";
import { ALL_SCENARIOS, type ScenarioPreset, SCENARIO_DEFAULT } from "@/sim/scenarios";
import type { WorldSnapshot } from "@/lib/types";
import type { Scorecard } from "@/lib/types";

export default function SandboxPage() {
  const [selectedScenario, setSelectedScenario] = useState<ScenarioPreset>(SCENARIO_DEFAULT);
  const preset = useMemo(() => selectedScenario, [selectedScenario]);
  const { engine, snapshot, running, time, events, start, pause, resume, reset, setSpeed, getScorecard } = useSimEngine(preset);
  const [mode, setMode] = useState<InteractionMode>(InteractionMode.SELECT);
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
  const [currentSpeed, setCurrentSpeed] = useState(1);
  const [showScorecard, setShowScorecard] = useState(false);
  const [previewPos, setPreviewPos] = useState<[number, number] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      switch (e.key.toLowerCase()) {
        case "v": setMode(InteractionMode.SELECT); break;
        case "j": setMode(InteractionMode.PLACE_JAMMER); break;
        case "g": setMode(InteractionMode.PLACE_GPS_ZONE); break;
        case "k": setMode(InteractionMode.KILL_DRONE); break;
        case "e": setMode(InteractionMode.SPAWN_EMITTER); break;
        case "d": setMode(InteractionMode.DRAW_SEARCH); break;
        case "escape": setMode(InteractionMode.SELECT); break;
        case " ": e.preventDefault(); running ? pause() : (time === 0 ? start() : resume()); break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [running, time, start, pause, resume]);

  // Show scorecard when mission ends
  useEffect(() => {
    if (!running && time >= selectedScenario.config.duration_sec) {
      setShowScorecard(true);
    }
  }, [running, time]);

  const handleSpeedChange = useCallback((s: number) => {
    setCurrentSpeed(s);
    setSpeed(s);
  }, [setSpeed]);

  // World-to-screen mapping — uses dynamic bounds from snapshot
  const screenToWorld = useCallback((clientX: number, clientY: number): [number, number] | null => {
    const el = mapRef.current;
    if (!el) return null;
    const vb = snapshot?.world?.viewBounds ?? { minX: -30, maxX: 450, minY: -30, maxY: 350 };
    const rect = el.getBoundingClientRect();
    const sx = (clientX - rect.left) / rect.width;
    const sy = (clientY - rect.top) / rect.height;
    const wx = vb.minX + sx * (vb.maxX - vb.minX);
    const wy = vb.minY + sy * (vb.maxY - vb.minY);
    return [wx, wy];
  }, []);

  const handleMapClick = useCallback((e: React.MouseEvent) => {
    if (!engine) return;
    const pos = screenToWorld(e.clientX, e.clientY);
    if (!pos) return;

    switch (mode) {
      case InteractionMode.PLACE_JAMMER:
        engine.injectJammer([pos[0], pos[1], 0], 150, -60);
        showToast("⚡ Jammer deployed — 150m radius");
        setMode(InteractionMode.SELECT);
        break;
      case InteractionMode.PLACE_GPS_ZONE:
        engine.injectGPSZone([pos[0], pos[1], 0], 100, 50);
        showToast("📡 GPS denial zone — 100m radius");
        setMode(InteractionMode.SELECT);
        break;
      case InteractionMode.SPAWN_EMITTER:
        engine.spawnEmitter([pos[0], pos[1], 0]);
        showToast("🎯 Adversary emitter spawned");
        setMode(InteractionMode.SELECT);
        break;
      case InteractionMode.KILL_DRONE:
        // Find nearest drone
        if (snapshot) {
          let nearest: string | null = null;
          let minDist = 50; // click radius in world meters (generous for usability)
          for (const [id, v] of snapshot.vehicles) {
            const dx = v.position_ned[0] - pos[0];
            const dy = v.position_ned[1] - pos[1];
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < minDist) { minDist = dist; nearest = id; }
          }
          if (nearest) {
            engine.killDrone(nearest);
            showToast(`💀 ${nearest} destroyed`);
          } else {
            showToast("No drone nearby — click closer to a drone");
          }
        }
        break;
      case InteractionMode.SELECT:
        // Select/deselect drone
        if (snapshot) {
          let nearest: string | null = null;
          let minDist = 20;
          for (const [id, v] of snapshot.vehicles) {
            const dx = v.position_ned[0] - pos[0];
            const dy = v.position_ned[1] - pos[1];
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < minDist) { minDist = dist; nearest = id; }
          }
          setSelectedVehicle(nearest === selectedVehicle ? null : nearest);
        }
        break;
    }
  }, [engine, mode, snapshot, screenToWorld, selectedVehicle]);

  const handleMapMouseMove = useCallback((e: React.MouseEvent) => {
    const pos = screenToWorld(e.clientX, e.clientY);
    setPreviewPos(pos); // Always track for coordinate display
    if (mode === InteractionMode.SELECT) {
      setPreviewPos(null);
    }
  }, [mode, screenToWorld]);

  // Build a fake store-like object for the sidebar
  const storeAdapter = {
    allEvents: events.map((ev, i) => ({
      ts: new Date(Date.now()).toISOString(),
      run_id: "live",
      seq: i,
      event_type: ev.type,
      entity_id: ev.entity ?? null,
      payload: { detail: ev.detail } as Record<string, unknown>,
    })),
    getTimeOffset: () => time,
    duration: selectedScenario.config.duration_sec,
  };

  // Dynamic view bounds for preview overlays
  const vb = snapshot?.world?.viewBounds ?? { minX: -30, maxX: 450, minY: -30, maxY: 350 };

  // Cursor style based on mode
  const cursorMap: Record<InteractionMode, string> = {
    [InteractionMode.SELECT]: "default",
    [InteractionMode.PLACE_JAMMER]: "crosshair",
    [InteractionMode.PLACE_GPS_ZONE]: "crosshair",
    [InteractionMode.DRAW_SEARCH]: "crosshair",
    [InteractionMode.KILL_DRONE]: "crosshair",
    [InteractionMode.SPAWN_EMITTER]: "crosshair",
  };

  const scorecard = getScorecard();

  if (!snapshot) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0a0e17] text-white font-mono">
        <div className="text-3xl font-bold tracking-widest text-cyan-400">GHOST LATTICE</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#0a0e17] text-white font-mono overflow-hidden select-none">
      {/* Scenario selector */}
      <div className="bg-[#060a12] border-b border-gray-800/30 px-4 py-2 flex items-center gap-3 shrink-0">
        <span className="text-[10px] text-gray-600 uppercase tracking-widest">Scenario</span>
        <div className="flex items-center gap-1.5">
          {ALL_SCENARIOS.map(s => (
            <button
              key={s.id}
              onClick={() => { if (!running) { setSelectedScenario(s); setShowScorecard(false); } }}
              className={`px-3 py-1 rounded text-xs transition-colors ${
                selectedScenario.id === s.id
                  ? "bg-cyan-800/60 text-cyan-300 border border-cyan-700/50"
                  : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/50"
              } ${running ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {s.name}
            </button>
          ))}
        </div>
        <div className="w-px h-5 bg-gray-800 mx-1" />
        <span className="text-xs text-gray-500 flex-1">{selectedScenario.description}</span>
        {selectedScenario.scheduledThreats.length > 0 && (
          <span className="text-[10px] text-amber-600">{selectedScenario.scheduledThreats.length} scripted events</span>
        )}
      </div>

      <SimToolbar
        mode={mode}
        onModeChange={setMode}
        running={running}
        time={time}
        speed={currentSpeed}
        onStart={start}
        onPause={pause}
        onResume={resume}
        onReset={() => { reset(); setShowScorecard(false); }}
        onSpeedChange={handleSpeedChange}
        duration={selectedScenario.config.duration_sec}
      />

      {/* Status bar */}
      <div className="bg-[#080c14] border-b border-gray-800/30 px-4 py-1.5 text-xs flex items-center gap-4 shrink-0">
        <span className={running ? "text-green-400" : time > 0 ? "text-amber-400" : "text-gray-500"}>
          {running ? "● LIVE" : time > 0 ? "● PAUSED" : "○ READY"}
        </span>
        {mode !== InteractionMode.SELECT && (
          <span className="text-cyan-400">
            Mode: {mode.replace("_", " ").toUpperCase()} — click on map to place, ESC to cancel
          </span>
        )}
        {previewPos && (
          <span className="text-gray-600 font-mono">
            [{previewPos[0].toFixed(0)}, {previewPos[1].toFixed(0)}]m
          </span>
        )}
        {events.length > 0 && (
          <span className="text-gray-500 flex-1 text-right truncate">
            Last: {events[events.length - 1].detail}
          </span>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Map */}
        <div
          ref={mapRef}
          className="flex-1 relative"
          style={{ cursor: cursorMap[mode] }}
          onClick={handleMapClick}
          onMouseMove={handleMapMouseMove}
        >
          <TacticalMap
            snapshot={snapshot}
            store={null as never}
            time={time}
            selectedVehicle={selectedVehicle}
            onSelectVehicle={setSelectedVehicle}
            recentEvents={events.filter(ev => time - ev.time < 3)}
          />
          {/* Preview overlay for placement modes */}
          {previewPos && mode === InteractionMode.PLACE_JAMMER && (
            <div
              className="absolute pointer-events-none border-2 border-red-500/50 rounded-full bg-red-500/10"
              style={{
                left: `${((previewPos[0] - vb.minX) / (vb.maxX - vb.minX)) * 100}%`,
                top: `${((previewPos[1] - vb.minY) / (vb.maxY - vb.minY)) * 100}%`,
                width: `${(300 / (vb.maxX - vb.minX)) * 100}%`,
                height: `${(300 / (vb.maxY - vb.minY)) * 100}%`,
                transform: "translate(-50%, -50%)",
              }}
            />
          )}
          {previewPos && mode === InteractionMode.PLACE_GPS_ZONE && (
            <div
              className="absolute pointer-events-none border-2 border-amber-500/50 rounded-full bg-amber-500/10"
              style={{
                left: `${((previewPos[0] - vb.minX) / (vb.maxX - vb.minX)) * 100}%`,
                top: `${((previewPos[1] - vb.minY) / (vb.maxY - vb.minY)) * 100}%`,
                width: `${(200 / (vb.maxX - vb.minX)) * 100}%`,
                height: `${(200 / (vb.maxY - vb.minY)) * 100}%`,
                transform: "translate(-50%, -50%)",
              }}
            />
          )}
        </div>

        {/* Sidebar */}
        <div className="w-[380px] shrink-0 border-l border-gray-800/50">
          <SidebarLive snapshot={snapshot} events={events} time={time} selectedVehicle={selectedVehicle} fleetSize={selectedScenario.config.fleet.length} />
        </div>
      </div>

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 bg-gray-900/95 border border-cyan-800/50 rounded-lg text-sm text-cyan-300 font-mono shadow-lg shadow-cyan-900/20 animate-pulse">
          {toast}
        </div>
      )}

      {/* Scorecard overlay */}
      {showScorecard && scorecard && (
        <ScorePanel
          scorecard={{
            run_id: "live",
            scenario_id: selectedScenario.config.scenario_id,
            ...scorecard,
            active_vehicles_final: scorecard.active_vehicles,
            battery_efficiency: 0.85,
            path_efficiency: 0.72,
            duration_sec: scorecard.elapsed_sec,
            composite_score: scorecard.composite_score,
          }}
          onClose={() => setShowScorecard(false)}
        />
      )}
    </div>
  );
}

/** Adapted sidebar for live sim (no ReplayStore dependency). */
function SidebarLive({ snapshot, events, time, selectedVehicle, fleetSize }: {
  snapshot: WorldSnapshot;
  events: { time: number; type: string; entity?: string; detail: string }[];
  time: number;
  selectedVehicle: string | null;
  fleetSize: number;
}) {
  const coverage = snapshot.metrics.get("search_coverage_pct") ?? 0;
  const relayUp = snapshot.metrics.get("relay_uptime_pct") ?? 100;
  const partitions = snapshot.network?.partition_count ?? 1;
  const vehicles = snapshot.vehicles.size;
  const selectedState = selectedVehicle ? snapshot.vehicles.get(selectedVehicle) : null;
  const recentEvents = events.slice(-10).reverse();

  const ROLE_COLORS: Record<string, string> = {
    scout: "#3b82f6", relay: "#22c55e", tracker: "#f59e0b",
    reserve: "#6b7280", decoy: "#ef4444", edge_anchor: "#8b5cf6",
  };
  const LABELS: Record<string, string> = {
    alpha_1: "A1", alpha_2: "A2", bravo_1: "B1",
    bravo_2: "B2", charlie_1: "C1", charlie_2: "C2",
  };

  return (
    <div className="h-full flex flex-col bg-[#0c1019] overflow-hidden text-xs">
      {/* Metrics */}
      <div className="p-3 border-b border-gray-800/50 space-y-2">
        <div className="text-[10px] text-gray-600 uppercase tracking-widest">Live Metrics</div>
        <div className="grid grid-cols-2 gap-1.5">
          <MetricBox label="Coverage" value={`${coverage.toFixed(1)}%`} pct={coverage / 100} color={coverage > 50 ? "#22c55e" : "#f59e0b"} />
          <MetricBox label="Relay" value={`${relayUp.toFixed(0)}%`} pct={relayUp / 100} color={relayUp > 80 ? "#22c55e" : "#ef4444"} />
          <MetricBox label="Vehicles" value={`${vehicles}/${fleetSize}`} pct={vehicles / fleetSize} color={vehicles >= fleetSize - 1 ? "#22c55e" : "#f59e0b"} />
          <MetricBox label="Network" value={partitions === 1 ? "Connected" : `Split(${partitions})`} pct={partitions === 1 ? 1 : 0.3} color={partitions === 1 ? "#22c55e" : "#ef4444"} />
        </div>
      </div>

      {/* Fleet */}
      <div className="p-3 border-b border-gray-800/50">
        <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">Fleet Roster</div>
        <div className="space-y-1">
          {Array.from(snapshot.vehicles.entries()).map(([id, state]) => (
            <div key={id} className={`flex items-center gap-2 px-2 py-1 rounded ${selectedVehicle === id ? "bg-gray-800" : ""}`}>
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: ROLE_COLORS[state.current_role] }} />
              <span className="font-bold w-6">{LABELS[id]}</span>
              <span style={{ color: ROLE_COLORS[state.current_role] + "cc" }} className="flex-1">{state.current_role}</span>
              <span className="text-gray-600">{state.battery_pct.toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Selected */}
      {selectedState && selectedVehicle && (
        <div className="p-3 border-b border-gray-800/50">
          <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-1">Selected: {selectedVehicle}</div>
          <div className="text-gray-400 space-y-0.5">
            <div>Role: <span style={{ color: ROLE_COLORS[selectedState.current_role] }}>{selectedState.current_role}</span></div>
            <div>Bat: {selectedState.battery_pct.toFixed(1)}%</div>
            <div>Pos: [{selectedState.position_ned.map(p => p.toFixed(0)).join(", ")}]</div>
          </div>
        </div>
      )}

      {/* Events */}
      <div className="flex-1 overflow-auto p-3">
        <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">Event Log</div>
        <div className="space-y-1.5">
          {recentEvents.map((ev, i) => {
            const color = ev.type === "role_change" ? "#a78bfa"
              : ev.type === "disruption" || ev.type === "node_loss" ? "#ef4444"
              : ev.type === "battery" ? "#f59e0b" : "#60a5fa";
            return (
              <div key={i} className="flex items-start gap-2">
                <span className="text-gray-600 font-mono shrink-0 w-10 text-right">{ev.time.toFixed(0)}s</span>
                <span className="w-1.5 h-1.5 rounded-full mt-1 shrink-0" style={{ backgroundColor: color }} />
                <span className="text-gray-400 leading-tight">{ev.detail}</span>
              </div>
            );
          })}
          {recentEvents.length === 0 && <div className="text-gray-700 italic">Press START to begin...</div>}
        </div>
      </div>
    </div>
  );
}

function MetricBox({ label, value, pct, color }: { label: string; value: string; pct: number; color: string }) {
  return (
    <div className="bg-gray-900/50 rounded px-2 py-1.5">
      <div className="text-[9px] text-gray-600 uppercase">{label}</div>
      <div className="text-sm font-bold" style={{ color }}>{value}</div>
      <div className="h-0.5 bg-gray-800 rounded mt-1">
        <div className="h-full rounded transition-all duration-300" style={{ width: `${Math.max(0, Math.min(100, pct * 100))}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}
