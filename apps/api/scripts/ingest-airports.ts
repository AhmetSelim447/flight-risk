// apps/api/scripts/ingest-airports.ts
import { createReadStream, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve } from "path";
import { parse } from "csv-parse";

type RawAirport = {
  ident: string;            // ICAO/IATA karışık, ama TR için genelde ICAO = ident
  iata_code: string;
  name: string;
  municipality: string;     // city
  latitude_deg: string;
  longitude_deg: string;
  iso_country: string;      // "TR"
  type: string;             // "large_airport" vs.
};

type RawRunway = {
  airport_ident: string;    // airport ident (ICAO ile eşleştireceğiz)
  le_ident: string;         // "17", "05L" vb.
  he_ident: string;         // "35", "23R" vb.
  le_heading_degT: string;  // "173.0"
  he_heading_degT: string;  // "353.0"
  length_m: string;         // metre (bazı satırlarda boş olabilir)
  length_ft: string;        // feet (backup)
};

type RunwayOut = { id: string; heading: number; length_m?: number };
type AirportOut = {
  icao: string;
  iata?: string;
  city?: string;
  name?: string;
  coords?: { lat: number; lng: number };
  runways?: RunwayOut[];
  crossLimit?: number; // opsiyonel alanımız
};

const ROOT = resolve(__dirname, "..", "data", "raw");
const AIRPORTS_CSV = resolve(ROOT, "airports.csv");
const RUNWAYS_CSV  = resolve(ROOT, "runways.csv");

// ----- Ayarlar -----
// Sadece Türkiye:
const COUNTRY_FILTER = "TR";
// Hepsini almak istersen: const COUNTRY_FILTER = undefined;

// ICAO doğrulama (4 harf, büyük)
const ICAO_RE = /^[A-Z]{4}$/;

// pist id’si türetme (örn. "17/35" veya LE/HE ayrımı)
function makeRwId(le?: string, he?: string) {
  if (le && he) return `${le}/${he}`;
  return le || he || "RWY?";
}

// sayı güvenli parse
function toNum(s?: string): number | undefined {
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

// heading türetme (varsa CSV’deki degT, yoksa pist numarasından ~*10)
function deriveHeading(ident?: string, degT?: number): number | undefined {
  if (typeof degT === "number" && Number.isFinite(degT)) {
    // 0-360 normalize
    let h = degT % 360;
    if (h < 0) h += 360;
    return Math.round(h);
  }
  if (!ident) return undefined;
  // "17", "05L", "35C" -> baştaki sayı
  const m = ident.match(/^(\d{2})/);
  if (!m) return undefined;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return undefined;
  const h = (n * 10) % 360;
  return h === 0 ? 360 : h; // RWY 36 -> 360°
}

async function readCsv<T>(file: string): Promise<T[]> {
  return new Promise((resolveP, reject) => {
    const rows: T[] = [];
    createReadStream(file)
      .pipe(parse({ columns: true, trim: true }))
      .on("data", (r: T) => rows.push(r))
      .on("end", () => resolveP(rows))
      .on("error", reject);
  });
}

async function main() {
  if (!existsSync(AIRPORTS_CSV) || !existsSync(RUNWAYS_CSV)) {
    console.error("CSV’ler bulunamadı:", AIRPORTS_CSV, RUNWAYS_CSV);
    process.exit(1);
  }

  const rawAirports = await readCsv<RawAirport>(AIRPORTS_CSV);
  const rawRunways  = await readCsv<RawRunway>(RUNWAYS_CSV);

  // Havalimanlarını sözlüğe koy (ICAO key)
  const apByIcao = new Map<string, AirportOut>();

  for (const a of rawAirports) {
    if (COUNTRY_FILTER && a.iso_country !== COUNTRY_FILTER) continue;

    const icao = (a.ident || "").toUpperCase();
    if (!ICAO_RE.test(icao)) continue;

    const lat = toNum(a.latitude_deg);
    const lng = toNum(a.longitude_deg);
    if (lat == null || lng == null) continue;

    apByIcao.set(icao, {
      icao,
      iata: a.iata_code || undefined,
      city: a.municipality || undefined,
      name: a.name || undefined,
      coords: { lat, lng },
      runways: [],
    });
  }

  // Pistleri işle
  for (const r of rawRunways) {
    const icao = (r.airport_ident || "").toUpperCase();
    if (!apByIcao.has(icao)) continue;

    const leH = toNum(r.le_heading_degT);
    const heH = toNum(r.he_heading_degT);
    const leId = r.le_ident || undefined;
    const heId = r.he_ident || undefined;

    const h1 = deriveHeading(leId, leH);
    const h2 = deriveHeading(heId, heH);

    // Uzunluk metre: yoksa feet’ten çevir
    let lenM = toNum(r.length_m);
    if (lenM == null && r.length_ft) {
      const ft = toNum(r.length_ft);
      if (ft != null) lenM = Math.round(ft * 0.3048);
    }

    const ap = apByIcao.get(icao)!;
    const list = ap.runways || [];

    // “17/35” gibi tek kayıt: heading’i kalkış yönüne göre tek sayı olarak saklıyoruz.
    // Burada basitçe LE’yi baz alalım, yoksa HE.
    const id = makeRwId(leId, heId);
    const heading = h1 ?? ((h2 != null) ? ((h2 + 180) % 360 || 360) : undefined);

    list.push({
      id,
      heading: heading ?? 0,
      length_m: lenM,
    });
    ap.runways = list;
  }

  // Çıktıyı yaz
  const outDir = resolve(__dirname, "..", "src", "data");
  mkdirSync(outDir, { recursive: true });

  const outFile = resolve(outDir, "airports.generated.json");
  const arr = Array.from(apByIcao.values()).sort((a, b) => a.icao.localeCompare(b.icao));
  writeFileSync(outFile, JSON.stringify(arr, null, 2));
  console.log(`✓ Generated ${arr.length} airports -> ${outFile}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
