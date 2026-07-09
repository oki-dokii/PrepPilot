<div align="center">

<h1>🧭 PrepPilot</h1>
<p><strong>AI-native technical interview simulator — Blueprint Edition</strong></p>

<p>
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" />
  <img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white" />
  <img alt="Python" src="https://img.shields.io/badge/Python-3.12-blue?logo=python&logoColor=white" />
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white" />
  <img alt="Redis" src="https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white" />
  <img alt="Docker" src="https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white" />
  <img alt="Gemini" src="https://img.shields.io/badge/Gemini-AI-8E44AD?logo=google&logoColor=white" />
</p>

<p>
PrepPilot dynamically generates full technical assessments tailored to <em>your</em> target company, role, seniority, and weaknesses — then grades your answers like a real interviewer would.
</p>

</div>

---

## ✨ What Makes PrepPilot Different

Most interview prep platforms serve static question banks. PrepPilot works the other way around:

| Feature | LeetCode / HackerRank | PrepPilot |
|---|---|---|
| Questions | Static bank | AI-generated per session |
| Tailoring | Tags/filters | Conversational (target company + role + weaknesses) |
| Grading | Binary pass/fail | AI-explained, approach-aware feedback |
| Mastery | Manual tracking | Automatic per-topic graph with spaced repetition |
| Problem types | Coding only | MCQ + Coding, mixed per blueprint |
| Anti-cheat | None | Tab-switch detection + paste burst logging |
| Company presets | None | 8 built-in company presets (Google, Amazon, Meta…) |

---

## 🏛️ Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                       Browser (Next.js)                      │
│  /dashboard  /test/[id]  /report/[id]  /join/[slug]         │
│  ChatSetup → MasteryGraph → CodeEditor → MCQPanel           │
└───────────────────────┬──────────────────────────────────────┘
                        │ HTTP/JSON (Axios)
┌───────────────────────▼──────────────────────────────────────┐
│                    FastAPI Backend                           │
│  /api/auth  /api/chat  /api/tests  /api/sessions            │
│  /api/submissions  /api/reports  /api/events  /api/admin    │
└──────┬────────────────┬──────────────────────────────────────┘
       │                │
┌──────▼──────┐   ┌─────▼──────┐   ┌─────────────────────────┐
│ PostgreSQL  │   │   Redis    │   │  Piston API (v2)        │
│ (SQLAlchemy │   │  Sessions  │   │  Sandboxed execution    │
│  async)     │   │  + Status  │   │  Python/JS/C++/Java     │
└─────────────┘   └────────────┘   └─────────────────────────┘
                                   ┌─────────────────────────┐
                                   │  Google Gemini / Groq   │
                                   │  Test gen + Grading     │
                                   └─────────────────────────┘
