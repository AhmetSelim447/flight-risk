import "../src/lib/env";
import assert from "node:assert/strict";
import { getNotamProvider } from "../src/lib/notam.provider";

const stations = ["LTFJ", "LTFM", "LTAC"];

async function main() {
  process.env.NOTAM_PROVIDER = "skylink";

  assert.ok(process.env.SKYLINK_API_KEY, "SKYLINK_API_KEY is required for live NOTAM smoke test");
  assert.equal(process.env.SKYLINK_API_HOST, "skylink-api.p.rapidapi.com");
  assert.equal(process.env.SKYLINK_API_URL, "https://skylink-api.p.rapidapi.com/notams");

  const provider = getNotamProvider();
  const results = [];

  for (const station of stations) {
    const notams = await provider.getNotam(station);
    const liveCount = notams.filter((n) => !n.synthetic).length;
    const syntheticCount = notams.filter((n) => n.synthetic).length;
    const criticalCount = notams.filter((n) => n.critical).length;

    assert.ok(liveCount > 0, `${station} returned no live NOTAMs`);
    assert.equal(syntheticCount, 0, `${station} unexpectedly used synthetic fallback`);

    results.push({
      station,
      total: notams.length,
      live: liveCount,
      synthetic: syntheticCount,
      critical: criticalCount,
      firstId: notams[0]?.id || "-",
    });
  }

  console.table(results);
  console.log("notam.live-smoke: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
