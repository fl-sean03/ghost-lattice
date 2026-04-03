"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { SimEngine, type SimEvent } from "@/sim/engine";
import type { ScenarioConfig } from "@/sim/config";
import type { WorldSnapshot } from "@/lib/types";
import type { LiveScorecard } from "@/sim/scoring/metrics";

export function useSimEngine(config?: ScenarioConfig) {
  const engineRef = useRef<SimEngine | null>(null);
  const [snapshot, setSnapshot] = useState<WorldSnapshot | null>(null);
  const [running, setRunning] = useState(false);
  const [time, setTime] = useState(0);
  const [events, setEvents] = useState<SimEvent[]>([]);

  useEffect(() => {
    const engine = new SimEngine(config);
    engineRef.current = engine;

    const unsub = engine.subscribe((snap) => {
      setSnapshot(snap);
      setTime(engine.elapsed);
      setEvents([...engine.events]);
      setRunning(engine.running);
    });

    // Initial snapshot
    setSnapshot(engine.getSnapshot());

    return () => {
      unsub();
      engine.dispose();
    };
  }, [config]);

  const start = useCallback(() => { engineRef.current?.start(); setRunning(true); }, []);
  const pause = useCallback(() => { engineRef.current?.pause(); setRunning(false); }, []);
  const resume = useCallback(() => { engineRef.current?.resume(); setRunning(true); }, []);
  const reset = useCallback(() => { engineRef.current?.reset(); setRunning(false); setTime(0); }, []);
  const step = useCallback(() => { engineRef.current?.step(); }, []);
  const setSpeed = useCallback((s: number) => { engineRef.current?.setSpeed(s); }, []);

  const getScorecard = useCallback((): LiveScorecard | null => {
    return engineRef.current?.getScorecard() ?? null;
  }, []);

  return {
    engine: engineRef.current,
    snapshot,
    running,
    time,
    events,
    start, pause, resume, reset, step, setSpeed, getScorecard,
  };
}
