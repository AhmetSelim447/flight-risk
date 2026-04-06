// apps/web/src/lib/api.ts
import axios from "axios";

/**
 * Backend kök adresi
 * - DEV: Vite proxy kullan: /api  -> http://localhost:4000
 * - PROD: .env ile VITE_API_BASE set edebilirsin (örn: https://api.domain.com)
 */
export const API_BASE: string =
  (import.meta as any).env?.VITE_API_BASE ||
  (import.meta as any).env?.DEV
    ? "/api"
    : "http://localhost:4000";

/** Axios instance (opsiyonel) */
export const api = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
});

let searchAbort: AbortController | null = null;

/** fetch için güvenli JSON yardımcı fonksiyon */
async function safeJson<T>(r: Response): Promise<T> {
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`HTTP ${r.status} ${r.statusText} ${txt}`);
  }
  return r.json() as Promise<T>;
}

/** API tipleri */
export type AirportRow = {
  icao: string;
  iata?: string;
  city?: string;
  name?: string;
  coords?: { lat: number; lng: number };
  runways?: { id: string; heading: number; length_m?: number }[];
};

export type BriefResponse = {
  airports: {
    dep: AirportRow & { activeRunway?: { heading: number; length_m?: number } };
    arr: AirportRow & { activeRunway?: { heading: number; length_m?: number } };
  };
  met: { dep: any[]; arr: any[] };
  taf?: { dep?: any[]; arr?: any[] };
  risk: {
    score: number;
    class: "green" | "yellow" | "red";
    reasons: string[];
    headwind: number;
    crosswind: number;
    alternates: string[];
  };
  notam?: { dep?: any[]; arr?: any[] };
};

/**
 * Backend /airports/search şu an direkt Airport[] dönüyor.
 * UI tarafı için normalize edip her zaman { matches: AirportRow[] } döndürüyoruz.
 */
export async function searchAirports(q: string): Promise<{ matches: AirportRow[] }> {
  if (!q || q.trim().length < 2) return { matches: [] };

  try {
    if (searchAbort) searchAbort.abort();
    searchAbort = new AbortController();

    const url = `${API_BASE}/airports/search?q=${encodeURIComponent(q.trim())}`;
    const r = await fetch(url, { signal: searchAbort.signal });

    const data = await safeJson<any>(r);

    // backend array dönerse
    if (Array.isArray(data)) {
      return { matches: data.map(normalizeAirportRow) };
    }

    // ileride backend {matches:[...]} dönerse uyumlu kalsın
    if (data && Array.isArray(data.matches)) {
      return { matches: data.matches.map(normalizeAirportRow) };
    }

    return { matches: [] };
  } catch {
    // API restart/kapalıysa sessiz dön
    return { matches: [] };
  } finally {
    searchAbort = null;
  }
}

export async function fetchBrief(depIcao: string, arrIcao: string) {
  // settings'ten crossLimit oku ve query'ye ekle
  let crossQ = "";
  try {
    const raw = localStorage.getItem("settings");
    if (raw) {
      const s = JSON.parse(raw);
      const cl = Number(s?.crossLimit);
      if (Number.isFinite(cl) && cl > 0) {
        crossQ = `&crossLimit=${encodeURIComponent(String(cl))}`;
      }
    }
  } catch {}

  const r = await fetch(
    `${API_BASE}/brief?dep=${encodeURIComponent(depIcao)}&arr=${encodeURIComponent(arrIcao)}${crossQ}`
  );
  return safeJson<BriefResponse>(r);
}

/** Backend -> UI uyumu: lat/lon varsa coords'a koy */
function normalizeAirportRow(a: any): AirportRow {
  const lat = typeof a?.lat === "number" ? a.lat : (a?.coords?.lat as number | undefined);
  const lon = typeof a?.lon === "number" ? a.lon : (a?.coords?.lng as number | undefined);

  return {
    icao: String(a?.icao ?? a?.ident ?? "").toUpperCase(),
    iata: a?.iata ? String(a.iata).toUpperCase() : undefined,
    city: a?.city ?? a?.municipality,
    name: a?.name,
    coords:
      typeof lat === "number" && typeof lon === "number"
        ? { lat, lng: lon }
        : a?.coords,
    runways: a?.runways,
  };
}
