// apps/api/src/lib/notam.ts

import { getNotamCached } from "./notam.provider";
export type { NotamItem } from "./notam.types";

export async function getNotam(icao: string) {
  return getNotamCached(icao);
}