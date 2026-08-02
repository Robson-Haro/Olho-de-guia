"""FastAPI do motor multilíngue e da exportação Excel do Eureka."""

from __future__ import annotations

from io import BytesIO
import re
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from engine import analyze_job, intelligence_payload, rank_candidates
from spreadsheet import create_candidate_workbook


class JobInput(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    city: str = Field(default="", max_length=120)
    additionalCity: str = Field(default="", max_length=120)
    description: str = Field(default="", max_length=20_000)
    keywords: list[str] = Field(default_factory=list, max_length=12)
    nationwide: bool = False


class IntelligenceRequest(BaseModel):
    job: JobInput
    candidates: list[dict[str, Any]] = Field(default_factory=list, max_length=120)


class ExportRequest(BaseModel):
    job: JobInput
    candidates: list[dict[str, Any]] = Field(min_length=1, max_length=2_000)


app = FastAPI(
    title="Eureka Talent Intelligence",
    version="2.0.0",
    docs_url=None,
    redoc_url=None,
)


@app.get("/health")
@app.get("/svc/intelligence/health")
def health() -> dict[str, str]:
    return {"status": "ok", "engine": "python-multilingual"}


@app.post("/analyze")
@app.post("/svc/intelligence/analyze")
def analyze(request: IntelligenceRequest) -> dict[str, Any]:
    job = request.job.model_dump()
    if request.candidates:
        intelligence, ranked = rank_candidates(job, request.candidates)
    else:
        intelligence = analyze_job(job)
        ranked = []
    return {
        "ok": True,
        "engine": "Python 3 · motor multilíngue",
        "jobIntelligence": intelligence_payload(intelligence),
        "candidates": ranked,
        "guardrails": {
            "professionalEvidenceOnly": True,
            "sensitiveTraitsExcluded": True,
            "humanDecisionRequired": True,
        },
    }


@app.post("/export")
@app.post("/svc/intelligence/export")
def export(request: ExportRequest) -> StreamingResponse:
    try:
        content = create_candidate_workbook(request.job.model_dump(), request.candidates)
    except Exception as exc:  # pragma: no cover - serialização defensiva no endpoint
        raise HTTPException(status_code=500, detail="Não foi possível gerar a planilha.") from exc

    title = re.sub(r"[^a-zA-Z0-9_-]+", "-", request.job.title).strip("-")[:60] or "candidatos"
    filename = f"Eureka-{title}.xlsx"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return StreamingResponse(
        BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers,
    )
