from fastapi import FastAPI, Response
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Literal, Optional
from datetime import datetime, timezone
from pathlib import Path
import json
import math
import os
import re
import urllib.error
import urllib.request


Severity = Literal["Critical", "Medium", "Info"]
Impact = Literal[
    "runway",
    "nav",
    "ops_hours",
    "airspace",
    "lighting",
    "surface",
    "weather",
]
RiskClass = Literal["green", "yellow", "red"]
ConfidenceLevel = Literal["high", "medium", "low"]


class NotamIn(BaseModel):
    raw: Optional[str] = None
    text: Optional[str] = None
    id: Optional[str] = None
    critical: Optional[bool] = None


class ParseRequest(BaseModel):
    items: List[NotamIn]


class NotamOut(BaseModel):
    raw: str
    severity: Severity
    impacts: List[Impact]
    summary: str
    operationalImpact: str
    score: int = Field(ge=0, le=100)
    valid_from_utc: Optional[str] = None
    valid_to_utc: Optional[str] = None


class RiskPredictRequest(BaseModel):
    ruleScore: float = 0
    depMet: Optional[Dict[str, Any]] = None
    arrMet: Optional[Dict[str, Any]] = None
    depTaf: Optional[Dict[str, Any]] = None
    arrTaf: Optional[Dict[str, Any]] = None
    depAirport: Optional[Dict[str, Any]] = None
    arrAirport: Optional[Dict[str, Any]] = None
    activeRunway: Optional[Dict[str, Any]] = None
    wind: Dict[str, Any] = Field(default_factory=dict)
    notams: Dict[str, List[NotamIn]] = Field(default_factory=dict)
    notamAnalysis: Dict[str, List[NotamOut]] = Field(default_factory=dict)
    confidence: Optional[Dict[str, Any]] = None


class RiskPredictResponse(BaseModel):
    mlScore: int = Field(ge=0, le=100)
    ruleScore: int = Field(ge=0, le=100)
    notamSemanticScore: int = Field(ge=0, le=100)
    finalScore: int = Field(ge=0, le=100)
    riskClass: RiskClass
    weatherAssessment: Dict[str, Any] = Field(default_factory=dict)
    confidence: Dict[str, Any]
    drivers: List[str]
    modelVersion: str
    limitedAdjustment: Dict[str, Any]


class BriefReportRequest(BaseModel):
    brief: Dict[str, Any]
    riskPrediction: Optional[RiskPredictResponse] = None
    notamAnalysis: Dict[str, List[NotamOut]] = Field(default_factory=dict)


class BriefReportResponse(BaseModel):
    summary: str
    riskInterpretation: str
    notamImpacts: List[str]
    weatherConcerns: List[str]
    windConcerns: List[str]
    alternateCommentary: str
    confidenceNote: str
    limitedAdjustment: str


class NotamRenderRequest(BaseModel):
    icao: str
    event: Dict[str, Any]
    deterministicText: str


class NotamRenderResponse(BaseModel):
    text: str
    source: Literal["ai_text", "fallback"]


app = FastAPI(title="Flight Risk AI Service")

_RISK_MODEL_CACHE: Optional[Dict[str, Any]] = None


def load_env_file(path: Path, override: bool = False) -> None:
    if not path.exists():
        return
    try:
        for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if not key:
                continue
            if override or key not in os.environ:
                os.environ[key] = value
    except Exception:
        return


def load_runtime_env() -> None:
    root = Path(__file__).resolve().parents[2]
    load_env_file(root / "apps" / "api" / ".env", override=False)
    load_env_file(root / "apps" / "api" / ".env.local", override=True)


load_runtime_env()


@app.get("/")
def root():
    return health()


@app.get("/health")
def health():
    model = load_risk_model()
    return {
        "ok": True,
        "service": "flight-risk-ai",
        "modelVersion": model.get("modelVersion") if model else "hybrid-proxy-v1",
        "trainedModelLoaded": bool(model),
        "llm": {
            "enabled": llm_available(),
            "provider": os.environ.get("LLM_PROVIDER", "none"),
            "model": os.environ.get("OPENAI_MODEL", ""),
            "notamParse": env_flag("LLM_NOTAM_PARSE", True),
            "briefReport": env_flag("LLM_BRIEF_REPORT", True),
        },
    }


@app.get("/favicon.ico")
def favicon():
    return Response(status_code=204)


def clamp_score(value: float) -> int:
    return int(max(0, min(100, round(value))))


def risk_class(score: int) -> RiskClass:
    if score >= 70:
        return "red"
    if score >= 40:
        return "yellow"
    return "green"


def env_flag(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None or value == "":
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def llm_available() -> bool:
    provider = os.environ.get("LLM_PROVIDER", "openai").strip().lower()
    return env_flag("LLM_ENABLED", False) and provider == "openai" and bool(os.environ.get("OPENAI_API_KEY"))


def parse_json_object(text: str) -> Optional[Dict[str, Any]]:
    raw = str(text or "").strip()
    if not raw:
        return None
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.IGNORECASE).strip()
        raw = re.sub(r"\s*```$", "", raw).strip()
    try:
        value = json.loads(raw)
        return value if isinstance(value, dict) else None
    except json.JSONDecodeError:
        start = raw.find("{")
        end = raw.rfind("}")
        if start >= 0 and end > start:
            try:
                value = json.loads(raw[start : end + 1])
                return value if isinstance(value, dict) else None
            except json.JSONDecodeError:
                return None
    return None


