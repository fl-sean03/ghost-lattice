import { describe, it, expect } from "vitest";
import { HoldRelay } from "@/sim/autonomy/behaviors/hold-relay";
import { makeVehicle, makeContext, makeFleet, makeNetwork } from "../../helpers";

describe("HoldRelay", () => {
  it("positions between base and fleet centroid", () => {
    const ctx = makeContext({ baseStation: [0, 0, 0] });
    const b = new HoldRelay("relay_1");
    b.configure(ctx);
    const fleet = makeFleet({ relay_1: [0, 0, -40], v1: [200, 200, -30], v2: [300, 100, -30] });
    const r = b.tick(fleet.get("relay_1")!, fleet, null);
    // Fleet centroid (excluding self) = (200+300)/2=250, (200+100)/2=150
    // Midpoint with base: (0+250)/2=125, (0+150)/2=75
    expect(r.target[0]).toBeCloseTo(125, 0);
    expect(r.target[1]).toBeCloseTo(75, 0);
  });

  it("altitude matches configured relay altitude", () => {
    const ctx = makeContext();
    const b = new HoldRelay("r1");
    b.configure(ctx);
    const fleet = makeFleet({ r1: [50, 50, -40], v1: [200, 200, -30] });
    const r = b.tick(fleet.get("r1")!, fleet, null);
    expect(r.target[2]).toBe(ctx.altitudes.relay);
  });

  it("repositions toward other partition when split", () => {
    const ctx = makeContext();
    const b = new HoldRelay("r1");
    b.configure(ctx);
    const fleet = makeFleet({ r1: [100, 100, -40], v1: [50, 50, -30], v2: [300, 300, -30] });
    const network = makeNetwork([["r1", "v1"], ["v2"]]);
    const r = b.tick(fleet.get("r1")!, fleet, network);
    // Should position between partitions, not just at base-centroid midpoint
    expect(r.target[0]).toBeGreaterThan(50); // moved toward v2
    expect(r.target[1]).toBeGreaterThan(50);
  });

  it("handles single-vehicle fleet", () => {
    const ctx = makeContext();
    const b = new HoldRelay("r1");
    b.configure(ctx);
    const fleet = makeFleet({ r1: [50, 50, -40] });
    const r = b.tick(fleet.get("r1")!, fleet, null);
    expect(Number.isFinite(r.target[0])).toBe(true);
  });

  it("ignores dead vehicles in centroid", () => {
    const ctx = makeContext({ baseStation: [0, 0, 0] });
    const b = new HoldRelay("r1");
    b.configure(ctx);
    const fleet = makeFleet({ r1: [0, 0, -40], alive: [200, 200, -30] });
    fleet.set("dead", makeVehicle("dead", { position: [1000, 1000, -30], alive: false }));
    const r = b.tick(fleet.get("r1")!, fleet, null);
    // Should only consider "alive" vehicle, not "dead"
    expect(r.target[0]).toBeLessThan(150); // not pulled toward [1000,1000]
  });

  it("base station comes from context", () => {
    const ctx = makeContext({ baseStation: [100, 100, 0] });
    const b = new HoldRelay("r1");
    b.configure(ctx);
    const fleet = makeFleet({ r1: [100, 100, -40], v1: [300, 300, -30] });
    const r = b.tick(fleet.get("r1")!, fleet, null);
    // Midpoint between [100,100] and [300,300] = [200,200]
    expect(r.target[0]).toBeCloseTo(200, 0);
  });
});
