import { describe, it, expect } from "vitest";
import { FanOutSearch } from "@/sim/autonomy/behaviors/fan-out-search";
import { makeVehicle, makeContext } from "../../helpers";

const ctx = makeContext();
const state = makeVehicle("scout_1", { max_speed: 15 });

describe("FanOutSearch", () => {
  it("sweep stays within search bounds", () => {
    const b = new FanOutSearch("s1");
    b.configure(0, ctx);
    for (let t = 0; t < 100; t += 0.5) {
      const r = b.tickWithTime(t, state);
      expect(r.target[0]).toBeGreaterThanOrEqual(ctx.searchBounds[0][0] - 1);
      expect(r.target[0]).toBeLessThanOrEqual(ctx.searchBounds[1][0] + 1);
      expect(r.target[1]).toBeGreaterThanOrEqual(ctx.searchBounds[0][1] - 1);
      expect(r.target[1]).toBeLessThanOrEqual(ctx.searchBounds[1][1] + 1);
    }
  });

  it("produces triangle-wave sweep across X axis", () => {
    const b = new FanOutSearch("s1");
    b.configure(0, ctx);
    const xs = Array.from({ length: 200 }, (_, i) => b.tickWithTime(i * 0.5, state).target[0]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    expect(maxX - minX).toBeGreaterThan(200); // should traverse most of sector
  });

  it("different scout indices produce different Y lanes", () => {
    const b0 = new FanOutSearch("s0");
    const b1 = new FanOutSearch("s1");
    b0.configure(0, ctx);
    b1.configure(1, ctx);
    const y0 = b0.tickWithTime(0, state).target[1];
    const y1 = b1.tickWithTime(0, state).target[1];
    expect(Math.abs(y0 - y1)).toBeGreaterThan(10);
  });

  it("altitude matches configured scout altitude", () => {
    const b = new FanOutSearch("s1");
    b.configure(0, ctx);
    expect(b.tickWithTime(5, state).target[2]).toBe(ctx.altitudes.scout);
  });

  it("jammer avoidance deflects target away from jammer", () => {
    const b = new FanOutSearch("s1");
    b.configure(0, ctx);
    const threats = { jammers: [{ center: [240, 60, 0] as [number, number, number], radius_m: 100 }], gpsZones: [] };
    const noThreat = b.tickWithTime(10, state);
    const withThreat = b.tickWithTime(10, state, threats);
    // If the normal target was near the jammer, it should be pushed away
    const dNoThreat = Math.sqrt((noThreat.target[0] - 240) ** 2 + (noThreat.target[1] - 60) ** 2);
    const dWithThreat = Math.sqrt((withThreat.target[0] - 240) ** 2 + (withThreat.target[1] - 60) ** 2);
    // With threat, target should be at least as far from jammer
    expect(dWithThreat).toBeGreaterThanOrEqual(dNoThreat - 1);
  });

  it("jammer avoidance still keeps target inside bounds", () => {
    const b = new FanOutSearch("s1");
    b.configure(0, ctx);
    // Jammer near edge of search bounds
    const threats = { jammers: [{ center: [120, 50, 0] as [number, number, number], radius_m: 150 }], gpsZones: [] };
    for (let t = 0; t < 50; t += 1) {
      const r = b.tickWithTime(t, state, threats);
      expect(r.target[0]).toBeGreaterThanOrEqual(ctx.searchBounds[0][0] - 1);
      expect(r.target[0]).toBeLessThanOrEqual(ctx.searchBounds[1][0] + 1);
    }
  });

  it("setSearchBounds updates sweep region", () => {
    const b = new FanOutSearch("s1");
    b.configure(0, ctx);
    b.setSearchBounds([[200, 100], [400, 300]]);
    for (let t = 0; t < 50; t += 1) {
      const r = b.tickWithTime(t, state);
      expect(r.target[0]).toBeGreaterThanOrEqual(199);
      expect(r.target[0]).toBeLessThanOrEqual(401);
    }
  });

  it("sweep oscillates (not stuck)", () => {
    const b = new FanOutSearch("s1");
    b.configure(0, ctx);
    const x0 = b.tickWithTime(0, state).target[0];
    const x50 = b.tickWithTime(50, state).target[0];
    expect(x0).not.toBe(x50);
  });

  it("no threats produces valid target", () => {
    const b = new FanOutSearch("s1");
    b.configure(0, ctx);
    const r = b.tickWithTime(5, state);
    expect(r.target).toHaveLength(3);
    expect(Number.isFinite(r.target[0])).toBe(true);
    expect(Number.isFinite(r.target[1])).toBe(true);
  });
});
