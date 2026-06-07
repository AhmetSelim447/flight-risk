import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { API_BASE, fetchBrief, fetchModelStatus, type BriefResponse, type ModelStatusResponse } from "../lib/api";

function fmtNumber(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return value.toLocaleString();
}

function fmtDate(value?: string | null) {
  if (!value) return "yok";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function riskTone(cls?: string) {
  if (cls === "green") return "border-emerald-600/40 bg-emerald-500/10 text-emerald-100";
  if (cls === "yellow") return "border-amber-600/40 bg-amber-500/10 text-amber-100";
  return "border-rose-600/40 bg-rose-500/10 text-rose-100";
}

function translateBriefText(value?: string) {
  return String(value || "")
    .replace(/\bWeather\b/g, "Hava")
    .replace(/\bWind\b/g, "Ruzgar")
    .replace(/\bTrained METAR model\b/g, "Eğitilmiş METAR modeli")
    .replace(/\bMETAR guardrail floor\b/g, "METAR emniyet tabani")
    .replace(/\bHigh\b/g, "Yüksek")
    .replace(/\bMedium\b/g, "Orta")
    .replace(/\bLow\b/g, "Düşük")
    .replace(/\bInfo\b/g, "Bilgi");
}

function confidenceLabel(value?: string) {
  const v = String(value || "").toLowerCase();
  if (v === "high") return "Yüksek";
  if (v === "medium") return "Orta";
  if (v === "low") return "Düşük";
  return value || "-";
}

function formatRiskDriver(value?: string) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(Weather|Wind|NOTAM):\s*(\d+)/i);
  if (!match) return translateBriefText(raw);

  const key = match[1].toLowerCase();
  const score = Number(match[2]);
  const band = score >= 70 ? "yüksek" : score >= 40 ? "orta" : "düşük";
  if (key === "notam") return `NOTAM etkisi ${band} (${score}/100)`;
  if (key === "weather") return `Hava etkisi ${band} (${score}/100)`;
  return `Rüzgar etkisi ${band} (${score}/100)`;
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/35 p-3">
      <div className="mb-3 text-[11px] font-medium tracking-wide text-zinc-500">{title}</div>
      {children}
    </section>
  );
}

function readLastBrief() {
  try {
    const raw = localStorage.getItem("lastBrief");
    return raw ? (JSON.parse(raw) as BriefResponse) : null;
  } catch {
    return null;
  }
}

const quickRoutes = [
  { dep: "LTFM", arr: "LTAC", label: "Istanbul - Ankara" },
  { dep: "LTAC", arr: "LTAI", label: "Ankara - Antalya" },
  { dep: "LTBJ", arr: "LTBS", label: "Izmir - Dalaman" },
];

