import { useEffect, useState } from "react";
import { loadSettings, saveSettings, type Settings } from "../lib/settings";
import { fetchBrief, type BriefResponse } from "../lib/api";

export default function SettingsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tmp, setTmp] = useState<Settings>(loadSettings());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setTmp(loadSettings());
  }, [open]);

  async function apply() {
    setSaving(true);
    try {
      saveSettings(tmp);

      // Eğer bir rota/brief varsa crossLimit değişince brief’i tazele
      const raw = localStorage.getItem("lastPair");
      const pair = raw ? JSON.parse(raw) as { depIcao?: string; arrIcao?: string } : {};
      if (pair.depIcao && pair.arrIcao) {
        window.dispatchEvent(new Event("brief-loading"));
        const brief: BriefResponse = await fetchBrief(pair.depIcao, pair.arrIcao);
        localStorage.setItem("lastBrief", JSON.stringify(brief));
        const d = brief.airports.dep.coords, a = brief.airports.arr.coords;
        if (d && a) localStorage.setItem("lastRoute", JSON.stringify({ dep: d, arr: a }));
        window.dispatchEvent(new Event("flight-route-updated"));
        window.dispatchEvent(new Event("brief-loaded"));
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`fixed inset-0 z-[2000] ${open ? "" : "pointer-events-none"}`}>
      {/* backdrop */}
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      {/* drawer */}
      <div className={`absolute right-0 top-0 h-full w-[340px] bg-zinc-950 border-l border-zinc-800 p-4 transition-transform ${open ? "translate-x-0" : "translate-x-full"}`}>
        <div className="text-lg font-semibold">Ayarlar</div>
        <div className="mt-4 space-y-4 text-sm">
          <div>
            <div className="text-xs text-zinc-400 mb-1">Crosswind Limiti (kt)</div>
            <input
              type="number"
              placeholder="örn. 15"
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none"
              value={tmp.crossLimit ?? ""}
              onChange={(e) => setTmp(s => ({ ...s, crossLimit: e.target.value === "" ? undefined : Number(e.target.value) }))}
            />
            <div className="text-[11px] text-zinc-500 mt-1">Boş bırakırsan meydanın varsayılanı kullanılır.</div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-zinc-400 mb-1">Rüzgâr Birimi</div>
              <select
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2"
                value={tmp.windUnit}
                onChange={(e) => setTmp(s => ({ ...s, windUnit: e.target.value as any }))}
              >
                <option value="kt">kt</option>
                <option value="kmh">km/h</option>
                <option value="mph">mph</option>
              </select>
            </div>
            <div>
              <div className="text-xs text-zinc-400 mb-1">Mesafe Birimi</div>
              <select
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2"
                value={tmp.distUnit}
                onChange={(e) => setTmp(s => ({ ...s, distUnit: e.target.value as any }))}
              >
                <option value="km">km</option>
                <option value="nm">NM</option>
              </select>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button className="rounded-md border border-zinc-700 px-3 py-1.5" onClick={onClose}>Kapat</button>
          <button
            className="rounded-md border border-sky-600/50 bg-sky-500/10 px-3 py-1.5 text-sky-200 hover:bg-sky-500/20 disabled:opacity-50"
            onClick={apply}
            disabled={saving}
          >
            {saving ? "Uygulanıyor…" : "Uygula"}
          </button>
        </div>
      </div>
    </div>
  );
}
