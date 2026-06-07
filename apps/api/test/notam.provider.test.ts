import assert from "node:assert/strict";
import { getNotamProvider } from "../src/lib/notam.provider";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

function resetEnv() {
  process.env = { ...originalEnv };
  process.env.NOTAM_PROVIDER = "skylink";
  process.env.SKYLINK_API_KEY = "unit-test-key";
  process.env.SKYLINK_API_HOST = "skylink-api.p.rapidapi.com";
  process.env.SKYLINK_API_URL = "https://skylink-api.p.rapidapi.com/notams";
  process.env.NOTAM_SYNTHETIC_MODE = "deterministic";
}

async function testSkylinkResponseNormalization() {
  resetEnv();
  let requestedUrl = "";
  let requestedHost = "";

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    requestedUrl = String(url);
    requestedHost = String((init?.headers as Record<string, string>)?.["X-RapidAPI-Host"] || "");
    return {
      ok: true,
      json: async () => ({
        icao: "LTAC",
        notams: [
          {
            raw: "!LTAC A222/2026 ANKARA ESENBOGA AD RWY 03R/21L CLSD",
            notam_id: "A222/2026",
            location: "LTAC",
            effective: "202606041200",
            expiration: "202606061800",
            body: "RWY 03R/21L CLSD",
          },
        ],
      }),
    } as Response;
  }) as typeof fetch;

  const notams = await getNotamProvider().getNotam("LTAC");
  assert.equal(requestedUrl, "https://skylink-api.p.rapidapi.com/notams/LTAC");
  assert.equal(requestedHost, "skylink-api.p.rapidapi.com");
  assert.equal(notams.length, 1);
  assert.equal(notams[0].id, "A222/2026");
  assert.equal(notams[0].synthetic, false);
  assert.equal(notams[0].critical, true);
  assert.equal(notams[0].validFrom, "202606041200");
  assert.equal(notams[0].validTo, "202606061800");
}

async function testSkylinkHttpFailureFallsBackToSynthetic() {
  resetEnv();
  globalThis.fetch = (async () => ({ ok: false, status: 429 } as Response)) as typeof fetch;

  const notams = await getNotamProvider().getNotam("LTAC");
  assert.ok(notams.length > 0);
  assert.ok(notams.every((n) => n.synthetic === true));
}

async function testMissingKeyFallsBackToSynthetic() {
  resetEnv();
  delete process.env.SKYLINK_API_KEY;

  const notams = await getNotamProvider().getNotam("LTAC");
  assert.ok(notams.length > 0);
  assert.ok(notams.every((n) => n.synthetic === true));
}

async function main() {
  try {
    await testSkylinkResponseNormalization();
    await testSkylinkHttpFailureFallsBackToSynthetic();
    await testMissingKeyFallsBackToSynthetic();
    console.log("notam.provider.test: ok");
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
