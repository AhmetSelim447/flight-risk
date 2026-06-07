import { useState } from "react";
import { api } from "../lib/api";
import AirportSearch from "../components/AirportSearch";
import type { Airport } from "../types";

type BriefResp = {
  airports: { dep: Airport; arr: Airport };
  met: { dep: any[]; arr: any[] };
  notam: { dep: any[]; arr: any[] };
  risk: { score: number; class: "green"|"yellow"|"red"; headwind:number; crosswind:number; reasons?: string[] };
};

export default function BriefPage() {
  const [city, setCity] = useState("Istanbul"); // ileride şehir autocomplete'e bağlayacağız (ops.)
  const [dep, setDep] = useState<Airport | null>(null);
  const [arr, setArr] = useState<Airport | null>(null);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<BriefResp | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function createBrief() {
    if (!dep?.icao || !arr?.icao) { setErr("Kalkış/Varış seçiniz"); return; }
    setLoading(true); setErr(null);
    try {
      const r = await api.get<BriefResp>("/brief", { params: { dep: dep.icao, arr: arr.icao } });
      setData(r.data);

      const depC = r.data.airports.dep.coords;
      const arrC = r.data.airports.arr.coords;
      if (depC && arrC) {
        localStorage.setItem("lastRoute", JSON.stringify({ dep: depC, arr: arrC }));
        window.dispatchEvent(new Event("flight-route-updated"));
      }
    } catch (e:any) {
      setErr(e?.message ?? "Beklenmeyen hata");
    } finally { setLoading(false); }
  }

  const badge = data?.risk.class === "green" ? "bg-emerald-600"
              : data?.risk.class === "yellow" ? "bg-amber-500"
              : "bg-rose-600";

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-4">
        <label className="block text-sm mb-1">Şehir (opsiyonel)</label>
        <input value={city} onChange={e=>setCity(e.target.value)}
               className="w-full rounded bg-zinc-900 border border-zinc-700 px-3 py-2" />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <AirportSearch label="Kalkış (ICAO/IATA/Şehir)" onSelect={setDep} value={dep?.icao}/>
        <AirportSearch label="Varış (ICAO/IATA/Şehir)"   onSelect={setArr} value={arr?.icao}/>
      </div>

      <div className="mt-4">
        <button onClick={createBrief} disabled={loading}
                className="bg-white text-black px-4 py-2 rounded hover:opacity-90 disabled:opacity-50">
          {loading ? "Oluşturuluyor..." : "Brifing Oluştur"}
        </button>
      </div>

      {err && <div className="mt-4 text-rose-400">Hata: {err}</div>}

      {data && (
        <div className="mt-6 grid gap-4">
          <div className="rounded-xl border border-zinc-700 p-4">
            <h3 className="font-semibold mb-2">Risk</h3>
            <span className={`text-white px-3 py-1 rounded ${badge}`}>
              {data.risk.class.toUpperCase()} · {data.risk.score}
            </span>
            <div className="mt-2 text-sm text-zinc-300">
              Karşı rüzgar: {data.risk.headwind} kt · Yan rüzgar: {data.risk.crosswind} kt
            </div>
            {data.risk.reasons?.length ? (
              <ul className="list-disc ml-6 text-sm mt-2">
                {data.risk.reasons!.map((r,i) => <li key={i}>{r}</li>)}
              </ul>
            ) : null}
          </div>

          <div className="rounded-xl border border-zinc-700 p-4">
            <h3 className="font-semibold mb-2">Meydanlar</h3>
            <div className="text-sm text-zinc-300">DEP: {data.airports.dep.icao} · {data.airports.dep.name ?? ""}</div>
            <div className="text-sm text-zinc-300">ARR: {data.airports.arr.icao} · {data.airports.arr.name ?? ""}</div>
          </div>

          <div className="rounded-xl border border-zinc-700 p-4">
            <h3 className="font-semibold mb-2">METAR/TAF (mock)</h3>
            <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(data.met, null, 2)}</pre>
          </div>

          <div className="rounded-xl border border-zinc-700 p-4">
            <h3 className="font-semibold mb-2">NOTAM (mock)</h3>
            <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(data.notam, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
