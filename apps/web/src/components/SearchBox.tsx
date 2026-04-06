import { useEffect, useMemo, useRef, useState } from "react";
import { searchAirports, AirportRow } from "../lib/api";

type Props = {
  label: string;
  placeholder?: string;
  value: AirportRow | null;
  onSelect: (a: AirportRow) => void;
};

export default function SearchBox({ label, placeholder, value, onSelect }: Props) {
  const [q, setQ] = useState("");
  const [list, setList] = useState<AirportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const debouncedQ = useDebounced(q, 250);

  useEffect(() => {
    if (!debouncedQ) { setList([]); return; }
    setLoading(true);
    setOpen(true);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    searchAirports(debouncedQ)
      .then(res => { if (!ac.signal.aborted) setList(res.matches || []); })
      .catch(() => { if (!ac.signal.aborted) setList([]); })
      .finally(() => { if (!ac.signal.aborted) setLoading(false); });
    return () => ac.abort();
  }, [debouncedQ]);

  return (
    <div className="relative w-full">
      <label className="block text-xs text-zinc-400 mb-1">{label}</label>
      <input
        className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500"
        placeholder={placeholder || "ICAO / IATA / City / Name"}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setOpen(true)}
      />
      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded border border-zinc-700 bg-zinc-900/95 backdrop-blur text-sm">
          {loading && <div className="px-3 py-2 text-zinc-400">Searching…</div>}
          {!loading && list.length === 0 && debouncedQ && (
            <div className="px-3 py-2 text-zinc-400">No results</div>
          )}
          {!loading && list.map((a) => (
            <button
              key={a.icao}
              className="w-full text-left px-3 py-2 hover:bg-zinc-800"
              onClick={() => { onSelect(a); setQ(`${a.icao} — ${a.name || ""}`.trim()); setOpen(false); }}
            >
              <div className="font-medium">{a.icao} {a.iata ? `(${a.iata})` : ""}</div>
              <div className="text-xs text-zinc-400">{[a.name, a.city].filter(Boolean).join(" • ")}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function useDebounced<T>(v: T, ms = 300) {
  const [s, setS] = useState(v);
  useEffect(() => {
    const id = setTimeout(() => setS(v), ms);
    return () => clearTimeout(id);
  }, [v, ms]);
  return s;
}
