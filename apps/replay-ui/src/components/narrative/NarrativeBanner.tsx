"use client";

import { WorldSnapshot } from "@/lib/types";

interface Props {
  time: number;
  snapshot: WorldSnapshot;
}

interface Phase {
  start: number;
  end: number;
  title: string;
  description: string;
  accent: string;
}

const PHASES: Phase[] = [
  {
    start: 0, end: 5,
    title: "LAUNCH",
    description: "6 drones lifting off from base. 3 vendors, different capabilities. Operator gave one directive: search sector red, low signature, auto-reassign roles.",
    accent: "cyan",
  },
  {
    start: 5, end: 15,
    title: "CLIMBING TO ALTITUDE",
    description: "All vehicles climbing to cruise altitude and beginning to move toward the search sector. Roles assigned by capability: 3 scouts, 1 relay, 1 tracker, 1 decoy.",
    accent: "cyan",
  },
  {
    start: 15, end: 45,
    title: "DEPLOYING INTO SECTOR",
    description: "Watch the swarm spread out. Scouts (blue) fan toward sector red. Relay (green) holds position between base and fleet. Tracker (amber) moves toward the emitter. Decoy (red) positions at the sector perimeter.",
    accent: "cyan",
  },
  {
    start: 45, end: 58,
    title: "ACTIVE SEARCH",
    description: "Scouts sweeping sector red in parallel lanes. Tracker orbiting mobile emitter. Relay maintaining backbone to base. Coverage climbing. Zero operator input so far.",
    accent: "green",
  },
  {
    start: 58, end: 70,
    title: "OPERATOR REDIRECT",
    description: "Single operator command: \"Focus search north.\" Watch the scouts shift their lanes upward. This is the only human input during the entire 5-minute mission.",
    accent: "blue",
  },
  {
    start: 70, end: 118,
    title: "CONTINUED SEARCH",
    description: "Scouts sweeping back and forth across sector. Emitter being tracked. Network fully connected (see sidebar). The swarm operates itself.",
    accent: "green",
  },
  {
    start: 118, end: 125,
    title: "JAMMER ACTIVATED",
    description: "Red zone appearing on map: active jammer at [200, 150], radius 150m. Watch the network links in the sidebar degrade. Drones near the jammer lose comms quality.",
    accent: "red",
  },
  {
    start: 125, end: 178,
    title: "OPERATING UNDER JAMMING",
    description: "Swarm continues mission despite jammer. Some network links degraded (yellow/red in sidebar). Scouts adjust paths. Coverage still growing, just slower.",
    accent: "amber",
  },
  {
    start: 178, end: 185,
    title: "NODE LOSS — BRAVO-2 DOWN",
    description: "Bravo-2 (tracker) power failure — vehicle disappears from map. Fleet roster shows LOST. 5 vehicles remain. No operator involved in the response.",
    accent: "red",
  },
  {
    start: 185, end: 210,
    title: "AUTONOMOUS RECOVERY",
    description: "Watch the role changes in the sidebar: Alpha-2 becomes tracker and moves toward the emitter. Charlie-2 becomes relay and repositions to bridge the network. Bravo-1 joins the search pattern as scout.",
    accent: "purple",
  },
  {
    start: 210, end: 238,
    title: "POST-RECOVERY OPERATIONS",
    description: "Swarm stabilized with new roles. 5 vehicles covering all functions. Tracking resumed. Search continuing. No human told the swarm what to do — it figured it out.",
    accent: "green",
  },
  {
    start: 238, end: 250,
    title: "GPS DEGRADATION",
    description: "Amber zone on map: GPS accuracy degraded in eastern sector. Vehicles in zone may drift slightly. Mission continues — not all vehicles are affected.",
    accent: "amber",
  },
  {
    start: 250, end: 300,
    title: "MISSION COMPLETE",
    description: "5 of 6 vehicles operational. Swarm proved resilient to jamming, node loss, and GPS degradation with only 1 operator command. Scorecard appears at T+5:00.",
    accent: "green",
  },
];

const ACCENT_STYLES: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  cyan:   { bg: "bg-cyan-950/40",   text: "text-cyan-400",   border: "border-cyan-800/50",   dot: "bg-cyan-400" },
  green:  { bg: "bg-green-950/40",  text: "text-green-400",  border: "border-green-800/50",  dot: "bg-green-400" },
  blue:   { bg: "bg-blue-950/40",   text: "text-blue-400",   border: "border-blue-800/50",   dot: "bg-blue-400" },
  red:    { bg: "bg-red-950/40",    text: "text-red-400",    border: "border-red-800/50",    dot: "bg-red-400" },
  amber:  { bg: "bg-amber-950/40",  text: "text-amber-400",  border: "border-amber-800/50",  dot: "bg-amber-400" },
  purple: { bg: "bg-purple-950/40", text: "text-purple-400", border: "border-purple-800/50", dot: "bg-purple-400" },
};

export function NarrativeBanner({ time, snapshot }: Props) {
  const phase = PHASES.find((p) => time >= p.start && time < p.end) ?? PHASES[PHASES.length - 1];
  const style = ACCENT_STYLES[phase.accent] ?? ACCENT_STYLES.cyan;
  const coverage = snapshot.metrics.get("search_coverage_pct") ?? 0;
  const vehicles = snapshot.vehicles.size;
  const partitions = snapshot.network?.partition_count ?? 1;

  return (
    <div className={`${style.bg} border-b ${style.border} px-6 py-3 shrink-0 flex items-center gap-6`}>
      <div className="flex items-center gap-3 shrink-0">
        <div className={`w-2 h-2 rounded-full ${style.dot} animate-pulse`} />
        <div className={`text-sm font-bold tracking-wider ${style.text}`}>
          {phase.title}
        </div>
      </div>

      <div className="w-px h-8 bg-gray-700/50" />

      <div className="text-xs text-gray-400 leading-relaxed flex-1">
        {phase.description}
      </div>

      <div className="flex items-center gap-4 shrink-0 text-xs">
        <div className="text-center">
          <div className="text-gray-600 uppercase text-[10px]">Coverage</div>
          <div className={coverage > 50 ? "text-green-400" : "text-gray-400"}>{coverage.toFixed(0)}%</div>
        </div>
        <div className="text-center">
          <div className="text-gray-600 uppercase text-[10px]">Active</div>
          <div className={vehicles >= 6 ? "text-green-400" : "text-amber-400"}>{vehicles}/6</div>
        </div>
        <div className="text-center">
          <div className="text-gray-600 uppercase text-[10px]">Network</div>
          <div className={partitions === 1 ? "text-green-400" : "text-red-400"}>
            {partitions === 1 ? "CONN" : `SPLIT(${partitions})`}
          </div>
        </div>
      </div>
    </div>
  );
}
