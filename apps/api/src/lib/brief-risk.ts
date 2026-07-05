// apps/api/src/lib/brief-risk.ts
// İki-bacaklı rota risk çekirdeği. Ağ erişimi yok; buildBrief'in topladığı
// veriyle çalışır. DEP bacağı ETD anını (METAR + TAF penceresi), ARR bacağı
// ETA anını (TAF penceresi öncelikli, METAR fallback) skorlar.
import { riskScore, classifyScore, windComponents } from "./risk";
import { parseTafConditionsAt } from "./taf";
import { computeEtaPlan, EtaPlan } from "./eta";
import type { ParsedMet } from "./met";

type AirportLike = {
  icao: string;
  coords?: { lat: number; lng: number };
  runways?: { id: string; heading: number }[];
};

type MetarLike = { parsed?: ParsedMet; issuedAtIso?: string } | null;

export type RouteRiskInput = {
  dep: AirportLike;
  arr: AirportLike;
  depMetar: MetarLike;
  arrMetar: MetarLike;
  depTafRaw: string | null;
  depTafIssuedIso: string | null;
  arrTafRaw: string | null;
  arrTafIssuedIso: string | null;
  depCriticalNotams: number;
  arrCriticalNotams: number;
  crossLimit: number;
  etdIso?: string;
};

export type LegRisk = {
  score: number;
  class: "green" | "yellow" | "red";
  reasons: string[];
  floors: string[];
  conditions: ParsedMet;
  conditionsSource: "metar" | "taf" | "metar+taf" | "none";
  head: number;
  cross: number;
};

export type RouteRisk = {
  score: number;
  class: "green" | "yellow" | "red";
  reasons: string[];
  legs: { dep: LegRisk; arr: LegRisk };
  plan: EtaPlan;
  degraded: boolean;
};

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
  if ((overlay.wind_spd ?? 0) > (base.wind_spd ?? 0)) {
    out.wind_spd = overlay.wind_spd;
    if (overlay.wind_dir != null) out.wind_dir = overlay.wind_dir;
  }
  if ((overlay.gust ?? 0) > (out.gust ?? 0)) out.gust = overlay.gust;

  return out;
}

function bestRunwayFor(airport: AirportLike, windDir?: number) {
  const runways = airport.runways ?? [];
  if (!runways.length) return undefined;
  if (windDir == null) return runways[0];

  // Rüzgara en yakın başlı pisti seç (headwind maksimize)
  let best = runways[0];
  let bestDiff = -1;
  for (const rwy of runways) {
    const raw = Math.abs(((windDir - rwy.heading + 540) % 360) - 180);
    const alignment = 180 - raw; // 180 = tam karşı rüzgar hizası
    if (alignment > bestDiff) {
      bestDiff = alignment;
      best = rwy;
    }
  }
  return best;
}

function scoreLeg(
  airport: AirportLike,
  conditions: ParsedMet | null,
  conditionsSource: LegRisk["conditionsSource"],
  criticalNotams: number,
  crossLimit: number
): LegRisk {
  const parsed = conditions ?? {};
  const runway = bestRunwayFor(airport, parsed.wind_dir);
  const { head, cross } = windComponents(
    runway?.heading ?? 0,
    parsed.wind_dir,
    // Gust varsa rüzgar bileşenlerinde gust'ı kullan (kötümser)
    parsed.gust != null && parsed.wind_spd != null
      ? Math.max(parsed.wind_spd, parsed.gust)
      : parsed.wind_spd
  );

  const base = riskScore({
    vis: parsed.vis,
    ceiling: parsed.ceiling,
    wx: parsed.wx ?? [],
    head,
    cross,
    crossLimit,
    notamCritical: criticalNotams,
  });

  return {
    score: base.score,
    class: base.class,
    reasons: base.reasons,
    floors: base.floors,
    conditions: parsed,
    conditionsSource,
    head,
    cross,
  };
}

