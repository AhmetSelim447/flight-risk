// apps/api/src/lib/notam.simulated.ts

import { byICAO } from "../data/airports";
import type {
  NotamContext,
  NotamEvent,
  NotamEventCategory,
  NotamImpact,
  NotamItem,
  NotamProvider,
} from "./notam.types";

type SyntheticMode = "deterministic" | "llm_text" | "hybrid";

type EventDefinition = {
  key: string;
  category: NotamEventCategory;
  severity: "Critical" | "Medium" | "Info";
  impacts: NotamImpact[];
  score: number;
  reason: string;
  runwayScoped?: boolean;
};

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

function syntheticMode(): SyntheticMode {
  const raw = String(process.env.NOTAM_SYNTHETIC_MODE || "deterministic").toLowerCase();
  if (raw === "llm_text" || raw === "hybrid") return raw;
  return "deterministic";
}

function aiServiceUrl() {
  return String(
    process.env.AI_SERVICE_URL ||
      process.env.NLP_SERVICE_URL ||
      "http://localhost:8000"
  ).replace(/\/+$/, "");
}

function seedBucketHours() {
  const n = Number(process.env.NOTAM_SEED_BUCKET_HOURS ?? 6);
  return Number.isFinite(n) && n > 0 ? Math.min(24, Math.max(1, Math.round(n))) : 6;
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
  return ["LTFM", "LTFJ", "LTAC", "LTBA", "LTAI", "LTBJ", "LTBS"].includes(icao);
}

function isEasternAirport(icao: string): boolean {
  return /^(LTCA|LTCC|LTCK|LTCR|LTCT|LTCE|LTCD|LTCP|LTFO)$/.test(icao);
}

function isCoastalAirport(icao: string): boolean {
  return /^(LTAI|LTBJ|LTBS|LTFE|LTAJ|LTBQ|LTCJ|LTFJ)$/.test(icao);
}

function utcContext(now: Date) {
  const bucketHours = seedBucketHours();
  const bucket = Math.floor(now.getUTCHours() / bucketHours);
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), bucket * bucketHours));
  const end = new Date(start.getTime() + bucketHours * 60 * 60 * 1000);

  return {
    bucket,
    bucketHours,
    day: now.getUTCDate(),
    hour: now.getUTCHours(),
    month: now.getUTCMonth() + 1,
    validFrom: start.toISOString(),
    validTo: end.toISOString(),
  };
}

function chooseRunway(icao: string, seed: number) {
  const airport = byICAO(icao);
  const runways = airport?.runways ?? [];
  if (!runways.length) return undefined;
  return runways[seed % runways.length]?.id;
}

const COMMON_EVENTS: EventDefinition[] = [
  {
    key: "bird",
    category: "weather_advisory",
    severity: "Info",
    impacts: ["weather"],
    score: 12,
    reason: "Wildlife hazard can affect low altitude phases.",
  },
  {
    key: "apron-stands",
    category: "apron_works",
    severity: "Info",
    impacts: [],
    score: 8,
    reason: "Apron constraints can affect ground movement but not runway availability.",
  },
  {
    key: "taxiway-works",
    category: "taxiway_works",
    severity: "Medium",
    impacts: ["surface"],
    score: 24,
    reason: "Taxiway works can change routing and increase ground delay.",
  },
  {
    key: "lighting",
    category: "lighting_maintenance",
    severity: "Medium",
    impacts: ["lighting"],
    score: 28,
    reason: "Lighting maintenance can reduce visual guidance.",
    runwayScoped: true,
  },
];

const RUNWAY_EVENTS: EventDefinition[] = [
  {
    key: "rwy-inspection",
    category: "runway_inspection",
    severity: "Medium",
    impacts: ["runway"],
    score: 34,
    reason: "Runway inspection windows can create short occupancy restrictions.",
    runwayScoped: true,
  },
  {
    key: "rwy-surface",
    category: "runway_surface",
    severity: "Critical",
    impacts: ["runway", "surface"],
    score: 58,
    reason: "Runway surface condition directly affects takeoff and landing planning.",
    runwayScoped: true,
  },
  {
    key: "rwy-closure",
    category: "runway_closure",
    severity: "Critical",
    impacts: ["runway"],
    score: 72,
    reason: "Runway closure is a direct operational constraint.",
    runwayScoped: true,
  },
];

