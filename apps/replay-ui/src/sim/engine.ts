/**
 * SimEngine — the core simulation loop.
 * Ticks at 10Hz, orchestrates DDIL model, role allocator, behavior engine.
 * All state changes are driven by real autonomy logic, not scripts.
 */

import { type ScenarioConfig, type VehicleConfig, DEFAULT_CONFIG } from "./config";
import { type Vec3, vec3Dist } from "./ddil/link-model";
import { type Building, type JammerDef } from "./ddil/link-model";
import { computeNetwork, type NetworkResult, type VehiclePos } from "./ddil/network-graph";
import { type JammerZone } from "./ddil/jammer-model";
import { type GPSZone, gpsDegradationAt } from "./ddil/gps-model";
import { type VehicleState, type Behavior } from "./autonomy/behavior";
import { BEHAVIOR_MAP, FanOutSearch, PassiveTrack, DecoyEmit, HoldRelay, ConserveEnergy, ReturnAnchor } from "./autonomy/behaviors";
import { FieldGuidedBehavior } from "./autonomy/behaviors/field-guided";
import { CostField, type CostFieldConfig } from "./autonomy/cost-field";
import { type ObjectiveContext, OBJECTIVE_MAP } from "./autonomy/objectives";
import { allocateRoles, type VehicleCapabilities, type RoleChange } from "./autonomy/allocator";
import { ScoringEngine, type LiveScorecard } from "./scoring/metrics";
import { SeededRNG } from "./rng";
import { type SimContext, buildContext } from "./context";
import { type WorldSnapshot, type VehicleStatePayload, type NetworkStatePayload, type EmitterPayload, type DeadDronePayload, type WorldGeometry } from "../lib/types";

const DT = 0.1; // 100ms per tick
const REBALANCE_INTERVAL = 30; // seconds

export interface SimEvent {
  time: number;
  type: string;
  entity?: string;
  detail: string;
}

interface EmitterState {
  id: string;
  position: Vec3;
  velocity: Vec3;
  active: boolean;
}

interface PendingCommand {
  type: string;
  data: Record<string, unknown>;
}

export class SimEngine {
  readonly config: ScenarioConfig;

  // State
  private time = 0;
  private vehicles = new Map<string, VehicleState>();
  private roles = new Map<string, string>();
  private behaviors = new Map<string, Behavior>();
  private capabilities = new Map<string, VehicleCapabilities>();
  private jammers = new Map<string, JammerZone>();
  private gpsZones = new Map<string, GPSZone>();
  private emitters = new Map<string, EmitterState>();
  private network: NetworkResult | null = null;
  private _batteryWarned = new Set<string>();
  private _deadDrones = new Map<string, DeadDronePayload>();
  private searchBounds: [[number, number], [number, number]];
  private buildings: Building[];
  private ctx: SimContext;

  // World geometry (computed once, static for the scenario)
  private _worldGeo: WorldGeometry;

  // Scoring
  private scoring: ScoringEngine;
  private lastRebalance = 0;
  private eventLog: SimEvent[] = [];
  private rng: SeededRNG;

  // Scheduled threats (auto-deploy at specific times)
  private _scheduledThreats: Array<{
    time: number;
    type: "jammer" | "gps" | "emitter" | "kill";
    position: Vec3;
    radius?: number;
    target?: string;
    label: string;
    fired: boolean;
  }> = [];

  // Lifecycle
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<(snapshot: WorldSnapshot) => void>();
  private _running = false;
  private _speed = 1;

