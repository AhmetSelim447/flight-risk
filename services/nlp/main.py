from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Literal

class NotamIn(BaseModel):
    raw: str

class ParseRequest(BaseModel):
    items: List[NotamIn]

class NotamOut(BaseModel):
    raw: str
    severity: Literal["Critical","Medium","Info"]
    impacts: List[Literal["runway","nav","ops_hours"]]
    summary: str

app = FastAPI(title="NOTAM NLP (mock)")

@app.get("/health")
def health():
    return {"ok": True}

def rule_engine(raw: str) -> NotamOut:
    txt = raw.upper()
    if "RWY" in txt and "CLSD" in txt:
        return NotamOut(raw=raw, severity="Critical", impacts=["runway"], summary="Runway closed")
    if "AD OPR HR" in txt:
        return NotamOut(raw=raw, severity="Medium", impacts=["ops_hours"], summary="Operating hours restriction")
    if "ILS" in txt and ("U/S" in txt or "OUT OF SERVICE" in txt):
        return NotamOut(raw=raw, severity="Medium", impacts=["nav"], summary="ILS outage")
    return NotamOut(raw=raw, severity="Info", impacts=[], summary="Info")

@app.post("/nlp/notam/parse", response_model=List[NotamOut])
def parse(req: ParseRequest):
    return [rule_engine(i.raw) for i in req.items]
