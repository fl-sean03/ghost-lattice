"use client";

import { useEffect, useRef, useCallback } from "react";
import { WorldSnapshot, VehicleStatePayload, ROLE_COLORS, VEHICLE_LABELS, NetworkEdge } from "@/lib/types";
import { ReplayStore } from "@/lib/replay-store";

export interface MapEvent {
  time: number;
  type: string;
  entity?: string;
  detail: string;
}

interface Props {
  snapshot: WorldSnapshot;
  store: ReplayStore;
  time: number;
  selectedVehicle: string | null;
  onSelectVehicle: (id: string | null) => void;
  recentEvents?: MapEvent[];
}

// World bounds now come from snapshot.world.viewBounds (auto-fit per scenario)
// Fallback for legacy compatibility
const DEFAULT_WORLD = { minX: -30, maxX: 450, minY: -30, maxY: 350 };

export function TacticalMap({ snapshot, store, time, selectedVehicle, onSelectVehicle, recentEvents = [] }: Props) {
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
      const vb = snapshot.world?.viewBounds ?? DEFAULT_WORLD;
      for (const [id, state] of snapshot.vehicles) {
        const sx = ((state.position_ned[0] - vb.minX) / (vb.maxX - vb.minX)) * w;
        const sy = ((state.position_ned[1] - vb.minY) / (vb.maxY - vb.minY)) * h;
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

    // Dynamic world bounds from scenario config
    const WORLD = snapshot.world?.viewBounds ?? DEFAULT_WORLD;

    // Coordinate transform: world -> screen
    const toScreen = (wx: number, wy: number): [number, number] => {
      const sx = ((wx - WORLD.minX) / (WORLD.maxX - WORLD.minX)) * w;
      const sy = ((wy - WORLD.minY) / (WORLD.maxY - WORLD.minY)) * h;
      return [sx, sy];
    };

    // --- Background ---
    ctx.fillStyle = "#080c14";
    ctx.fillRect(0, 0, w, h);

    // Grid — adapt spacing to world size
    const worldRangeX = WORLD.maxX - WORLD.minX;
    const gridStep = worldRangeX > 300 ? 50 : worldRangeX > 150 ? 25 : 10;
    ctx.strokeStyle = "rgba(30, 58, 80, 0.3)";
    ctx.lineWidth = 1;
    for (let x = Math.ceil(WORLD.minX / gridStep) * gridStep; x <= WORLD.maxX; x += gridStep) {
      const [sx] = toScreen(x, 0);
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, h);
      ctx.stroke();
    }
    for (let y = Math.ceil(WORLD.minY / gridStep) * gridStep; y <= WORLD.maxY; y += gridStep) {
      const [, sy] = toScreen(0, y);
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(w, sy);
      ctx.stroke();
    }

    // Grid labels
    ctx.fillStyle = "rgba(100, 120, 140, 0.4)";
    ctx.font = `${10 * dpr}px monospace`;
    const labelStep = gridStep * 2;
    for (let x = Math.ceil(WORLD.minX / labelStep) * labelStep; x <= WORLD.maxX; x += labelStep) {
      const [sx, sy] = toScreen(x, WORLD.minY + 5);
      ctx.fillText(`${x}m`, sx, sy);
    }

    // --- Search sectors (from scenario config) ---
    const sectors = snapshot.world?.searchSectors ?? [];
    for (const sector of sectors) {
      const [s1x, s1y] = toScreen(sector.bounds[0][0], sector.bounds[0][1]);
      const [s2x, s2y] = toScreen(sector.bounds[1][0], sector.bounds[1][1]);
      ctx.strokeStyle = "rgba(34, 197, 94, 0.35)";
      ctx.lineWidth = 2 * dpr;
      ctx.setLineDash([8 * dpr, 4 * dpr]);
      ctx.strokeRect(s1x, s1y, s2x - s1x, s2y - s1y);
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(34, 197, 94, 0.04)";
      ctx.fillRect(s1x, s1y, s2x - s1x, s2y - s1y);
      ctx.fillStyle = "rgba(34, 197, 94, 0.5)";
      ctx.font = `bold ${11 * dpr}px monospace`;
      ctx.fillText(sector.id.toUpperCase(), s1x + 8 * dpr, s1y + 14 * dpr);
    }

    // --- No-fly zones (from scenario config) ---
    const nfzs = snapshot.world?.noFlyZones ?? [];
    for (const nfz of nfzs) {
      const [nfx1, nfy1] = toScreen(nfz.bounds[0][0], nfz.bounds[0][1]);
      const [nfx2, nfy2] = toScreen(nfz.bounds[1][0], nfz.bounds[1][1]);
      ctx.fillStyle = "rgba(239, 68, 68, 0.08)";
      ctx.fillRect(nfx1, nfy1, nfx2 - nfx1, nfy2 - nfy1);
      ctx.strokeStyle = "rgba(239, 68, 68, 0.4)";
      ctx.lineWidth = 2 * dpr;
      ctx.setLineDash([4 * dpr, 4 * dpr]);
      ctx.strokeRect(nfx1, nfy1, nfx2 - nfx1, nfy2 - nfy1);
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(239, 68, 68, 0.5)";
      ctx.font = `${9 * dpr}px monospace`;
      ctx.fillText(nfz.id.toUpperCase(), nfx1 + 4 * dpr, nfy1 + 12 * dpr);
    }

    // --- Buildings (from scenario config) ---
    const buildings = snapshot.world?.buildings ?? [];
    for (const b of buildings) {
      const [bx, by] = toScreen(b.center[0] - b.size[0] / 2, b.center[1] - b.size[1] / 2);
      const [bx2, by2] = toScreen(b.center[0] + b.size[0] / 2, b.center[1] + b.size[1] / 2);
      ctx.fillStyle = "rgba(55, 65, 81, 0.6)";
      ctx.fillRect(bx, by, bx2 - bx, by2 - by);
      ctx.strokeStyle = "rgba(75, 85, 99, 0.5)";
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, bx2 - bx, by2 - by);
    }

    // --- Base station (from scenario config) ---
    const basePos = snapshot.world?.baseStation ?? [0, 0, 0];
    const [basex, basey] = toScreen(basePos[0], basePos[1]);
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
      const color = state ? (ROLE_COLORS[state.current_role] || "#666666") : "#444444";

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
      const color = ROLE_COLORS[state.current_role] || "#666666";
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

    // --- Emitter targets (red/orange pulsing crosshairs) ---
    if (snapshot.emitters) {
      for (const em of snapshot.emitters) {
        if (!em.active) continue;
        const [ex, ey] = toScreen(em.position[0], em.position[1]);
        const pulse = 1 + 0.3 * Math.sin(Date.now() * 0.005);
        const eSize = 12 * dpr * pulse;

        // Crosshair
        ctx.strokeStyle = "rgba(255, 100, 50, 0.9)";
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        ctx.moveTo(ex - eSize, ey); ctx.lineTo(ex + eSize, ey);
        ctx.moveTo(ex, ey - eSize); ctx.lineTo(ex, ey + eSize);
        ctx.stroke();

        // Circle
        ctx.beginPath();
        ctx.arc(ex, ey, eSize * 0.7, 0, Math.PI * 2);
        ctx.stroke();

        // Label
        ctx.fillStyle = "rgba(255, 100, 50, 0.8)";
        ctx.font = `bold ${9 * dpr}px monospace`;
        ctx.textAlign = "center";
        ctx.fillText("EMITTER", ex, ey - eSize - 4 * dpr);
        ctx.textAlign = "left";
      }
    }

    // --- Tracker-to-emitter pursuit lines ---
    if (snapshot.emitters && snapshot.emitters.length > 0) {
      for (const [id, state] of vehicles) {
        if (state.current_role !== "tracker") continue;
        const [sx, sy] = toScreen(state.position_ned[0], state.position_ned[1]);
        // Draw line to nearest emitter
        for (const em of snapshot.emitters) {
          if (!em.active) continue;
          const [ex, ey] = toScreen(em.position[0], em.position[1]);
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(ex, ey);
          ctx.strokeStyle = "rgba(245, 158, 11, 0.4)";
          ctx.lineWidth = 1.5 * dpr;
          ctx.setLineDash([6 * dpr, 4 * dpr]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }

    // --- Dead drone crash markers ---
    if (snapshot.deadDrones) {
      for (const dead of snapshot.deadDrones) {
        const [dx, dy] = toScreen(dead.lastPosition[0], dead.lastPosition[1]);
        const xs = 8 * dpr;

        // Red X
        ctx.strokeStyle = "rgba(239, 68, 68, 0.7)";
        ctx.lineWidth = 2.5 * dpr;
        ctx.beginPath();
        ctx.moveTo(dx - xs, dy - xs); ctx.lineTo(dx + xs, dy + xs);
        ctx.moveTo(dx + xs, dy - xs); ctx.lineTo(dx - xs, dy + xs);
        ctx.stroke();

        // Crash label
        ctx.fillStyle = "rgba(239, 68, 68, 0.6)";
        ctx.font = `${8 * dpr}px monospace`;
        ctx.textAlign = "center";
        ctx.fillText(`${VEHICLE_LABELS[dead.id] || dead.id} LOST`, dx, dy + xs + 10 * dpr);
        ctx.textAlign = "left";
      }
    }

    // --- Velocity direction arrows ---
    for (const [id, state] of vehicles) {
      const [sx, sy] = toScreen(state.position_ned[0], state.position_ned[1]);
      const vx = state.velocity_ned[0];
      const vy = state.velocity_ned[1];
      const speed = Math.sqrt(vx * vx + vy * vy);
      if (speed > 0.5) {
        const arrowLen = Math.min(30, speed * 2) * dpr;
        const angle = state.heading_rad;
        const ax = sx + Math.cos(angle) * arrowLen;
        const ay = sy + Math.sin(angle) * arrowLen;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ax, ay);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
        ctx.lineWidth = 1.5 * dpr;
        ctx.stroke();
        // Arrowhead
        const headLen = 5 * dpr;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax - headLen * Math.cos(angle - 0.5), ay - headLen * Math.sin(angle - 0.5));
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax - headLen * Math.cos(angle + 0.5), ay - headLen * Math.sin(angle + 0.5));
        ctx.stroke();
      }
    }

    // --- Jammer/GPS zone affected indicators on drones ---
    for (const [id, state] of vehicles) {
      const [sx, sy] = toScreen(state.position_ned[0], state.position_ned[1]);
      const size = selectedVehicle === id ? 14 * dpr : 10 * dpr;

      if (state.in_jammer_zone) {
        // Red warning ring
        ctx.beginPath();
        ctx.arc(sx, sy, size + 8 * dpr, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(239, 68, 68, 0.6)";
        ctx.lineWidth = 2 * dpr;
        ctx.setLineDash([3 * dpr, 3 * dpr]);
        ctx.stroke();
        ctx.setLineDash([]);
        // Small interference icon
        ctx.fillStyle = "rgba(239, 68, 68, 0.8)";
        ctx.font = `${7 * dpr}px monospace`;
        ctx.textAlign = "center";
        ctx.fillText("⚡", sx + size + 6 * dpr, sy - size);
        ctx.textAlign = "left";
      }

      if (state.in_gps_zone) {
        // Amber warning ring
        ctx.beginPath();
        ctx.arc(sx, sy, size + 6 * dpr, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(245, 158, 11, 0.5)";
        ctx.lineWidth = 1.5 * dpr;
        ctx.setLineDash([2 * dpr, 2 * dpr]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // --- Partition visualization (colored backgrounds) ---
    if (snapshot.network && snapshot.network.partition_count > 1) {
      const partColors = ["rgba(239,68,68,0.06)", "rgba(59,130,246,0.06)", "rgba(245,158,11,0.06)", "rgba(139,92,246,0.06)"];
      for (let pi = 0; pi < snapshot.network.partitions.length; pi++) {
        const partition = snapshot.network.partitions[pi];
        const positions: [number, number][] = [];
        for (const vid of partition) {
          const v = snapshot.vehicles.get(vid);
          if (v) positions.push(toScreen(v.position_ned[0], v.position_ned[1]));
        }
        if (positions.length < 2) continue;

        // Draw a filled convex region around the partition
        const cx = positions.reduce((s, p) => s + p[0], 0) / positions.length;
        const cy = positions.reduce((s, p) => s + p[1], 0) / positions.length;
        const padded = positions.map(p => [
          cx + (p[0] - cx) * 1.5,
          cy + (p[1] - cy) * 1.5,
        ]);

        // Sort by angle for convex hull
        padded.sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));

        ctx.beginPath();
        ctx.moveTo(padded[0][0], padded[0][1]);
        for (let i = 1; i < padded.length; i++) ctx.lineTo(padded[i][0], padded[i][1]);
        ctx.closePath();
        ctx.fillStyle = partColors[pi % partColors.length];
        ctx.fill();
        ctx.strokeStyle = partColors[pi % partColors.length].replace("0.06", "0.2");
        ctx.lineWidth = 1 * dpr;
        ctx.setLineDash([4 * dpr, 4 * dpr]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // --- Event flashes (role changes, kills, disruptions) ---
    const now = time;
    for (const ev of recentEvents) {
      const age = now - ev.time;
      if (age < 0 || age > 3) continue; // Only show events from last 3 seconds

      // Find the entity's position
      let evPos: [number, number] | null = null;
      if (ev.entity) {
        const v = snapshot.vehicles.get(ev.entity);
        if (v) evPos = toScreen(v.position_ned[0], v.position_ned[1]);
        // Also check dead drones
        if (!evPos && snapshot.deadDrones) {
          const dead = snapshot.deadDrones.find(d => d.id === ev.entity);
          if (dead) evPos = toScreen(dead.lastPosition[0], dead.lastPosition[1]);
        }
      }

      if (evPos) {
        const [fx, fy] = evPos;
        const fadeOut = Math.max(0, 1 - age / 3);

        if (ev.type === "role_change") {
          // Expanding cyan ring
          const ringRadius = (20 + age * 40) * dpr;
          ctx.beginPath();
          ctx.arc(fx, fy, ringRadius, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(6, 182, 212, ${fadeOut * 0.5})`;
          ctx.lineWidth = 2 * dpr;
          ctx.stroke();

          // Floating text showing role change
          const textY = fy - 25 * dpr - age * 15 * dpr;
          ctx.fillStyle = `rgba(6, 182, 212, ${fadeOut * 0.9})`;
          ctx.font = `bold ${10 * dpr}px monospace`;
          ctx.textAlign = "center";
          // Extract role names from detail
          ctx.fillText(ev.detail.split("(")[0].trim(), fx, textY);
          ctx.textAlign = "left";
        } else if (ev.type === "node_loss") {
          // Expanding red shockwave
          const ringRadius = (15 + age * 60) * dpr;
          ctx.beginPath();
          ctx.arc(fx, fy, ringRadius, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(239, 68, 68, ${fadeOut * 0.6})`;
          ctx.lineWidth = 3 * dpr;
          ctx.stroke();
        } else if (ev.type === "disruption") {
          // Yellow flash at placement point
          const ringRadius = (10 + age * 30) * dpr;
          ctx.beginPath();
          ctx.arc(fx, fy, ringRadius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(245, 158, 11, ${fadeOut * 0.15})`;
          ctx.fill();
        }
      }
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
