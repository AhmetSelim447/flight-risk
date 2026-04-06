// apps/api/src/index.ts
import express from "express";
import cors from "cors";
import PDFDocument from "pdfkit";

import fs from "fs";
import path from "path";

// ✅ Swagger UI
import swaggerUi from "swagger-ui-express";

import { apiRateLimit } from "./middlewares/ratelimit";
import { requestTimeout } from "./middlewares/timeout";

import { haversineKm } from "./lib/geo";
import { windComponents, riskScore } from "./lib/risk";
import { getMetar, getTaf } from "./lib/met";
import { getNotam } from "./lib/notam";
import {
  getTrafficByBBox,
  getTrafficCacheTtlMs,
  isValidTrafficBBox,
} from "./lib/traffic";

import {
  ensureAirportsReady,
  getAirports,
  getAirportsSource,
  getAirportsLoadedAt,
  searchAirports,
  byICAO,
} from "./data/airports";

const app = express();
app.use(cors());
app.use(express.json());

// dayanıklılık
app.use(apiRateLimit as any);
app.use(requestTimeout(15_000));

/* ================= Swagger Spec (NO JSDOC PARSE) ================= */
type OpenApiDoc = Record<string, any>;

const openapi: OpenApiDoc = {
  openapi: "3.0.0",
  info: {
    title: "Flight-Risk API",
    version: "1.0.0",
    description: "METAR/TAF/NOTAM + risk scoring + airports search/near + PDF brief endpoints",
  },
  servers: [{ url: "http://localhost:4000" }],
  paths: {
    "/health": {
      get: {
        summary: "Health check",
        responses: { "200": { description: "API is up" } },
      },
    },
    "/airports/search": {
      get: {
        summary: "Search airports (ICAO/IATA/city/name)",
        parameters: [
          { in: "query", name: "q", required: true, schema: { type: "string", example: "LT" } },
          { in: "query", name: "limit", required: false, schema: { type: "integer", default: 50, minimum: 1, maximum: 200 } },
        ],
        responses: { "200": { description: "Matches" } },
      },
    },
    "/airports/near": {
      get: {
        summary: "Airports near a coordinate",
        parameters: [
          { in: "query", name: "lat", required: true, schema: { type: "number", example: 41.275 } },
          { in: "query", name: "lng", required: true, schema: { type: "number", example: 28.751 } },
          { in: "query", name: "max_km", required: false, schema: { type: "number", default: 200 } },
          { in: "query", name: "limit", required: false, schema: { type: "integer", default: 50, minimum: 1, maximum: 200 } },
        ],
        responses: { "200": { description: "Matches with distances" } },
      },
    },
    "/airports/reload": {
      get: {
        summary: "Reload airports cache (optional force remote)",
        parameters: [{ in: "query", name: "force", required: false, schema: { type: "boolean", default: false } }],
        responses: { "200": { description: "Reload result" } },
      },
      post: {
        summary: "Reload airports cache (optional force remote)",
        parameters: [{ in: "query", name: "force", required: false, schema: { type: "boolean", default: false } }],
        responses: { "200": { description: "Reload result" } },
      },
    },
    "/traffic": {
      get: {
        summary: "Get live aircraft traffic in a bounding box",
        parameters: [
          {
            in: "query",
            name: "bbox",
            required: false,
            schema: { type: "string", example: "26,36,45,42" },
            description: "Bounding box as minLon,minLat,maxLon,maxLat",
          },
          {
            in: "query",
            name: "minLon",
            required: false,
            schema: { type: "number", example: 26 },
          },
          {
            in: "query",
            name: "minLat",
            required: false,
            schema: { type: "number", example: 36 },
          },
          {
            in: "query",
            name: "maxLon",
            required: false,
            schema: { type: "number", example: 45 },
          },
          {
            in: "query",
            name: "maxLat",
            required: false,
            schema: { type: "number", example: 42 },
          },
        ],
        responses: {
          "200": {
            description: "Live traffic list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", example: true },
                    source: { type: "string", example: "opensky" },
                    live: { type: "boolean", example: true },
                    cachedTtlMs: { type: "number", example: 15000 },
                    bbox: {
                      type: "object",
                      properties: {
                        minLon: { type: "number", example: 26 },
                        minLat: { type: "number", example: 36 },
                        maxLon: { type: "number", example: 45 },
                        maxLat: { type: "number", example: 42 },
                      },
                    },
                    count: { type: "number", example: 12 },
                    aircraft: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string", example: "4b180c" },
                          icao24: { type: "string", example: "4b180c" },
                          callsign: { type: "string", example: "THY2AB" },
                          originCountry: { type: "string", example: "Türkiye" },
                          lat: { type: "number", example: 41.12 },
                          lon: { type: "number", example: 28.74 },
                          heading: { type: "number", example: 92 },
                          altitudeFt: { type: "number", example: 32000 },
                          speedKt: { type: "number", example: 430 },
                          onGround: { type: "boolean", example: false },
                          source: { type: "string", example: "opensky" },
                          updatedAt: { type: "number", example: 1772890000000 },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": { description: "Invalid bbox" },
          "502": { description: "Traffic provider fetch failed" },
        },
      },
    },
    "/brief": {
      get: {
        summary: "Build brief for DEP/ARR",
        parameters: [
          { in: "query", name: "dep", required: true, schema: { type: "string", example: "LTAD" } },
          { in: "query", name: "arr", required: true, schema: { type: "string", example: "LTCA" } },
          { in: "query", name: "crossLimit", required: false, schema: { type: "number", example: 15 } },
        ],
        responses: {
          "200": { description: "Brief JSON" },
          "400": { description: "Bad request" },
        },
      },
    },
    "/brief/pdf": {
      get: {
        summary: "Build brief PDF for DEP/ARR",
        parameters: [
          { in: "query", name: "dep", required: true, schema: { type: "string", example: "LTAD" } },
          { in: "query", name: "arr", required: true, schema: { type: "string", example: "LTCA" } },
          { in: "query", name: "windUnit", required: false, schema: { type: "string", enum: ["kt", "kmh", "mph", "mps"], default: "kt" } },
          { in: "query", name: "distUnit", required: false, schema: { type: "string", enum: ["km", "mi", "nm"], default: "km" } },
          { in: "query", name: "crossLimit", required: false, schema: { type: "number", example: 15 } },
        ],
        responses: {
          "200": {
            description: "PDF file",
            content: {
              "application/pdf": { schema: { type: "string", format: "binary" } },
            },
          },
          "400": { description: "Bad request" },
        },
      },
    },
    "/openapi.json": {
      get: { summary: "OpenAPI JSON", responses: { "200": { description: "OpenAPI document" } } },
    },
  },
};

app.get("/openapi.json", (_req, res) => res.json(openapi));
app.use("/docs", swaggerUi.serve as any, swaggerUi.setup(openapi) as any);

/* ================= helpers ================= */
function pickActiveRunway(
  runways: { heading: number; id: string; length_m?: number }[] | undefined,
  windDir?: number
) {
  if (!runways?.length || windDir == null) return runways?.[0];
  let best = runways[0],
    minDiff = 999;
  for (const r of runways) {
    const diff = Math.min(Math.abs(windDir - r.heading), 360 - Math.abs(windDir - r.heading));
    if (diff < minDiff) {
      minDiff = diff;
      best = r;
    }
  }
  return best;
}

