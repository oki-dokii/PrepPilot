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
            logger.error(f"Batch Gemini generation failed catastrophically: {e}.")
            from fastapi import HTTPException
            raise HTTPException(status_code=500, detail=f"Failed to generate test with AI: {e}")

    mcq_pool = iter(batch_data["mcqs"])
    problem_pool = iter(batch_data["problems"])

    order = 0
    for item in blueprint:
        q_type = item.get("type")
        q_topic = item.get("topic", "DSA")
        q_diff = item.get("difficulty", "medium")

        if q_type == "mcq":
            data = next(mcq_pool, None)
            if not data:
                from fastapi import HTTPException
                raise HTTPException(status_code=500, detail=f"AI failed to generate enough MCQ questions for topic {q_topic}")

            mcq = MCQ(
                topic_tags=data.get("topic_tags", [q_topic.lower()]),
                difficulty=_coerce_difficulty(data.get("difficulty", q_diff)),
                question=data.get("question", "Question text missing"),
                options=data.get("options", {"A": "A", "B": "B", "C": "C", "D": "D"}),
                correct_option=data.get("correct_option", data.get("correct_answer", "A")),
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
                        # Generate boilerplate for standard style
                        p_style = data.get("problem_style", "standard")
                        input_schema = data.get("input_schema")
                        output_type = data.get("output_type")
                        
                        starter_code_dict = data.get("starter_code") if isinstance(data.get("starter_code"), dict) else None
                        driver_code_dict = data.get("driver_code") if isinstance(data.get("driver_code"), dict) else None
                        
                        if starter_code_dict:
                            for k, v in starter_code_dict.items():
                                if isinstance(v, str): starter_code_dict[k] = v.replace("\\n", "\n")
                        if driver_code_dict:
                            for k, v in driver_code_dict.items():
                                if isinstance(v, str): driver_code_dict[k] = v.replace("\\n", "\n")
                        
                        if p_style == "standard" and input_schema and output_type:
                            from app.services.boilerplate import generate_standard_boilerplate
                            starter_code_dict = generate_standard_boilerplate(input_schema, output_type)
                        
                        official_solution = data.get("official_solution", "")
                        if isinstance(official_solution, str):
                            official_solution = official_solution.replace("\\n", "\n")
                            
                        problem = Problem(
                            title=data.get("title", "Untitled Problem"),
                            topic_tags=data.get("topic_tags", [q_topic.lower()]),
                            difficulty=_coerce_difficulty(data.get("difficulty", q_diff)),
                            statement=data.get("statement", "Statement missing"),
                            constraints=data.get("constraints", ""),
                            sample_input=data.get("sample_input", ""),
                            sample_output=data.get("sample_output", ""),
                            official_solution=official_solution,
                            problem_style=p_style,
                            starter_code=data.get("starter_code") if isinstance(data.get("starter_code"), str) else None,
                            driver_code=data.get("driver_code") if isinstance(data.get("driver_code"), str) else None,
                            starter_code_dict=starter_code_dict,
                            driver_code_dict=data.get("driver_code") if isinstance(data.get("driver_code"), dict) else None,
                            input_schema=input_schema,
                            output_type=output_type,
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
                                is_hidden=tc.get("is_hidden", False),
                                category=tc.get("category", "sample"),
                            ))
                        await db.flush()

                        # Pass 2: Generate hidden exhaustive test cases
                        from app.services.llm import generate_hidden_test_cases_with_gemini
                        try:
                            hidden_test_cases = await generate_hidden_test_cases_with_gemini(data)
                            for tc in hidden_test_cases:
                                tc_input = tc["input"]
                                if not tc_input or not tc_input.strip():
                                    tc_input = "{}"
                                tc_db = TestCase(
                                    problem_id=problem.id,
                                    input=tc_input,
                                    expected_output=tc.get("expected", ""),
                                    is_hidden=True,
                                    category=tc.get("category", "random"),
                                )
                                db.add(tc_db)
                                # Append to data so the fixer LLM sees them if validation fails
                                data.setdefault("test_cases", []).append({
                                    "input": tc_input,
                                    "expected": tc.get("expected", ""),
                                    "is_hidden": True,
                                    "category": tc.get("category", "random")
                                })
                            await db.flush()
                        except Exception as e:
                            logger.error(f"Failed to generate hidden test cases: {e}")

                        if problem.official_solution:
                            verdict, _, _, _, err = await run_against_hidden_tests(problem.id, problem.official_solution, "python3", db, is_validation=True, update_expected_outputs=True)
                            if verdict != Verdict.accepted:
                                if "401 Unauthorized" in str(err) or "Execution Error" in str(err) or (verdict == Verdict.runtime_error and "Client error" in str(err)):
                                    logger.warning(f"Skipping validation for '{problem.title}' due to sandbox API error: {err}")
                                else:
                                    logger.warning(f"Validation failed for '{problem.title}': {verdict} - {err}. Attempting fix...")
                                    from app.services.llm import fix_generated_problem_with_gemini
                                    from sqlalchemy import delete
                                    
                                    # Ask LLM to fix it
                                    fixed_data = await fix_generated_problem_with_gemini(data, str(err))
                                    
                                    # Apply fixes
                                    problem.title = fixed_data.get("title", problem.title)
                                    problem.statement = fixed_data.get("statement", problem.statement)
                                    
                                    new_sol = fixed_data.get("official_solution", problem.official_solution)
                                    if isinstance(new_sol, dict):
                                        new_sol = new_sol.get("python3", problem.official_solution)
                                    if isinstance(new_sol, str):
                                        new_sol = new_sol.replace("\\n", "\n")
                                    problem.official_solution = new_sol
                                    
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
                                    verdict, _, _, _, err = await run_against_hidden_tests(problem.id, problem.official_solution, "python3", db, is_validation=True, update_expected_outputs=True)
                                    if verdict != Verdict.accepted:
                                        if "401 Unauthorized" in str(err) or "Execution Error" in str(err) or (verdict == Verdict.runtime_error and "Client error" in str(err)):
                                            logger.warning(f"Skipping re-validation for '{problem.title}' due to sandbox API error: {err}")
                                        else:
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
                from fastapi import HTTPException
                raise HTTPException(status_code=500, detail=f"AI failed to generate a valid coding problem for topic {q_topic}")

            tq = TestQuestion(test_id=test.id, problem_id=problem.id, order=order, question_type="coding")
            db.add(tq)
            order += 1

    return test
