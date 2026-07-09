import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Integer, Float, Boolean, DateTime, Text,
    ForeignKey, ARRAY, JSON, Enum as SAEnum, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum

from app.core.database import Base


def gen_uuid():
    return str(uuid.uuid4())


# ─── Enums ────────────────────────────────────────────────────────────────────

class DifficultyEnum(str, enum.Enum):
    easy = "easy"
    medium = "medium"
    hard = "hard"

class SessionStatus(str, enum.Enum):
    pending = "pending"
    active = "active"
    submitted = "submitted"
    expired = "expired"

class ScheduledEventStatus(str, enum.Enum):
    scheduled = "scheduled"
    open = "open"
    closed = "closed"

class Verdict(str, enum.Enum):
    accepted = "accepted"
    wrong_answer = "wrong_answer"
    time_limit = "time_limit"
    runtime_error = "runtime_error"
    compile_error = "compile_error"
    pending = "pending"


# ─── Models ───────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255))
    target_role = Column(String(255))
    target_company = Column(String(255))
    exam_date = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    tests = relationship("Test", back_populates="user")
    sessions = relationship("Session", back_populates="user")
    mastery_nodes = relationship("MasteryNode", back_populates="user")


class Problem(Base):
    __tablename__ = "problems"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    title = Column(String(500), nullable=False)
    topic_tags = Column(ARRAY(String), default=[])
    difficulty = Column(SAEnum(DifficultyEnum), nullable=False)
    statement = Column(Text, nullable=False)       # markdown
    constraints = Column(Text)
    sample_input = Column(Text)
    sample_output = Column(Text)
    time_limit_ms = Column(Integer, default=2000)
    memory_limit_mb = Column(Integer, default=256)
    official_solution = Column(Text)               # code string
    brute_force_solution = Column(Text)
    validated_at = Column(DateTime(timezone=True)) # null = not yet validated
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    test_cases = relationship("TestCase", back_populates="problem")


class TestCase(Base):
    __tablename__ = "test_cases"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    problem_id = Column(String(36), ForeignKey("problems.id"), nullable=False)
    input = Column(Text, nullable=False)
    expected_output = Column(Text, nullable=False)
    is_hidden = Column(Boolean, default=True)
    category = Column(String(50))  # boundary, structural, adversarial, performance, random, sample
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    problem = relationship("Problem", back_populates="test_cases")


class MCQ(Base):
    __tablename__ = "mcqs"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    topic_tags = Column(ARRAY(String), default=[])
    difficulty = Column(SAEnum(DifficultyEnum), nullable=False)
    question = Column(Text, nullable=False)
    options = Column(JSON, nullable=False)          # {"A": "...", "B": "...", ...}
    correct_option = Column(String(1), nullable=False)  # "A" | "B" | "C" | "D"
    explanation = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Test(Base):
    __tablename__ = "tests"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    spec = Column(JSON, nullable=False)             # {topic, difficulty, style, ...}
    duration_minutes = Column(Integer, default=90)
    generated_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="tests")
    questions = relationship("TestQuestion", back_populates="test", order_by="TestQuestion.order")
    sessions = relationship("Session", back_populates="test")


class TestQuestion(Base):
    __tablename__ = "test_questions"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    test_id = Column(String(36), ForeignKey("tests.id"), nullable=False)
    problem_id = Column(String(36), ForeignKey("problems.id"), nullable=True)
    mcq_id = Column(String(36), ForeignKey("mcqs.id"), nullable=True)
    order = Column(Integer, nullable=False)
    question_type = Column(String(10), nullable=False)  # "coding" | "mcq"

    test = relationship("Test", back_populates="questions")
    problem = relationship("Problem")
    mcq = relationship("MCQ")


