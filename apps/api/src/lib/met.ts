// apps/api/src/lib/met.ts
type MetProvider = "auto" | "aviationweather" | "checkwx" | "avwx" | "noaa";
type MetKind = "metar" | "taf";

const provider = normalizeProvider(process.env.MET_PROVIDER || process.env.MET_API || "auto");
const MET_TOKEN = process.env.MET_TOKEN || "";
const CHECKWX_TOKEN = process.env.CHECKWX_TOKEN || MET_TOKEN;
const AVWX_TOKEN = process.env.AVWX_TOKEN || MET_TOKEN;
const MET_PROVIDER_TIMEOUT_MS = Number(process.env.MET_PROVIDER_TIMEOUT_MS ?? 3500);

function normalizeProvider(raw: string): MetProvider {
  const v = String(raw || "auto").trim().toLowerCase();
  if (v === "aviationweather" || v === "checkwx" || v === "avwx" || v === "noaa") {
    return v;
  }
  return "auto";
}

function noaaUrl(kind: MetKind, icao: string) {
  const up = icao.toUpperCase();
  return kind === "metar"
    ? `https://tgftp.nws.noaa.gov/data/observations/metar/stations/${up}.TXT`
    : `https://tgftp.nws.noaa.gov/data/forecasts/taf/stations/${up}.TXT`;
}

function providerUrl(kind: MetKind, icao: string, selected: Exclude<MetProvider, "auto">): string {
  const up = icao.toUpperCase();

  if (selected === "aviationweather") {
    return `https://aviationweather.gov/api/data/${kind}?ids=${up}&format=json`;
  }

  if (selected === "checkwx") {
    return kind === "metar"
      ? `https://api.checkwx.com/metar/${up}?format=json`
      : `https://api.checkwx.com/taf/${up}?format=json`;
  }

  if (selected === "avwx") {
    return kind === "metar"
      ? `https://avwx.rest/api/metar/${up}?format=json`
      : `https://avwx.rest/api/taf/${up}?format=json`;
  }

  return noaaUrl(kind, up);
}

function authHeaders(selected: Exclude<MetProvider, "auto">): Record<string, string> {
  const h: Record<string, string> = {
    "User-Agent": "flight-risk/0.1 (operational risk support; contact local developer)",
    Accept: "application/json,text/plain,*/*",
  };

  if (selected === "avwx" && AVWX_TOKEN) h.Authorization = `Bearer ${AVWX_TOKEN}`;
  if (selected === "checkwx" && CHECKWX_TOKEN) h["X-API-Key"] = CHECKWX_TOKEN;

  return h;
}

async function fetchWithTimeout(url: string, options: RequestInit = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), MET_PROVIDER_TIMEOUT_MS);

  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function providerOrder(): Exclude<MetProvider, "auto">[] {
  if (provider !== "auto") return [provider];

  const out: Exclude<MetProvider, "auto">[] = ["aviationweather"];
  if (CHECKWX_TOKEN) out.push("checkwx");
  if (AVWX_TOKEN) out.push("avwx");
  out.push("noaa");
  return out;
}

function pickNoaaMetarLine(icao: string, lines: string[]): string | null {
  const up = icao.toUpperCase();
  const clean = lines.map((s) => s.trim()).filter(Boolean);
  const byIcao = clean.find((l) => l.includes(up));
  if (byIcao) return byIcao;

  const byKeyword = clean.find((l) => /^METAR\s/.test(l));
  if (byKeyword) return byKeyword;

  const windLines = clean.filter((l) => RE_WIND.test(l));
  if (windLines.length) {
    return windLines.sort((a, b) => b.length - a.length)[0];
  }

  return clean.at(-1) ?? null;
}

async function fetchAddsMetarRaw(icao: string): Promise<string | null> {
  const up = icao.toUpperCase();
  const url =
    `https://aviationweather.gov/api/data/metar?ids=${encodeURIComponent(up)}` +
    `&format=xml&hours=4`;

  const r = await fetchWithTimeout(url, { headers: authHeaders("aviationweather") as HeadersInit });
  if (!r.ok) return null;

  const xml = await r.text();
  const m = xml.match(/<raw_text>([^<]+)<\/raw_text>/) || xml.match(/<rawOb>([^<]+)<\/rawOb>/);
  return m ? m[1].trim() : null;
}

function firstArrayItem(value: unknown): any {
  if (Array.isArray(value)) return value[0];
  return value;
}

function extractRawFromJson(kind: MetKind, data: any): string | null {
  const item = firstArrayItem(data?.data ?? data);
  const raw =
    item?.raw ||
    item?.raw_text ||
    item?.rawText ||
    item?.rawOb ||
    item?.rawTaf ||
    item?.rawTAF ||
    item?.metar ||
    item?.taf ||
    item?.text ||
    data?.raw ||
    data?.raw_text ||
    data?.[kind] ||
    null;

  return raw ? String(raw).replace(/\s+/g, " ").trim() : null;
}

