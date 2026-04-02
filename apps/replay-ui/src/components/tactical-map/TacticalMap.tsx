"use client";

import { useEffect, useRef, useCallback } from "react";
import { WorldSnapshot, VehicleStatePayload, ROLE_COLORS, VEHICLE_LABELS, NetworkEdge } from "@/lib/types";
import { ReplayStore } from "@/lib/replay-store";

interface Props {
  snapshot: WorldSnapshot;
  store: ReplayStore;
  time: number;
  selectedVehicle: string | null;
  onSelectVehicle: (id: string | null) => void;
}

// World bounds from mission_001.yaml: operations area 0-450m x -50-350m
const WORLD = { minX: -30, maxX: 450, minY: -30, maxY: 350 };
const BUILDINGS = [
  { cx: 150, cy: 100, w: 30, h: 20 },
  { cx: 250, cy: 200, w: 40, h: 15 },
  { cx: 350, cy: 50, w: 20, h: 30 },
];

export function TacticalMap({ snapshot, store, time, selectedVehicle, onSelectVehicle }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trailsRef = useRef<Map<string, Array<[number, number]>>>(new Map());

  // Update trails
  useEffect(() => {
    const trails = trailsRef.current;
    for (const [id, state] of snapshot.vehicles) {
      const x = state.position_ned[0];
      const y = state.position_ned[1];
      if (!trails.has(id)) trails.set(id, []);
      const trail = trails.get(id)!;
      // Only add if moved significantly
      const last = trail[trail.length - 1];
      if (!last || Math.abs(x - last[0]) > 5 || Math.abs(y - last[1]) > 5) {
        trail.push([x, y]);
        if (trail.length > 80) trail.shift();
      }
    }
  }, [snapshot]);

  // Clear trails on reset
  useEffect(() => {
    if (time < 1) trailsRef.current.clear();
  }, [time]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio;
      const mx = (e.clientX - rect.left) * dpr;
      const my = (e.clientY - rect.top) * dpr;
      const w = canvas.width;
      const h = canvas.height;

      // Check if click is near a drone
      for (const [id, state] of snapshot.vehicles) {
        const sx = ((state.position_ned[0] - WORLD.minX) / (WORLD.maxX - WORLD.minX)) * w;
        const sy = ((state.position_ned[1] - WORLD.minY) / (WORLD.maxY - WORLD.minY)) * h;
        const dist = Math.sqrt((mx - sx) ** 2 + (my - sy) ** 2);
        if (dist < 25 * dpr) {
          onSelectVehicle(selectedVehicle === id ? null : id);
          return;
        }
      }
      onSelectVehicle(null);
    },
    [snapshot, selectedVehicle, onSelectVehicle]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const parent = canvas.parentElement;
    if (!parent) return;
    const dpr = window.devicePixelRatio;
    const w = parent.clientWidth * dpr;
    const h = parent.clientHeight * dpr;
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${parent.clientWidth}px`;
    canvas.style.height = `${parent.clientHeight}px`;

    // Coordinate transform: world -> screen
    const toScreen = (wx: number, wy: number): [number, number] => {
      const sx = ((wx - WORLD.minX) / (WORLD.maxX - WORLD.minX)) * w;
      const sy = ((wy - WORLD.minY) / (WORLD.maxY - WORLD.minY)) * h;
      return [sx, sy];
    };

    // --- Background ---
    ctx.fillStyle = "#080c14";
    ctx.fillRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = "rgba(30, 58, 80, 0.3)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= 450; x += 50) {
      const [sx] = toScreen(x, 0);
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, h);
      ctx.stroke();
    }
    for (let y = 0; y <= 350; y += 50) {
      const [, sy] = toScreen(0, y);
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(w, sy);
      ctx.stroke();
    }

    // Grid labels
    ctx.fillStyle = "rgba(100, 120, 140, 0.4)";
    ctx.font = `${10 * dpr}px monospace`;
    for (let x = 0; x <= 400; x += 100) {
      const [sx, sy] = toScreen(x, -20);
      ctx.fillText(`${x}m`, sx, sy);
    }

    // --- Search sector ---
    const [s1x, s1y] = toScreen(100, 0);
    const [s2x, s2y] = toScreen(400, 300);
    ctx.strokeStyle = "rgba(34, 197, 94, 0.35)";
    ctx.lineWidth = 2 * dpr;
    ctx.setLineDash([8 * dpr, 4 * dpr]);
    ctx.strokeRect(s1x, s1y, s2x - s1x, s2y - s1y);
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(34, 197, 94, 0.04)";
    ctx.fillRect(s1x, s1y, s2x - s1x, s2y - s1y);
    // Label
    ctx.fillStyle = "rgba(34, 197, 94, 0.5)";
    ctx.font = `bold ${11 * dpr}px monospace`;
    ctx.fillText("SECTOR RED", s1x + 8 * dpr, s1y + 14 * dpr);

    // --- No-fly zone ---
    const [nfx1, nfy1] = toScreen(50, 200);
    const [nfx2, nfy2] = toScreen(100, 250);
    ctx.fillStyle = "rgba(239, 68, 68, 0.08)";
    ctx.fillRect(nfx1, nfy1, nfx2 - nfx1, nfy2 - nfy1);
    ctx.strokeStyle = "rgba(239, 68, 68, 0.4)";
    ctx.lineWidth = 2 * dpr;
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.strokeRect(nfx1, nfy1, nfx2 - nfx1, nfy2 - nfy1);
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(239, 68, 68, 0.5)";
    ctx.font = `${9 * dpr}px monospace`;
    ctx.fillText("NFZ", nfx1 + 4 * dpr, nfy1 + 12 * dpr);

    // --- Buildings ---
    for (const b of BUILDINGS) {
      const [bx, by] = toScreen(b.cx - b.w / 2, b.cy - b.h / 2);
      const [bx2, by2] = toScreen(b.cx + b.w / 2, b.cy + b.h / 2);
      ctx.fillStyle = "rgba(55, 65, 81, 0.6)";
      ctx.fillRect(bx, by, bx2 - bx, by2 - by);
      ctx.strokeStyle = "rgba(75, 85, 99, 0.5)";
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, bx2 - bx, by2 - by);
    }

    // --- Base station ---
    const [basex, basey] = toScreen(0, 0);
    ctx.beginPath();
    ctx.arc(basex, basey, 8 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(34, 197, 94, 0.8)";
    ctx.fill();
    ctx.fillStyle = "rgba(34, 197, 94, 0.5)";
    ctx.font = `bold ${10 * dpr}px monospace`;
    ctx.fillText("BASE", basex + 12 * dpr, basey + 4 * dpr);

    // --- Active disruptions ---
    for (const d of snapshot.activeDisruptions) {
      if (d.disruption_type === "jammer_on") {
        const [jx, jy] = toScreen(d.center[0], d.center[1]);
        const jr = (d.radius_m / (WORLD.maxX - WORLD.minX)) * w;
        // Gradient circle
        const grad = ctx.createRadialGradient(jx, jy, 0, jx, jy, jr);
        grad.addColorStop(0, "rgba(239, 68, 68, 0.12)");
        grad.addColorStop(0.5, "rgba(239, 68, 68, 0.05)");
        grad.addColorStop(1, "rgba(239, 68, 68, 0)");
        ctx.beginPath();
        ctx.arc(jx, jy, jr, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
        // Border
        ctx.strokeStyle = "rgba(239, 68, 68, 0.3)";
        ctx.lineWidth = 1.5 * dpr;
        ctx.setLineDash([6 * dpr, 3 * dpr]);
        ctx.stroke();
        ctx.setLineDash([]);
        // Label
        ctx.fillStyle = "rgba(239, 68, 68, 0.6)";
        ctx.font = `bold ${12 * dpr}px monospace`;
        ctx.textAlign = "center";
        ctx.fillText("JAMMER", jx, jy - jr - 6 * dpr);
        ctx.font = `${9 * dpr}px monospace`;
        ctx.fillText(`${d.strength_dbm}dBm r=${d.radius_m}m`, jx, jy - jr + 8 * dpr);
        ctx.textAlign = "left";
      }
      if (d.disruption_type === "gps_degrade") {
        const [gx, gy] = toScreen(d.center[0], d.center[1]);
        const gr = (d.radius_m / (WORLD.maxX - WORLD.minX)) * w;
        ctx.beginPath();
        ctx.arc(gx, gy, gr, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(245, 158, 11, 0.05)";
        ctx.fill();
        ctx.strokeStyle = "rgba(245, 158, 11, 0.25)";
        ctx.lineWidth = 1.5 * dpr;
        ctx.setLineDash([4 * dpr, 4 * dpr]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(245, 158, 11, 0.7)";
        ctx.font = `bold ${10 * dpr}px monospace`;
        ctx.textAlign = "center";
        ctx.fillText("GPS DEGRADED", gx, gy);
        ctx.textAlign = "left";
      }
    }

    // --- Network links (subtle — only show degraded/failing links prominently) ---
    if (snapshot.network) {
      for (const edge of snapshot.network.edges) {
        if (!edge.active) continue;
        const v1 = snapshot.vehicles.get(edge.src);
        const v2 = snapshot.vehicles.get(edge.dst);
        if (!v1 || !v2) continue;
        const [x1, y1] = toScreen(v1.position_ned[0], v1.position_ned[1]);
        const [x2, y2] = toScreen(v2.position_ned[0], v2.position_ned[1]);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        if (edge.quality > 0.7) {
          // Good links: very subtle
          ctx.strokeStyle = `rgba(34, 197, 94, 0.06)`;
          ctx.lineWidth = 0.5 * dpr;
        } else if (edge.quality > 0.3) {
          // Degraded: more visible
          ctx.strokeStyle = `rgba(245, 158, 11, 0.15)`;
          ctx.lineWidth = 1 * dpr;
        } else {
          // Failing: visible warning
          ctx.strokeStyle = `rgba(239, 68, 68, 0.25)`;
          ctx.lineWidth = 1 * dpr;
          ctx.setLineDash([3 * dpr, 3 * dpr]);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // --- Drone trails (fading gradient) ---
    for (const [id, trail] of trailsRef.current) {
      if (trail.length < 2) continue;
      const state = snapshot.vehicles.get(id);
      const color = state ? (ROLE_COLORS[state.current_role] || "#666") : "#444";

      // Draw trail with fading opacity
      const len = trail.length;
      for (let i = 1; i < len; i++) {
        const alpha = Math.floor((i / len) * 25); // 0-25 hex opacity (very subtle)
        const [x1, y1] = toScreen(trail[i - 1][0], trail[i - 1][1]);
        const [x2, y2] = toScreen(trail[i][0], trail[i][1]);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = color + alpha.toString(16).padStart(2, "0");
        ctx.lineWidth = 1.2 * dpr;
        ctx.stroke();
      }
    }

    // --- Drones ---
    const vehicles = Array.from(snapshot.vehicles.entries());
    for (const [id, state] of vehicles) {
      const [sx, sy] = toScreen(state.position_ned[0], state.position_ned[1]);
      const color = ROLE_COLORS[state.current_role] || "#666";
      const label = VEHICLE_LABELS[id] || id;
      const isSelected = selectedVehicle === id;
      const size = isSelected ? 14 * dpr : 10 * dpr;

      // Glow
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, size * 2.5);
      glow.addColorStop(0, color + "30");
      glow.addColorStop(1, color + "00");
      ctx.beginPath();
      ctx.arc(sx, sy, size * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = glow;
      ctx.fill();

      // Selection ring
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(sx, sy, size + 4 * dpr, 0, Math.PI * 2);
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2 * dpr;
        ctx.stroke();
      }

      // Drone marker (diamond)
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = color;
      ctx.fillRect(-size / 2, -size / 2, size, size);
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 1 * dpr;
      ctx.strokeRect(-size / 2, -size / 2, size, size);
      ctx.restore();

      // Label
      ctx.fillStyle = "white";
      ctx.font = `bold ${10 * dpr}px monospace`;
      ctx.textAlign = "center";
      ctx.fillText(label, sx, sy - size - 4 * dpr);

      // Role label
      ctx.fillStyle = color + "cc";
      ctx.font = `${8 * dpr}px monospace`;
      ctx.fillText(state.current_role.toUpperCase(), sx, sy + size + 10 * dpr);
      ctx.textAlign = "left";

      // Battery bar
      const barW = 20 * dpr;
      const barH = 3 * dpr;
      const barX = sx - barW / 2;
      const barY = sy + size + 14 * dpr;
      ctx.fillStyle = "rgba(30,30,30,0.8)";
      ctx.fillRect(barX, barY, barW, barH);
      const batColor = state.battery_pct > 50 ? "#22c55e" : state.battery_pct > 20 ? "#f59e0b" : "#ef4444";
      ctx.fillStyle = batColor;
      ctx.fillRect(barX, barY, barW * (state.battery_pct / 100), barH);
    }

    // --- HUD overlay ---
    // Title
    ctx.fillStyle = "rgba(6, 182, 212, 0.6)";
    ctx.font = `bold ${13 * dpr}px monospace`;
    ctx.textAlign = "left";
    ctx.fillText("GHOST LATTICE  |  TACTICAL OVERVIEW", 16 * dpr, 24 * dpr);

    // Time
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = `${11 * dpr}px monospace`;
    ctx.textAlign = "right";
    const m = Math.floor(time / 60);
    const s = Math.floor(time % 60);
    ctx.fillText(`T+${m}:${s.toString().padStart(2, "0")}`, w - 16 * dpr, 24 * dpr);

    // Scale bar
    const scaleM = 100; // 100m
    const scaleW = (scaleM / (WORLD.maxX - WORLD.minX)) * w;
    const scaleX = 16 * dpr;
    const scaleY = h - 20 * dpr;
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.moveTo(scaleX, scaleY);
    ctx.lineTo(scaleX + scaleW, scaleY);
    ctx.moveTo(scaleX, scaleY - 4 * dpr);
    ctx.lineTo(scaleX, scaleY + 4 * dpr);
    ctx.moveTo(scaleX + scaleW, scaleY - 4 * dpr);
    ctx.lineTo(scaleX + scaleW, scaleY + 4 * dpr);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = `${9 * dpr}px monospace`;
    ctx.textAlign = "center";
    ctx.fillText(`${scaleM}m`, scaleX + scaleW / 2, scaleY - 6 * dpr);
    ctx.textAlign = "left";

  }, [snapshot, time, selectedVehicle]);

  return (
    <div className="w-full h-full relative">
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-crosshair"
        onClick={handleClick}
      />
    </div>
  );
}
