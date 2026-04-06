type OpenSkyState = [
  string | null,   // 0 icao24
  string | null,   // 1 callsign
  string | null,   // 2 origin_country
  number | null,   // 3 time_position
  number | null,   // 4 last_contact
  number | null,   // 5 longitude
  number | null,   // 6 latitude
  number | null,   // 7 baro_altitude (meters)
  boolean | null,  // 8 on_ground
  number | null,   // 9 velocity (m/s)
  number | null,   // 10 true_track
  number | null,   // 11 vertical_rate
  number[] | null, // 12 sensors
  number | null,   // 13 geo_altitude
  string | null,   // 14 squawk
  boolean | null,  // 15 spi
  number | null,   // 16 position_source
  number | null    // 17 category (extended=1)
];

type OpenSkyStatesResponse = {
  time?: number;
  states?: OpenSkyState[] | null;
};

export type TrafficAircraft = {
  id: string;
  icao24?: string;
  callsign?: string;
  originCountry?: string;
  lat: number;
  lon: number;
  heading?: number;
  altitudeFt?: number;
  speedKt?: number;
  onGround?: boolean;
  source: "opensky";
  updatedAt: number;
};

export type TrafficBBox = {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
};

const OPENSKY_BASE_URL =
  process.env.OPENSKY_BASE_URL?.trim() || "https://opensky-network.org/api";

const OPENSKY_ACCESS_TOKEN = process.env.OPENSKY_ACCESS_TOKEN?.trim() || "";

const TRAFFIC_CACHE_TTL_MS = Number(process.env.TRAFFIC_CACHE_TTL_MS || 15000);
const TRAFFIC_FETCH_TIMEOUT_MS = Number(process.env.TRAFFIC_FETCH_TIMEOUT_MS || 12000);

type TrafficCacheEntry = {
  expiresAt: number;
  data: TrafficAircraft[];
};

const cache = new Map<string, TrafficCacheEntry>();
const inFlight = new Map<string, Promise<TrafficAircraft[]>>();

function roundCoord(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function bboxKey(bbox: TrafficBBox): string {
  return [
    roundCoord(bbox.minLon),
    roundCoord(bbox.minLat),
    roundCoord(bbox.maxLon),
    roundCoord(bbox.maxLat),
  ].join(":");
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function normalizeTrafficBBox(input: TrafficBBox): TrafficBBox {
  const minLon = clamp(Math.min(input.minLon, input.maxLon), -180, 180);
  const maxLon = clamp(Math.max(input.minLon, input.maxLon), -180, 180);
  const minLat = clamp(Math.min(input.minLat, input.maxLat), -90, 90);
  const maxLat = clamp(Math.max(input.minLat, input.maxLat), -90, 90);

  return { minLon, minLat, maxLon, maxLat };
}

export function isValidTrafficBBox(input: Partial<TrafficBBox>): input is TrafficBBox {
  return (
    isFiniteNumber(input.minLon) &&
    isFiniteNumber(input.minLat) &&
    isFiniteNumber(input.maxLon) &&
    isFiniteNumber(input.maxLat) &&
    input.minLon >= -180 &&
    input.minLon <= 180 &&
    input.maxLon >= -180 &&
    input.maxLon <= 180 &&
    input.minLat >= -90 &&
    input.minLat <= 90 &&
    input.maxLat >= -90 &&
    input.maxLat <= 90
  );
}

function metersToFeet(value: number | null | undefined): number | undefined {
  if (!isFiniteNumber(value)) return undefined;
  return Math.round(value * 3.28084);
}

function metersPerSecondToKnots(value: number | null | undefined): number | undefined {
  if (!isFiniteNumber(value)) return undefined;
  return Math.round(value * 1.943844);
}

function cleanCallsign(value: string | null | undefined): string | undefined {
  const v = typeof value === "string" ? value.trim() : "";
  return v || undefined;
}

function cleanHex(value: string | null | undefined): string | undefined {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  return v || undefined;
}

function normalizeHeading(value: number | null | undefined): number | undefined {
  if (!isFiniteNumber(value)) return undefined;
  let heading = value % 360;
  if (heading < 0) heading += 360;
  return Math.round(heading);
}

function buildTrafficAircraft(state: OpenSkyState, responseTime?: number): TrafficAircraft | null {
  const icao24 = cleanHex(state[0]);
  const callsign = cleanCallsign(state[1]);
  const originCountry = typeof state[2] === "string" ? state[2].trim() || undefined : undefined;
  const timePosition = state[3];
  const lastContact = state[4];
  const lon = state[5];
  const lat = state[6];
  const baroAltitude = state[7];
  const onGround = typeof state[8] === "boolean" ? state[8] : undefined;
  const velocity = state[9];
  const trueTrack = state[10];

  if (!icao24) return null;
  if (!isFiniteNumber(lat) || !isFiniteNumber(lon)) return null;

  const updatedAtSeconds =
    (isFiniteNumber(lastContact) ? lastContact : undefined) ??
    (isFiniteNumber(timePosition) ? timePosition : undefined) ??
    (isFiniteNumber(responseTime) ? responseTime : undefined) ??
    Math.floor(Date.now() / 1000);

  return {
    id: icao24,
    icao24,
    callsign,
    originCountry,
    lat,
    lon,
    heading: normalizeHeading(trueTrack),
    altitudeFt: metersToFeet(baroAltitude),
    speedKt: metersPerSecondToKnots(velocity),
    onGround,
    source: "opensky",
    updatedAt: updatedAtSeconds * 1000,
  };
}

async function fetchJsonWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function buildHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (OPENSKY_ACCESS_TOKEN) {
    headers.Authorization = `Bearer ${OPENSKY_ACCESS_TOKEN}`;
  }

  return headers;
}

async function fetchOpenSkyStates(bbox: TrafficBBox): Promise<OpenSkyStatesResponse> {
  const url = new URL(`${OPENSKY_BASE_URL.replace(/\/+$/, "")}/states/all`);
  url.searchParams.set("lamin", String(bbox.minLat));
  url.searchParams.set("lomin", String(bbox.minLon));
  url.searchParams.set("lamax", String(bbox.maxLat));
  url.searchParams.set("lomax", String(bbox.maxLon));

  const res = await fetchJsonWithTimeout(
    url.toString(),
    {
      method: "GET",
      headers: buildHeaders(),
    },
    TRAFFIC_FETCH_TIMEOUT_MS
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `OpenSky traffic request failed: ${res.status} ${res.statusText}${
        text ? ` | ${text.slice(0, 200)}` : ""
      }`
    );
  }

  const data = (await res.json()) as OpenSkyStatesResponse;
  return data;
}

export async function getTrafficByBBox(input: TrafficBBox): Promise<TrafficAircraft[]> {
  const bbox = normalizeTrafficBBox(input);
  const key = bboxKey(bbox);
  const now = Date.now();

  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const existing = inFlight.get(key);
  if (existing) {
    return existing;
  }

  const promise = (async (): Promise<TrafficAircraft[]> => {
    try {
      const data = await fetchOpenSkyStates(bbox);
      const states = Array.isArray(data.states) ? data.states : [];

      const list = states
        .map((state) => buildTrafficAircraft(state, data.time))
        .filter((item): item is TrafficAircraft => Boolean(item));

      cache.set(key, {
        expiresAt: Date.now() + TRAFFIC_CACHE_TTL_MS,
        data: list,
      });

      return list;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}

export function clearTrafficCache(): void {
  cache.clear();
}

export function getTrafficCacheTtlMs(): number {
  return TRAFFIC_CACHE_TTL_MS;
}