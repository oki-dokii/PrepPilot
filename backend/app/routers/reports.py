from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from typing import Optional, List

from app.core.database import get_db
from app.models.models import Report, Session, User
from app.routers.auth import get_current_user

router = APIRouter()


class ReportResponse(BaseModel):
    id: str
    session_id: str
    mcq_score: int
    coding_score: int
    total_score: int
    weak_topics: List[str]
    summary: Optional[dict]
    status: str  # "ready" | "processing"
    tab_switches: int = 0
    paste_bursts: int = 0


@router.get("/{session_id}", response_model=ReportResponse)
async def get_report(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Validate session belongs to user
    session_result = await db.execute(
        select(Session).where(Session.id == session_id, Session.user_id == current_user.id)
    )
    session = session_result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    report_result = await db.execute(
        select(Report).where(Report.session_id == session_id)
    )
    report = report_result.scalar_one_or_none()

    if not report:
        return ReportResponse(
            id="",
            session_id=session_id,
            mcq_score=0,
            coding_score=0,
            total_score=0,
            weak_topics=[],
            summary=None,
            status="processing",
            tab_switches=session.tab_switches or 0,
            paste_bursts=session.paste_bursts or 0,
        )

    # Regenerate old placeholder/fallback reports if Gemini is now active
    summary = report.summary or {}
    overall = summary.get("overall_feedback", "")
    if "Anthropic" in overall or "unavailable" in overall:
        from app.services.llm import generate_feedback_with_gemini
        from app.core.config import settings
        if settings.GEMINI_API_KEY:
            try:
                ai_feedback = await generate_feedback_with_gemini(summary)
                if ai_feedback:
                    new_summary = dict(summary)
                    new_summary["overall_feedback"] = ai_feedback.get("overall_feedback", "")
                    new_summary["study_plan"] = ai_feedback.get("study_plan", [])
                    
                    # Merge question insights
                    if "questions" in new_summary:
                        insights = ai_feedback.get("question_insights", [])
                        insight_map = {item.get("title", ""): item for item in insights}
                        
                        for q in new_summary["questions"]:
                            if q.get("title") in insight_map:
                                insight = insight_map[q["title"]]
                                if "explanation" in insight:
                                    q["explanation"] = insight["explanation"]
                                if "approach" in insight:
                                    q["approach"] = insight["approach"]
                                if "complexity" in insight:
                                    q["complexity"] = insight["complexity"]
                    
                    report.summary = new_summary
                    db.add(report)
                    await db.flush()
            except Exception:
                pass

    return ReportResponse(
        id=report.id,
        session_id=report.session_id,
        mcq_score=report.mcq_score,
        coding_score=report.coding_score,
        total_score=report.total_score,
        weak_topics=report.weak_topics or [],
        summary=report.summary,
        status="ready",
        tab_switches=session.tab_switches or 0,
        paste_bursts=session.paste_bursts or 0,
    )