  constructor(config: ScenarioConfig = DEFAULT_CONFIG) {
    this.config = config;
    this.ctx = buildContext(config);
    this.rng = new SeededRNG(config.random_seed);
    this.searchBounds = this.ctx.searchBounds;
    this.buildings = config.world_features.buildings.map(b => ({
      center: b.center, size: b.size,
    }));
    this.scoring = new ScoringEngine(this.searchBounds, this.ctx.fleetSize);

    // Compute static world geometry with auto-fit view bounds
    const wf = config.world_features;
    let vMinX = Infinity, vMaxX = -Infinity, vMinY = Infinity, vMaxY = -Infinity;
    const expand = (x: number, y: number) => {
      vMinX = Math.min(vMinX, x); vMaxX = Math.max(vMaxX, x);
      vMinY = Math.min(vMinY, y); vMaxY = Math.max(vMaxY, y);
    };
    // Include search sectors
    for (const s of wf.search_sectors) {
      expand(s.bounds[0][0], s.bounds[0][1]);
      expand(s.bounds[1][0], s.bounds[1][1]);
    }
    // Include buildings
    for (const b of wf.buildings) {
      expand(b.center[0] - b.size[0] / 2, b.center[1] - b.size[1] / 2);
      expand(b.center[0] + b.size[0] / 2, b.center[1] + b.size[1] / 2);
    }
    // Include NFZs
    for (const n of wf.no_fly_zones) {
      expand(n.bounds[0][0], n.bounds[0][1]);
      expand(n.bounds[1][0], n.bounds[1][1]);
    }
    // Include base station
    expand(wf.base_station.position[0], wf.base_station.position[1]);
    // Include fleet spawn positions
    for (const f of config.fleet) {
      expand(f.spawn_pose[0], f.spawn_pose[1]);
    }
    // Add margin (15% on each side)
    const rangeX = vMaxX - vMinX || 100;
    const rangeY = vMaxY - vMinY || 100;
    const margin = Math.max(rangeX, rangeY) * 0.15;
    vMinX -= margin; vMaxX += margin;
    vMinY -= margin; vMaxY += margin;

    this._worldGeo = {
      searchSectors: wf.search_sectors.map(s => ({ id: s.id, bounds: s.bounds })),
      noFlyZones: wf.no_fly_zones.map(n => ({ id: n.id, bounds: n.bounds })),
      buildings: wf.buildings.map(b => ({ id: b.id, center: b.center, size: b.size })),
      baseStation: wf.base_station.position,
      viewBounds: { minX: vMinX, maxX: vMaxX, minY: vMinY, maxY: vMaxY },
    };

    // Initialize vehicles
    for (const vc of config.fleet) {
      const state: VehicleState = {
        id: vc.id,
        position: [...vc.spawn_pose] as Vec3,
        velocity: [0, 0, 0],
        heading: 0,
        role: "",
        battery_pct: 100,
        max_speed: vc.max_speed_ms,
        comms_range: vc.comms_range_m,
        payloads: vc.payloads,
        alive: true,
      };
      this.vehicles.set(vc.id, state);
      this.capabilities.set(vc.id, {
        payloads: vc.payloads,
        roles_eligible: vc.roles_eligible,
        comms_range: vc.comms_range_m,
      });
    }

    // Initialize emitters (inactive until appears_at)
    for (const em of config.world_features.mobile_emitters) {
      this.emitters.set(em.id, {
        id: em.id,
        position: [...em.start_position] as Vec3,
        velocity: [...em.velocity] as Vec3,
        active: false,
      });
    }
  }

  /** Load scheduled threats from a scenario preset. */
  loadScheduledThreats(threats: Array<{ time: number; type: "jammer" | "gps" | "emitter" | "kill"; position: Vec3; radius?: number; target?: string; label: string }>): void {
    this._scheduledThreats = threats.map(t => ({ ...t, fired: false }));
  }

  // ── Lifecycle ───────────────────────────────────────────────────

  start(): void {
    if (this._running) return;
    this._running = true;
    // Initial role allocation
    this._allocate("initial_assignment");
    this._startLoop();
  }

