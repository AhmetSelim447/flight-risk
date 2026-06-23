export function parseNotamToTurkish(raw: string): string {
  const t = raw.toUpperCase().trim();
  const parts: string[] = [];

  // Pist bilgisi
  const rwyMatch = t.match(/RWY\s*(\d{2}[LRC]?(?:\/\d{2}[LRC]?)?)/);
  const rwy = rwyMatch ? `Pist ${rwyMatch[1]}` : "";

  // ILS arızası
  if (/ILS\s.*U\/S|ILS\s.*OUT OF SERVICE|ILS\s.*UNSERVICEABLE/.test(t)) {
    const ilsType = t.match(/ILS\s+(GP|LOC|DME|IAEG|CAT\s*\w+)?/)?.[1] || "";
    let ilsLabel = "Aletli İniş Sistemi (ILS)";
    if (ilsType.includes("GP")) {
      ilsLabel = "ILS Dikey Süzülüş Hattı vericisi (Glide Path - uçağın dikey iniş açısını sağlayan cihaz)";
    } else if (ilsType.includes("LOC")) {
      ilsLabel = "ILS Yatay İstikamet vericisi (Localizer - uçağın pist merkez hattına hizalanmasını sağlayan cihaz)";
    } else if (ilsType.includes("DME")) {
      ilsLabel = "ILS Mesafe Ölçüm Cihazı (DME)";
    } else if (ilsType.includes("IAEG")) {
      ilsLabel = "ILS IAEG bileşeni";
    }

    const dueMatch = t.match(/DUE\s+TO\s+(\w+)/);
    const reason = dueMatch ? ` (${dueMatch[1] === "FLTCK" ? "uçuş kontrol testi nedeniyle" : dueMatch[1].toLowerCase()})` : "";
    parts.push(`${rwy ? rwy + " için " : ""}${ilsLabel} çalışmıyor (hizmet dışı)${reason}`);
  }
  // GNSS girişimi
  else if (/GNSS\s*(INTERFERENCE|JAMMING|UNRELIABLE)/.test(t)) {
    parts.push("GNSS (Uydu seyrüsefer sinyali) bozma/karıştırma veya güvenilmezlik uyarısı — RNAV/RNP hassas iniş prosedürleri etkilenebilir");
  }
  // PAPI arızası
  else if (/PAPI\s.*U\/S|PAPI\s.*OUT OF SERVICE/.test(t)) {
    parts.push(`${rwy ? rwy + " " : ""}Pist Başı Hassas Yaklaşma Yolu Gösterge Işıkları (PAPI) çalışmıyor (hizmet dışı) — görerek süzülüş rehberliği mevcut değil`);
  }
  // VOR/DME arızası
  else if (/(?:VOR|DME)\s.*U\/S|(?:VOR|DME)\s.*OUT OF SERVICE/.test(t)) {
    const navType = /VOR/.test(t) && /DME/.test(t) ? "VOR/DME seyrüsefer istasyonu" : /VOR/.test(t) ? "VOR yön bulma vericisi" : "DME mesafe ölçüm vericisi";
    const freqMatch = t.match(/(\d{3}\.\d+)\s*MHZ/);
    const freq = freqMatch ? ` (${freqMatch[1]} MHz)` : "";
    parts.push(`${navType}${freq} ${rwy ? rwy + " bölgesinde " : ""}çalışmıyor (hizmet dışı) — konvansiyonel seyrüsefer etkilenebilir`);
  }
  // Pist kapalı
  else if (/(?:RWY|RUNWAY)\s*\S*\s*(?:CLSD|CLOSED)/.test(t)) {
    parts.push(`${rwy || "Pist"} tamamen kapatılmıştır (uçuşa kapalı)`);
  }
  // Pist yüzeyi
  else if (/(?:CONTAMINATED|WET|ICE|SNOW|STANDING WATER|SLIPPERY)/.test(t)) {
    parts.push(`${rwy || "Pist"} yüzeyinde ıslaklık, su birikintisi, kar veya buzlanma mevcut — uçak frenleme performansı etkilenebilir`);
  }
  // Işıklandırma
  else if (/(?:LIGHT|LGT|ALS|REIL|VASI)\s.*(?:U\/S|OUT OF SERVICE|UNSERVICEABLE|MAINT)/.test(t)) {
    parts.push(`Pist/Yaklaşma ışıklandırma sistemleri çalışmıyor veya bakımda ${rwy ? "(" + rwy + ")" : ""} — gece veya düşük görüş koşullarında yaklaşma zorlaşabilir`);
  }
  // Havalimanı çalışma saatleri
  else if (/AD\s*OPR\s*HR|OPERATING\s*HOURS/.test(t)) {
    parts.push("Havalimanı operasyon saatlerinde kısıtlama/değişiklik var — uçuş saatleri doğrulanmalı");
  }
  // Yakıt bilgisi
  else if (/FUEL\s*(NOT\s*AVBL|UNAVAILABLE)/.test(t)) {
    parts.push("Havalimanında yakıt ikmal hizmeti mevcut değildir (yakıt alınamaz)");
  }
  // Engel uyarısı
  else if (/OBST\s*(?:TOWER|LGT|CRANE|MAST)/.test(t)) {
    const hgtMatch = t.match(/(\d+(?:\.\d+)?)\s*FT\s*(?:AGL|AMSL)/);
    const hgt = hgtMatch ? ` — ${hgtMatch[1]} ft` : "";
    parts.push(`Havalimanı çevresinde geçici mania/dikey engel (kule, vinç, direk vb.) uyarısı${hgt} — alçak irtifa uçuşlarında dikkat edilmelidir`);
  }
  // Hava sahası kısıtı
  else if (/AIRSPACE|RESTRICTED|PROHIBITED|TRA|DANGER AREA/.test(t)) {
    parts.push("Hava sahası kısıtlaması veya askeri/tehlikeli saha faaliyeti mevcut — rota veya uçuş yüksekliği etkilenebilir");
  }

  // Sentetik / Simüle edilmiş NOTAM kalıpları
  else if (/APRON STAND RESTRICTIONS/.test(t)) {
    parts.push("Apron park yerlerinde bakım nedeniyle kısıtlama mevcut — yer hareketlerinde gecikme yaşanabilir");
  }
  else if (/TAXIWAY ROUTING RESTRICTIONS/.test(t)) {
    parts.push("Taksi yollarında çalışma veya kısıtlama mevcut — yer rotaları değişebilir ve yerde gecikme oluşabilir");
  }
  else if (/TEMPORARY CONTROLLED AIRSPACE ACTIVITY/.test(t)) {
    parts.push("Geçici kontrollü hava sahası faaliyeti var — kalkış/varış rotaları veya ATC usulleri etkilenebilir");
  }
  else if (/WEATHER-RELATED OPERATIONAL ADVISORY/.test(t)) {
    parts.push("Hava durumu kaynaklı operasyonel uyarı yürürlükte — alçak irtifa rüzgarları, türbülans, buzlanma veya görüş etkileri kontrol edilmelidir");
  }
  else if (/OPERATIONAL ADVISORY IN FORCE/.test(t)) {
    parts.push("Operasyonel uyarı yürürlükte — uçuştan önce tüm detaylar kontrol edilmelidir");
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

  // Sentetik NOTAM'ları çevir ve kesme
  if (t.includes("SYNTHETIC NOTAM ADVISORY")) {
    let syn = raw;
    syn = syn.replace(/Critical synthetic NOTAM advisory for/i, "Kritik sentetik NOTAM uyarısı:");
    syn = syn.replace(/Medium synthetic NOTAM advisory for/i, "Orta seviye sentetik NOTAM uyarısı:");
    syn = syn.replace(/Info synthetic NOTAM advisory for/i, "Bilgi amaçlı sentetik NOTAM uyarısı:");
    syn = syn.replace(/navigation or visual approach aid unavailable or intermittent/gi, "seyrüsefer veya görerek yaklaşma yardımcıları hizmet dışı veya kesintili");
    syn = syn.replace(/Review approach minima and backup procedures/gi, "Yaklaşma minima ve yedek prosedürleri gözden geçirin");
    syn = syn.replace(/Category:/gi, "Kategori:");
    syn = syn.replace(/Operational rationale:/gi, "Operasyonel neden:");
    syn = syn.replace(/nav outage/gi, "seyrüsefer kesintisi");
    syn = syn.replace(/ILS outage can affect approach minima and usable procedures/gi, "ILS kesintisi yaklaşma minimalarını ve kullanılabilir prosedürleri etkileyebilir");
    syn = syn.replace(/PAPI outage reduces visual approach guidance/gi, "PAPI kesintisi görerek yaklaşma rehberliğini azaltır");
    return syn;
  }

  // Fallback: ham metnin kısa versiyonu
  if (raw.length > 10) {
    return raw.length > 120 ? raw.slice(0, 117) + "..." : raw;
  }
  return "Operasyonel etki potansiyeli mevcut; detay kontrol edilmelidir.";
}