function parseTrafficBBoxQuery(query: Record<string, unknown>) {
  const bboxRaw = typeof query.bbox === "string" ? query.bbox.trim() : "";

  if (bboxRaw) {
    const parts = bboxRaw.split(",").map((v) => Number(v.trim()));
    if (parts.length === 4) {
      const [minLon, minLat, maxLon, maxLat] = parts;
      const bbox = { minLon, minLat, maxLon, maxLat };
      if (isValidTrafficBBox(bbox)) {
        return bbox;
      }
    }
  }

  const minLon = Number(query.minLon);
  const minLat = Number(query.minLat);
  const maxLon = Number(query.maxLon);
  const maxLat = Number(query.maxLat);

  const bbox = { minLon, minLat, maxLon, maxLat };
  if (isValidTrafficBBox(bbox)) {
    return bbox;
  }

  return null;
}

type WindUnit = "kt" | "kmh" | "mph" | "mps";
type DistUnit = "km" | "mi" | "nm";

function convWindVal(kt?: number, unit: WindUnit = "kt") {
  if (kt == null || !Number.isFinite(kt)) return { val: "—", unit };
  let v = kt;
  if (unit === "kmh") v = kt * 1.852;
  if (unit === "mph") v = kt * 1.15078;
  if (unit === "mps") v = kt * 0.514444;
  const str = v < 100 ? Math.round(v).toString() : v.toFixed(0);
  return { val: str, unit };
}

function convDistVal(km?: number, unit: DistUnit = "km") {
  if (km == null || !Number.isFinite(km)) return { val: "—", unit };
  let v = km;
  if (unit === "mi") v = km * 0.621371;
  if (unit === "nm") v = km * 0.539957;
  const str = v < 1000 ? Math.round(v).toString() : v.toFixed(1);
  return { val: str, unit };
}

type RiskConfidence = {
  level: "high" | "medium" | "low";
  score: number;
  summary: string;
  factors: string[];
};

function computeRiskConfidence(input: {
  depMet?: any;
  arrMet?: any;
  depTaf?: any;
  arrTaf?: any;
  depNotams?: any[];
  arrNotams?: any[];
}) : RiskConfidence {
  let score = 100;
  const factors: string[] = [];

  const hasDepMet = Boolean(input.depMet?.raw);
  const hasArrMet = Boolean(input.arrMet?.raw);
  const hasDepTaf = Boolean(input.depTaf?.raw);
  const hasArrTaf = Boolean(input.arrTaf?.raw);

  const depNotamCount = Array.isArray(input.depNotams) ? input.depNotams.length : 0;
  const arrNotamCount = Array.isArray(input.arrNotams) ? input.arrNotams.length : 0;

  if (!hasDepMet) {
    score -= 35;
    factors.push("DEP METAR eksik");
  }

  if (!hasArrMet) {
    score -= 15;
    factors.push("ARR METAR eksik");
  }

  if (!hasDepTaf) {
    score -= 20;
    factors.push("DEP TAF eksik");
  }

  if (!hasArrTaf) {
    score -= 10;
    factors.push("ARR TAF eksik");
  }

  if (depNotamCount === 0) {
    score -= 10;
    factors.push("DEP NOTAM verisi sınırlı");
  }

  if (arrNotamCount === 0) {
    score -= 5;
    factors.push("ARR NOTAM verisi sınırlı");
  }

  // parsed veri kalitesi
  const depVis = input.depMet?.parsed?.vis;
  const depCeiling = input.depMet?.parsed?.ceiling;
  const depWindDir = input.depMet?.parsed?.wind_dir;
  const depWindSpd = input.depMet?.parsed?.wind_spd;

  if (depVis == null) {
    score -= 6;
    factors.push("Görüş verisi eksik");
  }

  if (depCeiling == null) {
    score -= 6;
    factors.push("Tavan verisi eksik");
  }

  if (depWindDir == null || depWindSpd == null) {
    score -= 8;
    factors.push("Rüzgar verisi eksik");
  }

  score = Math.max(0, Math.min(100, score));

  let level: "high" | "medium" | "low" = "high";
  if (score < 80) level = "medium";
  if (score < 55) level = "low";

  let summary = "Veri kalitesi yüksek, skor güçlü veriyle üretildi.";
  if (level === "medium") {
    summary = "Veri kısmen eksik, skor orta güven seviyesinde.";
  } else if (level === "low") {
    summary = "Veri belirgin ölçüde sınırlı, skor düşük güven seviyesinde.";
  }

  return {
    level,
    score,
    summary,
    factors,
  };
}

type AlternateRankInput = {
  distKm: number;
  bestRwyM: number;
  metar?: any;
  criticalNotams: number;
  crosswindAbs: number;
  crossLimit?: number;
};

function scoreAlternateCandidate(input: AlternateRankInput) {
  let score = 0;
  const badges: string[] = [];

  const crossLimit =
    typeof input.crossLimit === "number" &&
    Number.isFinite(input.crossLimit) &&
    input.crossLimit > 0
      ? input.crossLimit
      : 15;

  const crossRatio = input.crosswindAbs / crossLimit;

  // Mesafe
  if (input.distKm <= 60) {
    score += 4;
    badges.push("Çok Yakın");
  } else if (input.distKm <= 120) {
    score += 8;
    badges.push("Yakın");
  } else if (input.distKm <= 180) {
    score += 14;
    badges.push("Uygun Mesafe");
  } else {
    score += 22;
    badges.push("Uzak");
  }

  // Pist uzunluğu
  if (input.bestRwyM >= 3000) {
    score -= 12;
    badges.push("Uzun Pist");
  } else if (input.bestRwyM >= 2200) {
    score -= 7;
    badges.push("Yeterli Pist");
  } else if (input.bestRwyM >= 1500) {
    score -= 1;
    badges.push("Orta Pist");
  } else {
    score += 14;
    badges.push("Kısa Pist");
  }

  // NOTAM
  if (input.criticalNotams === 0) {
    badges.push("NOTAM Temiz");
  } else if (input.criticalNotams === 1) {
    score += 8;
    badges.push("1 Kritik NOTAM");
  } else if (input.criticalNotams === 2) {
    score += 15;
    badges.push("2 Kritik NOTAM");
  } else {
    score += 22;
    badges.push(`${input.criticalNotams} Kritik NOTAM`);
  }

  // Crosswind
  if (crossRatio <= 0.5) {
    badges.push("Rüzgar Uygun");
  } else if (crossRatio <= 0.8) {
    score += 4;
    badges.push("Crosswind Hafif");
  } else if (crossRatio <= 1.0) {
    score += 9;
    badges.push("Crosswind Sınırda");
  } else if (crossRatio <= 1.2) {
    score += 16;
    badges.push("Crosswind Yüksek");
  } else {
    score += 24;
    badges.push("Crosswind Çok Yüksek");
  }

  // Hava
  const vis = input.metar?.parsed?.vis;
  const ceiling = input.metar?.parsed?.ceiling;
  const wx = Array.isArray(input.metar?.parsed?.wx) ? input.metar.parsed.wx : [];
  const wxStr = wx.map((x: unknown) => String(x).toUpperCase()).join(" ");

  if (typeof ceiling === "number" && ceiling < 1000) {
    score += 16;
    badges.push("Tavan Çok Düşük");
  } else if (typeof ceiling === "number" && ceiling < 1500) {
    score += 11;
    badges.push("Düşük Tavan");
  } else if (typeof ceiling === "number" && ceiling < 3000) {
    score += 5;
    badges.push("Orta Tavan");
  } else if (typeof ceiling === "number") {
    badges.push("Tavan İyi");
  }

  if (typeof vis === "number" && vis < 3000) {
    score += 16;
    badges.push("Görüş Çok Düşük");
  } else if (typeof vis === "number" && vis < 5000) {
    score += 11;
    badges.push("Düşük Görüş");
  } else if (typeof vis === "number" && vis < 8000) {
    score += 5;
    badges.push("Orta Görüş");
  } else if (typeof vis === "number") {
    badges.push("Görüş İyi");
  }

  if (wx.length > 0) {
    score += Math.min(8, wx.length * 2);
  }

  if (/(TS|CB|SQ|GR|GS|FZ|SHRA|SHSN)/.test(wxStr)) {
    score += 6;
    badges.push("Aktif WX");
  } else if (wx.length > 0) {
    badges.push("WX Var");
  }

  if (
    typeof ceiling === "number" &&
    ceiling < 1500 &&
    typeof vis === "number" &&
    vis < 5000
  ) {
    score += 6;
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    badges: badges.slice(0, 4),
  };
}

