# Project Brain

Last updated: 2026-06-07

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

## Product Goal

flight-risk is a pre-flight operational briefing and risk-support assistant. It does not replace pilot, dispatcher, operator, ATC, AIS/AIM, or official operational authority decisions.

The target system is a hybrid assistant:

- deterministic rule engine for explainable baseline risk
- ML/DL-style tabular risk model for METAR-derived operational weather risk
- NOTAM semantic parser and impact classifier
- LLM-style report layer for readable briefing explanations
- strict fallback behavior when AI or external providers fail

## Current Architecture

```text
Web UI
  -> Express API /brief orchestrator
  -> Calibration page /calibration
  -> Briefing feedback collector
    -> METAR/TAF provider chain
    -> NOTAM provider
    -> rule risk engine
    -> AI service /ai/notam/parse
    -> AI service /ai/risk/predict
    -> AI service /ai/brief/report
  -> briefing screen and PDF

services/nlp
  -> NOTAM parser
  -> trained METAR risk model loader
  -> hybrid risk predictor
  -> AI briefing report

tools/ml_pipeline.py
  -> historical METAR download
  -> live METAR/TAF snapshot collection
  -> ML dataset build
  -> baseline model training
  -> time split and airport holdout validation

data/feedback
  -> local manual briefing feedback JSONL
```

## Data Sources

### Live METAR/TAF

Primary source:

- AviationWeather Data API

Fallback chain:

1. AviationWeather
2. CheckWX, if token exists
3. AVWX, if token exists
4. NOAA text endpoint

`metar-taf.com` is not used as a production provider.

### Historical METAR Dataset

Historical METAR training data is downloaded from Iowa Mesonet ASOS/METAR archive.

The pipeline supports:

```bash
python tools/ml_pipeline.py download-metar --stations turkey --start 2023-01-01 --end 2026-01-01 --pause 5
python tools/ml_pipeline.py collect-live --stations turkey --kinds taf
npm run data:collect-taf-turkey
python tools/ml_pipeline.py build-dataset
python tools/ml_pipeline.py train
python tools/ml_pipeline.py evaluate
```

`--stations turkey` reads all project-known `LT*` airports from `apps/api/src/data/airports.generated.json`.

Current known Turkey station count:

```text
78 LT* airports
```

### TAF Dataset

Historical TAF training data is not solved yet.

Current state:

- live TAF is fetched for briefing
- live TAF snapshots can be collected with `collect-live`
- `collect-live --kinds taf` collects TAF-only snapshots
- `collect-taf-snapshot.bat` runs one TAF snapshot collection
- `run-taf-snapshot-loop.bat` runs repeated TAF snapshots while its window is open
- `install-taf-snapshot-task.bat` registers a Windows scheduled task so TAF snapshots continue even when the app is closed
- TAF is used by heuristic/rule scoring and AI reporting
- TAF is not yet trained as a separate ML model

Future target:

```text
TAF trend score =
  forecast visibility trend
  ceiling trend
  TEMPO/BECMG/PROB deterioration
  thunderstorm/freezing/precipitation signals
  wind/gust trend
```

### NOTAM

Current default:

- deterministic synthetic NOTAM provider
- clearly marked as demo/test synthetic data in UI
- same ICAO + time bucket generates stable events

Implemented live-ready provider:

- `NOTAM_PROVIDER=laminar`
- `LAMINAR_USER_KEY=...`
- `NOTAM_PROVIDER=skylink`
- `SKYLINK_API_KEY=...`
- `SKYLINK_API_URL=https://skylink-api.p.rapidapi.com/notams`

If Laminar/SkyLink key is absent or request fails, system falls back to simulated NOTAMs.

SkyLink RapidAPI `0.3.1` has been smoke-tested with a user-provided key against:

```text
GET https://skylink-api.p.rapidapi.com/notams/{ICAO}
```

Observed live responses:

```text
LTFJ -> 29 NOTAMs
LTFM -> 9 NOTAMs
LTAC -> 16 NOTAMs
```

Do not commit API keys. Use environment variables only.

