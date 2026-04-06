import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // senin yeni düzenin
      "/api": {
        target: "http://127.0.0.1:4000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },

      // 🔥 eski kodlar /airports/... çağırıyorsa yine çalışsın
      "/airports": {
        target: "http://127.0.0.1:4000",
        changeOrigin: true,
      },

      // 🔥 /brief ve /brief/pdf de aynı şekilde
      "/brief": {
        target: "http://127.0.0.1:4000",
        changeOrigin: true,
      },
    },
  },
});