export function computeRouteRisk(input: RouteRiskInput): RouteRisk {
  const depCoords = input.dep.coords ?? { lat: 0, lng: 0 };
  const arrCoords = input.arr.coords ?? { lat: 0, lng: 0 };
  const plan = computeEtaPlan(depCoords, arrCoords, input.etdIso);

  // --- DEP bacağı: ETD anı. METAR temel; TAF'ın ETD penceresi kötümser eklenir.
  let depConditions: ParsedMet | null = input.depMetar?.parsed ?? null;
  let depSource: LegRisk["conditionsSource"] = depConditions ? "metar" : "none";

  if (input.depTafRaw && input.depTafIssuedIso) {
    const tafAtEtd = parseTafConditionsAt(input.depTafRaw, input.depTafIssuedIso, plan.etdUtc);
    if (tafAtEtd) {
      depConditions = depConditions ? mergePessimistic(depConditions, tafAtEtd) : tafAtEtd;
      depSource = input.depMetar?.parsed ? "metar+taf" : "taf";
    }
  }

  // --- ARR bacağı: ETA anı. TAF penceresi öncelikli; yoksa mevcut ARR METAR.
  let arrConditions: ParsedMet | null = null;
  let arrSource: LegRisk["conditionsSource"] = "none";

  if (input.arrTafRaw && input.arrTafIssuedIso) {
    const tafAtEta = parseTafConditionsAt(input.arrTafRaw, input.arrTafIssuedIso, plan.etaUtc);
    if (tafAtEta) {
      arrConditions = tafAtEta;
      arrSource = "taf";
    }
  }
  if (!arrConditions && input.arrMetar?.parsed) {
    arrConditions = input.arrMetar.parsed;
    arrSource = "metar";
  }

  const depLeg = scoreLeg(input.dep, depConditions, depSource, input.depCriticalNotams, input.crossLimit);
  const arrLeg = scoreLeg(input.arr, arrConditions, arrSource, input.arrCriticalNotams, input.crossLimit);

  const degraded = arrSource === "none";

  // --- Birleştirme: en kötü bacak baskın, diğeri %25 katkı.
  const worst = Math.max(depLeg.score, arrLeg.score);
  const other = Math.min(depLeg.score, arrLeg.score);
  const combinedScore = Math.min(100, worst + Math.round(other * 0.25));

  let combinedClass = classifyScore(combinedScore);

  // Bacak sınıfları birleşik sınıfı da bağlar (skor düşük olsa bile)
  const legWorstClass =
    depLeg.class === "red" || arrLeg.class === "red"
      ? "red"
      : depLeg.class === "yellow" || arrLeg.class === "yellow"
        ? "yellow"
        : "green";

  if (legWorstClass === "red" && combinedClass !== "red") combinedClass = "red";
  if (legWorstClass === "yellow" && combinedClass === "green") combinedClass = "yellow";

  const reasons: string[] = [
    ...depLeg.reasons.map((r) => `DEP: ${r}`),
    ...arrLeg.reasons.map((r) => `ARR: ${r}`),
    ...depLeg.floors.map((f) => `DEP: ${f}`),
    ...arrLeg.floors.map((f) => `ARR: ${f}`),
  ];

  if (arrSource === "taf") {
    reasons.push(`ARR koşulları ETA (${plan.etaUtc.slice(11, 16)}Z) TAF penceresinden değerlendirildi`);
  } else if (arrSource === "metar") {
    reasons.push("ARR için TAF penceresi bulunamadı; mevcut METAR kullanıldı");
  } else {
    reasons.push("ARR koşul verisi eksik; skor yalnızca kalkış bacağına dayanıyor");
    if (combinedClass === "green") combinedClass = "yellow"; // veri yokluğu yeşil gösterilmez
  }

  return {
    score: combinedScore,
    class: combinedClass,
    reasons,
    legs: { dep: depLeg, arr: arrLeg },
    plan,
    degraded,
  };
}
