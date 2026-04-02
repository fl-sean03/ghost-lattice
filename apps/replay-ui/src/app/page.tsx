"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { ReplayStore } from "@/lib/replay-store";
import { WorldSnapshot } from "@/lib/types";
import { TacticalMap } from "@/components/tactical-map/TacticalMap";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { Timeline } from "@/components/timeline/Timeline";
import { NarrativeBanner } from "@/components/narrative/NarrativeBanner";
import { ScorePanel } from "@/components/scorecard/ScorePanel";

export default function ReplayPage() {
  const [store, setStore] = useState<ReplayStore | null>(null);
  const [loading, setLoading] = useState(true);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [snapshot, setSnapshot] = useState<WorldSnapshot | null>(null);
  const [showScorecard, setShowScorecard] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
  const animRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);

  useEffect(() => {
    const s = new ReplayStore();
    s.loadFromFiles("/data/golden_run").then(() => {
      setStore(s);
      setSnapshot(s.getSnapshotAt(0));
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (store) setSnapshot(store.getSnapshotAt(time));
  }, [store, time]);

  useEffect(() => {
    if (!playing || !store) return;
    lastFrameRef.current = performance.now();
    const animate = (now: number) => {
      const dt = (now - lastFrameRef.current) / 1000;
      lastFrameRef.current = now;
      setTime((prev) => {
        const next = prev + dt * speed;
        if (next >= store.duration) {
          setPlaying(false);
          setShowScorecard(true);
          return store.duration;
        }
        return next;
      });
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [playing, speed, store]);

  const togglePlay = useCallback(() => {
    if (time >= (store?.duration ?? 300)) {
      setTime(0);
      setShowScorecard(false);
    }
    setPlaying((p) => !p);
  }, [time, store]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0a0e17] text-white font-mono">
        <div className="text-center space-y-3">
          <div className="text-3xl font-bold tracking-widest text-cyan-400">GHOST LATTICE</div>
          <div className="text-sm text-gray-500 tracking-wider">MISSION DIGITAL TWIN</div>
          <div className="w-48 h-1 bg-gray-800 mx-auto mt-4 rounded overflow-hidden">
            <div className="h-full bg-cyan-500 animate-pulse rounded" style={{ width: "60%" }} />
          </div>
          <div className="text-xs text-gray-600 mt-2">Loading mission telemetry...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#0a0e17] text-white font-mono overflow-hidden select-none">
      {/* Narrative banner */}
      {snapshot && <NarrativeBanner time={time} snapshot={snapshot} />}

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Tactical map — main hero */}
        <div className="flex-1 relative">
          {snapshot && store && (
            <TacticalMap
              snapshot={snapshot}
              store={store}
              time={time}
              selectedVehicle={selectedVehicle}
              onSelectVehicle={setSelectedVehicle}
            />
          )}
        </div>

        {/* Right sidebar */}
        <div className="w-[380px] shrink-0 border-l border-gray-800/50">
          {snapshot && store && (
            <Sidebar
              snapshot={snapshot}
              store={store}
              time={time}
              selectedVehicle={selectedVehicle}
            />
          )}
        </div>
      </div>

      {/* Timeline */}
      {store && (
        <Timeline
          store={store}
          time={time}
          playing={playing}
          speed={speed}
          onTimeChange={setTime}
          onTogglePlay={togglePlay}
          onSpeedChange={setSpeed}
        />
      )}

      {/* Scorecard overlay */}
      {showScorecard && store?.scorecard && (
        <ScorePanel scorecard={store.scorecard} onClose={() => setShowScorecard(false)} />
      )}
    </div>
  );
}
