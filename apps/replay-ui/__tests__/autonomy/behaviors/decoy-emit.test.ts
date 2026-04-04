import { describe, it, expect } from "vitest";
import { DecoyEmit } from "@/sim/autonomy/behaviors/decoy-emit";
import { makeContext } from "../../helpers";

describe("DecoyEmit", () => {
  it("center derived from search bounds", () => {
    const ctx = makeContext({ searchBounds: [[100, 30], [380, 270]] });
    const b = new DecoyEmit("d1");
    b.configure(ctx);
    const targets = Array.from({ length: 100 }, (_, i) => b.tickWithTime(i * 0.5));
    const avgX = targets.reduce((s, t) => s + t.target[0], 0) / targets.length;
    const avgY = targets.reduce((s, t) => s + t.target[1], 0) / targets.length;
    expect(avgX).toBeCloseTo(80, -1); // near edge of sector
    expect(avgY).toBeCloseTo(150, -1); // centered vertically
  });

  it("altitude matches configured decoy altitude", () => {
    const ctx = makeContext();
    const b = new DecoyEmit("d1");
    b.configure(ctx);
    expect(b.tickWithTime(5).target[2]).toBe(ctx.altitudes.decoy);
  });

  it("pattern is continuous (no jumps)", () => {
    const b = new DecoyEmit("d1");
    b.configure(makeContext());
    for (let t = 0; t < 50; t += 0.1) {
      const p1 = b.tickWithTime(t);
      const p2 = b.tickWithTime(t + 0.1);
      const d = Math.sqrt((p1.target[0] - p2.target[0]) ** 2 + (p1.target[1] - p2.target[1]) ** 2);
      expect(d).toBeLessThan(10);
    }
  });

  it("X and Y oscillate at different frequencies (figure-8)", () => {
    const b = new DecoyEmit("d1");
    b.configure(makeContext());
    const targets = Array.from({ length: 200 }, (_, i) => b.tickWithTime(i * 0.3));
    // Count zero-crossings around center for X and Y
    let xCross = 0, yCross = 0;
    const cx = targets.reduce((s, t) => s + t.target[0], 0) / targets.length;
    const cy = targets.reduce((s, t) => s + t.target[1], 0) / targets.length;
    for (let i = 1; i < targets.length; i++) {
      if ((targets[i - 1].target[0] - cx) * (targets[i].target[0] - cx) < 0) xCross++;
      if ((targets[i - 1].target[1] - cy) * (targets[i].target[1] - cy) < 0) yCross++;
    }
    // Y should have ~2x the crossings of X (double frequency)
    expect(yCross).toBeGreaterThan(xCross * 1.3);
  });
});
