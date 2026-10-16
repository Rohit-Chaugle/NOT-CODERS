"""Generative AI layer router.

Provides endpoints for:
- POST /ai/recommendations: prioritized actionable recommendations with savings estimates.
- POST /ai/report: markdown sustainability report + PDF export.
- GET  /ai/report/pdf: direct downloadable PDF file.
- POST /ai/chat: campus state chat assistant.
- GET  /ai/provider: active LLM provider status.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query, Request, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import copilot, llm

router = APIRouter(prefix="/ai", tags=["ai"])


class RecommendationsPayload(BaseModel):
    open_issues: list[dict[str, Any]] | None = None
    recent_stats: dict[str, Any] | None = None


class ReportPayload(BaseModel):
    period: str | None = None
    format: str | None = None  # "json" | "pdf"


class ChatMessage(BaseModel):
    role: str = "user"
    content: str


class ChatPayload(BaseModel):
    messages: list[ChatMessage] | list[dict[str, Any]] | None = None
    message: str | None = None
    question: str | None = None


@router.post("/recommendations")
@router.get("/recommendations")
def get_recommendations(
    payload: RecommendationsPayload | None = None,
    db: Session = Depends(get_db),
) -> dict:
    """Takes open issues and recent stats (or queries DB) and returns prioritized recommendations."""
    raw_issues = payload.open_issues if payload else None
    raw_stats = payload.recent_stats if payload else None
    return copilot.recommendations(db, open_issues=raw_issues, recent_stats=raw_stats)


@router.post("/report")
@router.get("/report")
def get_sustainability_report(
    payload: ReportPayload | None = None,
    format: str | None = Query(None, description="Set to 'pdf' to download PDF directly"),
    db: Session = Depends(get_db),
) -> Any:
    """Generates a sustainability report in markdown with score, metrics, trends, and PDF export."""
    target_format = format or (payload.format if payload else None)

    if target_format == "pdf":
        pdf_bytes = copilot.get_report_pdf_bytes(db)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=campus-sustainability-report.pdf"},
        )

    return copilot.build_report(db)


@router.get("/report/pdf")
@router.post("/report/pdf")
def download_report_pdf(db: Session = Depends(get_db)) -> Response:
    """Download the campus sustainability report as a PDF document."""
    pdf_bytes = copilot.get_report_pdf_bytes(db)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=campus-sustainability-report.pdf"},
    )


@router.post("/chat")
def chat_assistant(payload: ChatPayload, db: Session = Depends(get_db)) -> dict:
    """Chat assistant answering questions about the current campus digital twin state."""
    if payload.messages:
        # Convert any ChatMessage models to dicts
        msgs = [m.model_dump() if hasattr(m, "model_dump") else m for m in payload.messages]
    elif payload.message or payload.question:
        msgs = [{"role": "user", "content": payload.message or payload.question}]
    else:
        msgs = []
    return copilot.chat(db, msgs)


@router.get("/provider")
def provider_status() -> dict:
    """Returns active LLM provider configuration and status."""
    return llm.info().to_dict()
