import AsyncStorage from '@react-native-async-storage/async-storage';
import { BriefResponse } from '@flight-risk/shared';

function briefKey(dep: string, arr: string) {
  return `brief:${dep.trim().toUpperCase()}:${arr.trim().toUpperCase()}`;
}

export async function saveOfflineBrief(
  dep: string,
  arr: string,
  brief: BriefResponse
) {
  const key = briefKey(dep, arr);

  await AsyncStorage.setItem(
    key,
    JSON.stringify({
      dep: dep.trim().toUpperCase(),
      arr: arr.trim().toUpperCase(),
      brief,
      savedAt: new Date().toISOString(),
    })
  );
}

export async function getOfflineBrief(dep: string, arr: string): Promise<{
  dep: string;
  arr: string;
  brief: BriefResponse;
  savedAt: string;
} | null> {
  const raw = await AsyncStorage.getItem(briefKey(dep, arr));
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function deleteOfflineBrief(dep: string, arr: string) {
  await AsyncStorage.removeItem(briefKey(dep, arr));
}

export async function listOfflineBriefs() {
  const keys = await AsyncStorage.getAllKeys();
  const briefKeys = keys.filter((key) => key.startsWith('brief:'));

  const items = await AsyncStorage.multiGet(briefKeys);

  return items
    .map(([, value]) => {
      if (!value) return null;

      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}