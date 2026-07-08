from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, timedelta

from app.core.database import get_db
from app.core.redis_client import cache_session, get_cached_session, invalidate_session
from app.models.models import Session, Test, TestQuestion, Problem, MCQ, User, SessionStatus
from app.routers.auth import get_current_user
router = APIRouter()

async def background_grade_session(session_id: str):
    from app.services.grading import grade_session
    from app.core.database import async_session_maker
    async with async_session_maker() as db:
        try:
            await grade_session(session_id=session_id, db=db)
            await db.commit()
        except Exception as e:
            from app.core.redis_client import set_grading_status
            import logging
            logging.getLogger(__name__).error(f"Grading failed for {session_id}: {e}")
            await set_grading_status(session_id, "error")


# ─── Schemas ──────────────────────────────────────────────────────────────────

class SessionCreate(BaseModel):
    test_id: str

class MCQQuestionOut(BaseModel):
    id: str
    question: str
    options: dict
    topic_tags: List[str]
    difficulty: str

class CodingQuestionOut(BaseModel):
    id: str
    title: str
    statement: str
    constraints: Optional[str]
    sample_input: Optional[str]
    sample_output: Optional[str]
    time_limit_ms: int
    memory_limit_mb: int
    topic_tags: List[str]
    difficulty: str

class QuestionOut(BaseModel):
    order: int
    question_type: str
    mcq: Optional[MCQQuestionOut] = None
    coding: Optional[CodingQuestionOut] = None

class SessionResponse(BaseModel):
    id: str
    test_id: str
    status: str
    started_at: Optional[datetime]
    expires_at: Optional[datetime]
    questions: List[QuestionOut] = []
    mcq_answers: Optional[dict] = None
    code_submissions: Optional[dict] = None

class SessionListItem(BaseModel):
    id: str
    test_id: str
    status: str
    started_at: Optional[datetime]
    submitted_at: Optional[datetime]
    topic: str
    difficulty: str
    style: Optional[str] = None
    score: Optional[int] = None


def _build_questions_out(questions_db) -> List[QuestionOut]:
    questions_out = []
    for q in questions_db:
        if q.question_type == "mcq" and q.mcq:
            questions_out.append(QuestionOut(
                order=q.order,
                question_type="mcq",
                mcq=MCQQuestionOut(
                    id=q.mcq.id,
                    question=q.mcq.question,
                    options=q.mcq.options,
                    topic_tags=q.mcq.topic_tags or [],
                    difficulty=q.mcq.difficulty.value,
                ),
            ))
        elif q.question_type == "coding" and q.problem:
            questions_out.append(QuestionOut(
                order=q.order,
                question_type="coding",
                coding=CodingQuestionOut(
                    id=q.problem.id,
                    title=q.problem.title,
                    statement=q.problem.statement,
                    constraints=q.problem.constraints,
                    sample_input=q.problem.sample_input,
                    sample_output=q.problem.sample_output,
                    time_limit_ms=q.problem.time_limit_ms,
                    memory_limit_mb=q.problem.memory_limit_mb,
                    topic_tags=q.problem.topic_tags or [],
                    difficulty=q.problem.difficulty.value,
                ),
            ))
    return questions_out


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[SessionListItem])
async def list_sessions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Session)
        .where(Session.user_id == current_user.id)
        .order_by(Session.started_at.desc())
        .options(selectinload(Session.test), selectinload(Session.report))
    )
    sessions = result.scalars().all()
    
    items = []
    for s in sessions:
        spec = s.test.spec or {}
        items.append(SessionListItem(
            id=s.id,
            test_id=s.test_id,
            status=s.status.value,
            started_at=s.started_at,
            submitted_at=s.submitted_at,
            topic=spec.get("topic", "DSA"),
            difficulty=spec.get("difficulty", "medium"),
            style=spec.get("style"),
            score=s.report.total_score if s.report else None
        ))
    return items


