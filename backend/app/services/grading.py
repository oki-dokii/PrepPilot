"""
Grading & Feedback service — Chunk 9 implements real LLM grading.
This stub immediately generates a basic report from the submission data.
"""
import json
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.models import (
    Session, Submission, MCQAnswer, TestQuestion,
    Report, Verdict, SessionStatus
)
from app.core.redis_client import set_grading_status


async def grade_session(session_id: str, db: AsyncSession) -> Report:
    """
    Grades a submitted session and writes a Report.
    Stub version: counts correct answers, builds placeholder feedback.
    Chunk 9 replaces summary generation with Claude API calls.
    """
    await set_grading_status(session_id, "processing")

    # Load session + submissions + MCQ answers + test
    result = await db.execute(
        select(Session)
        .where(Session.id == session_id)
        .options(
            selectinload(Session.submissions).selectinload(Submission.problem),
            selectinload(Session.mcq_answers).selectinload(MCQAnswer.mcq),
            selectinload(Session.test),
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise ValueError(f"Session {session_id} not found")

    # Load test questions for ordering
    tq_result = await db.execute(
        select(TestQuestion)
        .where(TestQuestion.test_id == session.test_id)
        .order_by(TestQuestion.order)
    )
    test_questions = tq_result.scalars().all()

    # ── Score calculation ──────────────────────────────────────────────────────
    mcq_correct = sum(1 for a in session.mcq_answers if a.is_correct)
    mcq_total   = len(session.mcq_answers)

    # Take the best submission per problem
    best_by_problem: dict[str, Submission] = {}
    for sub in session.submissions:
        pid = sub.problem_id
        if pid not in best_by_problem or sub.verdict == Verdict.accepted:
            best_by_problem[pid] = sub

    coding_correct = sum(1 for s in best_by_problem.values() if s.verdict == Verdict.accepted)
    coding_total   = len(best_by_problem) or sum(1 for tq in test_questions if tq.question_type == "coding")

    total_score = mcq_correct + coding_correct

    # ── Build per-question feedback ────────────────────────────────────────────
    questions_feedback = []
    mcq_answers_map = {a.mcq_id: a for a in session.mcq_answers}

    for tq in test_questions:
        if tq.question_type == "mcq" and tq.mcq_id:
            ans = mcq_answers_map.get(tq.mcq_id)
            questions_feedback.append({
                "question_type": "mcq",
                "title": (ans.mcq.question[:80] + "…") if ans and ans.mcq else "MCQ",
                "is_correct": ans.is_correct if ans else False,
                "explanation": ans.mcq.explanation if ans and ans.mcq else "No explanation available.",
            })
        elif tq.question_type == "coding" and tq.problem_id:
            best = best_by_problem.get(tq.problem_id)
            is_correct = best.verdict == Verdict.accepted if best else False
            
            q_info = {
                "question_type": "coding",
                "title": best.problem.title if best and best.problem else "Coding problem",
                "verdict": best.verdict.value if best else "pending",
                "is_correct": is_correct,
                "explanation": "Your solution passed all hidden test cases. Well done!" if is_correct else "Your solution did not pass all hidden tests. Review edge cases and time complexity.",
                "approach": "Review the optimal approach for this problem type in your study plan.",
                "complexity": "Check time and space complexity requirements.",
            }
            if not is_correct and best:
                q_info["submitted_code"] = best.code
                q_info["expected_solution"] = best.problem.official_solution if best.problem.official_solution else "N/A"
            questions_feedback.append(q_info)

    # ── Weak topics ───────────────────────────────────────────────────────────
    weak_topics: list[str] = []
    for tq in test_questions:
        if tq.question_type == "mcq" and tq.mcq_id:
            ans = mcq_answers_map.get(tq.mcq_id)
            if ans and not ans.is_correct and ans.mcq:
                weak_topics.extend(ans.mcq.topic_tags or [])
        elif tq.question_type == "coding" and tq.problem_id:
            best = best_by_problem.get(tq.problem_id)
            if best and best.verdict != Verdict.accepted and best.problem:
                weak_topics.extend(best.problem.topic_tags or [])

    weak_topics = list(dict.fromkeys(weak_topics))  # dedupe preserving order

    # ── Overall feedback (stub — Chunk 9 replaces with Claude) ────────────────
    pct = round((total_score / max(mcq_total + coding_total, 1)) * 100)
    
    from app.services.llm import generate_feedback_with_gemini
    from app.core.config import settings

    summary = {
        "questions": questions_feedback,
        "overall_feedback": "",
        "study_plan": [],
    }

    if settings.GEMINI_API_KEY:
        try:
            ai_feedback = await generate_feedback_with_gemini(summary)
            if ai_feedback:
                summary["overall_feedback"] = ai_feedback.get("overall_feedback", "")
                summary["study_plan"] = ai_feedback.get("study_plan", [])
                
                # Merge question insights
                insights = ai_feedback.get("question_insights", [])
                insight_map = {item.get("title", ""): item for item in insights}
                
                for q in summary["questions"]:
                    if q["title"] in insight_map:
                        insight = insight_map[q["title"]]
                        if "explanation" in insight:
                            q["explanation"] = insight["explanation"]
                        if "approach" in insight:
                            q["approach"] = insight["approach"]
                        if "complexity" in insight:
                            q["complexity"] = insight["complexity"]
        except Exception as e:
            pass

    if not summary["overall_feedback"]:
        summary["overall_feedback"] = (
            f"You scored {total_score}/{mcq_total + coding_total} ({pct}%). "
            + ("Strong performance overall!" if pct >= 70
               else "Keep practicing — focus on the weak areas listed below.")
            + " Full AI analysis is currently unavailable."
        )
        summary["study_plan"] = [f"Review: {t}" for t in weak_topics[:5]] or [
            "Keep solving problems in your chosen topic.",
            "Focus on time complexity — aim for O(n log n) or better.",
            "Practice edge cases: empty input, single element, max constraints.",
        ]

    # ── Update Mastery Nodes (Server-Side) ───────────────────────────────────
    TOPIC_ALIASES = {
        "arrays": "arr", "array": "arr", "two pointers": "arr",
        "prefix sum": "ps", "prefix": "ps",
        "sliding window": "sw",
        "binary search": "bs", "search": "bs",
        "greedy": "gr",
        "dynamic programming": "dp", "dp": "dp", "interval dp": "dp", "knapsack": "dp", "memoization": "dp",
        "union find": "uf", "union-find": "uf", "disjoint set": "uf",
        "graphs": "gph", "graph": "gph", "bfs": "gph", "dfs": "gph", "trees": "gph", "tree": "gph", "traversal": "gph",
        "trie": "trie", "tries": "trie",
        "strings": "str", "string": "str", "anagram": "str", "palindrome": "str",
        "hash tables": "ht", "hash table": "ht", "hashing": "ht", "hashmap": "ht", "hash map": "ht",
        "stack": "stk", "queue": "stk", "stacks": "stk", "queues": "stk", "monotonic stack": "stk",
    }
    def resolve_topic(topic: str) -> str | None:
        key = topic.lower().strip()
        if key in TOPIC_ALIASES: return TOPIC_ALIASES[key]
        for alias, n_id in TOPIC_ALIASES.items():
            if key in alias or alias in key: return n_id
        return None

    if session.test and session.test.spec.get("topic"):
        from app.models.models import MasteryNode
        node_id = resolve_topic(session.test.spec.get("topic", ""))
        if node_id:
            score_pct = total_score / max(mcq_total + coding_total, 1)
            result = await db.execute(select(MasteryNode).where(MasteryNode.user_id == session.user_id, MasteryNode.topic == node_id))
            node = result.scalar_one_or_none()
            if not node:
                node = MasteryNode(user_id=session.user_id, topic=node_id, mastery_score=score_pct, last_seen_at=datetime.now(timezone.utc))
                db.add(node)
            else:
                # Exponential Moving Average for mastery updates
                node.mastery_score = (node.mastery_score * 0.6) + (score_pct * 0.4)
                node.last_seen_at = datetime.now(timezone.utc)
            await db.flush()

    # ── Write report ──────────────────────────────────────────────────────────
    report = Report(
        session_id=session_id,
        summary=summary,
        mcq_score=mcq_correct,
        coding_score=coding_correct,
        total_score=total_score,
        weak_topics=weak_topics,
        generated_at=datetime.now(timezone.utc),
    )
    db.add(report)
    await db.flush()
    await db.refresh(report)
    await set_grading_status(session_id, "done")
    return report
