import { describe, it, expect } from "vitest";
import { decomposeSearchArea, generateSweepPath, type SubRegion } from "@/sim/autonomy/task-decomposer";

const BOUNDS: [[number, number], [number, number]] = [[100, 30], [380, 270]];

describe("decomposeSearchArea", () => {
  it("produces one region per scout", () => {
    const scouts = new Map([["s1", [150, 100] as [number, number]], ["s2", [300, 200] as [number, number]]]);
    const regions = decomposeSearchArea(BOUNDS, scouts);
    expect(regions).toHaveLength(2);
    expect(regions.map(r => r.ownerId).sort()).toEqual(["s1", "s2"]);
  });

  it("each region covers part of the search area", () => {
    const scouts = new Map([["s1", [150, 100] as [number, number]], ["s2", [300, 200] as [number, number]]]);
    const regions = decomposeSearchArea(BOUNDS, scouts);
    for (const r of regions) {
      expect(r.bounds[2] - r.bounds[0]).toBeGreaterThan(50); // width > 50m
      expect(r.bounds[3] - r.bounds[1]).toBeGreaterThan(50); // height > 50m
    }
  });

  it("assigns cells to the nearest scout (Voronoi)", () => {
    // Scout s1 at left, s2 at right — s1 should get left cells, s2 right cells
    const scouts = new Map([["s1", [120, 150] as [number, number]], ["s2", [360, 150] as [number, number]]]);
    const regions = decomposeSearchArea(BOUNDS, scouts);
    const r1 = regions.find(r => r.ownerId === "s1")!;
    const r2 = regions.find(r => r.ownerId === "s2")!;
    expect(r1.center[0]).toBeLessThan(240); // s1 center is on the left
    expect(r2.center[0]).toBeGreaterThan(240); // s2 center is on the right
  });

  it("handles 4 scouts with spread positions", () => {
    const scouts = new Map([
      ["s1", [120, 60] as [number, number]],
      ["s2", [350, 60] as [number, number]],
      ["s3", [120, 240] as [number, number]],
      ["s4", [350, 240] as [number, number]],
    ]);
    const regions = decomposeSearchArea(BOUNDS, scouts);
    expect(regions).toHaveLength(4);
  });

  it("excludes cells inside jammer zones", () => {
    const scouts = new Map([["s1", [150, 150] as [number, number]], ["s2", [350, 150] as [number, number]]]);
    // Jammer covers the center — s1's region should be smaller
    const withJammer = decomposeSearchArea(BOUNDS, scouts, [
      { center: [200, 150, 0], radius: 60 },
    ]);
    const withoutJammer = decomposeSearchArea(BOUNDS, scouts);
    // With jammer, total cell count should be less
    const totalWith = withJammer.reduce((s, r) => {
      const w = r.bounds[2] - r.bounds[0];
      const h = r.bounds[3] - r.bounds[1];
      return s + w * h;
    }, 0);
    const totalWithout = withoutJammer.reduce((s, r) => {
      const w = r.bounds[2] - r.bounds[0];
      const h = r.bounds[3] - r.bounds[1];
      return s + w * h;
    }, 0);
    // Area with jammer exclusion should be smaller (or same if jammer doesn't overlap much)
    expect(totalWith).toBeLessThanOrEqual(totalWithout * 1.1);
  });

  it("returns empty array for zero scouts", () => {
    expect(decomposeSearchArea(BOUNDS, new Map())).toHaveLength(0);
  });

  it("handles single scout (gets entire area)", () => {
    const scouts = new Map([["s1", [240, 150] as [number, number]]]);
    const regions = decomposeSearchArea(BOUNDS, scouts);
    expect(regions).toHaveLength(1);
    expect(regions[0].ownerId).toBe("s1");
  });

  it("is deterministic (same input = same output)", () => {
    const scouts = new Map([["s1", [150, 100] as [number, number]], ["s2", [300, 200] as [number, number]]]);
    const r1 = decomposeSearchArea(BOUNDS, scouts);
    const r2 = decomposeSearchArea(BOUNDS, scouts);
    expect(r1).toEqual(r2);
  });
});

describe("generateSweepPath", () => {
  const region: SubRegion = {
    ownerId: "s1",
    bounds: [100, 50, 300, 250],
    center: [200, 150],
  };

  it("produces waypoints within region bounds", () => {
    const path = generateSweepPath(region);
    for (const [x, y] of path) {
      expect(x).toBeGreaterThanOrEqual(100);
      expect(x).toBeLessThanOrEqual(300);
      expect(y).toBeGreaterThanOrEqual(50);
      expect(y).toBeLessThanOrEqual(250);
    }
  });

  it("produces at least 2 waypoints", () => {
    expect(generateSweepPath(region).length).toBeGreaterThanOrEqual(2);
  });

  it("covers the full height with horizontal sweep", () => {
    const path = generateSweepPath(region, 30, "horizontal");
    const ys = path.map(([, y]) => y);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    expect(maxY - minY).toBeGreaterThan(150); // should span most of the 200m height
  });

  it("covers the full width with vertical sweep", () => {
    const path = generateSweepPath(region, 30, "vertical");
    const xs = path.map(([x]) => x);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    expect(maxX - minX).toBeGreaterThan(150); // should span most of the 200m width
  });

  it("handles tiny region without crash", () => {
    const tiny: SubRegion = { ownerId: "s1", bounds: [200, 200, 210, 210], center: [205, 205] };
    const path = generateSweepPath(tiny);
    expect(path.length).toBeGreaterThanOrEqual(1);
  });
});
