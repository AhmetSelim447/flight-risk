# Calibration And Feedback

This project now has a local calibration loop for work that does not depend on live NOTAM or TAF history.

## API

```bash
GET /model/status
GET /feedback/summary
POST /feedback
```

`/model/status` reads:

- `services/nlp/models/risk_model.json`
- `data/processed/evaluation.json`
- `data/processed/risk_dataset.csv` metadata
- local feedback summary

`/feedback` appends local JSONL records to:

```text
data/feedback/brief_feedback.jsonl
```

Accepted verdicts:

```text
correct
too_conservative
missed_risk
wrong_reason
```

These feedback records are not used for training automatically yet. They are the first manual-label source for later calibration.

## UI

The app has a Calibration page:

```text
/calibration
```

It shows:

- model version and target
- dataset row count and label distribution
- raw model confusion matrix
- guardrail-adjusted confusion matrix
- false negative / false positive counts
- feedback totals

The briefing screen includes a feedback panel for collecting manual review labels per route.

## PDF

The PDF AI section includes:

- hybrid score
- model version
- METAR weather score
- trained score
- heuristic score
- guardrail score
- guardrail reasons
- weather categories

