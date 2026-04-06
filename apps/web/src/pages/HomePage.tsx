import { useState } from "react";
import SearchBox from "../components/SearchBox";
import { AirportRow, BriefResponse, fetchBrief } from "../lib/api";

export default function HomePage() {
  const [dep, setDep] = useState<AirportRow | null>(null);
  const [arr, setArr] = useState<AirportRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canBrief = !!dep && !!arr;

  async function onBrief() {
    if (!dep || !arr) return;
    setLoading(true);
    setError(null);
    try {
      const brief: BriefResponse = await fetchBrief(dep.icao, arr.icao);
      // persist
      localStorage.setItem("lastBrief", JSON.stringify(brief));
      if (brief?.airports?.dep?.coords && brief?.airports?.arr?.coords) {
        localStorage.setItem("lastRoute", JSON.stringify({
          dep: brief.airports.dep.coords,
          arr: brief.airports.arr.coords,
        }));
      }
      // MapPage güncellesin
      window.dispatchEvent(new Event("flight-route-updated"));
    } catch (e: any) {
      setError(e?.message || "Brief alınamadı");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SearchBox label="Departure" value={dep} onSelect={setDep} />
        <SearchBox label="Arrival" value={arr} onSelect={setArr} />
      </div>

      <div className="flex items-center gap-3">
        <button
          className="rounded bg-sky-600 px-4 py-2 text-sm font-semibold hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!canBrief || loading}
          onClick={onBrief}
        >
          {loading ? "Fetching…" : "Get Brief"}
        </button>
        {error && <span className="text-red-400 text-sm">{error}</span>}
      </div>

      {/* Opsiyonel: en son brief’in minik özeti */}
      <LastBriefSummary />
    </div>
  );
}

function LastBriefSummary() {
  const raw = typeof window !== "undefined" ? localStorage.getItem("lastBrief") : null;
  if (!raw) return null;
  try {
    const b = JSON.parse(raw) as BriefResponse;
    return (
      <div className="rounded border border-zinc-700 p-3 text-sm">
        <div className="font-semibold mb-1">
          {b.airports.dep.icao} → {b.airports.arr.icao} — Risk: {b.risk.score} ({b.risk.class})
        </div>
        <div className="text-zinc-400">
          Head {Math.round(b.risk.headwind)} kt • Cross {Math.round(b.risk.crosswind)} kt
        </div>
      </div>
    );
  } catch {
    return null;
  }
}
