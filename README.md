# PrepPilot

**AI-powered technical interview preparation platform.** Generate custom coding + MCQ assessments on any DSA topic, get your code executed against hidden test cases, and receive Gemini-powered performance feedback — all in one focused workspace.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Infrastructure: Redis & Kafka](#infrastructure-redis--kafka)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [Environment Variables](#environment-variables)
- [Local Development](#local-development)
- [Running with Docker](#running-with-docker)
- [Key Features](#key-features)
- [AI & Grading Pipeline](#ai--grading-pipeline)
- [Code Execution](#code-execution)
- [Practice Library](#practice-library)

---

## Overview

PrepPilot lets you:
1. **Configure a test** — pick topic, difficulty, duration, and question style via a chat-style setup wizard
2. **Take the test** — solve coding problems in an in-browser editor and answer MCQs in a timed, distraction-free environment
3. **Get graded** — code is executed against hidden test cases via the Piston API; MCQs are auto-graded
4. **Review AI feedback** — Gemini analyses your answers, explains mistakes, and generates a personalised study plan
5. **Track mastery** — a dynamic graph shows your topic-by-topic mastery built from real session scores
6. **Browse PYQs** — a searchable library of 17,000+ company-wise interview questions sourced from real LeetCode data

---

## Tech Stack

### Frontend
| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| State | React `useState` / `useMemo` |
| HTTP | Axios |
| Code editor | Monaco Editor |

### Backend
| Layer | Technology |
|---|---|
| Framework | FastAPI (Python 3.12) |
| ORM | SQLAlchemy 2.0 (async) |
| Migrations | Alembic |
| Auth | JWT (python-jose + passlib/bcrypt) |
| Task queue | RQ (Redis Queue) |
| Cache | Redis 7 |
| AI | Google Gemini (`gemini-flash-lite-latest`) |
| Code runner | Piston API (open-source, no auth required) |

### Infrastructure
| Component | Technology |
|---|---|
| Primary database | PostgreSQL 16 |
| Cache & queue broker | Redis 7 |
| Containerisation | Docker + Docker Compose |

> **Kafka is not used.** Background jobs are handled by **RQ (Redis Queue)** — lightweight and sufficient for the current workload. Redis doubles as both the job broker and the session state cache.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Browser                             │
│              Next.js 15  (port 3000)                        │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP / REST
┌──────────────────────▼──────────────────────────────────────┐
│                   FastAPI  (port 8000)                      │
│                                                             │
│  /api/auth      → JWT auth (register / login / me)          │
│  /api/chat      → LLM-powered test generation               │
│  /api/tests     → Test CRUD                                 │
│  /api/sessions  → Session lifecycle (start / submit)        │
│  /api/submissions → Code submission + Piston execution      │
│  /api/reports   → Grading results + Gemini feedback         │
└───┬───────────────────────────┬───────────────────────────┬─┘
    │                           │                           │
    ▼                           ▼                           ▼
PostgreSQL 16              Redis 7                    Piston API
(persistent store)    (session cache +            (code execution)
                       RQ job broker)
                           │
                           ▼
                      RQ Worker
                   (async grading,
                    Gemini calls)
```

### Request flow for a test submission

```
User clicks "Submit"
       │
       ▼
POST /api/sessions/{id}/submit
       │
       ├─ Mark session status → "submitted"
       ├─ Invalidate Redis session cache
       └─ Call grade_session() synchronously
              │
              ├─ Load all MCQAnswers + Submissions from Postgres
              ├─ Calculate score (MCQ correct + coding AC)
              ├─ Call Gemini API for overall feedback + study plan
              └─ Write Report to Postgres
                     │
                     ▼
GET /api/reports/{session_id}  ← frontend polls / navigates here
```

---

## Infrastructure: Redis & Kafka

### Redis — ✅ Used (actively)

Redis is used for two purposes:

**1. Session state cache**

When a test session is created, its status and expiry are written to Redis with a TTL equal to the test duration + 5 min buffer:

```python
await cache_session(session_id, {
    "status": "active",
    "expires_at": "...",
    "user_id": "..."
}, ttl_seconds=duration * 60 + 300)
```

This allows the live test page to do a fast Redis lookup before hitting Postgres for every heartbeat/status check.

**2. Grading status tracking**

During async grading, the status (`processing` → `done` / `error`) is stored in Redis:

```python
await set_grading_status(session_id, "processing")
# ... grade ...
await set_grading_status(session_id, "done")
```

**3. RQ (Redis Queue) — job broker**

The `rq` package (in `requirements.txt`) uses Redis as its broker for background task queuing. Currently, grading runs synchronously in the submit endpoint, but the RQ worker infrastructure (`app/workers/`) is in place for moving grading off the request thread.

> Redis gracefully degrades: if the Redis server is unreachable on startup, the app logs a warning and continues running without caching (all reads fall through to Postgres).

### Kafka — ❌ Not used

Kafka is not part of this stack. Event streaming at Kafka's scale would be over-engineering for the current architecture. RQ + Redis is the chosen background task solution.

---

## Project Structure

```
PrepPilot/
├── docker-compose.yml          # Postgres + Redis + API + Web
├── .env.example                # Environment variable template
├── dev.sh                      # Convenience dev startup script
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── alembic/                # DB migrations
│   ├── alembic.ini
│   └── app/
│       ├── main.py             # FastAPI app + CORS + router registration
│       ├── core/
│       │   ├── config.py       # Pydantic settings (env vars)
│       │   ├── database.py     # Async SQLAlchemy engine + session
│       │   ├── redis_client.py # Redis pool, session cache helpers
│       │   └── security.py     # JWT creation + verification
│       ├── models/
│       │   └── models.py       # All SQLAlchemy ORM models
│       ├── routers/
│       │   ├── auth.py         # /api/auth — register, login, /me
│       │   ├── chat.py         # /api/chat — LLM test generation
│       │   ├── tests.py        # /api/tests — test CRUD
│       │   ├── sessions.py     # /api/sessions — session lifecycle
│       │   ├── submissions.py  # /api/submissions — code run + grade
│       │   └── reports.py      # /api/reports — fetch + regen report
│       ├── services/
│       │   ├── llm.py          # Gemini API — test gen + feedback
│       │   ├── test_gen.py     # Structured test generation helpers
│       │   ├── grading.py      # Score calculation + report writing
│       │   └── judge.py        # Piston API code execution
│       └── workers/
│           └── ...             # RQ worker entrypoint (future async grading)
│
└── frontend/
    ├── package.json
    ├── next.config.js
    └── src/
        ├── app/
        │   ├── page.tsx            # Landing page
        │   ├── dashboard/          # Main dashboard (mastery graph, test history)
        │   ├── test/[sessionId]/   # Live test + review environment
        │   ├── report/[sessionId]/ # Post-test report with AI feedback
        │   ├── library/            # PYQ browser (17k+ questions)
        │   ├── settings/           # User settings
        │   ├── login/
        │   └── register/
        ├── components/
        │   ├── LayoutWrapper.tsx   # App shell with sidebar nav
        │   ├── MasteryGraph.tsx    # SVG mastery graph + topic resolver
        │   ├── ChatSetup.tsx       # Conversational test config UI
        │   ├── CodeEditor.tsx      # Monaco editor wrapper
        │   ├── MCQPanel.tsx        # MCQ answer panel (locks during test)
        │   ├── CountdownTimer.tsx  # Live test countdown
        │   ├── ThemeProvider.tsx   # Dark/light theme context
        │   └── ThemeToggle.tsx     # Theme toggle button
        └── lib/
            ├── api.ts              # Axios client + endpoint wrappers
            ├── auth.ts             # Auth context + JWT helpers
            └── questions.json      # Compiled 17k+ LeetCode PYQs (local)
```

---

## Database Schema

```
users
  id, email, hashed_password, created_at

tests
  id, user_id, spec (JSONB), duration_minutes, created_at

test_questions
  id, test_id, order, question_type (mcq|coding), mcq_id?, problem_id?

mcqs
  id, question, options (JSONB), correct_option, explanation, topic_tags, difficulty

problems
  id, title, statement, constraints, sample_input, sample_output,
  time_limit_ms, memory_limit_mb, topic_tags, difficulty

test_cases
  id, problem_id, input, expected_output, is_hidden

sessions
  id, test_id, user_id, status (active|submitted|expired),
  started_at, expires_at, submitted_at

submissions
  id, session_id, problem_id, user_id, code, language,
  verdict (accepted|wrong_answer|compile_error|runtime_error|time_limit|pending),
  runtime_ms, submitted_at

mcq_answers
  id, session_id, mcq_id, user_id, chosen_option, is_correct

reports
  id, session_id, summary (JSONB), mcq_score, coding_score,
  total_score, weak_topics, generated_at
```

---

## API Reference

### Auth
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Create account |
| `POST` | `/api/auth/login` | Get JWT token |
| `GET` | `/api/auth/me` | Current user info |

### Chat / Test Generation
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/chat/message` | Send message to LLM test configurator |
| `POST` | `/api/chat/generate` | Generate test from finalised config |

### Tests
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/tests/` | List user's tests |
| `GET` | `/api/tests/{id}` | Get test by ID |

### Sessions
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/sessions/` | List all sessions |
| `POST` | `/api/sessions/` | Start a session (given test_id) |
| `GET` | `/api/sessions/{id}` | Get session + questions + answers (review mode) |
| `POST` | `/api/sessions/{id}/submit` | Submit session → triggers grading |

### Submissions (Code)
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/submissions/` | Submit code → runs on Piston → saves verdict |

### Reports
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/reports/{session_id}` | Get graded report (auto-regenerates with Gemini if stale) |

---

## Environment Variables

Copy `.env.example` to `.env` and fill in:

```env
# Database
DATABASE_URL=postgresql+asyncpg://prepuser:preppass@localhost:5432/prepdb
DATABASE_SYNC_URL=postgresql://prepuser:preppass@localhost:5432/prepdb

# Redis
REDIS_URL=redis://localhost:6379/0

# JWT — generate with: openssl rand -hex 32
SECRET_KEY=your-secret-key-here

# Google Gemini (required for AI feedback + test generation)
GEMINI_API_KEY=your-gemini-api-key

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:8000
```

> **Note**: `ANTHROPIC_API_KEY` in `.env.example` is a legacy entry. The app runs entirely on **Gemini** (`gemini-flash-lite-latest`). Anthropic is not used.

> **Judge0 keys** (`JUDGE0_API_KEY`) are present in config but not actively used — code execution goes through the **Piston API** (free, no key needed).

---

## Local Development

### Prerequisites
- Node.js 20+
- Python 3.12+
- PostgreSQL 16 running locally (or via Docker)
- Redis 7 running locally (or via Docker)

### Backend

```bash
cd backend

# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy and fill env
cp ../.env.example ../.env
# Edit ../.env with your values

# Run migrations
alembic upgrade head

# Start API server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

Frontend runs at `http://localhost:3000`, backend at `http://localhost:8000`.

### Quick start (both at once)

```bash
# From project root
bash dev.sh
```

---

## Running with Docker

Spins up Postgres, Redis, the FastAPI backend, and Next.js frontend in one command:

```bash
# From project root
docker-compose up --build
```

Services:
| Service | Port | Description |
|---|---|---|
| `db` | 5432 | PostgreSQL 16 |
| `redis` | 6379 | Redis 7 |
| `api` | 8000 | FastAPI backend |
| `web` | 3000 | Next.js frontend |

The API container runs `alembic upgrade head` automatically before starting.

---

## Key Features

### Live Test Environment
- Vertical collapsible **sidebar** for question navigation with status indicators (answered / unanswered / skipped)
- **Monaco Editor** for coding questions with syntax highlighting for Python, JavaScript, C++
- **MCQ panel** that hides correct/incorrect feedback until the test is submitted (no answer leaking during the test)
- Server-authoritative **countdown timer** — expiry is enforced on the backend, not just the client

### Post-Test Review
- Click any question card in the report to jump to that specific question in review mode
- See your submitted code, the verdict, and the correct MCQ answer side-by-side
- Gemini-generated per-question explanations and a personalised study plan

### Dynamic Mastery Graph
- SVG knowledge graph with 12 DSA topic nodes
- All mastery values start at 0 — built entirely from your real session scores
- Recency-weighted averaging: more recent test scores have higher influence
- Topic resolution uses fuzzy alias matching (e.g. "Graph traversal" maps to the Graphs node)

### Next Test Suggestion
- For new users: suggests the canonical starter path (Arrays → Strings → Binary Search)
- For returning users: ranks your tested topics by mastery score and recommends the weakest 3

---

## AI & Grading Pipeline

### Test Generation
Handled by `app/services/llm.py` via the Gemini API.

The LLM receives a structured prompt with:
- Topic, difficulty, style (conceptual / speed / mixed)
- Number of MCQs and coding problems requested
- Output format constraints (JSON with specific schema)

Generated questions are stored in Postgres as `MCQ` and `Problem` records linked to the `Test`.

### Grading
On session submit (`POST /api/sessions/{id}/submit`):

1. MCQ answers are checked against `correct_option` in Postgres — **no LLM needed**
2. Code submissions are run against hidden `TestCase` records via the Piston API
3. Scores are tallied: 1 point per correct MCQ + 1 point per accepted coding problem
4. `grade_session()` calls Gemini with the full question/answer context to generate:
   - An overall performance summary
   - Per-question explanations
   - A prioritised study plan

### Auto-regeneration
If a stored report contains stale placeholder text (leftover from a previous failed Gemini call), the `GET /api/reports/{session_id}` endpoint detects it and automatically re-runs Gemini to replace it with real feedback before returning the response.

---

## Code Execution

Code is executed via the **[Piston API](https://github.com/engineer-man/piston)** (hosted at `emkc.org`) — a sandboxed, polyglot code execution service with no API key required.

**Supported languages:**
| PrepPilot label | Piston runtime |
|---|---|
| `python3` | `python3` |
| `javascript` | `node` |
| `cpp` | `c++` |

Each submission is run against every `TestCase` for the problem. The first failure stops execution and returns the appropriate verdict:

| Verdict | Trigger |
|---|---|
| `accepted` | All test cases pass |
| `wrong_answer` | Output doesn't match expected |
| `compile_error` | Code didn't compile (`ran: false` from Piston) |
| `runtime_error` | Non-empty stderr while `ran: true` |
| `time_limit` | Piston timeout (15s hard limit) |

Hidden test cases only show "Failed on hidden test case #N" — the expected output is never exposed.

---

## Practice Library

The library contains **17,665 question-company mappings** compiled from the [`leetcode-companywise-interview-questions`](https://github.com/snehasishroy/leetcode-companywise-interview-questions) repository.

All 4 CSV files are parsed per company:
- `thirty-days.csv` → **30 days** recency tag
- `three-months.csv` → **3 months** recency tag
- `six-months.csv` → **6 months** recency tag
- `all.csv` → base dataset

**Available filters:**
- 🔍 Full-text search (title, company, topic, ID)
- 🏢 Company autocomplete search
- ⏱ Time period (Last 30 days / 3 months / 6 months / All time)
- 🎯 Difficulty (Easy / Medium / Hard)
- 🧩 Topic (Arrays & Hashing / Trees / Graphs / DP / Strings / Linked List / Binary Search)

Each question links directly to its LeetCode problem page.

The compiled dataset lives at `frontend/src/lib/questions.json` and is bundled statically — no API calls needed at runtime.