export default function HomeDashboard() {
  const [status, setStatus] = useState<ModelStatusResponse | null>(null);
  const [brief, setBrief] = useState<BriefResponse | null>(() => readLastBrief());
  const [busyRoute, setBusyRoute] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchModelStatus()
      .then((data) => {
        if (!cancelled) setStatus(data);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const refresh = () => setBrief(readLastBrief());
    window.addEventListener("flight-route-updated", refresh);
    return () => window.removeEventListener("flight-route-updated", refresh);
  }, []);

  const routeLabel = brief
    ? `${brief.airports.dep.icao} -> ${brief.airports.arr.icao}`
    : "Henüz brief yok";
  const primaryDriver = String((brief?.risk as any)?.primary_driver || brief?.risk.ml?.drivers?.[0] || brief?.risk.reasons?.[0] || "").trim();
  const totalCritical =
    Number((brief?.notam?.dep ?? []).filter((n: any) => n?.critical || n?.event?.critical).length) +
    Number((brief?.notam?.arr ?? []).filter((n: any) => n?.critical || n?.event?.critical).length);
  const bestEval = useMemo(() => {
    const list = status?.evaluation?.evaluations ?? [];
    return list.find((item: any) => item?.name === "time_validation") ?? list[0];
  }, [status]);
  const guardrailFn = bestEval?.guardrail?.falseNegativeCount;

  async function runQuickRoute(dep: string, arr: string) {
    const key = `${dep}-${arr}`;
    try {
      setBusyRoute(key);
      window.dispatchEvent(new Event("brief-loading"));
      const next = await fetchBrief(dep, arr);
      localStorage.setItem("lastBrief", JSON.stringify(next));
      localStorage.setItem("lastPair", JSON.stringify({ depIcao: dep, arrIcao: arr, depLabel: dep, arrLabel: arr }));
      const d = next.airports.dep.coords;
      const a = next.airports.arr.coords;
      if (d && a) localStorage.setItem("lastRoute", JSON.stringify({ dep: d, arr: a }));
      const url = new URL(window.location.href);
      url.searchParams.set("dep", dep);
      url.searchParams.set("arr", arr);
      window.history.replaceState({}, "", `${url.pathname}${url.search}`);
      setBrief(next);
      window.dispatchEvent(new Event("flight-route-updated"));
    } catch {
      // Search bar and brief panel keep their own fallback states.
    } finally {
      setBusyRoute(null);
      window.dispatchEvent(new Event("brief-loaded"));
    }
  }

  function downloadPdf() {
    if (!brief) return;
    const dep = brief.airports.dep.icao;
    const arr = brief.airports.arr.icao;
    const base = (import.meta as any).env?.DEV ? "/api" : API_BASE;
    window.open(`${base}/brief/pdf?dep=${encodeURIComponent(dep)}&arr=${encodeURIComponent(arr)}&_=${Date.now()}`, "_blank");
  }

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.2fr_1fr_1fr]">
      <Card title="Operasyon Özeti">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-zinc-100">{routeLabel}</div>
            <div className="mt-1 text-xs text-zinc-500">Son seçilen rota ve karar destek özeti</div>
          </div>
          {brief ? (
            <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${riskTone(brief.risk.class)}`}>
              {brief.risk.score}/100
            </span>
          ) : null}
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-md border border-zinc-800 bg-zinc-950/40 p-2">
            <div className="text-[10px] uppercase tracking-wide text-zinc-500">Ana neden</div>
            <div className="mt-1 min-h-10 text-sm leading-5 text-zinc-200">{formatRiskDriver(primaryDriver) || "Brifing alınınca görünür"}</div>
          </div>
          <div className="rounded-md border border-zinc-800 bg-zinc-950/40 p-2">
            <div className="text-[10px] uppercase tracking-wide text-zinc-500">Kritik NOTAM</div>
            <div className="mt-1 text-lg font-semibold text-zinc-100">{brief ? totalCritical : "-"}</div>
          </div>
          <div className="rounded-md border border-zinc-800 bg-zinc-950/40 p-2">
            <div className="text-[10px] uppercase tracking-wide text-zinc-500">Güven</div>
            <div className="mt-1 text-sm font-semibold text-zinc-100">
              {confidenceLabel(brief?.risk.ml?.confidence?.level)}
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={downloadPdf}
            disabled={!brief}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            PDF
          </button>
          <Link
            to="/map"
            className="rounded-md border border-sky-600/40 bg-sky-500/10 px-3 py-1.5 text-sm text-sky-200 hover:bg-sky-500/20"
          >
            Harita
          </Link>
        </div>
      </Card>

      <Card title="Veri Durumu">
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-zinc-400">METAR/TAF</span>
            <span className="font-medium text-zinc-100">{status?.providers?.metProvider ?? "auto"}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-zinc-400">NOTAM</span>
            <span className="font-medium text-zinc-100">
              {status?.providers?.notamProvider ?? "simulated"}
              {status?.providers?.notamSyntheticMode ? ` / ${status.providers.notamSyntheticMode}` : ""}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-zinc-400">TAF snapshot</span>
            <span className="text-right font-medium text-zinc-100">{fmtDate(status?.snapshots?.latestTafUpdatedAt)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-zinc-400">TAF meydan</span>
            <span className="font-medium text-zinc-100">{fmtNumber(status?.snapshots?.latestTafStations?.length)}</span>
          </div>
        </div>
      </Card>

      <Card title="Model Sağlığı">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md border border-zinc-800 bg-zinc-950/40 p-2">
            <div className="text-[10px] uppercase tracking-wide text-zinc-500">Model</div>
            <div className="mt-1 text-sm font-semibold text-zinc-100">{status?.model.loaded ? "Yüklü" : "Yok"}</div>
          </div>
          <div className="rounded-md border border-zinc-800 bg-zinc-950/40 p-2">
            <div className="text-[10px] uppercase tracking-wide text-zinc-500">AUC</div>
            <div className="mt-1 text-sm font-semibold text-zinc-100">
              {typeof status?.model.metrics?.rocAuc === "number" ? status.model.metrics.rocAuc.toFixed(3) : "-"}
            </div>
          </div>
          <div className="rounded-md border border-zinc-800 bg-zinc-950/40 p-2">
            <div className="text-[10px] uppercase tracking-wide text-zinc-500">Eğitim satırı</div>
            <div className="mt-1 text-sm font-semibold text-zinc-100">{fmtNumber(status?.model.metrics?.rows)}</div>
          </div>
          <div className="rounded-md border border-zinc-800 bg-zinc-950/40 p-2">
            <div className="text-[10px] uppercase tracking-wide text-zinc-500">Kaçan kritik</div>
            <div className="mt-1 text-sm font-semibold text-zinc-100">{fmtNumber(guardrailFn)}</div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {quickRoutes.map((route) => {
            const key = `${route.dep}-${route.arr}`;
            return (
              <button
                key={key}
                onClick={() => runQuickRoute(route.dep, route.arr)}
                disabled={busyRoute !== null}
                className="rounded-full border border-zinc-700 bg-zinc-950/50 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                title={route.label}
              >
                {busyRoute === key ? "Yükleniyor" : `${route.dep}-${route.arr}`}
              </button>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
