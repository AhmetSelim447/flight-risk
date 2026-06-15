// apps/web/src/components/BriefPanel.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { BriefResponse } from "../lib/api";
import { API_BASE, fetchBrief, submitBriefFeedback } from "../lib/api";
import { loadSettings, convWind } from "../lib/settings";
import { parseTaf } from "../lib/taf";

type UiNotamItem = {
  id?: string;
  text?: string;
  raw?: string;
  critical?: boolean;
  synthetic?: boolean;
  severity?: "Critical" | "Medium" | "Info" | string;
  impacts?: string[];
  validFrom?: string;
  validTo?: string;
  event?: {
    key?: string;
    category?: string;
    severity?: "Critical" | "Medium" | "Info" | string;
    critical?: boolean;
    impacts?: string[];
    validFrom?: string;
    validTo?: string;
    affectedRunway?: string;
    score?: number;
    reason?: string;
    syntheticMode?: "deterministic" | "llm_text" | "hybrid" | string;
  };
};

type AlternateDetail = {
  icao: string;
  name?: string;
  dist_km?: number;
  best_rwy_m?: number;
  rank_score?: number;
  badges?: string[];
  critical_notams?: number;
  crosswind_abs?: number;
  weather_label?: string;
  ceiling_label?: string;
  visibility_label?: string;
  reason_summary?: string;
};

function splitNotams(items?: UiNotamItem[]) {
  const list = Array.isArray(items) ? items : [];
  return {
    critical: list.filter((n) => Boolean(n.critical || n.event?.critical)),
    normal: list.filter((n) => !Boolean(n.critical || n.event?.critical)),
  };
}

function notamText(n: UiNotamItem) {
  return String(n.text || n.raw || "").trim();
}

/** Ham ICAO NOTAM metnini Türkçe açıklamaya çevir */
function parseNotamToTurkish(raw: string): string {
  const t = raw.toUpperCase().trim();
  const parts: string[] = [];

  // Pist bilgisi
  const rwyMatch = t.match(/RWY\s*(\d{2}[LRC]?(?:\/\d{2}[LRC]?)?)/);
  const rwy = rwyMatch ? `Pist ${rwyMatch[1]}` : "";

  // ILS arızası
  if (/ILS\s.*U\/S|ILS\s.*OUT OF SERVICE|ILS\s.*UNSERVICEABLE/.test(t)) {
    const ilsType = t.match(/ILS\s+(GP|LOC|DME|IAEG|CAT\s*\w+)?/)?.[1] || "";
    const ilsLabel = ilsType.includes("GP") ? "Glide Path" :
                     ilsType.includes("LOC") ? "Localizer" :
                     ilsType.includes("DME") ? "DME" :
                     ilsType.includes("IAEG") ? "IAEG" : "ILS";
    const dueMatch = t.match(/DUE\s+TO\s+(\w+)/);
    const reason = dueMatch ? ` (${dueMatch[1] === "FLTCK" ? "uçuş kontrol nedeniyle" : dueMatch[1].toLowerCase()})` : "";
    parts.push(`${ilsLabel} ${rwy ? rwy + " " : ""}hizmet dışı${reason}`);
  }
  // GNSS girişimi
  else if (/GNSS\s*(INTERFERENCE|JAMMING|UNRELIABLE)/.test(t)) {
    parts.push("GNSS girişimi/güvenilmezlik uyarısı — RNAV/RNP prosedürleri etkilenebilir");
  }
  // PAPI arızası
  else if (/PAPI\s.*U\/S|PAPI\s.*OUT OF SERVICE/.test(t)) {
    parts.push(`PAPI ${rwy ? rwy + " " : ""}hizmet dışı — görsel yaklaşma rehberliği azalmış`);
  }
  // VOR/DME arızası
  else if (/(?:VOR|DME)\s.*U\/S|(?:VOR|DME)\s.*OUT OF SERVICE/.test(t)) {
    const navType = /VOR/.test(t) && /DME/.test(t) ? "VOR/DME" : /VOR/.test(t) ? "VOR" : "DME";
    const freqMatch = t.match(/(\d{3}\.\d+)\s*MHZ/);
    const freq = freqMatch ? ` (${freqMatch[1]} MHz)` : "";
    parts.push(`${navType}${freq} ${rwy ? rwy + " " : ""}hizmet dışı — konvansiyonel seyrüsefer etkilenebilir`);
  }
  // Pist kapalı
  else if (/(?:RWY|RUNWAY)\s*\S*\s*(?:CLSD|CLOSED)/.test(t)) {
    parts.push(`${rwy || "Pist"} kapalı`);
  }
  // Pist yüzeyi
  else if (/(?:CONTAMINATED|WET|ICE|SNOW|STANDING WATER|SLIPPERY)/.test(t)) {
    parts.push(`${rwy || "Pist"} yüzey durumu etkilenmiş — frenleme performansı kontrol edilmeli`);
  }
  // Işıklandırma
  else if (/(?:LIGHT|LGT|ALS|REIL|VASI)\s.*(?:U\/S|OUT OF SERVICE|UNSERVICEABLE|MAINT)/.test(t)) {
    parts.push(`Işıklandırma bakımda/arızalı ${rwy ? "(" + rwy + ")" : ""} — gece/düşük görüş koşulları etkilenebilir`);
  }
  // Havalimanı çalışma saatleri
  else if (/AD\s*OPR\s*HR|OPERATING\s*HOURS/.test(t)) {
    parts.push("Havalimanı çalışma saatleri kısıtlı — uçuş zamanı doğrulanmalı");
  }
  // Yakıt bilgisi
  else if (/FUEL\s*(NOT\s*AVBL|UNAVAILABLE)/.test(t)) {
    parts.push("Yakıt hizmeti mevcut değil");
  }
  // Engel uyarısı
  else if (/OBST\s*(?:TOWER|LGT|CRANE|MAST)/.test(t)) {
    const hgtMatch = t.match(/(\d+(?:\.\d+)?)\s*FT\s*(?:AGL|AMSL)/);
    const hgt = hgtMatch ? ` — ${hgtMatch[1]} ft` : "";
    parts.push(`Engel uyarısı${hgt} — alçak irtifa operasyonları etkilenebilir`);
  }
  // Hava sahası kısıtı
  else if (/AIRSPACE|RESTRICTED|PROHIBITED|TRA|DANGER AREA/.test(t)) {
    parts.push("Hava sahası kısıtı/faaliyet — rota ve irtifa etkilenebilir");
  }
  // Geçerlilik tarihleri
  const validMatch = t.match(/(\d{10,12})\s+(\d{10,12})/);
  if (validMatch && parts.length > 0) {
    const from = validMatch[1];
    const to = validMatch[2];
    const fmtDate = (s: string) => {
      if (s.length >= 10) {
        const y = s.slice(0, 4);
        const m = s.slice(4, 6);
        const d = s.slice(6, 8);
        const h = s.slice(8, 10);
        return `${d}/${m}/${y} ${h}:00Z`;
      }
      return s;
    };
    parts.push(`Geçerlilik: ${fmtDate(from)} → ${fmtDate(to)}`);
  }

  if (parts.length > 0) {
    return parts.join(". ") + ".";
  }

  // Fallback: ham metnin kısa versiyonu
  if (raw.length > 10) {
    return raw.length > 120 ? raw.slice(0, 117) + "..." : raw;
  }
  return "Operasyonel etki potansiyeli var; detay kontrol edilmeli.";
}

function labelize(value?: string) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function trSeverity(value?: string) {
  const v = String(value || "").toLowerCase();
  if (v === "critical") return "Kritik";
  if (v === "medium") return "Orta";
  if (v === "info") return "Bilgi";
  if (v === "advisory") return "Uyarı";
  return value || "Bilgi";
}

function trStatus(value?: string) {
  const v = String(value || "").toLowerCase();
  if (v === "high") return "yüksek";
  if (v === "watch") return "izle";
  if (v === "ok") return "uygun";
  if (v === "missing") return "eksik";
  if (v === "absent") return "yok";
  return value || "-";
}

function trCategory(value?: string) {
  const key = String(value || "").toLowerCase();
  const map: Record<string, string> = {
    runway_closure: "Pist kapanışı",
    runway_inspection: "Pist kontrolü",
    runway_surface: "Pist yüzeyi",
    nav_outage: "Seyrüsefer yardımcısı arızası",
    lighting_maintenance: "Işıklandırma bakımı",
    ops_hours: "Çalışma saatleri",
    apron_works: "Apron çalışması",
    taxiway_works: "Taksi yolu çalışması",
    airspace_activity: "Hava sahası faaliyeti",
    weather_advisory: "Hava uyarısı",
    runway: "Pist",
    nav: "Seyrüsefer",
    lighting: "Işıklandırma",
    surface: "Yüzey",
    weather: "Hava",
    airspace: "Hava sahası",
    visibility: "Görüş",
    rvr: "RVR",
    ceiling: "Tavan",
    "wind/gust": "Rüzgar/Gust",
    "fog/mist": "Sis/Pus",
    precipitation: "Yağış",
    "taf trend": "TAF eğilimi",
    "ts/freezing": "TS/Freezing",
  };
  return map[key] || labelize(value);
}

function formatUtc(value?: string) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toISOString().replace(".000Z", "Z");
}

function metSourceLabel(report: any) {
  if (!report) return "Yok";
  const providerName = report.providerName ? String(report.providerName) : "";
  const source = report.source ? String(report.source) : "";
  const fallback = report.fallbackUsed ? " fallback" : "";
  const stale = report.stale ? " stale" : "";
  if (providerName && source) return `${providerName} (${source}${fallback}${stale})`;
  return providerName || source || "Bilinmiyor";
}

function scoreBand(score?: number) {
  const s = Number(score ?? 0);
  if (s >= 70) {
    return {
      label: "Yüksek Risk",
      tone: "border-rose-600/40 bg-rose-500/10 text-rose-100",
      threshold: "70-100",
      meaning: "Meteoroloji, rüzgar veya NOTAM tarafında belirgin operasyonel risk var. Plan yeniden doğrulanmalı.",
    };
  }
  if (s >= 40) {
    return {
      label: "Orta Risk",
      tone: "border-amber-600/40 bg-amber-500/10 text-amber-100",
      threshold: "40-69",
      meaning: "Uçuşu doğrudan engelleyen sonuç değil; ancak limit, alternate ve güncel veri kontrolü gerekir.",
    };
  }
  return {
    label: "Düşük Risk",
    tone: "border-emerald-600/40 bg-emerald-500/10 text-emerald-100",
    threshold: "0-39",
    meaning: "Mevcut veriye göre belirgin operasyonel risk sinyali düşük. Bu operasyonel onay değildir.",
  };
}

function weatherScoreBand(score?: number) {
  const s = Number(score ?? 0);
  if (s >= 60) return { label: "Yüksek hava riski", tone: "border-rose-600/40 bg-rose-500/10 text-rose-100" };
  if (s >= 30) return { label: "Hava durumu izlenmeli", tone: "border-amber-600/40 bg-amber-500/10 text-amber-100" };
  return { label: "Düşük hava riski", tone: "border-emerald-600/40 bg-emerald-500/10 text-emerald-100" };
}

function translateBriefText(value?: string) {
  return String(value || "")
    .replace(/\bThunder\/freezing present\b/g, "Gök gürültülü veya freezing hadise var")
    .replace(/\bTAF trend contains deterioration signal\b/g, "TAF eğiliminde kötüleşme sinyali var")
    .replace(/\bMETAR guardrail floor applied\b/g, "METAR emniyet tabanı uygulandı")
    .replace(/\bvisibility < 1500 m\b/g, "görüş < 1500 m")
    .replace(/\bvisibility < 3000 m\b/g, "görüş < 3000 m")
    .replace(/\bceiling < 600 ft\b/g, "tavan < 600 ft")
    .replace(/\bceiling < 1000 ft\b/g, "tavan < 1000 ft")
    .replace(/\bstrong wind or gust\b/g, "kuvvetli rüzgar veya gust")
    .replace(/\bwind\/gust caution threshold\b/g, "rüzgar/gust orta risk eşiği")
    .replace(/\bRVR not reported\b/g, "RVR raporlanmadı")
    .replace(/\bVisibility not parsed\b/g, "Görüş ayrıştırılamadı")
    .replace(/\bCeiling not parsed\b/g, "Tavan ayrıştırılamadı")
    .replace(/\bNo TS\/freezing signal\b/g, "TS/freezing sinyali yok")
    .replace(/\bNo fog\/mist signal\b/g, "Sis/pus sinyali yok")
    .replace(/\bBR\/FG with reduced visibility\b/g, "BR/FG ve azalmış görüş")
    .replace(/\bBR\/FG signal\b/g, "BR/FG sinyali")
    .replace(/\bNo precipitation signal\b/g, "Yağış sinyali yok")
    .replace(/\bPrecipitation with reduced visibility\b/g, "Yağış ve azalmış görüş")
    .replace(/\bPrecipitation signal\b/g, "Yağış sinyali")
    .replace(/\bNo parsed deterioration signal\b/g, "Ayrıştırılmış kötüleşme sinyali yok")
    .replace(/\bWeather\b/g, "Hava")
    .replace(/\bWind\b/g, "Rüzgar")
    .replace(/\bTrained METAR model\b/g, "Eğitilmiş METAR modeli")
    .replace(/\bMETAR guardrail floor\b/g, "METAR emniyet tabanı")
    .replace(/\bHigh\b/g, "Yüksek")
    .replace(/\bMedium\b/g, "Orta")
    .replace(/\bLow\b/g, "Düşük")
    .replace(/\bInfo\b/g, "Bilgi");
}

function weatherCategoryTone(status?: string) {
  if (status === "high") return "border-rose-600/30 bg-rose-500/10 text-rose-100";
  if (status === "watch") return "border-amber-600/30 bg-amber-500/10 text-amber-100";
  if (status === "ok") return "border-emerald-600/30 bg-emerald-500/10 text-emerald-100";
  if (status === "missing") return "border-zinc-600/40 bg-zinc-700/20 text-zinc-200";
  return "border-zinc-700 bg-zinc-900/50 text-zinc-300";
}

