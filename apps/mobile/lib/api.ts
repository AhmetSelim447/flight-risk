import { BriefResponse } from '@flight-risk/shared';

const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ||
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  'http://localhost:4000';

async function safeJson<T>(r: Response): Promise<T> {
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`HTTP ${r.status} ${r.statusText} ${txt}`);
  }

  return r.json() as Promise<T>;
}

export type AirportRow = {
  icao: string;
  iata?: string;
  city?: string;
  name?: string;
  coords?: { lat: number; lng: number };
  runways?: { id: string; heading: number; length_m?: number }[];
};

type RawAirport = {
  icao?: string;
  ident?: string;
  iata?: string;
  city?: string;
  municipality?: string;
  name?: string;
  lat?: number;
  lon?: number;
  latitude_deg?: number;
  longitude_deg?: number;
  coords?: { lat?: number; lng?: number };
  runways?: { id: string; heading: number; length_m?: number }[];
};

export async function searchAirports(
  q: string
): Promise<{ matches: AirportRow[] }> {
  if (!q || q.trim().length < 2) {
    return { matches: [] };
  }

  try {
    const url = `${API_BASE}/airports/search?q=${encodeURIComponent(q.trim())}`;
    const r = await fetch(url);
    const data = await safeJson<RawAirport[] | { matches?: RawAirport[] }>(r);

    if (Array.isArray(data)) {
      return { matches: data.map(normalizeAirportRow).filter(Boolean) };
    }

    if (data && Array.isArray(data.matches)) {
      return { matches: data.matches.map(normalizeAirportRow).filter(Boolean) };
    }

    return { matches: [] };
  } catch (error) {
    console.error('Airport search failed:', error);
    return { matches: [] };
  }
}

export async function fetchBrief(
  depIcao: string,
  arrIcao: string,
  crossLimit?: number
): Promise<BriefResponse> {
  const dep = depIcao.trim().toUpperCase();
  const arr = arrIcao.trim().toUpperCase();

  let url = `${API_BASE}/brief?dep=${encodeURIComponent(dep)}&arr=${encodeURIComponent(arr)}`;

  if (crossLimit && crossLimit > 0) {
    url += `&crossLimit=${encodeURIComponent(String(crossLimit))}`;
    url += `&crosswindLimitKt=${encodeURIComponent(String(crossLimit))}`;
  }

  const r = await fetch(url);
  return safeJson<BriefResponse>(r);
}

export async function getNearbyAirports(
  icao: string,
  radiusKm = 200
): Promise<{ matches: AirportRow[] }> {
  if (!icao || icao.trim().length < 3) {
    return { matches: [] };
  }

  try {
    const url = `${API_BASE}/airports/near?ident=${encodeURIComponent(
      icao.trim().toUpperCase()
    )}&radiusKm=${encodeURIComponent(String(radiusKm))}`;

    const r = await fetch(url);
    const data = await safeJson<RawAirport[] | { matches?: RawAirport[] }>(r);

    if (Array.isArray(data)) {
      return { matches: data.map(normalizeAirportRow).filter(Boolean) };
    }

    if (data && Array.isArray(data.matches)) {
      return { matches: data.matches.map(normalizeAirportRow).filter(Boolean) };
    }

    return { matches: [] };
  } catch (error) {
    console.error('Nearby airports failed:', error);
    return { matches: [] };
  }
}

export async function checkApiHealth(): Promise<boolean> {
  try {
    const r = await fetch(`${API_BASE}/health`);
    const data = await safeJson<{ ok?: boolean }>(r);
    return data.ok === true;
  } catch {
    return false;
  }
}

function normalizeAirportRow(a: RawAirport): AirportRow {
  const lat =
    typeof a.lat === 'number'
      ? a.lat
      : typeof a.latitude_deg === 'number'
        ? a.latitude_deg
        : typeof a.coords?.lat === 'number'
          ? a.coords.lat
          : undefined;

  const lon =
    typeof a.lon === 'number'
      ? a.lon
      : typeof a.longitude_deg === 'number'
        ? a.longitude_deg
        : typeof a.coords?.lng === 'number'
          ? a.coords.lng
          : undefined;

  return {
    icao: String(a.icao ?? a.ident ?? '').toUpperCase(),
    iata: a.iata ? String(a.iata).toUpperCase() : undefined,
    city: a.city ?? a.municipality,
    name: a.name,
    coords:
      typeof lat === 'number' && typeof lon === 'number'
        ? { lat, lng: lon }
        : undefined,
    runways: a.runways,
  };
}