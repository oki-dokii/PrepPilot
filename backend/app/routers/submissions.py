from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

from app.core.database import get_db
from app.models.models import Submission, MCQAnswer, Session, SessionStatus, User, Verdict
from app.routers.auth import get_current_user

router = APIRouter()


def _assert_session_open(session: Session) -> None:
    """
    Raises 400 if the session is not active, or if the wall-clock timer
    has already expired (even if the status hasn't been lazily updated yet).
    This is called in every submission endpoint so that POSTing past the
    deadline is rejected without requiring a prior GET /sessions/{id}.
    """
    if not session or session.status != SessionStatus.active:
        raise HTTPException(status_code=400, detail="Session not active")
    if session.expires_at and datetime.now(timezone.utc) > session.expires_at:
        raise HTTPException(status_code=400, detail="Session time limit exceeded")


class CodeSubmit(BaseModel):
    session_id: str
    problem_id: str
    code: str
    language: str  # "python3" | "javascript" | "cpp"
    is_run: bool = False

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
    # Validate session — also checks wall-clock expiry directly
    result = await db.execute(
        select(Session).where(Session.id == data.session_id, Session.user_id == current_user.id)
    )
    session = result.scalar_one_or_none()
    _assert_session_open(session)

    from app.services.judge import run_against_hidden_tests

    verdict, runtime_ms, passed, total, error_output = await run_against_hidden_tests(
        problem_id=data.problem_id,
        code=data.code,
        language=data.language,
        db=db,
        is_run=data.is_run,
    )

    if data.is_run:
        return SubmissionResponse(
            id="run-only",
            verdict=verdict.value,
            runtime_ms=runtime_ms,
            passed_hidden_count=passed,
            total_hidden_count=total,
            error_output=error_output,
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
    # Validate session — also checks wall-clock expiry directly
    result = await db.execute(
        select(Session).where(Session.id == data.session_id, Session.user_id == current_user.id)
    )
    session = result.scalar_one_or_none()
    _assert_session_open(session)

    mcq_result = await db.execute(select(MCQ).where(MCQ.id == data.mcq_id))
    mcq = mcq_result.scalar_one_or_none()
    if not mcq:
        raise HTTPException(status_code=404, detail="MCQ not found")

    # Check for duplicate answer (idempotency — don't double-record)
    existing = await db.execute(
        select(MCQAnswer).where(
            MCQAnswer.session_id == data.session_id,
            MCQAnswer.mcq_id == data.mcq_id,
        )
    )
    existing_record = existing.scalar_one_or_none()
    is_correct = data.chosen_option.upper() == mcq.correct_option.upper()

    if existing_record:
        existing_record.chosen_option = data.chosen_option.upper()
        existing_record.is_correct = is_correct
        await db.flush()
    else:
        answer = MCQAnswer(
            session_id=data.session_id,
            mcq_id=data.mcq_id,
            chosen_option=data.chosen_option.upper(),
            is_correct=is_correct,
        )
        db.add(answer)
        await db.flush()

    # IMPORTANT: Never return is_correct or correct_option during a live test.
    # Correctness is revealed only via the report after the session is submitted.
    return {"recorded": True}
