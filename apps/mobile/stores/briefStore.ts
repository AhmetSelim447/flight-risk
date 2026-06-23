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

export const useBriefStore = create<BriefState>((set) => ({
  depIcao: '',
  arrIcao: '',
  depName: '',
  arrName: '',
  isLoading: false,
  lastBrief: null,

  setDeparture: (icao, name) => set({ depIcao: icao, depName: name }),
  setArrival: (icao, name) => set({ arrIcao: icao, arrName: name }),
  swapAirports: () => set((s) => ({
    depIcao: s.arrIcao, arrIcao: s.depIcao,
    depName: s.arrName, arrName: s.depName,
  })),
  setLoading: (loading) => set({ isLoading: loading }),
  setLastBrief: (brief) => set({ lastBrief: brief }),
  clear: () => set({ depIcao: '', arrIcao: '', depName: '', arrName: '', lastBrief: null }),
}));
