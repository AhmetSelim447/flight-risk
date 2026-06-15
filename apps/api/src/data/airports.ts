// apps/api/src/data/airports.ts
import { fetchOurAirports, loadAirportsFromCache } from "./airports.loader";

// ---- Tipler ----
export type Runway = { id: string; heading: number; length_m?: number };
export type AirportRow = {
  icao: string;
  iata?: string;
  city?: string;
  name?: string;
  coords?: { lat: number; lng: number };
  runways?: Runway[];
  crossLimit?: number;
};

// ---- Küçük offline fallback (internet yoksa) ----
const inlineSeed: AirportRow[] = [
  {
    icao: "LTFM",
    iata: "IST",
    city: "Istanbul",
    name: "Istanbul Airport",
    coords: { lat: 41.275, lng: 28.751 },
    runways: [
      { id: "17L/35R", heading: 350, length_m: 4100 },
      { id: "17R/35L", heading: 350, length_m: 4100 },
    ],
    crossLimit: 15,
  },
  {
    icao: "LTFJ",
    iata: "SAW",
    city: "Istanbul",
    name: "Sabiha Gokcen",
    coords: { lat: 40.904, lng: 29.309 },
    runways: [{ id: "06/24", heading: 240, length_m: 3000 }],
    crossLimit: 15,
  },
  {
    icao: "LTBA",
    iata: "ISL",
    city: "Istanbul",
    name: "Ataturk (GA)",
    coords: { lat: 40.976, lng: 28.814 },
    runways: [{ id: "05/23", heading: 230, length_m: 3000 }],
    crossLimit: 15,
  },
  {
    icao: "LTAC",
    iata: "ESB",
    city: "Ankara",
    name: "Esenboga",
    coords: { lat: 40.128, lng: 32.995 },
    runways: [
      { id: "03/21", heading: 30, length_m: 3750 },
      { id: "03L/21R", heading: 30, length_m: 3750 },
    ],
    crossLimit: 15,
  },
  {
    icao: "LTBJ",
    iata: "ADB",
    city: "Izmir",
    name: "Adnan Menderes",
    coords: { lat: 38.292, lng: 27.157 },
    runways: [
      { id: "16L/34R", heading: 160, length_m: 3240 },
      { id: "16R/34L", heading: 160, length_m: 3240 },
    ],
    crossLimit: 15,
  },
  {
    icao: "LTBS",
    iata: "DLM",
    city: "Mugla",
    name: "Dalaman",
    coords: { lat: 36.713, lng: 28.792 },
    runways: [{ id: "01/19", heading: 10, length_m: 3000 }],
    crossLimit: 15,
  },
  {
    icao: "LTCA",
    iata: "EZS",
    city: "Elazig",
    name: "Elazig Airport",
    coords: { lat: 38.598, lng: 39.283 },
    runways: [
      { id: "07/25", heading: 70, length_m: 3000 },
      { id: "13/31", heading: 130, length_m: 3000 },
    ],
    crossLimit: 15,
  },
];

// ---- Bellek içi cache + kaynak etiketi ----
let AIRPORTS_CACHE: AirportRow[] = [];
let AIRPORTS_SOURCE: "inline" | "cache" | "remote" = "inline";
let AIRPORTS_LOADED_AT = 0;

// concurrency guard: aynı anda 100 istek gelse bile tek load çalışır
let loadingPromise: Promise<void> | null = null;

// TTL: “data taze mi?” (remote’u çok sık çekme)
const REMOTE_TTL_MS = Number(process.env.AIRPORTS_REMOTE_TTL_MS ?? 1000 * 60 * 60 * 6); // 6h

// Cooldown: TTL dolsa bile her request’te remote fetch tetiklenmesin
const REMOTE_COOLDOWN_MS = Number(process.env.AIRPORTS_REMOTE_COOLDOWN_MS ?? 1000 * 60 * 10); // 10dk
let lastRemoteAttemptAt = 0;

function now() {
  return Date.now();
}
function safeArr(x: any): x is any[] {
  return Array.isArray(x);
}
function normStr(s: any) {
  return String(s ?? "").trim();
}

// ✅ istenen: normalizeAirportRow (export)
export function normalizeAirportRow(a: any): AirportRow | null {
  const icao = normStr(a?.icao).toUpperCase();
  if (!icao || icao.length !== 4) return null;

  const coordsOk = a?.coords && typeof a.coords.lat === "number" && typeof a.coords.lng === "number";

  const out: AirportRow = {
    icao,
    iata: a?.iata ? normStr(a.iata).toUpperCase() : undefined,
    city: a?.city ? normStr(a.city) : undefined,
    name: a?.name ? normStr(a.name) : undefined,
    coords: coordsOk ? { lat: a.coords.lat, lng: a.coords.lng } : undefined,
    runways: safeArr(a?.runways) ? a.runways : undefined,
    crossLimit: typeof a?.crossLimit === "number" ? a.crossLimit : undefined,
  };

  return out;
}

/**
 * Boot’ta (veya ilk request’te) çağrılır.
 * - Aynı anda 10 kere çağrılsa bile tek load çalışır (loadingPromise)
 * - Remote fetch TTL + cooldown ile spamlenmez
 * - cache → remote → inline fallback
 * - SAFE: throw etmez
 */
