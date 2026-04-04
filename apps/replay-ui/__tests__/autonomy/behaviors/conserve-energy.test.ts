import { describe, it, expect } from "vitest";
import { ConserveEnergy } from "@/sim/autonomy/behaviors/conserve-energy";
import { makeVehicle, makeContext } from "../../helpers";

describe("ConserveEnergy", () => {
  it("holds position at entry point", () => {
    const b = new ConserveEnergy("c1");
    b.configure(makeContext());
    const state = makeVehicle("c1", { position: [50, 60, -30] });
    b.onEnter(state);
    const r = b.tick(state, new Map(), null);
    expect(r.target[0]).toBe(50);
    expect(r.target[1]).toBe(60);
  });

  it("altitude matches configured reserve altitude", () => {
    const ctx = makeContext();
    const b = new ConserveEnergy("c1");
    b.configure(ctx);
    b.onEnter(makeVehicle("c1"));
    expect(b.tick(makeVehicle("c1"), new Map(), null).target[2]).toBe(ctx.altitudes.reserve);
  });

  it("position unchanged across 100 ticks", () => {
    const b = new ConserveEnergy("c1");
    b.configure(makeContext());
    b.onEnter(makeVehicle("c1", { position: [77, 88, -30] }));
    for (let i = 0; i < 100; i++) {
      const r = b.tick(makeVehicle("c1", { position: [99, 99, -30] }), new Map(), null);
      expect(r.target[0]).toBe(77);
      expect(r.target[1]).toBe(88);
    }
  });
});