  pause(): void {
    this._running = false;
    if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null; }
  }

  resume(): void {
    if (this._running) return;
    this._running = true;
    this._startLoop();
  }

  reset(): void {
    this.pause();
    this.time = 0;
    this.eventLog = [];
    this._deadDrones.clear();
    this.roles.clear();
    this.behaviors.clear();
    this.jammers.clear();
    this.gpsZones.clear();
    this.lastRebalance = 0;
    for (const st of this._scheduledThreats) st.fired = false;
    this.scoring = new ScoringEngine(this.searchBounds);

    for (const vc of this.config.fleet) {
      const v = this.vehicles.get(vc.id)!;
      v.position = [...vc.spawn_pose] as Vec3;
      v.velocity = [0, 0, 0];
      v.battery_pct = 100;
      v.role = "";
      v.alive = true;
    }
    this._batteryWarned.clear();
    for (const em of this.config.world_features.mobile_emitters) {
      this.emitters.set(em.id, {
        id: em.id, position: [...em.start_position] as Vec3,
        velocity: [...em.velocity] as Vec3, active: false,
      });
    }
    this._notify();
  }

  step(): void { this._tick(); }

  dispose(): void {
    this.pause();
    this.listeners.clear();
  }

  setSpeed(s: number): void { this._speed = Math.max(0.5, Math.min(20, s)); }
  get speed(): number { return this._speed; }
  get running(): boolean { return this._running; }
  get elapsed(): number { return this.time; }
  get events(): SimEvent[] { return this.eventLog; }

  private _startLoop(): void {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = setInterval(() => {
      const ticksPerFrame = Math.max(1, Math.round(this._speed));
      for (let i = 0; i < ticksPerFrame; i++) {
        this._tick();
        if (this.time >= this.config.duration_sec) {
          this.pause();
          break;
        }
      }
    }, 100);
  }

  // ── User interactions ───────────────────────────────────────────

  private pendingCommands: PendingCommand[] = [];

  injectJammer(center: Vec3, radius = 150, strength = -60): void {
    const id = `jammer_${this.jammers.size + 1}`;
    this.jammers.set(id, { id, center, radius_m: radius, strength_dbm: strength, active: true });
    this._emit("disruption", undefined, `Jammer placed at [${center[0].toFixed(0)}, ${center[1].toFixed(0)}] r=${radius}m`);
    // Force reallocation check
    this._allocate("jammer_deployed");
  }

  injectGPSZone(center: Vec3, radius = 100, accuracy = 50): void {
    const id = `gps_${this.gpsZones.size + 1}`;
    this.gpsZones.set(id, { id, center, radius_m: radius, accuracy_m: accuracy, active: true });
    this._emit("disruption", undefined, `GPS degradation at [${center[0].toFixed(0)}, ${center[1].toFixed(0)}] r=${radius}m`);
  }

  killDrone(vehicleId: string): void {
    const v = this.vehicles.get(vehicleId);
    if (!v || !v.alive) return;
    // Store crash location before killing
    this._deadDrones.set(vehicleId, {
      id: vehicleId,
      lastPosition: [...v.position] as [number, number, number],
      killedAt: this.time,
      lastRole: v.role,
    });
    v.alive = false;
    this.behaviors.delete(vehicleId);
    this.roles.delete(vehicleId);
    this.scoring.onNodeLoss(this.time);
    this._emit("node_loss", vehicleId, `${vehicleId} power failure — vehicle lost`);
    this._allocate("node_loss");
  }

  spawnEmitter(position: Vec3, velocity: Vec3 = [0.3, -0.15, 0]): void {
    const id = `emitter_${this.emitters.size + 1}`;
    this.emitters.set(id, { id, position: [...position] as Vec3, velocity, active: true });
    this._emit("spawn", undefined, `Adversary emitter at [${position[0].toFixed(0)}, ${position[1].toFixed(0)}]`);
  }

  setSearchRegion(bounds: [[number, number], [number, number]]): void {
    this.searchBounds = bounds;
    this.scoring = new ScoringEngine(bounds);
    // Update scout behaviors with new bounds
    for (const [id, b] of this.behaviors) {
      if (b instanceof FanOutSearch) b.setSearchBounds(bounds);
    }
    this._emit("config", undefined, `Search region set: [${bounds[0].join(",")}] to [${bounds[1].join(",")}]`);
  }

  removeDisruption(id: string): void {
    this.jammers.delete(id);
    this.gpsZones.delete(id);
  }

  // ── Observer pattern ────────────────────────────────────────────

  subscribe(listener: (snapshot: WorldSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): WorldSnapshot {
    return this._buildSnapshot();
  }

  getScorecard(): LiveScorecard {
    return this.scoring.getScorecard(this.time);
  }

  // ── Core tick ───────────────────────────────────────────────────

  private _tick(): void {
    this.time += DT;

    // 0. Fire scheduled threats
    for (const st of this._scheduledThreats) {
      if (!st.fired && this.time >= st.time) {
        st.fired = true;
        switch (st.type) {
          case "jammer":
            this.injectJammer(st.position, st.radius ?? 150, -60);
            break;
          case "gps":
            this.injectGPSZone(st.position, st.radius ?? 100, 50);
            break;
          case "emitter":
            this.spawnEmitter(st.position);
            break;
          case "kill":
            if (st.target) this.killDrone(st.target);
            break;
        }
        this._emit("scenario", undefined, `[T+${this.time.toFixed(0)}s] ${st.label}`);
      }
    }

    // 1. Update emitters
    for (const em of this.emitters.values()) {
      if (!em.active && this.time >= (this.config.world_features.mobile_emitters.find(e => e.id === em.id)?.appears_at ?? 9999)) {
        em.active = true;
      }
      if (em.active) {
        em.position = [
          em.position[0] + em.velocity[0] * DT,
          em.position[1] + em.velocity[1] * DT,
          em.position[2] + em.velocity[2] * DT,
        ];
      }
    }

    // 2. Compute network
    const vehiclePoses: VehiclePos[] = [];
    for (const v of this.vehicles.values()) {
      if (!v.alive) continue;
      vehiclePoses.push({ id: v.id, position: v.position, comms_range: v.comms_range });
    }
    const jammerDefs: JammerDef[] = [...this.jammers.values()]
      .filter(j => j.active)
      .map(j => ({ center: j.center, radius_m: j.radius_m, active: true }));

    const prevPartitions = this.network?.partition_count ?? 1;
    this.network = computeNetwork(vehiclePoses, this.buildings, jammerDefs);

    // 3. Check reallocation triggers
    if (this.network.partition_count > prevPartitions) {
      this._allocate("partition_detected");
    }
    if (this.time - this.lastRebalance >= REBALANCE_INTERVAL) {
      this.lastRebalance = this.time;
      this._allocate("utility_rebalance");
    }

    // 4. Update scoring - network
    this.scoring.updateNetwork(this.network.partition_count, this.time);

    // 5. Build CostField from current environment
    const costFieldState = {
      jammers: [...this.jammers.values()].filter(j => j.active),
      gpsZones: [...this.gpsZones.values()].filter(g => g.active),
      buildings: this.buildings,
      nfzs: this.config.world_features.no_fly_zones.map(n => ({ bounds: n.bounds })),
      fleetPositions: vehiclePoses.map(v => v.position),
      operationalBounds: this.searchBounds,
    };
    const costField = new CostField(costFieldState, {
      jammerWeight: this.ctx.costWeights.jammer,
      gpsWeight: this.ctx.costWeights.gps,
      isolationWeight: this.ctx.costWeights.isolation,
      boundsWeight: this.ctx.costWeights.bounds,
      maxCommsRange: 800,
    });

    // Build ObjectiveContext for role-specific scoring
    const emitterPositions: [number, number, number][] = [];
    for (const em of this.emitters.values()) {
      if (em.active) emitterPositions.push([...em.position] as [number, number, number]);
    }
    const fleetPosMap = new Map<string, [number, number, number]>();
    const commsRanges = new Map<string, number>();
    for (const [id, v] of this.vehicles) {
      if (v.alive) {
        fleetPosMap.set(id, [...v.position] as [number, number, number]);
        commsRanges.set(id, v.comms_range);
      }
    }

    // 6. Tick behaviors + move vehicles
    for (const [id, v] of this.vehicles) {
      if (!v.alive) continue;

      const behavior = this.behaviors.get(id);
      if (!behavior) continue;

      // Inject cost field and objective context into FieldGuidedBehavior
      if (behavior instanceof FieldGuidedBehavior) {
        behavior.costField = costField;
        behavior.objectiveContext = {
          fleetPositions: fleetPosMap,
          searchBounds: this.searchBounds,
          visitedCells: this.scoring.getVisitedCells(),
          cellSize: 10,
          emitters: emitterPositions,
          baseStation: this.ctx.baseStation,
          selfId: id,
          selfPosition: [...v.position] as [number, number, number],
          commsRanges,
          threatZones: [
            ...[...this.jammers.values()].filter(j => j.active).map(j => ({ center: j.center, radius: j.radius_m })),
            ...[...this.gpsZones.values()].filter(g => g.active).map(g => ({ center: g.center, radius: g.radius_m })),
          ],
        };
      }

      // Unified tick — no instanceof branching
      const result = behavior.tick(v, this.vehicles, this.network);

      // Move toward target, capped by max_speed
      const dx = result.target[0] - v.position[0];
      const dy = result.target[1] - v.position[1];
      const dz = result.target[2] - v.position[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const maxMove = v.max_speed * DT;

      if (dist > 0.1) {
        const scale = Math.min(1, maxMove / dist);
        v.position = [
          v.position[0] + dx * scale,
          v.position[1] + dy * scale,
          v.position[2] + dz * scale,
        ];
        v.heading = Math.atan2(dy, dx);
      }

      // GPS noise if in degradation zone
      for (const gz of this.gpsZones.values()) {
        const acc = gpsDegradationAt(gz, v.position);
        if (acc > 2) {
          v.position[0] += this.rng.gauss(0, acc * 0.01);
          v.position[1] += this.rng.gauss(0, acc * 0.01);
        }
      }

      // Battery drain from config
      const drainRate = this.ctx.drainRates[v.role] ?? 0.006;
      v.battery_pct = Math.max(0, v.battery_pct - drainRate);

      // Auto RTH at low battery
      if (v.battery_pct < this.ctx.rthBatteryThreshold && v.role !== "return_anchor" && !this._batteryWarned.has(id)) {
        this._batteryWarned.add(id);
        this._emit("battery", id, `${id} battery low (${v.battery_pct.toFixed(0)}%) — returning to base`);
        // Force role change to return_anchor
        v.role = "return_anchor";
        this.roles.set(id, "return_anchor");
        const oldBehavior = this.behaviors.get(id);
        if (oldBehavior) oldBehavior.onExit();
        const rth = new FieldGuidedBehavior(id, "return_anchor");
        rth.configure(this.ctx);
        rth.onEnter(v);
        this.behaviors.set(id, rth);
      }

      // Scoring: mark coverage for scouts
      if (v.role === "scout") {
        this.scoring.markCoverage(v.position[0], v.position[1], this.time);
      }
      if (v.role === "tracker") {
        this.scoring.tickTracking();
      }
    }

    // 6. Notify listeners
    this._notify();
  }

  private _allocate(trigger: string): void {
    const activeEmitters = [...this.emitters.values()].filter(e => e.active).length;
    const { roles, changes } = allocateRoles(
      this.vehicles, this.capabilities, this.network, this.roles, trigger, activeEmitters,
    );

    for (const change of changes) {
      const v = this.vehicles.get(change.vehicleId);
      if (!v) continue;
      v.role = change.newRole;
      this.roles.set(change.vehicleId, change.newRole);

      // Swap behavior — always use FieldGuidedBehavior with role-specific objective
      const oldBehavior = this.behaviors.get(change.vehicleId);
      if (oldBehavior) oldBehavior.onExit();

      const newBehavior = new FieldGuidedBehavior(change.vehicleId, change.newRole);
      newBehavior.configure(this.ctx);
      newBehavior.onEnter(v);
      this.behaviors.set(change.vehicleId, newBehavior);

      this._emit("role_change", change.vehicleId,
        `${change.vehicleId}: ${change.oldRole || "none"} → ${change.newRole} (${trigger})`);
    }

    // Check node loss recovery
    if (trigger === "node_loss" && changes.length > 0) {
      this.scoring.onNodeLossRecovery(this.time);
    }

    this.lastRebalance = this.time;
  }

  private _emit(type: string, entity: string | undefined, detail: string): void {
    this.eventLog.push({ time: this.time, type, entity, detail });
  }

  private _notify(): void {
    const snapshot = this._buildSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }

  private _buildSnapshot(): WorldSnapshot {
    const vehicleMap = new Map<string, VehicleStatePayload>();
    for (const [id, v] of this.vehicles) {
      if (!v.alive) continue;

      // Check if drone is in any jammer or GPS zone
      let inJammer = false;
      let inGps = false;
      for (const j of this.jammers.values()) {
        if (j.active) {
          const d = Math.sqrt((v.position[0] - j.center[0]) ** 2 + (v.position[1] - j.center[1]) ** 2);
          if (d < j.radius_m) inJammer = true;
        }
      }
      for (const g of this.gpsZones.values()) {
        if (g.active) {
          const d = Math.sqrt((v.position[0] - g.center[0]) ** 2 + (v.position[1] - g.center[1]) ** 2);
          if (d < g.radius_m) inGps = true;
        }
      }

      vehicleMap.set(id, {
        position_ned: [...v.position],
        velocity_ned: [...v.velocity],
        heading_rad: v.heading,
        current_role: v.role,
        battery_pct: v.battery_pct,
        battery_wh_remaining: v.battery_pct / 100 * (this.config.fleet.find(f => f.id === id)?.battery_wh ?? 180),
        armed: true,
        flight_mode: "offboard",
        in_jammer_zone: inJammer,
        in_gps_zone: inGps,
      });
    }

    const networkPayload: NetworkStatePayload | null = this.network ? {
      edges: this.network.edges.map(e => ({
        src: e.src, dst: e.dst, quality: e.quality,
        latency_ms: e.latency_ms, active: e.active,
      })),
      partitions: this.network.partitions,
      partition_count: this.network.partition_count,
    } : null;

    const activeDisruptions = [
      ...[...this.jammers.values()].filter(j => j.active).map(j => ({
        disruption_type: "jammer_on" as const,
        disruption_id: j.id,
        region: "",
        center: j.center as [number, number, number],
        radius_m: j.radius_m,
        strength_dbm: j.strength_dbm,
        target: "",
        affected_entities: [] as string[],
        scheduled_end_t: 0,
      })),
      ...[...this.gpsZones.values()].filter(g => g.active).map(g => ({
        disruption_type: "gps_degrade" as const,
        disruption_id: g.id,
        region: "",
        center: g.center as [number, number, number],
        radius_m: g.radius_m,
        strength_dbm: 0,
        target: "",
        affected_entities: [] as string[],
        scheduled_end_t: 0,
      })),
    ];

    const sc = this.scoring.getScorecard(this.time);
    const metrics = new Map<string, number>();
    metrics.set("search_coverage_pct", sc.search_coverage_pct);
    metrics.set("relay_uptime_pct", sc.relay_uptime_pct);
    metrics.set("active_vehicles", sc.active_vehicles);

    // Emitter positions
    const emitterPayloads: EmitterPayload[] = [...this.emitters.values()]
      .filter(e => e.active)
      .map(e => ({
        id: e.id, position: [...e.position] as [number, number, number],
        velocity: [...e.velocity] as [number, number, number], active: true,
      }));

    return {
      time: this.time,
      vehicles: vehicleMap,
      network: networkPayload,
      activeDisruptions,
      metrics,
      emitters: emitterPayloads,
      deadDrones: [...this._deadDrones.values()],
      world: this._worldGeo,
      coverageMap: this.scoring.getCoverageMap(),
      coverageCellSize: this.scoring.cellSize,
    };
  }
}
