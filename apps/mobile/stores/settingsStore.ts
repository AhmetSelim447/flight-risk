import { create } from 'zustand';

interface SettingsState {
  crossLimitKt: number;
  windUnit: 'kt' | 'kmh';
  distUnit: 'km' | 'nm';
  notificationsEnabled: boolean;
  setCrossLimit: (limit: number) => void;
  setWindUnit: (unit: 'kt' | 'kmh') => void;
  setDistUnit: (unit: 'km' | 'nm') => void;
  setNotifications: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  crossLimitKt: 15,
  windUnit: 'kt',
  distUnit: 'km',
  notificationsEnabled: true,
  setCrossLimit: (limit) => set({ crossLimitKt: limit }),
  setWindUnit: (unit) => set({ windUnit: unit }),
  setDistUnit: (unit) => set({ distUnit: unit }),
  setNotifications: (enabled) => set({ notificationsEnabled: enabled }),
}));
