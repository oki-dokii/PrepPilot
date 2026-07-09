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
        # Fallback: generic generic template (3 MCQ + 2 coding)
        blueprint = [
            {"type": "mcq", "topic": "DSA", "difficulty": "medium"},
            {"type": "mcq", "topic": "OS", "difficulty": "medium"},
            {"type": "mcq", "topic": "DBMS", "difficulty": "medium"},
            {"type": "coding", "topic": "Arrays", "difficulty": "easy"},
            {"type": "coding", "topic": "Graphs", "difficulty": "medium"},
        ]

    # ── Try batch LLM calls in chunks to avoid token limits ────────────────
    batch_data = {"mcqs": [], "problems": []}
    if settings.GROQ_API_KEY or settings.GEMINI_API_KEY:
        try:
            import asyncio
            chunk_size = 5
            for i in range(0, len(blueprint), chunk_size):
                chunk = blueprint[i:i + chunk_size]
                try:
                    res = await generate_full_test_with_gemini(chunk, style=style)
                    batch_data["mcqs"].extend(res.get("mcqs", []))
                    batch_data["problems"].extend(res.get("problems", []))
                except Exception as e:
                    logger.warning(f"A batch chunk failed: {e}")
                
                # Small delay to respect free tier rate limits for Gemini
                if i + chunk_size < len(blueprint):
                    if not settings.GROQ_API_KEY:
                        await asyncio.sleep(2)
                    else:
                        await asyncio.sleep(0.5)
            logger.info(f"Batch generation complete: {len(batch_data['mcqs'])} MCQs, {len(batch_data['problems'])} problems")
        except Exception as e:
            logger.warning(f"Batch Gemini generation failed catastrophically: {e}. Falling back to stubs.")

    mcq_pool = iter(batch_data["mcqs"])
    problem_pool = iter(batch_data["problems"])

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
            from app.services.judge import run_against_hidden_tests
            from app.models.models import Verdict
            from datetime import datetime, timezone

            data = next(problem_pool, None)
            valid_problem_created = False
            problem = None

            if data:
                try:
                    async with db.begin_nested():
                        problem = Problem(
                            title=data["title"],
                            topic_tags=data.get("topic_tags", [q_topic.lower()]),
                            difficulty=_coerce_difficulty(data.get("difficulty", q_diff)),
                            statement=data["statement"],
                            constraints=data.get("constraints", ""),
                            sample_input=data.get("sample_input", ""),
                            sample_output=data.get("sample_output", ""),
                            official_solution=data.get("official_solution", ""),
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

                        if problem.official_solution:
                            verdict, _, _, _, err = await run_against_hidden_tests(problem.id, problem.official_solution, "python3", db)
                            if verdict != Verdict.accepted:
                                logger.warning(f"Validation failed for '{problem.title}': {verdict} - {err}. Attempting fix...")
                                from app.services.llm import fix_generated_problem_with_gemini
                                from sqlalchemy import delete
                                
                                # Ask LLM to fix it
                                fixed_data = await fix_generated_problem_with_gemini(data, str(err))
                                
                                # Apply fixes
                                problem.title = fixed_data.get("title", problem.title)
                                problem.statement = fixed_data.get("statement", problem.statement)
                                problem.official_solution = fixed_data.get("official_solution", problem.official_solution)
                                problem.sample_input = fixed_data.get("sample_input", problem.sample_input)
                                problem.sample_output = fixed_data.get("sample_output", problem.sample_output)
                                
                                # Replace test cases
                                await db.execute(delete(TestCase).where(TestCase.problem_id == problem.id))
                                for tc in fixed_data.get("test_cases", []):
                                    db.add(TestCase(
                                        problem_id=problem.id,
                                        input=tc["input"],
                                        expected_output=tc["expected"],
                                        is_hidden=tc.get("is_hidden", True),
                                        category=tc.get("category", "random"),
                                    ))
                                await db.flush()
                                
                                # Re-validate
                                verdict, _, _, _, err = await run_against_hidden_tests(problem.id, problem.official_solution, "python3", db)
                                if verdict != Verdict.accepted:
                                    logger.warning(f"Validation failed again after fix for '{problem.title}': {verdict} - {err}")
                                    raise ValueError("Validation failed after self-correction retry")
                                else:
                                    logger.info(f"Self-correction succeeded for '{problem.title}'!")

                            problem.validated_at = datetime.now(timezone.utc)
                            logger.info(f"Problem '{problem.title}' passed self-validation.")

                        valid_problem_created = True
                except Exception as e:
                    logger.warning(f"Discarding generated problem due to failure: {e}")
                    valid_problem_created = False

            if not valid_problem_created:
                data = _get_stub_problem(q_topic)
                problem = Problem(
                    title=data["title"],
                    topic_tags=data.get("topic_tags", [q_topic.lower()]),
                    difficulty=_coerce_difficulty(data.get("difficulty", q_diff)),
                    statement=data["statement"],
                    constraints=data.get("constraints", ""),
                    sample_input=data.get("sample_input", ""),
                    sample_output=data.get("sample_output", ""),
                    official_solution=data.get("official_solution", ""),
                    time_limit_ms=2000,
                    memory_limit_mb=256,
                    validated_at=datetime.now(timezone.utc)
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

            tq = TestQuestion(test_id=test.id, problem_id=problem.id, order=order, question_type="coding")
            db.add(tq)
            order += 1

    return test
