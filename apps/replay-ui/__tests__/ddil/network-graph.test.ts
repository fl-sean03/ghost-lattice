import { describe, it, expect } from "vitest";
import { findPartitions, computeNetwork } from "@/sim/ddil/network-graph";

describe("findPartitions", () => {
  it("single partition when all connected", () => {
    const p = findPartitions(["a", "b", "c"], [["a", "b"], ["b", "c"]]);
    expect(p).toHaveLength(1);
    expect(p[0].sort()).toEqual(["a", "b", "c"]);
  });
  it("two partitions when disconnected", () => {
    const p = findPartitions(["a", "b", "c", "d"], [["a", "b"], ["c", "d"]]);
    expect(p).toHaveLength(2);
  });
  it("isolated node forms own partition", () => {
    const p = findPartitions(["a", "b", "c"], [["a", "b"]]);
    expect(p).toHaveLength(2);
  });
  it("no edges = all isolated", () => {
    const p = findPartitions(["a", "b", "c"], []);
    expect(p).toHaveLength(3);
  });
  it("handles empty graph", () => {
    expect(findPartitions([], [])).toHaveLength(0);
  });
});

describe("computeNetwork", () => {
  it("close vehicles are connected", () => {
    const r = computeNetwork([
      { id: "v1", position: [0, 0, 0], comms_range: 800 },
      { id: "v2", position: [10, 0, 0], comms_range: 800 },
    ]);
    expect(r.partition_count).toBe(1);
    expect(r.edges[0].active).toBe(true);
    expect(r.edges[0].quality).toBeGreaterThan(0.9);
  });
  it("far vehicles are disconnected", () => {
    const r = computeNetwork([
      { id: "v1", position: [0, 0, 0], comms_range: 100 },
      { id: "v2", position: [500, 0, 0], comms_range: 100 },
    ]);
    expect(r.partition_count).toBe(2);
    expect(r.edges[0].active).toBe(false);
  });
  it("jammer degrades nearby links", () => {
    const jammer = { center: [25, 0, 0] as [number, number, number], radius_m: 100, active: true };
    const r = computeNetwork(
      [{ id: "v1", position: [0, 0, 30], comms_range: 800 }, { id: "v2", position: [50, 0, 30], comms_range: 800 }],
      [], [jammer],
    );
    expect(r.edges[0].quality).toBeLessThan(0.9);
  });
  it("handles 6-vehicle fleet", () => {
    const vehicles = [
      { id: "a1", position: [50, 25, 30] as [number, number, number], comms_range: 800 },
      { id: "a2", position: [100, 0, 30] as [number, number, number], comms_range: 800 },
      { id: "b1", position: [0, 100, 25] as [number, number, number], comms_range: 600 },
      { id: "b2", position: [150, 100, 25] as [number, number, number], comms_range: 600 },
      { id: "c1", position: [50, 50, 35] as [number, number, number], comms_range: 1000 },
      { id: "c2", position: [200, 50, 30] as [number, number, number], comms_range: 1000 },
    ];
    const r = computeNetwork(vehicles);
    expect(r.partition_count).toBe(1);
    expect(r.edges).toHaveLength(15); // 6 choose 2
  });
});
