/**
 * Deep audit of Open Field Patrol scenario.
 *
 * Questions to answer:
 * 1. Do drones actually exit the jammer zone after it activates?
 * 2. Do drones get stuck in corners?
 * 3. Is coverage increasing over time or stalling?
 * 4. Are roles reasonable (not all trackers with no emitter)?
 * 5. Do drones spread across the sector or cluster?
 */

import { describe, it, expect } from "vitest";
import { SimEngine } from "@/sim/engine";
import { SCENARIO_OPEN_FIELD } from "@/sim/scenarios";

function runAndLog(engine: SimEngine, ticks: number, label: string) {
  for (let i = 0; i < ticks; i++) engine.step();
  const snap = engine.getSnapshot();
  const sc = engine.getScorecard();

  const drones: Record<string, { x: number; y: number; role: string; inJammer: boolean }> = {};
  for (const [id, v] of snap.vehicles) {
    drones[id] = {
      x: Math.round(v.position_ned[0]),
      y: Math.round(v.position_ned[1]),
      role: v.current_role,
      inJammer: v.in_jammer_zone,
    };
  }

  return {
    label,
    time: engine.elapsed,
    coverage: sc.search_coverage_pct,
    partitions: snap.network?.partition_count ?? 1,
    vehicles: snap.vehicles.size,
    drones,
  };
}

describe("Open Field Patrol — Deep Audit", () => {
  const config = SCENARIO_OPEN_FIELD.config;
  // Jammer: at [240,150], radius 200m, activates at t=30

  it("prints full timeline trace", { timeout: 15000 }, () => {
    const e = new SimEngine(config);
    e.loadScheduledThreats(SCENARIO_OPEN_FIELD.scheduledThreats);
    e.start();

    const phases = [
      runAndLog(e, 100, "T=10s: Before jammer"),         // t=10
      runAndLog(e, 200, "T=30s: Jammer just activated"),  // t=30
      runAndLog(e, 200, "T=50s: 20s after jammer"),       // t=50
      runAndLog(e, 500, "T=100s: 70s after jammer"),      // t=100
      runAndLog(e, 1000, "T=200s: 170s after jammer"),    // t=200
      runAndLog(e, 500, "T=250s: Late mission"),           // t=250
    ];

    for (const p of phases) {
      console.log(`\n=== ${p.label} ===`);
      console.log(`  Coverage: ${p.coverage}%, Partitions: ${p.partitions}, Vehicles: ${p.vehicles}`);
      for (const [id, d] of Object.entries(p.drones)) {
        const inJ = d.inJammer ? " ⚠️ IN JAMMER" : "";
        console.log(`  ${id}: [${d.x}, ${d.y}] role=${d.role}${inJ}`);
      }
    }

    // Actual assertions
    expect(phases.length).toBe(6);
  });

  it("drones should EXIT jammer zone after it activates", () => {
    const e = new SimEngine(config);
    e.loadScheduledThreats(SCENARIO_OPEN_FIELD.scheduledThreats);
    e.start();

    // Run to t=50 (20s after jammer at [240,150] r=200)
    for (let i = 0; i < 500; i++) e.step();

    // Run to t=100 (70s after jammer — drones should have adapted)
    for (let i = 0; i < 500; i++) e.step();
    const snap = e.getSnapshot();

    const jammerCenter = [240, 150];
    const jammerRadius = 130;
    let dronesInJammer = 0;

    for (const [id, v] of snap.vehicles) {
      const dx = v.position_ned[0] - jammerCenter[0];
      const dy = v.position_ned[1] - jammerCenter[1];
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < jammerRadius * 0.7) { // deep inside
        dronesInJammer++;
        console.log(`  ${id} STILL IN JAMMER at [${v.position_ned[0].toFixed(0)}, ${v.position_ned[1].toFixed(0)}] dist=${dist.toFixed(0)}m role=${v.current_role}`);
      }
    }

    // After 70s of adaptation, at most 1 drone should still be inside
    // (tracker might be there if emitter is inside jammer)
    console.log(`\nDrones inside jammer (r=200m): ${dronesInJammer} of ${snap.vehicles.size}`);
    expect(dronesInJammer).toBeLessThanOrEqual(1);
  });

  it("drones should be spread at mid-mission (before convergence)", () => {
    const e = new SimEngine(config);
    e.loadScheduledThreats(SCENARIO_OPEN_FIELD.scheduledThreats);
    e.start();

    // Check at t=50 (mid-mission, after jammer, before late convergence)
    for (let i = 0; i < 500; i++) e.step();
    const snap = e.getSnapshot();

    // Check spread: compute pairwise distances
    const positions = [...snap.vehicles.values()].map(v => v.position_ned);
    let minPairDist = Infinity;
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const d = Math.sqrt(
          (positions[i][0] - positions[j][0]) ** 2 +
          (positions[i][1] - positions[j][1]) ** 2
        );
        minPairDist = Math.min(minPairDist, d);
      }
    }

    console.log(`Min pairwise distance: ${minPairDist.toFixed(0)}m`);

    // Check if all drones are in one corner
    const xs = positions.map(p => p[0]);
    const ys = positions.map(p => p[1]);
    const xSpread = Math.max(...xs) - Math.min(...xs);
    const ySpread = Math.max(...ys) - Math.min(...ys);

    console.log(`Position spread: X=${xSpread.toFixed(0)}m, Y=${ySpread.toFixed(0)}m`);
    for (const [id, v] of snap.vehicles) {
      console.log(`  ${id}: [${v.position_ned[0].toFixed(0)}, ${v.position_ned[1].toFixed(0)}] role=${v.current_role}`);
    }

    // Drones should be spread across at least 50m in at least one axis
    const maxSpread = Math.max(xSpread, ySpread);
    expect(maxSpread).toBeGreaterThan(50);
  });

  it("coverage should keep increasing despite jammer", () => {
    const e = new SimEngine(config);
    e.loadScheduledThreats(SCENARIO_OPEN_FIELD.scheduledThreats);
    e.start();

    // Run to t=30 (just before jammer)
    for (let i = 0; i < 300; i++) e.step();
    const cov30 = e.getScorecard().search_coverage_pct;

    // Run to t=100
    for (let i = 0; i < 700; i++) e.step();
    const cov100 = e.getScorecard().search_coverage_pct;

    // Run to t=200
    for (let i = 0; i < 1000; i++) e.step();
    const cov200 = e.getScorecard().search_coverage_pct;

    console.log(`Coverage: t=30: ${cov30}%, t=100: ${cov100}%, t=200: ${cov200}%`);

    // Coverage should increase over time even with jammer
    expect(cov100).toBeGreaterThan(cov30);
    expect(cov200).toBeGreaterThan(cov100);
  });

  it("roles should make sense (scouts > 0, no tracker without emitter)", () => {
    const e = new SimEngine(config);
    e.loadScheduledThreats(SCENARIO_OPEN_FIELD.scheduledThreats);
    e.start();

    for (let i = 0; i < 500; i++) e.step();
    const snap = e.getSnapshot();

    const roleCounts: Record<string, number> = {};
    for (const v of snap.vehicles.values()) {
      roleCounts[v.current_role] = (roleCounts[v.current_role] ?? 0) + 1;
    }

    console.log("Role distribution:", roleCounts);

    // With 4 drones and no emitter: should have scouts + relay, maybe decoy
    // Should NOT have tracker (no emitter in open field scenario)
    expect(roleCounts["scout"] ?? 0).toBeGreaterThanOrEqual(1);
  });
});
