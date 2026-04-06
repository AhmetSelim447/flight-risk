import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useDebounce } from "../hooks/useDebounce";
import type { Airport } from "../types";

type Props = {
  label: string;                      // "Kalkış (ICAO)" gibi
  placeholder?: string;
  value?: string;                     // seçili ICAO (üst bileşen kontrolü için)
  onSelect: (ap: Airport) => void;    // seçilince döndür
};

export default function AirportSearch({ label, placeholder, value, onSelect }: Props) {
  const [input, setInput] = useState(value ?? "");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Airport[]>([]);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const q = useDebounce(input, 300);

  useEffect(() => setInput(value ?? ""), [value]);

  useEffect(() => {
    if (!q || q.trim().length < 2) { setItems([]); return; }
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const { data } = await api.get<{ matches: Airport[] }>("/airports/search", { params: { q } });
        if (!cancelled) setItems(data.matches ?? []);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(ap: Airport) {
    setInput(ap.icao);
    setOpen(false);
    onSelect(ap);
  }

  return (
    <div className="w-full" ref={boxRef}>
      <label className="block text-sm mb-1">{label}</label>
      <div className="relative">
        <input
          value={input}
          onChange={e => { setInput(e.target.value.toUpperCase()); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder ?? "ICAO / IATA / Şehir / Meydan"}
          className="w-full rounded bg-zinc-900 border border-zinc-700 px-3 py-2"
        />
        {open && (
          <div className="absolute z-20 mt-1 w-full rounded border border-zinc-700 bg-zinc-900 shadow-lg max-h-72 overflow-auto">
            {loading && <div className="px-3 py-2 text-sm text-zinc-400">Aranıyor…</div>}
            {!loading && items.length === 0 && q.trim().length >= 2 && (
              <div className="px-3 py-2 text-sm text-zinc-400">Sonuç yok</div>
            )}
            {!loading && items.map((ap) => (
              <button
                key={ap.icao}
                onClick={() => pick(ap)}
                className="w-full text-left px-3 py-2 hover:bg-zinc-800"
              >
                <div className="text-sm">
                  <span className="font-mono font-semibold">{ap.icao}</span>
                  {ap.iata ? <span className="ml-2 opacity-80">{ap.iata}</span> : null}
                </div>
                <div className="text-xs opacity-70">
                  {ap.name ?? ""}{ap.city ? ` · ${ap.city}` : ""}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