function notamScoreBand(score?: number) {
  const s = Number(score ?? 0);
  if (s >= 70) return "Kritik: pist, seyrüsefer, yüzey veya hava sahası etkisi doğrudan operasyonu kısıtlıyor.";
  if (s >= 45) return "Yüksek: belirgin operasyonel etki var, planlama ve yedek usul kontrolü gerekir.";
  if (s >= 18) return "Orta: operasyonu etkileyebilir, brifing sırasında kontrol edilmeli.";
  return "Bilgi: bilgilendirici veya düşük etkili NOTAM.";
}

function notamScoreLabel(score?: number) {
  const s = Number(score ?? 0);
  if (s >= 70) return { label: "Kritik etki", tone: "text-rose-100", note: "Doğrudan operasyonel kısıt olabilir." };
  if (s >= 45) return { label: "Yüksek etki", tone: "text-rose-100", note: "Plan ve yedek usul kontrolü gerekir." };
  if (s >= 18) return { label: "Orta etki", tone: "text-amber-100", note: "Brifing sırasında ayrıca kontrol edilmeli." };
  return { label: "Düşük etki", tone: "text-zinc-200", note: "Bilgilendirici veya düşük operasyonel etki." };
}

function translateNotamReason(value?: string) {
  return translateBriefText(value)
    .replace(/\bPAPI outage reduces visual approach guidance\b/gi, "PAPI arızası görsel yaklaşma rehberliğini azaltır")
    .replace(/\bGNSS interference can affect RNAV\/RNP capability\b/gi, "GNSS girişimi RNAV/RNP kabiliyetini etkileyebilir")
    .replace(/\bVOR\/DME fluctuation can affect conventional navigation backup\b/gi, "VOR/DME dalgalanması klasik seyrüsefer yedeğini etkileyebilir")
    .replace(/\bILS outage can affect approach minima and usable procedures\b/gi, "ILS kesintisi yaklaşma minimlerini ve kullanılabilir prosedürleri etkileyebilir")
    .replace(/\bRunway closure is a direct operational constraint\b/gi, "Pist kapanışı doğrudan operasyonel kısıttır")
    .replace(/\bRunway surface condition directly affects takeoff and landing planning\b/gi, "Pist yüzeyi kalkış ve iniş performans planlamasını doğrudan etkiler")
    .replace(/\bRunway inspection windows can create short occupancy restrictions\b/gi, "Pist kontrol pencereleri kısa süreli kullanım kısıtı oluşturabilir")
    .replace(/\bHigh-capacity runway system can be affected by short-notice inspection windows\b/gi, "Yoğun kullanılan pist sistemi kısa süreli kontrol pencerelerinden etkilenebilir")
    .replace(/\bModerate turbulence reports can affect passenger and crew planning\b/gi, "Orta türbülans raporları yolcu ve ekip planlamasını etkileyebilir")
    .replace(/\bWildlife hazard can affect low altitude phases\b/gi, "Yaban hayatı riski alçak irtifa safhalarını etkileyebilir")
    .replace(/\bApron constraints can affect ground movement but not runway availability\b/gi, "Apron kısıtları yer hareketini etkileyebilir; pist kullanılabilirliği doğrudan etkilenmeyebilir")
    .replace(/\bTaxiway works can change routing and increase ground delay\b/gi, "Taksi yolu çalışmaları yer rotasını değiştirebilir ve gecikme yaratabilir")
    .replace(/\bLighting maintenance can reduce visual guidance\b/gi, "Işıklandırma bakımı görsel rehberliği azaltabilir");
}

function notamOperationalSummary(item: UiNotamItem) {
  const event = item.event;
  const category = trCategory(event?.category || item.impacts?.[0] || "NOTAM");
  const runway = event?.affectedRunway ? `Pist ${event.affectedRunway}` : "Meydan/prosedür";
  const reason = translateNotamReason(event?.reason);
  const score = notamScore(item);
  const scoreLabel = notamScoreLabel(score);
  const syntheticNote = item.synthetic ? "Bu kayıt sentetik demo NOTAM'dır; gerçek operasyonel NOTAM yerine geçmez." : "Canlı NOTAM kaydıdır; resmi kaynakla doğrulanmalıdır.";

  return {
    title: `${category} etkisi`,
    scope: runway,
    reason: reason || notamScoreBand(score),
    scoreLabel,
    syntheticNote,
  };
}

function notamBulletReason(item: UiNotamItem) {
  const event = item.event;
  const category = String(event?.category || "").toLowerCase();
  const impacts = new Set([...(event?.impacts ?? []), ...(item.impacts ?? [])].map((x) => String(x).toLowerCase()));
  const runway = event?.affectedRunway ? ` (${event.affectedRunway})` : "";

  if (category === "runway_closure") return `Pist kapalı${runway}; kalkış/iniş için pist uygunluğu doğrudan etkilenir.`;
  if (category === "runway_surface") return `Pist yüzeyi/frenleme durumu problemli${runway}; performans hesabı ve iniş/kalkış planı etkilenir.`;
  if (category === "runway_inspection") return `Pist kontrol veya kısa süreli kullanım penceresi var${runway}; gecikme veya pist meşguliyeti yaratabilir.`;
  if (category === "nav_outage") return `Seyrüsefer veya yaklaşma yardımcısı etkilenmiş${runway}; yaklaşma minima ve yedek prosedür kontrol edilmeli.`;
  if (category === "lighting_maintenance") return `Pist/yaklaşma ışıklandırması etkilenmiş${runway}; gece veya düşük görüşte görsel rehberlik azalabilir.`;
  if (category === "ops_hours") return "Meydan çalışma saati veya operasyon penceresi kısıtlı; uçuş zamanı doğrulanmalı.";
  if (category === "apron_works") return "Apron çalışması/kısıtı var; yer hareketi, park ve gecikme etkilenebilir.";
  if (category === "taxiway_works") return "Taksi yolu çalışması var; yer rotası değişebilir ve yerde gecikme oluşabilir.";
  if (category === "airspace_activity") return "Hava sahası faaliyeti/kısıtı var; rota, irtifa veya ATC usulleri etkilenebilir.";
  if (category === "weather_advisory") return "Hava bağlantılı operasyonel uyarı var; alçak irtifa, türbülans, buzlanma veya görüş etkisi kontrol edilmeli.";
  if (impacts.has("runway")) return `Pist etkisi var${runway}; pist kullanılabilirliği kontrol edilmeli.`;
  if (impacts.has("nav")) return "Seyrüsefer etkisi var; yaklaşma ve yedek usuller kontrol edilmeli.";
  if (impacts.has("lighting")) return "Işıklandırma etkisi var; görsel yaklaşma koşulları kontrol edilmeli.";
  if (impacts.has("surface")) return "Yüzey/frenleme etkisi var; performans planlaması kontrol edilmeli.";
  if (impacts.has("airspace")) return "Hava sahası etkisi var; rota ve ATC kısıtları kontrol edilmeli.";
  if (impacts.has("weather")) return "Hava bağlantılı uyarı var; güncel METAR/TAF ile birlikte kontrol edilmeli.";
  // Fallback: event reason varsa çevir, yoksa NOTAM metninden Türkçe özet çıkar
  const eventReason = translateNotamReason(event?.reason);
  if (eventReason) return eventReason;
  const rawText = notamText(item);
  if (rawText.length > 10) {
    return parseNotamToTurkish(rawText);
  }
  return `Operasyonel etki potansiyeli var; ilgili NOTAM detayı briefing sırasında kontrol edilmeli.`;
}

function notamReasonTitle(item: UiNotamItem) {
  const score = notamScore(item);
  if (item.critical || item.event?.critical || score >= 45) return "Kritik NOTAM gerekçesi";
  if (score >= 18) return "Dikkat gerekçesi";
  return "Bilgi notu";
}

function criticalNotamReasonItems(depItems: UiNotamItem[], arrItems: UiNotamItem[]) {
  const make = (side: "DEP" | "ARR", item: UiNotamItem) => {
    const scope = item.event?.affectedRunway ? ` ${item.event.affectedRunway}` : "";
    return `${side}: ${trCategory(item.event?.category || item.impacts?.[0] || "NOTAM")}${scope} - ${notamBulletReason(item)}`;
  };

  const allReasons = [
    ...depItems.filter((n) => n.critical || n.event?.critical).map((n) => make("DEP", n)),
    ...arrItems.filter((n) => n.critical || n.event?.critical).map((n) => make("ARR", n)),
  ];

  // Aynı mesajları grupla: "DEP: NOTAM - X" 3 kez varsa → "DEP: 3× NOTAM - X"
  const counts = new Map<string, number>();
  for (const r of allReasons) counts.set(r, (counts.get(r) || 0) + 1);
  const deduped: string[] = [];
  for (const [msg, count] of counts) {
    deduped.push(count > 1 ? `${msg.split(":")[0]}: ${count}× ${msg.split(": ").slice(1).join(": ")}` : msg);
  }
  return deduped.slice(0, 6);
}

function formatRiskDriver(value?: string) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(Weather|Wind|NOTAM):\s*(\d+)/i);
  if (!match) return translateBriefText(raw);

  const key = match[1].toLowerCase();
  const score = Number(match[2]);
  const band =
    score >= 70 ? "yüksek" : score >= 40 ? "orta" : score >= 18 ? "düşük/orta" : "düşük";

  if (key === "notam") {
    return `NOTAM etkisi: ${band} (${score}/100). Bu puan, DEP/ARR NOTAM'ları içindeki en güçlü operasyonel etkiyi gösterir; tek başına uçuş iptali kararı değildir.`;
  }
  if (key === "weather") {
    return `Hava etkisi: ${band} (${score}/100). Görüş, tavan, hadise ve TAF eğilimi birlikte değerlendirilir.`;
  }
  return `Rüzgar etkisi: ${band} (${score}/100). Yan rüzgar, arka rüzgar ve limit yakınlığı değerlendirilir.`;
}

const NOTAM_CATEGORY_DEFS = [
  { key: "runway_closure", label: "Pist kapanisi", match: ["runway_closure", "runway"], meaning: "Pist kapanisi veya pist kullanilabilirligi" },
  { key: "runway_inspection", label: "Pist kontrolu", match: ["runway_inspection"], meaning: "Pist kontrolu veya kisa sureli kisit" },
  { key: "surface", label: "Yuzey / frenleme", match: ["surface", "runway_surface"], meaning: "Yuzey, frenleme, kontaminasyon" },
  { key: "nav_outage", label: "Seyrusefer yardimi", match: ["nav_outage", "nav"], meaning: "ILS, PAPI, VOR/DME, GNSS etkisi" },
  { key: "lighting", label: "Isiklandirma", match: ["lighting"], meaning: "Pist/yaklasma isiklari" },
  { key: "ops_hours", label: "Calisma saatleri", match: ["ops_hours"], meaning: "Meydan calisma saati veya operasyon penceresi" },
  { key: "apron_taxiway", label: "Apron / taxiway", match: ["apron_taxiway"], meaning: "Apron, taksi yolu, yer hareketi" },
  { key: "airspace", label: "Hava sahasi", match: ["airspace"], meaning: "Askeri faaliyet, kisitli saha, hava sahasi" },
  { key: "weather", label: "Hava uyarisi", match: ["weather", "weather_advisory"], meaning: "LLWS, buzlanma, turbulans, frenleme gibi hava baglantili etki" },
];

function notamKeys(item: UiNotamItem) {
  return [
    item.event?.category,
    ...(item.event?.impacts ?? []),
    ...(item.impacts ?? []),
  ]
    .filter(Boolean)
    .map((x) => String(x));
}

function notamScore(item: UiNotamItem) {
  const eventScore = item.event?.score;
  if (typeof eventScore === "number") return eventScore;
  if (item.severity === "Critical" || item.critical) return 55;
  if (item.severity === "Medium") return 28;
  return 8;
}

function categoryRows(depItems: UiNotamItem[], arrItems: UiNotamItem[]) {
  return NOTAM_CATEGORY_DEFS.map((def) => {
    const dep = depItems.filter((item) => {
      const keys = notamKeys(item);
      return def.match.some((m) => keys.includes(m));
    });
    const arr = arrItems.filter((item) => {
      const keys = notamKeys(item);
      return def.match.some((m) => keys.includes(m));
    });
    const scores = [...dep, ...arr].map(notamScore);
    return {
      ...def,
      depCount: dep.length,
      arrCount: arr.length,
      maxScore: scores.length ? Math.max(...scores) : 0,
    };
  });
}