const NAV_EVENTS: EventDefinition[] = [
  {
    key: "ils-outage",
    category: "nav_outage",
    severity: "Critical",
    impacts: ["nav"],
    score: 52,
    reason: "ILS outage can affect approach minima and usable procedures.",
    runwayScoped: true,
  },
  {
    key: "papi-outage",
    category: "nav_outage",
    severity: "Critical",
    impacts: ["nav", "lighting"],
    score: 48,
    reason: "PAPI outage reduces visual approach guidance.",
    runwayScoped: true,
  },
  {
    key: "vor-dme",
    category: "nav_outage",
    severity: "Medium",
    impacts: ["nav"],
    score: 30,
    reason: "VOR/DME fluctuation can affect conventional navigation backup.",
  },
  {
    key: "gnss",
    category: "nav_outage",
    severity: "Critical",
    impacts: ["nav"],
    score: 50,
    reason: "GNSS interference can affect RNAV/RNP capability.",
  },
];

const MAJOR_EVENTS: EventDefinition[] = [
  {
    key: "flow",
    category: "airspace_activity",
    severity: "Medium",
    impacts: ["airspace"],
    score: 26,
    reason: "Dense arrival and departure flow can increase sequencing delay.",
  },
  {
    key: "ops-hours",
    category: "ops_hours",
    severity: "Medium",
    impacts: ["ops_hours"],
    score: 32,
    reason: "Operating window restrictions can affect schedule feasibility.",
  },
];

const TURKIYE_EVENTS: EventDefinition[] = [
  {
    key: "mil-activity",
    category: "airspace_activity",
    severity: "Medium",
    impacts: ["airspace"],
    score: 30,
    reason: "Temporary military activity may affect nearby controlled airspace segments.",
  },
];

const EASTERN_EVENTS: EventDefinition[] = [
  {
    key: "llws",
    category: "weather_advisory",
    severity: "Critical",
    impacts: ["weather"],
    score: 56,
    reason: "Low level windshear reports are significant for approach and departure.",
  },
  {
    key: "terrain-turb",
    category: "weather_advisory",
    severity: "Medium",
    impacts: ["weather"],
    score: 30,
    reason: "Terrain-induced turbulence can affect terminal operations.",
  },
];

const COASTAL_EVENTS: EventDefinition[] = [
  {
    key: "sea-breeze",
    category: "weather_advisory",
    severity: "Medium",
    impacts: ["weather"],
    score: 28,
    reason: "Sea breeze can cause runway wind component changes.",
  },
  {
    key: "coastal-crosswind",
    category: "weather_advisory",
    severity: "Critical",
    impacts: ["weather", "runway"],
    score: 46,
    reason: "Coastal wind transition can increase crosswind variability.",
    runwayScoped: true,
  },
];

const WINTER_EVENTS: EventDefinition[] = [
  {
    key: "icing",
    category: "weather_advisory",
    severity: "Critical",
    impacts: ["weather"],
    score: 52,
    reason: "Icing reports can affect climb and descent planning.",
  },
  {
    key: "snow-ice",
    category: "runway_surface",
    severity: "Critical",
    impacts: ["runway", "surface", "weather"],
    score: 62,
    reason: "Snow or ice contamination assessment can affect runway performance.",
    runwayScoped: true,
  },
];

const SUMMER_EVENTS: EventDefinition[] = [
  {
    key: "braking-precip",
    category: "runway_surface",
    severity: "Critical",
    impacts: ["runway", "surface", "weather"],
    score: 50,
    reason: "Reduced braking action can occur during heavy precipitation periods.",
    runwayScoped: true,
  },
  {
    key: "turbulence",
    category: "weather_advisory",
    severity: "Medium",
    impacts: ["weather"],
    score: 26,
    reason: "Moderate turbulence reports can affect passenger and crew planning.",
  },
];

function buildEventPool(ctx: NotamContext): EventDefinition[] {
  const { icao, now } = ctx;
  const { hour, month } = utcContext(now);
  const pool: EventDefinition[] = [];

  pool.push(...COMMON_EVENTS, ...RUNWAY_EVENTS, ...NAV_EVENTS);

  if (isTurkiyeAirport(icao)) pool.push(...TURKIYE_EVENTS);
  if (isMajorAirport(icao)) pool.push(...MAJOR_EVENTS);
  if (isEasternAirport(icao)) pool.push(...EASTERN_EVENTS);
  if (isCoastalAirport(icao)) pool.push(...COASTAL_EVENTS);

  if (month >= 11 || month <= 3) {
    pool.push(...WINTER_EVENTS);
  } else {
    pool.push(...SUMMER_EVENTS);
  }

  if (hour >= 19 || hour <= 4) {
    pool.push({
      key: "night-lighting",
      category: "lighting_maintenance",
      severity: "Medium",
      impacts: ["lighting"],
      score: 27,
      reason: "Night lighting maintenance can reduce visual guidance in low light.",
      runwayScoped: true,
    });
  }

  if (icao === "LTFM") {
    pool.push({
      key: "ltfm-rwy-occupancy",
      category: "runway_inspection",
      severity: "Critical",
      impacts: ["runway"],
      score: 54,
      reason: "High-capacity runway system can be affected by short-notice inspection windows.",
      runwayScoped: true,
    });
  }

  if (icao === "LTAC") {
    pool.push({
      key: "ltac-papi",
      category: "nav_outage",
      severity: "Critical",
      impacts: ["nav", "lighting"],
      score: 48,
      reason: "PAPI unavailability can reduce visual approach guidance.",
      runwayScoped: true,
    });
  }

  if (icao === "LTCA") {
    pool.push({
      key: "ltca-llws",
      category: "weather_advisory",
      severity: "Critical",
      impacts: ["weather"],
      score: 58,
      reason: "Terrain and recent reports increase low-level windshear concern.",
    });
  }

  return uniqueByKey(pool, (x) => x.key);
}

