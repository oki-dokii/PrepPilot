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
        )

    return ReportResponse(
        id=report.id,
        session_id=report.session_id,
        mcq_score=report.mcq_score,
        coding_score=report.coding_score,
        total_score=report.total_score,
        weak_topics=report.weak_topics or [],
        summary=report.summary,
        status="ready",
    )