function NotamCard({ item, tone }: { item: UiNotamItem; tone: "critical" | "normal" }) {
  const event = item.event;
  const isCritical = tone === "critical";
  const severity = event?.severity || item.severity || (isCritical ? "Critical" : "Advisory");
  const impacts = event?.impacts || item.impacts || [];
  const validFrom = event?.validFrom || item.validFrom;
  const validTo = event?.validTo || item.validTo;
  const body = notamText(item);
  const score = notamScore(item);
  const summary = notamOperationalSummary(item);
  const bulletReason = notamBulletReason(item);

  return (
    <div
      className={
        isCritical
          ? "rounded-md border border-rose-600/30 bg-rose-500/10 px-3 py-2"
          : "rounded-md border border-zinc-700 bg-zinc-900/50 px-3 py-2"
      }
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span
          className={
            isCritical
              ? "rounded-full border border-rose-600/40 bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-200"
              : "rounded-full border border-zinc-700 bg-zinc-800/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-300"
          }
        >
          {trSeverity(severity)}
        </span>
        {item.synthetic ? (
          <span className="rounded-full border border-amber-600/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
            Sentetik
          </span>
        ) : null}
        <span className="text-[11px] text-zinc-400">{item.id || event?.key || "NOTAM"}</span>
      </div>

      <div className={isCritical ? "text-sm leading-6 text-zinc-100" : "text-sm leading-6 text-zinc-200"}>
        <div className="font-semibold">{summary.title}</div>
        <div className="mt-1 text-zinc-200">{summary.reason}</div>
        <div className="mt-2 rounded-md border border-zinc-700/70 bg-zinc-950/35 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            {notamReasonTitle(item)}
          </div>
          <ul className="mt-1 list-disc pl-4 text-xs leading-5 text-zinc-200">
            <li>{bulletReason}</li>
          </ul>
        </div>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded border border-zinc-700/70 bg-zinc-950/35 px-2 py-1.5">
            <div className="text-[10px] uppercase tracking-wide text-zinc-500">Kapsam</div>
            <div className="text-xs text-zinc-200">{summary.scope}</div>
          </div>
          <div className="rounded border border-zinc-700/70 bg-zinc-950/35 px-2 py-1.5">
            <div className="text-[10px] uppercase tracking-wide text-zinc-500">Etki puanı</div>
            <div className={`text-xs font-semibold ${summary.scoreLabel.tone}`}>
              {score}/100 - {summary.scoreLabel.label}
            </div>
          </div>
          <div className="rounded border border-zinc-700/70 bg-zinc-950/35 px-2 py-1.5">
            <div className="text-[10px] uppercase tracking-wide text-zinc-500">Ne yapılır?</div>
            <div className="text-xs text-zinc-200">{summary.scoreLabel.note}</div>
          </div>
        </div>
        <div className="mt-2 text-[11px] leading-5 text-zinc-400">{summary.syntheticNote}</div>
      </div>

      {event ? (
        <div className="mt-3 grid grid-cols-1 gap-2 text-[11px] text-zinc-400 sm:grid-cols-2">
          <div>
            <span className="text-zinc-500">Kategori:</span> {trCategory(event.category)}
          </div>
          <div>
            <span className="text-zinc-500">Etki puanı:</span> {typeof event.score === "number" ? `${event.score}/100` : "-"}
          </div>
          <div className="sm:col-span-2">
            <span className="text-zinc-500">Skor yorumu:</span> {notamScoreBand(score)}
          </div>
          {event.affectedRunway ? (
            <div>
              <span className="text-zinc-500">Pist:</span> {event.affectedRunway}
            </div>
          ) : null}
          {event.syntheticMode ? (
            <div>
              <span className="text-zinc-500">Mod:</span> {event.syntheticMode}
            </div>
          ) : null}
          {validFrom || validTo ? (
            <div className="sm:col-span-2">
              <span className="text-zinc-500">Geçerlilik:</span> {formatUtc(validFrom) || "-"} / {formatUtc(validTo) || "-"}
            </div>
          ) : null}
          {impacts.length > 0 ? (
            <div className="sm:col-span-2">
              <span className="text-zinc-500">Etkiler:</span> {impacts.map(trCategory).join(", ")}
            </div>
          ) : null}
          {event.reason ? (
            <div className="sm:col-span-2">
              <span className="text-zinc-500">Gerekçe:</span> {translateNotamReason(event.reason)}
            </div>
          ) : null}
        </div>
      ) : null}

      {body ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-[11px] text-zinc-400 hover:text-zinc-200">
            Ham NOTAM metnini göster
          </summary>
          <div className="mt-2 rounded border border-zinc-800 bg-zinc-950/40 p-2 text-xs leading-5 text-zinc-300">
            {body}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function parseAlternateLabel(label: string) {
  const raw = String(label || "").trim();
  const icao = raw.match(/^[A-Z]{4}/)?.[0] ?? raw;
  const kmMatch = raw.match(/\((\d+)\s*km\)/i);
  const distanceKm = kmMatch ? Number(kmMatch[1]) : null;

  let distanceBand = "Yakın alternate";
  if (typeof distanceKm === "number") {
    if (distanceKm <= 80) distanceBand = "Çok yakın";
    else if (distanceKm <= 150) distanceBand = "Uygun mesafe";
    else distanceBand = "Görece uzak";
  }

  return {
    raw,
    icao,
    distanceKm,
    distanceBand,
  };
}

function getAlternateCardTone(score?: number) {
  if (!Number.isFinite(score)) {
    return {
      card: "border-zinc-700 bg-zinc-900/40",
      badge: "border-zinc-700 bg-zinc-800/70 text-zinc-300",
      label: "Standart",
    };
  }

  const s = Number(score);

  if (s <= 18) {
    return {
      card: "border-emerald-600/40 bg-emerald-500/5",
      badge: "border-emerald-600/30 bg-emerald-500/10 text-emerald-200",
      label: "İyi",
    };
  }

  if (s <= 32) {
    return {
      card: "border-amber-600/40 bg-amber-500/5",
      badge: "border-amber-600/30 bg-amber-500/10 text-amber-200",
      label: "Orta",
    };
  }

  return {
    card: "border-rose-600/40 bg-rose-500/5",
    badge: "border-rose-600/30 bg-rose-500/10 text-rose-200",
    label: "Zayıf",
  };
}


function getAlternateRiskIndicator(score?: number) {
  if (!Number.isFinite(score)) {
    return {
      icon: "•",
      label: "Bilinmiyor",
      cls: "border-zinc-700 bg-zinc-800/70 text-zinc-300",
    };
  }

  const s = Number(score);

  if (s <= 18) {
    return {
      icon: "🟢",
      label: "Düşük Risk",
      cls: "border-emerald-600/30 bg-emerald-500/10 text-emerald-200",
    };
  }

  if (s <= 32) {
    return {
      icon: "🟡",
      label: "Orta Risk",
      cls: "border-amber-600/30 bg-amber-500/10 text-amber-200",
    };
  }

  return {
    icon: "🔴",
    label: "Yüksek Risk",
    cls: "border-rose-600/30 bg-rose-500/10 text-rose-200",
  };
}

function getConfidenceTone(level?: string) {
  if (level === "high") {
    return {
      badge: "border-emerald-600/30 bg-emerald-500/10 text-emerald-200",
      dot: "bg-emerald-400",
      label: "Yüksek",
    };
  }

  if (level === "medium") {
    return {
      badge: "border-amber-600/30 bg-amber-500/10 text-amber-200",
      dot: "bg-amber-400",
      label: "Orta",
    };
  }

  return {
    badge: "border-rose-600/30 bg-rose-500/10 text-rose-200",
    dot: "bg-rose-400",
    label: "Düşük",
  };
}




function parseAlternateSummary(summary?: string) {
  const text = String(summary || "").trim();
  if (!text) return null;

  const strongPrefix = "Güçlü aday:";
  const balancedPrefix = "Dengeli aday:";
  const cautionPrefix = "Dikkat gerekir:";

  if (text.startsWith(strongPrefix)) {
    return {
      tone: "strong" as const,
      badge: "Güçlü aday",
      body: text.slice(strongPrefix.length).trim(),
    };
  }

  if (text.startsWith(balancedPrefix)) {
    return {
      tone: "balanced" as const,
      badge: "Dengeli aday",
      body: text.slice(balancedPrefix.length).trim(),
    };
  }

  if (text.startsWith(cautionPrefix)) {
    return {
      tone: "caution" as const,
      badge: "Dikkat gerekir",
      body: text.slice(cautionPrefix.length).trim(),
    };
  }

  return {
    tone: "neutral" as const,
    badge: "Değerlendirme",
    body: text,
  };
}

function getAlternateSummaryTone(tone: "strong" | "balanced" | "caution" | "neutral") {
  if (tone === "strong") {
    return {
      badge:
        "border-emerald-600/30 bg-emerald-500/10 text-emerald-200",
      box:
        "border-emerald-700/20 bg-emerald-500/[0.04]",
    };
  }

  if (tone === "balanced") {
    return {
      badge:
        "border-sky-600/30 bg-sky-500/10 text-sky-200",
      box:
        "border-sky-700/20 bg-sky-500/[0.04]",
    };
  }

  if (tone === "caution") {
    return {
      badge:
        "border-amber-600/30 bg-amber-500/10 text-amber-200",
      box:
        "border-amber-700/20 bg-amber-500/[0.04]",
    };
  }

  return {
    badge:
      "border-zinc-700 bg-zinc-800/80 text-zinc-200",
    box:
      "border-zinc-800 bg-zinc-950/40",
  };
}

/* ===== TAF Timeline ===== */
function TafTimeline({ raw }: { raw?: string }) {
  const { validity, segments } = parseTaf(raw);

  const styleByKind: Record<string, { pill: string; bar: string; w: string }> = {
    BASE: { pill: "bg-zinc-700/40 text-zinc-200 border-zinc-600/40", bar: "bg-zinc-600", w: "w-full" },
    FM: { pill: "bg-sky-500/15 text-sky-200 border-sky-600/40", bar: "bg-sky-500", w: "w-3/4" },
    BECMG: { pill: "bg-amber-500/15 text-amber-200 border-amber-600/40", bar: "bg-amber-500", w: "w-2/3" },
    TEMPO: { pill: "bg-violet-500/15 text-violet-200 border-violet-600/40", bar: "bg-violet-500", w: "w-1/2" },
    PROB: { pill: "bg-rose-500/15 text-rose-200 border-rose-600/40", bar: "bg-rose-500", w: "w-1/3" },
  };

  return (
    <div className="mt-3 rounded-md border border-zinc-700 bg-zinc-900/60 p-2">
      <div className="mb-2 flex flex-wrap gap-2 text-[11px] text-zinc-400">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded bg-zinc-600" /> BASE
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded bg-sky-500" /> FM
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded bg-amber-500" /> BECMG
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded bg-violet-500" /> TEMPO
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded bg-rose-500" /> PROB
        </span>
        <span className="ml-auto">{`Validity: ${validity.from} → ${validity.to}`}</span>
      </div>

      <div className="flex flex-col gap-2">
        {segments.map((s, idx) => {
          const st = styleByKind[s.kind] ?? styleByKind.BASE;
          return (
            <div key={idx} className={`rounded border px-2 py-1.5 ${st.pill}`}>
              <div className="flex items-center justify-between text-xs">
                <div className="font-semibold">
                  {s.kind}
                  <span className="ml-2 font-normal text-zinc-300">
                    {s.fromZ}
                    {s.toZ ? ` → ${s.toZ}` : ""}
                  </span>
                </div>
                {s.wind ? (
                  <div className="text-zinc-200">
                    W: {s.wind.dir ?? "VRB"}° {s.wind.spd}kt
                    {typeof s.wind.gust === "number" ? ` G${s.wind.gust}` : ""}
                  </div>
                ) : (
                  <div className="text-zinc-400">W: —</div>
                )}
              </div>

              <div className="mt-1">
                <div className={`h-1.5 rounded ${st.bar} ${st.w}`} />
              </div>

              <div className="mt-1 text-[11px] text-zinc-200">
                {s.vis ? `VIS ${s.vis}` : "VIS —"}
                {" · "}
                {s.clouds?.length ? s.clouds.join(" ") : "NSC"}
                {s.wx?.length ? ` · ${s.wx.join(" ")}` : ""}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
/* ===== /TAF Timeline ===== */

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded border border-zinc-700 bg-zinc-800/70 px-2 py-0.5 text-xs">
      {children}
    </span>
  );
}

function ScorePill({ score, cls }: { score: number; cls: "green" | "yellow" | "red" }) {
  const bg =
    cls === "green"
      ? "bg-emerald-500/20 text-emerald-300 border-emerald-600/50"
      : cls === "yellow"
      ? "bg-amber-500/20 text-amber-300 border-amber-600/50"
      : "bg-rose-500/20 text-rose-300 border-rose-600/50";
  return <span className={`rounded border px-2 py-0.5 text-sm ${bg}`}>{score}</span>;
}

function Line({ w = "100%", h = 12 }: { w?: string; h?: number }) {
  return <div className="animate-pulse rounded bg-zinc-800/70" style={{ width: w, height: h }} />;
}

function dash(value: unknown) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function weatherCodeLabel(code?: string) {
  const c = String(code || "").toUpperCase();
  const labels: Record<string, string> = {
    BR: "Pus",
    FG: "Sis",
    HZ: "Haze",
    RA: "Yağmur",
    DZ: "Çisenti",
    SN: "Kar",
    TS: "Gök gürültülü",
    TSRA: "Gök gürültülü yağmur",
    SHRA: "Sağanak",
    FZRA: "Donan yağmur",
  };
  return labels[c] || code || "Belirgin hadise yok";
}

function visibilitySummary(vis?: number) {
  if (typeof vis !== "number") return { label: "Görüş verisi yok", tone: "text-zinc-300" };
  if (vis >= 9999) return { label: "10 km+ / iyi", tone: "text-emerald-200" };
  if (vis >= 5000) return { label: `${vis} m / uygun`, tone: "text-emerald-200" };
  if (vis >= 3000) return { label: `${vis} m / dikkat`, tone: "text-amber-200" };
  return { label: `${vis} m / düşük`, tone: "text-rose-200" };
}

function ceilingSummary(ceiling?: number) {
  if (typeof ceiling !== "number") return { label: "CAVOK / kırılma yok", tone: "text-emerald-200" };
  if (ceiling >= 3000) return { label: `${ceiling} ft / VFR rahat`, tone: "text-emerald-200" };
  if (ceiling >= 1500) return { label: `${ceiling} ft / sınırlı`, tone: "text-amber-200" };
  if (ceiling >= 800) return { label: `${ceiling} ft / düşük`, tone: "text-rose-200" };
  return { label: `${ceiling} ft / kritik`, tone: "text-rose-200" };
}

function windSummary(parsed: any) {
  const dir = parsed?.wind_dir;
  const speed = parsed?.wind_spd;
  const gust = parsed?.wind_gust;
  if (speed === undefined || speed === null) return "Rüzgar verisi yok";
  const direction = dir === undefined || dir === null ? "VRB" : `${dir}°`;
  return `${direction} ${speed} kt${gust ? ` G${gust}` : ""}`;
}

function cloudBaseFromToken(token?: string) {
  const m = String(token || "").match(/^(BKN|OVC)(\d{3})/);
  return m ? Number(m[2]) * 100 : null;
}

function tafConcernLabel(raw?: string) {
  const { validity, segments } = parseTaf(raw);
  const concerns: string[] = [];

  for (const segment of segments) {
    if (segment.wx?.length) concerns.push(`${segment.kind}: ${segment.wx.map(weatherCodeLabel).join(", ")}`);
    if (segment.vis && /^\d{4}$/.test(segment.vis) && Number(segment.vis) < 5000) {
      concerns.push(`${segment.kind}: görüş ${segment.vis} m`);
    }
    const lowCloud = segment.clouds?.map(cloudBaseFromToken).find((x) => typeof x === "number" && x < 2000);
    if (typeof lowCloud === "number") concerns.push(`${segment.kind}: tavan ${lowCloud} ft`);
  }

  return {
    validity,
    segments,
    concerns: [...new Set(concerns)].slice(0, 3),
  };
}

function buildProsCons(input: {
  metDep: any;
  metArr: any;
  tafDep: any;
  tafArr: any;
  depCritical: number;
  arrCritical: number;
  totalCritical: number;
  risk: BriefResponse["risk"];
  breakdown?: any;
}) {
  const pros: string[] = [];
  const cons: string[] = [];
  const depParsed = input.metDep?.parsed ?? {};
  const arrParsed = input.metArr?.parsed ?? {};
  const depVis = visibilitySummary(depParsed.vis);
  const arrVis = visibilitySummary(arrParsed.vis);
  const depCeiling = ceilingSummary(depParsed.ceiling);
  const arrCeiling = ceilingSummary(arrParsed.ceiling);

  if (typeof depParsed.vis === "number" && depParsed.vis >= 5000) pros.push(`DEP görüş uygun: ${depVis.label}`);
  else cons.push(`DEP görüş sınırlı veya eksik: ${depVis.label}`);

  if (typeof arrParsed.vis === "number" && arrParsed.vis >= 5000) pros.push(`ARR görüş uygun: ${arrVis.label}`);
  else cons.push(`ARR görüş sınırlı veya eksik: ${arrVis.label}`);

  if (typeof depParsed.ceiling === "number" && depParsed.ceiling >= 1500) pros.push(`DEP tavan kabul edilebilir: ${depCeiling.label}`);
  else if (depCeiling.label !== "Tavan verisi yok") cons.push(`DEP tavan düşük: ${depCeiling.label}`);
  else cons.push("DEP tavan verisi eksik.");

  if (typeof arrParsed.ceiling === "number" && arrParsed.ceiling >= 1500) pros.push(`ARR tavan kabul edilebilir: ${arrCeiling.label}`);
  else if (arrCeiling.label !== "Tavan verisi yok") cons.push(`ARR tavan düşük: ${arrCeiling.label}`);
  else cons.push("ARR tavan verisi eksik.");

  if (Math.abs(Number(input.risk.crosswind ?? 0)) < 12) pros.push(`Yan rüzgar yönetilebilir görünüyor: ${Math.abs(Number(input.risk.crosswind ?? 0)).toFixed(1)} kt`);
  else cons.push(`Yan rüzgar dikkat istiyor: ${Math.abs(Number(input.risk.crosswind ?? 0)).toFixed(1)} kt`);

  if (input.totalCritical === 0) pros.push("Kritik NOTAM yok.");
  else cons.push(`Kritik NOTAM var: DEP ${input.depCritical}, ARR ${input.arrCritical}.`);

  if (Number(input.breakdown?.notam ?? 0) >= 30) cons.push(`NOTAM katkısı yüksek: ${input.breakdown.notam}.`);
  if (Number(input.breakdown?.weather ?? 0) <= 15) pros.push("Hava katkisi dusuk/orta seviyede.");

  return {
    pros: [...new Set(pros)].slice(0, 5),
    cons: [...new Set(cons)].slice(0, 5),
  };
}

type RiskReportRow = {
  parameter: string;
  value: string;
  status: "iyi" | "izle" | "risk" | "eksik";
  simple: string;
};

function riskReportTone(status: RiskReportRow["status"]) {
  if (status === "risk") return "border-rose-700/40 bg-rose-500/10 text-rose-100";
  if (status === "izle") return "border-amber-700/40 bg-amber-500/10 text-amber-100";
  if (status === "eksik") return "border-zinc-700 bg-zinc-800/50 text-zinc-200";
  return "border-emerald-700/40 bg-emerald-500/10 text-emerald-100";
}

function buildRiskReportRows(input: {
  metDep: any;
  metArr: any;
  tafDep: any;
  tafArr: any;
  depCritical: number;
  arrCritical: number;
  totalCritical: number;
  risk: BriefResponse["risk"];
  weatherAssessment?: any;
  confidence?: any;
  criticalNotamReasons?: string[];
}) {
  const depParsed = input.metDep?.parsed ?? {};
  const arrParsed = input.metArr?.parsed ?? {};
  const depVis = visibilitySummary(depParsed.vis);
  const arrVis = visibilitySummary(arrParsed.vis);
  const depCeiling = ceilingSummary(depParsed.ceiling);
  const arrCeiling = ceilingSummary(arrParsed.ceiling);
  const depTaf = tafConcernLabel(input.tafDep?.raw);
  const arrTaf = tafConcernLabel(input.tafArr?.raw);
  const cross = Math.abs(Number(input.risk.crosswind ?? 0));
  const confidenceScore = Number(input.confidence?.score ?? 0);
  const weatherScore = Number(input.weatherAssessment?.score ?? (input.risk as any)?.breakdown?.weather ?? 0);

  const rows: RiskReportRow[] = [
    {
      parameter: "Kalkış görüşü",
      value: depVis.label,
      status: typeof depParsed.vis !== "number" ? "eksik" : depParsed.vis < 3000 ? "risk" : depParsed.vis < 5000 ? "izle" : "iyi",
      simple: typeof depParsed.vis !== "number" ? "Kalkış görüşü okunamadı." : depParsed.vis < 5000 ? "Kalkışta görüş sınırlayıcı olabilir." : "Kalkış görüşü uygun görünüyor.",
    },
    {
      parameter: "Varış görüşü",
      value: arrVis.label,
      status: typeof arrParsed.vis !== "number" ? "eksik" : arrParsed.vis < 3000 ? "risk" : arrParsed.vis < 5000 ? "izle" : "iyi",
      simple: typeof arrParsed.vis !== "number" ? "Varış görüşü okunamadı." : arrParsed.vis < 5000 ? "Varışta görüş takip edilmeli." : "Varış görüşü uygun görünüyor.",
    },
    {
      parameter: "Kalkış tavanı",
      value: depCeiling.label,
      status: typeof depParsed.ceiling !== "number" ? "iyi" : depParsed.ceiling < 1000 ? "risk" : depParsed.ceiling < 2000 ? "izle" : "iyi",
      simple: typeof depParsed.ceiling !== "number" ? "Kalkışta tavan kırılması yok (CAVOK veya yüksek bulut)." : depParsed.ceiling < 2000 ? "Kalkış tavanı planı etkileyebilir." : "Kalkış tavanı rahat görünüyor.",
    },
    {
      parameter: "Varış tavanı",
      value: arrCeiling.label,
      status: typeof arrParsed.ceiling !== "number" ? "iyi" : arrParsed.ceiling < 1000 ? "risk" : arrParsed.ceiling < 2000 ? "izle" : "iyi",
      simple: typeof arrParsed.ceiling !== "number" ? "Varışta tavan kırılması yok (CAVOK veya yüksek bulut)." : arrParsed.ceiling < 2000 ? "Varış tavanı takip edilmeli." : "Varış tavanı uygun görünüyor.",
    },
    {
      parameter: "Yan rüzgar",
      value: `${cross.toFixed(1)} kt`,
      status: cross >= 15 ? "risk" : cross >= 10 ? "izle" : "iyi",
      simple: cross >= 15 ? "Yan rüzgar limitleri zorlayabilir." : cross >= 10 ? "Yan rüzgar takip edilmeli." : "Yan rüzgar yönetilebilir görünüyor.",
    },
    {
      parameter: "Kritik NOTAM",
      value: `DEP ${input.depCritical} / ARR ${input.arrCritical}`,
      status: input.totalCritical >= 3 ? "risk" : input.totalCritical >= 1 ? "izle" : "iyi",
      simple: input.totalCritical >= 1
        ? (input.criticalNotamReasons?.slice(0, 2).join(" / ") || "Kritik NOTAM var; ilgili meydan/prosedür kontrol edilmeli.")
        : "Kritik NOTAM görünmüyor.",
    },
    {
      parameter: "TAF eğilimi",
      value: [...depTaf.concerns, ...arrTaf.concerns].slice(0, 2).join(" / ") || "Belirgin kötüleşme yok",
      status: depTaf.concerns.length + arrTaf.concerns.length >= 2 ? "risk" : depTaf.concerns.length + arrTaf.concerns.length === 1 ? "izle" : "iyi",
      simple: depTaf.concerns.length + arrTaf.concerns.length > 0 ? "TAF içinde takip edilmesi gereken dönem var." : "TAF tarafında belirgin sorun görünmüyor.",
    },
    {
      parameter: "Model güveni",
      value: confidenceScore ? `${confidenceScore}/100` : "Bilinmiyor",
      status: confidenceScore >= 80 ? "iyi" : confidenceScore >= 60 ? "izle" : "eksik",
      simple: confidenceScore >= 80 ? "Veri yeterli, model güveni yüksek." : "Eksik/veri kalitesi nedeniyle sonuç daha dikkatli okunmalı.",
    },
    {
      parameter: "Hava modeli",
      value: `${weatherScore}/100`,
      status: weatherScore >= 60 ? "risk" : weatherScore >= 30 ? "izle" : "iyi",
      simple: weatherScore >= 60 ? "Hava koşulları riski yükseltiyor." : weatherScore >= 30 ? "Hava koşulları izlenmeli." : "Hava koşulları ana sorun değil.",
    },
  ];

  return rows;
}

function simpleRiskReasons(rows: RiskReportRow[]) {
  const bad = rows.filter((r) => r.status === "risk");
  const watch = rows.filter((r) => r.status === "izle");
  const missing = rows.filter((r) => r.status === "eksik");
  return [...bad, ...watch, ...missing].map((r) => `${r.parameter}: ${r.simple}`).slice(0, 5);
}

function DetailBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="mt-3 rounded-md border border-zinc-800 bg-zinc-950/40">
      <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-zinc-300 hover:text-zinc-100">
        {label}
      </summary>
      <div className="border-t border-zinc-800 p-3">{children}</div>
    </details>
  );
}

function MetSummaryCard({
  title,
  report,
  source,
  loading,
  onCopy,
}: {
  title: string;
  report: any;
  source: string;
  loading: boolean;
  onCopy: () => void;
}) {
  const parsed = report?.parsed ?? {};
  const vis = visibilitySummary(parsed?.vis);
  const ceiling = ceilingSummary(parsed?.ceiling);
  const wxItems = Array.isArray(parsed?.wx) && parsed.wx.length > 0 ? parsed.wx : [];

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900/40 p-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium">{title}</div>
          <div className="mt-0.5 text-[11px] text-zinc-500">{source}</div>
        </div>
        <button className="text-xs text-zinc-400 hover:text-zinc-200" onClick={onCopy}>
          kopyala
        </button>
      </div>

      {loading ? (
        <div className="mt-3 space-y-2">
          <Line w="90%" />
          <Line w="70%" />
        </div>
      ) : report ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-md border border-zinc-800 bg-zinc-950/30 p-2">
              <div className="text-[10px] uppercase tracking-wide text-zinc-500">Rüzgar</div>
              <div className="mt-1 text-sm font-semibold text-zinc-100">{windSummary(parsed)}</div>
            </div>
            <div className="rounded-md border border-zinc-800 bg-zinc-950/30 p-2">
              <div className="text-[10px] uppercase tracking-wide text-zinc-500">Görüş</div>
              <div className={`mt-1 text-sm font-semibold ${vis.tone}`}>{vis.label}</div>
            </div>
            <div className="rounded-md border border-zinc-800 bg-zinc-950/30 p-2">
              <div className="text-[10px] uppercase tracking-wide text-zinc-500">Tavan</div>
              <div className={`mt-1 text-sm font-semibold ${ceiling.tone}`}>{ceiling.label}</div>
            </div>
            <div className="rounded-md border border-zinc-800 bg-zinc-950/30 p-2">
              <div className="text-[10px] uppercase tracking-wide text-zinc-500">Hadise</div>
              <div className="mt-1 text-sm font-semibold text-zinc-100">
                {wxItems.length ? wxItems.map(weatherCodeLabel).join(", ") : "Belirgin yok"}
              </div>
            </div>
          </div>

          <DetailBlock label="Ham METAR ve ayrıştırılmış değerler">
            <div className="break-all font-mono text-sm text-zinc-200">{report.raw}</div>
            <div className="mt-2 text-xs text-zinc-400">
              WDIR {dash(parsed?.wind_dir)}°, WSPD {dash(parsed?.wind_spd)} kt, VIS {dash(parsed?.vis)} m, CIG{" "}
              {dash(parsed?.ceiling)} ft
            </div>
          </DetailBlock>
        </>
      ) : (
        <div className="mt-3 text-sm text-zinc-400">METAR yok</div>
      )}
    </div>
  );
}

function TafSummaryCard({
  title,
  report,
  source,
  loading,
  onCopy,
}: {
  title: string;
  report: any;
  source: string;
  loading: boolean;
  onCopy: () => void;
}) {
  const taf = tafConcernLabel(report?.raw);
  const base = taf.segments[0];

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900/40 p-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium">{title}</div>
          <div className="mt-0.5 text-[11px] text-zinc-500">{source}</div>
        </div>
        <button className="text-xs text-zinc-400 hover:text-zinc-200" onClick={onCopy}>
          kopyala
        </button>
      </div>

      {loading ? (
        <div className="mt-3 space-y-2">
          <Line w="95%" />
          <Line w="84%" />
          <Line w="70%" />
        </div>
      ) : report ? (
        <>
          <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-950/30 p-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
              <span>Geçerlilik: {taf.validity.from} / {taf.validity.to}</span>
              <span>Segment: {taf.segments.length}</span>
            </div>
            <div className="mt-2 text-sm text-zinc-100">
              {taf.concerns.length ? taf.concerns.join(" · ") : "Belirgin kötüleşme sinyali yok."}
            </div>
            {base ? (
              <div className="mt-2 text-xs text-zinc-400">
                İlk dönem: {base.wind ? windSummary({ wind_dir: base.wind.dir, wind_spd: base.wind.spd, wind_gust: base.wind.gust }) : "rüzgar yok"} · VIS{" "}
                {base.vis ?? "—"} · {base.clouds?.length ? base.clouds.join(" ") : "bulut bilgisi sınırlı"}
              </div>
            ) : null}
          </div>

          <DetailBlock label="Ham TAF ve zaman çizelgesi">
            <div className="break-all font-mono text-sm text-zinc-200">{report.raw}</div>
            <TafTimeline raw={report.raw} />
          </DetailBlock>
        </>
      ) : (
        <div className="mt-3 text-sm text-zinc-400">TAF yok</div>
      )}
    </div>
  );
}

export default function BriefPanel() {
  const [brief, setBrief] = useState<BriefResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [alternateActionKey, setAlternateActionKey] = useState<string | null>(null);
  const [feedbackNote, setFeedbackNote] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState<string | null>(null);
  const [showAnalysisDetails, setShowAnalysisDetails] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onL = () => setLoading(true);
    const onD = () => setLoading(false);
    window.addEventListener("brief-loading", onL);
    window.addEventListener("brief-loaded", onD);
    return () => {
      window.removeEventListener("brief-loading", onL);
      window.removeEventListener("brief-loaded", onD);
    };
  }, []);

  useEffect(() => {
    const on = () => setBrief((b) => (b ? { ...b } : b));
    window.addEventListener("settings-updated", on);
    return () => window.removeEventListener("settings-updated", on);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("lastBrief");
      if (raw) setBrief(JSON.parse(raw));
    } catch {}

    const onUpdate = () => {
      try {
        const raw = localStorage.getItem("lastBrief");
        if (raw) setBrief(JSON.parse(raw));
      } catch {}
    };

    window.addEventListener("flight-route-updated", onUpdate);
    return () => window.removeEventListener("flight-route-updated", onUpdate);
  }, []);

  if (!brief && loading) {
    return (
      <div className="border-b border-zinc-800 p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded border border-zinc-700 bg-zinc-900/40 p-3">
            <div className="mb-2 h-4 w-24 animate-pulse rounded bg-zinc-800" />
            <div className="h-6 w-16 animate-pulse rounded bg-zinc-800" />
            <div className="mt-2 h-3 w-40 animate-pulse rounded bg-zinc-800" />
          </div>
          <div className="rounded border border-zinc-700 bg-zinc-900/40 p-3">
            <div className="mb-2 h-4 w-28 animate-pulse rounded bg-zinc-800" />
            <div className="h-4 w-full animate-pulse rounded bg-zinc-800" />
            <div className="mt-2 h-3 w-48 animate-pulse rounded bg-zinc-800" />
          </div>
          <div className="rounded border border-zinc-700 bg-zinc-900/40 p-3">
            <div className="mb-2 h-4 w-24 animate-pulse rounded bg-zinc-800" />
            <div className="space-y-2">
              <div className="h-3 w-3/4 animate-pulse rounded bg-zinc-800" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-zinc-800" />
            </div>
          </div>
        </div>
        <div className="mt-3 text-xs text-zinc-500">Brifing yükleniyor...</div>
      </div>
    );
  }

  if (!brief) {
    return (
      <div className="border-b border-zinc-800 p-4">
        <div className="rounded-lg border border-zinc-700 bg-zinc-900/40 p-4">
          <div className="text-sm font-semibold text-zinc-100">Brifing hazır değil</div>
          <div className="mt-1 text-sm leading-6 text-zinc-400">
            Kalkış ve varış seçip Brifing Al butonuna basınca METAR/TAF, NOTAM, risk skoru ve AI değerlendirme burada görünecek.
          </div>
        </div>
      </div>
    );
  }

  const currentBrief = brief;
  const depNotamGroups = splitNotams(brief?.notam?.dep as UiNotamItem[] | undefined);
  const arrNotamGroups = splitNotams(brief?.notam?.arr as UiNotamItem[] | undefined);

  const depNotamTotal = depNotamGroups.critical.length + depNotamGroups.normal.length;
  const arrNotamTotal = arrNotamGroups.critical.length + arrNotamGroups.normal.length;
  const totalNotams = depNotamTotal + arrNotamTotal;

  const depCriticalNotams = depNotamGroups.critical.length;
  const arrCriticalNotams = arrNotamGroups.critical.length;
  const totalCriticalNotams = depCriticalNotams + arrCriticalNotams;

  const uiReasons = [...brief.risk.reasons];
  if (
    totalCriticalNotams > 0 &&
    !uiReasons.some((r) => String(r).toLowerCase().includes("notam"))
  ) {
    uiReasons.unshift(
      `Kritik NOTAM etkisi: DEP ${depCriticalNotams}, ARR ${arrCriticalNotams}, Toplam ${totalCriticalNotams}`
    );
  }

  const metDep = brief.met?.dep?.[0];
  const metArr = brief.met?.arr?.[0];
  const tafDep = brief.taf?.dep?.[0];
  const tafArr = brief.taf?.arr?.[0];

  const depLabel = `${brief.airports.dep.icao} ${brief.airports.dep.name ?? ""}`.trim();
  const arrLabel = `${brief.airports.arr.icao} ${brief.airports.arr.name ?? ""}`.trim();
  const currentDepIcao = String(brief.airports.dep.icao || "").toUpperCase();
  const currentArrIcao = String(brief.airports.arr.icao || "").toUpperCase();

  const depRwy = brief.airports.dep.activeRunway?.id ?? "RWY ?";
  const depRwyHdg = brief.airports.dep.activeRunway?.heading;
  const provider = metSourceLabel(metDep || tafDep);
  const depMetSource = metSourceLabel(metDep);
  const arrMetSource = metSourceLabel(metArr);
  const depTafSource = metSourceLabel(tafDep);
  const arrTafSource = metSourceLabel(tafArr);

  function copy(text?: string) {
    if (!text) return;
    navigator.clipboard?.writeText(text).catch(() => {});
  }

  function showOnMap() {
    try {
      const dep = currentBrief.airports.dep.coords;
      const arr = currentBrief.airports.arr.coords;
      if (dep && arr) {
        localStorage.setItem("lastRoute", JSON.stringify({ dep, arr }));
        localStorage.setItem("lastBrief", JSON.stringify(currentBrief));
        window.dispatchEvent(new Event("flight-route-updated"));
      }
    } catch {}
  }

  function showAlternateOnMap(icao: string, reasonSummary?: string) {
    if (!icao) return;

    try {
      localStorage.setItem(
        "mapFocusAirport",
        JSON.stringify({
          icao,
          ts: Date.now(),
          source: "alternate-card",
          reason_summary: reasonSummary ?? "",
        })
      );

      localStorage.setItem("lastBrief", JSON.stringify(brief));
      navigate("/map");
    } catch {}
  }

  async function applyAlternateAs(
    next: { depIcao?: string; arrIcao?: string },
    actionKey: string
  ) {
    try {
      const currentDep = brief?.airports?.dep?.icao;
      const currentArr = brief?.airports?.arr?.icao;

      const depIcao = String(next.depIcao || currentDep || "").toUpperCase().trim();
      const arrIcao = String(next.arrIcao || currentArr || "").toUpperCase().trim();

      if (!depIcao || !arrIcao) return;
      if (depIcao === arrIcao) return;

      setAlternateActionKey(actionKey);
      window.dispatchEvent(new Event("brief-loading"));

      const nb = await fetchBrief(depIcao, arrIcao);

      localStorage.setItem("lastBrief", JSON.stringify(nb));

      const d = nb?.airports?.dep?.coords;
      const a = nb?.airports?.arr?.coords;
      if (d && a) {
        localStorage.setItem("lastRoute", JSON.stringify({ dep: d, arr: a }));
      }

      localStorage.setItem(
        "lastPair",
        JSON.stringify({
          depIcao,
          arrIcao,
          depLabel: depIcao,
          arrLabel: arrIcao,
        })
      );

      const url = new URL(window.location.href);
      url.searchParams.set("dep", depIcao);
      url.searchParams.set("arr", arrIcao);
      window.history.replaceState({}, "", `${url.pathname}${url.search}`);

      window.dispatchEvent(new Event("flight-route-updated"));
    } catch {
      //
    } finally {
      setAlternateActionKey(null);
      window.dispatchEvent(new Event("brief-loaded"));
    }
  }

  async function applyAlternateAndGoMap(
    next: { depIcao?: string; arrIcao?: string },
    actionKey: string
  ) {
    try {
      const currentDep = brief?.airports?.dep?.icao;
      const currentArr = brief?.airports?.arr?.icao;

      const depIcao = String(next.depIcao || currentDep || "").toUpperCase().trim();
      const arrIcao = String(next.arrIcao || currentArr || "").toUpperCase().trim();

      if (!depIcao || !arrIcao) return;
      if (depIcao === arrIcao) return;

      setAlternateActionKey(actionKey);
      window.dispatchEvent(new Event("brief-loading"));

      const nb = await fetchBrief(depIcao, arrIcao);

      localStorage.setItem("lastBrief", JSON.stringify(nb));

      const d = nb?.airports?.dep?.coords;
      const a = nb?.airports?.arr?.coords;
      if (d && a) {
        localStorage.setItem("lastRoute", JSON.stringify({ dep: d, arr: a }));
      }

      localStorage.setItem(
        "lastPair",
        JSON.stringify({
          depIcao,
          arrIcao,
          depLabel: depIcao,
          arrLabel: arrIcao,
        })
      );

            const focusedAltSummary =
        alternateCards.find((x) => x.icao === arrIcao)?.detail?.reason_summary ?? "";

      localStorage.setItem(
        "mapFocusAirport",
        JSON.stringify({
          icao: arrIcao,
          ts: Date.now(),
          source: "alternate-apply-map",
          reason_summary: focusedAltSummary,
        })
      );

      navigate(`/map?dep=${encodeURIComponent(depIcao)}&arr=${encodeURIComponent(arrIcao)}`);
    } catch {
      //
    } finally {
      setAlternateActionKey(null);
      window.dispatchEvent(new Event("brief-loaded"));
    }
  }

  async function downloadPdf(currentBrief?: any) {
    try {
      let dep: string | undefined = currentBrief?.airports?.dep?.icao;
      let arr: string | undefined = currentBrief?.airports?.arr?.icao;

      if (!dep || !arr) {
        const raw = localStorage.getItem("lastBrief");
        if (raw) {
          const b = JSON.parse(raw);
          dep = dep || b?.airports?.dep?.icao;
          arr = arr || b?.airports?.arr?.icao;
        }
      }
      if (!dep || !arr) return;

      const s = loadSettings();
      const base = (import.meta as any).env?.DEV ? "/api" : API_BASE;

      const url =
        `${base}/brief/pdf` +
        `?dep=${encodeURIComponent(dep)}&arr=${encodeURIComponent(arr)}` +
        `&windUnit=${encodeURIComponent(s.windUnit)}` +
        `&distUnit=${encodeURIComponent(s.distUnit)}` +
        `&tempUnit=${encodeURIComponent(s.tempUnit ?? "c")}` +
        `&crossLimit=${encodeURIComponent(String(s.crossLimit ?? ""))}` +
        `&_=${Date.now()}`;

      const r = await fetch(url);
      if (!r.ok) throw new Error(`PDF failed: ${r.status}`);

      const blob = await r.blob();
      const objUrl = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = objUrl;
      a.download = `brief_${dep}_${arr}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(() => URL.revokeObjectURL(objUrl), 0);
    } catch {}
  }

  async function submitFeedback(verdict: "correct" | "too_conservative" | "missed_risk" | "wrong_reason") {
    try {
      const feedbackBrief = brief;
      if (!feedbackBrief) return;
      setFeedbackStatus("Kaydediliyor...");
      await submitBriefFeedback({
        verdict,
        note: feedbackNote,
        brief: feedbackBrief,
      });
      setFeedbackStatus("Geri bildirim kaydedildi");
      setFeedbackNote("");
      setTimeout(() => setFeedbackStatus(null), 2500);
    } catch (e: any) {
      setFeedbackStatus(e?.message || "Geri bildirim kaydedilemedi");
    }
  }

  const s = loadSettings();
  const headDisp = convWind(brief.risk.headwind, s.windUnit);
  const crossDisp = convWind(brief.risk.crosswind, s.windUnit);

const breakdown = (brief.risk as any)?.breakdown;
const confidence = (brief.risk as any)?.confidence;
const confidenceTone = getConfidenceTone(confidence?.level);
const ml = brief.risk.ml;
const aiReport = brief.aiReport;
const weatherAssessment = ml?.weatherAssessment;
const weatherBand = weatherScoreBand(weatherAssessment?.score ?? ml?.mlScore);
const depNotamItems = (brief.notam?.dep ?? []) as UiNotamItem[];
const arrNotamItems = (brief.notam?.arr ?? []) as UiNotamItem[];
const riskBand = scoreBand(brief.risk.score);
const categorySummary = categoryRows(depNotamItems, arrNotamItems);
const presentCategories = categorySummary.filter((row) => row.depCount + row.arrCount > 0);
const missingCategories = categorySummary.filter((row) => row.depCount + row.arrCount === 0);
const prosCons = buildProsCons({
  metDep,
  metArr,
  tafDep,
  tafArr,
  depCritical: depCriticalNotams,
  arrCritical: arrCriticalNotams,
  totalCritical: totalCriticalNotams,
  risk: brief.risk,
  breakdown,
});

const primaryDriver = String((brief.risk as any)?.primary_driver ?? "").trim();
const alternateCompare = String((brief.risk as any)?.alternate_compare ?? "").trim();

const alternateDetails = Array.isArray((brief.risk as any)?.alternateDetails)
  ? ((brief.risk as any).alternateDetails as AlternateDetail[])
  : [];

const alternateCards = (brief.risk.alternates ?? []).map((label, idx) => {
  const parsed = parseAlternateLabel(label);
  const detail = alternateDetails.find((d) => d.icao === parsed.icao) ?? null;
  const tone = getAlternateCardTone(detail?.rank_score);
  const summary = parseAlternateSummary(detail?.reason_summary);

  return {
    ...parsed,
    detail,
    tone,
    summary,
    isTopPick: idx === 0,
  };
});

const primaryDriverText = formatRiskDriver(primaryDriver);
const criticalNotamReasons = criticalNotamReasonItems(depNotamItems, arrNotamItems);
const riskReportRows = buildRiskReportRows({
  metDep,
  metArr,
  tafDep,
  tafArr,
  depCritical: depCriticalNotams,
  arrCritical: arrCriticalNotams,
  totalCritical: totalCriticalNotams,
  risk: brief.risk,
  weatherAssessment,
  confidence,
  criticalNotamReasons,
});
const simpleReasons = simpleRiskReasons(riskReportRows);
const filteredSimpleReasons = criticalNotamReasons.length
  ? simpleReasons.filter((reason) => !reason.startsWith("Kritik NOTAM:"))
  : simpleReasons;
const topReasons = [
  ...criticalNotamReasons.slice(0, 4),
  ...filteredSimpleReasons,
  filteredSimpleReasons.length === 0 && criticalNotamReasons.length === 0
    ? "Belirgin operasyonel risk sinyali görünmüyor."
    : "",
]
  .filter(Boolean)
  .slice(0, 4);

const confidenceLabel =
  confidence?.level && typeof confidence?.score === "number"
    ? `${confidenceTone.label} / ${confidence.score}`
    : confidenceTone.label ?? "belirsiz";
  return (
    <div className="space-y-4 border-b border-zinc-800 pb-4">
      <div className="px-4 pt-4">
        <div className="grid grid-cols-1 gap-3">
          <div>
            <div className="text-sm text-zinc-400">Brifing</div>
            <div className="text-lg font-semibold">
              {depLabel} → {arrLabel}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-300">
              <Chip>
                Aktif Pist: {depRwy}
                {typeof depRwyHdg === "number" ? ` (${depRwyHdg}°)` : ""}
              </Chip>
              <Chip>Kaynak: {provider}</Chip>
            </div>

            <div className="mt-2 grid grid-cols-1 gap-1 text-[11px] text-zinc-500 sm:grid-cols-2">
              <div>DEP METAR: {depMetSource}</div>
              <div>ARR METAR: {arrMetSource}</div>
              <div>DEP TAF: {depTafSource}</div>
              <div>ARR TAF: {arrTafSource}</div>
            </div>
          </div>

          <div className="hidden rounded-lg border border-zinc-700 bg-zinc-900/40 p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-zinc-400">Risk Skoru</div>
              <ScorePill score={brief.risk.score} cls={brief.risk.class} />
            </div>

            {confidence ? (
              <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${confidenceTone.dot}`} />
                    <span className="text-xs font-medium text-zinc-300">Güven</span>
                  </div>

                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${confidenceTone.badge}`}>
                    {confidenceTone.label}
                    {typeof confidence?.score === "number" ? ` · ${confidence.score}` : ""}
                  </span>
                </div>

                {confidence?.summary ? (
                  <div className="mt-2 text-[11px] leading-5 text-zinc-400">
                    {confidence.summary}
                  </div>
                ) : null}

                {Array.isArray(confidence?.factors) && confidence.factors.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {confidence.factors.slice(0, 3).map((f: string, idx: number) => (
                      <span
                        key={`confidence-factor-${idx}-${f}`}
                        className="rounded-full border border-zinc-700 bg-zinc-900/50 px-2 py-0.5 text-[10px] text-zinc-300"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {primaryDriver ? (
  <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
    <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
      Ana Etken
    </div>
    <div className="mt-1 text-sm font-semibold text-zinc-100">
      {primaryDriverText}
    </div>
  </div>
) : null}

            {breakdown ? (
              <>
                <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-zinc-300">
                  <span>Hava: {breakdown.weather}</span>
                  <span>Ruzgar: {breakdown.wind}</span>
                  <span>NOTAM: {breakdown.notam}</span>
                </div>

                <div className="mt-2 h-2 w-full overflow-hidden rounded border border-zinc-700 bg-zinc-950/50">
                  <div className="flex h-full w-full">
                    <div
                      style={{ width: `${breakdown.weather}%` }}
                      className="h-full bg-emerald-500/70"
                    />
                    <div
                      style={{ width: `${breakdown.wind}%` }}
                      className="h-full bg-sky-500/70"
                    />
                    <div
                      style={{ width: `${breakdown.notam}%` }}
                      className="h-full bg-rose-500/70"
                    />
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-zinc-400">
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded bg-emerald-500" />
                    Hava
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded bg-sky-500" />
                    Ruzgar
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded bg-rose-500" />
                    NOTAM
                  </span>
                </div>
              </>
            ) : (
              <div className="mt-2 text-xs text-zinc-500">Breakdown yok</div>
            )}
          </div>
        </div>
      </div>

      <div className="px-4">
        <section className="rounded-lg border border-zinc-700 bg-zinc-900/45 p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-medium tracking-wide text-zinc-500">
                Karar Özeti
              </div>
              <div className="mt-1 text-lg font-semibold text-zinc-100">
                {riskBand.label} - {riskBand.threshold} bandı
              </div>
              <div className="mt-1 text-sm leading-6 text-zinc-400">
                Bu sonuç, uçuşu otomatik onaylamaz veya iptal etmez. Sadece hangi başlıkların tekrar kontrol edilmesi gerektiğini gösterir.
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                <span className="rounded border border-emerald-700/30 bg-emerald-500/10 px-2 py-1 text-emerald-100">
                  0-39 Düşük Risk
                </span>
                <span className="rounded border border-amber-700/30 bg-amber-500/10 px-2 py-1 text-amber-100">
                  40-69 Orta Risk
                </span>
                <span className="rounded border border-rose-700/30 bg-rose-500/10 px-2 py-1 text-rose-100">
                  70-100 Yüksek Risk
                </span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              {/* Dairesel Risk Gauge */}
              <div className="relative flex h-20 w-20 items-center justify-center">
                <div
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: `conic-gradient(
                      ${brief.risk.score >= 70 ? '#f43f5e' : brief.risk.score >= 40 ? '#f59e0b' : '#10b981'} 0deg,
                      ${brief.risk.score >= 70 ? '#f43f5e' : brief.risk.score >= 40 ? '#f59e0b' : '#10b981'} ${brief.risk.score * 3.6}deg,
                      rgba(63, 63, 70, 0.3) ${brief.risk.score * 3.6}deg,
                      rgba(63, 63, 70, 0.3) 360deg
                    )`,
                    transition: 'background 0.6s ease-out',
                  }}
                />
                <div className="absolute inset-[5px] rounded-full bg-zinc-900 flex items-center justify-center">
                  <div className="text-center">
                    <div className={`text-xl font-bold ${brief.risk.score >= 70 ? 'text-rose-300' : brief.risk.score >= 40 ? 'text-amber-300' : 'text-emerald-300'}`}>
                      {brief.risk.score}
                    </div>
                    <div className="text-[9px] text-zinc-500">/100</div>
                  </div>
                </div>
              </div>
              <span className={`rounded-full border px-2 py-0.5 text-[11px] ${confidenceTone.badge}`}>
                Güven: {confidenceLabel}
              </span>
            </div>
          </div>

          <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-950/35 p-3">
            <div className="text-[11px] font-medium tracking-wide text-zinc-500">Basit gerekçe</div>
            <ul className="mt-2 space-y-1 text-sm leading-6 text-zinc-200">
              {(topReasons.length ? topReasons : ["Belirgin risk gerekçesi yok."]).map((item, idx) => (
                <li key={`top-reason-${idx}-${item}`}>- {item}</li>
              ))}
            </ul>
          </div>

          <div className="mt-3 overflow-hidden rounded-md border border-zinc-800 bg-zinc-950/35">
            <div className="border-b border-zinc-800 px-3 py-2">
              <div className="text-sm font-semibold text-zinc-100">Uçuş Risk Raporu</div>
              <div className="mt-0.5 text-[11px] text-zinc-500">
                Sorun çıkarabilecek parametreler kırmızı veya sarı görünür.
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="border-b border-zinc-800 text-zinc-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Parametre</th>
                    <th className="px-3 py-2 font-medium">Durum</th>
                    <th className="px-3 py-2 font-medium">Değer</th>
                    <th className="px-3 py-2 font-medium">Basit açıklama</th>
                  </tr>
                </thead>
                <tbody>
                  {riskReportRows.map((row) => (
                    <tr key={row.parameter} className="border-b border-zinc-900 last:border-0">
                      <td className="px-3 py-2 font-medium text-zinc-100">{row.parameter}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] ${riskReportTone(row.status)}`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-zinc-200">{row.value}</td>
                      <td className="px-3 py-2 text-zinc-300">{row.simple}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* AI Rapor Özeti — her zaman görünür */}
          {aiReport?.summary ? (
            <div className="mt-3 rounded-lg border border-sky-700/25 bg-sky-500/[0.06] p-3">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-sky-300/80">
                  AI Değerlendirme Özeti
                </span>
                {ml?.modelVersion ? (
                  <span className="rounded-full border border-sky-600/30 bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-200">
                    {ml.modelVersion}
                  </span>
                ) : null}
              </div>
              <div className="text-sm leading-6 text-zinc-100">{aiReport.summary}</div>
              {aiReport?.riskInterpretation ? (
                <div className="mt-2 text-sm leading-6 text-zinc-300">{aiReport.riskInterpretation}</div>
              ) : null}
              {Array.isArray(aiReport?.weatherConcerns) && aiReport.weatherConcerns.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {aiReport.weatherConcerns.slice(0, 3).map((concern, idx) => (
                    <span
                      key={`weather-concern-${idx}`}
                      className="rounded-full border border-amber-600/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-100"
                    >
                      {concern}
                    </span>
                  ))}
                </div>
              ) : null}
              {Array.isArray(aiReport?.notamImpacts) && aiReport.notamImpacts.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {aiReport.notamImpacts.slice(0, 4).map((impact, idx) => (
                    <span
                      key={`notam-impact-${idx}`}
                      className="rounded-full border border-rose-600/30 bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-100"
                    >
                      {impact}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="mt-2 text-[10px] text-zinc-500">
                Karar destek amaçlıdır; operasyonel otorite yerine geçmez.
              </div>
            </div>
          ) : null}

          <div className="mt-3 flex justify-end">
            <button
              onClick={() => setShowAnalysisDetails((v) => !v)}
              className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800"
            >
              {showAnalysisDetails ? "Detayları gizle" : "Model, NOTAM ve geri bildirimi göster"}
            </button>
          </div>
        </section>
      </div>

      {showAnalysisDetails ? (
        <>
      <div className="px-4">
        <section className="rounded-lg border border-zinc-700 bg-zinc-900/40 p-3">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-medium">Risk Kategorizasyonu</div>
              <div className="mt-1 text-xs leading-5 text-zinc-400">
                Skor karar destek göstergesidir; operasyonel onay veya emniyet garantisi değildir.
              </div>
            </div>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${riskBand.tone}`}>
              {brief.risk.score}/100 · {riskBand.label}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1fr_320px]">
            <div className="rounded-md border border-zinc-800 bg-zinc-950/30 p-3">
              <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Nasil okunur?</div>
              <div className="mt-2 text-sm leading-6 text-zinc-200">{riskBand.meaning}</div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                <div className="rounded border border-emerald-700/30 bg-emerald-500/10 p-2 text-emerald-100">0-39 Düşük Risk</div>
                <div className="rounded border border-amber-700/30 bg-amber-500/10 p-2 text-amber-100">40-69 Orta Risk</div>
                <div className="rounded border border-rose-700/30 bg-rose-500/10 p-2 text-rose-100">70-100 Yüksek Risk</div>
              </div>
            </div>

            <div className="rounded-md border border-zinc-800 bg-zinc-950/30 p-3">
              <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Skor formulu</div>
              {ml ? (
                <div className="mt-2 space-y-1 text-sm leading-6 text-zinc-200">
                  <div>Final = %65 ML + %25 kural + %10 NOTAM anlamsal skor</div>
                  <div>
                    Mevcut: ML {ml.mlScore}, kural {ml.ruleScore}, NOTAM {ml.notamSemanticScore}, final {ml.finalScore}
                  </div>
                  <div className="text-xs text-zinc-500">
                    NOTAM semantic skoru, DEP/ARR NOTAM etkilerinin en yüksek operasyonel etkisini ve kritik yoğunluğu temsil eder.
                  </div>
                </div>
              ) : (
                <div className="mt-2 text-sm leading-6 text-zinc-200">
                  AI servisi yoksa skor kural tabanlı fallback ile gösterilir.
                </div>
              )}
            </div>

            <div className="rounded-md border border-zinc-800 bg-zinc-950/30 p-3">
              <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Temel sinirlar</div>
              <div className="mt-2 text-sm leading-6 text-zinc-200">
                DEP NOTAM kalkış meydanını, ARR NOTAM varış meydanını etkiler. Yüksek skor tek başına uçuş iptali kararı değildir; pilot, dispatcher ve resmi kaynak doğrulaması gerekir.
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-md border border-emerald-700/30 bg-emerald-500/[0.05] p-3">
              <div className="text-[11px] font-medium uppercase tracking-wide text-emerald-300/80">Olumlu noktalar</div>
              <ul className="mt-2 space-y-1 text-sm leading-6 text-zinc-200">
                {prosCons.pros.map((item, idx) => (
                  <li key={`pro-${idx}-${item}`}>+ {item}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-md border border-amber-700/30 bg-amber-500/[0.05] p-3">
              <div className="text-[11px] font-medium uppercase tracking-wide text-amber-300/80">Dikkat edilecekler</div>
              <ul className="mt-2 space-y-1 text-sm leading-6 text-zinc-200">
                {prosCons.cons.map((item, idx) => (
                  <li key={`con-${idx}-${item}`}>- {item}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </div>

      {(aiReport || ml) && (
        <div className="px-4">
          <section className="rounded-lg border border-sky-700/30 bg-sky-500/[0.06] p-3">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-medium text-sky-100">AI Değerlendirme</div>
                <div className="mt-1 text-xs leading-5 text-sky-200/80">
                  Karar destek amaçlıdır; operasyonel otorite yerine geçmez.
                </div>
              </div>

              {ml ? (
                <span className="rounded-full border border-sky-600/40 bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-100">
                  {ml.modelVersion ?? "AI model"}
                </span>
              ) : null}
            </div>

            {ml ? (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <div className="rounded-md border border-zinc-700 bg-zinc-950/40 p-2">
                  <div className="text-[10px] uppercase tracking-wide text-zinc-500">ML</div>
                  <div className="mt-1 text-lg font-semibold text-zinc-100">{ml.mlScore}</div>
                </div>
                <div className="rounded-md border border-zinc-700 bg-zinc-950/40 p-2">
                  <div className="text-[10px] uppercase tracking-wide text-zinc-500">Kural</div>
                  <div className="mt-1 text-lg font-semibold text-zinc-100">{ml.ruleScore}</div>
                </div>
                <div className="rounded-md border border-zinc-700 bg-zinc-950/40 p-2">
                  <div className="text-[10px] uppercase tracking-wide text-zinc-500">NOTAM</div>
                  <div className="mt-1 text-lg font-semibold text-zinc-100">{ml.notamSemanticScore}</div>
                </div>
                <div className="rounded-md border border-sky-700/40 bg-sky-500/10 p-2">
                  <div className="text-[10px] uppercase tracking-wide text-sky-300/80">Final</div>
                  <div className="mt-1 text-lg font-semibold text-sky-100">{ml.finalScore}</div>
                </div>
              </div>
            ) : null}

            {weatherAssessment ? (
              <div className="mt-3 rounded-md border border-zinc-700 bg-zinc-950/40 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                      METAR Hava Karari
                    </div>
                    <div className="mt-1 text-xs leading-5 text-zinc-400">
                      Hava skoru; egitilmis METAR modeli ile gorus, RVR, tavan, ruzgar ve hadise icin deterministik emniyet tabaninin birlesimidir.
                    </div>
                  </div>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${weatherBand.tone}`}>
                    {weatherAssessment.score}/100 - {weatherBand.label}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  <div className="rounded border border-zinc-800 bg-zinc-900/50 p-2">
                    <div className="text-[10px] uppercase tracking-wide text-zinc-500">Egitilmis model</div>
                    <div className="mt-1 text-sm font-semibold text-zinc-100">
                      {weatherAssessment.trainedScore ?? "-"}
                    </div>
                  </div>
                  <div className="rounded border border-zinc-800 bg-zinc-900/50 p-2">
                    <div className="text-[10px] uppercase tracking-wide text-zinc-500">Kural/heuristik</div>
                    <div className="mt-1 text-sm font-semibold text-zinc-100">
                      {weatherAssessment.heuristicScore ?? "-"}
                    </div>
                  </div>
                  <div className="rounded border border-zinc-800 bg-zinc-900/50 p-2">
                    <div className="text-[10px] uppercase tracking-wide text-zinc-500">Emniyet tabani</div>
                    <div className="mt-1 text-sm font-semibold text-zinc-100">
                      {weatherAssessment.floorScore ?? 0}
                    </div>
                  </div>
                  <div className="rounded border border-zinc-800 bg-zinc-900/50 p-2">
                    <div className="text-[10px] uppercase tracking-wide text-zinc-500">Uygulandi mi?</div>
                    <div className="mt-1 text-sm font-semibold text-zinc-100">
                      {weatherAssessment.floorApplied ? "Evet" : "Hayir"}
                    </div>
                  </div>
                </div>

                {Array.isArray(weatherAssessment.floorReasons) && weatherAssessment.floorReasons.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {weatherAssessment.floorReasons.map((reason, idx) => (
                      <span
                        key={`floor-reason-${idx}-${reason}`}
                        className="rounded-full border border-amber-600/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-100"
                      >
                        {translateBriefText(reason)}
                      </span>
                    ))}
                  </div>
                ) : null}

                {Array.isArray(weatherAssessment.categories) && weatherAssessment.categories.length > 0 ? (
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {weatherAssessment.categories.map((item) => (
                      <div
                        key={item.key}
                        className={`rounded border px-2 py-2 ${weatherCategoryTone(item.status)}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-wide">
                            {trCategory(item.label)}
                          </span>
                          <span className="text-[10px] uppercase">{trStatus(item.status)}</span>
                        </div>
                        <div className="mt-1 text-xs leading-5">{translateBriefText(item.detail)}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {aiReport?.summary ? (
              <div className="mt-3 rounded-md border border-zinc-700 bg-zinc-950/40 p-3 text-sm leading-6 text-zinc-100">
                {aiReport.summary}
              </div>
            ) : null}

            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              {aiReport?.riskInterpretation ? (
                <div className="rounded-md border border-zinc-700 bg-zinc-950/30 p-3">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                    Risk Yorumu
                  </div>
                  <div className="mt-1 text-sm leading-6 text-zinc-200">
                    {aiReport.riskInterpretation}
                  </div>
                </div>
              ) : null}

              {aiReport?.limitedAdjustment || ml?.limitedAdjustment?.reason ? (
                <div className="rounded-md border border-zinc-700 bg-zinc-950/30 p-3">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                    Sınırlı Düzeltme
                  </div>
                  <div className="mt-1 text-sm leading-6 text-zinc-200">
                    {aiReport?.limitedAdjustment ?? ml?.limitedAdjustment?.reason}
                  </div>
                </div>
              ) : null}
            </div>

            {Array.isArray(aiReport?.notamImpacts) && aiReport.notamImpacts.length > 0 ? (
              <div className="mt-3">
                <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                  AI NOTAM Etkileri
                </div>
                <div className="flex flex-wrap gap-2">
                  {aiReport.notamImpacts.slice(0, 4).map((impact, idx) => (
                    <span
                      key={`ai-notam-impact-${idx}-${impact}`}
                      className="rounded-full border border-rose-600/30 bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-100"
                    >
                      {impact}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        </div>
      )}

      <div className="px-4">
        <section className="rounded-lg border border-zinc-700 bg-zinc-900/40 p-3">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-medium">Brifing Geri Bildirimi</div>
              <div className="mt-1 text-xs leading-5 text-zinc-400">
                Bu alan gelecek kalibrasyon icin yerel manuel etiket olusturur; mevcut skoru degistirmez.
              </div>
            </div>
            {feedbackStatus ? (
              <span className="rounded-full border border-zinc-700 bg-zinc-950 px-2 py-0.5 text-[11px] text-zinc-300">
                {feedbackStatus}
              </span>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <button
              onClick={() => submitFeedback("correct")}
              className="rounded-md border border-emerald-700/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100 hover:bg-emerald-500/15"
            >
              Dogru
            </button>
            <button
              onClick={() => submitFeedback("too_conservative")}
              className="rounded-md border border-amber-700/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100 hover:bg-amber-500/15"
            >
              Fazla temkinli
            </button>
            <button
              onClick={() => submitFeedback("missed_risk")}
              className="rounded-md border border-rose-700/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100 hover:bg-rose-500/15"
            >
              Riski kacirdi
            </button>
            <button
              onClick={() => submitFeedback("wrong_reason")}
              className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
            >
              Gerekce yanlis
            </button>
          </div>

          <textarea
            value={feedbackNote}
            onChange={(e) => setFeedbackNote(e.target.value)}
            placeholder="Gelecek model incelemesi icin opsiyonel not"
            className="mt-3 min-h-20 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-sky-600"
          />
        </section>
      </div>

      <div className="px-4">
        <section className="rounded-lg border border-zinc-700 bg-zinc-900/40 p-3">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="font-medium">NOTAM</div>
              <div className="mt-1 text-[11px] text-amber-200/80">
                NOTAM_PROVIDER=simulated iken bu alan demo/test amaçlı sentetik NOTAM gösterir.
              </div>
              <div className="text-xs text-zinc-400">
                DEP {brief.airports.dep.icao} / ARR {brief.airports.arr.icao} · Toplam {totalNotams}
              </div>
            </div>
            <Chip>Kritik: {totalCriticalNotams}</Chip>
          </div>

          <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_320px]">
            <div className="rounded-md border border-zinc-800 bg-zinc-950/30 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Bulunan NOTAM kategorileri</div>
                <span className="text-[11px] text-zinc-500">
                  DEP = kalkış meydanı, ARR = varış meydanı
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {(presentCategories.length ? presentCategories : categorySummary.slice(0, 1)).map((row) => (
                  <div key={row.key} className="rounded border border-zinc-800 bg-zinc-900/50 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium text-zinc-100">{row.label}</div>
                      <span className="text-[11px] text-zinc-400">en yüksek etki {row.maxScore}/100</span>
                    </div>
                    <div className="mt-1 text-[11px] leading-5 text-zinc-400">{row.meaning}</div>
                    <div className="mt-2 flex gap-2 text-[11px]">
                      <span className="rounded-full border border-zinc-700 bg-zinc-950/60 px-2 py-0.5 text-zinc-300">
                        DEP {row.depCount}
                      </span>
                      <span className="rounded-full border border-zinc-700 bg-zinc-950/60 px-2 py-0.5 text-zinc-300">
                        ARR {row.arrCount}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-md border border-zinc-800 bg-zinc-950/30 p-3">
              <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Bulunmayan kategoriler</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {missingCategories.slice(0, 7).map((row) => (
                  <span
                    key={row.key}
                    className="rounded-full border border-zinc-700 bg-zinc-900/70 px-2 py-0.5 text-[11px] text-zinc-300"
                  >
                    {row.label}
                  </span>
                ))}
              </div>
              <div className="mt-3 text-xs leading-5 text-zinc-500">
                Bu liste canlı resmi NOTAM yerine mevcut provider çıktısına göre oluşturulur. Simulated modda demo/test verisidir.
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-md border border-zinc-700 bg-zinc-950/30 p-3">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-zinc-100">DEP NOTAM</div>
                  <div className="text-xs text-zinc-400">Toplam: {depNotamTotal}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-rose-600/40 bg-rose-500/15 px-2 py-0.5 text-[11px] text-rose-200">
                    Kritik: {depNotamGroups.critical.length}
                  </span>
                  <span className="rounded-full border border-zinc-700 bg-zinc-800/70 px-2 py-0.5 text-[11px] text-zinc-300">
                    Normal: {depNotamGroups.normal.length}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                {depNotamTotal === 0 && (
                  <div className="rounded-md border border-zinc-700 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-400">
                    NOTAM yok.
                  </div>
                )}

                {depNotamGroups.critical.map((n, idx) => (
                  <NotamCard key={`dep-critical-${idx}-${n.id || n.event?.key || "notam"}`} item={n} tone="critical" />
                ))}

                {depNotamGroups.normal.map((n, idx) => (
                  <NotamCard key={`dep-normal-${idx}-${n.id || n.event?.key || "notam"}`} item={n} tone="normal" />
                ))}
              </div>
            </div>

            <div className="rounded-md border border-zinc-700 bg-zinc-950/30 p-3">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-zinc-100">ARR NOTAM</div>
                  <div className="text-xs text-zinc-400">Toplam: {arrNotamTotal}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-rose-600/40 bg-rose-500/15 px-2 py-0.5 text-[11px] text-rose-200">
                    Kritik: {arrNotamGroups.critical.length}
                  </span>
                  <span className="rounded-full border border-zinc-700 bg-zinc-800/70 px-2 py-0.5 text-[11px] text-zinc-300">
                    Normal: {arrNotamGroups.normal.length}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                {arrNotamTotal === 0 && (
                  <div className="rounded-md border border-zinc-700 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-400">
                    NOTAM yok.
                  </div>
                )}

                {arrNotamGroups.critical.map((n, idx) => (
                  <NotamCard key={`arr-critical-${idx}-${n.id || n.event?.key || "notam"}`} item={n} tone="critical" />
                ))}

                {arrNotamGroups.normal.map((n, idx) => (
                  <NotamCard key={`arr-normal-${idx}-${n.id || n.event?.key || "notam"}`} item={n} tone="normal" />
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
        </>
      ) : null}

      <details className="px-4">
        <summary className="cursor-pointer rounded-md border border-zinc-700 bg-zinc-900/50 px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800/70">
          METAR / TAF detaylarını göster
        </summary>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <MetSummaryCard
          title="DEP METAR"
          report={metDep}
          source={depMetSource}
          loading={loading}
          onCopy={() => copy(metDep?.raw)}
        />
        <MetSummaryCard
          title="ARR METAR"
          report={metArr}
          source={arrMetSource}
          loading={loading}
          onCopy={() => copy(metArr?.raw)}
        />
        <TafSummaryCard
          title="DEP TAF"
          report={tafDep}
          source={depTafSource}
          loading={loading}
          onCopy={() => copy(tafDep?.raw)}
        />
        <TafSummaryCard
          title="ARR TAF"
          report={tafArr}
          source={arrTafSource}
          loading={loading}
          onCopy={() => copy(tafArr?.raw)}
        />
        </div>
      </details>

      <details className="hidden">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-zinc-300 hover:text-zinc-100">
          Ham METAR / TAF detayları
        </summary>
        <div className="grid grid-cols-1 gap-3 border-t border-zinc-800 p-3 md:grid-cols-2">
        <div className="rounded-lg border border-zinc-700 bg-zinc-900/40 p-3">
          <div className="flex items-center justify-between">
            <div className="font-medium">DEP METAR</div>
            <button className="text-xs text-zinc-400 hover:text-zinc-200" onClick={() => copy(metDep?.raw)}>
              kopyala
            </button>
          </div>

          {loading ? (
            <div className="mt-2 space-y-2">
              <Line w="90%" />
              <Line w="70%" />
            </div>
          ) : metDep ? (
            <div className="mt-2 space-y-1 text-sm">
              <div className="break-all font-mono text-zinc-200">{metDep.raw}</div>
              <div className="mt-1 text-xs text-zinc-400">
                WDIR {metDep.parsed?.wind_dir ?? "—"}°, WSPD {metDep.parsed?.wind_spd ?? "—"} kt, VIS{" "}
                {metDep.parsed?.vis ?? "—"} m, CIG {metDep.parsed?.ceiling ?? "—"} ft
              </div>
              <div className="text-xs text-zinc-500">kaynak: {depMetSource}</div>
            </div>
          ) : (
            <div className="text-sm text-zinc-400">METAR yok</div>
          )}
        </div>

        <div className="rounded-lg border border-zinc-700 bg-zinc-900/40 p-3">
          <div className="flex items-center justify-between">
            <div className="font-medium">ARR METAR</div>
            <button className="text-xs text-zinc-400 hover:text-zinc-200" onClick={() => copy(metArr?.raw)}>
              kopyala
            </button>
          </div>

          {loading ? (
            <div className="mt-2 space-y-2">
              <Line w="92%" />
              <Line w="65%" />
            </div>
          ) : metArr ? (
            <div className="mt-2 space-y-1 text-sm">
              <div className="break-all font-mono text-zinc-200">{metArr.raw}</div>
              <div className="text-xs text-zinc-500">kaynak: {arrMetSource}</div>
            </div>
          ) : (
            <div className="text-sm text-zinc-400">METAR yok</div>
          )}
        </div>

        <div className="rounded-lg border border-zinc-700 bg-zinc-900/40 p-3">
          <div className="flex items-center justify-between">
            <div className="font-medium">DEP TAF</div>
            <button className="text-xs text-zinc-400 hover:text-zinc-200" onClick={() => copy(tafDep?.raw)}>
              kopyala
            </button>
          </div>

          {loading ? (
            <div className="mt-2 space-y-2">
              <Line w="95%" />
              <Line w="88%" />
              <Line w="76%" />
            </div>
          ) : tafDep ? (
            <>
              <div className="mt-2 break-all font-mono text-sm text-zinc-200">{tafDep.raw}</div>
              <div className="mt-1 text-xs text-zinc-500">kaynak: {depTafSource}</div>
              <TafTimeline raw={tafDep.raw} />
            </>
          ) : (
            <div className="text-sm text-zinc-400">TAF yok</div>
          )}
        </div>

        <div className="rounded-lg border border-zinc-700 bg-zinc-900/40 p-3">
          <div className="flex items-center justify-between">
            <div className="font-medium">ARR TAF</div>
            <button className="text-xs text-zinc-400 hover:text-zinc-200" onClick={() => copy(tafArr?.raw)}>
              kopyala
            </button>
          </div>

          {loading ? (
            <div className="mt-2 space-y-2">
              <Line w="95%" />
              <Line w="84%" />
              <Line w="70%" />
            </div>
          ) : tafArr ? (
            <>
              <div className="mt-2 break-all font-mono text-sm text-zinc-200">{tafArr.raw}</div>
              <div className="mt-1 text-xs text-zinc-500">kaynak: {arrTafSource}</div>
              <TafTimeline raw={tafArr.raw} />
            </>
          ) : (
            <div className="text-sm text-zinc-400">TAF yok</div>
          )}
        </div>
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-2 px-4">
        <Chip>
          Karşı rüzgar: {headDisp.val} {headDisp.unit}
        </Chip>
        <Chip>
          Yan rüzgar: {crossDisp.val} {crossDisp.unit}
        </Chip>
        <button
          onClick={showOnMap}
          className="ml-auto rounded-md border border-sky-600/50 bg-sky-500/10 px-3 py-1.5 text-sm text-sky-200 hover:bg-sky-500/20"
        >
          Haritada Göster
        </button>
        <button
          onClick={() => downloadPdf(brief)}
          className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800/50"
        >
          PDF İndir
        </button>
      </div>

      <div className="px-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <div className="text-sm font-semibold">Gerekçeler</div>

          {totalCriticalNotams > 0 && (
            <>
              <span className="rounded-full border border-rose-600/40 bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-200">
                Kritik NOTAM: {totalCriticalNotams}
              </span>
              <span className="rounded-full border border-zinc-700 bg-zinc-800/70 px-2 py-0.5 text-[11px] text-zinc-300">
                DEP {depCriticalNotams} / ARR {arrCriticalNotams}
              </span>
            </>
          )}
        </div>

        {topReasons.length === 0 ? (
          <div className="text-xs text-zinc-400">—</div>
        ) : (
          <ul className="space-y-2 text-sm text-zinc-200">
            {topReasons.map((r, i) => {
              const isNotamReason = String(r).toLowerCase().includes("notam");
              return (
                <li
                  key={i}
                  className={`rounded-md border px-3 py-2 ${
                    isNotamReason
                      ? "border-rose-600/25 bg-rose-500/10 text-rose-100"
                      : "border-zinc-700 bg-zinc-900/40"
                  }`}
                >
                  {r}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <details className="px-4 pb-2">
        <summary className="cursor-pointer rounded-md border border-zinc-700 bg-zinc-900/50 px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800/70">
          Alternate önerilerini göster
        </summary>
        <div className="mt-3">
  <div className="mb-2 flex items-center justify-between">
    <div className="text-sm font-semibold">Alternate Önerileri</div>
    <div className="text-xs text-zinc-500">
      {alternateCards.length > 0 ? `${alternateCards.length} öneri` : "öneri yok"}
    </div>
  </div>

  {alternateCompare ? (
    <div className="mb-3 rounded-lg border border-sky-700/20 bg-sky-500/[0.06] p-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-sky-300/80">
        Karşılaştırma
      </div>
      <div className="mt-1 text-sm leading-6 text-zinc-200">{alternateCompare}</div>
    </div>
  ) : null}

  {alternateCards.length === 0 ? (
    <div className="text-xs text-zinc-400">—</div>
  ) : (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {alternateCards.map((alt, i) => {
        const depDisabled = alt.icao === currentDepIcao;
        const arrDisabled = alt.icao === currentArrIcao;
        const depLoading = alternateActionKey === `${alt.icao}:dep`;
        const arrLoading = alternateActionKey === `${alt.icao}:arr`;
        const applyMapLoading = alternateActionKey === `${alt.icao}:apply-map`;
        const tone = getAlternateCardTone(alt.detail?.rank_score);
        const riskIndicator = getAlternateRiskIndicator(alt.detail?.rank_score);
        const isTopPick = i === 0;

        return (
          <div key={`${alt.icao}-${i}`} className={`rounded-lg border p-3 ${tone.card}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <div className="text-base font-semibold text-zinc-100">{alt.icao}</div>

                  {isTopPick && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 text-[10px] font-semibold text-yellow-200">
                      ★ En iyi öneri
                    </span>
                  )}
                </div>

                <div className="text-xs text-zinc-400">{alt.distanceBand}</div>

                {alt.detail?.name && (
                  <div className="truncate text-[11px] text-zinc-500">{alt.detail.name}</div>
                )}
              </div>

              <div className="flex flex-col items-end gap-2">
                <span className="rounded-full border border-sky-600/30 bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-200">
                  {typeof alt.distanceKm === "number" ? `${alt.distanceKm} km` : "Mesafe —"}
                </span>

                <span className={`rounded-full border px-2 py-0.5 text-[11px] ${tone.badge}`}>
                  {tone.label}
                  {typeof alt.detail?.rank_score === "number" ? ` · ${alt.detail.rank_score}` : ""}
                </span>

                <span className={`rounded-full border px-2 py-0.5 text-[11px] ${riskIndicator.cls}`}>
                  {riskIndicator.icon} {riskIndicator.label}
                </span>
              </div>
            </div>

            <div className="mt-3 h-px bg-zinc-800" />

            {Array.isArray(alt.detail?.badges) && alt.detail.badges.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {alt.detail.badges.map((badge, bi) => (
                  <span
                    key={`${alt.icao}-badge-${bi}`}
                    className="rounded-full border border-zinc-700 bg-zinc-800/80 px-2 py-0.5 text-[10px] text-zinc-200"
                  >
                    {badge}
                  </span>
                ))}
              </div>
            )}

            {alt.detail?.weather_label || alt.detail?.ceiling_label || alt.detail?.visibility_label ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {alt.detail?.weather_label ? (
                  <span className="rounded-full border border-sky-700/30 bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-200">
                    {alt.detail.weather_label}
                  </span>
                ) : null}

                {alt.detail?.ceiling_label ? (
                  <span className="rounded-full border border-zinc-700 bg-zinc-800/80 px-2 py-0.5 text-[10px] text-zinc-200">
                    {alt.detail.ceiling_label}
                  </span>
                ) : null}

                {alt.detail?.visibility_label ? (
                  <span className="rounded-full border border-zinc-700 bg-zinc-800/80 px-2 py-0.5 text-[10px] text-zinc-200">
                    {alt.detail.visibility_label}
                  </span>
                ) : null}
              </div>
            ) : null}

            {alt.summary && (
              <div
                className={`mt-3 rounded-md border px-3 py-2 ${getAlternateSummaryTone(alt.summary.tone).box}`}
              >
                <div className="mb-2">
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                      getAlternateSummaryTone(alt.summary.tone).badge
                    }`}
                  >
                    {alt.summary.badge}
                  </span>
                </div>

                <div className="text-[11px] leading-5 text-zinc-300">{alt.summary.body}</div>
              </div>
            )}

            <div className="mt-3 space-y-2 text-sm text-zinc-300">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Uygunluk</span>
                <span className="text-zinc-200">
                  {typeof alt.distanceKm === "number"
                    ? alt.distanceKm <= 120
                      ? "İyi"
                      : alt.distanceKm <= 200
                      ? "Orta"
                      : "Sınırda"
                    : "Bilinmiyor"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Pist</span>
                <span className="text-zinc-200">
                  {typeof alt.detail?.best_rwy_m === "number" ? `${alt.detail.best_rwy_m} m` : "—"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Kritik NOTAM</span>
                <span className="text-zinc-200">
                  {typeof alt.detail?.critical_notams === "number" ? alt.detail.critical_notams : "—"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Yan rüzgar</span>
                <span className="text-zinc-200">
                  {typeof alt.detail?.crosswind_abs === "number" ? `${alt.detail.crosswind_abs} kt` : "—"}
                </span>
              </div>
            </div>

            <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-950/40 px-2 py-2 text-xs text-zinc-400">
              {alt.raw}
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2">
              <button
                onClick={() => showAlternateOnMap(alt.icao, alt.detail?.reason_summary)}
                className="w-full rounded-md border border-sky-600/40 bg-sky-500/10 px-3 py-2 text-sm text-sky-200 hover:bg-sky-500/20"
              >
                Haritada Göster
              </button>

              <button
                onClick={() =>
                  applyAlternateAndGoMap({ arrIcao: alt.icao }, `${alt.icao}:apply-map`)
                }
                disabled={arrDisabled || depLoading || arrLoading || applyMapLoading}
                className={`w-full rounded-md border px-3 py-2 text-sm ${
                  arrDisabled
                    ? "cursor-not-allowed border-zinc-700 bg-zinc-900/50 text-zinc-500"
                    : applyMapLoading
                    ? "cursor-wait border-fuchsia-600/40 bg-fuchsia-500/20 text-fuchsia-100"
                    : "border-fuchsia-600/40 bg-fuchsia-500/10 text-fuchsia-200 hover:bg-fuchsia-500/20"
                }`}
              >
                {arrDisabled
                  ? "Zaten ARR"
                  : applyMapLoading
                  ? "Uygulanıyor..."
                  : "Uygula + Haritaya Git"}
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => applyAlternateAs({ depIcao: alt.icao }, `${alt.icao}:dep`)}
                  disabled={depDisabled || depLoading || arrLoading || applyMapLoading}
                  className={`rounded-md border px-3 py-2 text-sm ${
                    depDisabled
                      ? "cursor-not-allowed border-zinc-700 bg-zinc-900/50 text-zinc-500"
                      : depLoading
                      ? "cursor-wait border-emerald-600/40 bg-emerald-500/20 text-emerald-100"
                      : "border-emerald-600/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
                  }`}
                >
                  {depDisabled ? "Mevcut DEP" : depLoading ? "Yükleniyor..." : "DEP yap"}
                </button>

                <button
                  onClick={() => applyAlternateAs({ arrIcao: alt.icao }, `${alt.icao}:arr`)}
                  disabled={arrDisabled || depLoading || arrLoading || applyMapLoading}
                  className={`rounded-md border px-3 py-2 text-sm ${
                    arrDisabled
                      ? "cursor-not-allowed border-zinc-700 bg-zinc-900/50 text-zinc-500"
                      : arrLoading
                      ? "cursor-wait border-amber-600/40 bg-amber-500/20 text-amber-100"
                      : "border-amber-600/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20"
                  }`}
                >
                  {arrDisabled ? "Mevcut ARR" : arrLoading ? "Yükleniyor..." : "ARR yap"}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  )}
        </div>
      </details>
    </div>
  );
}
