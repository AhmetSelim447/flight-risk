// apps/api/src/lib/notam.types.ts

export type NotamItem = {
  id: string;
  text: string;
  critical?: boolean; // true ise risk'e etki
};

export type NotamProviderName = "simulated" | "live";

export type NotamContext = {
  icao: string;
  now: Date;
};

export type NotamTemplate = {
  key: string;
  text: string;
  critical?: boolean;
};

export interface NotamProvider {
  name: NotamProviderName;
  getNotam(icao: string): Promise<NotamItem[]>;
}