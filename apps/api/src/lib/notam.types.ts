// apps/api/src/lib/notam.types.ts

export type NotamItem = {
  id: string;
  text: string;
  critical?: boolean; // true ise risk'e etki
  synthetic?: boolean;
  severity?: "Critical" | "Medium" | "Info";
  impacts?: (
    | "runway"
    | "nav"
    | "ops_hours"
    | "airspace"
    | "lighting"
    | "surface"
    | "weather"
  )[];
  validFrom?: string;
  validTo?: string;
  event?: NotamEvent;
};

export type NotamProviderName = "simulated" | "live" | "skylink" | "laminar";

export type NotamContext = {
  icao: string;
  now: Date;
};

export type NotamTemplate = {
  key: string;
  text: string;
  critical?: boolean;
};

export type NotamEventCategory =
  | "runway_closure"
  | "runway_inspection"
  | "runway_surface"
  | "nav_outage"
  | "lighting_maintenance"
  | "ops_hours"
  | "apron_works"
  | "taxiway_works"
  | "airspace_activity"
  | "weather_advisory";

export type NotamImpact =
  | "runway"
  | "nav"
  | "ops_hours"
  | "airspace"
  | "lighting"
  | "surface"
  | "weather";

export type NotamEvent = {
  key: string;
  category: NotamEventCategory;
  severity: "Critical" | "Medium" | "Info";
  critical: boolean;
  impacts: NotamImpact[];
  validFrom: string;
  validTo: string;
  affectedRunway?: string;
  score: number;
  reason: string;
  syntheticMode: "deterministic" | "llm_text" | "hybrid";
 };

export interface NotamProvider {
  name: NotamProviderName;
  getNotam(icao: string): Promise<NotamItem[]>;
}
