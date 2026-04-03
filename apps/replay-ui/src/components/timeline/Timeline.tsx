"use client";

import { useRef, useCallback } from "react";
import { ReplayStore } from "@/lib/replay-store";

interface Props {
  store: ReplayStore;
  time: number;
  playing: boolean;
  speed: number;
  onTimeChange: (t: number) => void;
  onTogglePlay: () => void;
  onSpeedChange: (s: number) => void;
}

export function Timeline({ store, time, playing, speed, onTimeChange, onTogglePlay, onSpeedChange }: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const events = store.getTimelineEvents();
  const duration = store.duration;
  const progress = (time / duration) * 100;

  const handleBarClick = useCallback(
    (e: React.MouseEvent) => {
      const bar = barRef.current;
      if (!bar) return;
      const rect = bar.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      onTimeChange(pct * duration);
    },
    [duration, onTimeChange]
  );

  const handleDrag = useCallback(
    (e: React.MouseEvent) => {
      if (e.buttons !== 1) return;
      handleBarClick(e);
    },
    [handleBarClick]
  );

  const fmt = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const phases = [
    { t: 0, label: "LAUNCH" },
    { t: 15, label: "DEPLOY" },
    { t: 45, label: "SEARCH" },
    { t: 60, label: "OP CMD" },
    { t: 120, label: "JAMMER" },
    { t: 180, label: "B2 LOST" },
    { t: 185, label: "RECOVERY" },
    { t: 240, label: "GPS DEG" },
  ];

  return (
    <div className="bg-[#0c1019] border-t border-gray-800/50 px-5 py-2.5 shrink-0">
      <div className="flex items-center gap-4">
        <button
          onClick={onTogglePlay}
          className="w-9 h-9 flex items-center justify-center rounded-md bg-cyan-900/40 hover:bg-cyan-800/50 border border-cyan-800/30 transition-colors text-cyan-400"
        >
          {playing ? "\u23F8" : "\u25B6"}
        </button>

        <div className="font-mono text-sm w-28 shrink-0">
          <span className="text-white">{fmt(time)}</span>
          <span className="text-gray-600"> / {fmt(duration)}</span>
        </div>

        <div className="flex items-center gap-1">
          {[1, 2, 5, 10, 20].map((s) => (
            <button
              key={s}
              onClick={() => onSpeedChange(s)}
              className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                speed === s
                  ? "bg-cyan-800/60 text-cyan-300 border border-cyan-700/50"
                  : "text-gray-600 hover:text-gray-400"
              }`}
            >
              {s}x
            </button>
          ))}
        </div>

        <div
          ref={barRef}
          className="flex-1 relative h-7 bg-gray-900/80 rounded cursor-pointer group"
          onClick={handleBarClick}
          onMouseMove={handleDrag}
        >
          <div
            className="absolute top-0 left-0 h-full bg-gradient-to-r from-cyan-900/40 to-cyan-800/20 rounded-l"
            style={{ width: `${progress}%` }}
          />

          {phases.map((p) => (
            <div key={p.t} className="absolute top-0 h-full flex items-center" style={{ left: `${(p.t / duration) * 100}%` }}>
              <div className="w-px h-full bg-gray-700/40" />
              <span className="text-[8px] text-gray-600 ml-1 whitespace-nowrap">{p.label}</span>
            </div>
          ))}

          {events.map((ev, i) => (
            <div key={i} className="absolute bottom-0.5 z-10" style={{ left: `${(ev.time / duration) * 100}%` }} title={`T+${ev.time.toFixed(0)}s: ${ev.label}`}>
              <div className="w-1.5 h-1.5 rounded-full -translate-x-1/2" style={{ backgroundColor: ev.color }} />
            </div>
          ))}

          <div className="absolute top-0 h-full w-0.5 bg-cyan-400 z-20 shadow-[0_0_6px_rgba(6,182,212,0.5)]" style={{ left: `${progress}%` }} />
        </div>
      </div>
    </div>
  );
}
