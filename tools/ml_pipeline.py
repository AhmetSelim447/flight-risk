from __future__ import annotations

import argparse
import csv
import gzip
import json
import math
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable


IEM_ASOS_URL = "https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py"
AVIATIONWEATHER_URL = "https://aviationweather.gov/api/data"

DEFAULT_STATIONS = ["LTFM", "LTAC", "LTBA", "LTAI", "LTBJ", "LTBS", "LTCC", "LTCE"]
AIRPORTS_FILE = Path("apps/api/src/data/airports.generated.json")
FEATURE_COLUMNS = [
    "visibility_m",
    "rvr_min_m",
    "ceiling_ft",
    "wind_kt",
    "gust_kt",
    "wx_fog",
    "wx_precip",
    "wx_ts",
    "wx_freezing",
    "hour",
    "month",
]


def parse_date(value: str) -> date:
    return datetime.strptime(value, "%Y-%m-%d").date()


def month_ranges(start: date, end: date) -> Iterable[tuple[date, date]]:
    cur = date(start.year, start.month, 1)
    while cur < end:
        if cur.month == 12:
            nxt = date(cur.year + 1, 1, 1)
        else:
            nxt = date(cur.year, cur.month + 1, 1)
        yield max(cur, start), min(nxt, end)
        cur = nxt


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def http_get(url: str, timeout: int = 45, retries: int = 4, retry_wait: int = 30) -> bytes:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "flight-risk-data-pipeline/0.1",
            "Accept": "application/json,text/csv,text/plain,*/*",
        },
    )
    last_error: Exception | None = None
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            last_error = e
            if e.code not in {429, 500, 502, 503, 504} or attempt >= retries:
                raise
            wait = retry_wait * (attempt + 1)
            print(f"rate/server limit HTTP {e.code}; waiting {wait}s then retrying...", flush=True)
            time.sleep(wait)
        except urllib.error.URLError as e:
            last_error = e
            if attempt >= retries:
                raise
            wait = min(retry_wait * (attempt + 1), 90)
            print(f"network error {e}; waiting {wait}s then retrying...", flush=True)
            time.sleep(wait)

    raise RuntimeError(f"request failed after retries: {last_error}")


def download_iem_metar(
    station: str,
    start: date,
    end: date,
    out_dir: Path,
    skip_existing: bool = True,
    pause_seconds: float = 3.0,
) -> Path:
    ensure_dir(out_dir)
    outfile = out_dir / f"{station.upper()}_{start:%Y%m%d}_{end:%Y%m%d}.csv"
    if skip_existing and outfile.exists() and outfile.stat().st_size > 100:
        print(f"skipped existing {outfile}")
        return outfile

    params = {
        "station": station.upper(),
        "data": "all",
        "year1": start.year,
        "month1": start.month,
        "day1": start.day,
        "year2": end.year,
        "month2": end.month,
        "day2": end.day,
        "tz": "Etc/UTC",
        "format": "onlycomma",
        "latlon": "yes",
        "elev": "yes",
        "missing": "null",
        "trace": "null",
        "direct": "yes",
        "report_type": ["3", "4"],
    }
    url = f"{IEM_ASOS_URL}?{urllib.parse.urlencode(params, doseq=True)}"
    raw = http_get(url)
    outfile.write_bytes(raw)
    if pause_seconds > 0:
        time.sleep(pause_seconds)
    return outfile


def split_kinds(value: str) -> list[str]:
    aliases = {
        "all": ["metar", "taf"],
        "both": ["metar", "taf"],
        "metar,taf": ["metar", "taf"],
        "taf,metar": ["metar", "taf"],
    }
    raw = str(value or "").strip().lower()
    if raw in aliases:
        return aliases[raw]
    kinds = [x.strip().lower() for x in raw.split(",") if x.strip()]
    valid = {"metar", "taf"}
    bad = [x for x in kinds if x not in valid]
    if bad or not kinds:
        raise SystemExit(f"Invalid --kinds value: {value}. Use metar, taf, or metar,taf")
    return list(dict.fromkeys(kinds))


