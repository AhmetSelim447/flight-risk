// apps/api/src/lib/notam.simulated.ts

import type { NotamContext, NotamItem, NotamProvider, NotamTemplate } from "./notam.types";

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeIcao(input: string): string {
  return String(input || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 4);
}

function isValidIcao(icao: string): boolean {
  return /^[A-Z]{4}$/.test(icao);
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function uniqueByKey<T>(items: T[], getKey: (x: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = getKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function rotatePick<T>(items: T[], count: number, seed: number): T[] {
  if (!items.length || count <= 0) return [];
  const out: T[] = [];
  const start = seed % items.length;

  for (let i = 0; i < Math.min(count, items.length); i++) {
    out.push(items[(start + i) % items.length]);
  }

  return out;
}

function isTurkiyeAirport(icao: string): boolean {
  return icao.startsWith("LT");
}

function isMajorAirport(icao: string): boolean {
  return ["LTFM", "LTAC", "LTBA", "LTAI", "LTBJ", "LTBS"].includes(icao);
}

function isEasternAirport(icao: string): boolean {
  return /^(LTCA|LTCC|LTCK|LTCR|LTCT|LTCE|LTCD|LTCP|LTFO)$/.test(icao);
}

function isCoastalAirport(icao: string): boolean {
  return /^(LTAI|LTBJ|LTBS|LTFE|LTAJ|LTBQ|LTCJ)$/.test(icao);
}

function utcContext(now: Date) {
  return {
    hour: now.getUTCHours(),
    day: now.getUTCDate(),
    month: now.getUTCMonth() + 1,
  };
}

const COMMON_POOL: NotamTemplate[] = [
  {
    key: "bird",
    text: "Bird activity reported in vicinity of aerodrome. Exercise caution during takeoff and landing.",
    critical: false,
  },
  {
    key: "tx-light",
    text: "Taxiway edge lighting partially unserviceable on secondary taxi routes.",
    critical: false,
  },
  {
    key: "apron",
    text: "Apron stand restrictions in effect due ground equipment positioning.",
    critical: false,
  },
  {
    key: "works",
    text: "Maintenance activity in progress on non-movement area adjacent to apron.",
    critical: false,
  },
  {
    key: "marshaller",
    text: "Follow marshaller guidance on selected stands due temporary layout change.",
    critical: false,
  },
];

const MAJOR_POOL: NotamTemplate[] = [
  {
    key: "dep-delay",
    text: "Short departure delays possible due runway inspection windows.",
    critical: true,
  },
  {
    key: "apron-cong",
    text: "Peak-hour apron congestion expected. Startup and pushback delays possible.",
    critical: false,
  },
  {
    key: "flow",
    text: "ATC flow measures may apply during peak traffic periods.",
    critical: false,
  },
  {
    key: "arr-seq",
    text: "Extended arrival sequencing possible due dense traffic demand.",
    critical: false,
  },
];

const EASTERN_POOL: NotamTemplate[] = [
  {
    key: "terrain-turb",
    text: "Moderate terrain-induced turbulence possible in terminal area.",
    critical: false,
  },
  {
    key: "llws",
    text: "Low level windshear reported by recent arrivals and departures.",
    critical: true,
  },
  {
    key: "icing",
    text: "Moderate icing reported in climb/descent layers in surrounding area.",
    critical: true,
  },
];

const COASTAL_POOL: NotamTemplate[] = [
  {
    key: "seabreeze",
    text: "Sea breeze may cause sudden wind shifts near final approach path.",
    critical: true,
  },
  {
    key: "humid-vis",
    text: "Morning humidity and haze may reduce visibility in coastal sector.",
    critical: false,
  },
  {
    key: "crosswind",
    text: "Localized crosswind fluctuations possible due shoreline wind transition.",
    critical: true,
  },
];

const NAV_POOL: NotamTemplate[] = [
  {
    key: "ils",
    text: "ILS unavailable on one runway direction until further notice.",
    critical: true,
  },
  {
    key: "papi",
    text: "PAPI unavailable for one runway direction. Visual approach guidance reduced.",
    critical: true,
  },
  {
    key: "vor",
    text: "VOR/DME intermittent signal fluctuation reported. Monitor raw data.",
    critical: false,
  },
  {
    key: "gnss",
    text: "Possible GNSS interference may be experienced intermittently in terminal area.",
    critical: true,
  },
];

const OPS_POOL: NotamTemplate[] = [
  {
    key: "rwy-surface",
    text: "Runway surface treatment or inspection in progress. Minor operational delay possible.",
    critical: true,
  },
  {
    key: "twy-closure",
    text: "Portion of parallel taxiway closed due maintenance activity.",
    critical: false,
  },
  {
    key: "stand-closure",
    text: "Selected parking stands unavailable due apron inspection.",
    critical: false,
  },
  {
    key: "follow-me",
    text: "Follow-me guidance may be required on selected taxi routes.",
    critical: false,
  },
];

const NIGHT_POOL: NotamTemplate[] = [
  {
    key: "night-lighting",
    text: "Night airfield lighting maintenance in progress on selected segments.",
    critical: false,
  },
  {
    key: "night-works",
    text: "Overnight works may affect normal taxi routing after 2200Z.",
    critical: false,
  },
];

const WINTER_POOL: NotamTemplate[] = [
  {
    key: "winter-ops",
    text: "Winter operations in effect. De-icing coordination may affect turnaround time.",
    critical: false,
  },
  {
    key: "snow-ice",
    text: "Possible snow or ice contamination assessment required during adverse weather periods.",
    critical: true,
  },
];

const GENERAL_WEATHER_POOL: NotamTemplate[] = [
  {
    key: "windshear",
    text: "Windshear advisory in force in terminal area.",
    critical: true,
  },
  {
    key: "turbulence",
    text: "Moderate turbulence reported on approach or departure corridor.",
    critical: false,
  },
  {
    key: "braking",
    text: "Braking action may be reduced during precipitation periods.",
    critical: true,
  },
];

function buildPool(ctx: NotamContext): NotamTemplate[] {
  const { icao, now } = ctx;
  const { hour, month } = utcContext(now);

  const pool: NotamTemplate[] = [];

  pool.push(...COMMON_POOL);
  pool.push(...NAV_POOL);
  pool.push(...OPS_POOL);

  if (isTurkiyeAirport(icao)) {
    pool.push({
      key: "mil-area",
      text: "Temporary military activity may affect nearby controlled airspace segments.",
      critical: false,
    });
  }

  if (isMajorAirport(icao)) pool.push(...MAJOR_POOL);
  if (isEasternAirport(icao)) pool.push(...EASTERN_POOL);
  if (isCoastalAirport(icao)) pool.push(...COASTAL_POOL);

  if (hour >= 19 || hour <= 4) {
    pool.push(...NIGHT_POOL);
  }

  if (month >= 11 || month <= 3) {
    pool.push(...WINTER_POOL);
  } else {
    pool.push(...GENERAL_WEATHER_POOL);
  }

  if (icao === "LTFM") {
    pool.push(
      {
        key: "ltfm-flow",
        text: "Dense arrival and departure flow expected. Sequencing delay possible on peak banks.",
        critical: false,
      },
      {
        key: "ltfm-rwy",
        text: "One runway subject to short-notice inspection occupancy windows.",
        critical: true,
      }
    );
  }

  if (icao === "LTAC") {
    pool.push(
      {
        key: "ltac-papi",
        text: "PAPI unavailable on one runway direction.",
        critical: true,
      },
      {
        key: "ltac-apron",
        text: "Apron congestion expected due scheduled peak movements.",
        critical: false,
      }
    );
  }

  if (icao === "LTCA") {
    pool.push(
      {
        key: "ltca-llws",
        text: "Low level windshear reported in vicinity of field by recent traffic.",
        critical: true,
      },
      {
        key: "ltca-terrain",
        text: "Terrain-induced turbulence possible below transition altitude.",
        critical: false,
      }
    );
  }

  return uniqueByKey(pool, (x) => x.key);
}

function buildNotamsForAirport(icao: string, now: Date): NotamItem[] {
  const ctx: NotamContext = { icao, now };
  const { hour, day } = utcContext(now);

  const pool = buildPool(ctx);
  const seed = hashString(`${icao}-${day}-${Math.floor(hour / 3)}`);

  const count = isMajorAirport(icao) ? 5 : 4;
  const chosen = rotatePick(pool, count, seed);

  return chosen.map((tpl, idx) => ({
    id: `${icao}-${String(idx + 1).padStart(3, "0")}`,
    text: tpl.text,
    critical: Boolean(tpl.critical),
  }));
}

export const simulatedNotamProvider: NotamProvider = {
  name: "simulated",
  async getNotam(icao: string): Promise<NotamItem[]> {
    const normalized = normalizeIcao(icao);
    if (!isValidIcao(normalized)) return [];

    await delay(80);
    return buildNotamsForAirport(normalized, new Date());
  },
};