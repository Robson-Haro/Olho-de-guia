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
    marketSegment: str = Field(default="", max_length=80)
    mappedCompanies: list[str] = Field(default_factory=list, max_length=40)
    countryCode: str = Field(default="BR", min_length=2, max_length=2)
    country: str = Field(default="Brasil", max_length=120)
    subdivision: str = Field(default="", max_length=120)
    cities: list[str] = Field(default_factory=list, max_length=20)
    cityCount: int = Field(default=1, ge=1, le=20)
    countrywide: bool = False
    city: str = Field(default="", max_length=120)
    additionalCity: str = Field(default="", max_length=120)
    description: str = Field(default="", max_length=20_000)
    keywords: list[str] = Field(default_factory=list, max_length=12)
    nationwide: bool = False
    # Chave de gênero. Vazia = desligada. O motor NÃO usa este campo na
    # pontuação: ele existe apenas para registrar na planilha e na auditoria
    # qual recorte de sourcing foi aplicado na camada de busca.
    genderKey: str = Field(default="", max_length=12)
    includeUnknownGender: bool = False
    # Vocabulário ampliado pela camada de leitura (Onda 2). Chega pronto da
    # camada TypeScript para que o ranking decida sobre EXATAMENTE o mesmo
    # conjunto de termos usado na busca. Vazio = só o léxico, como na Onda 1.
    roleCoreExtra: list[str] = Field(default_factory=list, max_length=80)
    domainConceptsExtra: list[list[str]] = Field(default_factory=list, max_length=20)
    titleVariantsExtra: list[str] = Field(default_factory=list, max_length=24)
    # Sinais da memória da vaga: títulos e termos que já produziram aprovação.
    learnedTitles: list[str] = Field(default_factory=list, max_length=12)
    learnedTerms: list[str] = Field(default_factory=list, max_length=24)
    learnedCompanies: list[str] = Field(default_factory=list, max_length=12)
    demotedTitles: list[str] = Field(default_factory=list, max_length=20)


class IntelligenceRequest(BaseModel):
    job: JobInput
    candidates: list[dict[str, Any]] = Field(default_factory=list, max_length=400)


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
        intelligence, ranked, expansion = rank_candidates(job, request.candidates)
    else:
        intelligence = analyze_job(job)
        ranked = []
        expansion = []
    return {
        "ok": True,
        "engine": "Python 3 · motor multilíngue",
        "jobIntelligence": intelligence_payload(intelligence),
        "candidates": ranked,
        # Perfis avaliados e reprovados, com o motivo explícito. Servem para
        # explicar uma busca sem aprovados — nunca entram na lista principal.
        "expansionCandidates": expansion[:20],
        "expansionCount": len(expansion),
        "guardrails": {
            "professionalEvidenceOnly": True,
            "sensitiveTraitsExcluded": True,
            "humanDecisionRequired": True,
            # A chave de gênero, quando ativa, atua apenas no recorte de
            # sourcing da camada de busca. Nenhum ponto de aderência é somado
            # ou subtraído por gênero em nenhuma etapa do motor.
            "genderKeyAffectsScore": False,
            "genderKey": job.get("genderKey") or "",
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