def collect_live(stations: list[str], out_dir: Path, kinds: list[str] | None = None) -> Path:
    ensure_dir(out_dir)
    kinds = kinds or ["metar", "taf"]
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    outfile = out_dir / f"aviationweather_{ts}.jsonl"
    with outfile.open("w", encoding="utf-8") as f:
        for station in stations:
            station = station.upper()
            for kind in kinds:
                url = f"{AVIATIONWEATHER_URL}/{kind}?ids={urllib.parse.quote(station)}&format=json"
                try:
                    payload = json.loads(http_get(url).decode("utf-8", errors="replace"))
                    f.write(
                        json.dumps(
                            {
                                "station": station,
                                "kind": kind,
                                "fetched_at": datetime.now(timezone.utc).isoformat(),
                                "source": "aviationweather",
                                "payload": payload,
                            },
                            ensure_ascii=False,
                        )
                        + "\n"
                    )
                except Exception as e:
                    f.write(
                        json.dumps(
                            {
                                "station": station,
                                "kind": kind,
                                "fetched_at": datetime.now(timezone.utc).isoformat(),
                                "source": "aviationweather",
                                "error": str(e),
                            },
                            ensure_ascii=False,
                        )
                        + "\n"
                    )
    return outfile


def to_float(value: str | None, default: float = math.nan) -> float:
    if value is None or value == "" or value.lower() == "null":
        return default
    try:
        return float(value)
    except ValueError:
        return default


def miles_to_meters(value: float) -> float:
    if math.isnan(value):
        return math.nan
    return value * 1609.344


def ceiling_from_row(row: dict[str, str]) -> float:
    candidates: list[float] = []
    for idx in range(1, 5):
        cover = (row.get(f"skyc{idx}") or "").strip().upper()
        level = to_float(row.get(f"skyl{idx}"))
        if cover in {"BKN", "OVC", "VV"} and not math.isnan(level):
            candidates.append(level)
    if not candidates:
        return math.nan
    return min(candidates)


def weather_flags(wxcodes: str, metar: str) -> dict[str, int]:
    txt = f"{wxcodes or ''} {metar or ''}".upper()
    return {
        "wx_fog": int(any(x in txt for x in [" FG", "FZFG", "BR", "MIFG", "BCFG"])),
        "wx_precip": int(any(x in txt for x in [" RA", "-RA", "+RA", "SN", "SHRA", "DZ", "GR", "GS"])),
        "wx_ts": int("TS" in txt or " CB" in txt),
        "wx_freezing": int("FZ" in txt or " RIME" in txt or " ICE" in txt),
    }


def rvr_min_from_metar(metar: str) -> float:
    values: list[float] = []
    for match in re.finditer(r"R\d{2}[LCR]?/[PM]?(\d{4})[A-Z]?", metar.upper()):
        value = to_float(match.group(1))
        if not math.isnan(value):
            values.append(value)
    return min(values) if values else math.nan


def proxy_label(features: dict[str, float]) -> int:
    return int(risk_level(features) > 0)


def risk_level(features: dict[str, float]) -> int:
    vis = features["visibility_m"]
    rvr = features["rvr_min_m"]
    ceiling = features["ceiling_ft"]
    wind = features["wind_kt"]
    gust = features["gust_kt"]

    if not math.isnan(vis) and vis < 1500:
        return 2
    if not math.isnan(rvr) and rvr < 550:
        return 2
    if not math.isnan(ceiling) and ceiling < 600:
        return 2
    if not math.isnan(gust) and gust >= 35:
        return 2
    if not math.isnan(wind) and wind >= 30:
        return 2
    if features["wx_ts"] or features["wx_freezing"]:
        return 2

    if not math.isnan(vis) and vis < 3000:
        return 1
    if not math.isnan(rvr) and rvr < 1500:
        return 1
    if not math.isnan(ceiling) and ceiling < 1000:
        return 1
    if not math.isnan(ceiling) and ceiling < 2000 and (features["wx_precip"] or features["wx_fog"]):
        return 1
    if not math.isnan(gust) and gust >= 25:
        return 1
    if not math.isnan(wind) and wind >= 22:
        return 1
    if features["wx_fog"] and (math.isnan(vis) or vis < 5000):
        return 1
    if features["wx_precip"] and not math.isnan(vis) and vis < 5000:
        return 1
    return 0


