// apps/web/src/lib/traffic.ts
import { API_BASE } from "./api";

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

export type TrafficResponse = {
  ok: boolean;
  source: string;
  live: boolean;
  cachedTtlMs: number;
  bbox: {
    minLon: number;
    minLat: number;
    maxLon: number;
    maxLat: number;
  };
  count: number;
  aircraft: TrafficAircraft[];
};

export async function fetchTrafficByBBox(
  bbox: {
    minLon: number;
    minLat: number;
    maxLon: number;
    maxLat: number;
  },
  signal?: AbortSignal
): Promise<TrafficResponse> {
  const qs = new URLSearchParams({
    bbox: `${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`,
  });

  const url = `${API_BASE}/traffic?${qs.toString()}`;

  const res = await fetch(url, {
    method: "GET",
    signal,
  });

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const message =
      data?.message ||
      data?.error ||
      `Traffic request failed (${res.status})`;

    throw new Error(String(message));
  }

  return {
    ok: Boolean(data?.ok),
    source: String(data?.source || "unknown"),
    live: Boolean(data?.live),
    cachedTtlMs: Number(data?.cachedTtlMs || 0),
    bbox: {
      minLon: Number(data?.bbox?.minLon || bbox.minLon),
      minLat: Number(data?.bbox?.minLat || bbox.minLat),
      maxLon: Number(data?.bbox?.maxLon || bbox.maxLon),
      maxLat: Number(data?.bbox?.maxLat || bbox.maxLat),
    },
    count: Array.isArray(data?.aircraft) ? data.aircraft.length : 0,
    aircraft: Array.isArray(data?.aircraft) ? data.aircraft : [],
  };
}