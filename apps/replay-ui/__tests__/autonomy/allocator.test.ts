import { describe, it, expect } from "vitest";
import { computeUtility, allocateRoles, type VehicleCapabilities } from "@/sim/autonomy/allocator";
import type { VehicleState } from "@/sim/autonomy/behavior";

function makeVehicle(id: string, overrides: Partial<VehicleState> = {}): VehicleState {
  return {
    id, position: [100, 100, -30], velocity: [0, 0, 0], heading: 0,
    role: "", battery_pct: 90, max_speed: 15, comms_range: 800,
    payloads: ["rgb_camera"], alive: true, ...overrides,
  };
}

function makeCaps(overrides: Partial<VehicleCapabilities> = {}): VehicleCapabilities {
  return { payloads: ["rgb_camera"], roles_eligible: ["scout", "tracker", "reserve"], comms_range: 800, ...overrides };
}

describe("computeUtility", () => {
  it("returns positive number for valid inputs", () => {
    const u = computeUtility(makeVehicle("v1"), "scout", makeCaps());
    expect(u).toBeGreaterThan(0);
  });
  it("relay gets higher utility with comms_relay payload", () => {
    const withRelay = computeUtility(makeVehicle("v1"), "relay", makeCaps({ payloads: ["comms_relay"] }));
    const without = computeUtility(makeVehicle("v1"), "relay", makeCaps({ payloads: ["rgb_camera"] }));
    expect(withRelay).toBeGreaterThan(without);
  });
  it("scout utility increases with distance from origin", () => {
    const close = computeUtility(makeVehicle("v1", { position: [10, 10, -30] }), "scout", makeCaps());
    const far = computeUtility(makeVehicle("v1", { position: [200, 200, -30] }), "scout", makeCaps());
    expect(far).toBeGreaterThan(close);
  });
  it("low battery reduces utility", () => {
    const full = computeUtility(makeVehicle("v1", { battery_pct: 100 }), "scout", makeCaps());
    const low = computeUtility(makeVehicle("v1", { battery_pct: 20 }), "scout", makeCaps());
    expect(full).toBeGreaterThan(low);
  });
});

describe("allocateRoles", () => {
  it("assigns roles to all vehicles", () => {
    const vehicles = new Map([
      ["a1", makeVehicle("a1")],
      ["a2", makeVehicle("a2")],
      ["c1", makeVehicle("c1", { payloads: ["comms_relay"] })],
    ]);
    const caps = new Map([
      ["a1", makeCaps()],
      ["a2", makeCaps()],
      ["c1", makeCaps({ payloads: ["comms_relay"], roles_eligible: ["relay", "scout", "reserve"] })],
    ]);
    const { roles } = allocateRoles(vehicles, caps, null, new Map(), "initial");
    expect(roles.size).toBe(3);
    for (const role of roles.values()) {
      expect(role).toBeTruthy();
    }
  });
  it("limits tracker to 1-2", () => {
    const vehicles = new Map<string, VehicleState>();
    const caps = new Map<string, VehicleCapabilities>();
    for (let i = 0; i < 6; i++) {
      const id = `v${i}`;
      vehicles.set(id, makeVehicle(id));
      caps.set(id, makeCaps({ roles_eligible: ["scout", "tracker", "reserve"] }));
    }
    const { roles } = allocateRoles(vehicles, caps, null, new Map(), "initial");
    const trackers = [...roles.values()].filter(r => r === "tracker").length;
    expect(trackers).toBeLessThanOrEqual(2);
  });
  it("assigns scout as fallback for unassigned vehicles", () => {
    const vehicles = new Map([["v1", makeVehicle("v1")]]);
    const caps = new Map([["v1", makeCaps({ roles_eligible: ["scout"] })]]);
    const { roles } = allocateRoles(vehicles, caps, null, new Map(), "initial");
    expect(roles.get("v1")).toBe("scout");
  });
  it("handles empty fleet", () => {
    const { roles, changes } = allocateRoles(new Map(), new Map(), null, new Map(), "initial");
    expect(roles.size).toBe(0);
    expect(changes).toHaveLength(0);
  });
  it("returns changes for new role assignments", () => {
    const vehicles = new Map([["v1", makeVehicle("v1")]]);
    const caps = new Map([["v1", makeCaps()]]);
    const { changes } = allocateRoles(vehicles, caps, null, new Map(), "initial");
    expect(changes.length).toBeGreaterThan(0);
    expect(changes[0].vehicleId).toBe("v1");
    expect(changes[0].trigger).toBe("initial");
  });
  it("allows multiple relays when partitioned", () => {
    const vehicles = new Map<string, VehicleState>();
    const caps = new Map<string, VehicleCapabilities>();
    for (let i = 0; i < 4; i++) {
      const id = `v${i}`;
      vehicles.set(id, makeVehicle(id));
      caps.set(id, makeCaps({ payloads: ["comms_relay"], roles_eligible: ["relay", "scout"] }));
    }
    const network = { edges: [], partitions: [["v0", "v1"], ["v2", "v3"]], partition_count: 2 };
    const { roles } = allocateRoles(vehicles, caps, network, new Map(), "partition_detected");
    const relays = [...roles.values()].filter(r => r === "relay").length;
    expect(relays).toBeGreaterThanOrEqual(2);
  });
});
