// apps/web/src/components/SettingsModal.tsx
import { useEffect, useState } from "react";
import { loadSettings, saveSettings, type Settings, type DistUnit, type WindUnit } from "../lib/settings";

export default function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [draft, setDraft] = useState<Settings>(loadSettings());

  useEffect(() => {
    if (!open) return;
    setDraft(loadSettings());
  }, [open]);

  // ESC ile kapat
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const setDist = (u: DistUnit) => setDraft((d) => ({ ...d, distUnit: u }));
  const setWind = (u: WindUnit) => setDraft((d) => ({ ...d, windUnit: u }));

  function onSave() {
    saveSettings(draft);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[2000]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div className="absolute left-1/2 top-1/2 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-zinc-800 bg-zinc-900 p-4 shadow-2xl">
        <div className="text-lg font-semibold">Ayarlar</div>
        <div className="mt-4 space-y-4 text-sm">
          <div>
            <div className="mb-2 text-zinc-400">Mesafe birimi</div>
            <div className="flex flex-wrap gap-2">
              {(["km", "mi", "nm"] as DistUnit[]).map((u) => (
                <button
                  key={u}
                  onClick={() => setDist(u)}
                  className={`rounded-md border px-3 py-1.5 ${
                    draft.distUnit === u
                      ? "border-sky-600/60 bg-sky-500/10 text-sky-200"
                      : "border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
                  }`}
                >
                  {u.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-zinc-400">Ruzgar birimi</div>
            <div className="flex flex-wrap gap-2">
              {(["kt", "kmh", "mph", "mps"] as WindUnit[]).map((u) => (
                <button
                  key={u}
                  onClick={() => setWind(u)}
                  className={`rounded-md border px-3 py-1.5 ${
                    draft.windUnit === u
                      ? "border-sky-600/60 bg-sky-500/10 text-sky-200"
                      : "border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
                  }`}
                >
                  {u.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm hover:bg-zinc-800"
          >
            Vazgec
          </button>
          <button
            onClick={onSave}
            className="rounded-md border border-sky-600/60 bg-sky-500/10 px-3 py-1.5 text-sm text-sky-200 hover:bg-sky-500/20"
          >
            Kaydet
          </button>
        </div>
      </div>
    </div>
  );
}
