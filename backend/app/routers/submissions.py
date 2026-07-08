from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional

from app.core.database import get_db
from app.models.models import Submission, MCQAnswer, Session, SessionStatus, User, Verdict
from app.routers.auth import get_current_user

router = APIRouter()


class CodeSubmit(BaseModel):
    session_id: str
    problem_id: str
    code: str
    language: str  # "python3" | "javascript" | "cpp"

class MCQSubmit(BaseModel):
    session_id: str
    mcq_id: str
    chosen_option: str

class SubmissionResponse(BaseModel):
    id: str
    verdict: str
    runtime_ms: Optional[int]
    passed_hidden_count: int
    total_hidden_count: int
    error_output: Optional[str] = None


@router.post("/code", response_model=SubmissionResponse)
async def submit_code(
    data: CodeSubmit,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Validate session
    result = await db.execute(
        select(Session).where(Session.id == data.session_id, Session.user_id == current_user.id)
    )
    session = result.scalar_one_or_none()
    if not session or session.status != SessionStatus.active:
        raise HTTPException(status_code=400, detail="Session not active")

    from app.services.judge import run_against_hidden_tests

    verdict, runtime_ms, passed, total, error_output = await run_against_hidden_tests(
        problem_id=data.problem_id,
        code=data.code,
        language=data.language,
        db=db,
    )

    submission = Submission(
        session_id=data.session_id,
        problem_id=data.problem_id,
        code=data.code,
        language=data.language,
        verdict=verdict,
        runtime_ms=runtime_ms,
        passed_hidden_count=passed,
        total_hidden_count=total,
    )
    db.add(submission)
    await db.flush()
    await db.refresh(submission)

    return SubmissionResponse(
        id=submission.id,
        verdict=submission.verdict.value,
        runtime_ms=submission.runtime_ms,
        passed_hidden_count=submission.passed_hidden_count,
        total_hidden_count=submission.total_hidden_count,
        error_output=error_output,
    )


@router.post("/mcq")
async def submit_mcq(
    data: MCQSubmit,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.models.models import MCQ
    result = await db.execute(
        select(Session).where(Session.id == data.session_id, Session.user_id == current_user.id)
    )
    session = result.scalar_one_or_none()
    if not session or session.status != SessionStatus.active:
        raise HTTPException(status_code=400, detail="Session not active")

    mcq_result = await db.execute(select(MCQ).where(MCQ.id == data.mcq_id))
    mcq = mcq_result.scalar_one_or_none()
    if not mcq:
        raise HTTPException(status_code=404, detail="MCQ not found")

    is_correct = data.chosen_option.upper() == mcq.correct_option.upper()
    answer = MCQAnswer(
        session_id=data.session_id,
        mcq_id=data.mcq_id,
        chosen_option=data.chosen_option.upper(),
        is_correct=is_correct,
    )
    db.add(answer)
    await db.flush()

    return {"is_correct": is_correct, "correct_option": mcq.correct_option}
