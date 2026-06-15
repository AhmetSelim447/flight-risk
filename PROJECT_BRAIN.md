# Project Brain

Last updated: 2026-06-11

## Operating Contract

`PROJECT_BRAIN.md` is the project source of truth. Before starting any project task, read this file first and align the work with it. After finishing any project task, review whether the task changed product behavior, architecture, data sources, ML/model state, UI behavior, startup flow, or known limitations; if it did, update this file before closing the task.

Do not change architecture unless the user explicitly asks for it. Work inside the current monorepo boundaries unless the project brain or the user says otherwise.

Do not repeat these known mistakes:

- Do not present the system as a certified operational decision maker. It is a decision-support briefing assistant only.
- Do not imply the ML model predicts accident risk. It predicts an operational METAR proxy-risk label.
- Do not show synthetic NOTAM as real live NOTAM. Always mark it as demo/test unless a validated live provider is configured.
- Do not use `metar-taf.com` as a production provider.
- Do not make the first briefing screen dense with raw METAR/TAF, score formulas, guardrails, or long AI text. Keep technical details collapsed by default.
- Do not show generic NOTAM risk explanations when specific critical NOTAM causes are available. Explain the actual cause: runway, surface/braking, navigation aid, lighting, airspace, ops hours, or weather advisory.
- Do not rank alternate airports around departure for an arrival problem. Alternate suggestions must be destination-centered around ARR.
- Do not start duplicate local services on the same ports. Reuse running services or show the user which process owns the port.

---

## Product Goal

flight-risk is a pre-flight operational briefing and risk-support assistant. It does not replace pilot, dispatcher, operator, ATC, AIS/AIM, or official operational authority decisions.

The target system is a hybrid assistant:

- Deterministic rule engine for explainable baseline risk.
- ML/DL-style tabular risk model for METAR-derived operational weather risk (trained on 2M+ records).
- NOTAM semantic parser and impact classifier.
- OpenAI LLM layer (JSON Mode) for structured NOTAM parsing and Turkish briefing reports.
- Strict fallback behavior when AI or external providers fail.

---

## Current Architecture

```text
Web UI (React + Vite)
  -> Home operational dashboard
  -> Briefing form & summary (Turkish-first)
  -> Leaflet interactive map (route, active runway, destination alternates, live traffic)
  -> Calibration dashboard (/calibration)
  -> Manual briefing feedback collector

Express API (Orchestrator - Port 4000)
  -> /brief endpoint orchestrating METAR/TAF/NOTAM data and risk scores
  -> /traffic endpoint (OpenSky API live traffic querying in routing bounding boxes)
  -> /feedback endpoint saving user ratings to local JSONL

Python AI Service (FastAPI - Port 8000)
  -> /ai/risk/predict (loads tabular ML model + guardrails)
  -> /ai/notam/parse (optional OpenAI semantic parsing with deterministic fallback)
  -> /ai/brief/report (optional OpenAI Turkish briefing summary with deterministic fallback)

tools/ml_pipeline.py
  -> Historical METAR downloader & live TAF snapshot collector
  -> ML dataset builder & Multinomial Logistic Regression model trainer (2M+ rows, ROC-AUC 0.993)
```

---

## Data Sources

### Live METAR/TAF
- **Primary Source**: AviationWeather Data API.
- **Fallbacks**: CheckWX, AVWX, NOAA text endpoint.

### Live NOTAM & SkyLink API
- **Simulated Mode**: Default deterministic simulated NOTAM generator (marked as demo/test synthetic data in UI).
- **Live Mode**: SkyLink RapidAPI `0.3.1` airport NOTAM service (`GET https://skylink-api.p.rapidapi.com/notams/{ICAO}`). Configured via `NOTAM_PROVIDER=skylink` and `SKYLINK_API_KEY` in `.env.local`.
- **Fallbacks**: If the live API key is absent or the request fails, the system automatically falls back to simulated/synthetic NOTAMs.

### LLM Runtime & OpenAI API
- Enabled via `LLM_PROVIDER=openai`, `LLM_ENABLED=true`, and `OPENAI_API_KEY` in `.env.local` (uses `gpt-4o-mini` by default).
- Converts raw NOTAM strings into structured JSON (severity, impact categories, score, summary) and compiles Turkish flight briefings under strict schema validation and deterministic fallback (uses local template-based generation if validation or the API fails).

---

## Fixed Bugs & Improvements (Recent)

### 1. Offline Airport Cache Load Fix
- **Bug**: `AIRPORTS_CACHE` in the Express API was initialized directly to the 4 default airports (`inlineSeed`), causing `hasData` to be `true` on startup. This completely bypassed the local disk cache loader (`loadAirportsFromCache`), meaning `airports.generated.json` was never loaded. If the remote fetch from `ourairports.com` failed (which it does locally due to timeout restrictions), the server remained locked to only 4 default airports, making other airports like Elazığ (`LTCA`) unsearchable.
- **Fix**: Initialized `AIRPORTS_CACHE = []` so that the local disk cache is successfully loaded first, making all 50+ Turkish airports searchable in the React UI.

