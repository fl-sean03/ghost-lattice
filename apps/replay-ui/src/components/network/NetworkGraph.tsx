"use client";

import { useEffect, useRef } from "react";
import { WorldSnapshot, ROLE_COLORS, VEHICLE_LABELS } from "@/lib/types";

interface Props {
  snapshot: WorldSnapshot;
}

export function NetworkGraph({ snapshot }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.parentElement?.getBoundingClientRect();
    if (rect) {
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }

    const w = rect?.width ?? 400;
    const h = rect?.height ?? 300;
    const cx = w / 2;
    const cy = h / 2;

    ctx.clearRect(0, 0, w, h);

    const vehicles = Array.from(snapshot.vehicles.entries());
    if (vehicles.length === 0) return;

    // Position nodes in a circle
    const nodePositions: Record<string, { x: number; y: number }> = {};
    const radius = Math.min(w, h) * 0.32;
    vehicles.forEach(([id], i) => {
      const angle = (i / vehicles.length) * Math.PI * 2 - Math.PI / 2;
      nodePositions[id] = {
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      };
    });

    // Draw edges
    if (snapshot.network) {
      for (const edge of snapshot.network.edges) {
        const from = nodePositions[edge.src];
        const to = nodePositions[edge.dst];
        if (!from || !to) continue;

        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);

        if (!edge.active) {
          ctx.strokeStyle = "rgba(75, 85, 99, 0.2)";
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
        } else if (edge.quality > 0.7) {
          ctx.strokeStyle = `rgba(34, 197, 94, ${0.3 + edge.quality * 0.5})`;
          ctx.lineWidth = 2;
          ctx.setLineDash([]);
        } else if (edge.quality > 0.3) {
          ctx.strokeStyle = `rgba(245, 158, 11, ${0.3 + edge.quality * 0.5})`;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([]);
        } else {
          ctx.strokeStyle = `rgba(239, 68, 68, ${0.3 + edge.quality * 0.5})`;
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 2]);
        }

        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Draw nodes
    vehicles.forEach(([id, state]) => {
      const pos = nodePositions[id];
      if (!pos) return;

      const color = ROLE_COLORS[state.current_role] || "#888";
      const label = VEHICLE_LABELS[id] || id;

      // Node circle
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 18, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // Border
      ctx.strokeStyle = "white";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Label
      ctx.fillStyle = "white";
      ctx.font = "bold 11px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, pos.x, pos.y);

      // Role label below
      ctx.fillStyle = "#9ca3af";
      ctx.font = "9px sans-serif";
      ctx.fillText(state.current_role, pos.x, pos.y + 28);
    });

    // Partition info
    if (snapshot.network && snapshot.network.partition_count > 1) {
      ctx.fillStyle = "#ef4444";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        `PARTITIONED (${snapshot.network.partition_count} groups)`,
        cx, h - 15
      );
    } else {
      ctx.fillStyle = "#22c55e";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Connected", cx, h - 15);
    }
  }, [snapshot]);

  return (
    <div className="w-full h-full">
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}
