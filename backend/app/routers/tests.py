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
