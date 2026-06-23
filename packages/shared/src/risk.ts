export function windComponents(
  rwyHeadingDeg: number,
  windDirDeg: number | undefined,
  windSpdKt: number | undefined
) {
  if (windDirDeg == null || windSpdKt == null) return { head: 0, cross: 0 };

  const toRad = (d: number) => (d * Math.PI) / 180;
  const rel = toRad(windDirDeg - rwyHeadingDeg);

  const head = Math.round(windSpdKt * Math.cos(rel));
  const cross = Math.round(Math.abs(windSpdKt * Math.sin(rel)));

  return { head, cross };
}

type RiskInput = {
  vis?: number;          // metre
  ceiling?: number;      // feet AGL
  wx?: string[];         // CB, TS, RA, SN, FG vs
  head: number;          // kt (+ headwind, - tailwind)
  cross: number;         // kt
  crossLimit?: number;   // kt
  notamCritical: number; // kritik notam sayısı
};

export function riskScore(inp: RiskInput) {
  let score = 0;
  const reasons: string[] = [];

  const wxList = Array.isArray(inp.wx)
    ? inp.wx.map((w) => String(w).toUpperCase())
    : [];
  const wxStr = wxList.join(" ");

  const effectiveCrossLimit =
    typeof inp.crossLimit === "number" &&
    Number.isFinite(inp.crossLimit) &&
    inp.crossLimit > 0
      ? inp.crossLimit
      : 15;

  // Visibility
  if (inp.vis != null) {
    if (inp.vis < 1500) {
      score += 28;
      reasons.push("Düşük görüş");
    } else if (inp.vis < 3000) {
      score += 20;
      reasons.push("Zayıf görüş");
    } else if (inp.vis < 5000) {
      score += 12;
      reasons.push("Sınırlı görüş");
    } else if (inp.vis < 8000) {
      score += 5;
      reasons.push("Orta görüş");
    }
  }

  // Ceiling
  if (inp.ceiling != null) {
    if (inp.ceiling < 600) {
      score += 24;
      reasons.push("Düşük tavan");
    } else if (inp.ceiling < 1000) {
      score += 16;
      reasons.push("Zayıf tavan");
    } else if (inp.ceiling < 1500) {
      score += 8;
      reasons.push("Sınırlı tavan");
    } else if (inp.ceiling < 3000) {
      score += 4;
      reasons.push("Orta tavan");
    }
  }

  // Weather phenomena
  if (/(CB|TS)/.test(wxStr)) {
    score += 18;
    reasons.push("Konvektif hava olayı");
  } else if (/(SHRA|SHSN|SQ|GR|GS|FZ)/.test(wxStr)) {
    score += 10;
    reasons.push("Aktif hava olayı");
  } else if (wxList.length > 0) {
    score += Math.min(6, wxList.length * 2);
    reasons.push("Hava olayı mevcut");
  }

  // Crosswind (limit-relative)
  const crossRatio = effectiveCrossLimit > 0 ? inp.cross / effectiveCrossLimit : 0;

  if (crossRatio > 1.2) {
    score += 28;
    reasons.push(`Crosswind çok yüksek (${inp.cross}kt)`);
  } else if (crossRatio > 1.0) {
    score += 22;
    reasons.push(`Crosswind limit üstünde (${inp.cross}kt > ${effectiveCrossLimit}kt)`);
  } else if (crossRatio >= 0.85) {
    score += 12;
    reasons.push(`Crosswind sınıra yakın (${inp.cross}kt)`);
  } else if (crossRatio >= 0.65) {
    score += 6;
    reasons.push(`Crosswind dikkat gerektiriyor (${inp.cross}kt)`);
  }

  // Tailwind (head < 0)
  if (inp.head < 0) {
    const tailwind = Math.abs(inp.head);

    if (tailwind >= 15) {
      score += 14;
      reasons.push(`Kuvvetli tailwind (${tailwind}kt)`);
    } else if (tailwind >= 10) {
      score += 8;
      reasons.push(`Tailwind mevcut (${tailwind}kt)`);
    } else if (tailwind >= 5) {
      score += 3;
      reasons.push(`Hafif tailwind (${tailwind}kt)`);
    }
  }

  // Critical NOTAM
  if (inp.notamCritical >= 4) {
    score += 24;
    reasons.push(`Yoğun kritik NOTAM (${inp.notamCritical})`);
  } else if (inp.notamCritical >= 2) {
    score += 18;
    reasons.push(`Birden fazla kritik NOTAM (${inp.notamCritical})`);
  } else if (inp.notamCritical === 1) {
    score += 10;
    reasons.push("Kritik NOTAM");
  }

  // Combined penalties
  if (
    inp.vis != null &&
    inp.vis < 3000 &&
    inp.ceiling != null &&
    inp.ceiling < 1000
  ) {
    score += 6;
    reasons.push("Düşük görüş + düşük tavan kombinasyonu");
  }

  if (
    (/(CB|TS|SHRA|SHSN|SQ|GR|GS|FZ)/.test(wxStr) ||
      (inp.vis != null && inp.vis < 5000)) &&
    crossRatio >= 0.85
  ) {
    score += 5;
    reasons.push("Hava + rüzgar kombinasyonu");
  }

  if (inp.vis == null && inp.ceiling == null && wxList.length > 0) {
    score += 4;
  }

  score = Math.max(0, Math.min(100, score));

  const cls = score <= 30 ? "green" : score <= 70 ? "yellow" : "red";

  return {
    score,
    class: cls as "green" | "yellow" | "red",
    reasons,
  };
}