```

### Backend Services

| Service | File | Responsibility |
|---|---|---|
| `judge.py` | `services/judge.py` | Runs code against test cases via Piston v2 |
| `llm.py` | `services/llm.py` | Generates problems, MCQs, feedback via Gemini |
| `test_gen.py` | `services/test_gen.py` | Orchestrates end-to-end test generation + self-validation loop |
| `grading.py` | `services/grading.py` | Async grading + mastery score updates |
| `boilerplate.py` | `services/boilerplate.py` | Generates language-specific code stubs |
| `oa_patterns.py` | `services/oa_patterns.py` | Company OA pattern library |

### Frontend Components

| Component | Purpose |
|---|---|
| `ChatSetup.tsx` | Conversational test builder with company presets strip |
| `CodeEditor.tsx` | Monaco-based IDE with custom run + test result panel |
| `MCQPanel.tsx` | Timer-aware MCQ interface with option state persistence |
| `MasteryGraph.tsx` | Force-directed topic mastery graph with canonical nodes |
| `CountdownTimer.tsx` | Session countdown with auto-submit warning |
| `LayoutWrapper.tsx` | Sidebar navigation + theme toggle |

---

## 🗂️ Project Structure

```
PrepPilot/
├── backend/
│   ├── app/
│   │   ├── core/           # Config, DB engine, Redis client, security
│   │   ├── models/         # SQLAlchemy models (User, Test, Session, MCQ, Problem, …)
│   │   ├── routers/        # FastAPI route handlers (auth, chat, tests, sessions, …)
│   │   ├── services/       # Business logic (judge, llm, test_gen, grading, …)
│   │   └── main.py         # FastAPI app entry point with CORS + router registration
│   ├── alembic/            # Database migration history
│   ├── Dockerfile
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── app/            # Next.js App Router pages
│   │   │   ├── dashboard/  # Main dashboard with mastery graph + history
│   │   │   ├── test/       # Live test interface (MCQ + Coding)
│   │   │   ├── report/     # Detailed post-session AI feedback report
│   │   │   ├── join/       # Public cohort event join page
│   │   │   ├── schedule/   # Schedule a new cohort event
│   │   │   ├── library/    # Question library (saved problems)
│   │   │   └── settings/   # User profile & preferences
│   │   ├── components/     # Reusable UI components
│   │   └── lib/            # API client, auth context, company presets
│   ├── Dockerfile
│   └── next.config.ts
│
├── docker-compose.yml      # Local development + self-hosted production
└── .env.example            # Template for required environment variables
```

---

## 🚀 Running Locally

### Prerequisites

- **Node.js** 20+
- **Python** 3.12+
- **PostgreSQL** 16+
- **Redis** 7+
- A **Google Gemini API key** (get one free at [aistudio.google.com](https://aistudio.google.com/))

### Option A — Docker Compose (Recommended)

This is the fastest way to get the full stack running with one command.

```bash
# 1. Clone the repository
git clone https://github.com/oki-dokii/PrepPilot.git
cd PrepPilot

# 2. Create your environment file from the template
cp backend/.env.example .env

# 3. Edit .env and add your Gemini API key at minimum
nano .env  # or open in any editor

# 4. Start everything
docker compose up --build
```

The app will be available at:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Docs (Swagger)**: http://localhost:8000/docs

### Option B — Manual Setup

**Backend:**
```bash
cd backend

# Create a virtual environment
python -m venv .venv
source .venv/bin/activate   # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set up environment variables
cp .env.example .env
# Edit .env with your values

# Run database migrations
alembic upgrade head

# Start the dev server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

**Frontend:**
```bash
cd frontend

# Install dependencies
npm install

# Create local env (points to local backend)
echo 'NEXT_PUBLIC_API_URL=http://localhost:8000' > .env.local

# Start the dev server
npm run dev
```

---

## ⚙️ Environment Variables

### Backend (`.env`)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | Async PostgreSQL URL: `postgresql+asyncpg://user:pass@host:5432/db` |
| `DATABASE_SYNC_URL` | ✅ | Sync PostgreSQL URL (for Alembic): `postgresql://user:pass@host:5432/db` |
| `REDIS_URL` | ✅ | Redis connection: `redis://localhost:6379/0` |
| `SECRET_KEY` | ✅ | JWT signing secret. Generate with: `openssl rand -hex 32` |
| `GEMINI_API_KEY` | ✅ | Google Gemini API key for AI generation and grading |
| `GROQ_API_KEY` | ⬜ | Optional fallback LLM provider |
| `CORS_ORIGINS` | ✅ (prod) | JSON array of allowed origins: `["https://yourdomain.com"]` |
| `DEBUG` | ⬜ | Set to `false` in production |
| `PISTON_URL` | ⬜ | Code execution engine URL. Defaults to `https://emkc.org/api/v2/piston/execute` |

### Frontend (`.env.local`)

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | ✅ | URL of your FastAPI backend. Must be set **at build time** for production. |

> **Important:** `NEXT_PUBLIC_API_URL` is baked into the Next.js bundle at build time. It cannot be injected at runtime. Always set it before running `docker build` or `next build`.

---

## ☁️ Deploying to AWS (Free Tier / With Credits)