function getAlternateWeatherLabels(metar?: any) {
  const ceiling = metar?.parsed?.ceiling;
  const vis = metar?.parsed?.vis;
  const wx = Array.isArray(metar?.parsed?.wx) ? metar.parsed.wx : [];
  const wxStr = wx.map((x: unknown) => String(x).toUpperCase()).join(" ");

  let ceiling_label = "Tavan bilinmiyor";
  if (typeof ceiling === "number") {
    if (ceiling < 1000) ceiling_label = "Tavan çok düşük";
    else if (ceiling < 1500) ceiling_label = "Tavan düşük";
    else if (ceiling < 3000) ceiling_label = "Tavan orta";
    else ceiling_label = "Tavan iyi";
  }

  let visibility_label = "Görüş bilinmiyor";
  if (typeof vis === "number") {
    if (vis < 3000) visibility_label = "Görüş çok düşük";
    else if (vis < 5000) visibility_label = "Görüş düşük";
    else if (vis < 8000) visibility_label = "Görüş orta";
    else visibility_label = "Görüş iyi";
  }

  let weather_label = "Hava bilinmiyor";

  if (
    ceiling_label === "Tavan çok düşük" ||
    visibility_label === "Görüş çok düşük" ||
    /(TS|CB|SQ|GR|GS|FZ|SHRA|SHSN)/.test(wxStr)
  ) {
    weather_label = "Hava zayıf";
  } else if (
    ceiling_label === "Tavan düşük" ||
    visibility_label === "Görüş düşük" ||
    ceiling_label === "Tavan orta" ||
    visibility_label === "Görüş orta"
  ) {
    weather_label = "Hava orta";
  } else if (typeof ceiling === "number" || typeof vis === "number") {
    weather_label = "Hava uygun";
  }

  return {
    weather_label,
    ceiling_label,
    visibility_label,
  };
}

function buildAlternateReasonSummary(input: {
  distKm: number;
  bestRwyM: number;
  criticalNotams: number;
  crosswindAbs: number;
  weatherLabel?: string;
  crossLimit?: number;
}) {
  const crossLimit =
    typeof input.crossLimit === "number" &&
    Number.isFinite(input.crossLimit) &&
    input.crossLimit > 0
      ? input.crossLimit
      : 15;

  const crossRatio = input.crosswindAbs / crossLimit;
  const wl = String(input.weatherLabel || "").toLowerCase();

  const positives: string[] = [];
  const cautions: string[] = [];

  // Mesafe
  if (input.distKm <= 60) positives.push("çok yakın mesafe");
  else if (input.distKm <= 120) positives.push("yakın mesafe");
  else if (input.distKm <= 180) positives.push("uygun mesafe");
  else cautions.push("uzak mesafe");

  // Pist
  if (input.bestRwyM >= 3000) positives.push("uzun pist");
  else if (input.bestRwyM >= 2200) positives.push("yeterli pist");
  else if (input.bestRwyM < 1500) cautions.push("kısa pist");

  // NOTAM
  if (input.criticalNotams === 0) positives.push("temiz NOTAM");
  else if (input.criticalNotams >= 2) cautions.push("kritik NOTAM baskısı");
  else cautions.push("kritik NOTAM etkisi");

  // Rüzgar
  if (crossRatio <= 0.8) positives.push("uygun rüzgar");
  else if (crossRatio <= 1.0) cautions.push("sınırda crosswind");
  else cautions.push("yüksek crosswind");

  // Hava
  if (wl.includes("uygun")) positives.push("uygun hava");
  else if (wl.includes("zayıf")) cautions.push("zayıf hava");
  else if (wl.includes("orta")) cautions.push("orta hava");

  const strongGood =
    input.distKm <= 120 &&
    input.bestRwyM >= 2200 &&
    input.criticalNotams === 0 &&
    crossRatio <= 0.8 &&
    !wl.includes("zayıf");

  const cautionCase =
    input.criticalNotams >= 2 ||
    crossRatio > 1.0 ||
    wl.includes("zayıf") ||
    input.bestRwyM < 1500;

  if (strongGood) {
    return `Güçlü aday: ${positives.slice(0, 3).join(", ")}.`;
  }

  if (cautionCase) {
    return `Dikkat gerekir: ${cautions.slice(0, 3).join(", ")}.`;
  }

  const pos = positives.slice(0, 2).join(", ");
  const warn = cautions[0] ? `; ancak ${cautions[0]}` : "";

  return `Dengeli aday: ${pos}${warn}.`;
}



/******************* primary */

function getPrimaryDriverLabel(breakdown?: {
  weather?: number;
  wind?: number;
  notam?: number;
}) {
  const weather = Number(breakdown?.weather ?? 0);
  const wind = Number(breakdown?.wind ?? 0);
  const notam = Number(breakdown?.notam ?? 0);

  const ranked = [
    { key: "Weather", value: weather },
    { key: "Wind", value: wind },
    { key: "NOTAM", value: notam },
  ].sort((a, b) => b.value - a.value);

  const top = ranked[0];
  if (!top || top.value <= 0) return "Belirgin bir baskın etken yok";

  return top.key;
}

