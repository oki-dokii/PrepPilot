from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel

from app.core.database import get_db
from app.models.models import User, Problem, MCQ, DifficultyEnum
from app.routers.auth import get_current_user

router = APIRouter()

# ─── Schemas ──────────────────────────────────────────────────────────────────

class ProblemLibraryResponse(BaseModel):
    id: str
    title: str
    difficulty: DifficultyEnum
    topic_tags: List[str]
    created_at: datetime

class MCQLibraryResponse(BaseModel):
    id: str
    question: str
    difficulty: DifficultyEnum
    topic_tags: List[str]
    created_at: datetime


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/problems", response_model=List[ProblemLibraryResponse])
async def get_library_problems(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all saved coding problems from the Question Bank."""
    res = await db.execute(
        select(Problem.id, Problem.title, Problem.difficulty, Problem.topic_tags, Problem.created_at)
        .order_by(Problem.created_at.desc())
    )
    problems = res.all()
    return [
        ProblemLibraryResponse(
            id=p.id,
            title=p.title,
            difficulty=p.difficulty,
            topic_tags=p.topic_tags,
            created_at=p.created_at,
        )
        for p in problems
    ]


@router.get("/mcqs", response_model=List[MCQLibraryResponse])
async def get_library_mcqs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all saved MCQs from the Question Bank."""
    res = await db.execute(
        select(MCQ.id, MCQ.question, MCQ.difficulty, MCQ.topic_tags, MCQ.created_at)
        .order_by(MCQ.created_at.desc())
    )
    mcqs = res.all()
    return [
        MCQLibraryResponse(
            id=m.id,
            question=m.question[:150] + "..." if len(m.question) > 150 else m.question,
            difficulty=m.difficulty,
            topic_tags=m.topic_tags,
            created_at=m.created_at,
        )
        for m in mcqs
    ]