export async function ensureAirportsReady(opts?: { forceRemote?: boolean }) {
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      const hasData = Array.isArray(AIRPORTS_CACHE) && AIRPORTS_CACHE.length > 0;
      const isFresh = hasData && AIRPORTS_LOADED_AT > 0 && now() - AIRPORTS_LOADED_AT < REMOTE_TTL_MS;

      // 1) Disk cache (sadece hiç data yoksa)
      if (!hasData) {
        try {
          const cached = await loadAirportsFromCache();
          if (safeArr(cached) && cached.length) {
            const normalized = cached.map(normalizeAirportRow).filter(Boolean) as AirportRow[];
            if (normalized.length) {
              AIRPORTS_CACHE = normalized;
              AIRPORTS_SOURCE = "cache";
              AIRPORTS_LOADED_AT = now();
              console.log(`[airports] cache: ${normalized.length}`);
            }
          }
        } catch (e: any) {
          console.warn("[airports] cache load failed:", e?.message || e);
        }
      }

      // 2) Remote fetch (TTL dolduysa veya forceRemote)
      const wantRemote = !!opts?.forceRemote || !isFresh;

      // cooldown
      const allowAttempt = opts?.forceRemote || now() - lastRemoteAttemptAt > REMOTE_COOLDOWN_MS;

      if (wantRemote && allowAttempt) {
        lastRemoteAttemptAt = now();
        try {
          const fresh = await fetchOurAirports();
          if (safeArr(fresh) && fresh.length) {
            const normalized = fresh.map(normalizeAirportRow).filter(Boolean) as AirportRow[];
            if (normalized.length) {
              AIRPORTS_CACHE = normalized;
              AIRPORTS_SOURCE = "remote";
              AIRPORTS_LOADED_AT = now();
              console.log(`[airports] remote: ${normalized.length}`);
            }
          }
        } catch (e: any) {
          console.warn("[airports] remote fetch failed:", e?.message || e);
        }
      }

      // 3) Hâlâ boşsa inline seed
      if (!Array.isArray(AIRPORTS_CACHE) || AIRPORTS_CACHE.length === 0) {
        AIRPORTS_CACHE = inlineSeed;
        AIRPORTS_SOURCE = "inline";
        AIRPORTS_LOADED_AT = now();
        console.log(`[airports] inline: ${inlineSeed.length}`);
      }
    } catch {
      // SAFE fallback
      AIRPORTS_CACHE = inlineSeed;
      AIRPORTS_SOURCE = "inline";
      AIRPORTS_LOADED_AT = now();
    }
  })().finally(() => {
    loadingPromise = null;
  });

  return loadingPromise;
}

// ---- Getter’lar ----
export function getAirports(): AirportRow[] {
  return AIRPORTS_CACHE ?? [];
}
export function getAirportsSource(): string {
  return AIRPORTS_SOURCE;
}
export function getAirportsLoadedAt(): number {
  return AIRPORTS_LOADED_AT;
}

export function byICAO(icao: string) {
  const code = String(icao || "").toUpperCase();
  return (AIRPORTS_CACHE ?? []).find((a) => a.icao?.toUpperCase() === code);
}

/**
 * Türkçe karakter normalizasyonu: İ→I, ı→I, Ş→S, Ğ→G, Ü→U, Ö→O, Ç→C
 * Böylece "İstanbul" ve "Istanbul" aynı sonucu verir.
 */
function normalizeTR(s: string): string {
  return s
    .replace(/İ/g, "I")
    .replace(/ı/g, "I")
    .replace(/Ş/g, "S").replace(/ş/g, "S")
    .replace(/Ğ/g, "G").replace(/ğ/g, "G")
    .replace(/Ü/g, "U").replace(/ü/g, "U")
    .replace(/Ö/g, "O").replace(/ö/g, "O")
    .replace(/Ç/g, "C").replace(/ç/g, "C")
    .toUpperCase();
}

/**
 * SAFE search: asla throw etmez.
 * - Min 2 char
 * - Ranking: icao exact / iata exact / prefix / includes...
 * - Türkçe karakter desteği (İ/I, Ş/S, Ğ/G vb.)
 */
export function searchAirports(q: string, limit = 50): AirportRow[] {
  try {
    const Q = normalizeTR(String(q || "").trim());
    if (Q.length < 2) return [];

    const list = AIRPORTS_CACHE ?? [];
    if (!Array.isArray(list) || list.length === 0) return [];

    const score = (a: AirportRow) => {
      const icao = normalizeTR(a.icao || "");
      const iata = normalizeTR(a.iata || "");
      const city = normalizeTR(a.city || "");
      const name = normalizeTR(a.name || "");

      if (icao === Q) return 0;
      if (iata === Q) return 1;
      if (icao.startsWith(Q)) return 2;
      if (iata.startsWith(Q)) return 3;
      if (city.startsWith(Q)) return 4;
      if (name.startsWith(Q)) return 5;
      if (icao.includes(Q)) return 6;
      if (iata.includes(Q)) return 7;
      if (city.includes(Q)) return 8;
      if (name.includes(Q)) return 9;
      return 999;
    };

    const max = Math.max(1, Math.min(200, Number(limit) || 50));

    return list
      .filter((a) => {
        const icao = normalizeTR(a.icao || "");
        const iata = normalizeTR(a.iata || "");
        const city = normalizeTR(a.city || "");
        const name = normalizeTR(a.name || "");
        return icao.includes(Q) || iata.includes(Q) || city.includes(Q) || name.includes(Q);
      })
      .sort((a, b) => score(a) - score(b))
      .slice(0, max);
  } catch {
    return [];
  }
}
