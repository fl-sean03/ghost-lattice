"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { ReplayStore } from "@/lib/replay-store";
import { WorldSnapshot } from "@/lib/types";
import dynamic from "next/dynamic";
import { NetworkGraph } from "@/components/network/NetworkGraph";
import { OperatorPane } from "@/components/operator/OperatorPane";
import { Timeline } from "@/components/timeline/Timeline";
import { ScorePanel } from "@/components/scorecard/ScorePanel";

const MissionScene = dynamic(
  () => import("@/components/mission-3d/MissionScene").then((m) => m.MissionScene),
  { ssr: false }
);

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
      <div className="flex items-center justify-center h-screen bg-gray-950 text-white">
        <div className="text-center">
          <div className="text-2xl font-bold mb-2">Ghost Lattice</div>
          <div className="text-gray-400">Loading mission data...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white overflow-hidden">
      <header className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold tracking-tight">Ghost Lattice</h1>
          <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
            Mission Replay
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-400">
            {store?.metadata?.scenario_id} | {store?.metadata?.vehicle_count} vehicles
          </span>
          <span className="font-mono text-green-400">
            T+{time.toFixed(1)}s / {store?.duration}s
          </span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-[3] border-r border-gray-800 relative">
          <div className="absolute top-2 left-2 z-10 text-xs text-gray-500 bg-gray-900/80 px-2 py-1 rounded">
            3D Mission View
          </div>
          {snapshot && (
            <MissionScene
              snapshot={snapshot}
              selectedVehicle={selectedVehicle}
              onSelectVehicle={setSelectedVehicle}
            />
          )}
        </div>

        <div className="flex-[2] flex flex-col">
          <div className="flex-1 border-b border-gray-800 relative min-h-0">
            <div className="absolute top-2 left-2 z-10 text-xs text-gray-500 bg-gray-900/80 px-2 py-1 rounded">
              Network Topology
            </div>
            {snapshot && <NetworkGraph snapshot={snapshot} />}
          </div>

          <div className="flex-1 relative overflow-auto min-h-0">
            <div className="absolute top-2 left-2 z-10 text-xs text-gray-500 bg-gray-900/80 px-2 py-1 rounded">
              Operator Console
            </div>
            {snapshot && store && (
              <OperatorPane
                snapshot={snapshot}
                store={store}
                time={time}
                selectedVehicle={selectedVehicle}
              />
            )}
          </div>
        </div>
      </div>

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

      {showScorecard && store?.scorecard && (
        <ScorePanel
          scorecard={store.scorecard}
          onClose={() => setShowScorecard(false)}
        />
      )}
    </div>
  );
}
