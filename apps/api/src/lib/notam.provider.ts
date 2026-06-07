// apps/api/src/lib/notam.provider.ts

import type { NotamItem, NotamProvider } from "./notam.types";
import { simulatedNotamProvider } from "./notam.simulated";

type ProviderName = "simulated" | "live" | "skylink" | "laminar";

function normalizeProviderName(raw?: string): ProviderName {
  const v = String(raw || "simulated").trim().toLowerCase();
  if (v === "laminar" || v === "cirium") return "laminar";
  if (v === "skylink") return "skylink";
  if (v === "live") return "live";
  return "simulated";
}

function notamTimeoutMs() {
  const n = Number(process.env.NOTAM_PROVIDER_TIMEOUT_MS ?? 5000);
  return Number.isFinite(n) && n > 0 ? n : 5000;
}

async function fetchWithTimeout(url: string, options: RequestInit = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), notamTimeoutMs());
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function inferSeverity(text: string): "Critical" | "Medium" | "Info" {
  const t = text.toUpperCase();
  if (/(RWY|RUNWAY).*(CLSD|CLOSED)|CLSD.*(RWY|RUNWAY)|ILS.*(U\/S|OUT OF SERVICE|UNSERVICEABLE)/.test(t)) {
    return "Critical";
  }
  if (/(PAPI|VOR|DME|GNSS|LIGHT|LGT|TAXI|APRON|AD OPR HR|AIRSPACE|RESTRICTED)/.test(t)) {
    return "Medium";
  }
  return "Info";
}

function normalizeLiveNotams(json: any, icao: string): NotamItem[] {
  const items = Array.isArray(json)
    ? json
    : Array.isArray(json?.data)
      ? json.data
      : Array.isArray(json?.notams)
        ? json.notams
        : Array.isArray(json?.results)
          ? json.results
          : [];

  return items
    .map((item: any, idx: number): NotamItem | null => {
      const text = String(
        item?.text ||
          item?.raw ||
          item?.notam ||
          item?.message ||
          item?.description ||
          ""
      ).trim();
      if (!text) return null;
      const severity = inferSeverity(text);
      return {
        id: String(item?.id || item?.notam_id || item?.number || `${icao}-LIVE-${idx + 1}`),
        text,
        critical: severity === "Critical",
        synthetic: false,
        severity,
        validFrom: item?.validFrom || item?.valid_from || item?.start || item?.effectiveStart || item?.effective,
        validTo: item?.validTo || item?.valid_to || item?.end || item?.effectiveEnd || item?.expiration,
      };
    })
    .filter(Boolean) as NotamItem[];
}

function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLaminarNotams(json: any, icao: string): NotamItem[] {
  const features = Array.isArray(json?.features) ? json.features : [];

  return features
    .map((feature: any, idx: number): NotamItem | null => {
      const props = feature?.properties || {};
      const translation = Array.isArray(props?.translations) ? props.translations[0] : undefined;
      const text = stripHtml(
        String(
          props?.text ||
            translation?.simpleText ||
            translation?.formattedText ||
            feature?.text ||
            ""
        )
      );
      if (!text) return null;

      const severity = inferSeverity(text);
      const idParts = [props?.series, props?.number, props?.year].filter(Boolean).join("-");
      return {
        id: String(feature?.id || idParts || `${icao}-LAMINAR-${idx + 1}`),
        text,
        critical: severity === "Critical",
        synthetic: false,
        severity,
        validFrom: props?.effectiveStart,
        validTo: props?.effectiveEnd,
      };
    })
    .filter(Boolean) as NotamItem[];
}

const skylinkNotamProvider: NotamProvider = {
  name: "skylink",
  async getNotam(icao: string): Promise<NotamItem[]> {
    const key = process.env.SKYLINK_API_KEY || "";
    if (!key) return simulatedNotamProvider.getNotam(icao);

    const host = process.env.SKYLINK_API_HOST || "skylink-api.p.rapidapi.com";
    const base = (process.env.SKYLINK_API_URL || `https://${host}/notams`).replace(/\/+$/, "");
    try {
      const response = await fetchWithTimeout(`${base}/${encodeURIComponent(icao.toUpperCase())}`, {
        headers: {
          Accept: "application/json",
          "X-RapidAPI-Key": key,
          "X-RapidAPI-Host": host,
        },
      });
      if (!response.ok) return simulatedNotamProvider.getNotam(icao);
      const normalized = normalizeLiveNotams(await response.json(), icao.toUpperCase());
      return normalized.length ? normalized : simulatedNotamProvider.getNotam(icao);
    } catch {
      return simulatedNotamProvider.getNotam(icao);
    }
  },
};

const laminarNotamProvider: NotamProvider = {
  name: "laminar",
  async getNotam(icao: string): Promise<NotamItem[]> {
    const key =
      process.env.LAMINAR_USER_KEY ||
      process.env.LAMINAR_API_KEY ||
      process.env.CIRIUM_LAMINAR_USER_KEY ||
      process.env.NOTAM_API_KEY ||
      "";
    if (!key) return simulatedNotamProvider.getNotam(icao);

    const base = (
      process.env.LAMINAR_NOTAM_API_URL ||
      "https://api.laminardata.aero/v2/aerodromes"
    ).replace(/\/+$/, "");
    const url = new URL(`${base}/${encodeURIComponent(icao.toUpperCase())}/notams`);
    url.searchParams.set("user_key", key);

    try {
      const response = await fetchWithTimeout(url.toString(), {
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip",
        },
      });
      if (!response.ok) return simulatedNotamProvider.getNotam(icao);
      return normalizeLaminarNotams(await response.json(), icao.toUpperCase());
    } catch {
      return simulatedNotamProvider.getNotam(icao);
    }
  },
};

const liveNotamProvider: NotamProvider = {
  name: "live",
  async getNotam(icao: string): Promise<NotamItem[]> {
    // Şimdilik gerçek sağlayıcı bağlı değil.
    // Sistemi bozmamak için kontrollü fallback yapıyoruz.
    return simulatedNotamProvider.getNotam(icao);
  },
};

export function getNotamProvider(): NotamProvider {
  const provider = normalizeProviderName(process.env.NOTAM_PROVIDER);

  if (provider === "skylink") {
    return skylinkNotamProvider;
  }

  if (provider === "laminar") {
    return laminarNotamProvider;
  }

  if (provider === "live") {
    return liveNotamProvider;
  }

  return simulatedNotamProvider;
}
