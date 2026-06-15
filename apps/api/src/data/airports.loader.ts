// apps/api/src/data/airports.loader.ts
import * as fs from "fs";
import * as path from "path";

// ---- Domain tipleri ----
export type Runway = { id: string; heading: number; length_m?: number };
export type AirportRow = {
  icao: string;
  iata?: string;
  city?: string;
  name?: string;
  coords?: { lat: number; lng: number };
  runways?: Runway[];
  crossLimit?: number; // kt
};

// ---- Yardımcılar ----
function toNumber(x: any): number | undefined {
  const s = String(x ?? "").trim();
  if (s === "") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}
function feetToMeters(ft?: number): number | undefined {
  if (!Number.isFinite(ft)) return undefined;
  return Math.round((ft as number) * 0.3048);
}
function headingFromDesignator(des?: string): number | undefined {
  if (!des) return undefined;
  const m = String(des).trim().match(/^(\d{2})[LRC]?$/i);
  if (!m) return undefined;
  let hdg = (Number(m[1]) % 36) * 10;
  if (hdg === 0) hdg = 360;
  return hdg;
}

// Tırnak/kaçış destekli tek satır CSV ayırıcı
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

// Basit CSV parser: başlıkları normalize eder (trim + lowercase)
function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  lines[0] = lines[0].replace(/^\uFEFF/, ""); // BOM temizle

  const rawHeader = splitCsvLine(lines[0]);
  const header = rawHeader.map((h) => h.trim().toLowerCase());

  const rows: Array<Record<string, string>> = [];
  for (let li = 1; li < lines.length; li++) {
    const cols = splitCsvLine(lines[li]);
    const obj: Record<string, string> = {};
    for (let i = 0; i < header.length; i++) obj[header[i]] = cols[i] ?? "";
    rows.push(obj);
  }
  return rows;
}

const get = (row: Record<string, string>, key: string) => (row[key] ?? "").trim();

// ---- Cache ----
const CACHE_DIR = path.join(__dirname, "..", "..", "data-cache");
const CACHE_PATH = path.join(CACHE_DIR, "airports.generated.json");

export async function loadAirportsFromCache(): Promise<any[] | null> {
  try {
    if (!fs.existsSync(CACHE_PATH)) return null;
    const raw = fs.readFileSync(CACHE_PATH, "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data) && data.length ? data : null;
  } catch {
    return null;
  }
}

async function saveAirportsToCache(rows: any[]) {
  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(rows, null, 2), "utf8");
    console.log(`[airports.loader] cache written: ${CACHE_PATH} (${rows.length})`);
  } catch (e) {
    console.warn("[airports.loader] cache write failed:", (e as any)?.message || e);
  }
}

// ---- Fetch helpers ----
async function getFetch(): Promise<typeof fetch> {
  // Node 18+ global fetch var, yoksa node-fetch fallback
  // @ts-ignore
  if (typeof fetch !== "undefined") return fetch;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require("node-fetch");
}

async function fetchTextWithTimeout(url: string, timeoutMs: number): Promise<string> {
  const f = await getFetch();
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const res = await f(
      url,
      {
        headers: { "User-Agent": "flight-risk/0.1" },
        signal: ac.signal,
      } as any
    );

    if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
    const text = await res.text();

    // HTML/rate-limit content koruması
    const head = text.slice(0, 250).toLowerCase();
    if (!text.trim() || head.includes("<html") || head.includes("<!doctype html") || head.includes("<head")) {
      throw new Error("invalid content (empty or html)");
    }

    return text;
  } catch (e: any) {
    const msg = e?.name === "AbortError" ? `timeout (${timeoutMs}ms)` : e?.message || String(e);
    throw new Error(msg);
  } finally {
    clearTimeout(t);
  }
}

const SOURCES = [
  {
    tag: "ourairports.com",
    airports: "https://ourairports.com/data/airports.csv",
    runways: "https://ourairports.com/data/runways.csv",
  },
];

