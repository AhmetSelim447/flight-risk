// apps/web/src/components/SearchBar.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { searchAirports, fetchBrief, type AirportRow, type BriefResponse } from "../lib/api";
import ShareButton from "./ShareButton";

const MIN_Q = 2;
const DEBOUNCE_MS = 350;

type PickSide = "dep" | "arr";

// --- tiny skeleton helpers ---
function Line({ w = "100%", h = 12 }: { w?: string; h?: number }) {
  return <div className="animate-pulse rounded bg-zinc-800/70" style={{ width: w, height: h }} />;
}
function SkeletonCard() {
  return (
    <div className="rounded-md border border-zinc-700 bg-zinc-900/60 p-3">
      <Line w="60%" />
      <div className="mt-2 space-y-2">
        <Line w="95%" />
        <Line w="80%" />
      </div>
    </div>
  );
}

export default function SearchBar() {
  // giriş kutuları (label olarak tutulur: "LTFM – Istanbul Airport" gibi)
  const [depQ, setDepQ] = useState("");
  const [arrQ, setArrQ] = useState("");

  // seçilen ICAO (dropdown’dan seçilirse garanti)
  const [depIcao, setDepIcao] = useState<string | null>(null);
  const [arrIcao, setArrIcao] = useState<string | null>(null);

  // dropdown sonuçları + loading
  const [depMatches, setDepMatches] = useState<AirportRow[]>([]);
  const [arrMatches, setArrMatches] = useState<AirportRow[]>([]);
  const [depLoading, setDepLoading] = useState(false);
  const [arrLoading, setArrLoading] = useState(false);

  // brief çekme state
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);

  // dışarı tıklayınca dropdown’ları kapat
  const boxRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) {
        setDepMatches([]);
        setArrMatches([]);
      }
    };
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, []);

  // Açılışta:
  // 1) URL ?dep=&arr= varsa onları kullan
  // 2) yoksa localStorage lastPair
  // 3) eğer URL'de dep/arr varsa otomatik brief çek (deep-link)
  useEffect(() => {
    let didAutoFetch = false;

    try {
      const params = new URLSearchParams(window.location.search);
      const urlDep = params.get("dep")?.toUpperCase() ?? null;
      const urlArr = params.get("arr")?.toUpperCase() ?? null;

      // URL öncelikli
      if (urlDep && /^[A-Z]{4}$/.test(urlDep)) {
        setDepQ(urlDep);
        setDepIcao(urlDep);
      }
      if (urlArr && /^[A-Z]{4}$/.test(urlArr)) {
        setArrQ(urlArr);
        setArrIcao(urlArr);
      }

      if (urlDep && urlArr && /^[A-Z]{4}$/.test(urlDep) && /^[A-Z]{4}$/.test(urlArr)) {
        // lastPair’ı da güncelle (share link açılınca UI doğru kalsın)
        localStorage.setItem(
          "lastPair",
          JSON.stringify({ depIcao: urlDep, arrIcao: urlArr, depLabel: urlDep, arrLabel: urlArr })
        );
        didAutoFetch = true;
        // otomatik brief
        void (async () => {
          setBriefError(null);
          setBriefLoading(true);
          window.dispatchEvent(new Event("brief-loading"));
          try {
            const brief: BriefResponse = await fetchBrief(urlDep, urlArr);

            localStorage.setItem("lastBrief", JSON.stringify(brief));
            const d = brief.airports.dep.coords;
            const a = brief.airports.arr.coords;
            if (d && a) localStorage.setItem("lastRoute", JSON.stringify({ dep: d, arr: a }));

            window.dispatchEvent(new Event("flight-route-updated"));
          } catch (err: any) {
            setBriefError(err?.message || "Brief alınamadı");
          } finally {
            setBriefLoading(false);
           
          }
        })();
      }

      if (!didAutoFetch) {
        const pRaw = localStorage.getItem("lastPair");
        if (pRaw) {
          const p = JSON.parse(pRaw) as { depIcao?: string; arrIcao?: string; depLabel?: string; arrLabel?: string };
          if (p.depLabel) setDepQ(p.depLabel);
          if (p.arrLabel) setArrQ(p.arrLabel);
          if (p.depIcao) setDepIcao(p.depIcao);
          if (p.arrIcao) setArrIcao(p.arrIcao);
        }
      }
    } catch {}
  }, []);

  // --- Debounced arama (DEP) ---
  useEffect(() => {
    setDepMatches([]);
    if (depQ.trim().length < MIN_Q) return;
    const t = setTimeout(async () => {
      try {
        setDepLoading(true);
        const r = await searchAirports(depQ.trim());
        setDepMatches(r.matches || []);
      } catch {
        setDepMatches([]);
      } finally {
        setDepLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [depQ]);

  // --- Debounced arama (ARR) ---
  useEffect(() => {
    setArrMatches([]);
    if (arrQ.trim().length < MIN_Q) return;
    const t = setTimeout(async () => {
      try {
        setArrLoading(true);
        const r = await searchAirports(arrQ.trim());
        setArrMatches(r.matches || []);
      } catch {
        setArrMatches([]);
      } finally {
        setArrLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [arrQ]);

  // Dropdown’dan seçim
  function pick(side: PickSide, a: AirportRow) {
    const label = `${a.icao}${a.name ? ` – ${a.name}` : ""}`;
    if (side === "dep") {
      setDepQ(label);
      setDepIcao(a.icao);
      setDepMatches([]);
    } else {
      setArrQ(label);
      setArrIcao(a.icao);
      setArrMatches([]);
    }
  }

  // Kullanıcı 4 harf ICAO yazdıysa (dropdown seçmeden) kabul et
  const depTypedIcao = useMemo(() => {
    const m = depQ.trim().toUpperCase();
    return /^[A-Z]{4}$/.test(m) ? m : null;
  }, [depQ]);
  const arrTypedIcao = useMemo(() => {
    const m = arrQ.trim().toUpperCase();
    return /^[A-Z]{4}$/.test(m) ? m : null;
  }, [arrQ]);

  // Brief al’a izin
  const canBrief = (depIcao || depTypedIcao) && (arrIcao || arrTypedIcao) && !briefLoading;

  // SWAP (↕)
  function swap() {
    const nextDepQ = arrQ;
    const nextArrQ = depQ;
    const nextDepIcao = arrIcao;
    const nextArrIcao = depIcao;
    setDepQ(nextDepQ);
    setArrQ(nextArrQ);
    setDepIcao(nextDepIcao);
    setArrIcao(nextArrIcao);
  }

  // Brief Al
  async function onBrief() {
    if (!canBrief) return;
    setBriefError(null);
    setBriefLoading(true);
    window.dispatchEvent(new Event("brief-loading"));
    try {
      const dep = (depIcao || depTypedIcao)!.toUpperCase();
      const arr = (arrIcao || arrTypedIcao)!.toUpperCase();

      const brief: BriefResponse = await fetchBrief(dep, arr);

      // localStorage: brief + route
      localStorage.setItem("lastBrief", JSON.stringify(brief));
      const d = brief.airports.dep.coords;
      const a = brief.airports.arr.coords;
      if (d && a) localStorage.setItem("lastRoute", JSON.stringify({ dep: d, arr: a }));

      // Son seçimleri etiketleriyle kaydet
      const depLabel = depQ || dep;
      const arrLabel = arrQ || arr;
      localStorage.setItem("lastPair", JSON.stringify({ depIcao: dep, arrIcao: arr, depLabel, arrLabel }));

      // Map & BriefPanel
      window.dispatchEvent(new Event("flight-route-updated"));

      // URL'yi güncelle
      const params = new URLSearchParams(window.location.search);
      params.set("dep", dep);
      params.set("arr", arr);
      window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);

      window.dispatchEvent(new Event("brief-loaded"));
    } catch (err: any) {
      setBriefError(err?.message || "Brief alınamadı");
      window.dispatchEvent(new Event("brief-loaded"));
    } finally {
      setBriefLoading(false);
      window.dispatchEvent(new Event("brief-loaded"));
    }
  }

  return (
    <div ref={boxRef} className="border-b border-zinc-800">
      <div className="max-w-6xl mx-auto w-full px-4 py-3">
        {/* GRID: DEP | SWAP | ARR | Brief + Share */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto_auto] gap-2">
          {/* DEP */}
          <div className="relative">
            <label className="block text-xs text-zinc-400 mb-1">Departure</label>
            <input
              value={depQ}
              onChange={(e) => {
                setDepQ(e.target.value);
                setDepIcao(null);
              }}
              placeholder="LTFM / IST / Istanbul"
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-sky-600"
            />
            <div className="mt-1 text-[11px] text-zinc-500">
              {depQ.trim().length < MIN_Q ? "En az 2 karakter yaz…" : depLoading ? "Aranıyor…" : depMatches.length === 0 ? "Sonuç yok" : "Sonuçlar…"}
            </div>

            {depLoading && (
              <div className="mt-2">
                <SkeletonCard />
              </div>
            )}

            {depMatches.length > 0 && (
              <ul className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded-md border border-zinc-700 bg-zinc-900 text-sm">
                {depMatches.map((a) => (
                  <li
                    key={a.icao}
                    className="px-3 py-2 hover:bg-zinc-800 cursor-pointer"
                    onClick={() => pick("dep", a)}
                  >
                    <div className="font-medium">
                      {a.icao}
                      {a.iata ? ` / ${a.iata}` : ""}
                    </div>
                    <div className="text-xs text-zinc-400">
                      {a.city || ""} {a.name ? `– ${a.name}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* SWAP */}
          <div className="flex items-end">
            <button
              onClick={swap}
              type="button"
              className="w-full md:w-auto rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm hover:bg-zinc-800"
              title="DEP ↔ ARR"
            >
              ↕
            </button>
          </div>

          {/* ARR */}
          <div className="relative">
            <label className="block text-xs text-zinc-400 mb-1">Arrival</label>
            <input
              value={arrQ}
              onChange={(e) => {
                setArrQ(e.target.value);
                setArrIcao(null);
              }}
              placeholder="LTAC / ESB / Ankara"
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-sky-600"
            />
            <div className="mt-1 text-[11px] text-zinc-500">
              {arrQ.trim().length < MIN_Q ? "En az 2 karakter yaz…" : arrLoading ? "Aranıyor…" : arrMatches.length === 0 ? "Sonuç yok" : "Sonuçlar…"}
            </div>

            {arrLoading && (
              <div className="mt-2">
                <SkeletonCard />
              </div>
            )}

            {arrMatches.length > 0 && (
              <ul className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded-md border border-zinc-700 bg-zinc-900 text-sm">
                {arrMatches.map((a) => (
                  <li
                    key={a.icao}
                    className="px-3 py-2 hover:bg-zinc-800 cursor-pointer"
                    onClick={() => pick("arr", a)}
                  >
                    <div className="font-medium">
                      {a.icao}
                      {a.iata ? ` / ${a.iata}` : ""}
                    </div>
                    <div className="text-xs text-zinc-400">
                      {a.city || ""} {a.name ? `– ${a.name}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Brief Al */}
          <div className="flex items-end">
            <button
              onClick={onBrief}
              disabled={!canBrief}
              className="w-full md:w-auto rounded-md border border-sky-600/50 bg-sky-500/10 px-4 py-2 text-sm text-sky-200 hover:bg-sky-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              title={!canBrief ? "DEP ve ARR gir" : "Brief Al"}
            >
              {briefLoading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-3 w-3 animate-spin rounded-full border border-sky-400 border-t-transparent" />
                  METAR yükleniyor…
                </span>
              ) : (
                "Brief Al"
              )}
            </button>
          </div>

          {/* Share */}
          <div className="flex items-end">
            <ShareButton />
          </div>
        </div>

        {/* Hata bandı */}
        {briefError && (
          <div className="mt-3 rounded-md border border-rose-800 bg-rose-950/70 text-rose-200 text-sm px-3 py-2">
            {briefError}
          </div>
        )}
      </div>
    </div>
  );
}
