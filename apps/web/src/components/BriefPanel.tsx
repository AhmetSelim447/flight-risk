// apps/web/src/components/BriefPanel.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { BriefResponse } from "../lib/api";
import { API_BASE, fetchBrief } from "../lib/api";
import { loadSettings, convWind } from "../lib/settings";
import { parseTaf } from "../lib/taf";

type UiNotamItem = {
  id: string;
  text: string;
  critical?: boolean;
};

type AlternateDetail = {
  icao: string;
  name?: string;
  dist_km?: number;
  best_rwy_m?: number;
  rank_score?: number;
  badges?: string[];
  critical_notams?: number;
  crosswind_abs?: number;
  weather_label?: string;
  ceiling_label?: string;
  visibility_label?: string;
  reason_summary?: string;
};

function splitNotams(items?: UiNotamItem[]) {
  const list = Array.isArray(items) ? items : [];
  return {
    critical: list.filter((n) => Boolean(n.critical)),
    normal: list.filter((n) => !n.critical),
  };
}

function parseAlternateLabel(label: string) {
  const raw = String(label || "").trim();
  const icao = raw.match(/^[A-Z]{4}/)?.[0] ?? raw;
  const kmMatch = raw.match(/\((\d+)\s*km\)/i);
  const distanceKm = kmMatch ? Number(kmMatch[1]) : null;

  let distanceBand = "Yakın alternate";
  if (typeof distanceKm === "number") {
    if (distanceKm <= 80) distanceBand = "Çok yakın";
    else if (distanceKm <= 150) distanceBand = "Uygun mesafe";
    else distanceBand = "Görece uzak";
  }

  return {
    raw,
    icao,
    distanceKm,
    distanceBand,
  };
}

function getAlternateCardTone(score?: number) {
  if (!Number.isFinite(score)) {
    return {
      card: "border-zinc-700 bg-zinc-900/40",
      badge: "border-zinc-700 bg-zinc-800/70 text-zinc-300",
      label: "Standart",
    };
  }

  const s = Number(score);

  if (s <= 18) {
    return {
      card: "border-emerald-600/40 bg-emerald-500/5",
      badge: "border-emerald-600/30 bg-emerald-500/10 text-emerald-200",
      label: "İyi",
    };
  }

  if (s <= 32) {
    return {
      card: "border-amber-600/40 bg-amber-500/5",
      badge: "border-amber-600/30 bg-amber-500/10 text-amber-200",
      label: "Orta",
    };
  }

  return {
    card: "border-rose-600/40 bg-rose-500/5",
    badge: "border-rose-600/30 bg-rose-500/10 text-rose-200",
    label: "Zayıf",
  };
}


function getAlternateRiskIndicator(score?: number) {
  if (!Number.isFinite(score)) {
    return {
      icon: "•",
      label: "Bilinmiyor",
      cls: "border-zinc-700 bg-zinc-800/70 text-zinc-300",
    };
  }

  const s = Number(score);

  if (s <= 18) {
    return {
      icon: "🟢",
      label: "Düşük Risk",
      cls: "border-emerald-600/30 bg-emerald-500/10 text-emerald-200",
    };
  }

  if (s <= 32) {
    return {
      icon: "🟡",
      label: "Orta Risk",
      cls: "border-amber-600/30 bg-amber-500/10 text-amber-200",
    };
  }

  return {
    icon: "🔴",
    label: "Yüksek Risk",
    cls: "border-rose-600/30 bg-rose-500/10 text-rose-200",
  };
}

function getConfidenceTone(level?: string) {
  if (level === "high") {
    return {
      badge: "border-emerald-600/30 bg-emerald-500/10 text-emerald-200",
      dot: "bg-emerald-400",
      label: "High",
    };
  }

  if (level === "medium") {
    return {
      badge: "border-amber-600/30 bg-amber-500/10 text-amber-200",
      dot: "bg-amber-400",
      label: "Medium",
    };
  }

  return {
    badge: "border-rose-600/30 bg-rose-500/10 text-rose-200",
    dot: "bg-rose-400",
    label: "Low",
  };
}




function parseAlternateSummary(summary?: string) {
  const text = String(summary || "").trim();
  if (!text) return null;

  const strongPrefix = "Güçlü aday:";
  const balancedPrefix = "Dengeli aday:";
  const cautionPrefix = "Dikkat gerekir:";

  if (text.startsWith(strongPrefix)) {
    return {
      tone: "strong" as const,
      badge: "Güçlü aday",
      body: text.slice(strongPrefix.length).trim(),
    };
  }

  if (text.startsWith(balancedPrefix)) {
    return {
      tone: "balanced" as const,
      badge: "Dengeli aday",
      body: text.slice(balancedPrefix.length).trim(),
    };
  }

  if (text.startsWith(cautionPrefix)) {
    return {
      tone: "caution" as const,
      badge: "Dikkat gerekir",
      body: text.slice(cautionPrefix.length).trim(),
    };
  }

  return {
    tone: "neutral" as const,
    badge: "Değerlendirme",
    body: text,
  };
}

