import { defineConfig } from "vitest/config";

// notam.provider.test.ts and notam.live-smoke.ts are standalone ts-node smoke
// scripts (run via the test:notam / test:notam:live npm scripts), not vitest
// suites. Exclude them so `vitest run` only collects real vitest specs.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      "test/notam.provider.test.ts",
      "test/notam.live-smoke.ts",
    ],
  },
});