function buildAlternateCompare(
  topAlternateRanked: Array<{
    icao: string;
    dist_km: number;
    best_rwy_m: number;
    critical_notams?: number;
    crosswind_abs?: number;
    weather_label?: string;
  }>
) {
  if (!Array.isArray(topAlternateRanked) || topAlternateRanked.length < 2) {
    return "";
  }

  const first = topAlternateRanked[0];
  const second = topAlternateRanked[1];

  const reasons: string[] = [];

  if (first.dist_km + 20 < second.dist_km) {
    reasons.push("daha yakın");
  }

  if ((first.best_rwy_m ?? 0) >= (second.best_rwy_m ?? 0) + 400) {
    reasons.push("daha güçlü pist avantajı");
  }

  if ((first.critical_notams ?? 0) < (second.critical_notams ?? 0)) {
    reasons.push("kritik NOTAM açısından daha temiz");
  }

  if ((first.crosswind_abs ?? 0) + 3 < (second.crosswind_abs ?? 0)) {
    reasons.push("rüzgar açısından daha dengeli");
  }

  const firstWeather = String(first.weather_label ?? "").toLowerCase();
  const secondWeather = String(second.weather_label ?? "").toLowerCase();

  if (
    (firstWeather.includes("uygun") && !secondWeather.includes("uygun")) ||
    (firstWeather.includes("orta") && secondWeather.includes("zayıf"))
  ) {
    reasons.push("hava koşulları daha elverişli");
  }

  if (!reasons.length) {
    return `${first.icao}, ${second.icao} ile karşılaştırıldığında genel risk dengesi daha iyi olduğu için ilk sırada yer alıyor.`;
  }

  return `${first.icao}, ${second.icao}'ye göre ${reasons.slice(0, 2).join(" ve ")} olduğu için ilk sırada yer alıyor.`;
}