def row_to_features(row: dict[str, str]) -> dict[str, float] | None:
    valid = row.get("valid") or ""
    try:
        dt = datetime.strptime(valid[:16], "%Y-%m-%d %H:%M")
    except ValueError:
        return None

    flags = weather_flags(row.get("wxcodes", ""), row.get("metar", ""))
    features = {
        "visibility_m": miles_to_meters(to_float(row.get("vsby"))),
        "rvr_min_m": rvr_min_from_metar(row.get("metar", "")),
        "ceiling_ft": ceiling_from_row(row),
        "wind_kt": to_float(row.get("sknt"), 0),
        "gust_kt": to_float(row.get("gust"), 0),
        "hour": float(dt.hour),
        "month": float(dt.month),
        **flags,
    }
    return features


def build_dataset(raw_dir: Path, out_file: Path) -> tuple[int, int]:
    rows: list[dict[str, object]] = []
    for csv_file in sorted(raw_dir.glob("*.csv")):
        with csv_file.open("r", encoding="utf-8", errors="replace", newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                features = row_to_features(row)
                if not features:
                    continue
                out = {
                    "station": row.get("station", ""),
                    "valid": row.get("valid", ""),
                    "metar": row.get("metar", ""),
                    **features,
                    "risk_level": risk_level(features),
                    "proxy_label": proxy_label(features),
                }
                rows.append(out)

    ensure_dir(out_file.parent)
    with out_file.open("w", encoding="utf-8", newline="") as f:
        fieldnames = ["station", "valid", *FEATURE_COLUMNS, "risk_level", "proxy_label", "metar"]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)
    positives = sum(int(r["proxy_label"]) for r in rows)
    return len(rows), positives


def fit_logistic_model(df, target: str):
    from sklearn.impute import SimpleImputer
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler

    x = df[FEATURE_COLUMNS]
    y = df[target].astype(int)
    model = make_pipeline(
        SimpleImputer(strategy="median"),
        StandardScaler(),
        LogisticRegression(max_iter=1000, class_weight="balanced"),
    )
    model.fit(x, y)
    return model


def score_from_probs(classes: list[int], probs) -> list[float]:
    mapping = {0: 5.0, 1: 45.0, 2: 85.0}
    out: list[float] = []
    for row in probs:
        score = 0.0
        for cls, p in zip(classes, row):
            score += mapping.get(int(cls), 55.0 if int(cls) > 0 else 5.0) * float(p)
        out.append(score)
    return out


def guardrail_floor_from_features(features: dict[str, float]) -> float:
    vis = features.get("visibility_m", math.nan)
    rvr = features.get("rvr_min_m", math.nan)
    ceiling = features.get("ceiling_ft", math.nan)
    wind = features.get("wind_kt", math.nan)
    gust = features.get("gust_kt", math.nan)

    if not math.isnan(vis) and vis < 1500:
        return 75.0
    if not math.isnan(rvr) and rvr < 550:
        return 75.0
    if not math.isnan(ceiling) and ceiling < 600:
        return 75.0
    if not math.isnan(gust) and gust >= 35:
        return 75.0
    if not math.isnan(wind) and wind >= 30:
        return 75.0
    if features.get("wx_ts") or features.get("wx_freezing"):
        return 75.0

    floor = 0.0
    if not math.isnan(vis) and vis < 3000:
        floor = max(floor, 45.0)
    if not math.isnan(rvr) and rvr < 1500:
        floor = max(floor, 45.0)
    if not math.isnan(ceiling) and ceiling < 1000:
        floor = max(floor, 45.0)
    if not math.isnan(gust) and gust >= 25:
        floor = max(floor, 45.0)
    if not math.isnan(wind) and wind >= 22:
        floor = max(floor, 45.0)
    if features.get("wx_fog") and not math.isnan(vis) and vis < 5000:
        floor = max(floor, 40.0)
    if features.get("wx_precip") and not math.isnan(vis) and vis < 5000:
        floor = max(floor, 40.0)
    if not math.isnan(ceiling) and ceiling < 2000 and (features.get("wx_precip") or features.get("wx_fog")):
        floor = max(floor, 40.0)
    return floor


def class_from_score(score: float) -> int:
    if score >= 70:
        return 2
    if score >= 40:
        return 1
    return 0


