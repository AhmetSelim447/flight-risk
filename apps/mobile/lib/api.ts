import { BriefResponse } from '@flight-risk/shared';
import Constants from 'expo-constants';
import { supabase } from './supabase';

import { saveOfflineBrief, getOfflineBrief } from "./offline";

const API_BASE =
  Constants.expoConfig?.extra?.apiUrl ??
  process.env.EXPO_PUBLIC_API_URL ??
  'http://10.0.2.2:4000';

async function getAuthHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Aktif oturum bulunamadı. Lütfen tekrar giriş yapın.');
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
  };
}

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
    const headers = await getAuthHeaders();
    const url = `${API_BASE}/airports/search?q=${encodeURIComponent(q.trim())}`;

    const r = await fetch(url, { headers });
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
  crossLimit?: number,
  etdIso?: string
): Promise<BriefResponse> {
  const dep = depIcao.trim().toUpperCase();
  const arr = arrIcao.trim().toUpperCase();

  if (dep.length < 4 || arr.length < 4) {
    throw new Error(`Geçersiz ICAO: DEP=${dep}, ARR=${arr}`);
  }

  let url = `${API_BASE}/brief?dep=${encodeURIComponent(dep)}&arr=${encodeURIComponent(arr)}`;

  if (crossLimit && crossLimit > 0) {
    url += `&crossLimit=${encodeURIComponent(String(crossLimit))}`;
    url += `&crosswindLimitKt=${encodeURIComponent(String(crossLimit))}`;
  }

  if (etdIso && !Number.isNaN(new Date(etdIso).getTime())) {
    url += `&etd=${encodeURIComponent(new Date(etdIso).toISOString())}`;
  }

  const headers = await getAuthHeaders();
const r = await fetch(url, { headers });

const brief = await safeJson<BriefResponse>(r);

void saveOfflineBrief(dep, arr, brief);


return brief;
}

export async function getNearbyAirports(
  icao: string,
  radiusKm = 200
): Promise<{ matches: AirportRow[] }> {
  if (!icao || icao.trim().length < 3) {
    return { matches: [] };
  }

  try {
    const headers = await getAuthHeaders();

    const url = `${API_BASE}/airports/near?ident=${encodeURIComponent(
      icao.trim().toUpperCase()
    )}&radiusKm=${encodeURIComponent(String(radiusKm))}`;

    const r = await fetch(url, { headers });
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

export async function fetchBriefPdf(
  depIcao: string,
  arrIcao: string,
  crossLimit?: number,
  etdIso?: string
): Promise<Blob> {
  const dep = depIcao.trim().toUpperCase();
  const arr = arrIcao.trim().toUpperCase();

  const params = new URLSearchParams();

  params.set('dep', dep);
  params.set('arr', arr);

  if (crossLimit && crossLimit > 0) {
    params.set('crossLimit', String(crossLimit));
    params.set('crosswindLimitKt', String(crossLimit));
  }

  if (etdIso && !Number.isNaN(new Date(etdIso).getTime())) {
    params.set('etd', new Date(etdIso).toISOString());
  }

  const headers = await getAuthHeaders();

  const r = await fetch(`${API_BASE}/brief/pdf?${params.toString()}`, {
    headers,
  });

  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`PDF alınamadı: HTTP ${r.status} ${txt}`);
  }

  return r.blob();
}

export function getBriefPdfUrl(
  depIcao: string,
  arrIcao: string,
  crossLimit?: number,
  etdIso?: string
): string {
  const dep = depIcao.trim().toUpperCase();
  const arr = arrIcao.trim().toUpperCase();

  const params = new URLSearchParams();

  params.set('dep', dep);
  params.set('arr', arr);

  if (crossLimit && crossLimit > 0) {
    params.set('crossLimit', String(crossLimit));
    params.set('crosswindLimitKt', String(crossLimit));
  }

  if (etdIso && !Number.isNaN(new Date(etdIso).getTime())) {
    params.set('etd', new Date(etdIso).toISOString());
  }

  return `${API_BASE}/brief/pdf?${params.toString()}`;
}

export type NearbyAirportRow = {
  icao: string;
  iata?: string;
  city?: string;
  name?: string;
  lat?: number;
  lon?: number;
  coords?: { lat: number; lng: number };
  distanceKm?: number;
  distance_nm?: number;
};

export type LiveAircraftRow = {
  icao24?: string;
  callsign?: string;
  lat: number;
  lon: number;
  altitude?: number;
  velocity?: number;
  heading?: number;
};