### 2. toNumber Empty String Conversion Bug
- **Bug**: The CSV parser's `toNumber` helper did `Number(String(x ?? "").trim())` on empty CSV fields. In JS/TS, `Number("")` evaluates to `0` instead of `NaN` or `undefined`. Because of this, empty runway heading fields in the CSV were parsed as `0` instead of falling back to designator-based parsing (like `07/25` -> `70` deg). This caused all runway headings in the database to be `0` degrees.
- **Fix**: Modified `toNumber` to return `undefined` for empty strings, allowing correct fallback designator parsing to take place.

### 3. Repaired Runway Headings Cache
- Repaired all `0` headings in the three `airports.generated.json` cache files in the workspace (109 headings in total). The cache now contains accurate runway headings (e.g., Elazığ `LTCA` has `07/25` -> `70` and `13/31` -> `130` degrees).

### 4. Inline Seed Expansion
- Expanded `inlineSeed` in `apps/api/src/data/airports.ts` to include Elazığ (`LTCA`), İzmir Adnan Menderes (`LTBJ`), and Dalaman (`LTBS`) by default so that they are always available out-of-the-box even if cache files are deleted or missing.

---

## Presentation & Thesis Alignment State

The presentation file `Bitirme Ödevi Sunum Şablonu .pptx` is fully updated and verified:
- **Slide 1 Cover Page**: Updated with correct authors (**Mete Han YILMAZ**, **Ahmet Selim AYTAÇ**, **Emre NABİKOĞLU**), advisor (**Prof. Dr. Bilal ALATAŞ**), and correct thesis title: *"Yapay Zeka Destekli NOTAM ve METAR/TAF Analizi ile Uçuş Risk Değerlendirme ve Karar Destek Sistemi"*. Shifted boxes down to prevent overlap.
- **Global Headers (Slides 2 to 40)**: Replaced `"Ali VELİ"` with `"M. H. Yılmaz, A. S. Aytaç, E. Nabikoğlu"`. Shifted the text box `Left` coordinate to the left and increased `Width` by `2.5M` dmus, keeping it `RIGHT` aligned. This prevents the names from wrapping onto a second line, fixing the layout shifts ("yazılar kaymış").
- **Visuals Preserved**: Reverted all temporary Pillow drawings. 100% of the original high-resolution project screenshots (Slides 29-40) and system diagrams (Slides 20, 21, 23, 25) are fully preserved.
- **LLM and SkyLink Details**: Updated Slide 10 (Veri Toplama Katmanı), Slide 23 (AI Mimarisi), and Slide 25 (Hibrit Risk Değerlendirmesi) to detail:
  - SkyLink RapidAPI live NOTAM integration and fallback.
  - OpenAI LLM semantic NOTAM parsing (JSON Mode) and Türkçe flight briefings.
  - Controlled hybrid architecture (LLM cannot modify the calculated score, guardrail floors are enforced by the rules engine).
- **Slide 41 (Thanks)**: Replaced thank-you presenter name with the correct author list.

---

## Known Issues & Limitations (Sorunlar)

Before handoff or continuation (especially with Opus 4.6), be aware of these active issues/limitations:

1. **Vite Node.js Version Warning**:
   - The React frontend console prints a warning: `Vite requires Node.js version 20.19+ or 22.12+`. The current workspace environment uses Node `22.4.0`. While Vite runs on port `5174` successfully, upgrading Node.js or using an LTS version is recommended to avoid runtime issues.
2. **Network Timeout on Remote Airport Fetch**:
   - The Express loader attempts to fetch CSV data from `ourairports.com` at startup, which consistently times out (attempt 1/2 and 2/2) in local environments due to network or proxy restrictions. This makes the local file `airports.generated.json` the sole provider of TR airport list data. Any cache regeneration (by passing `force=true`) will fail unless a stable external network connection is available.
3. **TAF Historical Dataset & Separate ML Model Missing**:
   - While METAR is predicted using a trained Logistic Regression model (ML), TAF is parsed and evaluated only heuristically by the rules engine and the LLM layer. TAF historical data collection is active via `collect-live --kinds taf`, but no separate ML model exists yet for forecasting weather deterioration trends.
4. **Turkey Delay & Diversion Labels Missing**:
   - The ML model currently predicts an operational METAR "proxy-risk" label (caution/high weather thresholds) rather than actual accident risk or BTS-style operational airport delay/diversion labels for Turkey.
5. **Briefing Feedback is Local Only**:
   - Ratings and manual classifications (`correct`, `too_conservative`, `missed_risk`, `wrong_reason`) collected via the React feedback panel are saved locally to `brief_feedback.jsonl` but are not yet used in a automated retraining or calibration loop.
6. **API Key Dependencies**:
   - SkyLink NOTAM and OpenAI LLM parsing require valid API keys stored in `apps/api/.env.local` to function in live mode. Without them, the backend falls back to simulated NOTAM generation and rule-based template briefings.

---

## Next Steps

1. **Upgrade Node.js** to `22.12.0+` or `20.19.0+` to resolve the Vite warnings.
2. **Collect more TAF snapshots** using the Windows Task Scheduler (`install-taf-snapshot-task.bat`) to build a historical dataset.
3. **Develop a TAF trend scorer** and integrate it into the FastAPI ML pipeline once sufficient TAF historical data is collected.
4. **Implement automated threshold tuning** using the manual feedback labels collected in `brief_feedback.jsonl`.