def call_openai_json(system_prompt: str, user_payload: Dict[str, Any], max_tokens: int = 900) -> Optional[Dict[str, Any]]:
    if not llm_available():
        return None

    base_url = os.environ.get("OPENAI_API_BASE", "https://api.openai.com/v1").rstrip("/")
    model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini"
    timeout_ms = int(os.environ.get("OPENAI_TIMEOUT_MS", "8000") or 8000)
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": json.dumps(user_payload, ensure_ascii=False, separators=(",", ":")),
            },
        ],
        "temperature": 0.1,
        "max_tokens": max_tokens,
        "response_format": {"type": "json_object"},
    }

    req = urllib.request.Request(
        f"{base_url}/chat/completions",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {os.environ.get('OPENAI_API_KEY')}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=max(1, timeout_ms / 1000)) as response:
            data = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError, ValueError):
        return None

    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        return None
    return parse_json_object(str(content))


def pydantic_to_dict(value: Any) -> Any:
    if isinstance(value, BaseModel):
        if hasattr(value, "model_dump"):
            return value.model_dump()
        return value.dict()
    if isinstance(value, list):
        return [pydantic_to_dict(v) for v in value]
    if isinstance(value, dict):
        return {k: pydantic_to_dict(v) for k, v in value.items()}
    return value


def load_risk_model() -> Optional[Dict[str, Any]]:
    global _RISK_MODEL_CACHE
    if _RISK_MODEL_CACHE is not None:
        return _RISK_MODEL_CACHE

    default_path = Path(__file__).resolve().parent / "models" / "risk_model.json"
    path = Path(os.environ.get("RISK_MODEL_PATH", str(default_path)))
    if not path.exists():
        return None
    try:
        _RISK_MODEL_CACHE = json.loads(path.read_text(encoding="utf-8"))
        return _RISK_MODEL_CACHE
    except Exception:
        return None


def sigmoid(value: float) -> float:
    if value >= 0:
        z = math.exp(-value)
        return 1 / (1 + z)
    z = math.exp(value)
    return z / (1 + z)


def softmax(values: List[float]) -> List[float]:
    if not values:
        return []
    m = max(values)
    exps = [math.exp(v - m) for v in values]
    total = sum(exps) or 1.0
    return [v / total for v in exps]


def item_text(item: NotamIn) -> str:
    return str(item.raw or item.text or "").strip()


def parse_notam_text(raw: str, explicit_critical: Optional[bool] = None) -> NotamOut:
    txt = raw.upper()
    impacts: List[Impact] = []
    score = 0

    def add(impact: Impact, points: int):
        nonlocal score
        if impact not in impacts:
            impacts.append(impact)
        score += points

    if any(x in txt for x in ["RWY", "RUNWAY"]):
        add("runway", 22)
    if any(x in txt for x in ["CLSD", "CLOSED", "CLOSURE"]):
        score += 24
    if any(x in txt for x in ["ILS", "VOR", "DME", "NDB", "GNSS", "GPS", "PAPI"]):
        add("nav", 16)
    if any(x in txt for x in ["U/S", "UNSERVICEABLE", "OUT OF SERVICE", "UNAVBL", "UNAVAILABLE"]):
        score += 16
    if any(x in txt for x in ["AD OPR HR", "OPR HR", "HOURS", "HR OF OPS"]):
        add("ops_hours", 13)
    if any(x in txt for x in ["AIRSPACE", "RESTRICTED", "DANGER AREA", "TEMPORARY RESERVED"]):
        add("airspace", 15)
    if any(x in txt for x in ["LIGHT", "LGT", "ALS", "APPROACH LIGHT"]):
        add("lighting", 10)
    if any(x in txt for x in ["SURFACE", "BRAKING", "CONTAMINATED", "SNOW", "ICE"]):
        add("surface", 14)
    if any(x in txt for x in ["WINDSHEAR", "TURB", "ICING", "BIRD", "VOLCANIC"]):
        add("weather", 12)

    if explicit_critical:
        score += 18

    score = clamp_score(score)
    if score >= 45:
        severity: Severity = "Critical"
    elif score >= 18:
        severity = "Medium"
    else:
        severity = "Info"

    if not impacts:
        summary = "Bilgilendirici NOTAM; belirgin operasyonel etki saptanmadı."
        operational = "İzleme yeterli."
    elif "runway" in impacts and severity == "Critical":
        summary = "Pist veya pist operasyonu üzerinde kritik etki olasılığı var."
        operational = "Pist kullanılabilirliği ve kalkış/iniş planı doğrulanmalı."
    elif "nav" in impacts:
        summary = "Seyrüsefer veya yaklaşma yardımcısı etkileniyor."
        operational = "Yaklaşma minima ve yedek usuller kontrol edilmeli."
    elif "ops_hours" in impacts:
        summary = "Meydan çalışma saatleri veya operasyon penceresi kısıtlı."
        operational = "Planlanan zaman aralığı NOTAM geçerliliğiyle karşılaştırılmalı."
    else:
        summary = "Operasyonel dikkat gerektiren NOTAM etkisi var."
        operational = "Briefing sırasında ek doğrulama önerilir."

    return NotamOut(
        raw=raw,
        severity=severity,
        impacts=impacts,
        summary=summary,
        operationalImpact=operational,
        score=score,
    )


SEVERITY_ORDER: Dict[Severity, int] = {"Info": 0, "Medium": 1, "Critical": 2}
IMPACT_ALIASES: Dict[str, Impact] = {
    "runway": "runway",
    "rwy": "runway",
    "pist": "runway",
    "nav": "nav",
    "navigation": "nav",
    "navaid": "nav",
    "ils": "nav",
    "vor": "nav",
    "dme": "nav",
    "papi": "nav",
    "gnss": "nav",
    "ops_hours": "ops_hours",
    "ops hours": "ops_hours",
    "operating_hours": "ops_hours",
    "hours": "ops_hours",
    "airspace": "airspace",
    "lighting": "lighting",
    "lights": "lighting",
    "surface": "surface",
    "braking": "surface",
    "weather": "weather",
}


def severity_from_score(score: int) -> Severity:
    if score >= 45:
        return "Critical"
    if score >= 18:
        return "Medium"
    return "Info"


