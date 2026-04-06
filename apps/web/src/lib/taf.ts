// apps/web/src/lib/taf.ts
// Çok kaba ama iş gören bir parser: FM/BECMG/TEMPO/PROB bloklarını zaman aralıklarına böler.
export type TafSegment = {
  kind: "FM" | "BECMG" | "TEMPO" | "PROB" | "BASE";
  fromZ: string; // "12/18Z" benzeri okunur değer
  toZ?: string;  // "12/22Z" gibi; FM bloklarında çoğu zaman yok (sonra gelen bloğa kadar geçerli)
  text: string;  // ham alt-metni
  wind?: { dir?: number; spd?: number; gust?: number };
  vis?: string; // ör: "6000", "9999", "5SM"
  clouds?: string[]; // ör: ["SCT020","BKN040"]
  wx?: string[];     // ör: ["-RA","BR"]
};

// "TAF LTFM 151130Z 1512/1618 ..." başlığından 1512/1618'i çek
function extractValidity(raw: string) {
  const m = raw.match(/\b(\d{4}\/\d{4})\b/); // 1512/1618
  if (!m) return { from: "—", to: "—" };
  const [fromDay, fromHour, toDay, toHour] = [m[1].slice(0,2), m[1].slice(2,4), m[1].slice(5,7), m[1].slice(7,9)];
  return { from: `${fromDay}/${fromHour}Z`, to: `${toDay}/${toHour}Z` };
}

function pickWx(tokens: string[]) {
  const wx: string[] = [];
  const clouds: string[] = [];
  let vis: string | undefined;
  for (const t of tokens) {
    if (/^(FEW|SCT|BKN|OVC)\d{3}/.test(t)) clouds.push(t);
    else if (/^\d{4}$/.test(t) || /SM$/.test(t)) vis = vis ?? t; // 9999, 6000 ya da 5SM
    else if (/^(VC|MI|BC|PR|DR|BL|SH|TS|FZ)?(-|\+)?(DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PO|SQ|FC|SS|DS)$/.test(t)) wx.push(t);
  }
  return { wx, clouds, vis };
}

function pickWind(tokens: string[]) {
  // 27015G25KT / 00000KT / VRB03KT
  const i = tokens.findIndex(t => /^(VRB|\d{3})\d{2}(G\d{2})?KT$/.test(t));
  if (i === -1) return {};
  const t = tokens[i];
  const m = t.match(/^(VRB|\d{3})(\d{2})(?:G(\d{2}))?KT$/);
  if (!m) return {};
  const dir = m[1] === "VRB" ? undefined : Number(m[1]);
  const spd = Number(m[2]);
  const gust = m[3] ? Number(m[3]) : undefined;
  return { wind: { dir, spd, gust } };
}

export function parseTaf(raw?: string) {
  if (!raw) return { validity: { from: "—", to: "—" }, segments: [] as TafSegment[] };

  // Baş ve son temizlik
  const norm = raw.replace(/\s+/g, " ").trim();

  const validity = extractValidity(norm);

  // İlk BASE parçasını, sonra FM/BECMG/TEMPO/PROB ile gelen parçaları bul
  // Split’lerimizi korumak için ayraçları etiketleyelim
  const parts = norm
    // başı kırp (istasyon/saati at)
    .replace(/^TAF\s+[A-Z]{4}\s+\d{6}Z\s+\d{4}\/\d{4}\s*/i, "")
    // TEMPO ve PROB kombinasyonlarını ayraçla
    .replace(/\s+(TEMPO|BECMG|FM\d{6}|PROB\d{2})\s+/g, " |$1| ")
    .split("|")
    .map(s => s.trim())
    .filter(Boolean);

  const segments: TafSegment[] = [];
  let baseCollected = "";
  let i = 0;

  while (i < parts.length) {
    const p = parts[i];

    if (/^FM\d{6}$/.test(p)) {
      // FM151300 -> from 15/13Z
      const day = p.slice(2,4), hr = p.slice(4,6);
      const fromZ = `${day}/${hr}Z`;
      const body = (parts[i+1] && !/^(FM\d{6}|BECMG|TEMPO|PROB\d{2})$/.test(parts[i+1])) ? parts[i+1] : "";
      const tokens = body.split(" ").filter(Boolean);
      const { wx, clouds, vis } = pickWx(tokens);
      const { wind } = pickWind(tokens);
      segments.push({ kind: "FM", fromZ, text: body, wind, wx, clouds, vis });
      i += body ? 2 : 1;
      continue;
    }

    if (p === "BECMG" || p === "TEMPO" || /^PROB\d{2}$/.test(p)) {
      const kind: TafSegment["kind"] =
        p === "BECMG" ? "BECMG" : p === "TEMPO" ? "TEMPO" : "PROB";
      const body = (parts[i+1] && !/^(FM\d{6}|BECMG|TEMPO|PROB\d{2})$/.test(parts[i+1])) ? parts[i+1] : "";
      // "1516/1520 ..." şeklinde aralık içerebilir
      let fromZ = validity.from, toZ = validity.to;
      const mm = body.match(/\b(\d{4})\/(\d{4})\b/);
      if (mm) {
        const [d1, h1] = [mm[1].slice(0,2), mm[1].slice(2,4)];
        const [d2, h2] = [mm[2].slice(0,2), mm[2].slice(2,4)];
        fromZ = `${d1}/${h1}Z`; toZ = `${d2}/${h2}Z`;
      }
      const tokens = body.split(" ").filter(Boolean);
      const { wx, clouds, vis } = pickWx(tokens);
      const { wind } = pickWind(tokens);
      segments.push({ kind, fromZ, toZ, text: body, wind, wx, clouds, vis });
      i += body ? 2 : 1;
      continue;
    }

    // BASE gövde (ilk kısım)
    if (!/^FM\d{6}|BECMG|TEMPO|PROB\d{2}$/.test(p)) {
      baseCollected += (baseCollected ? " " : "") + p;
      i += 1;
      continue;
    }

    i += 1;
  }

  if (baseCollected) {
    const tokens = baseCollected.split(" ").filter(Boolean);
    const { wx, clouds, vis } = pickWx(tokens);
    const { wind } = pickWind(tokens);
    segments.unshift({ kind: "BASE", fromZ: validity.from, toZ: validity.to, text: baseCollected, wind, wx, clouds, vis });
  }

  return { validity, segments };
}
