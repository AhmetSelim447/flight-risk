import { create } from 'zustand';

interface BriefState {
  depIcao: string;
  arrIcao: string;
  depName: string;
  arrName: string;
  isLoading: boolean;
  lastBrief: any | null;
  setDeparture: (icao: string, name: string) => void;
  setArrival: (icao: string, name: string) => void;
  swapAirports: () => void;
  setLoading: (loading: boolean) => void;
  setLastBrief: (brief: any) => void;
  clear: () => void;
}

function normalizeIcao(value: string) {
  const normalized = value.trim().toUpperCase();
  const match = normalized.match(/[A-Z]{4}/);
  return match ? match[0] : normalized;
}

export const useBriefStore = create<BriefState>((set) => ({
  depIcao: '',
  arrIcao: '',
  depName: '',
  arrName: '',
  isLoading: false,
  lastBrief: null,

  setDeparture: (icao, name) =>
    set({
      depIcao: normalizeIcao(icao),
      depName: name,
    }),

  setArrival: (icao, name) =>
    set({
      arrIcao: normalizeIcao(icao),
      arrName: name,
    }),

  swapAirports: () =>
    set((s) => ({
      depIcao: normalizeIcao(s.arrIcao),
      arrIcao: normalizeIcao(s.depIcao),
      depName: s.arrName,
      arrName: s.depName,
    })),

  setLoading: (loading) => set({ isLoading: loading }),

  setLastBrief: (brief) => set({ lastBrief: brief }),

  clear: () =>
    set({
      depIcao: '',
      arrIcao: '',
      depName: '',
      arrName: '',
      lastBrief: null,
    }),
}));