function normalizeTextResponse(kind: MetKind, icao: string, text: string): string | null {
  const t = text.trim();
  if (!t) return null;

  const lines = t.split(/\r?\n/);
  if (kind === "metar") {
    return pickNoaaMetarLine(icao, lines);
  }

  const joined = lines.map((s) => s.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  const idx = joined.indexOf("TAF ");
  return (idx >= 0 ? joined.slice(idx) : joined) || null;
}

type FetchResult = {
  raw: string;
  providerName: Exclude<MetProvider, "auto">;
  fallbackUsed: boolean;
  fetchedAt: string;
  stale: boolean;
};

async function fetchFromProvider(
  kind: MetKind,
  icao: string,
  selected: Exclude<MetProvider, "auto">,
  fallbackUsed: boolean
): Promise<FetchResult | null> {
  if (selected === "checkwx" && !CHECKWX_TOKEN) return null;
  if (selected === "avwx" && !AVWX_TOKEN) return null;

  const url = providerUrl(kind, icao, selected);
  const r = await fetchWithTimeout(url, { headers: authHeaders(selected) as HeadersInit });

  if (r.status === 204) return null;
  if (!r.ok) return null;

  const contentType = r.headers.get("content-type") || "";
  let raw: string | null = null;

  if (contentType.includes("json") || selected === "aviationweather" || selected === "checkwx" || selected === "avwx") {
    raw = extractRawFromJson(kind, await r.json().catch(() => null));
  } else {
    raw = normalizeTextResponse(kind, icao, await r.text());
  }

  if (!raw) return null;

  return {
    raw,
    providerName: selected,
    fallbackUsed,
    fetchedAt: new Date().toISOString(),
    stale: false,
  };
}

async function fetchRaw(kind: MetKind, icao: string): Promise<FetchResult | null> {
  const order = providerOrder();

  for (let i = 0; i < order.length; i++) {
    const selected = order[i];

    try {
      const result = await fetchFromProvider(kind, icao, selected, i > 0);
      if (result) return result;
    } catch {
      // Try the next configured provider.
    }
  }

  if ((provider === "auto" || provider === "noaa") && kind === "metar") {
    try {
      const adds = await fetchAddsMetarRaw(icao);
      if (adds) {
        return {
          raw: adds,
          providerName: "aviationweather",
          fallbackUsed: true,
          fetchedAt: new Date().toISOString(),
          stale: false,
        };
      }
    } catch {}
  }

  return null;
}

const RE_WIND = /\b(\d{3}|VRB)(\d{2})(G(\d{2}))?KT\b/;
const RE_VIS_M = /\b(\d{4})\b/;
const RE_VIS_SM = /\b(?:P?)(\d+)(?:\/(\d+))?SM\b/;
const RE_CAVOK = /\bCAVOK\b/;
const RE_CEILING = /\b(BKN|OVC)(\d{3})\b/g;
const RE_WX = /\b(VA|TS|CB|SH|RA|SN|FG|BR|HZ|DZ|SG|PL|GR|GS|TSRA|SHRA|FZRA|FZDZ|SHSN)\b/g;

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

  // CAVOK = Ceiling And Visibility OK → vis 9999, ceiling yok
  if (RE_CAVOK.test(raw)) {
    out.vis = 9999;
  } else {
    // Önce metre (4 haneli), sonra statute miles dene
    const windEndIdx = w ? (raw.indexOf(w[0]) + w[0].length) : 0;
    const afterWind = raw.slice(windEndIdx);
    const vm = afterWind.match(RE_VIS_M);
    const vsm = raw.match(RE_VIS_SM);
    if (vm) {
      out.vis = Number(vm[1]);
    } else if (vsm) {
      // Statute miles → metre dönüşümü
      const whole = Number(vsm[1]);
      const frac = vsm[2] ? whole / Number(vsm[2]) : whole;
      out.vis = Math.round(frac * 1609.34);
    }
  }

  const allCeil = Array.from(raw.matchAll(RE_CEILING), (m) => Number(m[2]) * 100);
  if (allCeil.length) out.ceiling = Math.min(...allCeil);

  const ph = raw.match(RE_WX);
  if (ph) out.wx = Array.from(new Set(ph));

  return out;
}

export async function getMetar(icao: string) {
  const result = await fetchRaw("metar", icao);
  if (!result) return null;

  return {
    type: "METAR" as const,
    issued_at_utc: result.fetchedAt,
    raw: result.raw,
    parsed: parseMetarRaw(result.raw),
    source: "live" as const,
    providerName: result.providerName,
    fetchedAt: result.fetchedAt,
    fallbackUsed: result.fallbackUsed,
    stale: result.stale,
    live: true as const,
  };
}

export async function getTaf(icao: string) {
  const result = await fetchRaw("taf", icao);
  if (!result) return null;

  return {
    type: "TAF" as const,
    issued_at_utc: result.fetchedAt,
    raw: result.raw,
    source: "live" as const,
    providerName: result.providerName,
    fetchedAt: result.fetchedAt,
    fallbackUsed: result.fallbackUsed,
    stale: result.stale,
    live: true as const,
  };
}

export { provider };
