// apps/api/src/lib/eta.ts
// Basit ETA modeli: great-circle mesafe / sabit yer hızı + sabit tampon.
// Amaç dakika hassasiyeti değil, ARR koşullarını doğru TAF saat penceresinde
// değerlendirmek.
import { haversineKm } from "./geo";

const CRUISE_KMH = 463; // ~250 kt yer hızı
const BUFFER_MIN = 20;  // taksi + tırmanış/alçalma tamponu

export type EtaPlan = {
  etdUtc: string;
  etaUtc: string;
  distanceKm: number;
  estFlightMin: number;
};

export function computeEtaPlan(
  depCoords: { lat: number; lng: number },
  arrCoords: { lat: number; lng: number },
  etdIso?: string
): EtaPlan {
  let etd = etdIso ? new Date(etdIso) : new Date();
  if (Number.isNaN(etd.getTime())) etd = new Date();

  const distanceKm = haversineKm(depCoords, arrCoords);
  const estFlightMin = Math.round((distanceKm / CRUISE_KMH) * 60 + BUFFER_MIN);
  const eta = new Date(etd.getTime() + estFlightMin * 60_000);

  return {
    etdUtc: etd.toISOString(),
    etaUtc: eta.toISOString(),
    distanceKm: Math.round(distanceKm * 100) / 100,
    estFlightMin,
  };
}
