import { describe, it, expect } from "vitest";
import { baseQuality, lineOfSight, jammerAttenuation, linkQuality, type Vec3 } from "@/sim/ddil/link-model";

describe("baseQuality", () => {
  it("returns 1.0 at zero distance", () => {
    expect(baseQuality(0, 800)).toBe(1);
  });
  it("returns 0.0 at max range", () => {
    expect(baseQuality(800, 800)).toBe(0);
  });
  it("returns 0.5 at half range", () => {
    expect(baseQuality(400, 800)).toBeCloseTo(0.5);
  });
  it("returns 0.0 beyond range", () => {
    expect(baseQuality(1000, 800)).toBe(0);
  });
  it("handles zero max range", () => {
    expect(baseQuality(10, 0)).toBe(0);
  });
});

describe("lineOfSight", () => {
  it("returns 1.0 with no buildings", () => {
    expect(lineOfSight([0, 0, 30], [100, 0, 30], [])).toBe(1);
  });
  it("returns 0.2 when blocked by building", () => {
    const bldg = { center: [50, 0, 10] as Vec3, size: [20, 20, 20] as Vec3 };
    expect(lineOfSight([0, 0, 10], [100, 0, 10], [bldg])).toBe(0.2);
  });
  it("returns 1.0 when flying over building", () => {
    const bldg = { center: [50, 0, 10] as Vec3, size: [20, 20, 20] as Vec3 };
    expect(lineOfSight([0, 0, 50], [100, 0, 50], [bldg])).toBe(1);
  });
  it("handles same-point query", () => {
    expect(lineOfSight([50, 50, 0], [50, 50, 0], [])).toBe(1);
  });
});

describe("jammerAttenuation", () => {
  const jammer = { center: [200, 150, 0] as Vec3, radius_m: 150, active: true };

  it("returns 1.0 when both endpoints outside radius", () => {
    expect(jammerAttenuation([0, 0, 0], [10, 0, 0], [jammer])).toBe(1);
  });
  it("returns near-zero when endpoint at jammer center", () => {
    const a = jammerAttenuation([200, 150, 0], [200, 150, 0], [jammer]);
    expect(a).toBeLessThan(0.01);
  });
  it("returns < 1.0 when one endpoint inside radius", () => {
    const a = jammerAttenuation([200, 150, 30], [400, 300, 30], [jammer]);
    expect(a).toBeLessThan(1);
  });
  it("ignores inactive jammers", () => {
    const inactive = { ...jammer, active: false };
    expect(jammerAttenuation([200, 150, 0], [200, 150, 0], [inactive])).toBe(1);
  });
  it("compounds multiple jammers", () => {
    const j2 = { center: [100, 100, 0] as Vec3, radius_m: 200, active: true };
    const single = jammerAttenuation([150, 125, 0], [300, 200, 0], [jammer]);
    const double = jammerAttenuation([150, 125, 0], [300, 200, 0], [jammer, j2]);
    expect(double).toBeLessThanOrEqual(single);
  });
});

describe("linkQuality", () => {
  it("returns high quality for close, clear link", () => {
    expect(linkQuality([0, 0, 30], [50, 0, 30], 800)).toBeGreaterThan(0.9);
  });
  it("returns 0 for distant link", () => {
    expect(linkQuality([0, 0, 0], [1000, 0, 0], 800)).toBe(0);
  });
  it("degrades with jammer", () => {
    const jammer = { center: [25, 0, 0] as Vec3, radius_m: 100, active: true };
    const clear = linkQuality([0, 0, 30], [50, 0, 30], 800);
    const jammed = linkQuality([0, 0, 30], [50, 0, 30], 800, [], [jammer]);
    expect(jammed).toBeLessThan(clear);
  });
});
