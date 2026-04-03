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
import { BEHAVIOR_MAP, FanOutSearch, PassiveTrack, DecoyEmit } from "./autonomy/behaviors";
import { allocateRoles, type VehicleCapabilities, type RoleChange } from "./autonomy/allocator";
import { ScoringEngine, type LiveScorecard } from "./scoring/metrics";
import { SeededRNG } from "./rng";
import { type WorldSnapshot, type VehicleStatePayload, type NetworkStatePayload } from "../lib/types";

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
  private searchBounds: [[number, number], [number, number]];
  private buildings: Building[];

  // Scoring
  private scoring: ScoringEngine;
  private lastRebalance = 0;
  private eventLog: SimEvent[] = [];
  private rng: SeededRNG;

  // Lifecycle
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<(snapshot: WorldSnapshot) => void>();
  private _running = false;
  private _speed = 1;

  constructor(config: ScenarioConfig = DEFAULT_CONFIG) {
    this.config = config;
    this.rng = new SeededRNG(config.random_seed);
    this.searchBounds = config.world_features.search_sectors[0]?.bounds ?? [[100, 30], [380, 270]];
    this.buildings = config.world_features.buildings.map(b => ({
      center: b.center, size: b.size,
    }));
    this.scoring = new ScoringEngine(this.searchBounds);

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
    this.roles.clear();
    this.behaviors.clear();
    this.jammers.clear();
    this.gpsZones.clear();
    this.lastRebalance = 0;
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

    // 5. Build threat context for behaviors
    const threats = {
      jammers: [...this.jammers.values()].filter(j => j.active).map(j => ({ center: j.center, radius_m: j.radius_m })),
      gpsZones: [...this.gpsZones.values()].filter(g => g.active).map(g => ({ center: g.center, radius_m: g.radius_m })),
    };

    // 6. Tick behaviors + move vehicles
    for (const [id, v] of this.vehicles) {
      if (!v.alive) continue;

      const behavior = this.behaviors.get(id);
      if (!behavior) continue;

      // Get target from behavior — pass threats for avoidance
      let result;
      if (behavior instanceof FanOutSearch) {
        result = behavior.tickWithTime(this.time, v, threats);
      } else if (behavior instanceof PassiveTrack) {
        for (const em of this.emitters.values()) {
          if (em.active) (behavior as PassiveTrack).updateTarget(em.position);
        }
        result = behavior.tickWithTime(this.time, v);
      } else if (behavior instanceof DecoyEmit) {
        result = behavior.tickWithTime(this.time);
      } else {
        result = behavior.tick(v, this.vehicles, this.network, threats);
      }

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

      // Battery drain: ~30% over 300s mission = 0.1% per second = 0.01% per tick
      const drainRate = v.role === "scout" ? 0.012 : v.role === "relay" ? 0.008 : 0.006;
      v.battery_pct = Math.max(0, v.battery_pct - drainRate);
      if (v.battery_pct < 5 && !this._batteryWarned.has(id)) {
        this._batteryWarned.add(id);
        this._emit("battery", id, `${id} battery critical (${v.battery_pct.toFixed(0)}%)`);
      }

      // Scoring: mark coverage for scouts
      if (v.role === "scout") {
        this.scoring.markCoverage(v.position[0], v.position[1]);
      }
      if (v.role === "tracker") {
        this.scoring.tickTracking();
      }
    }

    // 6. Notify listeners
    this._notify();
  }

  private _allocate(trigger: string): void {
    const { roles, changes } = allocateRoles(
      this.vehicles, this.capabilities, this.network, this.roles, trigger,
    );

    for (const change of changes) {
      const v = this.vehicles.get(change.vehicleId);
      if (!v) continue;
      v.role = change.newRole;
      this.roles.set(change.vehicleId, change.newRole);

      // Swap behavior
      const oldBehavior = this.behaviors.get(change.vehicleId);
      if (oldBehavior) oldBehavior.onExit();

      const BehaviorCls = BEHAVIOR_MAP[change.newRole];
      if (BehaviorCls) {
        const newBehavior = new BehaviorCls(change.vehicleId);
        newBehavior.onEnter(v);
        if (newBehavior instanceof FanOutSearch) newBehavior.setSearchBounds(this.searchBounds);
        this.behaviors.set(change.vehicleId, newBehavior);
      }

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
      vehicleMap.set(id, {
        position_ned: [...v.position],
        velocity_ned: [...v.velocity],
        heading_rad: v.heading,
        current_role: v.role,
        battery_pct: v.battery_pct,
        battery_wh_remaining: v.battery_pct / 100 * (this.config.fleet.find(f => f.id === id)?.battery_wh ?? 180),
        armed: true,
        flight_mode: "offboard",
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

    return {
      time: this.time,
      vehicles: vehicleMap,
      network: networkPayload,
      activeDisruptions,
      metrics,
    };
  }
}
