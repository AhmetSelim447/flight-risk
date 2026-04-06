// apps/api/src/lib/notam.ts

import { getNotamProvider } from "./notam.provider";
export type { NotamItem } from "./notam.types";

export async function getNotam(icao: string) {
  const provider = getNotamProvider();
  return provider.getNotam(icao);
}