def label_counts(series) -> dict[str, int]:
    return {str(int(k)): int(v) for k, v in series.value_counts().sort_index().items()}


def safe_roc_auc(y_true, probs, classes: list[int]) -> float | None:
    try:
        from sklearn.metrics import roc_auc_score

        if len(classes) == 2:
            if len(set(int(x) for x in y_true)) < 2:
                return None
            return float(roc_auc_score(y_true, probs[:, 1]))
        return float(roc_auc_score(y_true, probs, labels=classes, multi_class="ovr", average="weighted"))
    except Exception:
        return None


def train_model(dataset: Path, model_file: Path, target: str = "risk_level") -> dict[str, object]:
    try:
        import pandas as pd
        from sklearn.metrics import classification_report
        from sklearn.model_selection import train_test_split
    except Exception as e:  # pragma: no cover
        raise SystemExit(f"pandas/scikit-learn required for train: {e}") from e

    df = pd.read_csv(dataset)
    if df.empty:
        raise SystemExit(f"Dataset is empty: {dataset}")
    if target not in df.columns:
        raise SystemExit(f"Target column not found: {target}")
    if df[target].nunique() < 2:
        raise SystemExit(f"Need at least two {target} classes to train.")

    x = df[FEATURE_COLUMNS]
    y = df[target].astype(int)
    x_train, x_test, y_train, y_test = train_test_split(
        x, y, test_size=0.25, random_state=42, stratify=y
    )
    model = fit_logistic_model(pd.concat([x_train, y_train.rename(target)], axis=1), target)
    probs = model.predict_proba(x_test)
    preds = model.predict(x_test)

    imputer = model.named_steps["simpleimputer"]
    scaler = model.named_steps["standardscaler"]
    clf = model.named_steps["logisticregression"]
    report = classification_report(y_test, preds, output_dict=True, zero_division=0)
    classes = [int(x) for x in clf.classes_]
    auc = safe_roc_auc(y_test, probs, classes)

    artifact = {
        "modelVersion": f"metar-logreg-v1-{datetime.now(timezone.utc):%Y%m%d%H%M%S}",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "targetColumn": target,
        "classes": classes,
        "scoreMapping": {"0": 5, "1": 45, "2": 85},
        "featureColumns": FEATURE_COLUMNS,
        "imputerMedian": [float(x) for x in imputer.statistics_],
        "scalerMean": [float(x) for x in scaler.mean_],
        "scalerScale": [float(x) for x in scaler.scale_],
        "coef": [[float(v) for v in row] for row in clf.coef_],
        "intercept": [float(x) for x in clf.intercept_],
        "metrics": {
            "rows": int(len(df)),
            "positiveRows": int((y > 0).sum()),
            "labelCounts": label_counts(y),
            "testRows": int(len(y_test)),
            "rocAuc": auc,
            "classificationReport": report,
        },
        "labelDefinition": "risk_level: 0=normal, 1=caution, 2=high based on METAR visibility, RVR, ceiling, wind/gust, TS/freezing/fog/precip indicators",
    }
    ensure_dir(model_file.parent)
    model_file.write_text(json.dumps(artifact, indent=2, ensure_ascii=False), encoding="utf-8")
    return artifact


def percentiles(values: list[float]) -> dict[str, float]:
    if not values:
        return {}
    values = sorted(float(x) for x in values)

    def pct(q: float) -> float:
        if len(values) == 1:
            return values[0]
        pos = (len(values) - 1) * q
        lo = math.floor(pos)
        hi = math.ceil(pos)
        if lo == hi:
            return values[int(pos)]
        return values[lo] + (values[hi] - values[lo]) * (pos - lo)

    return {
        "p05": round(pct(0.05), 2),
        "p25": round(pct(0.25), 2),
        "p50": round(pct(0.50), 2),
        "p75": round(pct(0.75), 2),
        "p95": round(pct(0.95), 2),
    }


