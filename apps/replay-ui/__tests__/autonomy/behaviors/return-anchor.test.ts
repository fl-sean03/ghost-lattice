import { describe, it, expect } from "vitest";
import { ReturnAnchor } from "@/sim/autonomy/behaviors/return-anchor";
import { makeVehicle, makeContext } from "../../helpers";

describe("ReturnAnchor", () => {
  it("targets configured base station", () => {
    const ctx = makeContext({ baseStation: [10, 20, 0] });
    const b = new ReturnAnchor("rth1");
    b.configure(ctx);
    const r = b.tick(makeVehicle("rth1"), new Map(), null);
    expect(r.target[0]).toBe(10);
    expect(r.target[1]).toBe(20);
  });

  it("altitude matches configured return altitude", () => {
    const ctx = makeContext();
    const b = new ReturnAnchor("rth1");
    b.configure(ctx);
    expect(b.tick(makeVehicle("rth1"), new Map(), null).target[2]).toBe(ctx.altitudes.return_anchor);
  });

  it("target constant regardless of fleet state", () => {
    const b = new ReturnAnchor("rth1");
    b.configure(makeContext({ baseStation: [5, 5, 0] }));
    const r1 = b.tick(makeVehicle("rth1", { position: [100, 100, -30] }), new Map(), null);
    const r2 = b.tick(makeVehicle("rth1", { position: [500, 500, -30] }), new Map(), null);
    expect(r1.target[0]).toBe(r2.target[0]);
    expect(r1.target[1]).toBe(r2.target[1]);
  });

  it("default base [0,0,-20] without configure", () => {
    const b = new ReturnAnchor("rth1");
    const r = b.tick(makeVehicle("rth1"), new Map(), null);
    expect(r.target).toEqual([0, 0, -20]);
  });
});