/* ================= core ================= */
/* ================= core ================= */
async function buildBrief(depIcao: string, arrIcao: string, opts?: { crossLimit?: number }) {
  await ensureAirportsReady();

  const dep = byICAO(depIcao);
  const arr = byICAO(arrIcao);
  if (!dep || !arr) throw new Error("unknown ICAO");

  const [mDep, mArr] = await Promise.all([getMetar(dep.icao), getMetar(arr.icao)]);
  const [tDep, tArr] = await Promise.all([getTaf(dep.icao), getTaf(arr.icao)]);
  const [nDep, nArr] = await Promise.all([getNotam(dep.icao), getNotam(arr.icao)]);

  const depCriticalNotamCount = nDep?.filter((n: any) => n.critical).length || 0;
  const arrCriticalNotamCount = nArr?.filter((n: any) => n.critical).length || 0;
  const notamCriticalCount = depCriticalNotamCount + arrCriticalNotamCount;

  const depActive = pickActiveRunway(dep.runways, mDep?.parsed?.wind_dir) || dep.runways?.[0];

  const wcDep = windComponents(
    depActive?.heading ?? 0,
    mDep?.parsed?.wind_dir ?? 0,
    mDep?.parsed?.wind_spd ?? 0
  );

  const chosenCrossLimit =
    opts?.crossLimit && Number.isFinite(opts.crossLimit)
      ? Number(opts.crossLimit)
      : dep.crossLimit ?? 15;

  const riskBase = riskScore({
    vis: mDep?.parsed?.vis,
    ceiling: mDep?.parsed?.ceiling,
    wx: mDep?.parsed?.wx ?? [],
    head: wcDep.head,
    cross: wcDep.cross,
    crossLimit: chosenCrossLimit,
    notamCritical: notamCriticalCount,
  });

  const confidence = computeRiskConfidence({
    depMet: mDep,
    arrMet: mArr,
    depTaf: tDep,
    arrTaf: tArr,
    depNotams: nDep ?? [],
    arrNotams: nArr ?? [],
  });


  const depVis = mDep?.parsed?.vis;
  const depCeiling = mDep?.parsed?.ceiling;
  const depWx = Array.isArray(mDep?.parsed?.wx) ? mDep.parsed.wx : [];
  const depWxStr = depWx.map((x: unknown) => String(x).toUpperCase()).join(" ");

  // Ana riski ikinci kez şişirmeden sadece küçük operasyonel düzeltme
  let notamRiskBump = 0;
  if (depCriticalNotamCount >= 2) notamRiskBump += 1;
  if (arrCriticalNotamCount >= 3) notamRiskBump += 1;
  if (notamCriticalCount >= 5) notamRiskBump += 1;

  let weatherBreakdown = 0;
  let windBreakdown = 0;

  // Breakdown sadece açıklama amaçlı
  if (typeof depCeiling === "number") {
    if (depCeiling < 600) weatherBreakdown += 18;
    else if (depCeiling < 1000) weatherBreakdown += 12;
    else if (depCeiling < 1500) weatherBreakdown += 7;
    else if (depCeiling < 3000) weatherBreakdown += 3;
  }

  if (typeof depVis === "number") {
    if (depVis < 1500) weatherBreakdown += 18;
    else if (depVis < 3000) weatherBreakdown += 12;
    else if (depVis < 5000) weatherBreakdown += 7;
    else if (depVis < 8000) weatherBreakdown += 3;
  }

  if (depWx.length > 0) {
    if (/(CB|TS)/.test(depWxStr)) weatherBreakdown += 10;
    else if (/(SHRA|SHSN|SQ|GR|GS|FZ)/.test(depWxStr)) weatherBreakdown += 6;
    else weatherBreakdown += Math.min(4, depWx.length);
  }

  if (
    typeof depCeiling === "number" &&
    depCeiling < 1000 &&
    typeof depVis === "number" &&
    depVis < 3000
  ) {
    weatherBreakdown += 6;
  }

  const crossAbs = Math.abs(wcDep.cross);
  const crossRatio = chosenCrossLimit > 0 ? crossAbs / chosenCrossLimit : 0;

  if (crossRatio > 1.2) {
    windBreakdown += 18;
  } else if (crossRatio > 1.0) {
    windBreakdown += 14;
  } else if (crossRatio >= 0.85) {
    windBreakdown += 8;
  } else if (crossRatio >= 0.65) {
    windBreakdown += 4;
  }

  if (wcDep.head < 0) {
    const tailwind = Math.abs(wcDep.head);
    if (tailwind >= 15) windBreakdown += 10;
    else if (tailwind >= 10) windBreakdown += 6;
    else if (tailwind >= 5) windBreakdown += 3;
  }

  const baseScoreRaw = Number(riskBase.score || 0);

  // Breakdown toplamını ana skorla hizala
  let explainedBase = weatherBreakdown + windBreakdown;

  if (explainedBase <= 0 && baseScoreRaw > 0) {
    weatherBreakdown = Math.round(baseScoreRaw * 0.6);
    windBreakdown = baseScoreRaw - weatherBreakdown;
    explainedBase = weatherBreakdown + windBreakdown;
  }

  if (explainedBase > 0 && explainedBase !== baseScoreRaw) {
    const ratio = baseScoreRaw / explainedBase;
    weatherBreakdown = Math.round(weatherBreakdown * ratio);
    windBreakdown = Math.round(windBreakdown * ratio);

    const diff = baseScoreRaw - (weatherBreakdown + windBreakdown);
    if (diff !== 0) {
      weatherBreakdown += diff;
    }
  }

  const finalScoreRaw = Math.max(0, Math.min(100, baseScoreRaw + notamRiskBump));

  const breakdown = {
    weather: Math.max(0, weatherBreakdown),
    wind: Math.max(0, windBreakdown),
    notam: Math.max(0, finalScoreRaw - (weatherBreakdown + windBreakdown)),
    total: finalScoreRaw,
  };

  const finalScore = breakdown.total;

  const finalClass: "green" | "yellow" | "red" =
    finalScore >= 70 ? "red" : finalScore >= 40 ? "yellow" : "green";

  const riskFinal = {
    ...riskBase,
    score: finalScore,
    class: finalClass,
    breakdown,
  };

  const reasons: string[] = [];

  if (typeof depCeiling === "number" && depCeiling < 600) {
    reasons.push("Çok düşük tavan (<600 ft)");
  } else if (typeof depCeiling === "number" && depCeiling < 1000) {
    reasons.push("Düşük tavan (<1000 ft)");
  } else if (typeof depCeiling === "number" && depCeiling < 1500) {
    reasons.push("Sınırlı tavan (<1500 ft)");
  }

  if (typeof depVis === "number" && depVis < 1500) {
    reasons.push("Çok düşük görüş (<1500 m)");
  } else if (typeof depVis === "number" && depVis < 3000) {
    reasons.push("Düşük görüş (<3000 m)");
  } else if (typeof depVis === "number" && depVis < 5000) {
    reasons.push("Sınırlı görüş (<5000 m)");
  }

  if (/(CB|TS)/.test(depWxStr)) {
    reasons.push("Konvektif hava olayı riski var");
  } else if (/(SHRA|SHSN|SQ|GR|GS|FZ)/.test(depWxStr)) {
    reasons.push("Aktif hava olayı etkisi var");
  }

  if (crossRatio > 1.0) {
    reasons.push(
      `Crosswind limit üstünde (${Math.abs(wcDep.cross)} kt / limit ${chosenCrossLimit})`
    );
  } else if (crossRatio > 0.85) {
    reasons.push(
      `Crosswind sınıra yakın (${Math.abs(wcDep.cross)} kt / limit ${chosenCrossLimit})`
    );
  }

  if (wcDep.head < 0) {
    const tailwind = Math.abs(wcDep.head);
    if (tailwind >= 10) {
      reasons.push(`Tailwind etkisi var (${tailwind} kt)`);
    }
  }

  if (depCriticalNotamCount > 0) {
    reasons.push(`DEP tarafında kritik NOTAM var (${depCriticalNotamCount})`);
  }

  if (arrCriticalNotamCount > 0) {
    reasons.push(`ARR tarafında kritik NOTAM var (${arrCriticalNotamCount})`);
  }

  if (notamRiskBump > 0) {
    reasons.push("Kritik NOTAM yoğunluğu operasyonel baskı oluşturuyor");
  }

  if (!dep.coords) throw new Error(`coords missing for DEP ${dep.icao}`);
  const depPos = dep.coords;

  const list = getAirports();

  const alternateBaseCandidates = (list || [])
    .filter((a) => a.icao !== dep.icao && a.icao !== arr.icao && a.coords)
    .map((a) => ({
      airport: a,
      icao: a.icao,
      name: a.name,
      dist_km: haversineKm(depPos, a.coords!),
      best_rwy_m: Math.max(...(a.runways || []).map((r) => r.length_m || 0), 0),
    }))
    .filter((x) => x.dist_km <= 200)
    .sort((p, q) => p.dist_km - q.dist_km || q.best_rwy_m - p.best_rwy_m)
    .slice(0, 6);

  const alternateRanked = await Promise.all(
    alternateBaseCandidates.map(async (cand) => {
      try {
        const [altMet, altNotam] = await Promise.all([
          getMetar(cand.icao).catch(() => null),
          getNotam(cand.icao).catch(() => []),
        ]);

        const altActiveRunway =
          pickActiveRunway(cand.airport.runways, altMet?.parsed?.wind_dir) ||
          cand.airport.runways?.[0];

        const altWind = windComponents(
          altActiveRunway?.heading ?? 0,
          altMet?.parsed?.wind_dir ?? 0,
          altMet?.parsed?.wind_spd ?? 0
        );

        const altCriticalNotams =
          Array.isArray(altNotam) ? altNotam.filter((n: any) => n?.critical).length : 0;

        const altRank = scoreAlternateCandidate({
              distKm: cand.dist_km,
              bestRwyM: cand.best_rwy_m,
              metar: altMet,
              criticalNotams: altCriticalNotams,
              crosswindAbs: Math.abs(altWind.cross ?? 0),
              crossLimit: chosenCrossLimit,
            });

            const altWeather = getAlternateWeatherLabels(altMet);

            const altReasonSummary = buildAlternateReasonSummary({
              distKm: cand.dist_km,
              bestRwyM: cand.best_rwy_m,
              criticalNotams: altCriticalNotams,
              crosswindAbs: Math.abs(altWind.cross ?? 0),
              weatherLabel: altWeather.weather_label,
              crossLimit: chosenCrossLimit,
            });

        return {
          ...cand,
          alt_score: altRank.score,
          badges: altRank.badges,
          critical_notams: altCriticalNotams,
          crosswind_abs: Math.abs(altWind.cross ?? 0),
          weather_label: altWeather.weather_label,
          ceiling_label: altWeather.ceiling_label,
          visibility_label: altWeather.visibility_label,
          reason_summary: altReasonSummary,
        };
      } catch {
        return {
          ...cand,
          alt_score: Math.round(
            cand.dist_km * 0.2 + Math.max(0, 2200 - cand.best_rwy_m) * 0.01
          ),
          badges: ["Temel Sıralama"],
          critical_notams: 0,
          crosswind_abs: 0,
          weather_label: "Hava bilinmiyor",
          ceiling_label: "Tavan bilinmiyor",
          visibility_label: "Görüş bilinmiyor",
          reason_summary: "temel sıralama • veri sınırlı",
        };
      }
    })
  );

  const topAlternateRanked = alternateRanked
    .sort((a, b) => a.alt_score - b.alt_score || a.dist_km - b.dist_km || b.best_rwy_m - a.best_rwy_m)
    .slice(0, 3);

      const primaryDriver = getPrimaryDriverLabel(riskFinal.breakdown);
  const alternateCompare = buildAlternateCompare(topAlternateRanked);

  const candidates = topAlternateRanked.map((x) => `${x.icao} (${x.dist_km.toFixed(0)} km)`);

  return {
    airports: {
      dep: {
        icao: dep.icao,
        iata: dep.iata,
        city: dep.city,
        name: dep.name,
        coords: dep.coords,
        runways: dep.runways,
        activeRunway: depActive,
      },
      arr: {
        icao: arr.icao,
        iata: arr.iata,
        city: arr.city,
        name: arr.name,
        coords: arr.coords,
        runways: arr.runways,
      },
    },
    met: { dep: mDep ? [mDep] : [], arr: mArr ? [mArr] : [] },
    taf: { dep: tDep ? [tDep] : [], arr: tArr ? [tArr] : [] },
    notam: { dep: nDep ?? [], arr: nArr ?? [] },
        risk: {
      ...riskFinal,
      headwind: wcDep.head,
      crosswind: wcDep.cross,
      confidence,
      primary_driver: primaryDriver,
      alternate_compare: alternateCompare,
      reasons,
      alternates: candidates,
      alternateDetails: topAlternateRanked.map((x) => ({
        icao: x.icao,
        name: x.name,
        dist_km: Number(x.dist_km.toFixed(0)),
        best_rwy_m: x.best_rwy_m,
        rank_score: x.alt_score,
        badges: x.badges ?? [],
        critical_notams: x.critical_notams ?? 0,
        crosswind_abs: Math.round(x.crosswind_abs ?? 0),
        weather_label: x.weather_label ?? "Hava bilinmiyor",
        ceiling_label: x.ceiling_label ?? "Tavan bilinmiyor",
        visibility_label: x.visibility_label ?? "Görüş bilinmiyor",
        reason_summary: x.reason_summary ?? "",
      })),
    },
  };
}