export async function fetchNearbyAirports(
  lat: number,
  lng: number,
  radiusKm = 120
): Promise<NearbyAirportRow[]> {
  try {
    const headers = await getAuthHeaders();

    const url = `${API_BASE}/airports/near?lat=${encodeURIComponent(
      String(lat)
    )}&lng=${encodeURIComponent(String(lng))}&radiusKm=${encodeURIComponent(
      String(radiusKm)
    )}`;

    const r = await fetch(url, { headers });
    const data = await safeJson<any>(r);

    if (Array.isArray(data)) return data;
    if (Array.isArray(data.matches)) return data.matches;
    if (Array.isArray(data.airports)) return data.airports;
    if (Array.isArray(data.nearby)) return data.nearby;

    return [];
  } catch (error) {
    console.warn('Nearby airports fetch failed:', error);
    return [];
  }
}

export async function fetchLiveAircraft(
  minLat: number,
  maxLat: number,
  minLng: number,
  maxLng: number
): Promise<LiveAircraftRow[]> {
  try {
    const headers = await getAuthHeaders();

    const params = new URLSearchParams();

    params.set('minLat', String(minLat));
    params.set('maxLat', String(maxLat));
    params.set('minLng', String(minLng));
    params.set('maxLng', String(maxLng));

    const url = `${API_BASE}/traffic/live?${params.toString()}`;

    const r = await fetch(url, { headers });
    const data = await safeJson<any>(r);

    if (Array.isArray(data)) return data;
    if (Array.isArray(data.aircraft)) return data.aircraft;
    if (Array.isArray(data.states)) return data.states;

    return [];
  } catch (error) {
    console.warn('Live aircraft fetch failed:', error);
    return [];
  }
}


export type BriefHistoryItem = {
  id: string;
  user_id: string;
  dep: string;
  arr: string;
  risk_score?: number | null;
  risk_class?: string | null;
  brief: BriefResponse;
  created_at: string;
};

export async function saveBriefHistory(
  dep: string,
  arr: string,
  brief: BriefResponse
): Promise<BriefHistoryItem | null> {
  try {
    const headers = await getAuthHeaders();

    const r = await fetch(`${API_BASE}/history`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify({
        dep: dep.trim().toUpperCase(),
        arr: arr.trim().toUpperCase(),
        brief,
      }),
    });

    const data = await safeJson<{ ok: boolean; item: BriefHistoryItem }>(r);
    return data.item;
  } catch (error) {
    console.warn("Brief history save failed:", error);
    return null;
  }
}

export async function getBriefHistory(): Promise<BriefHistoryItem[]> {
  try {
    const headers = await getAuthHeaders();

    const r = await fetch(`${API_BASE}/history`, {
      headers,
    });

    const data = await safeJson<{ ok: boolean; items: BriefHistoryItem[] }>(r);
    return data.items ?? [];
  } catch (error) {
    console.warn("Brief history fetch failed:", error);
    return [];
  }
}

export async function deleteBriefHistory(id: string): Promise<boolean> {
  try {
    const headers = await getAuthHeaders();

    const r = await fetch(`${API_BASE}/history/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers,
    });

    const data = await safeJson<{ ok: boolean }>(r);
    return data.ok === true;
  } catch (error) {
    console.warn("Brief history delete failed:", error);
    return false;
  }
}


export type FavoriteRouteItem = {
  id: string;
  user_id: string;
  dep: string;
  arr: string;
  label?: string | null;
  created_at: string;
};

export async function addFavoriteRoute(
  dep: string,
  arr: string,
  label?: string
): Promise<FavoriteRouteItem | null> {
  try {
    const headers = await getAuthHeaders();

    const r = await fetch(`${API_BASE}/favorites`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify({
        dep: dep.trim().toUpperCase(),
        arr: arr.trim().toUpperCase(),
        label,
      }),
    });

    const data = await safeJson<{ ok: boolean; item: FavoriteRouteItem }>(r);
    return data.item;
  } catch (error) {
    console.warn("Favorite route save failed:", error);
    return null;
  }
}

export async function getFavoriteRoutes(): Promise<FavoriteRouteItem[]> {
  try {
    const headers = await getAuthHeaders();

    const r = await fetch(`${API_BASE}/favorites`, {
      headers,
    });

    const data = await safeJson<{ ok: boolean; items: FavoriteRouteItem[] }>(r);
    return data.items ?? [];
  } catch (error) {
    console.warn("Favorite routes fetch failed:", error);
    return [];
  }
}

export async function deleteFavoriteRoute(id: string): Promise<boolean> {
  try {
    const headers = await getAuthHeaders();

    const r = await fetch(`${API_BASE}/favorites/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers,
    });

    const data = await safeJson<{ ok: boolean }>(r);
    return data.ok === true;
  } catch (error) {
    console.warn("Favorite route delete failed:", error);
    return false;
  }
}