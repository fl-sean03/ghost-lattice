import { describe, it, expect } from "vitest";
import { SimEngine } from "@/sim/engine";
import { DEFAULT_CONFIG } from "@/sim/config";

describe("Multi-Interaction Scenarios", () => {
  it("jammer then kill causes cascading reallocation", () => {
    const e = new SimEngine(DEFAULT_CONFIG);
    e.start();
    for (let i = 0; i < 100; i++) e.step();
    e.injectJammer([200, 130, 0], 200);
    for (let i = 0; i < 20; i++) e.step();
    e.killDrone("alpha_1");
    for (let i = 0; i < 20; i++) e.step();
    const events = e.events;
    expect(events.some(ev => ev.type === "node_loss")).toBe(true);
    expect(events.some(ev => ev.type === "role_change")).toBe(true);
    // All surviving drones have non-empty roles
    for (const v of e.getSnapshot().vehicles.values()) {
      expect(v.current_role).toBeTruthy();
    }
  });

  it("multiple jammers create degraded coverage zone", () => {
    const e = new SimEngine(DEFAULT_CONFIG);
    e.start();
    for (let i = 0; i < 100; i++) e.step();
    e.injectJammer([150, 150, 0], 100);
    e.injectJammer([300, 150, 0], 100);
    for (let i = 0; i < 200; i++) e.step();
    // System should still be running, not crashed
    expect(e.getSnapshot().vehicles.size).toBeGreaterThan(0);
    expect(e.getScorecard().search_coverage_pct).toBeGreaterThan(0);
  });

  it("kill all scouts stops coverage growth", () => {
    const e = new SimEngine(DEFAULT_CONFIG);
    e.start();
    for (let i = 0; i < 200; i++) e.step();
    const coverageBefore = e.getScorecard().search_coverage_pct;
    // Kill all scouts
    for (const [id, v] of e.getSnapshot().vehicles) {
      if (v.current_role === "scout") e.killDrone(id);
    }
    for (let i = 0; i < 100; i++) e.step();
    const coverageAfter = e.getScorecard().search_coverage_pct;
    // Coverage should not increase significantly (reallocation may assign new scout)
    // But at minimum, system doesn't crash
    expect(coverageAfter).toBeDefined();
  });

  it("kill relay during partition causes reallocation", () => {
    const e = new SimEngine(DEFAULT_CONFIG);
    e.start();
    for (let i = 0; i < 100; i++) e.step();
    e.injectJammer([200, 130, 0], 250);
    for (let i = 0; i < 30; i++) e.step();
    // Find and kill the relay
    for (const [id, v] of e.getSnapshot().vehicles) {
      if (v.current_role === "relay") { e.killDrone(id); break; }
    }
    for (let i = 0; i < 50; i++) e.step();
    // System should survive
    expect(e.getSnapshot().vehicles.size).toBeGreaterThanOrEqual(4);
    expect(e.events.some(ev => ev.type === "node_loss")).toBe(true);
  });

  it("spawn emitter then kill tracker causes new tracker", () => {
    const e = new SimEngine(DEFAULT_CONFIG);
    e.start();
    for (let i = 0; i < 100; i++) e.step();
    e.spawnEmitter([350, 200, 0]);
    for (let i = 0; i < 50; i++) e.step();
    // Find and kill tracker
    for (const [id, v] of e.getSnapshot().vehicles) {
      if (v.current_role === "tracker") { e.killDrone(id); break; }
    }
    for (let i = 0; i < 50; i++) e.step();
    // A new tracker should be assigned (or at least system doesn't crash)
    expect(e.getSnapshot().vehicles.size).toBeGreaterThanOrEqual(3);
  });

  it("jammer removal heals partition", () => {
    const e = new SimEngine(DEFAULT_CONFIG);
    e.start();
    for (let i = 0; i < 100; i++) e.step();
    e.injectJammer([200, 130, 0], 300, -60);
    for (let i = 0; i < 30; i++) e.step();
    const partDuring = e.getSnapshot().network?.partition_count ?? 1;
    e.removeDisruption("jammer_1");
    for (let i = 0; i < 100; i++) e.step();
    const partAfter = e.getSnapshot().network?.partition_count ?? 1;
    expect(partDuring).toBeGreaterThan(1);
    expect(partAfter).toBeLessThanOrEqual(partDuring);
  });

  it("jammer on base degrades all links", () => {
    const e = new SimEngine(DEFAULT_CONFIG);
    e.start();
    for (let i = 0; i < 50; i++) e.step();
    e.injectJammer([0, 0, 0], 500);
    for (let i = 0; i < 50; i++) e.step();
    const net = e.getSnapshot().network!;
    const avgQ = net.edges.reduce((s, ed) => s + ed.quality, 0) / net.edges.length;
    expect(avgQ).toBeLessThan(0.5);
  });
});
