import { describe, it, expect } from "vitest";
import { PassiveTrack } from "@/sim/autonomy/behaviors/passive-track";
import { makeVehicle, makeContext } from "../../helpers";

describe("PassiveTrack", () => {
  it("orbits target at ~25m radius", () => {
    const ctx = makeContext();
    const b = new PassiveTrack("t1");
    b.configure(ctx);
    b.updateTarget([200, 150, 0]);
    const state = makeVehicle("t1", { position: [200, 150, -25] });
    const distances: number[] = [];
    for (let t = 0; t < 63; t += 1) {
      const r = b.tickWithTime(t, state);
      const d = Math.sqrt((r.target[0] - 200) ** 2 + (r.target[1] - 150) ** 2);
      distances.push(d);
    }
    const avg = distances.reduce((a, b) => a + b) / distances.length;
    expect(avg).toBeCloseTo(25, 0);
  });

  it("follows updated emitter position", () => {
    const b = new PassiveTrack("t1");
    b.configure(makeContext());
    b.updateTarget([100, 100, 0]);
    const r1 = b.tickWithTime(0, makeVehicle("t1"));
    b.updateTarget([300, 200, 0]);
    const r2 = b.tickWithTime(0, makeVehicle("t1"));
    expect(Math.abs(r2.target[0] - 300)).toBeLessThan(30);
    expect(Math.abs(r1.target[0] - 100)).toBeLessThan(30);
  });

  it("defaults to search centroid when no emitter", () => {
    const ctx = makeContext({ searchCentroid: [240, 150] });
    const b = new PassiveTrack("t1");
    b.configure(ctx);
    const r = b.tickWithTime(0, makeVehicle("t1"));
    expect(Math.abs(r.target[0] - 240)).toBeLessThan(30);
    expect(Math.abs(r.target[1] - 150)).toBeLessThan(30);
  });

  it("altitude matches configured tracker altitude", () => {
    const ctx = makeContext();
    const b = new PassiveTrack("t1");
    b.configure(ctx);
    b.updateTarget([200, 150, 0]);
    expect(b.tickWithTime(5, makeVehicle("t1")).target[2]).toBe(ctx.altitudes.tracker);
  });

  it("orbit is smooth between ticks", () => {
    const b = new PassiveTrack("t1");
    b.configure(makeContext());
    b.updateTarget([200, 150, 0]);
    const s = makeVehicle("t1");
    const p1 = b.tickWithTime(10.0, s);
    const p2 = b.tickWithTime(10.1, s);
    const d = Math.sqrt((p1.target[0] - p2.target[0]) ** 2 + (p1.target[1] - p2.target[1]) ** 2);
    expect(d).toBeLessThan(5); // smooth, not jumping
  });
});