/* ================= routes ================= */
app.get("/health", async (_req, res) => {
  await ensureAirportsReady();
  res.json({
    ok: true,
    airports: getAirports().length,
    source: getAirportsSource(),
    loadedAt: getAirportsLoadedAt(),
  });
});

app.get("/airports/search", async (req, res) => {
  try {
    await ensureAirportsReady();
    const q = String(req.query.q ?? "").trim();
    const limit = Number(req.query.limit ?? 50);
    if (!q || q.length < 2) return res.json({ matches: [] });
    const matches = searchAirports(q, Number.isFinite(limit) ? limit : 50);
    return res.json({ matches });
  } catch (e: any) {
    console.error("[/airports/search] error:", e);
    return res.status(200).json({ matches: [] });
  }
});

app.get("/airports/near", async (req, res) => {
  try {
    await ensureAirportsReady();

    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const maxKm = Number(req.query.max_km ?? 200);
    const limit = Number(req.query.limit ?? 50);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return res.json({ matches: [] });

    const center = { lat, lng };
    const matches = (getAirports() || [])
      .filter((a) => a.coords)
      .map((a) => ({ ...a, dist_km: haversineKm(center, a.coords!) }))
      .filter((x) => x.dist_km <= (Number.isFinite(maxKm) ? maxKm : 200))
      .sort((a, b) => a.dist_km - b.dist_km)
      .slice(0, Math.max(1, Math.min(200, Number.isFinite(limit) ? limit : 50)));

    res.json({ matches });
  } catch (e: any) {
    console.error("[/airports/near] error:", e);
    res.json({ matches: [] });
  }
});

app.get("/airports/reload", async (req, res) => {
  const force =
    String(req.query.force ?? "").toLowerCase() === "1" ||
    String(req.query.force ?? "").toLowerCase() === "true";
  await ensureAirportsReady({ forceRemote: force });
  res.json({ ok: true, airports: getAirports().length, source: getAirportsSource(), loadedAt: getAirportsLoadedAt() });
});

app.post("/airports/reload", async (req, res) => {
  const force =
    String(req.query.force ?? "").toLowerCase() === "1" ||
    String(req.query.force ?? "").toLowerCase() === "true";
  await ensureAirportsReady({ forceRemote: force });
  res.json({ ok: true, airports: getAirports().length, source: getAirportsSource(), loadedAt: getAirportsLoadedAt() });
});

app.get("/traffic", async (req, res) => {
  try {
    const bbox = parseTrafficBBoxQuery(req.query as Record<string, unknown>);

    if (!bbox) {
      return res.status(400).json({
        error: "invalid_bbox",
        message:
          "Provide bbox=minLon,minLat,maxLon,maxLat or separate minLon,minLat,maxLon,maxLat query params.",
        example: "/traffic?bbox=26,36,45,42",
      });
    }

    const aircraft = await getTrafficByBBox(bbox);

    return res.json({
      ok: true,
      source: "opensky",
      live: true,
      cachedTtlMs: getTrafficCacheTtlMs(),
      bbox,
      count: aircraft.length,
      aircraft,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch traffic";

    return res.status(502).json({
      error: "traffic_fetch_failed",
      message,
    });
  }
});

app.get("/brief", async (req, res) => {
  try {
    const dep = String(req.query.dep ?? "").toUpperCase();
    const arr = String(req.query.arr ?? "").toUpperCase();
    const cl = Number(req.query.crossLimit);
    const brief = await buildBrief(dep, arr, { crossLimit: Number.isFinite(cl) ? cl : undefined });
    res.json(brief);
  } catch (e: any) {
    res.status(400).json({ error: e?.message || "failed" });
  }
});


function pdfSafeText(value: unknown) {
  return String(value ?? "—")
    .replace(/→/g, "->")
    .replace(/–|—/g, "-");
}

function pickFirstExisting(paths: string[]) {
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      //
    }
  }
  return null;
}

function resolvePdfFonts() {
  const cwd = process.cwd();

  const regular = pickFirstExisting([
    path.join(cwd, "assets", "fonts", "NotoSans-Regular.ttf"),
    path.join(cwd, "assets", "fonts", "DejaVuSans.ttf"),
    path.join(cwd, "src", "assets", "fonts", "NotoSans-Regular.ttf"),
    path.join(cwd, "src", "assets", "fonts", "DejaVuSans.ttf"),
    "C:\\Windows\\Fonts\\arial.ttf",
    "C:\\Windows\\Fonts\\verdana.ttf",
    "C:\\Windows\\Fonts\\segoeui.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
  ]);

  const bold = pickFirstExisting([
    path.join(cwd, "assets", "fonts", "NotoSans-Bold.ttf"),
    path.join(cwd, "assets", "fonts", "DejaVuSans-Bold.ttf"),
    path.join(cwd, "src", "assets", "fonts", "NotoSans-Bold.ttf"),
    path.join(cwd, "src", "assets", "fonts", "DejaVuSans-Bold.ttf"),
    "C:\\Windows\\Fonts\\arialbd.ttf",
    "C:\\Windows\\Fonts\\verdanab.ttf",
    "C:\\Windows\\Fonts\\segoeuib.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
  ]);

  return { regular, bold };
}

function ensurePdfRoom(doc: PDFKit.PDFDocument, needed = 80) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > bottom) {
    doc.addPage();
  }
}

function pdfSectionTitle(doc: PDFKit.PDFDocument, text: string) {
  ensurePdfRoom(doc, 36);
  doc.moveDown(0.3);
  doc
    .fontSize(13)
    .fillColor("#0f172a")
    .text(pdfSafeText(text), { underline: false });
  doc
    .moveTo(doc.page.margins.left, doc.y + 2)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y + 2)
    .strokeColor("#cbd5e1")
    .lineWidth(1)
    .stroke();
  doc.moveDown(0.6);
}

function pdfKeyValue(doc: PDFKit.PDFDocument, label: string, value: string) {
  ensurePdfRoom(doc, 22);
  doc
    .fontSize(10)
    .fillColor("#475569")
    .text(`${pdfSafeText(label)}: `, { continued: true });
  doc
    .fillColor("#111827")
    .text(pdfSafeText(value));
}

function pdfBulletList(
  doc: PDFKit.PDFDocument,
  items: string[],
  opts?: { emptyText?: string; indent?: number; color?: string; limit?: number }
) {
  const emptyText = opts?.emptyText ?? "- Yok";
  const indent = opts?.indent ?? 12;
  const color = opts?.color ?? "#111827";
  const limit = opts?.limit ?? items.length;

  if (!items.length) {
    ensurePdfRoom(doc, 18);
    doc.fontSize(10).fillColor("#64748b").text(emptyText);
    return;
  }

  items.slice(0, limit).forEach((item) => {
    ensurePdfRoom(doc, 20);
    doc
      .fontSize(10)
      .fillColor(color)
      .text(`- ${pdfSafeText(item)}`, {
        indent,
      });
  });

  if (items.length > limit) {
    ensurePdfRoom(doc, 18);
    doc
      .fontSize(10)
      .fillColor("#64748b")
      .text(`- +${items.length - limit} ek kayıt`);
  }
}

