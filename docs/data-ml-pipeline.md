# Data And ML Pipeline

This project uses three practical data lanes:

1. **Live METAR/TAF** from AviationWeather for the application.
2. **Historical METAR CSV** from Iowa Mesonet for the first ML dataset.
3. **Optional live NOTAM API** later, once a provider key is available.

## Download Historical METAR

Download one month for the default Turkey airport set:

```bash
python tools/ml_pipeline.py download-metar --start 2024-01-01 --end 2024-02-01
```

Download selected stations:

```bash
python tools/ml_pipeline.py download-metar --stations LTAC,LTFM,LTBA,LTAI --start 2024-01-01 --end 2024-04-01
```

Download all Turkey airports known by the project airport database:

```bash
python tools/ml_pipeline.py download-metar --stations turkey --start 2023-01-01 --end 2026-01-01 --pause 5
```

Check which stations will be used:

```bash
python tools/ml_pipeline.py list-stations
```

Output:

```text
data/raw/metar/*.csv
```

The downloader calls Iowa Mesonet ASOS/METAR archive:

```text
https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py
```

## Collect Live Snapshots

Collect current METAR and TAF JSON from AviationWeather:

```bash
python tools/ml_pipeline.py collect-live --stations LTAC,LTFM,LTBA,LTAI
```

For all Turkey airports:

```bash
python tools/ml_pipeline.py collect-live --stations turkey
```

Collect only TAF snapshots:

```bash
npm run data:collect-taf-turkey
```

or:

```bash
python tools/ml_pipeline.py collect-live --stations turkey --kinds taf
```

For selected stations:

```bash
python tools/ml_pipeline.py collect-live --stations LTAC,LTFM --kinds taf --out data/raw/live
```

Output:

```text
data/raw/live/*.jsonl
```

## Scheduled TAF Snapshots

One-shot collection:

```bat
collect-taf-snapshot.bat
```

Run a foreground loop while a command window is open:

```bat
run-taf-snapshot-loop.bat
```

Install a Windows scheduled task that runs even when the app is closed:

```bat
install-taf-snapshot-task.bat
```

Default interval is 30 minutes. Override it before installing:

```bat
set TAF_INTERVAL_MINUTES=60
install-taf-snapshot-task.bat
```

Remove the scheduled task:

```bat
uninstall-taf-snapshot-task.bat
```

Logs:

```text
data/logs/taf-snapshot.log
```

## Build ML Dataset

Convert raw METAR CSV files into numeric features and proxy operational risk labels:

```bash
npm run data:build-dataset
```

Custom paths:

```bash
python tools/ml_pipeline.py build-dataset --raw data/raw/metar --out data/processed/risk_dataset.csv
```

Output:

```text
data/processed/risk_dataset.csv
```

Feature columns:

- visibility_m
- rvr_min_m
- ceiling_ft
- wind_kt
- gust_kt
- wx_fog
- wx_precip
- wx_ts
- wx_freezing
- hour
- month

Labels:

```text
risk_level = 0 normal
risk_level = 1 caution
risk_level = 2 high

proxy_label = 1 when risk_level > 0
```

The labels are derived from METAR visibility, RVR, ceiling, wind/gust, thunderstorm/freezing/fog/precip indicators.
They are not real accident-risk labels. They are the first operational briefing risk proxy.

## Train Model

Train the first logistic baseline. By default this trains the three-class `risk_level` target:

```bash
npm run ml:train
```

Custom model path:

```bash
python tools/ml_pipeline.py train --dataset data/processed/risk_dataset.csv --model services/nlp/models/risk_model.json --target risk_level
```

Output:

```text
services/nlp/models/risk_model.json
```

The AI service loads this artifact automatically if it exists. If the model is absent, the existing heuristic proxy still runs.

## Validate Thresholds

Run time-split and airport-holdout validation:

```bash
npm run ml:evaluate
```

Custom paths:

```bash
python tools/ml_pipeline.py evaluate --dataset data/processed/risk_dataset.csv --out data/processed/evaluation.json
```

Default validation:

- train: rows before `2025-07-01`, excluding holdout airports
- time validation: `2025-07-01` to before `2026-01-01`
- airport holdout: `LTCE,LTCG,LTCI,LTFE,LTFO`

Output includes label counts, ROC AUC, confusion matrix, score percentiles, false negative examples, and false positive examples.
It also includes a `guardrail` section that simulates the runtime weather floor:

- high floor: visibility `<1500 m`, RVR `<550 m`, ceiling `<600 ft`, wind `>=30 kt`, gust `>=35 kt`, TS/freezing
- caution floor: visibility `<3000 m`, RVR `<1500 m`, ceiling `<1000 ft`, wind `>=22 kt`, gust `>=25 kt`
- soft caution floor: fog/precip with reduced visibility, or ceiling `<2000 ft` with fog/precip

Use this file to decide whether score bands such as green/yellow/red need adjustment.

At runtime, this guardrail also protects the final score band:

- high weather floor forces final score to at least `70`
- caution weather floor forces final score to at least `40`

## NOTAM Provider Next Step

The code currently keeps simulated NOTAMs as fallback. For real NOTAMs, add an API key and switch the provider:

```text
NOTAM_PROVIDER=laminar
LAMINAR_USER_KEY=...
```

Laminar/Cirium NOTAM Data exposes aerodrome-level GeoJSON NOTAM responses and fits the current briefing pipeline. SkyLink can remain as a secondary commercial option:

```text
NOTAM_PROVIDER=skylink
SKYLINK_API_KEY=...
SKYLINK_API_HOST=skylink-api.p.rapidapi.com
SKYLINK_API_URL=https://skylink-api.p.rapidapi.com/notams
```

SkyLink RapidAPI `0.3.1` was verified with the airport NOTAM endpoint:

```text
GET https://skylink-api.p.rapidapi.com/notams/{ICAO}
```

The response shape is:

```json
{
  "icao": "LTFJ",
  "notams": [
    {
      "raw": "...",
      "notam_id": "...",
      "effective": "...",
      "expiration": "..."
    }
  ]
}
```

Before relying on a paid plan, test `LTFM`, `LTAC`, `LTBA`, and `LTAI` coverage.

## SkyLink Live NOTAM Smoke Test

Latest local validation:

```text
date: 2026-06-07
command: npm run test:notam:live
provider: SkyLink RapidAPI 0.3.1
endpoint: GET https://skylink-api.p.rapidapi.com/notams/{ICAO}
result: passed
```

| Station | Total NOTAM | Live | Synthetic fallback | Critical | First NOTAM id |
|---|---:|---:|---:|---:|---|
| LTFJ | 29 | 29 | 0 | 1 | B1294/2026 |
| LTFM | 9 | 9 | 0 | 3 | A227/2026 |
| LTAC | 16 | 16 | 0 | 3 | A222/2026 |

The API key is stored only in local environment configuration. Do not commit keys.
