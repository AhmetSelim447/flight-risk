import { describe, it, expect } from "vitest";
import { riskScore, windComponents } from "../src/lib/risk";

describe("windComponents", () => {
  it("computes pure headwind when wind aligned with runway", () => {
    const { head, cross } = windComponents(270, 270, 20);
    expect(head).toBe(20);
    expect(cross).toBe(0);
  });

  it("computes pure crosswind at 90 degrees", () => {
    const { head, cross } = windComponents(270, 180, 20);
    expect(head).toBe(0);
    expect(cross).toBe(20);
  });

  it("returns zeros when wind data missing", () => {
    expect(windComponents(270, undefined, undefined)).toEqual({ head: 0, cross: 0 });
  });
});

describe("riskScore (characterization)", () => {
  it("scores CAVOK calm conditions as green with score 0", () => {
    const r = riskScore({ vis: 9999, ceiling: undefined, wx: [], head: 10, cross: 2, notamCritical: 0 });
    expect(r.score).toBe(0);
    expect(r.class).toBe("green");
  });

  it("scores low vis + low ceiling + fog heavily", () => {
    const r = riskScore({ vis: 800, ceiling: 200, wx: ["FG"], head: 5, cross: 3, notamCritical: 0 });
    // vis<1500 → 28, ceiling<600 → 24, wx present → 2, combo vis<3000+ceiling<1000 → 6
    expect(r.score).toBe(60);
    expect(r.reasons).toContain("Düşük görüş");
    expect(r.reasons).toContain("Düşük tavan");
  });

  it("scores crosswind above limit", () => {
    const r = riskScore({ vis: 9999, wx: [], head: 0, cross: 18, crossLimit: 15, notamCritical: 0 });
    // ratio 1.2 → "> 1.0" branch → 22
    expect(r.score).toBe(22);
    expect(r.reasons.some((x) => x.includes("Crosswind limit üstünde"))).toBe(true);
  });

  it("scores convective weather", () => {
    const r = riskScore({ vis: 9999, wx: ["TS", "RA"], head: 10, cross: 0, notamCritical: 0 });
    expect(r.score).toBe(18);
    expect(r.reasons).toContain("Konvektif hava olayı");
  });

  it("uses default crosswind limit 15 when not provided", () => {
    const a = riskScore({ vis: 9999, wx: [], head: 0, cross: 13, notamCritical: 0 });
    // 13/15 = 0.867 → ">= 0.85" branch → 12
    expect(a.score).toBe(12);
  });
});
