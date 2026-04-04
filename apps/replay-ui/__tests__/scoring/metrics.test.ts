import { describe, it, expect } from "vitest";
import { ScoringEngine } from "@/sim/scoring/metrics";

const BOUNDS: [[number, number], [number, number]] = [[100, 30], [380, 270]];

describe("ScoringEngine", () => {
  it("initial scorecard has 0% coverage and 100% relay", () => {
    const s = new ScoringEngine(BOUNDS, 6);
    const sc = s.getScorecard(0);
    expect(sc.search_coverage_pct).toBe(0);
    expect(sc.relay_uptime_pct).toBe(100);
  });

  it("markCoverage inside bounds increases coverage", () => {
    const s = new ScoringEngine(BOUNDS, 6);
    s.markCoverage(200, 150);
    expect(s.getScorecard(1).search_coverage_pct).toBeGreaterThan(0);
  });

  it("markCoverage outside bounds does not increase coverage", () => {
    const s = new ScoringEngine(BOUNDS, 6);
    s.markCoverage(-1000, -1000);
    expect(s.getScorecard(1).search_coverage_pct).toBe(0);
  });

  it("marking all cells reaches ~100% coverage", () => {
    const s = new ScoringEngine(BOUNDS, 6);
    for (let x = 100; x <= 380; x += 10) {
      for (let y = 30; y <= 270; y += 10) {
        s.markCoverage(x, y, 6); // Small radius to fill exactly
      }
    }
    expect(s.getScorecard(1).search_coverage_pct).toBeGreaterThan(90);
  });

  it("relay uptime decreases when partitioned", () => {
    const s = new ScoringEngine(BOUNDS, 6);
    for (let i = 0; i < 10; i++) s.updateNetwork(1, i); // 10 connected
    for (let i = 10; i < 20; i++) s.updateNetwork(2, i); // 10 partitioned
    expect(s.getScorecard(20).relay_uptime_pct).toBeCloseTo(50, 0);
  });

  it("partition recovery time recorded", () => {
    const s = new ScoringEngine(BOUNDS, 6);
    s.updateNetwork(2, 0); // partition at t=0
    s.updateNetwork(1, 5); // heals at t=5
    expect(s.getScorecard(5).recovery_time_partition_sec).toBeCloseTo(5, 1);
  });

  it("node loss decrements active vehicles", () => {
    const s = new ScoringEngine(BOUNDS, 6);
    s.onNodeLoss(1);
    expect(s.getScorecard(1).active_vehicles).toBe(5);
    s.onNodeLoss(2);
    expect(s.getScorecard(2).active_vehicles).toBe(4);
  });

  it("node loss recovery time recorded", () => {
    const s = new ScoringEngine(BOUNDS, 6);
    s.onNodeLoss(10);
    s.onNodeLossRecovery(12.5);
    expect(s.getScorecard(13).recovery_time_node_loss_sec).toBeCloseTo(2.5, 1);
  });

  it("tracking ticks convert to seconds", () => {
    const s = new ScoringEngine(BOUNDS, 6);
    for (let i = 0; i < 100; i++) s.tickTracking();
    expect(s.getScorecard(10).track_continuity_sec).toBeCloseTo(10, 0);
  });

  it("composite score computed correctly", () => {
    const s = new ScoringEngine([[0, 0], [100, 100]], 6);
    // Fill 50% coverage
    for (let x = 0; x < 50; x += 10) for (let y = 0; y < 100; y += 10) s.markCoverage(x, y, 6);
    // 80% relay (8 connected out of 10)
    for (let i = 0; i < 8; i++) s.updateNetwork(1, i);
    for (let i = 8; i < 10; i++) s.updateNetwork(2, i);
    const sc = s.getScorecard(10);
    expect(sc.composite_score).toBeGreaterThan(0);
    expect(sc.composite_score).toBeLessThan(100);
  });

  it("zero-width region does not crash", () => {
    const s = new ScoringEngine([[100, 100], [100, 100]], 6);
    s.markCoverage(100, 100);
    expect(s.getScorecard(1).search_coverage_pct).toBeDefined();
  });

  it("operator interventions reduce composite score", () => {
    const s1 = new ScoringEngine(BOUNDS, 6);
    const s2 = new ScoringEngine(BOUNDS, 6);
    s1.operatorInterventions = 0;
    s2.operatorInterventions = 3;
    expect(s1.getScorecard(1).composite_score).toBeGreaterThan(s2.getScorecard(1).composite_score);
  });
});
