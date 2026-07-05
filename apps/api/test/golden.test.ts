import { describe, it, expect } from "vitest";
import { computeRouteRisk, RouteRiskInput } from "../src/lib/brief-risk";

const LTFM = { icao: "LTFM", coords: { lat: 41.26, lng: 28.74 }, runways: [{ id: "16L", heading: 160 }, { id: "34R", heading: 340 }] };
const LTAC = { icao: "LTAC", coords: { lat: 40.13, lng: 32.99 }, runways: [{ id: "03R", heading: 30 }, { id: "21L", heading: 210 }] };

type Scenario = {
  name: string;
  input: RouteRiskInput;
  expectClass: "green" | "yellow" | "red";
  expectReasonPattern?: RegExp;
};

const metar = (parsed: any) => ({ parsed, issuedAtIso: "2026-07-04T09:20:00Z" });

const scenarios: Scenario[] = [
  {
    name: "sakin CAVOK rota → green",
    input: {
      dep: LTFM, arr: LTAC,
      depMetar: metar({ wind_dir: 160, wind_spd: 8, vis: 9999, wx: [] }),
      arrMetar: metar({ wind_dir: 30, wind_spd: 6, vis: 9999, wx: [] }),
      depTafRaw: null, depTafIssuedIso: null, arrTafRaw: null, arrTafIssuedIso: null,
      depCriticalNotams: 0, arrCriticalNotams: 0, crossLimit: 15,
      etdIso: "2026-07-04T10:00:00Z",
    },
    expectClass: "green",
  },
  {
    name: "varista ETA'da TEMPO sis → red",
    input: {
      dep: LTFM, arr: LTAC,
      depMetar: metar({ wind_dir: 160, wind_spd: 8, vis: 9999, wx: [] }),
      arrMetar: metar({ wind_dir: 30, wind_spd: 5, vis: 9999, wx: [] }),
      depTafRaw: null, depTafIssuedIso: null,
      arrTafRaw:
        "TAF LTAC 040800Z 0409/0515 24005KT 9999 SCT035 BECMG 0418/0420 VRB02KT 4000 BR BKN008 TEMPO 0500/0506 0800 FG VV002",
      arrTafIssuedIso: "2026-07-04T08:00:00Z",
      depCriticalNotams: 0, arrCriticalNotams: 0, crossLimit: 15,
      etdIso: "2026-07-04T23:30:00Z",
    },
    expectClass: "red",
    expectReasonPattern: /ARR:.*(görüş|tavan)/i,
  },
  {
    name: "ayni rota gunduz ucusu (sis penceresi disi) → green",
    input: {
      dep: LTFM, arr: LTAC,
      depMetar: metar({ wind_dir: 160, wind_spd: 8, vis: 9999, wx: [] }),
      arrMetar: metar({ wind_dir: 30, wind_spd: 5, vis: 9999, wx: [] }),
      depTafRaw: null, depTafIssuedIso: null,
      arrTafRaw:
        "TAF LTAC 040800Z 0409/0515 24005KT 9999 SCT035 BECMG 0418/0420 VRB02KT 4000 BR BKN008 TEMPO 0500/0506 0800 FG VV002",
      arrTafIssuedIso: "2026-07-04T08:00:00Z",
      depCriticalNotams: 0, arrCriticalNotams: 0, crossLimit: 15,
      etdIso: "2026-07-04T10:00:00Z", // ETA ~11:07Z, temiz baz dönem
    },
    expectClass: "green",
  },
  {
    name: "kalkista limit ustu crosswind, dusuk toplam skor → en az yellow (floor)",
    input: {
      dep: LTFM, arr: LTAC,
      depMetar: metar({ wind_dir: 250, wind_spd: 18, vis: 9999, wx: [] }),
      arrMetar: metar({ wind_dir: 30, wind_spd: 5, vis: 9999, wx: [] }),
      depTafRaw: null, depTafIssuedIso: null, arrTafRaw: null, arrTafIssuedIso: null,
      depCriticalNotams: 0, arrCriticalNotams: 0, crossLimit: 15,
      etdIso: "2026-07-04T10:00:00Z",
    },
    expectClass: "yellow",
    expectReasonPattern: /DEP:.*Crosswind/,
  },
  {
    name: "varis verisi tamamen eksik → asla green degil",
    input: {
      dep: LTFM, arr: LTAC,
      depMetar: metar({ wind_dir: 160, wind_spd: 8, vis: 9999, wx: [] }),
      arrMetar: null,
      depTafRaw: null, depTafIssuedIso: null, arrTafRaw: null, arrTafIssuedIso: null,
      depCriticalNotams: 0, arrCriticalNotams: 0, crossLimit: 15,
      etdIso: "2026-07-04T10:00:00Z",
    },
    expectClass: "yellow",
    expectReasonPattern: /ARR koşul verisi eksik/,
  },
  {
    name: "varista ETA'da TEMPO TSRA → en az yellow, konvektif sebep",
    input: {
      dep: LTFM, arr: LTAC,
      depMetar: metar({ wind_dir: 160, wind_spd: 8, vis: 9999, wx: [] }),
      arrMetar: metar({ wind_dir: 30, wind_spd: 5, vis: 9999, wx: [] }),
      depTafRaw: null, depTafIssuedIso: null,
      arrTafRaw:
        "TAF LTAC 041000Z 0412/0518 21010KT 9999 SCT040 TEMPO 0415/0420 VRB15G25KT 3000 TSRA BKN010CB",
      arrTafIssuedIso: "2026-07-04T10:00:00Z",
      depCriticalNotams: 0, arrCriticalNotams: 0, crossLimit: 15,
      etdIso: "2026-07-04T16:00:00Z", // ETA ~17:07Z, TEMPO içinde
    },
    expectClass: "yellow",
    expectReasonPattern: /ARR:.*[Kk]onvektif/,
  },
  {
    name: "her iki bacak agir (dusuk vis + kritik NOTAMlar) → red",
    input: {
      dep: LTFM, arr: LTAC,
      depMetar: metar({ wind_dir: 160, wind_spd: 10, vis: 2000, ceiling: 800, wx: ["BR"] }),
      arrMetar: metar({ wind_dir: 30, wind_spd: 8, vis: 2500, ceiling: 900, wx: ["RA"] }),
      depTafRaw: null, depTafIssuedIso: null, arrTafRaw: null, arrTafIssuedIso: null,
      depCriticalNotams: 2, arrCriticalNotams: 1, crossLimit: 15,
      etdIso: "2026-07-04T10:00:00Z",
    },
    expectClass: "red",
  },
];

describe("golden scenarios", () => {
  for (const s of scenarios) {
    it(s.name, () => {
      const r = computeRouteRisk(s.input);

      // Sınıf sıralaması üzerinden "en az" kontrolü: green < yellow < red
      const order = { green: 0, yellow: 1, red: 2 } as const;
      expect(order[r.class]).toBeGreaterThanOrEqual(order[s.expectClass]);

      // green beklenen senaryo yellow/red çıkarsa bu gerçek bir regresyondur:
      if (s.expectClass === "green") {
        expect(r.class).toBe("green");
      }

      if (s.expectReasonPattern) {
        expect(r.reasons.some((x) => s.expectReasonPattern!.test(x))).toBe(true);
      }
    });
  }
});
