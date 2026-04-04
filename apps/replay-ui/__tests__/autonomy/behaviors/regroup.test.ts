import { describe, it, expect } from "vitest";
import { Regroup } from "@/sim/autonomy/behaviors/regroup";
import { makeVehicle, makeFleet, makeNetwork } from "../../helpers";

describe("Regroup", () => {
  it("moves toward other partition centroid", () => {
    const b = new Regroup("r1");
    const state = makeVehicle("r1", { position: [50, 50, -30] });
    const fleet = makeFleet({ r1: [50, 50, -30], v1: [60, 60, -30], v2: [300, 300, -30] });
    const network = makeNetwork([["r1", "v1"], ["v2"]]);
    const r = b.tick(state, fleet, network);
    // Should move 30% toward [300, 300]
    expect(r.target[0]).toBeGreaterThan(50);
    expect(r.target[1]).toBeGreaterThan(50);
  });

  it("onEnter sets initial target toward origin", () => {
    const b = new Regroup("r1");
    const state = makeVehicle("r1", { position: [200, 100, -30] });
    b.onEnter(state);
    const r = b.tick(state, new Map(), makeNetwork([["r1"]]));
    expect(r.target[0]).toBeCloseTo(140, 0);
    expect(r.target[1]).toBeCloseTo(70, 0);
  });

  it("no partitions returns fallback target", () => {
    const b = new Regroup("r1");
    const state = makeVehicle("r1");
    const r = b.tick(state, new Map(), makeNetwork([["r1", "v1"]]));
    expect(Number.isFinite(r.target[0])).toBe(true);
  });

  it("does not overshoot (30% movement)", () => {
    const b = new Regroup("r1");
    const state = makeVehicle("r1", { position: [0, 0, -30] });
    const fleet = makeFleet({ r1: [0, 0, -30], v2: [300, 300, -30] });
    const network = makeNetwork([["r1"], ["v2"]]);
    const r = b.tick(state, fleet, network);
    expect(r.target[0]).toBeLessThan(100); // 30% of 300 = 90
    expect(r.target[0]).toBeGreaterThan(70);
  });
});
