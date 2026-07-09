from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from typing import Optional, List

from app.core.database import get_db
from app.models.models import User, Session, SessionStatus, Report
from app.routers.auth import get_current_user

router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────────────────────

class GlobalLeaderboardEntry(BaseModel):
    rank: int
    user_name: str
    tests_completed: int
    best_score: int
    avg_score: float
    avg_time_seconds: Optional[int]     # average completion time across tests
    total_score: int                    # cumulative score (good for gamification)
    is_me: bool


# ─── Global Leaderboard ───────────────────────────────────────────────────────

@router.get("/", response_model=List[GlobalLeaderboardEntry])
async def get_global_leaderboard(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Global leaderboard across all users and all submitted sessions.

    Ranking criteria (in order of priority):
    1. Best score (highest single-test score) DESC
    2. Average score DESC
    3. Average time taken ASC (faster is better)
    4. Tests completed DESC (more productive wins)
    """
    # Load all submitted sessions with user + report eagerly
    sessions_res = await db.execute(
        select(Session)
        .where(Session.status == SessionStatus.submitted)
        .options(selectinload(Session.user), selectinload(Session.report))
    )
    sessions = sessions_res.scalars().all()

    # Aggregate per user
    user_stats: dict[str, dict] = {}
    for s in sessions:
        if not s.user or not s.report:
            continue
        uid = s.user_id
        score = s.report.total_score or 0

        time_taken: Optional[int] = None
        if s.submitted_at and s.started_at:
            delta = s.submitted_at - s.started_at
            time_taken = max(0, int(delta.total_seconds()))

        if uid not in user_stats:
            display_name = s.user.full_name or s.user.email.split("@")[0]
            user_stats[uid] = {
                "user_name": display_name,
                "is_me": uid == current_user.id,
                "scores": [],
                "times": [],
            }

        user_stats[uid]["scores"].append(score)
        if time_taken is not None:
            user_stats[uid]["times"].append(time_taken)

    if not user_stats:
        return []

    # Build summary rows
    rows = []
    for uid, stats in user_stats.items():
        scores = stats["scores"]
        times = stats["times"]
        rows.append({
            "user_name": stats["user_name"],
            "is_me": stats["is_me"],
            "tests_completed": len(scores),
            "best_score": max(scores),
            "avg_score": round(sum(scores) / len(scores), 1),
            "total_score": sum(scores),
            "avg_time_seconds": round(sum(times) / len(times)) if times else None,
        })

    # Sort: best_score DESC → avg_score DESC → avg_time_seconds ASC
    rows.sort(key=lambda r: (
        -r["best_score"],
        -r["avg_score"],
        r["avg_time_seconds"] if r["avg_time_seconds"] is not None else 999999,
        -r["tests_completed"],
    ))

    # Dense rank (ties on best_score + avg_score get same rank)
    result = []
    rank = 0
    prev_best = None
    prev_avg = None
    for idx, row in enumerate(rows):
        if row["best_score"] != prev_best or row["avg_score"] != prev_avg:
            rank += 1
        prev_best = row["best_score"]
        prev_avg = row["avg_score"]

        result.append(GlobalLeaderboardEntry(
            rank=rank,
            user_name=row["user_name"],
            tests_completed=row["tests_completed"],
            best_score=row["best_score"],
            avg_score=row["avg_score"],
            avg_time_seconds=row["avg_time_seconds"],
            total_score=row["total_score"],
            is_me=row["is_me"],
        ))

    return result