### Infrastructure
- **EC2** `t2.micro` or `t3.small` — runs the full Docker Compose stack
- **RDS PostgreSQL** `db.t3.micro` — managed database with automated backups
- **Security Groups** — EC2 SG allows port 80, 443, 22; RDS SG allows port 5432 from EC2 SG only

### Step-by-Step

**1. On your EC2 instance, run the setup script:**

```bash
# Add swap to prevent OOM crashes on small instances
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Install Docker
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2 git nano
sudo systemctl enable --now docker

# Clone the project
git clone https://github.com/oki-dokii/PrepPilot.git
cd PrepPilot
```

**2. Configure your environment:**

```bash
nano .env  # Fill in your RDS endpoint, API keys, and EC2 public IP in CORS_ORIGINS
```

**3. Update the EC2 Public IP in docker-compose.yml** (replace the placeholder):
```bash
sed -i 's/16.171.25.238/YOUR_EC2_PUBLIC_IP/g' docker-compose.yml
```

**4. Build and run:**
```bash
sudo docker compose up -d --build
```

Your app will be live at `http://YOUR_EC2_PUBLIC_IP:3000`.

---

## 🔌 API Reference

The full interactive API documentation is available at `/docs` (Swagger UI) when the backend is running.

### Key Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Create a new user account |
| `POST` | `/api/auth/login` | Log in and receive a JWT token |
| `GET` | `/api/auth/me` | Get current user profile |
| `GET` | `/api/auth/mastery` | Get topic mastery scores |
| `POST` | `/api/chat/message` | Send a message to the test setup AI agent |
| `POST` | `/api/tests/generate` | Generate a new test from a blueprint |
| `POST` | `/api/sessions` | Start a new test session |
| `GET` | `/api/sessions/{id}` | Fetch a session (questions + current answers) |
| `POST` | `/api/sessions/{id}/submit` | Submit and trigger background grading |
| `POST` | `/api/submissions/code` | Run or judge a code submission |
| `POST` | `/api/submissions/mcq` | Submit an MCQ answer |
| `GET` | `/api/reports/{session_id}` | Get the AI-generated feedback report |
| `POST` | `/api/events` | Create a scheduled cohort event |
| `POST` | `/api/events/{slug}/join` | Join a public cohort event |

---

## 🛡️ Security

- All endpoints (except `/api/auth/*`) require a valid JWT Bearer token.
- JWTs expire after 7 days and are signed with `SECRET_KEY`.
- Code execution is sandboxed via the Piston API — no user code runs on the application server.
- Anti-cheat telemetry (tab switches, paste bursts) is logged per session.
- Passwords are hashed with `bcrypt` via `passlib`.
- Blueprint items are validated server-side (type, difficulty, topic length) before being passed to the LLM.

---

## 🧑‍💻 Tech Stack

**Frontend**
- [Next.js 16](https://nextjs.org/) (App Router, React Server Components)
- [React 19](https://react.dev/)
- [Tailwind CSS v4](https://tailwindcss.com/)
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) — VS Code in the browser
- [Recharts](https://recharts.org/) — Mastery trend charts
- [Axios](https://axios-http.com/) — HTTP client with interceptors

**Backend**
- [FastAPI](https://fastapi.tiangolo.com/) — Async Python web framework
- [SQLAlchemy 2.0](https://docs.sqlalchemy.org/) (async) — ORM
- [Alembic](https://alembic.sqlalchemy.org/) — Database migrations
- [Pydantic v2](https://docs.pydantic.dev/) — Data validation
- [python-jose](https://github.com/mpdavis/python-jose) — JWT handling
- [passlib](https://passlib.readthedocs.io/) — Password hashing
- [Google Generative AI SDK](https://ai.google.dev/) — Gemini integration

**Infrastructure**
- [PostgreSQL 16](https://www.postgresql.org/) — Primary database
- [Redis 7](https://redis.io/) — Session cache + grading status
- [Piston API v2](https://github.com/engineer-man/piston) — Sandboxed code execution
- [Docker + Docker Compose](https://docs.docker.com/) — Containerized deployment

---

## 📄 License

MIT © 2026 oki-dokii
