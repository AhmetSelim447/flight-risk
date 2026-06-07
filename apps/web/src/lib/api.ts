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
    dep: AirportRow & { activeRunway?: { id?: string; heading: number; length_m?: number } };
    arr: AirportRow & { activeRunway?: { id?: string; heading: number; length_m?: number } };
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
    ml?: {
      mlScore: number;
      ruleScore: number;
      finalScore: number;
      notamSemanticScore: number;
      weatherAssessment?: {
        score: number;
        trainedScore?: number | null;
        heuristicScore?: number;
        floorScore?: number;
        floorApplied?: boolean;
        floorReasons?: string[];
        categories?: {
          key: string;
          label: string;
          status: string;
          detail: string;
          present: boolean;
          score: number;
        }[];
      };
      confidence?: {
        level: "high" | "medium" | "low";
        score: number;
        summary?: string;
        factors?: string[];
      };
      drivers?: string[];
      modelVersion?: string;
      limitedAdjustment?: {
        applied?: boolean;
        fromClass?: string;
        toClass?: string;
        reason?: string;
      };
    };
  };
  notam?: { dep?: any[]; arr?: any[] };
  aiNotamAnalysis?: { dep?: any[]; arr?: any[] };
  aiReport?: {
    summary?: string;
    riskInterpretation?: string;
    notamImpacts?: string[];
    weatherConcerns?: string[];
    windConcerns?: string[];
    alternateCommentary?: string;
    confidenceNote?: string;
    limitedAdjustment?: string;
  };
};

export type ModelStatusResponse = {
  model: {
    loaded: boolean;
    path: string;
    modelVersion?: string;
    createdAt?: string;
    targetColumn?: string;
    classes?: number[];
    featureColumns?: string[];
    scoreMapping?: Record<string, number>;
    labelDefinition?: string;
    metrics?: any;
  };
  evaluation: {
    path: string;
    available?: boolean;
    createdAt?: string;
    targetColumn?: string;
    splits?: any;
    evaluations?: any[];
  };
  dataset: {
    path: string;
    exists: boolean;
    bytes: number;
    updatedAt: string | null;
  };
  feedback: FeedbackSummary;
  snapshots?: {
    path: string;
    exists: boolean;
    fileCount: number;
    latestFile: string | null;
    latestUpdatedAt: string | null;
    latestTafFile: string | null;
    latestTafUpdatedAt: string | null;
    latestTafRecords: number;
    latestTafStations: string[];
  };
  providers?: {
    metProvider: string;
    notamProvider: string;
    notamSyntheticMode?: string;
    aiServiceUrl?: string;
  };
};

export type FeedbackSummary = {
  count: number;
  byVerdict: Record<string, number>;
  latest: any[];
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

export async function fetchModelStatus() {
  const r = await fetch(`${API_BASE}/model/status?_=${Date.now()}`);
  return safeJson<ModelStatusResponse>(r);
}

export async function fetchFeedbackSummary() {
  const r = await fetch(`${API_BASE}/feedback/summary?_=${Date.now()}`);
  return safeJson<FeedbackSummary>(r);
}

export async function submitBriefFeedback(payload: {
  verdict: "correct" | "too_conservative" | "missed_risk" | "wrong_reason";
  note?: string;
  brief: BriefResponse;
}) {
  const r = await fetch(`${API_BASE}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return safeJson<{ ok: boolean; item: any; summary: FeedbackSummary }>(r);
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