// ---- Canlıdan çekme + TR filtresi ----
export async function fetchOurAirports(opts?: { timeoutMs?: number; retries?: number }): Promise<AirportRow[]> {
  const timeoutMs = Number(opts?.timeoutMs ?? 20_000);
  const retries = Math.max(0, Number(opts?.retries ?? 1));

  let lastErr: any = null;

  for (const src of SOURCES) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        console.log(`[airports.loader] fetching from ${src.tag} ... (attempt ${attempt + 1}/${retries + 1})`);

        const [aText, rText] = await Promise.all([
          fetchTextWithTimeout(src.airports, timeoutMs),
          fetchTextWithTimeout(src.runways, timeoutMs),
        ]);

        const aRows = parseCsv(aText);
        const rRows = parseCsv(rText);
        console.log(`[airports.loader] fetched rows: airports=${aRows.length}, runways=${rRows.length}`);

        // 1) TR filtresi
        const wanted = new Map<string, AirportRow>();
        let seenTR = 0;

        for (const row of aRows) {
          const type = get(row, "type").toLowerCase();
          const iso = get(row, "iso_country").toUpperCase();
          const region = get(row, "iso_region").toUpperCase();
          const countryName = (get(row, "country") || get(row, "country_name")).toLowerCase();

          const isTR = iso === "TR" || region.startsWith("TR-") || countryName === "turkey";
          if (isTR) seenTR++;

          if (!["large_airport", "medium_airport", "small_airport"].includes(type)) continue;
          if (!isTR) continue;

          const ident = get(row, "ident").toUpperCase();
          if (!ident || ident.length < 4) continue;

          const lat = toNumber(get(row, "latitude_deg"));
          const lng = toNumber(get(row, "longitude_deg"));
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

          wanted.set(ident, {
            icao: ident,
            iata: get(row, "iata_code") || undefined,
            city: get(row, "municipality") || undefined,
            name: get(row, "name") || undefined,
            coords: { lat: lat!, lng: lng! },
            runways: [],
            crossLimit: 15,
          });
        }

        console.log(`[airports.loader] TR airports seen=${seenTR}, kept(with coords & type)=${wanted.size}`);

        // 2) Pist attach
        let attached = 0;
        for (const rr of rRows) {
          const icao = get(rr, "airport_ident").toUpperCase();
          const ap = wanted.get(icao);
          if (!ap) continue;

          const le = get(rr, "le_ident").toUpperCase();
          const he = get(rr, "he_ident").toUpperCase();

          const leH = toNumber(get(rr, "le_heading_degT"));
          const heH = toNumber(get(rr, "he_heading_degT"));

          const heading =
            Number.isFinite(leH) ? Math.round(leH as number)
            : Number.isFinite(heH) ? Math.round(heH as number)
            : headingFromDesignator(le) ?? headingFromDesignator(he);

          if (heading == null) continue;

          const lenM = feetToMeters(toNumber(get(rr, "length_ft")));
          const id = le && he ? `${le}/${he}` : le ? le : he ? he : "RWY";

          (ap.runways as Runway[]).push({ id, heading, length_m: lenM });
          attached++;
        }

        console.log(`[airports.loader] runways attached: ${attached}`);

        const finalList = Array.from(wanted.values()).filter((a) => Array.isArray(a.runways) && a.runways.length > 0);
        console.log(`[airports.loader] TR airports with runways: ${finalList.length} (source=${src.tag})`);

        if (!finalList.length) throw new Error("parsed zero airports for TR");

        await saveAirportsToCache(finalList);
        return finalList;
      } catch (e: any) {
        lastErr = e;
        console.warn(`[airports.loader] ${src.tag} failed (attempt ${attempt + 1}/${retries + 1}):`, e?.message || e);
        if (attempt < retries) continue;
      }
    }
  }

  throw lastErr || new Error("all sources failed");
}
