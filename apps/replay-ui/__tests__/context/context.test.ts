import { describe, it, expect } from "vitest";
import { buildContext } from "@/sim/context";
import { DEFAULT_CONFIG, type ScenarioConfig } from "@/sim/config";

describe("buildContext", () => {
  it("derives searchBounds from first sector", () => {
    const ctx = buildContext(DEFAULT_CONFIG);
    expect(ctx.searchBounds).toEqual([[100, 30], [380, 270]]);
  });

  it("computes centroid correctly", () => {
    const ctx = buildContext(DEFAULT_CONFIG);
    expect(ctx.searchCentroid[0]).toBeCloseTo(240, 0);
    expect(ctx.searchCentroid[1]).toBeCloseTo(150, 0);
  });

  it("extracts base station from config", () => {
    const ctx = buildContext(DEFAULT_CONFIG);
    expect(ctx.baseStation).toEqual([0, 0, 0]);
  });

  it("custom base station", () => {
    const config: ScenarioConfig = {
      ...DEFAULT_CONFIG,
      world_features: { ...DEFAULT_CONFIG.world_features, base_station: { position: [50, 50, 0] } },
    };
    const ctx = buildContext(config);
    expect(ctx.baseStation).toEqual([50, 50, 0]);
  });

  it("sets fleetSize from config", () => {
    expect(buildContext(DEFAULT_CONFIG).fleetSize).toBe(6);
    const small = { ...DEFAULT_CONFIG, fleet: DEFAULT_CONFIG.fleet.slice(0, 2) };
    expect(buildContext(small).fleetSize).toBe(2);
  });

  it("scoring weights sum to ~1.0", () => {
    const ctx = buildContext(DEFAULT_CONFIG);
    const sum = Object.values(ctx.scoringWeights).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 2);
  });

  it("all altitudes are negative (NED)", () => {
    const ctx = buildContext(DEFAULT_CONFIG);
    for (const alt of Object.values(ctx.altitudes)) {
      expect(alt).toBeLessThan(0);
    }
  });
});
