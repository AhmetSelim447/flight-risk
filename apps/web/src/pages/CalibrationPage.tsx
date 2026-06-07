import { useEffect, useMemo, useState } from "react";
import { fetchModelStatus, type ModelStatusResponse } from "../lib/api";

function pct(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${(value * 100).toFixed(1)}%`;
}

function num(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return value.toLocaleString();
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/50 p-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-zinc-100">{value}</div>
      {sub ? <div className="mt-1 text-xs text-zinc-400">{sub}</div> : null}
    </div>
  );
}

function ConfusionMatrix({ matrix, labels }: { matrix?: number[][]; labels?: number[] }) {
  if (!Array.isArray(matrix) || !Array.isArray(labels)) {
    return <div className="text-sm text-zinc-500">No matrix</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th className="p-1 text-left text-zinc-500">actual \ predicted</th>
            {labels.map((label) => (
              <th key={label} className="rounded bg-zinc-800 p-1 text-zinc-300">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, idx) => (
            <tr key={idx}>
              <td className="rounded bg-zinc-800 p-1 font-medium text-zinc-300">{labels[idx]}</td>
              {row.map((cell, cellIdx) => (
                <td
                  key={cellIdx}
                  className={
                    idx === cellIdx
                      ? "rounded bg-emerald-500/10 p-1 text-right text-emerald-100"
                      : "rounded bg-zinc-950 p-1 text-right text-zinc-300"
                  }
                >
                  {cell.toLocaleString()}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EvaluationBlock({ item }: { item: any }) {
  const guardrail = item?.guardrail ?? {};
  const report = item?.classificationReport ?? {};
  const guardrailReport = guardrail?.classificationReport ?? {};

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-zinc-100">{item?.name ?? "evaluation"}</div>
          <div className="text-xs text-zinc-500">{num(item?.rows)} rows</div>
        </div>
        <span className="rounded-full border border-sky-600/30 bg-sky-500/10 px-2 py-0.5 text-xs text-sky-100">
          ROC AUC {typeof item?.rocAuc === "number" ? item.rocAuc.toFixed(4) : "-"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="Ham kaçan risk" value={num(item?.falseNegativeCount)} />
        <MetricCard label="Ham fazla uyarı" value={num(item?.falsePositiveCount)} />
        <MetricCard label="Taban sonrası kaçan" value={num(guardrail?.falseNegativeCount)} />
        <MetricCard label="Taban sonrası fazla uyarı" value={num(guardrail?.falsePositiveCount)} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Ham model matrisi</div>
          <ConfusionMatrix labels={item?.confusionMatrix?.labels} matrix={item?.confusionMatrix?.matrix} />
        </div>
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Emniyet tabani matrisi</div>
          <ConfusionMatrix labels={guardrail?.confusionMatrix?.labels} matrix={guardrail?.confusionMatrix?.matrix} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-md border border-zinc-800 bg-zinc-950/40 p-3">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Ham sinif kalitesi</div>
          <div className="mt-2 text-sm text-zinc-300">
            Dikkat precision {pct(report?.["1"]?.precision)} / recall {pct(report?.["1"]?.recall)}
          </div>
          <div className="text-sm text-zinc-300">
            Yüksek precision {pct(report?.["2"]?.precision)} / recall {pct(report?.["2"]?.recall)}
          </div>
        </div>
        <div className="rounded-md border border-zinc-800 bg-zinc-950/40 p-3">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Emniyet tabani kalitesi</div>
          <div className="mt-2 text-sm text-zinc-300">
            Dikkat precision {pct(guardrailReport?.["1"]?.precision)} / recall {pct(guardrailReport?.["1"]?.recall)}
          </div>
          <div className="text-sm text-zinc-300">
            Yüksek precision {pct(guardrailReport?.["2"]?.precision)} / recall {pct(guardrailReport?.["2"]?.recall)}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function CalibrationPage() {
  const [status, setStatus] = useState<ModelStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchModelStatus()
      .then((data) => {
        if (!cancelled) setStatus(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || "Model durumu yuklenemedi");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const evaluations = status?.evaluation?.evaluations ?? [];
  const labelCounts = status?.model?.metrics?.labelCounts ?? {};
  const feedback = status?.feedback;
  const positiveRows = status?.model?.metrics?.positiveRows;
  const totalRows = status?.model?.metrics?.rows;
  const positiveRate = useMemo(() => {
    if (!positiveRows || !totalRows) return "-";
    return `${((positiveRows / totalRows) * 100).toFixed(2)}%`;
  }, [positiveRows, totalRows]);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-4 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm text-zinc-400">Model kalibrasyonu</div>
          <h1 className="text-xl font-semibold text-zinc-100">Risk Model Durumu</h1>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800"
        >
          Yenile
        </button>
      </div>

      {loading ? <div className="rounded border border-zinc-800 bg-zinc-900/40 p-4 text-zinc-400">Yükleniyor...</div> : null}
      {error ? <div className="rounded border border-rose-700 bg-rose-500/10 p-4 text-rose-100">{error}</div> : null}

      {status ? (
        <>
          <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <MetricCard label="Model" value={status.model.loaded ? "Yüklü" : "Eksik"} sub={status.model.modelVersion} />
            <MetricCard label="Satır" value={num(totalRows)} sub={`pozitif ${positiveRate}`} />
            <MetricCard label="ROC AUC" value={typeof status.model.metrics?.rocAuc === "number" ? status.model.metrics.rocAuc.toFixed(4) : "-"} />
            <MetricCard label="Geri bildirim" value={num(feedback?.count)} sub="yerel etiket toplandi" />
          </section>

          <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">Veri seti etiketleri</div>
            <div className="grid grid-cols-3 gap-3">
              <MetricCard label="Normal" value={num(labelCounts["0"])} />
              <MetricCard label="Dikkat" value={num(labelCounts["1"])} />
              <MetricCard label="Yüksek" value={num(labelCounts["2"])} />
            </div>
            <div className="mt-3 text-sm leading-6 text-zinc-400">{status.model.labelDefinition}</div>
          </section>

          {evaluations.map((item) => (
            <EvaluationBlock key={item.name} item={item} />
          ))}

          <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">Geri bildirim özeti</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(feedback?.byVerdict ?? {}).map(([key, value]) => (
                <span key={key} className="rounded-full border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-300">
                  {key}: {value}
                </span>
              ))}
              {!feedback?.count ? <span className="text-sm text-zinc-500">Henuz geri bildirim yok</span> : null}
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