class Session(Base):
    __tablename__ = "sessions"
    __table_args__ = (
        UniqueConstraint('event_id', 'user_id', name='uq_session_event_user'),
    )

    id = Column(String(36), primary_key=True, default=gen_uuid)
    test_id = Column(String(36), ForeignKey("tests.id"), nullable=False)
    event_id = Column(String(36), ForeignKey("scheduled_events.id"), nullable=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    started_at = Column(DateTime(timezone=True))
    submitted_at = Column(DateTime(timezone=True))
    expires_at = Column(DateTime(timezone=True))
    status = Column(SAEnum(SessionStatus), default=SessionStatus.pending)
    tab_switches = Column(Integer, default=0)
    paste_bursts = Column(Integer, default=0)

    test = relationship("Test", back_populates="sessions")
    user = relationship("User", back_populates="sessions")
    submissions = relationship("Submission", back_populates="session")
    mcq_answers = relationship("MCQAnswer", back_populates="session")
    report = relationship("Report", back_populates="session", uselist=False)
    scheduled_event = relationship("ScheduledEvent", back_populates="sessions")


class Submission(Base):
    __tablename__ = "submissions"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    session_id = Column(String(36), ForeignKey("sessions.id"), nullable=False)
    problem_id = Column(String(36), ForeignKey("problems.id"), nullable=False)
    code = Column(Text, nullable=False)
    language = Column(String(50), nullable=False)  # "python3", "javascript", "cpp"
    verdict = Column(SAEnum(Verdict), default=Verdict.pending)
    runtime_ms = Column(Integer)
    memory_kb = Column(Integer)
    passed_hidden_count = Column(Integer, default=0)
    total_hidden_count = Column(Integer, default=0)
    submitted_at = Column(DateTime(timezone=True), server_default=func.now())

    session = relationship("Session", back_populates="submissions")
    problem = relationship("Problem")


class MCQAnswer(Base):
    __tablename__ = "mcq_answers"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    session_id = Column(String(36), ForeignKey("sessions.id"), nullable=False)
    mcq_id = Column(String(36), ForeignKey("mcqs.id"), nullable=False)
    chosen_option = Column(String(1))
    is_correct = Column(Boolean)
    answered_at = Column(DateTime(timezone=True), server_default=func.now())

    session = relationship("Session", back_populates="mcq_answers")
    mcq = relationship("MCQ")


class MasteryNode(Base):
    __tablename__ = "mastery_nodes"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    topic = Column(String(255), nullable=False)
    mastery_score = Column(Float, default=0.5)    # 0.0 – 1.0
    last_seen_at = Column(DateTime(timezone=True))

    user = relationship("User", back_populates="mastery_nodes")


class Report(Base):
    __tablename__ = "reports"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    session_id = Column(String(36), ForeignKey("sessions.id"), unique=True, nullable=False)
    summary = Column(JSON)                         # rich feedback JSON
    mcq_score = Column(Integer, default=0)
    coding_score = Column(Integer, default=0)
    total_score = Column(Integer, default=0)
    weak_topics = Column(ARRAY(String), default=[])
    generated_at = Column(DateTime(timezone=True), server_default=func.now())

    session = relationship("Session", back_populates="report")


class OAPattern(Base):
    __tablename__ = "oa_patterns"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    company = Column(String(255), nullable=False, index=True)
    role = Column(String(255))
    level = Column(String(50))
    mcq_count = Column(Integer, default=0)
    coding_count = Column(Integer, nullable=False)
    duration_minutes = Column(Integer, nullable=False)
    topic_distribution = Column(JSON)
    difficulty_mix = Column(JSON)
    is_sectioned = Column(Boolean, default=False)
    source_urls = Column(ARRAY(String), default=[])
    confidence = Column(String(20), default="low")
    reviewed = Column(Boolean, default=False)
    last_updated = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint('company', 'role', 'level', name='uq_oa_pattern_company_role_level'),
    )


class ScheduledEvent(Base):
    __tablename__ = "scheduled_events"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    test_id = Column(String(36), ForeignKey("tests.id"), nullable=False)
    creator_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    slug = Column(String(50), unique=True, nullable=False, index=True)
    title = Column(String(255), nullable=False)
    scheduled_start = Column(DateTime(timezone=True), nullable=False)
    join_window_minutes = Column(Integer, default=15)
    duration_minutes = Column(Integer, nullable=False)
    max_participants = Column(Integer, nullable=True)
    status = Column(SAEnum(ScheduledEventStatus), default=ScheduledEventStatus.scheduled)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    creator = relationship("User")
    test = relationship("Test")
    sessions = relationship("Session", back_populates="scheduled_event")