Local runtime can load API environment values from:

```text
apps/api/.env
apps/api/.env.local
```

`.env.local` is ignored and should be used for secrets.

Current SkyLink validation commands:

```bash
npm run test:notam
npm run test:notam:live
```

Latest live smoke result:

```text
date = 2026-06-07
LTFJ -> total 29 / live 29 / synthetic 0 / critical 1
LTFM -> total 9 / live 9 / synthetic 0 / critical 3
LTAC -> total 16 / live 16 / synthetic 0 / critical 3
```

Latest live briefing analysis examples:

```text
date = 2026-06-07
LTFM-LTAC -> METAR/TAF aviationweather, NOTAM SkyLink live, synthetic fallback 0, risk 40 yellow, confidence high 88, primary driver NOTAM 75
LTAC-LTFJ -> METAR/TAF aviationweather, NOTAM SkyLink live, synthetic fallback 0, risk 42 yellow, confidence high 94, primary driver NOTAM 86
```

Official long-term sources to evaluate:

- DHMI AIS/AIM
- EUROCONTROL EAD

## ML Pipeline State

Implemented:

- historical METAR downloader
- live METAR/TAF snapshot collector
- dataset builder
- three-class logistic baseline trainer
- time split and airport holdout validator
- model artifact loader in `services/nlp`
- trained model participates in `/ai/risk/predict` when `services/nlp/models/risk_model.json` exists
- `services/nlp/models/risk_model.json` is intentionally tracked in git so a fresh clone can run the trained baseline without retraining first.

Current training result:

```text
rows = 2,024,185
target = risk_level
label counts = normal 1,843,348 / caution 85,509 / high 95,328
positive rows = 180,837
roc_auc = 0.993052161307856
```

Important interpretation:

- This is an operational METAR proxy-risk model.
- It is not an accident-risk model.
- `risk_level=1` represents caution-level METAR operational indicators.
- `risk_level=2` represents high-level METAR operational indicators.
- Positive labels represent low visibility, low RVR, low ceiling, strong wind/gust, thunderstorm/freezing/fog/precip operational indicators.
- Soft caution labels include ceiling `<2000 ft` with fog/precip so BKN020-style winter/low-cloud cases are not treated as fully normal.

Current validation result:

```text
time_validation rows = 304,920
time_validation roc_auc = 0.9948543313889386
time_validation false_negatives = 384
time_validation false_positives = 10,769
time_validation guardrail_false_negatives = 0
time_validation guardrail_false_positives = 4,079

airport_holdout rows = 218,157
airport_holdout roc_auc = 0.9911601733517109
airport_holdout false_negatives = 1,373
airport_holdout false_positives = 7,378
airport_holdout guardrail_false_negatives = 0
airport_holdout guardrail_false_positives = 3,127
```

Runtime weather scoring uses a deterministic guardrail floor over the trained model:

```text
High floor:
visibility < 1500 m
RVR < 550 m
ceiling < 600 ft
wind >= 30 kt
gust >= 35 kt
TS/freezing signal

Caution floor:
visibility < 3000 m
RVR < 1500 m
ceiling < 1000 ft
wind >= 22 kt
gust >= 25 kt
fog/precip with reduced visibility
ceiling < 2000 ft with fog/precip
```

The same guardrail protects the final user-facing score:

```text
high weather floor >= 75   -> final score at least 70 / red
caution weather floor >=40 -> final score at least 40 / yellow
```

Detailed validation artifact:

```text
data/processed/evaluation.json
```

## Risk Logic

Current hybrid final score:

```text
finalScore = 0.65 * mlScore
           + 0.25 * ruleScore
           + 0.10 * notamSemanticScore
```

Risk bands:

```text
0-39   Low / Green
40-69  Caution / Yellow
70-100 High / Red
```

The UI must always explain:

- why the score exists
- which categories are present
- which categories are absent
- pros and cons
- DEP NOTAM vs ARR NOTAM meaning
- that the score is not an operational clearance

## UI State

Implemented:

- home dashboard with last brief, provider/data status, TAF snapshot status, model health, and quick routes
- compact decision summary shown before detailed analysis
- Turkish-first UI labels for the main briefing flow
- final score band thresholds are shown in the decision summary, especially `70+ = red/high`
- technical risk/AI/NOTAM analysis is hidden by default and can be expanded
- alternate suggestions are destination-centered: alternates are ranked around ARR, not around DEP
- AI Evaluation section
- risk categorization section
- score formula explanation
- pros/cons
- NOTAM category matrix
- NOTAM "what is present / not present"
- readable METAR/TAF summary cards
- raw METAR/TAF detail hidden behind expandable details
- NOTAM detail cards with score, category, runway, validity, impacts, reason
- provider metadata display
- briefing feedback panel
- calibration dashboard at `/calibration`

## Calibration And Feedback

Implemented:

- `GET /model/status`
- `GET /feedback/summary`
- `POST /feedback`
- feedback stored at `data/feedback/brief_feedback.jsonl`
- accepted feedback labels: `correct`, `too_conservative`, `missed_risk`, `wrong_reason`

Feedback is not used for training automatically yet. It is the first local manual-label source for later threshold tuning and supervised calibration.

The calibration dashboard shows:

- model version and target
- dataset row count and label distribution
- raw model confusion matrix
- guardrail-adjusted confusion matrix
- false negative / false positive counts
- feedback totals

## PDF State

Implemented:

- AI evaluation summary
- hybrid score
- model version
- METAR weather assessment
- trained/heuristic/guardrail scores
- guardrail reasons
- weather categories

## Startup

`start-flight-risk.bat` starts:

```text
AI  -> http://127.0.0.1:8000
API -> http://127.0.0.1:4000
Web -> http://127.0.0.1:5174
```

It avoids starting duplicate services if ports are already listening.

## Completed Plan Items

- Hybrid AI architecture implemented inside existing monorepo boundaries.
- Express API remains briefing orchestrator.
- `services/nlp` now provides AI endpoints.
- METAR/TAF provider chain implemented.
- `metar-taf.com` excluded from production provider plan.
- Synthetic NOTAM deterministic event engine implemented.
- Optional AI text render layer for synthetic NOTAM implemented.
- UI includes AI evaluation and better score explanation.
- PDF includes AI evaluation summary.
- Data and ML pipeline implemented.
- Historical METAR dataset built for Turkey `LT*` airports.
- Baseline METAR ML model trained as three-class `risk_level` and loadable by AI service.
- Model validation artifact includes confusion matrix, score percentiles, false negatives, false positives, and guardrail-adjusted metrics.
- AI risk response includes weather assessment categories: visibility, RVR, ceiling, wind/gust, TS/freezing, fog/mist, precipitation, and TAF trend.
- Calibration dashboard and local feedback loop implemented.
- PDF includes METAR guardrail/weather category explanation.
- TAF snapshot collection can run manually, in a foreground loop, or via Windows Task Scheduler.
- SkyLink NOTAM provider skeleton implemented with fallback.
- One-click Windows startup file added.
- Home screen now has operational dashboard, data status, model health, and a simpler first-read brief summary.

## Not Yet Complete

- Real live NOTAM provider not validated because no API key has been provided yet.
- TAF historical dataset is not available yet.
- TAF ML model is not trained yet.
- Current trained model is METAR proxy-risk only.
- No accident/incident label is used.
- No BTS-style operational delay/diversion labels for Turkey are integrated yet.
- Feedback labels are collected locally but are not yet part of model training.

## Next Best Steps

1. Restart AI service after training so it loads the latest `risk_model.json`.
2. Review `data/processed/evaluation.json` false negatives before changing green/yellow/red score thresholds.
3. Install the TAF scheduled task if continuous local TAF history is desired.
4. Test SkyLink with additional Turkey airports such as `LTBA`, `LTAI`, and `LTBJ`.
5. If SkyLink remains reliable, run the app with `NOTAM_PROVIDER=skylink`.
6. Add TAF dataset builder and TAF trend scorer once enough snapshots exist.