def example_rows(df, actual, predicted, scores: list[float], mask: list[bool], limit: int = 25) -> list[dict[str, object]]:
    examples: list[dict[str, object]] = []
    for idx, include in enumerate(mask):
        if not include:
            continue
        row = df.iloc[idx]
        examples.append(
            {
                "station": str(row.get("station", "")),
                "valid": str(row.get("valid", "")),
                "actual": int(actual.iloc[idx] if hasattr(actual, "iloc") else actual[idx]),
                "predicted": int(predicted[idx]),
                "score": round(float(scores[idx]), 2),
                "metar": str(row.get("metar", ""))[:220],
            }
        )
        if len(examples) >= limit:
            break
    return examples


def evaluate_frame(model, df, target: str, name: str) -> dict[str, object]:
    from sklearn.metrics import classification_report, confusion_matrix

    if df.empty:
        return {"name": name, "rows": 0, "warning": "empty evaluation frame"}

    y = df[target].astype(int).reset_index(drop=True)
    x = df[FEATURE_COLUMNS]
    probs = model.predict_proba(x)
    preds = model.predict(x)
    clf = model.named_steps["logisticregression"]
    classes = [int(x) for x in clf.classes_]
    scores = score_from_probs(classes, probs)
    floors = [
        guardrail_floor_from_features({name: float(row[name]) if not math.isnan(float(row[name])) else math.nan for name in FEATURE_COLUMNS})
        for _, row in df[FEATURE_COLUMNS].iterrows()
    ]
    adjusted_scores = [max(float(score), float(floor)) for score, floor in zip(scores, floors)]
    adjusted_preds = [class_from_score(score) for score in adjusted_scores]
    false_negative_mask = [int(a) > 0 and int(p) == 0 for a, p in zip(y, preds)]
    false_positive_mask = [int(a) == 0 and int(p) > 0 for a, p in zip(y, preds)]
    guardrail_false_negative_mask = [int(a) > 0 and int(p) == 0 for a, p in zip(y, adjusted_preds)]
    guardrail_false_positive_mask = [int(a) == 0 and int(p) > 0 for a, p in zip(y, adjusted_preds)]

    return {
        "name": name,
        "rows": int(len(df)),
        "labelCounts": label_counts(y),
        "rocAuc": safe_roc_auc(y, probs, classes),
        "scorePercentiles": percentiles(scores),
        "confusionMatrix": {
            "labels": classes,
            "matrix": confusion_matrix(y, preds, labels=classes).astype(int).tolist(),
        },
        "classificationReport": classification_report(y, preds, labels=classes, output_dict=True, zero_division=0),
        "falseNegativeCount": int(sum(false_negative_mask)),
        "falsePositiveCount": int(sum(false_positive_mask)),
        "falseNegativeExamples": example_rows(df.reset_index(drop=True), y, preds, scores, false_negative_mask),
        "falsePositiveExamples": example_rows(df.reset_index(drop=True), y, preds, scores, false_positive_mask),
        "guardrail": {
            "scorePercentiles": percentiles(adjusted_scores),
            "confusionMatrix": {
                "labels": classes,
                "matrix": confusion_matrix(y, adjusted_preds, labels=classes).astype(int).tolist(),
            },
            "classificationReport": classification_report(y, adjusted_preds, labels=classes, output_dict=True, zero_division=0),
            "falseNegativeCount": int(sum(guardrail_false_negative_mask)),
            "falsePositiveCount": int(sum(guardrail_false_positive_mask)),
            "floorAppliedCount": int(sum(1 for floor, score in zip(floors, scores) if floor > score)),
            "falseNegativeExamples": example_rows(
                df.reset_index(drop=True),
                y,
                adjusted_preds,
                adjusted_scores,
                guardrail_false_negative_mask,
            ),
            "falsePositiveExamples": example_rows(
                df.reset_index(drop=True),
                y,
                adjusted_preds,
                adjusted_scores,
                guardrail_false_positive_mask,
            ),
        },
    }