function getAlternateSummaryTone(tone: "strong" | "balanced" | "caution" | "neutral") {
  if (tone === "strong") {
    return {
      badge:
        "border-emerald-600/30 bg-emerald-500/10 text-emerald-200",
      box:
        "border-emerald-700/20 bg-emerald-500/[0.04]",
    };
  }

  if (tone === "balanced") {
    return {
      badge:
        "border-sky-600/30 bg-sky-500/10 text-sky-200",
      box:
        "border-sky-700/20 bg-sky-500/[0.04]",
    };
  }

  if (tone === "caution") {
    return {
      badge:
        "border-amber-600/30 bg-amber-500/10 text-amber-200",
      box:
        "border-amber-700/20 bg-amber-500/[0.04]",
    };
  }

  return {
    badge:
      "border-zinc-700 bg-zinc-800/80 text-zinc-200",
    box:
      "border-zinc-800 bg-zinc-950/40",
  };
}

/* ===== TAF Timeline ===== */
function TafTimeline({ raw }: { raw?: string }) {
  const { validity, segments } = parseTaf(raw);

  const styleByKind: Record<string, { pill: string; bar: string; w: string }> = {
    BASE: { pill: "bg-zinc-700/40 text-zinc-200 border-zinc-600/40", bar: "bg-zinc-600", w: "w-full" },
    FM: { pill: "bg-sky-500/15 text-sky-200 border-sky-600/40", bar: "bg-sky-500", w: "w-3/4" },
    BECMG: { pill: "bg-amber-500/15 text-amber-200 border-amber-600/40", bar: "bg-amber-500", w: "w-2/3" },
    TEMPO: { pill: "bg-violet-500/15 text-violet-200 border-violet-600/40", bar: "bg-violet-500", w: "w-1/2" },
    PROB: { pill: "bg-rose-500/15 text-rose-200 border-rose-600/40", bar: "bg-rose-500", w: "w-1/3" },
  };

  return (
    <div className="mt-3 rounded-md border border-zinc-700 bg-zinc-900/60 p-2">
      <div className="mb-2 flex flex-wrap gap-2 text-[11px] text-zinc-400">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded bg-zinc-600" /> BASE
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded bg-sky-500" /> FM
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded bg-amber-500" /> BECMG
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded bg-violet-500" /> TEMPO
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded bg-rose-500" /> PROB
        </span>
        <span className="ml-auto">{`Validity: ${validity.from} → ${validity.to}`}</span>
      </div>

      <div className="flex flex-col gap-2">
        {segments.map((s, idx) => {
          const st = styleByKind[s.kind] ?? styleByKind.BASE;
          return (
            <div key={idx} className={`rounded border px-2 py-1.5 ${st.pill}`}>
              <div className="flex items-center justify-between text-xs">
                <div className="font-semibold">
                  {s.kind}
                  <span className="ml-2 font-normal text-zinc-300">
                    {s.fromZ}
                    {s.toZ ? ` → ${s.toZ}` : ""}
                  </span>
                </div>
                {s.wind ? (
                  <div className="text-zinc-200">
                    W: {s.wind.dir ?? "VRB"}° {s.wind.spd}kt
                    {typeof s.wind.gust === "number" ? ` G${s.wind.gust}` : ""}
                  </div>
                ) : (
                  <div className="text-zinc-400">W: —</div>
                )}
              </div>

              <div className="mt-1">
                <div className={`h-1.5 rounded ${st.bar} ${st.w}`} />
              </div>

              <div className="mt-1 text-[11px] text-zinc-200">
                {s.vis ? `VIS ${s.vis}` : "VIS —"}
                {" · "}
                {s.clouds?.length ? s.clouds.join(" ") : "NSC"}
                {s.wx?.length ? ` · ${s.wx.join(" ")}` : ""}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
/* ===== /TAF Timeline ===== */

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded border border-zinc-700 bg-zinc-800/70 px-2 py-0.5 text-xs">
      {children}
    </span>
  );
}

function ScorePill({ score, cls }: { score: number; cls: "green" | "yellow" | "red" }) {
  const bg =
    cls === "green"
      ? "bg-emerald-500/20 text-emerald-300 border-emerald-600/50"
      : cls === "yellow"
      ? "bg-amber-500/20 text-amber-300 border-amber-600/50"
      : "bg-rose-500/20 text-rose-300 border-rose-600/50";
  return <span className={`rounded border px-2 py-0.5 text-sm ${bg}`}>{score}</span>;
}

function Line({ w = "100%", h = 12 }: { w?: string; h?: number }) {
  return <div className="animate-pulse rounded bg-zinc-800/70" style={{ width: w, height: h }} />;
}

export default function BriefPanel() {
  const [brief, setBrief] = useState<BriefResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [alternateActionKey, setAlternateActionKey] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onL = () => setLoading(true);
    const onD = () => setLoading(false);
    window.addEventListener("brief-loading", onL);
    window.addEventListener("brief-loaded", onD);
    return () => {
      window.removeEventListener("brief-loading", onL);
      window.removeEventListener("brief-loaded", onD);
    };
  }, []);

  useEffect(() => {
    const on = () => setBrief((b) => (b ? { ...b } : b));
    window.addEventListener("settings-updated", on);
    return () => window.removeEventListener("settings-updated", on);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("lastBrief");
      if (raw) setBrief(JSON.parse(raw));
    } catch {}

    const onUpdate = () => {
      try {
        const raw = localStorage.getItem("lastBrief");
        if (raw) setBrief(JSON.parse(raw));
      } catch {}
    };

    window.addEventListener("flight-route-updated", onUpdate);
    return () => window.removeEventListener("flight-route-updated", onUpdate);
  }, []);

  if (!brief) {
    return (
      <div className="border-b border-zinc-800 p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded border border-zinc-700 bg-zinc-900/40 p-3">
            <div className="mb-2 h-4 w-24 animate-pulse rounded bg-zinc-800" />
            <div className="h-6 w-16 animate-pulse rounded bg-zinc-800" />
            <div className="mt-2 h-3 w-40 animate-pulse rounded bg-zinc-800" />
          </div>
          <div className="rounded border border-zinc-700 bg-zinc-900/40 p-3">
            <div className="mb-2 h-4 w-28 animate-pulse rounded bg-zinc-800" />
            <div className="h-4 w-full animate-pulse rounded bg-zinc-800" />
            <div className="mt-2 h-3 w-48 animate-pulse rounded bg-zinc-800" />
          </div>
          <div className="rounded border border-zinc-700 bg-zinc-900/40 p-3">
            <div className="mb-2 h-4 w-24 animate-pulse rounded bg-zinc-800" />
            <div className="space-y-2">
              <div className="h-3 w-3/4 animate-pulse rounded bg-zinc-800" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-zinc-800" />
            </div>
          </div>
        </div>
        <div className="mt-3 text-xs text-zinc-500">Brief yükleniyor…</div>
      </div>
    );
  }

  const depNotamGroups = splitNotams(brief?.notam?.dep as UiNotamItem[] | undefined);
  const arrNotamGroups = splitNotams(brief?.notam?.arr as UiNotamItem[] | undefined);

  const depNotamTotal = depNotamGroups.critical.length + depNotamGroups.normal.length;
  const arrNotamTotal = arrNotamGroups.critical.length + arrNotamGroups.normal.length;
  const totalNotams = depNotamTotal + arrNotamTotal;

  const depCriticalNotams = depNotamGroups.critical.length;
  const arrCriticalNotams = arrNotamGroups.critical.length;
  const totalCriticalNotams = depCriticalNotams + arrCriticalNotams;

  const uiReasons = [...brief.risk.reasons];
  if (
    totalCriticalNotams > 0 &&
    !uiReasons.some((r) => String(r).toLowerCase().includes("notam"))
  ) {
    uiReasons.unshift(
      `Kritik NOTAM etkisi: DEP ${depCriticalNotams}, ARR ${arrCriticalNotams}, Toplam ${totalCriticalNotams}`
    );
  }

  const metDep = brief.met?.dep?.[0];
  const metArr = brief.met?.arr?.[0];
  const tafDep = brief.taf?.dep?.[0];
  const tafArr = brief.taf?.arr?.[0];

  const depLabel = `${brief.airports.dep.icao} ${brief.airports.dep.name ?? ""}`.trim();
  const arrLabel = `${brief.airports.arr.icao} ${brief.airports.arr.name ?? ""}`.trim();
  const currentDepIcao = String(brief.airports.dep.icao || "").toUpperCase();
  const currentArrIcao = String(brief.airports.arr.icao || "").toUpperCase();

  const depRwy = brief.airports.dep.activeRunway?.id ?? "RWY ?";
  const depRwyHdg = brief.airports.dep.activeRunway?.heading;
  const provider = metDep?.source ?? tafDep?.source ?? "—";

  function copy(text?: string) {
    if (!text) return;
    navigator.clipboard?.writeText(text).catch(() => {});
  }

  function showOnMap() {
    try {
      const dep = brief.airports.dep.coords;
      const arr = brief.airports.arr.coords;
      if (dep && arr) {
        localStorage.setItem("lastRoute", JSON.stringify({ dep, arr }));
        localStorage.setItem("lastBrief", JSON.stringify(brief));
        window.dispatchEvent(new Event("flight-route-updated"));
      }
    } catch {}
  }

  function showAlternateOnMap(icao: string, reasonSummary?: string) {
    if (!icao) return;

    try {
      localStorage.setItem(
        "mapFocusAirport",
        JSON.stringify({
          icao,
          ts: Date.now(),
          source: "alternate-card",
          reason_summary: reasonSummary ?? "",
        })
      );

      localStorage.setItem("lastBrief", JSON.stringify(brief));
      navigate("/map");
    } catch {}
  }

  async function applyAlternateAs(
    next: { depIcao?: string; arrIcao?: string },
    actionKey: string
  ) {
    try {
      const currentDep = brief?.airports?.dep?.icao;
      const currentArr = brief?.airports?.arr?.icao;

      const depIcao = String(next.depIcao || currentDep || "").toUpperCase().trim();
      const arrIcao = String(next.arrIcao || currentArr || "").toUpperCase().trim();

      if (!depIcao || !arrIcao) return;
      if (depIcao === arrIcao) return;

      setAlternateActionKey(actionKey);
      window.dispatchEvent(new Event("brief-loading"));

      const nb = await fetchBrief(depIcao, arrIcao);

      localStorage.setItem("lastBrief", JSON.stringify(nb));

      const d = nb?.airports?.dep?.coords;
      const a = nb?.airports?.arr?.coords;
      if (d && a) {
        localStorage.setItem("lastRoute", JSON.stringify({ dep: d, arr: a }));
      }

      localStorage.setItem(
        "lastPair",
        JSON.stringify({
          depIcao,
          arrIcao,
          depLabel: depIcao,
          arrLabel: arrIcao,
        })
      );

      const url = new URL(window.location.href);
      url.searchParams.set("dep", depIcao);
      url.searchParams.set("arr", arrIcao);
      window.history.replaceState({}, "", `${url.pathname}${url.search}`);

      window.dispatchEvent(new Event("flight-route-updated"));
    } catch {
      //
    } finally {
      setAlternateActionKey(null);
      window.dispatchEvent(new Event("brief-loaded"));
    }
  }

  async function applyAlternateAndGoMap(
    next: { depIcao?: string; arrIcao?: string },
    actionKey: string
  ) {
    try {
      const currentDep = brief?.airports?.dep?.icao;
      const currentArr = brief?.airports?.arr?.icao;

      const depIcao = String(next.depIcao || currentDep || "").toUpperCase().trim();
      const arrIcao = String(next.arrIcao || currentArr || "").toUpperCase().trim();

      if (!depIcao || !arrIcao) return;
      if (depIcao === arrIcao) return;

      setAlternateActionKey(actionKey);
      window.dispatchEvent(new Event("brief-loading"));

      const nb = await fetchBrief(depIcao, arrIcao);

      localStorage.setItem("lastBrief", JSON.stringify(nb));

      const d = nb?.airports?.dep?.coords;
      const a = nb?.airports?.arr?.coords;
      if (d && a) {
        localStorage.setItem("lastRoute", JSON.stringify({ dep: d, arr: a }));
      }

      localStorage.setItem(
        "lastPair",
        JSON.stringify({
          depIcao,
          arrIcao,
          depLabel: depIcao,
          arrLabel: arrIcao,
        })
      );

            const focusedAltSummary =
        alternateCards.find((x) => x.icao === arrIcao)?.detail?.reason_summary ?? "";

      localStorage.setItem(
        "mapFocusAirport",
        JSON.stringify({
          icao: arrIcao,
          ts: Date.now(),
          source: "alternate-apply-map",
          reason_summary: focusedAltSummary,
        })
      );

      navigate(`/map?dep=${encodeURIComponent(depIcao)}&arr=${encodeURIComponent(arrIcao)}`);
    } catch {
      //
    } finally {
      setAlternateActionKey(null);
      window.dispatchEvent(new Event("brief-loaded"));
    }
  }

  async function downloadPdf(currentBrief?: any) {
    try {
      let dep: string | undefined = currentBrief?.airports?.dep?.icao;
      let arr: string | undefined = currentBrief?.airports?.arr?.icao;

      if (!dep || !arr) {
        const raw = localStorage.getItem("lastBrief");
        if (raw) {
          const b = JSON.parse(raw);
          dep = dep || b?.airports?.dep?.icao;
          arr = arr || b?.airports?.arr?.icao;
        }
      }
      if (!dep || !arr) return;

      const s = loadSettings();
      const base = (import.meta as any).env?.DEV ? "/api" : API_BASE;

      const url =
        `${base}/brief/pdf` +
        `?dep=${encodeURIComponent(dep)}&arr=${encodeURIComponent(arr)}` +
        `&windUnit=${encodeURIComponent(s.windUnit)}` +
        `&distUnit=${encodeURIComponent(s.distUnit)}` +
        `&tempUnit=${encodeURIComponent(s.tempUnit)}` +
        `&crossLimit=${encodeURIComponent(String(s.crossLimit ?? ""))}` +
        `&_=${Date.now()}`;

      const r = await fetch(url);
      if (!r.ok) throw new Error(`PDF failed: ${r.status}`);

      const blob = await r.blob();
      const objUrl = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = objUrl;
      a.download = `brief_${dep}_${arr}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(() => URL.revokeObjectURL(objUrl), 0);
    } catch {}
  }

  const s = loadSettings();
  const headDisp = convWind(brief.risk.headwind, s.windUnit);
  const crossDisp = convWind(brief.risk.crosswind, s.windUnit);

const breakdown = (brief.risk as any)?.breakdown;
const confidence = (brief.risk as any)?.confidence;
const confidenceTone = getConfidenceTone(confidence?.level);

const primaryDriver = String((brief.risk as any)?.primary_driver ?? "").trim();
const alternateCompare = String((brief.risk as any)?.alternate_compare ?? "").trim();

const alternateDetails = Array.isArray((brief.risk as any)?.alternateDetails)
  ? ((brief.risk as any).alternateDetails as AlternateDetail[])
  : [];

const alternateCards = (brief.risk.alternates ?? []).map((label, idx) => {
  const parsed = parseAlternateLabel(label);
  const detail = alternateDetails.find((d) => d.icao === parsed.icao) ?? null;
  const tone = getAlternateCardTone(detail?.rank_score);
  const summary = parseAlternateSummary(detail?.reason_summary);

  return {
    ...parsed,
    detail,
    tone,
    summary,
    isTopPick: idx === 0,
  };
});
  return (
    <div className="space-y-4 border-b border-zinc-800 pb-4">
      <div className="px-4 pt-4">
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_360px]">
          <div>
            <div className="text-sm text-zinc-400">Briefing</div>
            <div className="text-lg font-semibold">
              {depLabel} → {arrLabel}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-300">
              <Chip>
                Aktif Pist: {depRwy}
                {typeof depRwyHdg === "number" ? ` (${depRwyHdg}°)` : ""}
              </Chip>
              <Chip>Kaynak: {provider}</Chip>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-700 bg-zinc-900/40 p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-zinc-400">Risk Score</div>
              <ScorePill score={brief.risk.score} cls={brief.risk.class} />
            </div>

            {confidence ? (
              <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${confidenceTone.dot}`} />
                    <span className="text-xs font-medium text-zinc-300">Confidence</span>
                  </div>

                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${confidenceTone.badge}`}>
                    {confidenceTone.label}
                    {typeof confidence?.score === "number" ? ` · ${confidence.score}` : ""}
                  </span>
                </div>

                {confidence?.summary ? (
                  <div className="mt-2 text-[11px] leading-5 text-zinc-400">
                    {confidence.summary}
                  </div>
                ) : null}

                {Array.isArray(confidence?.factors) && confidence.factors.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {confidence.factors.slice(0, 3).map((f: string) => (
                      <span
                        key={f}
                        className="rounded-full border border-zinc-700 bg-zinc-900/50 px-2 py-0.5 text-[10px] text-zinc-300"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {primaryDriver ? (
  <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
    <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
      Primary Driver
    </div>
    <div className="mt-1 text-sm font-semibold text-zinc-100">
      {primaryDriver}
    </div>
  </div>
) : null}

            {breakdown ? (
              <>
                <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-zinc-300">
                  <span>Weather: {breakdown.weather}</span>
                  <span>Wind: {breakdown.wind}</span>
                  <span>NOTAM: {breakdown.notam}</span>
                </div>

                <div className="mt-2 h-2 w-full overflow-hidden rounded border border-zinc-700 bg-zinc-950/50">
                  <div className="flex h-full w-full">
                    <div
                      style={{ width: `${breakdown.weather}%` }}
                      className="h-full bg-emerald-500/70"
                    />
                    <div
                      style={{ width: `${breakdown.wind}%` }}
                      className="h-full bg-sky-500/70"
                    />
                    <div
                      style={{ width: `${breakdown.notam}%` }}
                      className="h-full bg-rose-500/70"
                    />
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-zinc-400">
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded bg-emerald-500" />
                    Weather
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded bg-sky-500" />
                    Wind
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded bg-rose-500" />
                    NOTAM
                  </span>
                </div>
              </>
            ) : (
              <div className="mt-2 text-xs text-zinc-500">Breakdown yok</div>
            )}
          </div>
        </div>
      </div>

      <div className="px-4">
        <section className="rounded-lg border border-zinc-700 bg-zinc-900/40 p-3">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="font-medium">NOTAM</div>
              <div className="text-xs text-zinc-400">
                DEP {brief.airports.dep.icao} / ARR {brief.airports.arr.icao} · Toplam {totalNotams}
              </div>
            </div>
            <Chip>Kritik: {totalCriticalNotams}</Chip>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-md border border-zinc-700 bg-zinc-950/30 p-3">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-zinc-100">DEP NOTAM</div>
                  <div className="text-xs text-zinc-400">Toplam: {depNotamTotal}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-rose-600/40 bg-rose-500/15 px-2 py-0.5 text-[11px] text-rose-200">
                    Kritik: {depNotamGroups.critical.length}
                  </span>
                  <span className="rounded-full border border-zinc-700 bg-zinc-800/70 px-2 py-0.5 text-[11px] text-zinc-300">
                    Normal: {depNotamGroups.normal.length}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                {depNotamTotal === 0 && (
                  <div className="rounded-md border border-zinc-700 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-400">
                    NOTAM yok.
                  </div>
                )}

                {depNotamGroups.critical.map((n) => (
                  <div key={n.id} className="rounded-md border border-rose-600/30 bg-rose-500/10 px-3 py-2">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="rounded-full border border-rose-600/40 bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-200">
                        Critical
                      </span>
                      <span className="text-[11px] text-zinc-400">{n.id}</span>
                    </div>
                    <div className="text-sm leading-6 text-zinc-100">{n.text}</div>
                  </div>
                ))}

                {depNotamGroups.normal.map((n) => (
                  <div key={n.id} className="rounded-md border border-zinc-700 bg-zinc-900/50 px-3 py-2">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="rounded-full border border-zinc-700 bg-zinc-800/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-300">
                        Advisory
                      </span>
                      <span className="text-[11px] text-zinc-500">{n.id}</span>
                    </div>
                    <div className="text-sm leading-6 text-zinc-200">{n.text}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-md border border-zinc-700 bg-zinc-950/30 p-3">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-zinc-100">ARR NOTAM</div>
                  <div className="text-xs text-zinc-400">Toplam: {arrNotamTotal}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-rose-600/40 bg-rose-500/15 px-2 py-0.5 text-[11px] text-rose-200">
                    Kritik: {arrNotamGroups.critical.length}
                  </span>
                  <span className="rounded-full border border-zinc-700 bg-zinc-800/70 px-2 py-0.5 text-[11px] text-zinc-300">
                    Normal: {arrNotamGroups.normal.length}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                {arrNotamTotal === 0 && (
                  <div className="rounded-md border border-zinc-700 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-400">
                    NOTAM yok.
                  </div>
                )}

                {arrNotamGroups.critical.map((n) => (
                  <div key={n.id} className="rounded-md border border-rose-600/30 bg-rose-500/10 px-3 py-2">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="rounded-full border border-rose-600/40 bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-200">
                        Critical
                      </span>
                      <span className="text-[11px] text-zinc-400">{n.id}</span>
                    </div>
                    <div className="text-sm leading-6 text-zinc-100">{n.text}</div>
                  </div>
                ))}

                {arrNotamGroups.normal.map((n) => (
                  <div key={n.id} className="rounded-md border border-zinc-700 bg-zinc-900/50 px-3 py-2">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="rounded-full border border-zinc-700 bg-zinc-800/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-300">
                        Advisory
                      </span>
                      <span className="text-[11px] text-zinc-500">{n.id}</span>
                    </div>
                    <div className="text-sm leading-6 text-zinc-200">{n.text}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-3 px-4 md:grid-cols-2">
        <div className="rounded-lg border border-zinc-700 bg-zinc-900/40 p-3">
          <div className="flex items-center justify-between">
            <div className="font-medium">DEP METAR</div>
            <button className="text-xs text-zinc-400 hover:text-zinc-200" onClick={() => copy(metDep?.raw)}>
              kopyala
            </button>
          </div>

          {loading ? (
            <div className="mt-2 space-y-2">
              <Line w="90%" />
              <Line w="70%" />
            </div>
          ) : metDep ? (
            <div className="mt-2 space-y-1 text-sm">
              <div className="break-all font-mono text-zinc-200">{metDep.raw}</div>
              <div className="mt-1 text-xs text-zinc-400">
                WDIR {metDep.parsed?.wind_dir ?? "—"}°, WSPD {metDep.parsed?.wind_spd ?? "—"} kt, VIS{" "}
                {metDep.parsed?.vis ?? "—"} m, CIG {metDep.parsed?.ceiling ?? "—"} ft
              </div>
              <div className="text-xs text-zinc-500">kaynak: {metDep.source ?? "—"}</div>
            </div>
          ) : (
            <div className="text-sm text-zinc-400">METAR yok</div>
          )}
        </div>

        <div className="rounded-lg border border-zinc-700 bg-zinc-900/40 p-3">
          <div className="flex items-center justify-between">
            <div className="font-medium">ARR METAR</div>
            <button className="text-xs text-zinc-400 hover:text-zinc-200" onClick={() => copy(metArr?.raw)}>
              kopyala
            </button>
          </div>

          {loading ? (
            <div className="mt-2 space-y-2">
              <Line w="92%" />
              <Line w="65%" />
            </div>
          ) : metArr ? (
            <div className="mt-2 space-y-1 text-sm">
              <div className="break-all font-mono text-zinc-200">{metArr.raw}</div>
            </div>
          ) : (
            <div className="text-sm text-zinc-400">METAR yok</div>
          )}
        </div>

        <div className="rounded-lg border border-zinc-700 bg-zinc-900/40 p-3">
          <div className="flex items-center justify-between">
            <div className="font-medium">DEP TAF</div>
            <button className="text-xs text-zinc-400 hover:text-zinc-200" onClick={() => copy(tafDep?.raw)}>
              kopyala
            </button>
          </div>

          {loading ? (
            <div className="mt-2 space-y-2">
              <Line w="95%" />
              <Line w="88%" />
              <Line w="76%" />
            </div>
          ) : tafDep ? (
            <>
              <div className="mt-2 break-all font-mono text-sm text-zinc-200">{tafDep.raw}</div>
              <TafTimeline raw={tafDep.raw} />
            </>
          ) : (
            <div className="text-sm text-zinc-400">TAF yok</div>
          )}
        </div>

        <div className="rounded-lg border border-zinc-700 bg-zinc-900/40 p-3">
          <div className="flex items-center justify-between">
            <div className="font-medium">ARR TAF</div>
            <button className="text-xs text-zinc-400 hover:text-zinc-200" onClick={() => copy(tafArr?.raw)}>
              kopyala
            </button>
          </div>

          {loading ? (
            <div className="mt-2 space-y-2">
              <Line w="95%" />
              <Line w="84%" />
              <Line w="70%" />
            </div>
          ) : tafArr ? (
            <>
              <div className="mt-2 break-all font-mono text-sm text-zinc-200">{tafArr.raw}</div>
              <TafTimeline raw={tafArr.raw} />
            </>
          ) : (
            <div className="text-sm text-zinc-400">TAF yok</div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4">
        <Chip>
          Headwind: {headDisp.val} {headDisp.unit}
        </Chip>
        <Chip>
          Crosswind: {crossDisp.val} {crossDisp.unit}
        </Chip>
        <button
          onClick={showOnMap}
          className="ml-auto rounded-md border border-sky-600/50 bg-sky-500/10 px-3 py-1.5 text-sm text-sky-200 hover:bg-sky-500/20"
        >
          Haritada Göster
        </button>
        <button
          onClick={() => downloadPdf(brief)}
          className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800/50"
        >
          PDF İndir
        </button>
      </div>

      <div className="px-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <div className="text-sm font-semibold">Gerekçeler</div>

          {totalCriticalNotams > 0 && (
            <>
              <span className="rounded-full border border-rose-600/40 bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-200">
                Kritik NOTAM: {totalCriticalNotams}
              </span>
              <span className="rounded-full border border-zinc-700 bg-zinc-800/70 px-2 py-0.5 text-[11px] text-zinc-300">
                DEP {depCriticalNotams} / ARR {arrCriticalNotams}
              </span>
            </>
          )}
        </div>

        {uiReasons.length === 0 ? (
          <div className="text-xs text-zinc-400">—</div>
        ) : (
          <ul className="space-y-2 text-sm text-zinc-200">
            {uiReasons.map((r, i) => {
              const isNotamReason = String(r).toLowerCase().includes("notam");
              return (
                <li
                  key={i}
                  className={`rounded-md border px-3 py-2 ${
                    isNotamReason
                      ? "border-rose-600/25 bg-rose-500/10 text-rose-100"
                      : "border-zinc-700 bg-zinc-900/40"
                  }`}
                >
                  {r}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="px-4 pb-2">
  <div className="mb-2 flex items-center justify-between">
    <div className="text-sm font-semibold">Alternate Önerileri</div>
    <div className="text-xs text-zinc-500">
      {alternateCards.length > 0 ? `${alternateCards.length} öneri` : "öneri yok"}
    </div>
  </div>

  {alternateCompare ? (
    <div className="mb-3 rounded-lg border border-sky-700/20 bg-sky-500/[0.06] p-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-sky-300/80">
        Compare
      </div>
      <div className="mt-1 text-sm leading-6 text-zinc-200">{alternateCompare}</div>
    </div>
  ) : null}

  {alternateCards.length === 0 ? (
    <div className="text-xs text-zinc-400">—</div>
  ) : (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {alternateCards.map((alt, i) => {
        const depDisabled = alt.icao === currentDepIcao;
        const arrDisabled = alt.icao === currentArrIcao;
        const depLoading = alternateActionKey === `${alt.icao}:dep`;
        const arrLoading = alternateActionKey === `${alt.icao}:arr`;
        const applyMapLoading = alternateActionKey === `${alt.icao}:apply-map`;
        const tone = getAlternateCardTone(alt.detail?.rank_score);
        const riskIndicator = getAlternateRiskIndicator(alt.detail?.rank_score);
        const isTopPick = i === 0;

        return (
          <div key={`${alt.icao}-${i}`} className={`rounded-lg border p-3 ${tone.card}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <div className="text-base font-semibold text-zinc-100">{alt.icao}</div>

                  {isTopPick && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 text-[10px] font-semibold text-yellow-200">
                      ★ En iyi öneri
                    </span>
                  )}
                </div>

                <div className="text-xs text-zinc-400">{alt.distanceBand}</div>

                {alt.detail?.name && (
                  <div className="truncate text-[11px] text-zinc-500">{alt.detail.name}</div>
                )}
              </div>

              <div className="flex flex-col items-end gap-2">
                <span className="rounded-full border border-sky-600/30 bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-200">
                  {typeof alt.distanceKm === "number" ? `${alt.distanceKm} km` : "Mesafe —"}
                </span>

                <span className={`rounded-full border px-2 py-0.5 text-[11px] ${tone.badge}`}>
                  {tone.label}
                  {typeof alt.detail?.rank_score === "number" ? ` · ${alt.detail.rank_score}` : ""}
                </span>

                <span className={`rounded-full border px-2 py-0.5 text-[11px] ${riskIndicator.cls}`}>
                  {riskIndicator.icon} {riskIndicator.label}
                </span>
              </div>
            </div>

            <div className="mt-3 h-px bg-zinc-800" />

            {Array.isArray(alt.detail?.badges) && alt.detail.badges.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {alt.detail.badges.map((badge, bi) => (
                  <span
                    key={`${alt.icao}-badge-${bi}`}
                    className="rounded-full border border-zinc-700 bg-zinc-800/80 px-2 py-0.5 text-[10px] text-zinc-200"
                  >
                    {badge}
                  </span>
                ))}
              </div>
            )}

            {alt.detail?.weather_label || alt.detail?.ceiling_label || alt.detail?.visibility_label ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {alt.detail?.weather_label ? (
                  <span className="rounded-full border border-sky-700/30 bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-200">
                    {alt.detail.weather_label}
                  </span>
                ) : null}

                {alt.detail?.ceiling_label ? (
                  <span className="rounded-full border border-zinc-700 bg-zinc-800/80 px-2 py-0.5 text-[10px] text-zinc-200">
                    {alt.detail.ceiling_label}
                  </span>
                ) : null}

                {alt.detail?.visibility_label ? (
                  <span className="rounded-full border border-zinc-700 bg-zinc-800/80 px-2 py-0.5 text-[10px] text-zinc-200">
                    {alt.detail.visibility_label}
                  </span>
                ) : null}
              </div>
            ) : null}

            {alt.summary && (
              <div
                className={`mt-3 rounded-md border px-3 py-2 ${getAlternateSummaryTone(alt.summary.tone).box}`}
              >
                <div className="mb-2">
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                      getAlternateSummaryTone(alt.summary.tone).badge
                    }`}
                  >
                    {alt.summary.badge}
                  </span>
                </div>

                <div className="text-[11px] leading-5 text-zinc-300">{alt.summary.body}</div>
              </div>
            )}

            <div className="mt-3 space-y-2 text-sm text-zinc-300">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Uygunluk</span>
                <span className="text-zinc-200">
                  {typeof alt.distanceKm === "number"
                    ? alt.distanceKm <= 120
                      ? "İyi"
                      : alt.distanceKm <= 200
                      ? "Orta"
                      : "Sınırda"
                    : "Bilinmiyor"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Pist</span>
                <span className="text-zinc-200">
                  {typeof alt.detail?.best_rwy_m === "number" ? `${alt.detail.best_rwy_m} m` : "—"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Kritik NOTAM</span>
                <span className="text-zinc-200">
                  {typeof alt.detail?.critical_notams === "number" ? alt.detail.critical_notams : "—"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Crosswind</span>
                <span className="text-zinc-200">
                  {typeof alt.detail?.crosswind_abs === "number" ? `${alt.detail.crosswind_abs} kt` : "—"}
                </span>
              </div>
            </div>

            <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-950/40 px-2 py-2 text-xs text-zinc-400">
              {alt.raw}
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2">
              <button
                onClick={() => showAlternateOnMap(alt.icao, alt.detail?.reason_summary)}
                className="w-full rounded-md border border-sky-600/40 bg-sky-500/10 px-3 py-2 text-sm text-sky-200 hover:bg-sky-500/20"
              >
                Haritada Göster
              </button>

              <button
                onClick={() =>
                  applyAlternateAndGoMap({ arrIcao: alt.icao }, `${alt.icao}:apply-map`)
                }
                disabled={arrDisabled || depLoading || arrLoading || applyMapLoading}
                className={`w-full rounded-md border px-3 py-2 text-sm ${
                  arrDisabled
                    ? "cursor-not-allowed border-zinc-700 bg-zinc-900/50 text-zinc-500"
                    : applyMapLoading
                    ? "cursor-wait border-fuchsia-600/40 bg-fuchsia-500/20 text-fuchsia-100"
                    : "border-fuchsia-600/40 bg-fuchsia-500/10 text-fuchsia-200 hover:bg-fuchsia-500/20"
                }`}
              >
                {arrDisabled
                  ? "Zaten ARR"
                  : applyMapLoading
                  ? "Uygulanıyor..."
                  : "Uygula + Haritaya Git"}
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => applyAlternateAs({ depIcao: alt.icao }, `${alt.icao}:dep`)}
                  disabled={depDisabled || depLoading || arrLoading || applyMapLoading}
                  className={`rounded-md border px-3 py-2 text-sm ${
                    depDisabled
                      ? "cursor-not-allowed border-zinc-700 bg-zinc-900/50 text-zinc-500"
                      : depLoading
                      ? "cursor-wait border-emerald-600/40 bg-emerald-500/20 text-emerald-100"
                      : "border-emerald-600/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
                  }`}
                >
                  {depDisabled ? "Mevcut DEP" : depLoading ? "Yükleniyor..." : "DEP yap"}
                </button>

                <button
                  onClick={() => applyAlternateAs({ arrIcao: alt.icao }, `${alt.icao}:arr`)}
                  disabled={arrDisabled || depLoading || arrLoading || applyMapLoading}
                  className={`rounded-md border px-3 py-2 text-sm ${
                    arrDisabled
                      ? "cursor-not-allowed border-zinc-700 bg-zinc-900/50 text-zinc-500"
                      : arrLoading
                      ? "cursor-wait border-amber-600/40 bg-amber-500/20 text-amber-100"
                      : "border-amber-600/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20"
                  }`}
                >
                  {arrDisabled ? "Mevcut ARR" : arrLoading ? "Yükleniyor..." : "ARR yap"}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  )}
</div>
    </div>
  );
}