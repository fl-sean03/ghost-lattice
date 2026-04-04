import { describe, it, expect } from "vitest";
import { SimEngine } from "@/sim/engine";
import { DEFAULT_CONFIG } from "@/sim/config";

describe("Event Log Correctness", () => {
  it("events are in chronological order", () => {
    const e = new SimEngine(DEFAULT_CONFIG);
    e.start();
    for (let i = 0; i < 500; i++) e.step();
    const events = e.events;
    for (let i = 1; i < events.length; i++) {
      expect(events[i].time).toBeGreaterThanOrEqual(events[i - 1].time);
    }
  });

  it("initial role assignment produces role_change events for all vehicles", () => {
    const e = new SimEngine(DEFAULT_CONFIG);
    e.start();
    e.step();
    const roleEvents = e.events.filter(ev => ev.type === "role_change");
    expect(roleEvents.length).toBeGreaterThanOrEqual(DEFAULT_CONFIG.fleet.length);
  });

  it("every kill produces exactly one node_loss event", () => {
    const e = new SimEngine(DEFAULT_CONFIG);
    e.start();
    for (let i = 0; i < 10; i++) e.step();
    e.killDrone("alpha_1");
    e.killDrone("bravo_1");
    e.killDrone("charlie_1");
    for (let i = 0; i < 5; i++) e.step();
    const killEvents = e.events.filter(ev => ev.type === "node_loss");
    expect(killEvents).toHaveLength(3);
    expect(killEvents.map(ev => ev.entity).sort()).toEqual(["alpha_1", "bravo_1", "charlie_1"]);
  });

  it("no event has undefined type", () => {
    const e = new SimEngine(DEFAULT_CONFIG);
    e.start();
    for (let i = 0; i < 500; i++) e.step();
    e.injectJammer([200, 150, 0]);
    e.killDrone("alpha_1");
    for (let i = 0; i < 50; i++) e.step();
    for (const ev of e.events) {
      expect(ev.type).toBeTruthy();
      expect(typeof ev.type).toBe("string");
    }
  });

  it("disruption events emitted for each jammer and GPS zone", () => {
    const e = new SimEngine(DEFAULT_CONFIG);
    e.start();
    e.step();
    e.injectJammer([100, 100, 0]);
    e.injectJammer([200, 200, 0]);
    e.injectGPSZone([300, 100, 0]);
    const disruptions = e.events.filter(ev => ev.type === "disruption");
    expect(disruptions).toHaveLength(3);
  });

  it("event count grows when interactions occur", () => {
    const e = new SimEngine(DEFAULT_CONFIG);
    e.start();
    for (let i = 0; i < 100; i++) e.step();
    const n1 = e.events.length;
    // Inject interactions to generate events
    e.injectJammer([200, 150, 0]);
    e.killDrone("bravo_2");
    for (let i = 0; i < 50; i++) e.step();
    expect(e.events.length).toBeGreaterThan(n1);
  });

  it("battery RTH event precedes role change to return_anchor", () => {
    // Run long enough for battery to drain
    const e = new SimEngine(DEFAULT_CONFIG);
    e.start();
    for (let i = 0; i < 3000; i++) e.step(); // 300s, scouts drain ~36%
    const batteryEvents = e.events.filter(ev => ev.type === "battery");
    // If any drone hit RTH threshold, verify event ordering
    if (batteryEvents.length > 0) {
      const firstBat = batteryEvents[0];
      // There should be no return_anchor assignment BEFORE this battery event
      const priorRth = e.events.filter(ev =>
        ev.type === "role_change" && ev.entity === firstBat.entity &&
        ev.detail.includes("return_anchor") && ev.time < firstBat.time
      );
      expect(priorRth).toHaveLength(0);
    }
  });
});
