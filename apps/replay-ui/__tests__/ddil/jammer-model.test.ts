import { describe, it, expect } from "vitest";
import { jammerSignalAt, type JammerZone } from "@/sim/ddil/jammer-model";

const jammer: JammerZone = { id: "j1", center: [200, 150, 0], radius_m: 150, strength_dbm: -60, active: true };

describe("jammerSignalAt", () => {
  it("returns 0 outside radius", () => {
    expect(jammerSignalAt(jammer, [500, 500, 0])).toBe(0);
  });
  it("returns 1 at center", () => {
    expect(jammerSignalAt(jammer, [200, 150, 0])).toBe(1);
  });
  it("quadratic falloff at 50% radius", () => {
    expect(jammerSignalAt(jammer, [275, 150, 0])).toBeCloseTo(0.25, 1);
  });
  it("inactive returns 0", () => {
    expect(jammerSignalAt({ ...jammer, active: false }, [200, 150, 0])).toBe(0);
  });
});
