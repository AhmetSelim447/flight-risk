import { create } from 'zustand';
import { supabase } from '../lib/supabase';

type WindUnit = 'kt' | 'kmh';
type DistUnit = 'km' | 'nm';

interface SettingsState {
  crossLimitKt: number;
  windUnit: WindUnit;
  distUnit: DistUnit;
  notificationsEnabled: boolean;
  profileLoading: boolean;
  profileError: string | null;
  setCrossLimit: (limit: number) => void;
  setWindUnit: (unit: WindUnit) => void;
  setDistUnit: (unit: DistUnit) => void;
  setNotifications: (enabled: boolean) => void;
  loadProfileSettings: (userId: string) => Promise<void>;
  saveProfileSettings: (userId: string) => Promise<void>;
}

function clampCrossLimit(limit: number) {
  return Math.min(40, Math.max(5, Math.round(limit)));
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  crossLimitKt: 15,
  windUnit: 'kt',
  distUnit: 'km',
  notificationsEnabled: true,
  profileLoading: false,
  profileError: null,

  setCrossLimit: (limit) =>
    set({
      crossLimitKt: clampCrossLimit(limit),
    }),

  setWindUnit: (unit) => set({ windUnit: unit }),

  setDistUnit: (unit) => set({ distUnit: unit }),

  setNotifications: (enabled) => set({ notificationsEnabled: enabled }),

  loadProfileSettings: async (userId) => {
    if (!userId) return;

    set({ profileLoading: true, profileError: null });

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('cross_limit_kt, notifications_enabled')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        const { error: insertError } = await supabase.from('profiles').insert({
          id: userId,
          display_name: '',
          role: 'pilot',
          cross_limit_kt: get().crossLimitKt,
          notifications_enabled: get().notificationsEnabled,
        });

        if (insertError) {
          throw insertError;
        }

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
      });
    } catch (error) {
      console.error('Profile settings load failed:', error);
      set({ profileError: 'Profil ayarları yüklenemedi.' });
    } finally {
      set({ profileLoading: false });
    }
  },

  saveProfileSettings: async (userId) => {
    if (!userId) return;

    set({ profileLoading: true, profileError: null });

    try {
      const state = get();

      const { error } = await supabase.from('profiles').upsert({
        id: userId,
        display_name: '',
        role: 'pilot',
        cross_limit_kt: clampCrossLimit(state.crossLimitKt),
        notifications_enabled: state.notificationsEnabled,
        updated_at: new Date().toISOString(),
      });

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error('Profile settings save failed:', error);
      set({ profileError: 'Profil ayarları kaydedilemedi.' });
    } finally {
      set({ profileLoading: false });
    }
  },
}));