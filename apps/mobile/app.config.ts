import 'dotenv/config';

export default {
  expo: {
    name: "Flight Risk",
    slug: "flight-risk",
    version: "1.0.0",

    orientation: "portrait",

    scheme: "flightrisk",

    userInterfaceStyle: "automatic",

    icon: "./assets/images/icon.png",

    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.flightrisk.app"
    },

    android: {
      package: "com.flightrisk.app",

      adaptiveIcon: {
        backgroundColor: "#0A0E1A",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png"
      }
    },

    plugins: [
      "expo-router",
      "expo-sharing",
      "expo-secure-store",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          resizeMode: "contain",
          backgroundColor: "#0A0E1A"
        }
      ]
    ],

    experiments: {
      typedRoutes: true
    },

    extra: {
      apiUrl: process.env.EXPO_PUBLIC_API_URL,

      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,

      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
    }
  }
};