@router.post("/", response_model=SessionResponse)
async def create_session(
    data: SessionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Test).where(Test.id == data.test_id, Test.user_id == current_user.id)
    )
    test = result.scalar_one_or_none()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")

    now = datetime.now(timezone.utc)
    session = Session(
        test_id=test.id,
        user_id=current_user.id,
        started_at=now,
        expires_at=now + timedelta(minutes=test.duration_minutes),
        status=SessionStatus.active,
    )
    db.add(session)
    await db.flush()
    await db.refresh(session)

    result2 = await db.execute(
        select(TestQuestion)
        .where(TestQuestion.test_id == test.id)
        .order_by(TestQuestion.order)
        .options(selectinload(TestQuestion.problem), selectinload(TestQuestion.mcq))
    )
    questions_db = result2.scalars().all()
    questions_out = _build_questions_out(questions_db)

    # Cache session in Redis for fast live-test reads
    await cache_session(session.id, {
        "status": session.status.value,
        "expires_at": session.expires_at.isoformat(),
        "user_id": current_user.id,
    }, ttl_seconds=test.duration_minutes * 60 + 300)

    return SessionResponse(
        id=session.id,
        test_id=session.test_id,
        status=session.status.value,
        started_at=session.started_at,
        expires_at=session.expires_at,
        questions=questions_out,
    )


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Fast path: check Redis cache first for status
    cached = await get_cached_session(session_id)

    result = await db.execute(
        select(Session).where(Session.id == session_id, Session.user_id == current_user.id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Server-authoritative expiry check
    if session.status == SessionStatus.active:
        now = datetime.now(timezone.utc)
        if session.expires_at and now > session.expires_at:
            session.status = SessionStatus.expired
            await db.flush()
            await invalidate_session(session_id)

    # Load questions for all sessions
    result2 = await db.execute(
        select(TestQuestion)
        .where(TestQuestion.test_id == session.test_id)
        .order_by(TestQuestion.order)
        .options(selectinload(TestQuestion.problem), selectinload(TestQuestion.mcq))
    )
    questions_db = result2.scalars().all()
    questions_out = _build_questions_out(questions_db)

    mcq_answers_out = {}
    code_submissions_out = {}

    if session.status != SessionStatus.active:
        from app.models.models import MCQAnswer, Submission
        
        # Load MCQ Answers
        user_answers = {}
        mcq_ans_res = await db.execute(
            select(MCQAnswer).where(MCQAnswer.session_id == session_id)
        )
        for ans in mcq_ans_res.scalars().all():
            user_answers[ans.mcq_id] = ans

        for q in questions_db:
            if q.question_type == "mcq" and q.mcq:
                ans = user_answers.get(q.mcq.id)
                mcq_answers_out[q.mcq.id] = {
                    "chosen_option": ans.chosen_option if ans else None,
                    "is_correct": ans.is_correct if ans else False,
                    "correct_option": q.mcq.correct_option
                }

        # Load Code Submissions (get the most recent one per problem)
        sub_res = await db.execute(
            select(Submission)
            .where(Submission.session_id == session_id)
            .order_by(Submission.submitted_at.desc())
        )
        for sub in sub_res.scalars().all():
            if sub.problem_id not in code_submissions_out:
                code_submissions_out[sub.problem_id] = {
                    "code": sub.code,
                    "language": sub.language,
                    "verdict": sub.verdict.value,
                }

    return SessionResponse(
        id=session.id,
        test_id=session.test_id,
        status=session.status.value,
        started_at=session.started_at,
        expires_at=session.expires_at,
        questions=questions_out,
        mcq_answers=mcq_answers_out,
        code_submissions=code_submissions_out,
    )


@router.post("/{session_id}/submit")
async def submit_session(
    session_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Session).where(Session.id == session_id, Session.user_id == current_user.id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status not in (SessionStatus.active, SessionStatus.expired):
        raise HTTPException(status_code=400, detail="Session already submitted")

    session.status = SessionStatus.submitted
    session.submitted_at = datetime.now(timezone.utc)
    await db.flush()
    await invalidate_session(session_id)

    # Grade asynchronously using BackgroundTasks
    background_tasks.add_task(background_grade_session, session_id)

    return {"message": "Session submitted. Grading in progress.", "session_id": session_id}