def normalize_severity(value: Any) -> Severity:
    raw = str(value or "").strip().lower()
    if raw in {"critical", "high", "risk", "kritik", "yüksek", "yuksek"}:
        return "Critical"
    if raw in {"medium", "moderate", "orta", "watch", "caution"}:
        return "Medium"
    return "Info"


def normalize_impacts(values: Any) -> List[Impact]:
    result: List[Impact] = []
    if not isinstance(values, list):
        values = [values]
    for value in values:
        key = str(value or "").strip().lower().replace("-", "_")
        mapped = IMPACT_ALIASES.get(key) or IMPACT_ALIASES.get(key.replace("_", " "))
        if mapped and mapped not in result:
            result.append(mapped)
    return result


def merge_notam_guardrails(candidate: NotamOut, fallback: NotamOut, explicit_critical: Optional[bool]) -> NotamOut:
    score = clamp_score(max(candidate.score, fallback.score))
    severity = candidate.severity
    if SEVERITY_ORDER[fallback.severity] > SEVERITY_ORDER[severity]:
        severity = fallback.severity
    if SEVERITY_ORDER[severity_from_score(score)] > SEVERITY_ORDER[severity]:
        severity = severity_from_score(score)

    impacts = normalize_impacts(candidate.impacts)
    for impact in fallback.impacts:
        if impact not in impacts:
            impacts.append(impact)

    return NotamOut(
        raw=fallback.raw,
        severity=severity,
        impacts=impacts,
        summary=(candidate.summary or fallback.summary).strip()[:240],
        operationalImpact=(candidate.operationalImpact or fallback.operationalImpact).strip()[:260],
        score=score,
        valid_from_utc=candidate.valid_from_utc or fallback.valid_from_utc,
        valid_to_utc=candidate.valid_to_utc or fallback.valid_to_utc,
    )


def llm_parse_notams(req: ParseRequest) -> Optional[List[NotamOut]]:
    if not env_flag("LLM_NOTAM_PARSE", True) or not llm_available() or not req.items:
        return None

    fallback = [parse_notam_text(item_text(i), i.critical) for i in req.items]
    system_prompt = (
        "You are an aviation NOTAM semantic parser for a flight briefing assistant. "
        "Return only valid JSON. Do not decide whether a flight is safe and do not invent data. "
        "Use only the supplied NOTAM text. Classify operational impact for pilots and dispatchers. "
        "Allowed severity values: Critical, Medium, Info. Allowed impacts: runway, nav, ops_hours, "
        "airspace, lighting, surface, weather. Score must be 0-100. Critical means runway closure, "
        "approach aid outage, surface/braking issue, airspace restriction, ops-hour restriction, or a directly relevant hazard. "
        "Write the 'summary' and 'operationalImpact' in Turkish. The translations must be extremely simplified, clear, and easy to understand at a glance for pilots and dispatchers. "
        "Avoid complex sentences. Use direct, practical aviation terminology in Turkish (e.g., 'Pist 06L/24R kapalı', 'ILS çalışmıyor')."
    )
    payload = {
        "schema": {
            "items": [
                {
                    "index": 0,
                    "severity": "Critical|Medium|Info",
                    "impacts": ["runway|nav|ops_hours|airspace|lighting|surface|weather"],
                    "summary": "Turkish short summary",
                    "operationalImpact": "Turkish operational implication",
                    "score": 0,
                    "valid_from_utc": None,
                    "valid_to_utc": None,
                }
            ]
        },
        "items": [
            {
                "index": idx,
                "raw": item_text(item),
                "explicitCritical": bool(item.critical),
            }
            for idx, item in enumerate(req.items)
        ],
    }
    parsed = call_openai_json(system_prompt, payload, max_tokens=1400)
    raw_items = parsed.get("items") if isinstance(parsed, dict) else None
    if not isinstance(raw_items, list):
        return None

    by_index: Dict[int, Dict[str, Any]] = {}
    for raw_item in raw_items:
        if not isinstance(raw_item, dict):
            continue
        try:
            by_index[int(raw_item.get("index"))] = raw_item
        except (TypeError, ValueError):
            continue

    result: List[NotamOut] = []
    for idx, item in enumerate(req.items):
        candidate_raw = by_index.get(idx)
        if not candidate_raw:
            return None
        try:
            candidate = NotamOut(
                raw=item_text(item),
                severity=normalize_severity(candidate_raw.get("severity")),
                impacts=normalize_impacts(candidate_raw.get("impacts")),
                summary=str(candidate_raw.get("summary") or fallback[idx].summary),
                operationalImpact=str(candidate_raw.get("operationalImpact") or fallback[idx].operationalImpact),
                score=clamp_score(float(candidate_raw.get("score") or 0)),
                valid_from_utc=candidate_raw.get("valid_from_utc") or None,
                valid_to_utc=candidate_raw.get("valid_to_utc") or None,
            )
        except Exception:
            return None
        result.append(merge_notam_guardrails(candidate, fallback[idx], item.critical))
    return result


@app.post("/nlp/notam/parse", response_model=List[NotamOut])
def legacy_parse(req: ParseRequest):
    return [parse_notam_text(item_text(i), i.critical) for i in req.items]


@app.post("/ai/notam/parse", response_model=List[NotamOut])
def parse_notams(req: ParseRequest):
    return llm_parse_notams(req) or [parse_notam_text(item_text(i), i.critical) for i in req.items]


