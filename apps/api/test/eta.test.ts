import { describe, it, expect } from "vitest";
import { computeEtaPlan } from "../src/lib/eta";

describe("computeEtaPlan", () => {
  const dep = { lat: 0, lng: 0 };
  const arr = { lat: 0, lng: 3 }; // ekvatorda 3° boylam ≈ 333.58 km

  it("computes flight time from distance at 463 km/h plus 20 min buffer", () => {
    const plan = computeEtaPlan(dep, arr, "2026-07-04T10:00:00Z");
    expect(plan.distanceKm).toBeCloseTo(333.58, 0);
    expect(plan.estFlightMin).toBe(63); // round(333.58/463*60 + 20)
    expect(plan.etdUtc).toBe("2026-07-04T10:00:00.000Z");
    expect(plan.etaUtc).toBe("2026-07-04T11:03:00.000Z");
  });

  it("defaults ETD to now when not provided", () => {
    const before = Date.now();
    const plan = computeEtaPlan(dep, arr);
    const etd = new Date(plan.etdUtc).getTime();
    expect(etd).toBeGreaterThanOrEqual(before - 1000);
    expect(etd).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it("falls back to now for an invalid ETD string", () => {
    const plan = computeEtaPlan(dep, arr, "not-a-date");
    expect(Number.isNaN(new Date(plan.etdUtc).getTime())).toBe(false);
  });

  it("handles zero distance (same airport) with buffer only", () => {
    const plan = computeEtaPlan(dep, dep, "2026-07-04T10:00:00Z");
    expect(plan.estFlightMin).toBe(20);
  });
});
