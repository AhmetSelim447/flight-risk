// apps/api/src/lib/met.ts
const provider = (process.env.MET_PROVIDER || process.env.MET_API || "noaa").toLowerCase();
const TOKEN = process.env.MET_TOKEN || "";

// --------- URL yardımcıları ----------
function noaaUrl(kind: "metar" | "taf", icao: string) {
  const up = icao.toUpperCase();
  return kind === "metar"
    ? `https://tgftp.nws.noaa.gov/data/observations/metar/stations/${up}.TXT`
    : `https://tgftp.nws.noaa.gov/data/forecasts/taf/stations/${up}.TXT`;
}

function providerUrl(kind: "metar" | "taf", icao: string): string {
  const up = icao.toUpperCase();
  if (provider === "checkwx") {
    return kind === "metar"
      ? `https://api.checkwx.com/metar/${up}?format=json`
      : `https://api.checkwx.com/taf/${up}?format=json`;
  }
  if (provider === "avwx") {
    return kind === "metar"
      ? `https://avwx.rest/api/metar/${up}?format=json`
      : `https://avwx.rest/api/taf/${up}?format=json`;
  }
  // default: NOAA
  return noaaUrl(kind, up);
}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  if (provider === "avwx" && TOKEN) h["Authorization"] = `Bearer ${TOKEN}`;
  if (provider === "checkwx" && TOKEN) h["X-API-Key"] = TOKEN;
  return h;
}

// --------- NOAA METAR satır seçici (akıllı) ----------
function pickNoaaMetarLine(icao: string, lines: string[]): string | null {
  const up = icao.toUpperCase();
  const clean = lines.map(s => s.trim()).filter(Boolean);
  // 1) ICAO içeren satır
  const byIcao = clean.find(l => l.includes(up));
  if (byIcao) return byIcao;
  // 2) "METAR " ile başlayan
  const byKeyword = clean.find(l => /^METAR\s/.test(l));
  if (byKeyword) return byKeyword;
  // 3) Rüzgâr regex’ine uyan en uzun satır
  const RE_WIND = /\b(\d{3}|VRB)(\d{2})(G(\d{2}))?KT\b/;
  const windLines = clean.filter(l => RE_WIND.test(l));
  if (windLines.length) {
    return windLines.sort((a, b) => b.length - a.length)[0];
  }
  // 4) Son satır
  return clean.at(-1) ?? null;
}

// --------- ADDS (aviationweather.gov) yedeği ----------
async function fetchAddsMetarRaw(icao: string): Promise<string | null> {
  const up = icao.toUpperCase();
  const url =
    `https://aviationweather.gov/adds/dataserver_current/httpparam?` +
    `dataSource=metars&requestType=retrieve&format=xml&hoursBeforeNow=4&mostRecentForEachStation=true&stationString=${up}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const xml = await r.text();
  // basit raw_text çıkarımı
  const m = xml.match(/<raw_text>([^<]+)<\/raw_text>/);
  return m ? m[1].trim() : null;
}

// --------- ham veri çekici ----------
async function fetchRaw(kind: "metar" | "taf", icao: string): Promise<string | null> {
  try {
    const url = providerUrl(kind, icao);
    const r = await fetch(url, { headers: authHeaders() as HeadersInit });
    if (!r.ok) {
      // NOAA METAR başarısızsa ADDS fallback (sadece METAR için)
      if (provider === "noaa" && kind === "metar") {
        const adds = await fetchAddsMetarRaw(icao);
        if (adds) return adds;
      }
      return null;
    }

    const ct = r.headers.get("content-type") || "";

    // NOAA: text/plain
    if (provider === "noaa" || ct.includes("text/plain")) {
      const t = (await r.text()).trim();
      const lines = t.split(/\r?\n/);
      if (kind === "metar") {
        const chosen = pickNoaaMetarLine(icao, lines);
        if (chosen) return chosen;
        // fallback: ADDS dene
        const adds = await fetchAddsMetarRaw(icao);
        return adds ?? null;
      }
      // TAF: çok satırı tek satır yap, "TAF " geçen yerden kes
      const joined = lines.map(s => s.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
      const idx = joined.indexOf("TAF ");
      return (idx >= 0 ? joined.slice(idx) : joined) || null;
    }

    // JSON sağlayıcılar (AVWX/CheckWX)
    const j = await r.json();
    const raw =
      j?.raw ||
      j?.raw_text ||
      j?.metar ||
      j?.data?.[0]?.raw_text ||
      j?.data?.[0]?.raw ||
      j?.[kind] ||
      j?.text ||
      null;
    return raw ? String(raw) : null;
  } catch {
    // NOAA için son çare ADDS (METAR)
    if (provider === "noaa" && kind === "metar") {
      try {
        const adds = await fetchAddsMetarRaw(icao);
        if (adds) return adds;
      } catch {}
    }
    return null;
  }
}

// --- Basit METAR parser ---
const RE_WIND = /\b(\d{3}|VRB)(\d{2})(G(\d{2}))?KT\b/;
const RE_VIS_M = /\b(\d{4})\b/;
const RE_CEILING = /\b(BKN|OVC)(\d{3})\b/g;

const RE_WX = /\b(VA|TS|CB|SH|RA|SN|FG|BR|HZ|DZ|SG|PL|GR|GS)\b/g;

export type ParsedMet = {
  wind_dir?: number;
  wind_spd?: number;
  gust?: number;
  vis?: number;
  ceiling?: number;
  wx?: string[];
};

function parseMetarRaw(raw: string): ParsedMet {
  const out: ParsedMet = {};
  const w = raw.match(RE_WIND);
  if (w) {
    if (w[1] !== "VRB") out.wind_dir = Number(w[1]);
    out.wind_spd = Number(w[2]);
    if (w[4]) out.gust = Number(w[4]);
  }
  const v = raw.match(RE_VIS_M);
  if (v) out.vis = Number(v[1]);
  const allCeil = Array.from(raw.matchAll(RE_CEILING), m => Number(m[2]) * 100);
  if (allCeil.length) out.ceiling = Math.min(...allCeil);
  const ph = raw.match(RE_WX);
  if (ph) out.wx = Array.from(new Set(ph));
  return out;
}

export async function getMetar(icao: string) {
  const raw = await fetchRaw("metar", icao);
  if (!raw) return null;
  return {
    type: "METAR" as const,
    issued_at_utc: new Date().toISOString(),
    raw,
    parsed: parseMetarRaw(raw),
    source: "live" as const,          // <- netleştir
    providerName: provider,           // <- "noaa" | "avwx" | "checkwx"
    live: true as const,              // <- boolean bayrak
  };
}

export async function getTaf(icao: string) {
  const raw = await fetchRaw("taf", icao);
  if (!raw) return null;
  return {
    type: "TAF" as const,
    issued_at_utc: new Date().toISOString(),
    raw,
    source: "live" as const,
    providerName: provider,
    live: true as const,
  };
}

export { provider };
