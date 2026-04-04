"use client";

import { InteractionMode } from "@/sim/interaction";

interface Props {
  mode: InteractionMode;
  onModeChange: (mode: InteractionMode) => void;
  running: boolean;
  time: number;
  speed: number;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  onSpeedChange: (s: number) => void;
  duration: number;
}

const MODE_BUTTONS: { mode: InteractionMode; label: string; key: string; icon: string }[] = [
  { mode: InteractionMode.SELECT, label: "Select", key: "V", icon: "↖" },
  { mode: InteractionMode.PLACE_JAMMER, label: "Jammer", key: "J", icon: "⚡" },
  { mode: InteractionMode.PLACE_GPS_ZONE, label: "GPS Deny", key: "G", icon: "📡" },
  { mode: InteractionMode.KILL_DRONE, label: "Kill Drone", key: "K", icon: "💀" },
  { mode: InteractionMode.SPAWN_EMITTER, label: "Emitter", key: "E", icon: "🎯" },
];

export function SimToolbar({
  mode, onModeChange, running, time, speed,
  onStart, onPause, onResume, onReset, onSpeedChange, duration,
}: Props) {
  const fmt = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="bg-[#0c1019] border-b border-gray-800/50 px-4 py-2 flex items-center gap-3 shrink-0">
      {/* Sim controls */}
      <div className="flex items-center gap-2">
        {!running && time === 0 ? (
          <button onClick={onStart} className="px-3 py-1.5 bg-cyan-800/50 hover:bg-cyan-700/50 border border-cyan-700/40 rounded text-cyan-300 text-sm font-bold">
            START
          </button>
        ) : running ? (
          <button onClick={onPause} className="px-3 py-1.5 bg-gray-800/50 hover:bg-gray-700/50 border border-gray-700/40 rounded text-gray-300 text-sm">
            PAUSE
          </button>
        ) : (
          <button onClick={onResume} className="px-3 py-1.5 bg-cyan-800/50 hover:bg-cyan-700/50 border border-cyan-700/40 rounded text-cyan-300 text-sm">
            RESUME
          </button>
        )}
        <button onClick={onReset} className="px-2 py-1.5 text-gray-500 hover:text-gray-300 text-sm">
          RESET
        </button>
      </div>

      {/* Time */}
      <div className="font-mono text-sm text-gray-400 w-24">
        <span className="text-white">{fmt(time)}</span>
        <span className="text-gray-600"> / {fmt(duration)}</span>
      </div>

      {/* Speed */}
      <div className="flex items-center gap-1">
        {[1, 2, 5, 10].map(s => (
          <button
            key={s}
            onClick={() => onSpeedChange(s)}
            className={`px-2 py-0.5 rounded text-[10px] font-mono ${
              speed === s ? "bg-cyan-800/60 text-cyan-300 border border-cyan-700/50" : "text-gray-600 hover:text-gray-400"
            }`}
          >
            {s}x
          </button>
        ))}
      </div>

      {/* Separator */}
      <div className="w-px h-6 bg-gray-800 mx-2" />

      {/* Interaction modes */}
      <div className="flex items-center gap-1">
        {MODE_BUTTONS.map(({ mode: m, label, key, icon }) => (
          <button
            key={m}
            onClick={() => onModeChange(m)}
            title={`${label} (${key})`}
            className={`px-2.5 py-1.5 rounded text-xs flex items-center gap-1.5 transition-colors ${
              mode === m
                ? "bg-cyan-800/60 text-cyan-300 border border-cyan-700/50"
                : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/50"
            }`}
          >
            <span>{icon}</span>
            <span className="hidden lg:inline">{label}</span>
            <kbd className="text-[9px] text-gray-600 ml-1">{key}</kbd>
          </button>
        ))}
      </div>

      {/* Right side: branding */}
      <div className="flex-1" />
      <div className="text-xs text-gray-600">
        GHOST LATTICE <span className="text-cyan-800">INTERACTIVE SANDBOX</span>
      </div>
    </div>
  );
}