function pdfRiskTone(score: number) {
  if (score >= 70) {
    return {
      label: "Yuksek Risk",
      fill: "#fee2e2",
      stroke: "#ef4444",
      text: "#991b1b",
    };
  }

  if (score >= 40) {
    return {
      label: "Orta Risk",
      fill: "#fef3c7",
      stroke: "#f59e0b",
      text: "#92400e",
    };
  }

  return {
    label: "Dusuk Risk",
    fill: "#dcfce7",
    stroke: "#22c55e",
    text: "#166534",
  };
}



function pdfConfidenceTone(level?: string) {
  if (level === "high") {
    return {
      fill: "#dcfce7",
      stroke: "#22c55e",
      text: "#166534",
      label: "HIGH",
    };
  }

  if (level === "medium") {
    return {
      fill: "#fef3c7",
      stroke: "#f59e0b",
      text: "#92400e",
      label: "MEDIUM",
    };
  }

  return {
    fill: "#fee2e2",
    stroke: "#ef4444",
    text: "#991b1b",
    label: "LOW",
  };
}

function getPrimaryDriver(risk: any) {
  const breakdown = risk?.breakdown ?? {};
  const weather = Number(breakdown.weather ?? 0);
  const wind = Number(breakdown.wind ?? 0);
  const notam = Number(breakdown.notam ?? 0);

  const candidates = [
    { key: "Weather", value: weather },
    { key: "Wind", value: wind },
    { key: "NOTAM", value: notam },
  ].sort((a, b) => b.value - a.value);

  const top = candidates[0];
  if (!top || top.value <= 0) return "Belirgin bir baskın etken yok";

  if (top.key === "Weather") return "Primary driver: Weather";
  if (top.key === "Wind") return "Primary driver: Wind";
  return "Primary driver: NOTAM";
}


