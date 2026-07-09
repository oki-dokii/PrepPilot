from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import random
import string

from app.core.database import get_db
from app.core.redis_client import cache_session
from app.models.models import ScheduledEvent, ScheduledEventStatus, Session, SessionStatus, Test, User
from app.routers.auth import get_current_user

router = APIRouter()

def generate_slug() -> str:
    """Generate a random short slug e.g. PP-X7K2"""
    chars = "".join(random.choices(string.ascii_uppercase + string.digits, k=4))
    return f"PP-{chars}"


# ─── Schemas ──────────────────────────────────────────────────────────────────

class EventCreate(BaseModel):
    test_id: str
    title: str
    scheduled_start: datetime
    join_window_minutes: int = 15
    max_participants: Optional[int] = None

class EventResponse(BaseModel):
    id: str
    test_id: str
    creator_id: str
    slug: str
    title: str
    scheduled_start: datetime
    join_window_minutes: int
    duration_minutes: int
    max_participants: Optional[int]
    status: str
    created_at: datetime

class PublicEventInfo(BaseModel):
    title: str
    scheduled_start: datetime
    duration_minutes: int
    status: str
    participant_count: int
    max_participants: Optional[int]

class JoinEventResponse(BaseModel):
    session_id: str
    message: str


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/", response_model=EventResponse)
async def create_event(
    data: EventCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify the test exists and belongs to the user
    test_res = await db.execute(select(Test).where(Test.id == data.test_id, Test.user_id == current_user.id))
    test = test_res.scalar_one_or_none()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")

    # The test is assumed to be fully generated (has questions).
    
    slug = generate_slug()
    # Handle slug collision (unlikely but possible)
    while True:
        existing = await db.execute(select(ScheduledEvent).where(ScheduledEvent.slug == slug))
        if not existing.scalar_one_or_none():
            break
        slug = generate_slug()

    event = ScheduledEvent(
        test_id=test.id,
        creator_id=current_user.id,
        slug=slug,
        title=data.title,
        scheduled_start=data.scheduled_start,
        join_window_minutes=data.join_window_minutes,
        duration_minutes=test.duration_minutes,
        max_participants=data.max_participants,
        status=ScheduledEventStatus.scheduled
    )
    db.add(event)
    await db.flush()
    await db.refresh(event)
    
    return EventResponse(
        id=event.id,
        test_id=event.test_id,
        creator_id=event.creator_id,
        slug=event.slug,
        title=event.title,
        scheduled_start=event.scheduled_start,
        join_window_minutes=event.join_window_minutes,
        duration_minutes=event.duration_minutes,
        max_participants=event.max_participants,
        status=event.status.value,
        created_at=event.created_at
    )


@router.get("/", response_model=List[EventResponse])
async def list_events(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ScheduledEvent)
        .where(ScheduledEvent.creator_id == current_user.id)
        .order_by(ScheduledEvent.scheduled_start.desc())
    )
    events = result.scalars().all()
    
    # Auto-close events if they are past (scheduled_start + duration + join_window)
    # Strictly speaking, status could be computed dynamically or updated by a cron.
    # We will do a basic read-time evaluation just to keep the status fresh.
    now = datetime.now(timezone.utc)
    for e in events:
        end_time = e.scheduled_start + timedelta(minutes=e.duration_minutes + e.join_window_minutes)
        if now >= end_time and e.status != ScheduledEventStatus.closed:
            e.status = ScheduledEventStatus.closed
            db.add(e)
            
        elif e.scheduled_start <= now < end_time and e.status == ScheduledEventStatus.scheduled:
            e.status = ScheduledEventStatus.open
            db.add(e)

    await db.commit()

    return [
        EventResponse(
            id=e.id,
            test_id=e.test_id,
            creator_id=e.creator_id,
            slug=e.slug,
            title=e.title,
            scheduled_start=e.scheduled_start,
            join_window_minutes=e.join_window_minutes,
            duration_minutes=e.duration_minutes,
            max_participants=e.max_participants,
            status=e.status.value,
            created_at=e.created_at
        ) for e in events
    ]