function buildEvent(icao: string, definition: EventDefinition, now: Date, seed: number): NotamEvent {
  const { validFrom, validTo } = utcContext(now);
  const mode = syntheticMode();

  return {
    key: definition.key,
    category: definition.category,
    severity: definition.severity,
    critical: definition.severity === "Critical",
    impacts: definition.impacts,
    validFrom,
    validTo,
    affectedRunway: definition.runwayScoped ? chooseRunway(icao, seed) : undefined,
    score: definition.score,
    reason: definition.reason,
    syntheticMode: mode,
  };
}

function deterministicText(icao: string, event: NotamEvent): string {
  const rwy = event.affectedRunway ? ` RWY ${event.affectedRunway}` : "";

  switch (event.category) {
    case "runway_closure":
      return `${icao}${rwy} closed during published validity period due operational works. Check runway availability before departure.`;
    case "runway_inspection":
      return `${icao}${rwy} subject to short-notice inspection occupancy windows. Minor departure or arrival delay possible.`;
    case "runway_surface":
      return `${icao}${rwy} surface condition assessment in progress. Braking or performance review may be required.`;
    case "nav_outage":
      return `${icao}${rwy} navigation or visual approach aid unavailable or intermittent. Review approach minima and backup procedures.`;
    case "lighting_maintenance":
      return `${icao}${rwy} airfield lighting maintenance in progress. Visual guidance may be reduced.`;
    case "ops_hours":
      return `${icao} aerodrome operating hours or service availability restricted within validity period. Confirm schedule compatibility.`;
    case "apron_works":
      return `${icao} apron stand restrictions in effect due maintenance activity. Ground movement delay possible.`;
    case "taxiway_works":
      return `${icao} taxiway routing restrictions in effect due works. Follow ATC and ground guidance.`;
    case "airspace_activity":
      return `${icao} temporary controlled airspace activity may affect nearby arrival or departure routing.`;
    case "weather_advisory":
      return `${icao} weather-related operational advisory in force. Additional briefing review recommended.`;
    default:
      return `${icao} operational advisory in force. Review details before flight.`;
  }
}

async function enrichedText(icao: string, event: NotamEvent): Promise<string> {
  const base = deterministicText(icao, event);

  if (event.syntheticMode === "deterministic") return base;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), Number(process.env.AI_SERVICE_TIMEOUT_MS ?? 15000));

    const response = await fetch(`${aiServiceUrl()}/ai/notam/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        icao,
        event,
        deterministicText: base,
      }),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer));

    if (!response.ok) return base;

    const rendered = await response.json().catch(() => null);
    const text = typeof rendered?.text === "string" ? rendered.text.trim() : "";

    // Validation gate: text layer may only change wording, not event semantics.
    if (!text.includes(icao) || text.length < 5) return base;
    return text;
  } catch {
    return base;
  }
}

async function buildNotamsForAirport(icao: string, now: Date): Promise<NotamItem[]> {
  const ctx: NotamContext = { icao, now };
  const { bucket, day } = utcContext(now);
  const seed = hashString(`${icao}-${day}-${bucket}-${seedBucketHours()}`);

  const pool = buildEventPool(ctx);
  const count = isMajorAirport(icao) ? 5 : 4;
  const chosen = rotatePick(pool, count, seed);

  return Promise.all(chosen.map(async (definition, idx) => {
    const event = buildEvent(icao, definition, now, seed + idx);

    return {
      id: `${icao}-SYN-${String(idx + 1).padStart(3, "0")}`,
      text: await enrichedText(icao, event),
      critical: event.critical,
      synthetic: true,
      severity: event.severity,
      impacts: event.impacts,
      validFrom: event.validFrom,
      validTo: event.validTo,
      event,
    };
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
