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

  const formatTime = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="bg-gray-900 border-t border-gray-800 px-4 py-2 shrink-0">
      {/* Controls row */}
      <div className="flex items-center gap-3 mb-2">
        <button
          onClick={onTogglePlay}
          className="w-8 h-8 flex items-center justify-center rounded bg-gray-800 hover:bg-gray-700 transition-colors text-lg"
        >
          {playing ? "II" : "\u25B6"}
        </button>

        <span className="font-mono text-sm text-gray-300 w-24">
          {formatTime(time)} / {formatTime(duration)}
        </span>

        <div className="flex items-center gap-1.5 text-xs">
          {[0.5, 1, 2, 5, 10].map((s) => (
            <button
              key={s}
              onClick={() => onSpeedChange(s)}
              className={`px-2 py-0.5 rounded ${
                speed === s
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {s}x
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <div className="text-xs text-gray-500">
          {events.filter((e) => store.getTimelineEvents().find((x) => x.time <= time && x.type === e.type)).length > 0 && (
            <span>Click timeline to scrub</span>
          )}
        </div>
      </div>

      {/* Timeline bar */}
      <div
        ref={barRef}
        className="relative h-8 bg-gray-800 rounded cursor-pointer select-none"
        onClick={handleBarClick}
        onMouseMove={handleDrag}
      >
        {/* Progress fill */}
        <div
          className="absolute top-0 left-0 h-full bg-blue-900/50 rounded-l"
          style={{ width: `${progress}%` }}
        />

        {/* Event markers */}
        {events.map((ev, i) => (
          <div
            key={i}
            className="absolute top-0 h-full flex flex-col items-center justify-end"
            style={{ left: `${(ev.time / duration) * 100}%` }}
          >
            <div
              className="w-2 h-2 rounded-full mb-1 z-10"
              style={{ backgroundColor: ev.color }}
              title={`T+${ev.time.toFixed(0)}s: ${ev.label}`}
            />
            <div className="w-px h-3 opacity-30" style={{ backgroundColor: ev.color }} />
          </div>
        ))}

        {/* Playhead */}
        <div
          className="absolute top-0 h-full w-0.5 bg-white z-20"
          style={{ left: `${progress}%` }}
        />

        {/* Time labels */}
        {[0, 60, 120, 180, 240, 300].map((t) => (
          <div
            key={t}
            className="absolute top-0.5 text-[9px] text-gray-600 font-mono"
            style={{ left: `${(t / duration) * 100}%`, transform: "translateX(-50%)" }}
          >
            {formatTime(t)}
          </div>
        ))}
      </div>
    </div>
  );
}
