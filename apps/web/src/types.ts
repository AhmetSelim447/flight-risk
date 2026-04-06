export type Airport = {
  icao: string;
  iata?: string;
  city?: string;
  name?: string;
  coords?: { lat: number; lng: number };
  runways?: { id: string; heading: number; length_m?: number }[];
  freqs?: { twr?: string; app?: string; atis?: string; del?: string };
};