def evaluate_model(
    dataset: Path,
    out_file: Path,
    target: str = "risk_level",
    train_end: str = "2025-07-01",
    test_start: str = "2025-07-01",
    test_end: str = "2026-01-01",
    holdout_airports: str = "LTCE,LTCG,LTCI,LTFE,LTFO",
) -> dict[str, object]:
    try:
        import pandas as pd
    except Exception as e:  # pragma: no cover
        raise SystemExit(f"pandas/scikit-learn required for evaluate: {e}") from e

    df = pd.read_csv(dataset)
    if df.empty:
        raise SystemExit(f"Dataset is empty: {dataset}")
    if target not in df.columns:
        raise SystemExit(f"Target column not found: {target}")

    df["_valid_dt"] = pd.to_datetime(df["valid"], errors="coerce", utc=True)
    holdouts = {x.strip().upper() for x in holdout_airports.split(",") if x.strip()}
    station = df["station"].astype(str).str.upper()
    valid = df["_valid_dt"].notna()
    train_end_ts = pd.Timestamp(train_end, tz="UTC")
    test_start_ts = pd.Timestamp(test_start, tz="UTC")
    test_end_ts = pd.Timestamp(test_end, tz="UTC")

    train_df = df[valid & (df["_valid_dt"] < train_end_ts) & ~station.isin(holdouts)].copy()
    time_test_df = df[
        valid
        & (df["_valid_dt"] >= test_start_ts)
        & (df["_valid_dt"] < test_end_ts)
        & ~station.isin(holdouts)
    ].copy()
    holdout_df = df[valid & station.isin(holdouts)].copy()

    if train_df.empty:
        raise SystemExit("Evaluation train split is empty.")
    if train_df[target].nunique() < 2:
        raise SystemExit(f"Evaluation train split needs at least two {target} classes.")

    model = fit_logistic_model(train_df, target)
    clf = model.named_steps["logisticregression"]
    classes = [int(x) for x in clf.classes_]
    result = {
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "targetColumn": target,
        "labelDefinition": "risk_level: 0=normal, 1=caution, 2=high based on METAR visibility, RVR, ceiling, wind/gust, TS/freezing/fog/precip indicators",
        "scoreMapping": {"0": 5, "1": 45, "2": 85},
        "classes": classes,
        "splits": {
            "train": {
                "rows": int(len(train_df)),
                "dateBefore": train_end,
                "excludedHoldoutAirports": sorted(holdouts),
                "labelCounts": label_counts(train_df[target].astype(int)),
            },
            "timeValidation": {"dateFrom": test_start, "dateBefore": test_end},
            "airportHoldout": {"airports": sorted(holdouts)},
        },
        "evaluations": [
            evaluate_frame(model, time_test_df, target, "time_validation"),
            evaluate_frame(model, holdout_df, target, "airport_holdout"),
        ],
    }
    ensure_dir(out_file.parent)
    out_file.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    return result


def turkey_stations_from_airports_file(path: Path = AIRPORTS_FILE) -> list[str]:
    if not path.exists():
        return DEFAULT_STATIONS
    data = json.loads(path.read_text(encoding="utf-8"))
    return sorted(
        {
            str(item.get("icao", "")).upper()
            for item in data
            if str(item.get("icao", "")).upper().startswith("LT")
        }
    )


def split_stations(value: str) -> list[str]:
    raw = str(value or "").strip().lower()
    if raw in {"turkey", "tr", "all-tr", "all-turkey", "lt*", "all"}:
        return turkey_stations_from_airports_file()
    return [x.strip().upper() for x in value.split(",") if x.strip()]


def cmd_download_metar(args: argparse.Namespace) -> None:
    stations = split_stations(args.stations)
    start = parse_date(args.start)
    end = parse_date(args.end)
    out_dir = Path(args.out)
    for station in stations:
        for a, b in month_ranges(start, end):
            outfile = download_iem_metar(
                station,
                a,
                b,
                out_dir,
                skip_existing=not args.force,
                pause_seconds=args.pause,
            )
            print(f"downloaded {outfile}")


def cmd_collect_live(args: argparse.Namespace) -> None:
    outfile = collect_live(split_stations(args.stations), Path(args.out), split_kinds(args.kinds))
    print(f"wrote {outfile}")


def cmd_build_dataset(args: argparse.Namespace) -> None:
    rows, positives = build_dataset(Path(args.raw), Path(args.out))
    print(f"wrote {args.out} rows={rows} positives={positives}")


def cmd_train(args: argparse.Namespace) -> None:
    artifact = train_model(Path(args.dataset), Path(args.model), target=args.target)
    metrics = artifact["metrics"]
    print(f"wrote {args.model}")
    print(
        f"target={artifact['targetColumn']} rows={metrics['rows']} "
        f"positives={metrics['positiveRows']} labels={metrics['labelCounts']} roc_auc={metrics['rocAuc']}"
    )