@app.post("/ai/notam/render", response_model=NotamRenderResponse)
def render_notam(req: NotamRenderRequest):
    icao = req.icao.upper().strip()
    event = req.event or {}
    base = req.deterministicText.strip()

    category = str(event.get("category") or "operational_advisory").replace("_", " ")
    severity = str(event.get("severity") or "Info")
    reason = str(event.get("reason") or "").strip()
    runway = event.get("affectedRunway")
    runway_text = f" Pist {runway}" if runway else ""
    
    eng_text = f"{severity} seviye sentetik NOTAM ({icao}{runway_text}): {base} Kategori: {category}. Operasyonel etki: {reason}"

    if LLM_ENABLED:
        system_prompt = (
            "You are an aviation translation assistant. "
            "Translate the provided synthetic NOTAM text into highly simplified, clear Turkish, "
            "suitable for pilots and dispatchers to read quickly at a glance. Avoid complex grammar. "
            "Return ONLY a JSON object with a 'translated_text' field containing the Turkish translation."
        )
        payload = {"text_to_translate": eng_text}
        
        parsed = call_openai_json(system_prompt, payload, max_tokens=200)
        if parsed and isinstance(parsed, dict) and parsed.get("translated_text"):
            tr_text = parsed.get("translated_text")
            if icao in tr_text:
                return NotamRenderResponse(text=tr_text, source="ai_text")

    # Fallback to mostly English if LLM fails
    text = (
        f"{severity} synthetic NOTAM advisory for {icao}{runway_text}: "
        f"{base} Category: {category}."
    )
    if reason:
        text += f" Operational rationale: {reason}"

    return NotamRenderResponse(text=text, source="fallback")


