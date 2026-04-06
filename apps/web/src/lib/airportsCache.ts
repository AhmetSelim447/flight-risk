import type { AirportRow } from "./api";
import { searchAirports } from "./api";

type CacheEntry = { value: AirportRow | null; ts: number };

// in-memory
const mem = new Map<string, CacheEntry>();

// inflight per ICAO
const inflight = new Map<string, Promise<AirportRow | null>>();

// localStorage
const LS_KEY = "airportsCache:v1";

// TTL (mem + localStorage)
const TTL_MS = Number(import.meta.env.VITE_AIRPORTS_CACHE_TTL_MS ?? 1000 * 60 * 60 * 12);

// API cooldown (global spam engeli)
const API_COOLDOWN_MS = Number(import.meta.env.VITE_AIRPORTS_API_COOLDOWN_MS ?? 250);
let lastApiHitAt = 0;

// localStorage büyümesini sınırlamak için (basit prune)
const LS_MAX_KEYS = Number(import.meta.env.VITE_AIRPORTS_CACHE_MAX_KEYS ?? 500);

// ✅ localStorage write debounce
const LS_WRITE_DEBOUNCE_MS = Number(import.meta.env.VITE_AIRPORTS_CACHE_LS_DEBOUNCE_MS ?? 250);
let lsWriteTimer: number | null = null;
let pendingLS: Record<string, CacheEntry> | null = null;

function now() {
  return Date.now();
}

function normIcao(icao: string) {
  return String(icao || "").trim().toUpperCase();
}

function hasValidCoords(a: any): a is AirportRow {
  const c = a?.coords;
  return c && typeof c.lat === "number" && Number.isFinite(c.lat) && typeof c.lng === "number" && Number.isFinite(c.lng);
}

function loadLS(): Record<string, CacheEntry> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return {};
    return obj;
  } catch {
    return {};
  }
}

function flushLSWrite() {
  if (!pendingLS) return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(pendingLS));
  } catch {
    // no-op
  } finally {
    pendingLS = null;
    if (lsWriteTimer != null) {
      window.clearTimeout(lsWriteTimer);
      lsWriteTimer = null;
    }
  }
}

function saveLS(obj: Record<string, CacheEntry>) {
  // debounce: art arda 50 set olursa 1 yaz
  pendingLS = obj;
  if (lsWriteTimer != null) return;
  lsWriteTimer = window.setTimeout(() => flushLSWrite(), LS_WRITE_DEBOUNCE_MS);
}

function getFromLS(key: string): CacheEntry | null {
  const store = loadLS();
  const e = store[key];
  if (!e || typeof e !== "object") return null;
  if (typeof (e as any).ts !== "number") return null;

  if (now() - (e as any).ts > TTL_MS) return null;

  const v = (e as CacheEntry).value;
  if (v && !hasValidCoords(v)) return { value: null, ts: (e as any).ts };

  return e as CacheEntry;
}

function pruneLS(store: Record<string, CacheEntry>) {
  try {
    const keys = Object.keys(store);
    if (keys.length <= LS_MAX_KEYS) return;

    keys
      .sort((a, b) => (store[a]?.ts ?? 0) - (store[b]?.ts ?? 0))
      .slice(0, Math.max(0, keys.length - LS_MAX_KEYS))
      .forEach((k) => delete store[k]);
  } catch {
    // no-op
  }
}

function setToLS(key: string, entry: CacheEntry) {
  const store = loadLS();
  store[key] = entry;
  pruneLS(store);
  saveLS(store);
}

async function cooldown() {
  const dt = now() - lastApiHitAt;
  if (dt >= API_COOLDOWN_MS) return;
  await new Promise((r) => setTimeout(r, API_COOLDOWN_MS - dt));
}

async function fetchByIcaoFromApi(key: string): Promise<AirportRow | null> {
  const res = await searchAirports(key);
  const matches = res?.matches ?? [];
  const best = matches.find((m) => normIcao(m?.icao) === key) ?? matches[0];
  if (!best) return null;
  if (!hasValidCoords(best)) return null;
  return best;
}

export async function getAirportByIcaoCached(icao: string): Promise<AirportRow | null> {
  const key = normIcao(icao);
  if (!key || key.length !== 4) return null;

  const hit = mem.get(key);
  const memFresh = hit && now() - hit.ts < TTL_MS;

  if (memFresh) {
    if (hit!.value && !hasValidCoords(hit!.value)) return null;
    return hit!.value;
  }

  // mem stale ise: localStorage taze varsa onu kullan
  const lsMaybe = getFromLS(key);
  if (lsMaybe) {
    mem.set(key, lsMaybe);
    return lsMaybe.value;
  }

  // stale-while-revalidate
  if (hit) {
    if (!inflight.get(key)) {
      const bg = (async () => {
        try {
          await cooldown();
          lastApiHitAt = now();

          const fresh = await fetchByIcaoFromApi(key);
          const entry: CacheEntry = { value: fresh, ts: now() };
          mem.set(key, entry);
          setToLS(key, entry);
          return fresh;
        } catch {
          return null;
        } finally {
          inflight.delete(key);
        }
      })();
      inflight.set(key, bg);
    }

    if (hit.value && !hasValidCoords(hit.value)) return null;
    return hit.value;
  }

  const existing = inflight.get(key);
  if (existing) return existing;

  const p = (async () => {
    try {
      await cooldown();
      lastApiHitAt = now();

      const fresh = await fetchByIcaoFromApi(key);
      const entry: CacheEntry = { value: fresh, ts: now() };
      mem.set(key, entry);
      setToLS(key, entry);
      return fresh;
    } catch {
      const entry: CacheEntry = { value: null, ts: now() };
      mem.set(key, entry);
      setToLS(key, entry);
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, p);
  return p;
}

export function _airportsCacheClear() {
  mem.clear();
  inflight.clear();
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    // no-op
  }
}
