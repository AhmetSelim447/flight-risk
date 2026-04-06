// apps/api/src/lib/notam.provider.ts

import type { NotamItem, NotamProvider } from "./notam.types";
import { simulatedNotamProvider } from "./notam.simulated";

function normalizeProviderName(raw?: string): "simulated" | "live" {
  const v = String(raw || "simulated").trim().toLowerCase();
  if (v === "live") return "live";
  return "simulated";
}

const liveNotamProvider: NotamProvider = {
  name: "live",
  async getNotam(icao: string): Promise<NotamItem[]> {
    // Şimdilik gerçek sağlayıcı bağlı değil.
    // Sistemi bozmamak için kontrollü fallback yapıyoruz.
    return simulatedNotamProvider.getNotam(icao);
  },
};

export function getNotamProvider(): NotamProvider {
  const provider = normalizeProviderName(process.env.NOTAM_PROVIDER);

  if (provider === "live") {
    return liveNotamProvider;
  }

  return simulatedNotamProvider;
}