def parsed_met(report: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    parsed = report.get("parsed") if isinstance(report, dict) else None
    return parsed if isinstance(parsed, dict) else {}


def to_number(value: Any, default: float = math.nan) -> float:
    try:
        if value is None or value == "":
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def trained_model_features(dep_met: Optional[Dict[str, Any]]) -> Dict[str, float]:
    parsed = parsed_met(dep_met)
    raw = str((dep_met or {}).get("raw", "")).upper()
    wx_values = parsed.get("wx", [])
    wx_text = " ".join(str(x).upper() for x in wx_values) if isinstance(wx_values, list) else ""
    wx_text = f"{wx_text} {raw}"
    now = datetime.now(timezone.utc)
    return {
        "visibility_m": to_number(parsed.get("vis")),
        "rvr_min_m": rvr_min_from_text(raw),
        "ceiling_ft": to_number(parsed.get("ceiling")),
        "wind_kt": to_number(parsed.get("wind_spd"), 0),
        "gust_kt": to_number(parsed.get("gust", parsed.get("wind_gust")), 0),
        "wx_fog": 1.0 if any(x in wx_text for x in [" FG", "FZFG", "BR", "MIFG", "BCFG"]) else 0.0,
        "wx_precip": 1.0 if any(x in wx_text for x in [" RA", "-RA", "+RA", "SN", "SHRA", "DZ", "GR", "GS"]) else 0.0,
        "wx_ts": 1.0 if "TS" in wx_text or " CB" in wx_text else 0.0,
        "wx_freezing": 1.0 if "FZ" in wx_text or " ICE" in wx_text else 0.0,
        "hour": float(now.hour),
        "month": float(now.month),
    }


def rvr_min_from_text(raw: str) -> float:
    values: List[float] = []
    for token in str(raw or "").upper().split():
        if not token.startswith("R") or "/" not in token:
            continue
        after = token.split("/", 1)[1]
        digits = ""
        for ch in after:
            if ch.isdigit():
                digits += ch
                if len(digits) == 4:
                    break
            elif digits:
                break
        if len(digits) == 4:
            values.append(float(digits))
    return min(values) if values else math.nan


def predict_trained_weather_score(dep_met: Optional[Dict[str, Any]]) -> Optional[int]:
    model = load_risk_model()
    if not model:
        return None

    columns = model.get("featureColumns") or []
    medians = model.get("imputerMedian") or []
    means = model.get("scalerMean") or []
    scales = model.get("scalerScale") or []
    raw_coefs = model.get("coef") or []
    raw_intercept = model.get("intercept") or 0
    features = trained_model_features(dep_met)

    if not columns or not (len(columns) == len(medians) == len(means) == len(scales)):
        return None

    normalized_values: List[float] = []
    for idx, name in enumerate(columns):
        value = features.get(str(name), math.nan)
        if value is None or math.isnan(float(value)):
            value = float(medians[idx])
        scale = float(scales[idx]) or 1.0
        normalized_values.append((float(value) - float(means[idx])) / scale)

    if raw_coefs and isinstance(raw_coefs[0], list):
        coef_rows = [[float(v) for v in row] for row in raw_coefs]
    else:
        coef_rows = [[float(v) for v in raw_coefs]]

    if not coef_rows or any(len(row) != len(columns) for row in coef_rows):
        return None

    if isinstance(raw_intercept, list):
        intercepts = [float(x) for x in raw_intercept]
    else:
        intercepts = [float(raw_intercept)]
    if len(intercepts) < len(coef_rows):
        intercepts.extend([0.0] * (len(coef_rows) - len(intercepts)))

    classes = [int(x) for x in (model.get("classes") or [0, 1])]
    logits: List[float] = []
    for row_idx, row in enumerate(coef_rows):
        logit = intercepts[row_idx]
        for value, coef in zip(normalized_values, row):
            logit += value * coef
        logits.append(logit)

    if len(coef_rows) == 1 and len(classes) == 2:
        positive = sigmoid(logits[0])
        probs = [1 - positive, positive]
    else:
        probs = softmax(logits)
        if len(classes) != len(probs):
            classes = list(range(len(probs)))

    mapping = model.get("scoreMapping") or {"0": 5, "1": 45, "2": 85}
    score = 0.0
    for cls, prob in zip(classes, probs):
        score += float(mapping.get(str(cls), 55 if int(cls) > 0 else 5)) * float(prob)
    return clamp_score(score)


def category_item(key: str, label: str, status: str, detail: str, present: bool, score: int = 0) -> Dict[str, Any]:
    return {
        "key": key,
        "label": label,
        "status": status,
        "detail": detail,
        "present": present,
        "score": clamp_score(score),
    }


def has_any(text: str, tokens: List[str]) -> bool:
    return any(token in text for token in tokens)


def taf_deterioration(dep_taf: Optional[Dict[str, Any]]) -> Optional[str]:
    raw = str((dep_taf or {}).get("raw", "")).upper()
    if not raw:
        return None
    trend = "TEMPO" in raw or "BECMG" in raw or "PROB" in raw
    low_vis = bool(re.search(r"\b(0[0-9]{3}|1[0-9]{3}|2[0-9]{3})\b", raw))
    low_ceiling = bool(re.search(r"\b(BKN|OVC|VV)00[0-9]\b", raw))
    convective = has_any(raw, [" TS", "TSRA", " CB", "FZ", "SHSN", "SHRA"])
    if trend and (low_vis or low_ceiling or convective):
        return "TAF trend contains deterioration signal"
    return None


def weather_guardrail_assessment(
    dep_met: Optional[Dict[str, Any]],
    dep_taf: Optional[Dict[str, Any]],
    trained_score: Optional[int],
    heuristic_score: float,
    blended_score: float,
) -> Dict[str, Any]:
    parsed = parsed_met(dep_met)
    raw = str((dep_met or {}).get("raw", "")).upper()
    wx_values = parsed.get("wx", [])
    wx_text = " ".join(str(x).upper() for x in wx_values) if isinstance(wx_values, list) else ""
    wx_text = f"{wx_text} {raw}"

    vis = to_number(parsed.get("vis"))
    rvr = rvr_min_from_text(raw)
    ceiling = to_number(parsed.get("ceiling"))
    wind = to_number(parsed.get("wind_spd"), 0)
    gust = to_number(parsed.get("gust", parsed.get("wind_gust")), 0)
    fog = has_any(wx_text, [" FG", "FZFG", "BR", "MIFG", "BCFG"])
    precip = has_any(wx_text, [" RA", "-RA", "+RA", "SN", "SHRA", "SHSN", "DZ", "GR", "GS"])
    thunder = "TS" in wx_text or " CB" in wx_text
    freezing = "FZ" in wx_text or " ICE" in wx_text
    taf_signal = taf_deterioration(dep_taf)

    floor = 0
    floor_reasons: List[str] = []
    categories: List[Dict[str, Any]] = []

    def apply_floor(value: int, reason: str) -> None:
        nonlocal floor
        if value > floor:
            floor = value
        floor_reasons.append(reason)

    if math.isnan(vis):
        categories.append(category_item("visibility", "Görüş", "missing", "Görüş ayrıştırılamadı", False, 6))
    elif vis < 1500:
        categories.append(category_item("visibility", "Görüş", "high", f"{int(vis)} m", True, 75))
        apply_floor(75, "görüş < 1500 m")
    elif vis < 3000:
        categories.append(category_item("visibility", "Görüş", "watch", f"{int(vis)} m", True, 45))
        apply_floor(45, "görüş < 3000 m")
    elif vis < 5000:
        categories.append(category_item("visibility", "Görüş", "watch", f"{int(vis)} m", True, 35))
    else:
        categories.append(category_item("visibility", "Görüş", "ok", f"{int(vis)} m", True, 0))

    if math.isnan(rvr):
        categories.append(category_item("rvr", "RVR", "absent", "RVR raporlanmadı", False, 0))
    elif rvr < 550:
        categories.append(category_item("rvr", "RVR", "high", f"{int(rvr)} m", True, 75))
        apply_floor(75, "RVR < 550 m")
    elif rvr < 1500:
        categories.append(category_item("rvr", "RVR", "watch", f"{int(rvr)} m", True, 45))
        apply_floor(45, "RVR < 1500 m")
    else:
        categories.append(category_item("rvr", "RVR", "ok", f"{int(rvr)} m", True, 0))

    if math.isnan(ceiling):
        categories.append(category_item("ceiling", "Tavan", "missing", "Tavan ayrıştırılamadı", False, 5))
    elif ceiling < 600:
        categories.append(category_item("ceiling", "Tavan", "high", f"{int(ceiling)} ft", True, 75))
        apply_floor(75, "tavan < 600 ft")
    elif ceiling < 1000:
        categories.append(category_item("ceiling", "Tavan", "watch", f"{int(ceiling)} ft", True, 45))
        apply_floor(45, "tavan < 1000 ft")
    elif ceiling < 2000 and (precip or fog):
        categories.append(category_item("ceiling", "Tavan", "watch", f"{int(ceiling)} ft ve hadise", True, 40))
        apply_floor(40, "tavan < 2000 ft ve yağış/sis")
    else:
        categories.append(category_item("ceiling", "Tavan", "ok", f"{int(ceiling)} ft", True, 0))

    if gust >= 35 or wind >= 30:
        categories.append(category_item("wind", "Rüzgar/Gust", "high", f"{int(wind)} kt / gust {int(gust)} kt", True, 75))
        apply_floor(75, "kuvvetli rüzgar veya gust")
    elif gust >= 25 or wind >= 22:
        categories.append(category_item("wind", "Rüzgar/Gust", "watch", f"{int(wind)} kt / gust {int(gust)} kt", True, 45))
        apply_floor(45, "rüzgar/gust orta risk eşiği")
    else:
        categories.append(category_item("wind", "Rüzgar/Gust", "ok", f"{int(wind)} kt / gust {int(gust)} kt", True, 0))

    if thunder or freezing:
        label = "Gök gürültülü veya freezing hadise var"
        categories.append(category_item("convective_freezing", "TS/Freezing", "high", label, True, 75))
        apply_floor(75, label)
    else:
        categories.append(category_item("convective_freezing", "TS/Freezing", "absent", "TS/freezing sinyali yok", False, 0))

    if fog and not math.isnan(vis) and vis < 5000:
        categories.append(category_item("fog", "Sis/Pus", "watch", "BR/FG ve azalmış görüş", True, 40))
        apply_floor(40, "sis/pus ve görüş < 5000 m")
    elif fog:
        categories.append(category_item("fog", "Sis/Pus", "watch", "BR/FG sinyali", True, 25))
    else:
        categories.append(category_item("fog", "Sis/Pus", "absent", "Sis/pus sinyali yok", False, 0))

    if precip and not math.isnan(vis) and vis < 5000:
        categories.append(category_item("precipitation", "Yağış", "watch", "Yağış ve azalmış görüş", True, 40))
        apply_floor(40, "yağış ve görüş < 5000 m")
    elif precip:
        categories.append(category_item("precipitation", "Yağış", "watch", "Yağış sinyali", True, 25))
    else:
        categories.append(category_item("precipitation", "Yağış", "absent", "Yağış sinyali yok", False, 0))

    if taf_signal:
        categories.append(category_item("taf_trend", "TAF Eğilimi", "watch", taf_signal, True, 40))
        apply_floor(40, taf_signal)
    else:
        categories.append(category_item("taf_trend", "TAF Eğilimi", "absent", "Ayrıştırılmış kötüleşme sinyali yok", False, 0))

    adjusted = max(float(blended_score), float(floor))
    return {
        "score": clamp_score(adjusted),
        "trainedScore": trained_score,
        "heuristicScore": clamp_score(heuristic_score),
        "floorScore": clamp_score(floor),
        "floorApplied": floor > blended_score,
        "floorReasons": list(dict.fromkeys(floor_reasons))[:6],
        "categories": categories,
    }


def estimate_weather_score(dep_met: Optional[Dict[str, Any]], dep_taf: Optional[Dict[str, Any]]) -> float:
    parsed = parsed_met(dep_met)
    score = 0.0
    vis = parsed.get("vis")
    ceiling = parsed.get("ceiling")
    wx = [str(x).upper() for x in parsed.get("wx", [])] if isinstance(parsed.get("wx"), list) else []
    wx_str = " ".join(wx + [str((dep_taf or {}).get("raw", "")).upper()])

    if isinstance(vis, (int, float)):
        if vis < 1500:
            score += 30
        elif vis < 3000:
            score += 22
        elif vis < 5000:
            score += 13
        elif vis < 8000:
            score += 6
    else:
        score += 6

    if isinstance(ceiling, (int, float)):
        if ceiling < 600:
            score += 28
        elif ceiling < 1000:
            score += 18
        elif ceiling < 1500:
            score += 10
        elif ceiling < 3000:
            score += 5
    else:
        score += 5

    if any(token in wx_str for token in [" TS", "TSRA", "CB"]):
        score += 18
    elif any(token in wx_str for token in ["SHRA", "SHSN", "FZ", "GR", "GS", "SQ"]):
        score += 10
    elif wx:
        score += min(6, len(wx) * 2)

    return min(score, 100)


def estimate_wind_score(wind: Dict[str, Any]) -> float:
    cross = abs(float(wind.get("crosswind") or wind.get("cross") or 0))
    head = float(wind.get("headwind") or wind.get("head") or 0)
    limit = float(wind.get("crossLimit") or 15)
    ratio = cross / limit if limit > 0 else 0
    score = 0.0

    if ratio > 1.2:
        score += 30
    elif ratio > 1:
        score += 24
    elif ratio >= 0.85:
        score += 13
    elif ratio >= 0.65:
        score += 7

    if head < 0:
        tailwind = abs(head)
        if tailwind >= 15:
            score += 15
        elif tailwind >= 10:
            score += 9
        elif tailwind >= 5:
            score += 4

    return min(score, 100)


def coerce_notam_out(value: Any) -> Optional[NotamOut]:
    if isinstance(value, NotamOut):
        return value
    if isinstance(value, dict):
        try:
            return NotamOut(
                raw=str(value.get("raw") or ""),
                severity=normalize_severity(value.get("severity")),
                impacts=normalize_impacts(value.get("impacts")),
                summary=str(value.get("summary") or ""),
                operationalImpact=str(value.get("operationalImpact") or ""),
                score=clamp_score(float(value.get("score") or 0)),
                valid_from_utc=value.get("valid_from_utc") or None,
                valid_to_utc=value.get("valid_to_utc") or None,
            )
        except Exception:
            return None
    return None


def analyzed_notam_group(
    raw_items: List[NotamIn],
    parsed_items: Optional[List[NotamOut]],
) -> List[NotamOut]:
    parsed: List[NotamOut] = []
    for item in parsed_items or []:
        coerced = coerce_notam_out(item)
        if coerced:
            parsed.append(coerced)
    if parsed:
        return parsed
    return [parse_notam_text(item_text(i), i.critical) for i in raw_items]


def analyze_notam_groups(notams: Dict[str, List[NotamIn]], parsed_notams: Optional[Dict[str, List[NotamOut]]] = None) -> Dict[str, Any]:
    parsed_notams = parsed_notams or {}
    dep = analyzed_notam_group(notams.get("dep", []), parsed_notams.get("dep"))
    arr = analyzed_notam_group(notams.get("arr", []), parsed_notams.get("arr"))
    all_items = dep + arr
    score = max([n.score for n in all_items], default=0)
    critical_count = sum(1 for n in all_items if n.severity == "Critical")
    medium_count = sum(1 for n in all_items if n.severity == "Medium")
    if critical_count >= 3:
        score = max(score, 75)
    elif critical_count >= 1:
        score = max(score, 55)
    elif medium_count >= 2:
        score = max(score, 35)
    return {"dep": dep, "arr": arr, "score": clamp_score(score), "criticalCount": critical_count}


@app.post("/ai/risk/predict", response_model=RiskPredictResponse)
def risk_predict(req: RiskPredictRequest):
    rule_score = clamp_score(req.ruleScore)
    heuristic_weather_score = estimate_weather_score(req.depMet, req.depTaf)
    weather_score = heuristic_weather_score
    trained_weather_score = predict_trained_weather_score(req.depMet)
    model_version = "hybrid-proxy-v1"
    if trained_weather_score is not None:
        weather_score = clamp_score((trained_weather_score * 0.7) + (heuristic_weather_score * 0.3))
        model = load_risk_model()
        model_version = str((model or {}).get("modelVersion") or "metar-logreg-v1")
    weather_assessment = weather_guardrail_assessment(
        req.depMet,
        req.depTaf,
        trained_weather_score,
        heuristic_weather_score,
        weather_score,
    )
    weather_score = int(weather_assessment["score"])
    wind_score = estimate_wind_score(req.wind)
    notam = analyze_notam_groups(req.notams, req.notamAnalysis)
    notam_score = int(notam["score"])

    # Tabular proxy model: feature-weighted operational risk until a trained artifact is available.
    ml_score = clamp_score((weather_score * 0.48) + (wind_score * 0.27) + (notam_score * 0.25))
    ensemble_score = clamp_score((ml_score * 0.65) + (rule_score * 0.25) + (notam_score * 0.10))
    weather_floor = int(weather_assessment.get("floorScore") or 0)
    if weather_floor >= 75:
        ensemble_score = max(ensemble_score, 70)
    elif weather_floor >= 40:
        ensemble_score = max(ensemble_score, 40)

    confidence = dict(req.confidence or {})
    confidence_score = int(confidence.get("score") or 75)
    confidence_level = str(confidence.get("level") or "medium").lower()
    factors = list(confidence.get("factors") or [])

    if not req.depMet or not req.arrMet:
        confidence_score -= 12
        factors.append("METAR verisi eksik olduğu için AI güveni düşürüldü")
    if not req.depTaf or not req.arrTaf:
        confidence_score -= 8
        factors.append("TAF verisi eksik olduğu için AI güveni düşürüldü")
    if trained_weather_score is not None:
        factors.append("Türkiye LT* METAR proxy etiketi")

    confidence_score = max(0, min(100, confidence_score))
    if confidence_score < 55:
        confidence_level = "low"
    elif confidence_score < 80:
        confidence_level = "medium"
    else:
        confidence_level = "high"

    drivers = []
    ranked = sorted(
        [
            ("Weather", weather_score),
            ("Wind", wind_score),
            ("NOTAM", notam_score),
        ],
        key=lambda x: x[1],
        reverse=True,
    )
    for name, value in ranked:
        if value >= 15:
            drivers.append(f"{name}: {clamp_score(value)}")
    if trained_weather_score is not None:
        drivers.append(f"Trained METAR model: {trained_weather_score}")
    if weather_assessment.get("floorApplied"):
        drivers.append(f"METAR guardrail floor: {weather_assessment.get('floorScore')}")
    if not drivers:
        drivers.append("Belirgin baskın etken yok")

    base_class = risk_class(rule_score)
    ensemble_class = risk_class(ensemble_score)
    adjustment_reason = "LLM/AI katmanı skoru doğrudan değiştirmedi."
    if ensemble_score >= 70 and base_class != "red":
        adjustment_reason = "Hibrit model, birleşik risk skoruna göre risk sınıfını en fazla bir seviye yukarı önerdi."
    elif confidence_level == "low":
        adjustment_reason = "Eksik veri nedeniyle confidence düşürüldü; operasyonel doğrulama gerekli."

    return RiskPredictResponse(
        mlScore=ml_score,
        ruleScore=rule_score,
        notamSemanticScore=notam_score,
        finalScore=ensemble_score,
        riskClass=ensemble_class,
        weatherAssessment=weather_assessment,
        confidence={
            "level": confidence_level,
            "score": confidence_score,
            "summary": "AI hibrit değerlendirme güven seviyesi hesaplandı.",
            "factors": factors[:5],
        },
        drivers=drivers[:4],
        modelVersion=model_version,
        limitedAdjustment={
            "applied": ensemble_class != base_class or confidence_level == "low",
            "fromClass": base_class,
            "toClass": ensemble_class,
            "reason": adjustment_reason,
        },
    )


def compact_brief_payload(req: BriefReportRequest) -> Dict[str, Any]:
    brief = req.brief if isinstance(req.brief, dict) else {}
    risk = brief.get("risk", {}) if isinstance(brief, dict) else {}
    met = brief.get("met", {}) if isinstance(brief, dict) else {}
    taf = brief.get("taf", {}) if isinstance(brief, dict) else {}
    airports = brief.get("airports", {}) if isinstance(brief, dict) else {}
    notam_analysis = pydantic_to_dict(req.notamAnalysis)
    return {
        "airports": airports,
        "risk": {
            "score": risk.get("score"),
            "class": risk.get("class"),
            "headwind": risk.get("headwind"),
            "crosswind": risk.get("crosswind"),
            "primary_driver": risk.get("primary_driver"),
            "reasons": risk.get("reasons", [])[:8] if isinstance(risk.get("reasons"), list) else [],
            "alternates": risk.get("alternates", [])[:3] if isinstance(risk.get("alternates"), list) else [],
        },
        "riskPrediction": pydantic_to_dict(req.riskPrediction) if req.riskPrediction else None,
        "met": {
            "dep": (met.get("dep") or [])[:1] if isinstance(met, dict) else [],
            "arr": (met.get("arr") or [])[:1] if isinstance(met, dict) else [],
        },
        "taf": {
            "dep": (taf.get("dep") or [])[:1] if isinstance(taf, dict) else [],
            "arr": (taf.get("arr") or [])[:1] if isinstance(taf, dict) else [],
        },
        "notamAnalysis": {
            "dep": (notam_analysis.get("dep") or [])[:6] if isinstance(notam_analysis, dict) else [],
            "arr": (notam_analysis.get("arr") or [])[:6] if isinstance(notam_analysis, dict) else [],
        },
    }


def llm_brief_report(req: BriefReportRequest) -> Optional[BriefReportResponse]:
    if not env_flag("LLM_BRIEF_REPORT", True) or not llm_available():
        return None
    system_prompt = (
        "You are a Turkish aviation briefing assistant. Return only valid JSON. "
        "Use only the provided METAR/TAF/NOTAM/risk data. Do not say the flight is safe, approved, "
        "or cancelled. Do not create or change risk scores. Explain the existing hybrid AI result in "
        "clear Turkish for a pilot/dispatcher. Keep text concise and operational. Mention that this is "
        "decision support and does not replace official operational authority."
    )
    payload = {
        "schema": {
            "summary": "short Turkish executive summary",
            "riskInterpretation": "why the given score/class was produced",
            "notamImpacts": ["short Turkish NOTAM impact bullets"],
            "weatherConcerns": ["short Turkish weather bullets"],
            "windConcerns": ["short Turkish wind bullets"],
            "alternateCommentary": "short Turkish alternate note",
            "confidenceNote": "short Turkish confidence note",
            "limitedAdjustment": "short Turkish limited adjustment note",
        },
        "brief": compact_brief_payload(req),
    }
    parsed = call_openai_json(system_prompt, payload, max_tokens=1200)
    if not isinstance(parsed, dict):
        return None
    try:
        report = BriefReportResponse(
            summary=str(parsed.get("summary") or "").strip()[:360],
            riskInterpretation=str(parsed.get("riskInterpretation") or "").strip()[:520],
            notamImpacts=[str(x).strip()[:240] for x in parsed.get("notamImpacts", []) if str(x).strip()][:6],
            weatherConcerns=[str(x).strip()[:220] for x in parsed.get("weatherConcerns", []) if str(x).strip()][:5],
            windConcerns=[str(x).strip()[:180] for x in parsed.get("windConcerns", []) if str(x).strip()][:4],
            alternateCommentary=str(parsed.get("alternateCommentary") or "").strip()[:300],
            confidenceNote=str(parsed.get("confidenceNote") or "").strip()[:260],
            limitedAdjustment=str(parsed.get("limitedAdjustment") or "").strip()[:260],
        )
        if not report.summary or not report.riskInterpretation:
            return None
        return report
    except Exception:
        return None


def deterministic_brief_report(req: BriefReportRequest) -> BriefReportResponse:
    brief = req.brief
    risk = brief.get("risk", {}) if isinstance(brief, dict) else {}
    airports = brief.get("airports", {}) if isinstance(brief, dict) else {}
    dep = (airports.get("dep") or {}).get("icao", "DEP")
    arr = (airports.get("arr") or {}).get("icao", "ARR")
    prediction = req.riskPrediction

    score = prediction.finalScore if prediction else int(risk.get("score") or 0)
    cls = prediction.riskClass if prediction else risk_class(score)
    drivers = prediction.drivers if prediction else [str(risk.get("primary_driver") or "Belirsiz")]

    met = brief.get("met", {}) if isinstance(brief, dict) else {}
    dep_met = ((met.get("dep") or [None])[0] or {}) if isinstance(met, dict) else {}
    parsed = parsed_met(dep_met)
    weather_concerns: List[str] = []
    weather_assessment = prediction.weatherAssessment if prediction else {}
    if parsed.get("vis") is not None:
        weather_concerns.append(f"DEP görüş: {parsed.get('vis')} m")
    if parsed.get("ceiling") is not None:
        weather_concerns.append(f"DEP tavan: {parsed.get('ceiling')} ft")
    if parsed.get("wx"):
        weather_concerns.append(f"WX: {', '.join(str(x) for x in parsed.get('wx'))}")
    if isinstance(weather_assessment, dict):
        for item in weather_assessment.get("categories", []):
            if item.get("status") in ("high", "watch"):
                weather_concerns.append(f"{item.get('label')}: {item.get('detail')}")
        if weather_assessment.get("floorApplied"):
            weather_concerns.append(f"METAR guardrail floor applied: {weather_assessment.get('floorScore')}")
    if not weather_concerns:
        weather_concerns.append("METAR içinde belirgin ayrıştırılmış hava riski yok veya veri sınırlı.")

    wind_concerns = [
        f"Headwind: {risk.get('headwind', 0)} kt",
        f"Crosswind: {risk.get('crosswind', 0)} kt",
    ]

    notam_impacts: List[str] = []
    for group_name, items in req.notamAnalysis.items():
        for item in items:
            if item.severity in ("Critical", "Medium"):
                notam_impacts.append(f"{group_name.upper()}: {item.summary}")
    if not notam_impacts:
        notam_impacts.append("Kritik veya orta seviye NOTAM etkisi saptanmadı.")

    alternates = risk.get("alternateDetails") or []
    if alternates:
        top = alternates[0]
        alternate_text = f"İlk alternate adayı {top.get('icao')} olarak öne çıkıyor; {top.get('reason_summary') or 'detaylı gerekçe sınırlı.'}"
    else:
        alternate_text = "Alternate önerisi üretilemedi veya veri sınırlı."

    confidence = prediction.confidence if prediction else risk.get("confidence") or {}
    adjustment = prediction.limitedAdjustment if prediction else {}
    adjustment_text = str(adjustment.get("reason") or "Sınırlı düzeltme uygulanmadı.")

    return BriefReportResponse(
        summary=f"{dep}-{arr} briefing için hibrit AI değerlendirmesi: final skor {score}/100, sınıf {cls}.",
        riskInterpretation=f"Baskın etkenler: {', '.join(drivers)}. Bu çıktı karar destek amaçlıdır; operasyonel otorite yerine geçmez.",
        notamImpacts=notam_impacts[:5],
        weatherConcerns=weather_concerns[:4],
        windConcerns=wind_concerns,
        alternateCommentary=alternate_text,
        confidenceNote=f"Confidence: {confidence.get('level', 'medium')} ({confidence.get('score', '-')}).",
        limitedAdjustment=adjustment_text,
    )


@app.post("/ai/brief/report", response_model=BriefReportResponse)
def brief_report(req: BriefReportRequest):
    return llm_brief_report(req) or deterministic_brief_report(req)
