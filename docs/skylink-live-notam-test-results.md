# SkyLink Canlı NOTAM Test Sonuçları

Bu dosya, SkyLink RapidAPI NOTAM entegrasyonunun son canlı doğrulama sonucunu kaydeder.

```text
Tarih: 2026-06-07
Komut: npm run test:notam:live
Provider: SkyLink RapidAPI 0.3.1
Endpoint: GET https://skylink-api.p.rapidapi.com/notams/{ICAO}
Sonuç: PASS
```

| Meydan | Toplam NOTAM | Canlı NOTAM | Sentetik fallback | Kritik NOTAM | İlk NOTAM id |
|---|---:|---:|---:|---:|---|
| LTFJ | 29 | 29 | 0 | 1 | B1294/2026 |
| LTFM | 9 | 9 | 0 | 3 | A227/2026 |
| LTAC | 16 | 16 | 0 | 3 | A222/2026 |

Ek test:

```text
Komut: npm run test:notam
Sonuç: PASS
Kapsam: SkyLink response normalize edilir; HTTP hata ve eksik key durumunda sentetik fallback çalışır.
```

Not: API anahtarı dokümana yazılmaz. Anahtar yalnızca lokal `.env.local` içinde tutulmalıdır.

## Canlı Brifing Analizi

Aşağıdaki iki rota `/brief` endpoint'i üzerinden canlı METAR/TAF ve SkyLink NOTAM birlikte kullanılarak çalıştırılmıştır.

```text
Tarih: 2026-06-07
Endpoint: /brief
METAR/TAF provider: AviationWeather
NOTAM provider: SkyLink live
```

| Rota | DEP/ARR NOTAM | Kritik NOTAM | Sentetik fallback | Risk skoru | Risk bandı | Güven | Ana etken |
|---|---:|---:|---:|---:|---|---|---|
| LTFM-LTAC | 9 / 16 | 3 / 3 | 0 | 40 | yellow | high / 88 | NOTAM: 75 |
| LTAC-LTFJ | 16 / 29 | 3 / 1 | 0 | 42 | yellow | high / 94 | NOTAM: 86 |
