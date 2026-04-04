import { describe, it, expect } from "vitest";
import { gpsDegradationAt, type GPSZone } from "@/sim/ddil/gps-model";

const zone: GPSZone = { id: "g1", center: [200, 100, 0], radius_m: 100, accuracy_m: 50, active: true };

describe("gpsDegradationAt", () => {
  it("returns 1.5m outside radius", () => {
    expect(gpsDegradationAt(zone, [500, 500, 0])).toBe(1.5);
  });
  it("returns max accuracy at center", () => {
    expect(gpsDegradationAt(zone, [200, 100, 0])).toBeCloseTo(50, 0);
  });
  it("returns intermediate at half radius", () => {
    const r = gpsDegradationAt(zone, [250, 100, 0]); // 50m from center
    expect(r).toBeGreaterThan(1.5);
    expect(r).toBeLessThan(50);
  });
  it("inactive zone returns 1.5m", () => {
    const inactive = { ...zone, active: false };
    expect(gpsDegradationAt(inactive, [200, 100, 0])).toBe(1.5);
  });
});
