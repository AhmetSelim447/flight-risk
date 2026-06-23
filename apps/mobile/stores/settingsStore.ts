import { create } from 'zustand';
import { supabase } from '../lib/supabase';

type WindUnit = 'kt' | 'kmh';
type DistUnit = 'km' | 'nm';

interface SettingsState {
  crossLimitKt: number;
  windUnit: WindUnit;
  distUnit: DistUnit;
  notificationsEnabled: boolean;
  defaultDep: string;
  defaultArr: string;
  profileLoading: boolean;
  profileError: string | null;
  setCrossLimit: (limit: number) => void;
  setWindUnit: (unit: WindUnit) => void;
  setDistUnit: (unit: DistUnit) => void;
  setNotifications: (enabled: boolean) => void;
  setDefaultRoute: (dep: string, arr: string) => void;
  loadProfileSettings: (userId: string) => Promise<void>;
  saveProfileSettings: (userId: string, dep?: string, arr?: string) => Promise<void>;
}

function clampCrossLimit(limit: number) {
  return Math.min(40, Math.max(5, Math.round(limit)));
}

function normalizeIcao(value?: string) {
  if (!value) return '';
  const match = value.trim().toUpperCase().match(/[A-Z]{4}/);
  return match ? match[0] : '';
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  crossLimitKt: 15,
  windUnit: 'kt',
  distUnit: 'km',
  notificationsEnabled: true,
  defaultDep: '',
  defaultArr: '',
  profileLoading: false,
  profileError: null,

  setCrossLimit: (limit) => set({ crossLimitKt: clampCrossLimit(limit) }),
  setWindUnit: (unit) => set({ windUnit: unit }),
  setDistUnit: (unit) => set({ distUnit: unit }),
  setNotifications: (enabled) => set({ notificationsEnabled: enabled }),

  setDefaultRoute: (dep, arr) =>
    set({
      defaultDep: normalizeIcao(dep),
      defaultArr: normalizeIcao(arr),
    }),

  loadProfileSettings: async (userId) => {
    if (!userId) return;

    set({ profileLoading: true, profileError: null });

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('cross_limit_kt, notifications_enabled, default_dep, default_arr')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        const { error: insertError } = await supabase.from('profiles').insert({
          id: userId,
          display_name: '',
          role: 'pilot',
          cross_limit_kt: get().crossLimitKt,
          notifications_enabled: get().notificationsEnabled,
          default_dep: get().defaultDep || null,
          default_arr: get().defaultArr || null,
        });

        if (insertError) throw insertError;
        return;
      }

      set({
        crossLimitKt:
          typeof data.cross_limit_kt === 'number'
            ? clampCrossLimit(data.cross_limit_kt)
            : get().crossLimitKt,
        notificationsEnabled:
          typeof data.notifications_enabled === 'boolean'
            ? data.notifications_enabled
            : get().notificationsEnabled,
        defaultDep: normalizeIcao(data.default_dep),
        defaultArr: normalizeIcao(data.default_arr),
      });
    } catch (error) {
      console.error('Profile settings load failed:', error);
      set({ profileError: 'Profil ayarları yüklenemedi.' });
    } finally {
      set({ profileLoading: false });
    }
  },

  saveProfileSettings: async (userId, dep, arr) => {
    if (!userId) return;

    set({ profileLoading: true, profileError: null });

    try {
      const state = get();

      const nextDefaultDep = normalizeIcao(dep) || state.defaultDep;
      const nextDefaultArr = normalizeIcao(arr) || state.defaultArr;

      const { error } = await supabase.from('profiles').upsert({
        id: userId,
        display_name: '',
        role: 'pilot',
        cross_limit_kt: clampCrossLimit(state.crossLimitKt),
        notifications_enabled: state.notificationsEnabled,
        default_dep: nextDefaultDep || null,
        default_arr: nextDefaultArr || null,
        updated_at: new Date().toISOString(),
      });

      if (error) throw error;

      set({
        defaultDep: nextDefaultDep,
        defaultArr: nextDefaultArr,
      });
    } catch (error) {
      console.error('Profile settings save failed:', error);
      set({ profileError: 'Profil ayarları kaydedilemedi.' });
    } finally {
      set({ profileLoading: false });
    }
  },
}));