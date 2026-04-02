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
  accent: string; // tailwind color
}

const PHASES: Phase[] = [
  {
    start: 0, end: 15,
    title: "MISSION INITIALIZATION",
    description: "Operator issues single search directive. 6 drones from 3 vendors prepare for launch. Swarm will self-organize with zero micromanagement.",
    accent: "cyan",
  },
  {
    start: 15, end: 35,
    title: "AUTONOMOUS DEPLOYMENT",
    description: "Swarm fans out into search sector. Roles self-assign by capability: scouts search, relay holds backbone, tracker acquires emitter, decoy positions at perimeter.",
    accent: "cyan",
  },
  {
    start: 35, end: 58,
    title: "STEADY STATE OPERATIONS",
    description: "Coverage climbing. Emitter tracked. Relay backbone stable. Zero operator input required. The swarm is working.",
    accent: "green",
  },
  {
    start: 58, end: 65,
    title: "OPERATOR REDIRECT",
    description: "Single operator intervention: \"Focus search north.\" Scouts adjust pattern. This is the only human input during the entire mission.",
    accent: "blue",
  },
  {
    start: 65, end: 118,
    title: "CONTINUED OPERATIONS",
    description: "Search coverage growing. Network fully connected. Tracking emitter. One operator command total.",
    accent: "green",
  },
  {
    start: 118, end: 125,
    title: "JAMMER ACTIVATED",
    description: "Active jammer comes online at zone J1. Signal degradation spreading. Network links failing. Partition forming.",
    accent: "red",
  },
  {
    start: 125, end: 178,
    title: "OPERATING UNDER JAMMING",
    description: "Swarm adapting to degraded comms. Network partitioned. Roles holding. Coverage continuing despite DDIL impairment.",
    accent: "amber",
  },
  {
    start: 178, end: 188,
    title: "NODE LOSS — BRAVO-2 DOWN",
    description: "Bravo-2 power failure. Vehicle lost. Swarm detecting loss and initiating autonomous recovery. No operator involvement.",
    accent: "red",
  },
  {
    start: 188, end: 238,
    title: "AUTONOMOUS RECOVERY",
    description: "Role reassignment cascade: Charlie-2 becomes relay (bridges partition), Alpha-2 takes over tracking, Bravo-1 joins search. Recovery in 8 seconds. No human input.",
    accent: "purple",
  },
  {
    start: 238, end: 245,
    title: "GPS DEGRADATION",
    description: "GPS accuracy degraded in eastern sector. Affected vehicles switching navigation modes. Mission continuing.",
    accent: "amber",
  },
  {
    start: 245, end: 300,
    title: "MISSION COMPLETION",
    description: "5 of 6 vehicles operational. Coverage at 72%. All objectives progressing. Swarm proved resilient to jamming, node loss, and GPS degradation.",
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
      {/* Phase indicator */}
      <div className="flex items-center gap-3 shrink-0">
        <div className={`w-2 h-2 rounded-full ${style.dot} animate-pulse`} />
        <div className={`text-sm font-bold tracking-wider ${style.text}`}>
          {phase.title}
        </div>
      </div>

      {/* Separator */}
      <div className="w-px h-8 bg-gray-700/50" />

      {/* Description */}
      <div className="text-xs text-gray-400 leading-relaxed flex-1">
        {phase.description}
      </div>

      {/* Quick stats */}
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
