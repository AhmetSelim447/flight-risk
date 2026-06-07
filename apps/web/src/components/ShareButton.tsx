import { useMemo, useState } from "react";

function getLastPairSafe() {
  try {
    const raw = localStorage.getItem("lastPair");
    if (!raw) return {};
    const p = JSON.parse(raw);
    return {
      dep: p?.depIcao ?? p?.dep ?? undefined,
      arr: p?.arrIcao ?? p?.arr ?? undefined,
      depLabel: p?.depLabel ?? undefined,
      arrLabel: p?.arrLabel ?? undefined,
    };
  } catch {
    return {};
  }
}

function getSettingsQuerySafe(): Record<string, string> {
  try {
    const raw = localStorage.getItem("settings");
    if (!raw) return {};
    const s = JSON.parse(raw);

    const q: Record<string, string> = {};
    if (s?.windUnit) q.windUnit = String(s.windUnit);
    if (s?.distUnit) q.distUnit = String(s.distUnit);
    if (s?.tempUnit) q.tempUnit = String(s.tempUnit);
    if (s?.crossLimit != null) q.crossLimit = String(s.crossLimit);
    return q;
  } catch {
    return {};
  }
}

function buildShareUrl() {
  const url = new URL(window.location.href);
  const { dep, arr } = getLastPairSafe();
  if (dep) url.searchParams.set("dep", dep);
  if (arr) url.searchParams.set("arr", arr);

  const s = getSettingsQuerySafe();
  Object.entries(s).forEach(([k, v]) => url.searchParams.set(k, v));

  return url.toString();
}

export default function ShareButton() {
  const [copied, setCopied] = useState(false);

  const shareUrl = useMemo(() => buildShareUrl(), [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      window.prompt("Linki kopyala:", shareUrl);
    }
  }

  return (
    <button
      onClick={copy}
      type="button"
      className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm hover:bg-zinc-800"
      title="Bu brief linkini kopyala"
    >
      {copied ? "Kopyalandı" : "Paylaş"}
    </button>
  );
}
