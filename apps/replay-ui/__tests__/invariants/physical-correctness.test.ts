import { describe, it, expect } from "vitest";
import { SimEngine } from "@/sim/engine";
import { DEFAULT_CONFIG } from "@/sim/config";

describe("Physical Correctness Invariants", () => {
  it("no drone exceeds max_speed between ticks", () => {
    const e = new SimEngine(DEFAULT_CONFIG);
    e.start();
    let prev = new Map<string, [number, number, number]>();
    for (const [id, v] of e.getSnapshot().vehicles) {
      prev.set(id, [...v.position_ned] as [number, number, number]);
    }
    for (let tick = 0; tick < 500; tick++) {
      e.step();
      for (const [id, v] of e.getSnapshot().vehicles) {
        const p = prev.get(id);
        if (p) {
          const dx = v.position_ned[0] - p[0];
          const dy = v.position_ned[1] - p[1];
          const dz = v.position_ned[2] - p[2];
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          // max_speed * DT * 1.1 (10% tolerance for floating point)
          const maxMove = 20 * 0.1 * 1.1; // 20 m/s is the fastest possible drone
          expect(dist).toBeLessThanOrEqual(maxMove);
        }
        prev.set(id, [...v.position_ned] as [number, number, number]);
      }
    }
  });

  it("no position contains NaN or Infinity", () => {
    const e = new SimEngine(DEFAULT_CONFIG);
    e.start();
    for (let i = 0; i < 500; i++) {
      e.step();
      for (const v of e.getSnapshot().vehicles.values()) {
        for (const c of v.position_ned) {
          expect(Number.isFinite(c)).toBe(true);
        }
      }
    }
  });

  it("battery never goes below 0", () => {
    const e = new SimEngine(DEFAULT_CONFIG);
    e.start();
    for (let i = 0; i < 3000; i++) e.step();
    for (const v of e.getSnapshot().vehicles.values()) {
      expect(v.battery_pct).toBeGreaterThanOrEqual(0);
    }
  });

  it("battery monotonically decreases", () => {
    const e = new SimEngine(DEFAULT_CONFIG);
    e.start();
    const prevBat = new Map<string, number>();
    for (const [id, v] of e.getSnapshot().vehicles) prevBat.set(id, v.battery_pct);
    for (let i = 0; i < 200; i++) {
      e.step();
      for (const [id, v] of e.getSnapshot().vehicles) {
        const prev = prevBat.get(id) ?? 100;
        expect(v.battery_pct).toBeLessThanOrEqual(prev + 0.001); // tiny tolerance
        prevBat.set(id, v.battery_pct);
      }
    }
  });

  it("no duplicate role assignments exceeding limits", () => {
    const e = new SimEngine(DEFAULT_CONFIG);
    e.start();
    for (let i = 0; i < 100; i++) e.step();
    const roles = [...e.getSnapshot().vehicles.values()].map(v => v.current_role);
    const decoys = roles.filter(r => r === "decoy").length;
    expect(decoys).toBeLessThanOrEqual(1);
    // Every vehicle has a non-empty role
    for (const r of roles) expect(r).toBeTruthy();
  });

  it("drones stay within reasonable bounds", () => {
    const e = new SimEngine(DEFAULT_CONFIG);
    e.start();
    for (let i = 0; i < 1000; i++) e.step();
    for (const v of e.getSnapshot().vehicles.values()) {
      expect(Math.abs(v.position_ned[0])).toBeLessThan(2000);
      expect(Math.abs(v.position_ned[1])).toBeLessThan(2000);
    }
  });

  it("heading is always finite", () => {
    const e = new SimEngine(DEFAULT_CONFIG);
    e.start();
    for (let i = 0; i < 200; i++) {
      e.step();
      for (const v of e.getSnapshot().vehicles.values()) {
        expect(Number.isFinite(v.heading_rad)).toBe(true);
      }
    }
  });
});
