"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls, Html, Line, Grid } from "@react-three/drei";
import { WorldSnapshot, VehicleStatePayload, ROLE_COLORS, VEHICLE_LABELS, ScenarioEventPayload } from "@/lib/types";
import { useMemo, useRef } from "react";
import * as THREE from "three";

interface Props {
  snapshot: WorldSnapshot;
  selectedVehicle: string | null;
  onSelectVehicle: (id: string | null) => void;
}

function Drone({ id, state, selected, onClick }: {
  id: string;
  state: VehicleStatePayload;
  selected: boolean;
  onClick: () => void;
}) {
  const color = ROLE_COLORS[state.current_role] || "#888";
  const label = VEHICLE_LABELS[id] || id;
  // Convert NED to Three.js (ENU-ish: x=East=y_ned, y=Up=-z_ned, z=North=-x_ned)
  // Simplified: just use x=x_ned, z=y_ned, y=-z_ned (up)
  const pos: [number, number, number] = [
    state.position_ned[0] / 10, // Scale down for scene
    -state.position_ned[2] / 10,
    state.position_ned[1] / 10,
  ];

  return (
    <group position={pos} onClick={(e) => { e.stopPropagation(); onClick(); }}>
      {/* Drone body */}
      <mesh>
        <octahedronGeometry args={[selected ? 0.6 : 0.4, 0]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={selected ? 0.5 : 0.2} />
      </mesh>
      {/* Selection ring */}
      {selected && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.7, 0.85, 32]} />
          <meshBasicMaterial color="white" side={THREE.DoubleSide} />
        </mesh>
      )}
      {/* Label */}
      <Html position={[0, 1.2, 0]} center distanceFactor={30}>
        <div className="text-xs font-bold px-1.5 py-0.5 rounded whitespace-nowrap pointer-events-none"
             style={{ backgroundColor: color, color: "white", opacity: 0.9 }}>
          {label} {state.current_role}
        </div>
      </Html>
      {/* Battery indicator */}
      <Html position={[0, 0.8, 0]} center distanceFactor={30}>
        <div className="text-[10px] text-gray-300 pointer-events-none">
          {state.battery_pct.toFixed(0)}%
        </div>
      </Html>
    </group>
  );
}

function JammerZone({ disruption }: { disruption: ScenarioEventPayload }) {
  if (disruption.disruption_type !== "jammer_on") return null;
  const pos: [number, number, number] = [
    disruption.center[0] / 10,
    1,
    disruption.center[1] / 10,
  ];
  const radius = disruption.radius_m / 10;

  return (
    <group position={pos}>
      <mesh>
        <cylinderGeometry args={[radius, radius, 2, 32]} />
        <meshStandardMaterial color="#ef4444" transparent opacity={0.15} />
      </mesh>
      <Html position={[0, 2, 0]} center distanceFactor={40}>
        <div className="text-xs text-red-400 font-bold pointer-events-none">JAMMER</div>
      </Html>
    </group>
  );
}

function GPSZone({ disruption }: { disruption: ScenarioEventPayload }) {
  if (disruption.disruption_type !== "gps_degrade") return null;
  const pos: [number, number, number] = [
    disruption.center[0] / 10,
    0.5,
    disruption.center[1] / 10,
  ];
  const radius = disruption.radius_m / 10;

  return (
    <group position={pos}>
      <mesh>
        <cylinderGeometry args={[radius, radius, 1, 32]} />
        <meshStandardMaterial color="#f59e0b" transparent opacity={0.1} />
      </mesh>
      <Html position={[0, 1.5, 0]} center distanceFactor={40}>
        <div className="text-xs text-amber-400 font-bold pointer-events-none">GPS DEG</div>
      </Html>
    </group>
  );
}

function SearchSector() {
  // sector_red: [[100, 0], [400, 300]] scaled by /10
  const points: [number, number, number][] = [
    [10, 0.1, 0], [40, 0.1, 0], [40, 0.1, 30], [10, 0.1, 30], [10, 0.1, 0],
  ];
  return (
    <Line points={points} color="#22c55e" lineWidth={2} opacity={0.5} transparent />
  );
}

function BaseStation() {
  return (
    <group position={[0, 0, 0]}>
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.3, 0.3, 0.6, 8]} />
        <meshStandardMaterial color="#22c55e" />
      </mesh>
      <Html position={[0, 1, 0]} center distanceFactor={30}>
        <div className="text-xs text-green-400 font-bold pointer-events-none">BASE</div>
      </Html>
    </group>
  );
}

function Buildings() {
  const buildings = [
    { pos: [15, 0.75, 10] as [number, number, number], size: [3, 1.5, 2] as [number, number, number] },
    { pos: [25, 1, 20] as [number, number, number], size: [4, 2, 1.5] as [number, number, number] },
    { pos: [35, 0.5, 5] as [number, number, number], size: [2, 1, 3] as [number, number, number] },
  ];
  return (
    <>
      {buildings.map((b, i) => (
        <mesh key={i} position={b.pos}>
          <boxGeometry args={b.size} />
          <meshStandardMaterial color="#4b5563" />
        </mesh>
      ))}
    </>
  );
}

export function MissionScene({ snapshot, selectedVehicle, onSelectVehicle }: Props) {
  return (
    <Canvas camera={{ position: [20, 25, 20], fov: 50 }} style={{ background: "#0a0a0a" }}>
      <ambientLight intensity={0.4} />
      <directionalLight position={[30, 50, 20]} intensity={0.8} />

      <Grid
        args={[60, 60]}
        position={[20, 0, 15]}
        cellSize={5}
        cellThickness={0.5}
        cellColor="#1f2937"
        sectionSize={10}
        sectionThickness={1}
        sectionColor="#374151"
        fadeDistance={100}
        infiniteGrid
      />

      <BaseStation />
      <Buildings />
      <SearchSector />

      {snapshot.activeDisruptions.map((d, i) => (
        <JammerZone key={`j-${i}`} disruption={d} />
      ))}
      {snapshot.activeDisruptions.map((d, i) => (
        <GPSZone key={`g-${i}`} disruption={d} />
      ))}

      {Array.from(snapshot.vehicles.entries()).map(([id, state]) => (
        <Drone
          key={id}
          id={id}
          state={state}
          selected={selectedVehicle === id}
          onClick={() => onSelectVehicle(selectedVehicle === id ? null : id)}
        />
      ))}

      <OrbitControls
        enableDamping
        dampingFactor={0.1}
        maxPolarAngle={Math.PI / 2.2}
        target={[20, 0, 15]}
      />
    </Canvas>
  );
}
