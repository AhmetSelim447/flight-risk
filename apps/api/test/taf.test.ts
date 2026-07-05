import { describe, it, expect } from "vitest";
import { parseTafConditionsAt } from "../src/lib/taf";

// Gerçekçi LTFM tarzı TAF: gündüz iyi, akşam BECMG ile bozulma, gece TEMPO sis
const TAF_FOG =
  "TAF LTFM 040800Z 0409/0515 24012KT 9999 SCT035 " +
  "BECMG 0418/0420 VRB03KT 4000 BR BKN008 " +
  "TEMPO 0500/0506 0800 FG VV002 " +
  "BECMG 0508/0510 15008KT 9999 SCT030";
const ISSUED = "2026-07-04T08:00:00Z";

const TAF_TS =
  "TAF LTAC 041000Z 0412/0518 21010KT 9999 SCT040 " +
  "TEMPO 0415/0420 VRB15G25KT 3000 TSRA BKN010CB";
const TS_ISSUED = "2026-07-04T10:00:00Z";

describe("parseTafConditionsAt", () => {
  it("returns base conditions during the initial clean period", () => {
    const c = parseTafConditionsAt(TAF_FOG, ISSUED, "2026-07-04T12:00:00Z");
    expect(c).not.toBeNull();
    expect(c!.vis).toBe(9999);
    expect(c!.ceiling).toBeUndefined(); // SCT tavan sayılmaz
    expect(c!.wind_spd).toBe(12);
    expect(c!.wind_dir).toBe(240);
  });

  it("applies BECMG deterioration after the change window", () => {
    const c = parseTafConditionsAt(TAF_FOG, ISSUED, "2026-07-04T22:00:00Z");
    expect(c).not.toBeNull();
    expect(c!.vis).toBe(4000);
    expect(c!.ceiling).toBe(800); // BKN008
    expect(c!.wx).toContain("BR");
  });

  it("merges TEMPO pessimistically inside its window (fog + vertical visibility)", () => {
    const c = parseTafConditionsAt(TAF_FOG, ISSUED, "2026-07-05T03:00:00Z");
    expect(c).not.toBeNull();
    expect(c!.vis).toBe(800);      // min(4000, 800)
    expect(c!.ceiling).toBe(200);  // min(BKN008=800, VV002=200)
    expect(c!.wx).toContain("FG");
    expect(c!.pessimistic).toBe(true);
  });

  it("does not apply TEMPO outside its window", () => {
    // TEMPO 0500/0506 bitti, ikinci BECMG 0508/0510 henüz başlamadı → BECMG-1 dönemi (4000)
    const c = parseTafConditionsAt(TAF_FOG, ISSUED, "2026-07-05T07:00:00Z");
    expect(c).not.toBeNull();
    expect(c!.vis).toBe(4000);
  });

  it("captures thunderstorm TEMPO with gusting wind", () => {
    const c = parseTafConditionsAt(TAF_TS, TS_ISSUED, "2026-07-04T17:00:00Z");
    expect(c).not.toBeNull();
    expect(c!.vis).toBe(3000);
    expect(c!.wx?.join(" ")).toMatch(/TS/);
    expect(c!.gust).toBe(25);
    expect(c!.ceiling).toBe(1000); // BKN010CB
  });

  it("returns null when the requested time is outside TAF validity", () => {
    const c = parseTafConditionsAt(TAF_FOG, ISSUED, "2026-07-06T12:00:00Z");
    expect(c).toBeNull();
  });

  it("returns null for garbage input instead of throwing", () => {
    expect(parseTafConditionsAt("NOT A TAF", ISSUED, "2026-07-04T12:00:00Z")).toBeNull();
  });
});