@router.get("/{slug}", response_model=PublicEventInfo)
async def get_public_event(
    slug: str,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(ScheduledEvent).where(ScheduledEvent.slug == slug))
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # Re-calculate status
    now = datetime.now(timezone.utc)
    end_time = event.scheduled_start + timedelta(minutes=event.duration_minutes + event.join_window_minutes)
    
    if now >= end_time and event.status != ScheduledEventStatus.closed:
        event.status = ScheduledEventStatus.closed
        db.add(event)
        await db.flush()
    elif event.scheduled_start <= now < end_time and event.status == ScheduledEventStatus.scheduled:
        event.status = ScheduledEventStatus.open
        db.add(event)
        await db.flush()

    # Get participant count
    count_res = await db.execute(select(func.count(Session.id)).where(Session.event_id == event.id))
    participant_count = count_res.scalar() or 0

    return PublicEventInfo(
        title=event.title,
        scheduled_start=event.scheduled_start,
        duration_minutes=event.duration_minutes,
        status=event.status.value,
        participant_count=participant_count,
        max_participants=event.max_participants
    )


@router.post("/{slug}/join", response_model=JoinEventResponse)
async def join_event(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Fetch event
    result = await db.execute(select(ScheduledEvent).where(ScheduledEvent.slug == slug))
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    now = datetime.now(timezone.utc)
    
    # Check if user already joined
    existing_res = await db.execute(select(Session).where(Session.event_id == event.id, Session.user_id == current_user.id))
    existing_session = existing_res.scalar_one_or_none()
    if existing_session:
        return JoinEventResponse(session_id=existing_session.id, message="Already joined")

    # Validation: time window
    end_time = event.scheduled_start + timedelta(minutes=event.duration_minutes + event.join_window_minutes)
    if now < event.scheduled_start:
        raise HTTPException(status_code=403, detail="Event has not started yet")
    if now >= event.scheduled_start + timedelta(minutes=event.join_window_minutes):
        raise HTTPException(status_code=403, detail="Join window has closed")
    if now >= end_time:
        raise HTTPException(status_code=403, detail="Event has ended")

    # Validation: participant limit (fast count approximation)
    if event.max_participants is not None:
        count_res = await db.execute(select(func.count(Session.id)).where(Session.event_id == event.id))
        count = count_res.scalar() or 0
        if count >= event.max_participants:
            raise HTTPException(status_code=403, detail="Event is at capacity")

    # Create Session
    session = Session(
        test_id=event.test_id,
        event_id=event.id,
        user_id=current_user.id,
        started_at=now,
        expires_at=now + timedelta(minutes=event.duration_minutes),
        status=SessionStatus.active,
    )
    db.add(session)
    
    try:
        await db.commit()
    except IntegrityError:
        # Raced with another request from same user
        await db.rollback()
        existing_res = await db.execute(select(Session).where(Session.event_id == event.id, Session.user_id == current_user.id))
        existing_session = existing_res.scalar_one_or_none()
        if existing_session:
            return JoinEventResponse(session_id=existing_session.id, message="Already joined")
        raise HTTPException(status_code=500, detail="Failed to join event")

    # Cache session in Redis for fast live-test reads
    await cache_session(session.id, {
        "status": session.status.value,
        "expires_at": session.expires_at.isoformat(),
        "user_id": current_user.id,
    }, ttl_seconds=event.duration_minutes * 60 + 300)

    return JoinEventResponse(session_id=session.id, message="Joined successfully")


# ─── Leaderboard ──────────────────────────────────────────────────────────────

class LeaderboardEntry(BaseModel):
    rank: int
    user_name: str
    score: Optional[int]
    percentile: float  # 0–100: % of submitted participants this user beat
    status: str
    is_me: bool


@router.get("/{slug}/leaderboard", response_model=List[LeaderboardEntry])
async def get_event_leaderboard(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the ranked leaderboard for a scheduled event."""
    from app.models.models import Report, SessionStatus
    from sqlalchemy.orm import selectinload

    event_res = await db.execute(select(ScheduledEvent).where(ScheduledEvent.slug == slug))
    event = event_res.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # Load all sessions for this event, with user and report
    sessions_res = await db.execute(
        select(Session)
        .where(Session.event_id == event.id)
        .options(selectinload(Session.user), selectinload(Session.report))
    )
    sessions = sessions_res.scalars().all()

    # Build raw entries
    entries = []
    for s in sessions:
        report = s.report if s else None
        score = report.total_score if report else None
        status = s.status.value if s else "pending"
        display_name = (
            s.user.full_name or s.user.email.split("@")[0]
            if s.user else "Anonymous"
        )
        entries.append({
            "user_name": display_name,
            "score": score,
            "status": status,
            "is_me": s.user_id == current_user.id,
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
            is_me=entry["is_me"],
        ))

    return result_list
