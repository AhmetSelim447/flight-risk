import { describe, it, expect } from "vitest";
import { computeRouteRisk } from "../src/lib/brief-risk";

const DEP = { icao: "LTFM", coords: { lat: 41.26, lng: 28.74 }, runways: [{ id: "16L", heading: 160 }] };
const ARR = { icao: "LTAC", coords: { lat: 40.13, lng: 32.99 }, runways: [{ id: "03R", heading: 30 }] };

const TAF_ARR_FOG =
  "TAF LTAC 040800Z 0409/0515 24005KT 9999 SCT035 " +
  "BECMG 0418/0420 VRB02KT 4000 BR BKN008 " +
  "TEMPO 0500/0506 0800 FG VV002";

function baseInput(overrides: Partial<Parameters<typeof computeRouteRisk>[0]> = {}) {
  return {
    dep: DEP,
    arr: ARR,
    depMetar: { parsed: { wind_dir: 160, wind_spd: 8, vis: 9999, wx: [] as string[] }, issuedAtIso: "2026-07-04T09:20:00Z" },
    arrMetar: { parsed: { wind_dir: 30, wind_spd: 5, vis: 9999, wx: [] as string[] }, issuedAtIso: "2026-07-04T09:20:00Z" },
    depTafRaw: null as string | null,
    depTafIssuedIso: null as string | null,
    arrTafRaw: null as string | null,
    arrTafIssuedIso: null as string | null,
    depCriticalNotams: 0,
    arrCriticalNotams: 0,
    crossLimit: 15,
    etdIso: "2026-07-04T10:00:00Z",
    ...overrides,
  };
}

describe("computeRouteRisk", () => {
  it("scores a clean route green with two green legs", () => {
    const r = computeRouteRisk(baseInput());
    expect(r.class).toBe("green");
    expect(r.legs.dep.class).toBe("green");
    expect(r.legs.arr.class).toBe("green");
    expect(r.legs.arr.conditionsSource).toBe("metar");
    expect(r.degraded).toBe(false);
  });

  it("uses arrival TAF window at ETA instead of current arrival METAR", () => {
    // ETD 04 Temmuz 23:30Z → LTFM-LTAC ~360km → ETA ~00:37Z, TEMPO sis penceresinin (0500-0506) içinde
    const r = computeRouteRisk(
      baseInput({
        arrTafRaw: TAF_ARR_FOG,
        arrTafIssuedIso: "2026-07-04T08:00:00Z",
        etdIso: "2026-07-04T23:30:00Z",
      })
    );
    expect(r.legs.arr.conditionsSource).toBe("taf");
    expect(r.legs.arr.conditions.vis).toBe(800);
    expect(r.legs.arr.conditions.ceiling).toBe(200);
    // ARR bacağı ağır: vis 28 + ceiling 24 + wx 2-6 + combo 6 → red bölgesi
    expect(r.legs.arr.class).toBe("red");
    expect(r.class).toBe("red");
    // Sebepler ARR önekiyle gelmeli
    expect(r.reasons.some((x) => x.startsWith("ARR:"))).toBe(true);
  });

  it("worst leg dominates the combined score", () => {
    const r = computeRouteRisk(
      baseInput({
        depMetar: { parsed: { wind_dir: 250, wind_spd: 20, vis: 2500, wx: ["RA"] }, issuedAtIso: "2026-07-04T09:20:00Z" },
      })
    );
    const worst = Math.max(r.legs.dep.score, r.legs.arr.score);
    const other = Math.min(r.legs.dep.score, r.legs.arr.score);
    expect(r.score).toBe(Math.min(100, worst + Math.round(other * 0.25)));
    expect(r.score).toBeGreaterThanOrEqual(worst);
  });

  it("splits NOTAM counts per leg instead of double-counting", () => {
    const r = computeRouteRisk(baseInput({ depCriticalNotams: 0, arrCriticalNotams: 2 }));
    expect(r.legs.dep.reasons.every((x) => !x.includes("NOTAM"))).toBe(true);
    expect(r.legs.arr.reasons.some((x) => x.includes("NOTAM"))).toBe(true);
  });

  it("propagates single-factor floors to the combined class", () => {
    const r = computeRouteRisk(
      baseInput({
        // DEP pist 160, rüzgar 250'den 18kt → cross ≈ 18kt > 15 limit, skor yellow eşiğin altında kalabilir
        depMetar: { parsed: { wind_dir: 250, wind_spd: 18, vis: 9999, wx: [] }, issuedAtIso: "2026-07-04T09:20:00Z" },
      })
    );
    expect(r.legs.dep.floors.length).toBeGreaterThan(0);
    expect(r.class === "yellow" || r.class === "red").toBe(true);
  });

  it("marks route degraded when arrival has neither TAF nor METAR", () => {
    const r = computeRouteRisk(baseInput({ arrMetar: null }));
    expect(r.degraded).toBe(true);
    expect(r.legs.arr.conditionsSource).toBe("none");
    expect(r.reasons.some((x) => x.includes("ARR koşul verisi eksik"))).toBe(true);
  });

  it("merges DEP METAR with DEP TAF at ETD pessimistically", () => {
    const depTaf =
      "TAF LTFM 040800Z 0409/0515 24012KT 9999 SCT035 TEMPO 0409/0415 3000 SHRA BKN012";
    const r = computeRouteRisk(
      baseInput({ depTafRaw: depTaf, depTafIssuedIso: "2026-07-04T08:00:00Z" })
    );
    // METAR vis 9999 ama ETD 10:00Z TEMPO içinde → kötümser vis 3000
    expect(r.legs.dep.conditionsSource).toBe("metar+taf");
    expect(r.legs.dep.conditions.vis).toBe(3000);
    expect(r.legs.dep.conditions.wx).toContain("SHRA");
  });
});
