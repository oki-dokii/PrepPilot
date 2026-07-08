"""
Test generation service — generates the full test in a single batched Gemini call
to avoid hitting rate limits from multiple sequential API calls.
"""
import uuid
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.models import Test, TestQuestion, Problem, MCQ, DifficultyEnum, TestCase

logger = logging.getLogger(__name__)


async def generate_test_sync(user_id: str, spec: dict, db: AsyncSession) -> Test:
    from app.services.llm import generate_full_test_with_gemini, _get_stub_mcqs, _get_stub_problem, _coerce_difficulty
    from app.core.config import settings

    test = Test(
        user_id=user_id,
        spec=spec,
        duration_minutes=spec.get("duration_minutes", 90),
    )
    db.add(test)
    await db.flush()

    blueprint = spec.get("blueprint", [])
    style = spec.get("style")

    if not blueprint:
        # Fallback: old-style 3 MCQ + 2 coding
        blueprint = [
            {"type": "mcq", "topic": "DSA", "difficulty": "medium"},
            {"type": "mcq", "topic": "DSA", "difficulty": "medium"},
            {"type": "mcq", "topic": "DSA", "difficulty": "medium"},
            {"type": "coding", "topic": "Arrays", "difficulty": "easy"},
            {"type": "coding", "topic": "Graphs", "difficulty": "medium"},
        ]

    # ── Try one single batch Gemini call for the entire test ──────────────────
    batch_data = None
    if settings.GEMINI_API_KEY:
        try:
            batch_data = await generate_full_test_with_gemini(blueprint, style=style)
            logger.info(f"Batch generation succeeded: {len(batch_data.get('mcqs', []))} MCQs, {len(batch_data.get('problems', []))} problems")
        except Exception as e:
            logger.warning(f"Batch Gemini generation failed: {e}. Falling back to stubs.")
            batch_data = None

    mcq_pool = iter(batch_data["mcqs"]) if batch_data and batch_data.get("mcqs") else iter([])
    problem_pool = iter(batch_data["problems"]) if batch_data and batch_data.get("problems") else iter([])

    order = 0
    for item in blueprint:
        q_type = item.get("type")
        q_topic = item.get("topic", "DSA")
        q_diff = item.get("difficulty", "medium")

        if q_type == "mcq":
            # Try next from batch, fallback to stub
            data = next(mcq_pool, None)
            if not data:
                stub_list = _get_stub_mcqs(q_topic, 1)
                data = stub_list[0] if stub_list else _get_stub_mcqs("Arrays", 1)[0]

            mcq = MCQ(
                topic_tags=data.get("topic_tags", [q_topic.lower()]),
                difficulty=_coerce_difficulty(data.get("difficulty", q_diff)),
                question=data["question"],
                options=data["options"],
                correct_option=data["correct_option"],
                explanation=data.get("explanation", ""),
            )
            db.add(mcq)
            await db.flush()

            tq = TestQuestion(test_id=test.id, mcq_id=mcq.id, order=order, question_type="mcq")
            db.add(tq)
            order += 1

        elif q_type == "coding":
            # Try next from batch, fallback to stub
            data = next(problem_pool, None)
            if not data:
                data = _get_stub_problem(q_topic)

            problem = Problem(
                title=data["title"],
                topic_tags=data.get("topic_tags", [q_topic.lower()]),
                difficulty=_coerce_difficulty(data.get("difficulty", q_diff)),
                statement=data["statement"],
                constraints=data.get("constraints", ""),
                sample_input=data.get("sample_input", ""),
                sample_output=data.get("sample_output", ""),
                time_limit_ms=2000,
                memory_limit_mb=256,
            )
            db.add(problem)
            await db.flush()

            for tc in data.get("test_cases", []):
                db.add(TestCase(
                    problem_id=problem.id,
                    input=tc["input"],
                    expected_output=tc["expected"],
                    is_hidden=tc.get("is_hidden", True),
                    category=tc.get("category", "random"),
                ))

            await db.flush()
            await db.refresh(problem)

            tq = TestQuestion(test_id=test.id, problem_id=problem.id, order=order, question_type="coding")
            db.add(tq)
            order += 1

    return test
