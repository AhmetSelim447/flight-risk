import { BriefResponse } from '@flight-risk/shared';

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';

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

export async function searchAirports(q: string): Promise<{ matches: AirportRow[] }> {
  if (!q || q.trim().length < 2) return { matches: [] };

  try {
    const url = `${API_BASE}/airports/search?q=${encodeURIComponent(q.trim())}`;
    const r = await fetch(url);
    const data = await r.json();

    if (Array.isArray(data)) {
      return { matches: data.map(normalizeAirportRow) };
    }

    if (data && Array.isArray(data.matches)) {
      return { matches: data.matches.map(normalizeAirportRow) };
    }

    return { matches: [] };
  } catch (error) {
    console.error('Airport search failed:', error);
    return { matches: [] };
  }
}

export async function fetchBrief(depIcao: string, arrIcao: string, crossLimit?: number): Promise<BriefResponse> {
  let url = `${API_BASE}/brief?dep=${encodeURIComponent(depIcao.toUpperCase())}&arr=${encodeURIComponent(arrIcao.toUpperCase())}`;
  if (crossLimit && crossLimit > 0) {
    url += `&crossLimit=${encodeURIComponent(String(crossLimit))}`;
  }

  const r = await fetch(url);
  return safeJson<BriefResponse>(r);
}

function normalizeAirportRow(a: any): AirportRow {
  const lat = typeof a?.lat === 'number' ? a.lat : (a?.coords?.lat as number | undefined);
  const lon = typeof a?.lon === 'number' ? a.lon : (a?.coords?.lng as number | undefined);

  return {
    icao: String(a?.icao ?? a?.ident ?? '').toUpperCase(),
    iata: a?.iata ? String(a.iata).toUpperCase() : undefined,
    city: a?.city ?? a?.municipality,
    name: a?.name,
    coords:
      typeof lat === 'number' && typeof lon === 'number'
        ? { lat, lng: lon }
        : a?.coords,
    runways: a?.runways,
  };
}
