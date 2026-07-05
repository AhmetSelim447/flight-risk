// apps/api/src/lib/taf.ts
// TAF ham metnini zaman-pencereli koşullara çevirir ve verilen UTC anındaki
// beklenen koşulları ParsedMet şemasına indirger.
// TEMPO/PROB pencereleri kötümser birleştirilir: min görüş, min tavan,
// wx birleşimi, max rüzgar. Risk değerlendirmesi için doğru varsayım budur.
import { parseTAFAsForecast, getCompositeForecastForDate } from "metar-taf-parser";
import type { ParsedMet } from "./met";

export type TafConditions = ParsedMet & {
  window: { fromIso: string; toIso: string };
  pessimistic: boolean;
};

const SM_TO_M = 1609.34;
const CEILING_QUANTITIES = new Set(["BKN", "OVC"]);

function visToMeters(visibility: any): number | undefined {
  if (!visibility) return undefined;
  const value = Number(visibility.value);
  if (!Number.isFinite(value)) return undefined;

  const unit = String(visibility.unit ?? "m").toUpperCase();
  const meters = unit.includes("SM") ? Math.round(value * SM_TO_M) : Math.round(value);
  return Math.min(9999, meters);
}

// metar-taf-parser bulut/vertikal görüş yüksekliklerini feet olarak saklar
// (BKN008 -> height 800, VV002 -> 200), bu yüzden ölçekleme yapılmaz.
function ceilingFromClouds(period: any): number | undefined {
  const candidates: number[] = [];

  for (const cloud of period?.clouds ?? []) {
    const quantity = String(cloud?.quantity ?? "").toUpperCase();
    const height = Number(cloud?.height);
    if (CEILING_QUANTITIES.has(quantity) && Number.isFinite(height) && height > 0) {
      candidates.push(height);
    }
  }

  const vv = Number(period?.verticalVisibility);
  if (Number.isFinite(vv) && vv > 0) candidates.push(vv);

  return candidates.length ? Math.min(...candidates) : undefined;
}

// Kütüphane hava olaylarını descriptive + phenomenons olarak ayrı tutar
// (ör. TS + RA). Risk motoru ve METAR parser'ı birleşik token bekler
// (TSRA, SHRA, FG). Yoğunluk işareti (+/-) atılır, met.ts davranışıyla uyumlu.
function wxCodes(period: any): string[] {
  const out = new Set<string>();

  for (const cond of period?.weatherConditions ?? []) {
    const descriptive = cond?.descriptive ? String(cond.descriptive).toUpperCase() : "";
    const phenomenons = (cond?.phenomenons ?? [])
      .map((p: any) => String(p).toUpperCase())
      .join("");
    const token = `${descriptive}${phenomenons}`;
    if (token) out.add(token);
  }

  // CB / TCU bulutları da konvektif sinyaldir
  for (const cloud of period?.clouds ?? []) {
    const t = String(cloud?.type ?? "").toUpperCase();
    if (t === "CB" || t === "TCU") out.add("CB");
  }

  return Array.from(out);
}

function periodToParsed(period: any): ParsedMet {
  const out: ParsedMet = {};

  if (period?.cavok) {
    out.vis = 9999;
  }

  const wind = period?.wind;
  if (wind) {
    const dir = Number(wind.degrees);
    if (Number.isFinite(dir)) out.wind_dir = dir;
    const spd = Number(wind.speed);
    if (Number.isFinite(spd)) out.wind_spd = spd;
    const gust = Number(wind.gust);
    if (Number.isFinite(gust)) out.gust = gust;
  }

  const vis = visToMeters(period?.visibility);
  if (vis != null) out.vis = vis;

  const ceiling = ceilingFromClouds(period);
  if (ceiling != null) out.ceiling = ceiling;

  const wx = wxCodes(period);
  if (wx.length) out.wx = wx;

  return out;
}

function mergePessimistic(base: ParsedMet, overlay: ParsedMet): ParsedMet {
  const out: ParsedMet = { ...base };

  if (overlay.vis != null) {
    out.vis = base.vis != null ? Math.min(base.vis, overlay.vis) : overlay.vis;
  }
  if (overlay.ceiling != null) {
    out.ceiling = base.ceiling != null ? Math.min(base.ceiling, overlay.ceiling) : overlay.ceiling;
  }
  if (overlay.wx?.length) {
    out.wx = Array.from(new Set([...(base.wx ?? []), ...overlay.wx]));
  }

  const baseWind = base.wind_spd ?? 0;
  const overlayWind = overlay.wind_spd ?? 0;
  if (overlayWind > baseWind) {
    out.wind_spd = overlay.wind_spd;
    if (overlay.wind_dir != null) out.wind_dir = overlay.wind_dir;
  }
  if ((overlay.gust ?? 0) > (out.gust ?? 0)) out.gust = overlay.gust;

  return out;
}

export function parseTafConditionsAt(
  rawTaf: string,
  issuedAtIso: string,
  whenIso: string
): TafConditions | null {
  try {
    const issued = new Date(issuedAtIso);
    const when = new Date(whenIso);
    if (Number.isNaN(issued.getTime()) || Number.isNaN(when.getTime())) return null;

    const forecastReport = parseTAFAsForecast(String(rawTaf).trim(), { issued });

    const start = (forecastReport as any).start ? new Date((forecastReport as any).start) : null;
    const end = (forecastReport as any).end ? new Date((forecastReport as any).end) : null;
    if (start && when < start) return null;
    if (end && when > end) return null;

    const composite = getCompositeForecastForDate(when, forecastReport);
    const prevailing = composite?.prevailing;
    if (!prevailing) return null;

    let parsed = periodToParsed(prevailing);
    let pessimistic = false;

    for (const supplemental of composite?.supplemental ?? []) {
      parsed = mergePessimistic(parsed, periodToParsed(supplemental));
      pessimistic = true;
    }

    const fromIso = new Date((prevailing as any).start ?? issued).toISOString();
    const toIso = new Date((prevailing as any).end ?? end ?? when).toISOString();

    return { ...parsed, window: { fromIso, toIso }, pessimistic };
  } catch {
    return null;
  }
}