def cmd_evaluate(args: argparse.Namespace) -> None:
    result = evaluate_model(
        Path(args.dataset),
        Path(args.out),
        target=args.target,
        train_end=args.train_end,
        test_start=args.test_start,
        test_end=args.test_end,
        holdout_airports=args.holdout_airports,
    )
    print(f"wrote {args.out}")
    for item in result["evaluations"]:
        guardrail = item.get("guardrail") or {}
        print(
            f"{item['name']}: rows={item['rows']} roc_auc={item.get('rocAuc')} "
            f"false_negatives={item.get('falseNegativeCount')} false_positives={item.get('falsePositiveCount')} "
            f"guardrail_false_negatives={guardrail.get('falseNegativeCount')} "
            f"guardrail_false_positives={guardrail.get('falsePositiveCount')}"
        )


def cmd_list_stations(args: argparse.Namespace) -> None:
    stations = turkey_stations_from_airports_file(Path(args.airports))
    print(",".join(stations))
    print(f"count={len(stations)}", file=sys.stderr)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="flight-risk data and ML pipeline")
    sub = parser.add_subparsers(required=True)

    p = sub.add_parser("list-stations", help="Print Turkey LT* stations from the project airport database")
    p.add_argument("--airports", default=str(AIRPORTS_FILE))
    p.set_defaults(func=cmd_list_stations)

    p = sub.add_parser("download-metar", help="Download historical METAR CSV from Iowa Mesonet")
    p.add_argument("--stations", default=",".join(DEFAULT_STATIONS), help="Comma list, or turkey/all/lt* for all project LT* airports")
    p.add_argument("--start", required=True, help="YYYY-MM-DD")
    p.add_argument("--end", required=True, help="YYYY-MM-DD; exclusive enough for IEM monthly windows")
    p.add_argument("--out", default="data/raw/metar")
    p.add_argument("--pause", type=float, default=3.0, help="Seconds to wait between Iowa Mesonet requests")
    p.add_argument("--force", action="store_true", help="Re-download files that already exist")
    p.set_defaults(func=cmd_download_metar)

    p = sub.add_parser("collect-live", help="Collect current METAR/TAF snapshots from AviationWeather")
    p.add_argument("--stations", default=",".join(DEFAULT_STATIONS), help="Comma list, or turkey/all/lt* for all project LT* airports")
    p.add_argument("--kinds", default="metar,taf", help="metar, taf, or metar,taf")
    p.add_argument("--out", default="data/raw/live")
    p.set_defaults(func=cmd_collect_live)

    p = sub.add_parser("build-dataset", help="Build ML-ready CSV from raw METAR CSV files")
    p.add_argument("--raw", default="data/raw/metar")
    p.add_argument("--out", default="data/processed/risk_dataset.csv")
    p.set_defaults(func=cmd_build_dataset)

    p = sub.add_parser("train", help="Train logistic baseline and save JSON model artifact")
    p.add_argument("--dataset", default="data/processed/risk_dataset.csv")
    p.add_argument("--model", default="services/nlp/models/risk_model.json")
    p.add_argument("--target", default="risk_level", choices=["risk_level", "proxy_label"])
    p.set_defaults(func=cmd_train)

    p = sub.add_parser("evaluate", help="Validate model thresholds on time and airport holdout splits")
    p.add_argument("--dataset", default="data/processed/risk_dataset.csv")
    p.add_argument("--out", default="data/processed/evaluation.json")
    p.add_argument("--target", default="risk_level", choices=["risk_level", "proxy_label"])
    p.add_argument("--train-end", default="2025-07-01", help="Train on rows before this UTC date")
    p.add_argument("--test-start", default="2025-07-01", help="Time validation starts at this UTC date")
    p.add_argument("--test-end", default="2026-01-01", help="Time validation ends before this UTC date")
    p.add_argument("--holdout-airports", default="LTCE,LTCG,LTCI,LTFE,LTFO")
    p.set_defaults(func=cmd_evaluate)

    args = parser.parse_args(argv)
    args.func(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
