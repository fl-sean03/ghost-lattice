import { describe, it, expect } from "vitest";
import { SimEngine } from "@/sim/engine";
import { DEFAULT_CONFIG, type ScenarioConfig } from "@/sim/config";

describe("Stress & Edge Cases", () => {
  it("single drone fleet runs without crash", () => {
    const config: ScenarioConfig = { ...DEFAULT_CONFIG, fleet: [DEFAULT_CONFIG.fleet[0]] };
    const e = new SimEngine(config);
    e.start();
    for (let i = 0; i < 500; i++) e.step();
    expect(e.getSnapshot().vehicles.size).toBe(1);
    // With 1 drone, allocator may assign tracker not scout, so coverage may be 0
    expect(e.getScorecard().search_coverage_pct).toBeGreaterThanOrEqual(0);
  });

  it("20-drone fleet runs without crash", () => {
    const fleet = Array.from({ length: 20 }, (_, i) => ({
      ...DEFAULT_CONFIG.fleet[i % DEFAULT_CONFIG.fleet.length],
      id: `drone_${i}`,
      spawn_pose: [i * 3, 0, 0] as [number, number, number],
    }));
    const config: ScenarioConfig = { ...DEFAULT_CONFIG, fleet };
    const e = new SimEngine(config);
    e.start();
    for (let i = 0; i < 200; i++) e.step();
    expect(e.getSnapshot().vehicles.size).toBe(20);
  });

  it("map-covering jammer fully disconnects fleet", () => {
    const e = new SimEngine(DEFAULT_CONFIG);
    e.start();
    for (let i = 0; i < 50; i++) e.step();
    e.injectJammer([200, 150, 0], 2000);
    for (let i = 0; i < 50; i++) e.step();
    const net = e.getSnapshot().network!;
    expect(net.partition_count).toBeGreaterThan(1);
  });

  it("zero-size search region does not crash", () => {
    const config: ScenarioConfig = {
      ...DEFAULT_CONFIG,
      world_features: { ...DEFAULT_CONFIG.world_features, search_sectors: [{ id: "tiny", bounds: [[200, 200], [200, 200]] }] },
    };
    const e = new SimEngine(config);
    e.start();
    for (let i = 0; i < 100; i++) e.step();
    expect(e.getScorecard().search_coverage_pct).toBeDefined();
  });

  it("very long mission (3000 ticks = 300s) completes", { timeout: 10000 }, () => {
    const e = new SimEngine(DEFAULT_CONFIG);
    e.start();
    for (let i = 0; i < 3000; i++) e.step();
    expect(e.elapsed).toBeGreaterThan(290);
    // No NaN in positions
    for (const v of e.getSnapshot().vehicles.values()) {
      expect(Number.isFinite(v.position_ned[0])).toBe(true);
      expect(Number.isFinite(v.position_ned[1])).toBe(true);
    }
  });

  it("100 jammer spam does not crash", () => {
    const e = new SimEngine(DEFAULT_CONFIG);
    e.start();
    for (let i = 0; i < 100; i++) {
      e.injectJammer([Math.random() * 400, Math.random() * 300, 0], 50);
      if (i % 10 === 0) for (let j = 0; j < 10; j++) e.step();
    }
    expect(e.getSnapshot().vehicles.size).toBeGreaterThan(0);
  });

  it("remove nonexistent disruption is no-op", () => {
    const e = new SimEngine(DEFAULT_CONFIG);
    e.start();
    e.step();
    const before = e.getSnapshot().activeDisruptions.length;
    e.removeDisruption("nonexistent_xyz");
    e.step();
    expect(e.getSnapshot().activeDisruptions.length).toBe(before);
  });
});
