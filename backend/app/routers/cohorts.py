"""
Cohort API — create, join, and view leaderboard for shared mock OAs.
"""
import random
import string
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.models import (
    Cohort, CohortMember, Test, TestQuestion, Session, Report, User,
    SessionStatus
)
from app.routers.auth import get_current_user

router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────────────────────

class CohortCreate(BaseModel):
    name: str
    test_id: str                       # the template test to base this cohort on
    expires_hours: Optional[int] = 24  # how long the cohort invite stays active


class CohortOut(BaseModel):
    id: str
    name: str
    invite_code: str
    created_at: datetime
    expires_at: Optional[datetime]
    member_count: int


class LeaderboardEntry(BaseModel):
    rank: int
    user_name: str
    score: Optional[int]
    percentile: float          # 0–100: % of participants this user beat
    status: str                # submitted | active | pending


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _gen_invite_code(length: int = 8) -> str:
    """Generate a short, human-friendly invite code (e.g. PREP-X7K2)."""
    chars = string.ascii_uppercase + string.digits
    suffix = "".join(random.choices(chars, k=length))
    return f"PP-{suffix}"


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/", response_model=CohortOut, status_code=201)
async def create_cohort(
    data: CohortCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new cohort based on an existing test template. Returns an invite code."""
    # Validate the template test belongs to this user
    result = await db.execute(
        select(Test).where(Test.id == data.test_id, Test.user_id == current_user.id)
    )
    test = result.scalar_one_or_none()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found or not yours")

    # Generate unique invite code
    for _ in range(10):
        code = _gen_invite_code()
        existing = await db.execute(select(Cohort).where(Cohort.invite_code == code))
        if not existing.scalar_one_or_none():
            break
    else:
        raise HTTPException(status_code=500, detail="Could not generate unique invite code")

    expires_at = None
    if data.expires_hours:
        from datetime import timedelta
        expires_at = datetime.now(timezone.utc) + timedelta(hours=data.expires_hours)

    cohort = Cohort(
        name=data.name,
        test_template_id=data.test_id,
        invite_code=code,
        created_by=current_user.id,
        expires_at=expires_at,
    )
    db.add(cohort)
    await db.flush()
    await db.refresh(cohort)

    return CohortOut(
        id=cohort.id,
        name=cohort.name,
        invite_code=cohort.invite_code,
        created_at=cohort.created_at,
        expires_at=cohort.expires_at,
        member_count=0,
    )


@router.post("/{invite_code}/join")
async def join_cohort(
    invite_code: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Join a cohort using an invite code. Creates a new session for the user."""
    result = await db.execute(
        select(Cohort)
        .where(Cohort.invite_code == invite_code.upper())
        .options(selectinload(Cohort.members))
    )
    cohort = result.scalar_one_or_none()
    if not cohort:
        raise HTTPException(status_code=404, detail="Cohort not found")

    # Check expiry
    if cohort.expires_at and datetime.now(timezone.utc) > cohort.expires_at:
        raise HTTPException(status_code=410, detail="This cohort has expired")

    # Check if user already joined
    existing_member = next(
        (m for m in cohort.members if m.user_id == current_user.id), None
    )
    if existing_member:
        # Return existing session if they already joined
        return {
            "cohort_id": cohort.id,
            "cohort_name": cohort.name,
            "invite_code": cohort.invite_code,
            "session_id": existing_member.session_id,
            "already_joined": True,
        }

    # Create a new session from the template test
    template = await db.get(Test, cohort.test_template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template test not found")

    from datetime import timedelta
    now = datetime.now(timezone.utc)
    session = Session(
        test_id=template.id,
        user_id=current_user.id,
        started_at=now,
        expires_at=now + timedelta(minutes=template.duration_minutes),
        status=SessionStatus.active,
    )
    db.add(session)
    await db.flush()

    # Cache the session in Redis
    from app.core.redis_client import cache_session
    await cache_session(session.id, {
        "status": session.status.value,
        "expires_at": session.expires_at.isoformat(),
        "user_id": current_user.id,
    }, ttl_seconds=template.duration_minutes * 60 + 300)

    # Register member
    member = CohortMember(
        cohort_id=cohort.id,
        user_id=current_user.id,
        session_id=session.id,
    )
    db.add(member)
    await db.flush()

    return {
        "cohort_id": cohort.id,
        "cohort_name": cohort.name,
        "invite_code": cohort.invite_code,
        "session_id": session.id,
        "already_joined": False,
    }


@router.get("/{invite_code}/leaderboard", response_model=List[LeaderboardEntry])
async def get_leaderboard(
    invite_code: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the ranked leaderboard for a cohort."""
    result = await db.execute(
        select(Cohort)
        .where(Cohort.invite_code == invite_code.upper())
        .options(
            selectinload(Cohort.members)
            .selectinload(CohortMember.user),
            selectinload(Cohort.members)
            .selectinload(CohortMember.session)
            .selectinload(Session.report),
        )
    )
    cohort = result.scalar_one_or_none()
    if not cohort:
        raise HTTPException(status_code=404, detail="Cohort not found")

    # Build raw score list
    entries = []
    for member in cohort.members:
        report = member.session.report if member.session else None
        score = report.total_score if report else None
        status = member.session.status.value if member.session else "pending"
        display_name = (
            member.user.full_name or member.user.email.split("@")[0]
            if member.user else "Anonymous"
        )
        entries.append({
            "user_name": display_name,
            "score": score,
            "status": status,
            "is_me": member.user_id == current_user.id,
        })

    # Sort: submitted with highest scores first, then active, then pending
    def sort_key(e):
        if e["score"] is None:
            return (-1, 0)
        return (1, e["score"])

    entries.sort(key=sort_key, reverse=True)

    # Assign ranks and compute percentiles
    submitted = [e for e in entries if e["score"] is not None]
    n_submitted = len(submitted)

    result_list = []
    for rank_idx, entry in enumerate(entries):
        if entry["score"] is not None and n_submitted > 1:
            # Percentile = % of submitted participants this user beat
            beaten = sum(1 for e in submitted if e["score"] < entry["score"])
            percentile = round((beaten / (n_submitted - 1)) * 100, 1)
        elif n_submitted == 1 and entry["score"] is not None:
            percentile = 100.0
        else:
            percentile = 0.0

        result_list.append(LeaderboardEntry(
            rank=rank_idx + 1,
            user_name=entry["user_name"],
            score=entry["score"],
            percentile=percentile,
            status=entry["status"],
        ))

    return result_list


@router.get("/{invite_code}")
async def get_cohort_info(
    invite_code: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get basic cohort metadata (name, member count, expiry)."""
    result = await db.execute(
        select(Cohort)
        .where(Cohort.invite_code == invite_code.upper())
        .options(selectinload(Cohort.members))
    )
    cohort = result.scalar_one_or_none()
    if not cohort:
        raise HTTPException(status_code=404, detail="Cohort not found")

    return CohortOut(
        id=cohort.id,
        name=cohort.name,
        invite_code=cohort.invite_code,
        created_at=cohort.created_at,
        expires_at=cohort.expires_at,
        member_count=len(cohort.members),
    )