app.get("/brief/pdf", async (req, res) => {
  try {
    const dep = String(req.query.dep ?? "").toUpperCase();
    const arr = String(req.query.arr ?? "").toUpperCase();
    const windUnit = String(req.query.windUnit ?? "kt") as WindUnit;
    const distUnit = String(req.query.distUnit ?? "km") as DistUnit;
    const cl = Number(req.query.crossLimit);

    const brief = await buildBrief(dep, arr, {
      crossLimit: Number.isFinite(cl) ? cl : undefined,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=brief_${dep}_${arr}.pdf`
    );

    const doc = new PDFDocument({
      size: "A4",
      margin: 42,
      info: {
        Title: `Flight Brief ${dep}-${arr}`,
        Author: "flight-risk",
        Subject: "Flight briefing and risk support",
      },
    });

    doc.pipe(res);

    const fonts = resolvePdfFonts();

    const useRegular = () => {
      if (fonts.regular) doc.font(fonts.regular);
      else doc.font("Helvetica");
    };

    const useBold = () => {
      if (fonts.bold) doc.font(fonts.bold);
      else doc.font("Helvetica-Bold");
    };

    const depMet = brief.met.dep?.[0]?.raw ?? "-";
    const arrMet = brief.met.arr?.[0]?.raw ?? "-";
    const depTaf = brief.taf?.dep?.[0]?.raw ?? "-";
    const arrTaf = brief.taf?.arr?.[0]?.raw ?? "-";

    const depNotams = Array.isArray(brief.notam?.dep) ? brief.notam.dep : [];
    const arrNotams = Array.isArray(brief.notam?.arr) ? brief.notam.arr : [];

    const depCriticalNotams = depNotams.filter((n: any) => n?.critical);
    const depNormalNotams = depNotams.filter((n: any) => !n?.critical);
    const arrCriticalNotams = arrNotams.filter((n: any) => n?.critical);
    const arrNormalNotams = arrNotams.filter((n: any) => !n?.critical);

    const hw = convWindVal(brief.risk.headwind, windUnit);
    const cw = convWindVal(brief.risk.crosswind, windUnit);
    const riskTone = pdfRiskTone(Number(brief.risk.score ?? 0));

    const routeTitle = `${brief.airports.dep.icao} -> ${brief.airports.arr.icao}`;
    const routeSubtitle = `${pdfSafeText(brief.airports.dep.name ?? "")} - ${pdfSafeText(
      brief.airports.arr.name ?? ""
    )}`;

    const activeRunway =
  brief.airports.dep.activeRunway?.id ?? "-";

    const generatedAt = new Date().toLocaleString("tr-TR");

    useBold();
    doc
      .roundedRect(doc.page.margins.left, 36, doc.page.width - 84, 58, 10)
      .fill("#0f172a");

    doc.fillColor("#ffffff");
    doc.fontSize(20).text("Flight Brief", 56, 50, { continued: false });
    doc.fontSize(11).text(pdfSafeText(routeTitle), 56, 74);
    doc.fontSize(10).fillColor("#cbd5e1").text(pdfSafeText(routeSubtitle), 200, 74, {
      align: "right",
      width: doc.page.width - 256,
    });

    doc.y = 112;
    useRegular();

    // Ucus ozeti kutusu
    ensurePdfRoom(doc, 120);
    const boxX = doc.page.margins.left;
    const boxY = doc.y;
    const boxW = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    doc
      .roundedRect(boxX, boxY, boxW, 102, 10)
      .fillAndStroke("#f8fafc", "#e2e8f0");

    useBold();
    doc.fillColor("#0f172a").fontSize(12).text("Ucus Ozeti", boxX + 14, boxY + 12);

    useRegular();
    doc.fontSize(10).fillColor("#334155");
    doc.text(`Olusturma Zamanı: ${pdfSafeText(generatedAt)}`, boxX + 14, boxY + 34);
    doc.text(`Aktif Pist: ${pdfSafeText(activeRunway)}`, boxX + 14, boxY + 50);
    doc.text(`Headwind: ${hw.val} ${String(hw.unit).toUpperCase()}`, boxX + 14, boxY + 66);
    doc.text(`Crosswind: ${cw.val} ${String(cw.unit).toUpperCase()}`, boxX + 14, boxY + 82);

    const pillW = 120;
    const pillH = 28;
    const pillX = boxX + boxW - pillW - 14;
    const pillY = boxY + 16;

    doc
      .roundedRect(pillX, pillY, pillW, pillH, 14)
      .fillAndStroke(riskTone.fill, riskTone.stroke);

    useBold();
    doc
      .fillColor(riskTone.text)
      .fontSize(11)
      .text(`${riskTone.label} (${brief.risk.score})`, pillX, pillY + 8, {
        align: "center",
        width: pillW,
      });

    useRegular();
    doc
      .fillColor("#475569")
      .fontSize(10)
      .text(
        `Alternates: ${(brief.risk.alternateDetails ?? []).length}`,
        pillX,
        pillY + 40,
        {
          align: "center",
          width: pillW,
        }
      );

    doc.y = boxY + 118;

    // Risk ozeti
   pdfSectionTitle(doc, "Risk Ozeti");
pdfKeyValue(doc, "Risk Sinifi", `${pdfSafeText(brief.risk.class)} / ${brief.risk.score}`);
pdfKeyValue(
  doc,
  "Breakdown",
  `Weather ${brief.risk.breakdown?.weather ?? 0} - Wind ${brief.risk.breakdown?.wind ?? 0} - NOTAM ${brief.risk.breakdown?.notam ?? 0}`
);

const primaryDriver = getPrimaryDriver(brief.risk);
pdfKeyValue(doc, "Primary Driver", primaryDriver);

const confidence = (brief.risk as any)?.confidence;

if (confidence) {
  const confidenceTone = pdfConfidenceTone(String(confidence.level ?? "").toLowerCase());

  ensurePdfRoom(doc, 40);

  const pillX = doc.page.margins.left;
  const pillY = doc.y + 6;
  const pillW = 120;
  const pillH = 24;

  doc
    .roundedRect(pillX, pillY, pillW, pillH, 12)
    .fillAndStroke(confidenceTone.fill, confidenceTone.stroke);

  useBold();
  doc
    .fillColor(confidenceTone.text)
    .fontSize(10)
    .text(
      `${confidenceTone.label}${
        typeof confidence.score === "number" ? ` (${confidence.score})` : ""
      }`,
      pillX,
      pillY + 7,
      {
        align: "center",
        width: pillW,
      }
    );

  doc.y = pillY + pillH + 8;
  useRegular();

  if (confidence.summary) {
    ensurePdfRoom(doc, 18);
    doc
      .fontSize(10)
      .fillColor("#475569")
      .text(`Confidence Notu: ${pdfSafeText(confidence.summary)}`);
  }

  if (Array.isArray(confidence.factors) && confidence.factors.length > 0) {
    ensurePdfRoom(doc, 18);
    useBold();
    doc.fontSize(11).fillColor("#0f172a").text("Confidence Faktorleri");
    useRegular();

    pdfBulletList(
      doc,
      confidence.factors.map((f: unknown) => String(f)),
      {
        emptyText: "- Ek faktor yok",
        limit: 3,
        color: "#334155",
      }
    );
  }
}

useBold();
doc.moveDown(0.4);
doc.fontSize(11).fillColor("#0f172a").text("Ana Nedenler");
useRegular();
pdfBulletList(doc, (brief.risk.reasons ?? []).map((x: string) => x), {
  emptyText: "- Belirgin risk nedeni yok",
  limit: 6,
});

    // Alternates
    pdfSectionTitle(doc, "Alternate Onerileri");
    const alternateDetails = Array.isArray(brief.risk.alternateDetails)
      ? brief.risk.alternateDetails
      : [];

    if (!alternateDetails.length) {
      useRegular();
      doc.fontSize(10).fillColor("#64748b").text("- Alternate bulunamadi");
    } else {
      alternateDetails.forEach((alt: any, idx: number) => {
        ensurePdfRoom(doc, 72);

        const altX = doc.page.margins.left;
        const altY = doc.y;
        const altW = doc.page.width - doc.page.margins.left - doc.page.margins.right;

        doc
          .roundedRect(altX, altY, altW, 60, 8)
          .fillAndStroke(idx === 0 ? "#eff6ff" : "#fafafa", idx === 0 ? "#93c5fd" : "#e5e7eb");

        useBold();
        doc.fillColor("#0f172a").fontSize(11).text(
          `${idx + 1}. ${pdfSafeText(alt.icao)}${alt.name ? ` - ${pdfSafeText(alt.name)}` : ""}`,
          altX + 12,
          altY + 10
        );

        useRegular();
        doc.fillColor("#475569").fontSize(9).text(
          `Mesafe: ${alt.dist_km ?? "-"} ${String(distUnit).toUpperCase()} | Pist: ${alt.best_rwy_m ?? "-"} m | Rank: ${alt.rank_score ?? "-"}`,
          altX + 12,
          altY + 28
        );

        doc.fillColor("#111827").fontSize(9).text(
          pdfSafeText(alt.reason_summary || "-"),
          altX + 12,
          altY + 42,
          {
            width: altW - 24,
          }
        );

        doc.y = altY + 70;
      });
    }

    // METAR / TAF
    pdfSectionTitle(doc, "METAR / TAF");

    useBold();
    doc.fontSize(11).fillColor("#0f172a").text("DEP METAR");
    useRegular();
    doc.fontSize(10).fillColor("#111827").text(pdfSafeText(depMet));
    doc.moveDown(0.3);

    useBold();
    doc.fontSize(11).fillColor("#0f172a").text("ARR METAR");
    useRegular();
    doc.fontSize(10).fillColor("#111827").text(pdfSafeText(arrMet));
    doc.moveDown(0.5);

    useBold();
    doc.fontSize(11).fillColor("#0f172a").text("DEP TAF");
    useRegular();
    doc.fontSize(10).fillColor("#111827").text(pdfSafeText(depTaf));
    doc.moveDown(0.3);

    useBold();
    doc.fontSize(11).fillColor("#0f172a").text("ARR TAF");
    useRegular();
    doc.fontSize(10).fillColor("#111827").text(pdfSafeText(arrTaf));

    // NOTAM
    pdfSectionTitle(doc, "NOTAM Ozeti");

    useBold();
    doc.fontSize(11).fillColor("#0f172a").text("DEP Kritik NOTAM");
    useRegular();
    pdfBulletList(
      doc,
      depCriticalNotams.map((n: any) => String(n?.text ?? "-")),
      { emptyText: "- Kritik NOTAM yok", limit: 5 }
    );

    useBold();
    doc.moveDown(0.4);
    doc.fontSize(11).fillColor("#0f172a").text("DEP Advisory NOTAM");
    useRegular();
    pdfBulletList(
      doc,
      depNormalNotams.map((n: any) => String(n?.text ?? "-")),
      { emptyText: "- Advisory NOTAM yok", limit: 4, color: "#334155" }
    );

    useBold();
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor("#0f172a").text("ARR Kritik NOTAM");
    useRegular();
    pdfBulletList(
      doc,
      arrCriticalNotams.map((n: any) => String(n?.text ?? "-")),
      { emptyText: "- Kritik NOTAM yok", limit: 5 }
    );

    useBold();
    doc.moveDown(0.4);
    doc.fontSize(11).fillColor("#0f172a").text("ARR Advisory NOTAM");
    useRegular();
    pdfBulletList(
      doc,
      arrNormalNotams.map((n: any) => String(n?.text ?? "-")),
      { emptyText: "- Advisory NOTAM yok", limit: 4, color: "#334155" }
    );

    // footer
    ensurePdfRoom(doc, 40);
    doc.moveDown(0.8);
    doc
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .strokeColor("#e5e7eb")
      .lineWidth(1)
      .stroke();

    useRegular();
    doc
      .moveDown(0.4)
      .fontSize(9)
      .fillColor("#64748b")
      .text(
        "Bu dokuman flight-risk tarafindan operasyonel karar destegi amaciyla olusturulmustur.",
        {
          align: "center",
        }
      );

    doc.end();
  } catch (e: any) {
    res.status(400).json({ error: e?.message || "pdf failed" });
  }
});


/* ================= bootstrap ================= */
async function start() {
  await ensureAirportsReady();

  const count = getAirports().length;
  const source = getAirportsSource();
  const loadedAt = getAirportsLoadedAt();
  const PORT = Number(process.env.PORT ?? 4000);

  app.listen(PORT, () => {
    console.log(`API on http://localhost:${PORT} | airports loaded: ${count} (source: ${source}) loadedAt=${loadedAt}`);
    console.log(`Swagger UI: http://localhost:${PORT}/docs`);
    console.log(`OpenAPI JSON: http://localhost:${PORT}/openapi.json`);
  });
}

start().catch((e) => {
  console.error("[start] failed:", e);
  process.exitCode = 1;
});