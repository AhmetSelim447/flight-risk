// apps/web/src/lib/settings.ts
export type DistUnit = "km" | "mi" | "nm";
export type WindUnit = "kt" | "kmh" | "mph" | "mps";

export interface Settings {
  /** Crosswind limit (kt cinsinden). Boş bırakılabilir; risk hesapları kendi default’unu kullanır. */
  crossLimit?: number;
  /** Uzaklık birimi (UI gösterimi) */
  distUnit: DistUnit;
  /** Rüzgâr birimi (UI gösterimi) */
  windUnit: WindUnit;
}

const KEY = "settings"; // mevcut kaydınla uyumlu
const DEFAULTS: Settings = {
  crossLimit: undefined,
  distUnit: "km",
  windUnit: "kt",
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const s = JSON.parse(raw) as Partial<Settings>;

    // Güvenli birleşim ve enum koruması
    const dist = (s.distUnit as DistUnit) ?? DEFAULTS.distUnit;
    const wind = (s.windUnit as WindUnit) ?? DEFAULTS.windUnit;

    return {
      crossLimit: typeof s.crossLimit === "number" ? s.crossLimit : DEFAULTS.crossLimit,
      distUnit: dist,
      windUnit: wind,
    };
  } catch {
    return DEFAULTS;
  }
}

export function saveSettings(s: Settings) {
  localStorage.setItem(KEY, JSON.stringify(s));
  // Tüm komponentlere duyur
  window.dispatchEvent(new Event("settings-updated"));
}

/** km değerini istenen birime çevirir ve metin olarak döndürür. */
export function convDist(valKm?: number, unit: DistUnit = "km"): { val: string; unit: DistUnit } {
  if (valKm == null || !Number.isFinite(valKm)) return { val: "—", unit };
  let v = valKm;
  if (unit === "mi") v = valKm * 0.621371;     // km -> mile
  if (unit === "nm") v = valKm * 0.539957;     // km -> nautical mile
  const str = v < 1000 ? Math.round(v).toString() : v.toFixed(1);
  return { val: str, unit };
}

/** kt değerini istenen birime çevirir ve metin olarak döndürür. */
export function convWind(valKt?: number, unit: WindUnit = "kt"): { val: string; unit: WindUnit } {
  if (valKt == null || !Number.isFinite(valKt)) return { val: "—", unit };
  let v = valKt;
  if (unit === "kmh") v = valKt * 1.852;       // kt -> km/h
  if (unit === "mph") v = valKt * 1.15078;     // kt -> mph
  if (unit === "mps") v = valKt * 0.514444;    // kt -> m/s
  const str = v < 100 ? Math.round(v).toString() : v.toFixed(0);
  return { val: str, unit };
}
