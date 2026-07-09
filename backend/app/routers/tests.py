from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional

from app.core.database import get_db
from app.models.models import Test, TestQuestion, Problem, MCQ, User
from app.routers.auth import get_current_user

router = APIRouter()


class TestSpec(BaseModel):
    topic: str
    difficulty: str = "medium"
    style: Optional[str] = None   # e.g. "Microsoft", "Google"
    duration_minutes: int = 90
    blueprint: Optional[list] = None


class ManualTestQuestion(BaseModel):
    type: str # "mcq" or "coding"
    id: str

class ManualTestSpec(BaseModel):
    title: str = "Custom Manual Test"
    duration_minutes: int = 90
    questions: list[ManualTestQuestion]


class TestResponse(BaseModel):
    id: str
    spec: dict
    duration_minutes: int
    question_count: int

    class Config:
        from_attributes = True


@router.post("/generate", response_model=TestResponse)
async def generate_test(
    spec: TestSpec,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Enqueue a test-generation job and return the test stub."""
    # Validate blueprint items before passing to LLM/DB
    VALID_TYPES = {"mcq", "coding"}
    VALID_DIFFICULTIES = {"easy", "medium", "hard"}
    if spec.blueprint:
        for i, item in enumerate(spec.blueprint):
            if not isinstance(item, dict):
                raise HTTPException(status_code=400, detail=f"Blueprint item {i} must be an object.")
            if item.get("type") not in VALID_TYPES:
                raise HTTPException(status_code=400, detail=f"Blueprint item {i}: 'type' must be 'mcq' or 'coding'.")
            if item.get("difficulty") and item.get("difficulty").lower() not in VALID_DIFFICULTIES:
                raise HTTPException(status_code=400, detail=f"Blueprint item {i}: 'difficulty' must be easy/medium/hard.")
            if not isinstance(item.get("topic", ""), str) or len(item.get("topic", "")) > 200:
                raise HTTPException(status_code=400, detail=f"Blueprint item {i}: 'topic' must be a string ≤200 chars.")

    from app.services.test_gen import generate_test_sync

    test = await generate_test_sync(
        user_id=current_user.id,
        spec=spec.model_dump(),
        db=db,
    )
    from sqlalchemy import select, func
    from app.models.models import TestQuestion
    result = await db.execute(
        select(func.count()).select_from(TestQuestion).where(TestQuestion.test_id == test.id)
    )
    question_count = result.scalar() or 0
    return TestResponse(
        id=test.id,
        spec=test.spec,
        duration_minutes=test.duration_minutes,
        question_count=question_count,
    )


@router.post("/manual", response_model=TestResponse)
async def create_manual_test(
    spec: ManualTestSpec,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Instantly create a test from existing MCQs and Problems."""
    if not spec.questions:
        raise HTTPException(status_code=400, detail="Must provide at least one question.")
    
    # Verify all questions exist before creating test
    for q in spec.questions:
        if q.type == "mcq":
            res = await db.execute(select(MCQ.id).where(MCQ.id == q.id))
            if not res.scalar_one_or_none():
                raise HTTPException(status_code=404, detail=f"MCQ {q.id} not found")
        elif q.type == "coding":
            res = await db.execute(select(Problem.id).where(Problem.id == q.id))
            if not res.scalar_one_or_none():
                raise HTTPException(status_code=404, detail=f"Problem {q.id} not found")
        else:
            raise HTTPException(status_code=400, detail="Question type must be 'mcq' or 'coding'")

    # Create the Test record
    test = Test(
        user_id=current_user.id,
        spec={"topic": spec.title, "difficulty": "mixed", "style": "Manual"},
        duration_minutes=spec.duration_minutes,
    )
    db.add(test)
    await db.flush()

    # Link questions
    for idx, q in enumerate(spec.questions):
        tq = TestQuestion(
            test_id=test.id,
            order=idx,
            question_type=q.type,
            mcq_id=q.id if q.type == "mcq" else None,
            problem_id=q.id if q.type == "coding" else None
        )
        db.add(tq)
    
    await db.commit()
    
    return TestResponse(
        id=test.id,
        spec=test.spec,
        duration_minutes=test.duration_minutes,
        question_count=len(spec.questions),
    )



@router.get("/{test_id}", response_model=TestResponse)
async def get_test(
    test_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Test).where(Test.id == test_id, Test.user_id == current_user.id))
    test = result.scalar_one_or_none()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")

    result2 = await db.execute(select(TestQuestion).where(TestQuestion.test_id == test_id))
    questions = result2.scalars().all()
    return TestResponse(
        id=test.id,
        spec=test.spec,
        duration_minutes=test.duration_minutes,
        question_count=len(questions),
    )
