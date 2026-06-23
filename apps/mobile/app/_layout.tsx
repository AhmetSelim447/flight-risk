import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { DarkTheme, ThemeProvider } from 'expo-router/react-navigation';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useAuthStore } from '../stores/authStore';
import { COLORS } from '../constants/theme';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const FlightRiskTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: COLORS.background,
    primary: COLORS.primary,
    card: COLORS.surface,
    border: COLORS.border,
    text: COLORS.textPrimary,
  },
};

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  const { initialized, session, initialize } = useAuthStore();
  const router = useRouter();
  const segments = useSegments();

  // Initialize Auth Store
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Handle errors
  useEffect(() => {
    if (fontError) throw fontError;
  }, [fontError]);

  // Handle routing / auth guard
  useEffect(() => {
    if (!initialized || !fontsLoaded) return;

    const inAuthGroup = segments[0] === '(auth)';
    const isLoggedIn = !!session;

    if (!isLoggedIn && !inAuthGroup) {
      // Redirect to login if not logged in and not in auth screens
      router.replace('/(auth)/login');
    } else if (isLoggedIn && inAuthGroup) {
      // Redirect to main tabs if logged in and trying to access auth screens
      router.replace('/(tabs)');
    }
  }, [initialized, fontsLoaded, session, segments, router]);

  useEffect(() => {
    // Hide splash screen once auth and fonts are initialized
    if (initialized && fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [initialized, fontsLoaded]);

  if (!initialized || !fontsLoaded) {
    return null;
  }

  return (
    <ThemeProvider value={FlightRiskTheme}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack>
    </ThemeProvider>
  );
}
